# NeuroSeg AI: brain tumor segmentation web app

React + Vite + Tailwind frontend, FastAPI + PyTorch backend. The backend loads **your trained 3D U-Net checkpoint**
and runs real inference on uploaded NIfTI scans. There is no simulated output anywhere in the code.

> Research and decision-support tool. It does not diagnose and does not replace a medical professional.

## 1. Important: the model needs FOUR scans, not one

Your model was trained on four co-registered MRI sequences (FLAIR, T1, T1 with contrast, T2), so a single file
cannot be segmented. The upload page therefore has four slots. Every file must be `.nii` or `.nii.gz`
(NIfTI-1). Anything else (PNG, JPG, DICOM, ZIP, ...) is rejected by the browser *and* by the backend, which also
checks the real file content, not just the name.

Scans must look like the training data: registered to each other, about 1 mm voxels, **skull-stripped**, adult glioma.
The app warns about odd voxel size and about scans that do not look skull-stripped, but it cannot detect every problem.

## 2. Folder layout

```
brain-tumor-segmentation/
├── backend/
│   ├── app/
│   │   ├── main.py                 FastAPI app, CORS, loads the model once at startup
│   │   ├── api/routes.py           REST endpoints
│   │   ├── models/unet3d.py        the exact training architecture
│   │   ├── preprocessing/          nifti.py (validation, load, orientation), intensity.py (same as training)
│   │   ├── inference/              engine.py (checkpoint + sliding window), pipeline.py (the whole job)
│   │   ├── postprocessing/post.py  label map + statistics
│   │   ├── visualization/render.py slice PNGs and the overlay montage
│   │   ├── schemas/schemas.py      response models
│   │   └── storage.py              private on-disk results
│   ├── checkpoints/                <- put best.pth here
│   ├── scripts/smoke_test.py       end-to-end test of the running API
│   ├── training_info.json          text shown on "About the Model"
│   ├── config.py   requirements.txt
├── frontend/                       React app (pages, components, services, hooks, utils)
├── uploads/                        temporary uploads (deleted after every job)
├── results/                        one private folder per segmentation
└── .env.example
```

## 3. Install and run

**Checkpoint.** Copy `best.pth` (the file written by `kaggle_2_train_eval.py`) to `backend/checkpoints/best.pth`,
or set `CHECKPOINT_PATH`. The architecture is loaded from `backend/app/models/unet3d.py`, which is the same code as in
training, and the weights are loaded with `strict=True`, so a mismatch fails loudly instead of silently.

**Backend** (Python 3.10+; a CUDA GPU is strongly recommended, CPU works but is slow):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt                          # install the right torch build for your GPU first if needed
uvicorn app.main:app --reload --port 8000
```
Open http://localhost:8000/docs to see the API. `GET /api/health` should report `"model_loaded": true`.

**Frontend** (Node 18+), in a second terminal:

```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. If the backend is not on port 8000, set `VITE_API_URL` in `frontend/.env`.

## 4. How the pieces talk to each other

1. The browser posts the four files to `POST /api/segment` (multipart). The backend validates name, size and content,
   stores them under random file names, and returns a result id immediately (HTTP 202).
2. A background job reads the volumes, reorients them to the training orientation, applies the training preprocessing,
   runs the sliding-window model, builds the label map, restores it to the **original** grid and affine, saves
   everything under `results/<id>/`, and deletes the temporary uploads.
3. The browser polls `GET /api/results/{id}` for the stage (reading, preprocessing, inference, visualization, completed)
   and then draws slices from `GET /api/results/{id}/slice` (PNG rendered from the real prediction).

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | backend and model status |
| `GET /api/model-info` | architecture and checkpoint details (read from the loaded model) |
| `POST /api/segment` | accept four NIfTI files, start a job |
| `GET /api/results`, `GET /api/results/{id}` | list sessions, one session (status, stats, warnings) |
| `GET /api/results/{id}/mask` | predicted label map, `.nii.gz`, original shape and affine |
| `GET /api/results/{id}/overlay` | overlay PNG (three planes) |
| `GET /api/results/{id}/slice` | one slice as PNG (`plane`, `index`, `view` including `comparison`, `modality`, `labels`, `style`) |
| `POST /api/results/{id}/compare` | compare an uploaded, aligned reference mask with the prediction |
| `GET /api/results/{id}/summary` | JSON summary export |
| `DELETE /api/results/{id}` | delete a result |
| `GET /api/session`, `GET /api/training-info` | dashboard counter, text for "About the Model" |

