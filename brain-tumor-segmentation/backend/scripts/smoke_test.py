"""End-to-end API test. Start the backend first (uvicorn app.main:app), then run:

    python scripts/smoke_test.py                       # synthetic phantom (plumbing check only)
    python scripts/smoke_test.py --case-dir path/     # real scans: <dir> has 4 NIfTI files named *flair*, *t1*, *t1c*, *t2*
                                                       #   (BraTS names -t2f -t1n -t1c -t2w also work)

Every check prints PASS or FAIL. A failed check exits with status 1.
"""
import argparse, glob, gzip, os, shutil, sys, tempfile, time
import numpy as np
import requests
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.visualization.render import comparison_image

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://localhost:8000/api")
parser.add_argument("--case-dir")
parser.add_argument("--tta", action="store_true")
args = parser.parse_args()
failures = []


def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(name)


def make_phantom(tmp):
    import nibabel as nib
    rng = np.random.default_rng(1)
    shape = (130, 150, 110)
    zz, yy, xx = np.meshgrid(*[np.linspace(-1, 1, s) for s in shape[::-1]], indexing="ij")
    brain = (xx ** 2 + yy ** 2 + zz ** 2) < 0.8
    aff = np.array([[-1.5, 0, 0, 0], [0, -1.5, 0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1]])  # anisotropic on purpose
    paths = {}
    for role in ("flair", "t1", "t1c", "t2"):
        vol = (rng.normal(300, 40, shape[::-1]).clip(1) * brain).transpose(2, 1, 0).astype(np.float32)
        p = os.path.join(tmp, f"{role}.nii.gz"); nib.save(nib.Nifti1Image(vol, aff), p); paths[role] = p
    return paths


def find_case(d):
    pats = {"flair": ["*flair*", "*t2f*"], "t1": ["*t1n*", "*_t1.nii*", "*-t1.nii*"], "t1c": ["*t1c*", "*t1ce*"], "t2": ["*t2w*", "*_t2.nii*", "*-t2.nii*"]}
    out = {}
    for role, ps in pats.items():
        for pat in ps:
            hits = [h for h in glob.glob(os.path.join(d, pat)) if h.endswith((".nii", ".nii.gz"))]
            if hits: out[role] = hits[0]; break
    return out


r = requests.get(f"{args.url}/health", timeout=10); check("health endpoint", r.ok and r.json()["model_loaded"], r.text)
r = requests.get(f"{args.url}/model-info", timeout=10); check("model-info reports loaded checkpoint", r.ok and r.json()["loaded"], str(r.json().get("error")))
if failures: sys.exit("Backend or checkpoint is not ready - fix this first.")

# The overlap and both mismatch directions must be visible in the rendered pixels.
probe_pred = np.zeros((32, 32, 32), dtype=np.uint8)
probe_ref = np.zeros_like(probe_pred)
probe_pred[8:16, 8:16, 12] = 1
probe_ref[12:20, 8:16, 12] = 1
probe_png = np.asarray(comparison_image(np.zeros_like(probe_pred), probe_pred, probe_ref,
                                        "axial", 12, (1, 1, 1)))
probe_colors = np.unique(probe_png.reshape(-1, 4), axis=0)
expected_colors = ([255, 225, 0, 255], [255, 0, 220, 255], [0, 225, 255, 255])
check("comparison pixels show overlap and both mismatch directions",
      all(np.any(np.all(probe_colors == color, axis=1)) for color in expected_colors))
transparent_probe = np.asarray(comparison_image(np.zeros_like(probe_pred), probe_pred, probe_ref,
                                                 "axial", 12, (1, 1, 1), "transparent"))
transparent_colors = np.unique(transparent_probe.reshape(-1, 4), axis=0)
mask_colors = ([150, 26, 88, 255], [0, 127, 150, 255], [150, 79, 149, 255])
check("transparent comparison blends pink and cyan masks over MRI without yellow",
      all(np.any(np.all(transparent_colors == color, axis=1)) for color in mask_colors)
      and not np.any(np.all(transparent_colors[:, :3] == [255, 225, 0], axis=1)))

tmp = tempfile.mkdtemp()
paths = find_case(args.case_dir) if args.case_dir else make_phantom(tmp)
check("found 4 input scans", len(paths) == 4, str(paths))

# --- format rejection (backend must validate by itself)
def post(files, **kw):
    handles = {k: open(v, "rb") if isinstance(v, str) else v for k, v in files.items()}
    try: return requests.post(f"{args.url}/segment", files=handles, data={"tta": str(args.tta).lower()}, timeout=120)
    finally:
        for h in handles.values():
            if hasattr(h, "close"): h.close()

png = ("scan.png", b"\x89PNG\r\n\x1a\n" + b"0" * 500, "image/png")
bad = {k: ("a.nii", b"not a nifti file " * 40) for k in paths}
r = post({**{k: open(v, "rb") for k, v in paths.items()}, "flair": png}); check("rejects .png upload", r.status_code == 400 and "Unsupported file format" in r.text, r.text[:120])
r = post({**{k: open(v, "rb") for k, v in paths.items()}, "t2": ("a.dcm", b"DICM" * 100)}); check("rejects .dcm upload", r.status_code == 400, r.text[:120])
r = post(bad); check("rejects fake .nii (wrong content)", r.status_code == 400, r.text[:120])
r = post({**{k: open(v, "rb") for k, v in paths.items()}, "t1": ("e.nii", b"")}); check("rejects empty file", r.status_code == 400, r.text[:120])
bad_gz = ("c.nii.gz", gzip.compress(b"x" * 600)[:30])
r = post({**{k: open(v, "rb") for k, v in paths.items()}, "t1c": bad_gz}); check("rejects corrupted .nii.gz", r.status_code == 400, r.text[:120])

