import io
import json
import uuid
import zipfile  # noqa: F401  (kept for future bulk export)
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import List, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response

import config
from app import storage
from app.inference.engine import engine
from app.inference.pipeline import run_job
from app.preprocessing.nifti import (UNSUPPORTED_MESSAGE, ScanError, check_magic, extension_of,
                                     safe_display_name)
from app.schemas.schemas import (Health, JobAccepted, ModelInfo, ResultDetail, ResultSummary, SessionInfo)
from app.visualization import render

router = APIRouter(prefix="/api")
executor = ThreadPoolExecutor(max_workers=1)        # one segmentation at a time (GPU memory)
session = {"processed": 0}
MAX_BYTES = config.MAX_FILE_MB * 1024 * 1024
ROLE_LABELS = dict(config.MODALITIES)


@router.get("/health", response_model=Health)
def health():
    return Health(status="ok", model_loaded=engine.loaded, device=str(engine.device))


@router.get("/model-info", response_model=ModelInfo)
def model_info():
    return ModelInfo(
        loaded=engine.loaded, error=engine.error, device=str(engine.device),
        architecture="3D U-Net (volumetric, 5 levels, InstanceNorm, skip connections)",
        input_channels=[n for _, n in config.MODALITIES], output_regions=["Whole tumor", "Tumor core", "Enhancing tumor"],
        patch_size=list(config.PATCH_SIZE), channels=engine.info.get("channels"), parameters=engine.info.get("parameters"),
        checkpoint_file=engine.info.get("checkpoint_file"), checkpoint_epoch=engine.info.get("epoch"),
        recorded_val_dice=engine.info.get("recorded_val_dice"))


@router.get("/training-info")
def training_info():
    try:
        return json.loads(config.TRAINING_INFO_PATH.read_text())
    except (OSError, ValueError):
        raise HTTPException(500, "training_info.json is missing or invalid.")


@router.get("/session", response_model=SessionInfo)
def session_info():
    return SessionInfo(processed_this_session=session["processed"], stored_results=len(storage.list_meta()))


async def _save_upload(up: UploadFile, role: str, dest_dir):
    label = ROLE_LABELS[role]
    ext = extension_of(up.filename)
    if ext is None:
        raise HTTPException(400, f"{label}: {UNSUPPORTED_MESSAGE}")
    dest = dest_dir / f"{uuid.uuid4().hex}{ext}"                  # never use the client's file name on disk
    size = 0
    try:
        with open(dest, "wb") as f:
            while chunk := await up.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, f"{label}: file is larger than the {config.MAX_FILE_MB} MB limit.")
                f.write(chunk)
        if size == 0:
            raise HTTPException(400, f"{label}: the uploaded file is empty.")
        try:
            check_magic(dest, ext)
        except ScanError as e:
            raise HTTPException(400, f"{label}: {e}")
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return dest


@router.post("/segment", response_model=JobAccepted, status_code=202)
async def segment(flair: UploadFile = File(...), t1: UploadFile = File(...), t1c: UploadFile = File(...),
                  t2: UploadFile = File(...), tta: bool = Form(False)):
    if not engine.loaded:
        raise HTTPException(503, "The model is not loaded: " + (engine.error or "unknown error"))
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved = {}
    try:
        for role, up in (("flair", flair), ("t1", t1), ("t1c", t1c), ("t2", t2)):
            saved[role] = await _save_upload(up, role, config.UPLOAD_DIR)
    except Exception:
        for p in saved.values():
            p.unlink(missing_ok=True)
        raise
    rid = uuid.uuid4().hex
    storage.write_meta(rid, {
        "id": rid, "status": "queued", "stage": "queued", "progress": 0.0, "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "warnings": [],
        "input_names": {r: safe_display_name(u.filename) for r, u in
                        (("flair", flair), ("t1", t1), ("t1c", t1c), ("t2", t2))},
        "used_tta": tta, "device": str(engine.device)})

    def done():
        session["processed"] += 1

    executor.submit(run_job, engine, rid, saved, tta, done)
    return JobAccepted(id=rid, status="queued")


def _meta_or_404(rid):
    try:
        return storage.read_meta(rid)
    except storage.NotFound:
        raise HTTPException(404, "Result not found.")


@router.get("/results", response_model=List[ResultSummary])
def list_results():
    return storage.list_meta()


@router.get("/results/{rid}", response_model=ResultDetail)
def get_result(rid: str):
    return _meta_or_404(rid)


@router.delete("/results/{rid}", status_code=204)
def delete_result(rid: str):
    try:
        storage.delete(rid)
    except storage.NotFound:
        raise HTTPException(404, "Result not found.")
    return Response(status_code=204)


def _completed(rid):
    meta = _meta_or_404(rid)
    if meta["status"] != "completed":
        raise HTTPException(409, "This segmentation has not finished.")
    return meta


@router.get("/results/{rid}/slice")
def get_slice(rid: str, plane: Literal["axial", "coronal", "sagittal"] = "axial", index: int = Query(0, ge=0),
              view: Literal["original", "mask", "overlay"] = "original", modality: int = Query(0, ge=0, le=3),
              labels: str = "1,2,3", style: Literal["region", "single"] = "region",
              opacity: float = Query(0.5, ge=0, le=1)):
    meta = _completed(rid)
    shape, zooms = meta["views"]["shape"], meta["views"]["zooms"]
    if index >= render.plane_count(shape, plane):
        raise HTTPException(400, "Slice index out of range.")
    try:
        wanted = tuple(sorted({int(v) for v in labels.split(",") if v.strip()} & {1, 2, 3}))
    except ValueError:
        raise HTTPException(400, "labels must be a comma separated list of 1, 2, 3.")
    disp, lab = storage.load_volumes(rid)
    if view == "original":
        img = render.gray_image(disp[modality], plane, index, zooms)
    elif view == "mask":
        img = render.mask_image(lab, plane, index, zooms, wanted, style)
    else:
        img = render.composite(render.gray_image(disp[modality], plane, index, zooms),
                               render.mask_image(lab, plane, index, zooms, wanted, style), opacity)
    return Response(render.to_png(img), media_type="image/png", headers={"Cache-Control": "private, max-age=600"})


@router.get("/results/{rid}/mask")
def download_mask(rid: str):
    _completed(rid)
    return FileResponse(storage.result_dir(rid) / "mask.nii.gz", media_type="application/gzip",
                        filename=f"neuroseg_{rid[:8]}_segmentation.nii.gz")


@router.get("/results/{rid}/overlay")
def download_overlay(rid: str):
    _completed(rid)
    return FileResponse(storage.result_dir(rid) / "overlay.png", media_type="image/png",
                        filename=f"neuroseg_{rid[:8]}_overlay.png")


@router.get("/results/{rid}/summary")
def download_summary(rid: str):
    meta = _completed(rid)
    keep = ("id", "created_at", "input_names", "processing_time_s", "dims", "stats", "warnings", "device", "used_tta")
    body = {k: meta.get(k) for k in keep}
    body["labels"] = {"1": "necrotic core", "2": "edema", "3": "enhancing tumor"}
    body["disclaimer"] = "Research decision-support output. Not a medical diagnosis."
    return JSONResponse(body, headers={"Content-Disposition": f'attachment; filename="neuroseg_{rid[:8]}_summary.json"'})