Mask labels: 1 necrotic core, 2 edema, 3 enhancing tumor. Whole tumor = 1+2+3, tumor core = 1+3.
Volumes are computed from the voxel spacing in the scan header and shown in mL only when the spacing is valid.
On a completed result, upload the matching ground-truth `.nii` or `.nii.gz` mask in the comparison section to see
whole-tumor Dice, IoU, precision, sensitivity, and voxel accuracy, plus a high-contrast overlay. Yellow marks voxels
included in both masks, magenta marks prediction-only voxels, and cyan marks reference-only (missed) voxels. The mask
must share the original MRI's voxel grid; register/resample it first if needed. BraTS label 4 is normalized to label 3.
Use the comparison-layer controls to show all regions, a transparent overlay, prediction, ground truth, overlap,
missed regions, or extra predictions individually. The transparent overlay keeps the MRI visible with translucent
pink prediction and cyan ground-truth masks; overlaps blend the two colors.
Voxel accuracy includes background and can be misleading for small tumors, so prioritize Dice and IoU.

## 5. Testing

With the backend running and the checkpoint in place:

```bash
cd backend
python scripts/smoke_test.py                       # synthetic phantom: checks the plumbing only
python scripts/smoke_test.py --case-dir /path/to/one/case    # real scans: BraTS names (-t2f -t1n -t1c -t2w) work
```
It checks format rejection (png, dcm, fake .nii, empty file, corrupted .nii.gz), a full segmentation, that the exported
mask has the **original shape and affine**, slice rendering for all planes, downloads, listing and deletion.
Use a real case: a phantom will not contain a tumor.

## 6. What was and was not verified while this was written

Verified by running code (no GPU, no PyTorch, no network were available):
- Backend Python files compile; frontend JS/JSX files parse; all local imports and named exports resolve.
- File-format checks: extension rules, real-content (gzip and NIfTI header) checks, corrupted and fake files.
- Intensity preprocessing, quantization round trip, label assembly, volume arithmetic.
- Slice orientation (anterior top / right-on-left for axial, superior on top for coronal and sagittal), aspect ratio,
  mask colors, region toggling, PNG output.

**Not verified; you must run these on your machine:** loading your checkpoint, real model inference and its output quality,
nibabel reading, reorientation and the round trip back to the original affine, the HTTP endpoints, `npm install`/build,
and the user interface in a browser. `scripts/smoke_test.py` automates most of the API part.

## 7. Privacy and safety notes

- Uploads get random names, are size limited (`MAX_FILE_MB`), and are deleted after the job; results live only in `results/`.
- Results are served only through the API and are never exposed as static files. There is no login, so run this on
  your own computer or behind your own authentication; do not expose it to the internet as is.
- Only one segmentation runs at a time (GPU memory). Others wait in a queue.

## 8. Troubleshooting

- *"The model is not loaded"*: check `backend/checkpoints/best.pth` and the message from `/api/model-info`.
- *GPU out of memory*: close other GPU programs, or run on CPU with `CUDA_VISIBLE_DEVICES=-1`.
- *Results look wrong*: check the warnings on the result page (voxel size, skull stripping) and open `mask.nii.gz`
  over your scans in 3D Slicer to compare.


if we need any examples where we need to use the images to test the working we can use 
`https://www.kaggle.com/datasets/darksteeldragon/brats2020-nifti-format-for-deepmedic`

here we will have to download -FLAIR -T1 -T1C -T2 seperately and use it to give as an example 