# --- real segmentation
t0 = time.time()
r = post({k: open(v, "rb") for k, v in paths.items()}); check("segment accepted (202)", r.status_code == 202, r.text[:120])
rid = r.json()["id"]; stages = []
while True:
    m = requests.get(f"{args.url}/results/{rid}", timeout=30).json()
    if not stages or stages[-1] != m["stage"]: stages.append(m["stage"])
    if m["status"] in ("completed", "failed"): break
    time.sleep(1.5)
print("      stages seen:", " -> ".join(stages), f"| {time.time() - t0:.1f}s total")
check("segmentation completed", m["status"] == "completed", str(m.get("error")))
if m["status"] == "completed":
    st = m["stats"]; print("      stats:", {k: st[k] for k in ("tumor_voxels", "volume_ml", "tumor_percent_of_brain")}, "| warnings:", m["warnings"])
    import nibabel as nib
    mask_path = os.path.join(tmp, "mask.nii.gz")
    r = requests.get(f"{args.url}/results/{rid}/mask", timeout=60); open(mask_path, "wb").write(r.content)
    mk, src = nib.load(mask_path), nib.load(paths["flair"])
    check("mask is a NIfTI with the ORIGINAL shape", mk.shape == src.shape, f"{mk.shape} vs {src.shape}")
    check("mask keeps the ORIGINAL affine", np.allclose(mk.affine, src.affine, atol=1e-3))
    check("mask only has labels 0-3", set(np.unique(np.asarray(mk.dataobj))) <= {0, 1, 2, 3})
    check("mask voxel count equals reported tumor voxels", int((np.asarray(mk.dataobj) > 0).sum()) == st["tumor_voxels"])
    reference_path = os.path.join(tmp, "reference.nii.gz")
    reference = np.asarray(mk.dataobj).astype(np.uint8)
    reference[reference == 3] = 4           # BraTS uses label 4 for enhancing tumor
    nib.save(nib.Nifti1Image(reference, mk.affine), reference_path)
    with open(reference_path, "rb") as f:
        r = requests.post(f"{args.url}/results/{rid}/compare", files={"mask": f}, timeout=60)
    comparison = r.json() if r.ok else {}
    check("reference mask comparison accepts BraTS labels", r.ok and comparison.get("metrics", {}).get("dice") == 1.0, r.text[:120])
    saved_comparison = requests.get(f"{args.url}/results/{rid}", timeout=30).json().get("comparison", {})
    check("comparison persists on the result", saved_comparison.get("metrics", {}).get("dice") == 1.0)
    shifted_affine = mk.affine.copy()
    shifted_affine[0, 3] += 5
    shifted_path = os.path.join(tmp, "misaligned.nii.gz")
    nib.save(nib.Nifti1Image(reference, shifted_affine), shifted_path)
    with open(shifted_path, "rb") as f:
        r = requests.post(f"{args.url}/results/{rid}/compare", files={"mask": f}, timeout=60)
    check("rejects a reference mask on a different voxel grid", r.status_code == 400, r.text[:120])
    v = m["views"]
    for plane in ("axial", "coronal", "sagittal"):
        for view in ("original", "mask", "overlay"):
            r = requests.get(f"{args.url}/results/{rid}/slice", params={"plane": plane, "index": v["default_slices"][plane], "view": view}, timeout=30)
            check(f"slice {plane}/{view} returns PNG", r.ok and r.content[:4] == b"\x89PNG")
    r = requests.get(f"{args.url}/results/{rid}/slice", params={"plane": "axial", "index": v["default_slices"]["axial"], "view": "comparison"}, timeout=30)
    check("comparison slice returns PNG", r.ok and r.content[:4] == b"\x89PNG")
    for mode in ("all", "transparent", "predicted", "ground_truth", "overlap", "missed", "extra"):
        r = requests.get(f"{args.url}/results/{rid}/slice", params={
            "plane": "axial", "index": v["default_slices"]["axial"], "view": "comparison",
            "comparison_mode": mode}, timeout=30)
        check(f"comparison mode {mode} returns PNG", r.ok and r.content[:4] == b"\x89PNG")
    r = requests.get(f"{args.url}/results/{rid}/slice", params={"plane": "axial", "index": 99999}); check("out-of-range slice rejected", r.status_code == 400)
    check("overlay download", requests.get(f"{args.url}/results/{rid}/overlay").content[:4] == b"\x89PNG")
    check("summary download", requests.get(f"{args.url}/results/{rid}/summary").json().get("stats") is not None)
    check("result appears in list", any(x["id"] == rid for x in requests.get(f"{args.url}/results").json()))
    check("delete result", requests.delete(f"{args.url}/results/{rid}").status_code == 204 and requests.get(f"{args.url}/results/{rid}").status_code == 404)
check("path traversal id rejected", requests.get(f"{args.url}/results/..%2F..%2Fetc").status_code in (404, 422))

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} CHECK(S) FAILED: {failures}"))
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if failures else 0)
