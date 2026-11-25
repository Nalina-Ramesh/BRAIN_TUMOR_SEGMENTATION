"""End-to-end segmentation job: read -> preprocess -> infer -> postprocess -> visualize -> save."""
import logging
import time
import traceback
from pathlib import Path

import nibabel as nib
import numpy as np

import config
from app import storage
from app.inference.engine import EngineError
from app.postprocessing.post import center_slices, compute_stats, embed, regions_to_label
from app.preprocessing.intensity import display_volume, preprocess_volume, quantize_dequantize
from app.preprocessing.nifti import ScanError, load_scan, restore_mask
from app.visualization.render import PLANES, montage, plane_count

log = logging.getLogger("neuroseg.pipeline")


def run_job(engine, rid, paths, use_tta, on_done=None):
    t0 = time.perf_counter()
    step = lambda **kw: storage.update_meta(rid, **kw)          # noqa: E731
    try:
        step(status="processing", stage="reading", progress=0.05)
        order = [k for k, _ in config.MODALITIES]
        scans = {}
        for k in order:
            try:
                scans[k] = load_scan(paths[k])
            except ScanError as e:
                label = dict(config.MODALITIES)[k]
                raise ScanError(f"{label}: {e}")
        ref = scans[order[0]]
        for k in order[1:]:
            if scans[k].data.shape != ref.data.shape:
                raise ScanError("The four scans have different sizes: " + ", ".join(
                    f"{dict(config.MODALITIES)[o]} {scans[o].data.shape}" for o in order) +
                    ". They must be registered to each other and share one voxel grid.")

        warnings = []
        if any(not 0.75 <= z <= 1.3 for z in ref.zooms):
            warnings.append("Voxel size is %.2f x %.2f x %.2f mm. The model was trained at about 1 mm; "
                            "resample first for reliable results." % ref.zooms)
        vols = [scans[k].data for k in order]
        if np.mean(np.any([v != 0 for v in vols], axis=0)) > 0.45:
            warnings.append("The scans do not look skull-stripped. The model expects the skull and scalp "
                            "removed (for example with HD-BET); results are unreliable otherwise.")
        if any(not np.allclose(scans[k].affine, ref.affine, atol=0.05) for k in order[1:]):
            warnings.append("The four scans have different spatial headers. Make sure they are registered "
                            "to each other.")

        step(stage="preprocessing", progress=0.15)
        x, bbox, brain = preprocess_volume(vols)
        x = quantize_dequantize(x, brain)

        step(stage="inference", progress=0.2)
        last = [0.0]

        def progress(f):
            if f - last[0] >= 0.05 or f >= 1.0:
                last[0] = f
                step(progress=round(0.2 + 0.65 * f, 3))

        regions = engine.predict(x, tta=use_tta, on_progress=progress)

        step(stage="postprocessing", progress=0.88)
        lab = embed(regions_to_label(regions), bbox, ref.data.shape)
        brain_voxels = int(np.any([v != 0 for v in vols], axis=0).sum())
        stats = compute_stats(lab, ref.zooms, brain_voxels)
        mask_img = restore_mask(lab, ref)

        step(stage="visualization", progress=0.93)
        disp = np.stack([display_volume(v) for v in vols])
        d = storage.result_dir(rid)
        np.save(d / "disp.npy", disp)
        np.save(d / "label.npy", lab)
        nib.save(mask_img, str(d / "mask.nii.gz"))
        centers = center_slices(lab)
        montage(disp[0], lab, ref.zooms, centers).save(d / "overlay.png")

        elapsed = round(time.perf_counter() - t0, 2)
        step(status="completed", stage="completed", progress=1.0, processing_time_s=elapsed,
             tumor_voxels=stats["tumor_voxels"], volume_ml=stats["volume_ml"], warnings=warnings, stats=stats,
             dims={"original_shape": list(ref.orig_shape), "model_shape": list(ref.data.shape),
                   "voxel_spacing_mm": [round(z, 4) for z in ref.zooms],
                   "original_voxel_spacing_mm": [round(z, 4) for z in ref.orig_zooms],
                   "original_orientation": "".join(ref.orig_axcodes), "model_orientation": "".join(config.MODEL_ORIENTATION)},
             views={"shape": list(ref.data.shape), "zooms": [round(z, 4) for z in ref.zooms],
                    "default_slices": centers, "plane_counts": {p: plane_count(ref.data.shape, p) for p in PLANES},
                    "modalities": [n for _, n in config.MODALITIES]})
        if on_done:
            on_done()
    except (ScanError, EngineError, ValueError) as e:
        log.warning("Job %s failed: %s", rid, e)
        _fail(rid, str(e))
    except Exception:                                           # noqa: BLE001
        log.error("Job %s crashed:\n%s", rid, traceback.format_exc())
        _fail(rid, "Segmentation failed unexpectedly. Check the backend log for details.")
    finally:
        for p in paths.values():
            Path(p).unlink(missing_ok=True)


def _fail(rid, message):
    try:
        storage.update_meta(rid, status="failed", stage="failed", error=message)
    except storage.NotFound:
        pass
