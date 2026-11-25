"""NIfTI-only validation and loading. nibabel is imported lazily so validation helpers stay light."""
import gzip
import re
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import config

ALLOWED_EXTENSIONS = (".nii.gz", ".nii")
UNSUPPORTED_MESSAGE = "Unsupported file format. Please upload a NIfTI image in .nii or .nii.gz format only."


class ScanError(ValueError):
    """A problem with an uploaded scan that the user can fix."""


def extension_of(filename):
    name = (filename or "").lower()
    for ext in ALLOWED_EXTENSIONS:
        if name.endswith(ext):
            return ext
    return None


def safe_display_name(filename):
    name = Path(filename or "scan").name
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:80] or "scan"


def check_magic(path, ext):
    """Check real file content (not just the name): gzip signature and the NIfTI-1 header."""
    try:
        if ext == ".nii.gz":
            with open(path, "rb") as f:
                if f.read(2) != b"\x1f\x8b":
                    raise ScanError("The file is not a valid gzip archive, so it is not a real .nii.gz file.")
            with gzip.open(path, "rb") as g:
                header = g.read(352)
        else:
            with open(path, "rb") as f:
                header = f.read(352)
    except ScanError:
        raise
    except Exception:
        raise ScanError("The file is corrupted and cannot be decompressed.")
    if len(header) < 348:
        raise ScanError("The file is too small to be a NIfTI image.")
    ok_size = struct.unpack("<i", header[:4])[0] == 348 or struct.unpack(">i", header[:4])[0] == 348
    if not ok_size or header[344:348] not in (b"n+1\x00", b"ni1\x00"):
        raise ScanError("The file content is not a NIfTI-1 image.")


@dataclass
class Scan:
    data: np.ndarray            # float32, model orientation (LPS array order)
    affine: np.ndarray          # affine of `data`
    zooms: tuple                # voxel size along the three array axes (mm)
    orig_affine: np.ndarray
    orig_shape: tuple
    orig_zooms: tuple
    orig_axcodes: tuple
    to_original: object         # orientation transform back to the original array order


def _zooms_from_affine(affine):
    return tuple(float(v) for v in np.sqrt((affine[:3, :3] ** 2).sum(axis=0)))


def load_scan(path):
    import nibabel as nib
    from nibabel import orientations as ori
    try:
        img = nib.load(str(path))
        shape = tuple(img.shape)
        if len(shape) > 3 and all(s == 1 for s in shape[3:]):
            img = nib.Nifti1Image(np.asarray(img.dataobj).reshape(shape[:3]), img.affine)
        if len(img.shape) != 3:
            raise ScanError(f"Expected a 3D volume but the file has shape {shape}.")
        data = np.asarray(img.dataobj)
    except ScanError:
        raise
    except Exception as e:
        raise ScanError(f"The file could not be read as a NIfTI image ({type(e).__name__}).")

    if not np.isfinite(img.affine).all() or abs(np.linalg.det(img.affine[:3, :3])) < 1e-9:
        raise ScanError("The image header has an invalid orientation matrix (affine).")
    if any(s < config.MIN_DIM or s > config.MAX_DIM for s in img.shape):
        raise ScanError(f"Unsupported volume size {tuple(img.shape)}. Each dimension must be between "
                        f"{config.MIN_DIM} and {config.MAX_DIM} voxels.")

    orig_affine = img.affine.copy()
    cur = ori.io_orientation(orig_affine)
    target = ori.axcodes2ornt(config.MODEL_ORIENTATION)
    reoriented = nib.Nifti1Image(data.astype(np.float32), orig_affine).as_reoriented(ori.ornt_transform(cur, target))
    back = ori.ornt_transform(ori.io_orientation(reoriented.affine), cur)
    arr = np.nan_to_num(np.asarray(reoriented.dataobj, dtype=np.float32))
    return Scan(arr, reoriented.affine, _zooms_from_affine(reoriented.affine), orig_affine,
                tuple(img.shape), _zooms_from_affine(orig_affine), tuple(nib.aff2axcodes(orig_affine)), back)


def load_label_mask(path):
    """Load a discrete NIfTI label map and reorient it without interpolating labels."""
    import nibabel as nib
    from nibabel import orientations as ori
    try:
        img = nib.load(str(path))
        shape = tuple(img.shape)
        if len(shape) > 3 and all(s == 1 for s in shape[3:]):
            img = nib.Nifti1Image(np.asarray(img.dataobj).reshape(shape[:3]), img.affine)
        if len(img.shape) != 3:
            raise ScanError(f"Expected a 3D mask but the file has shape {shape}.")
        if not np.isfinite(img.affine).all() or abs(np.linalg.det(img.affine[:3, :3])) < 1e-9:
            raise ScanError("The mask header has an invalid orientation matrix (affine).")
        if any(s < config.MIN_DIM or s > config.MAX_DIM for s in img.shape):
            raise ScanError(f"Unsupported mask size {tuple(img.shape)}. Each dimension must be between "
                            f"{config.MIN_DIM} and {config.MAX_DIM} voxels.")
        data = np.asarray(img.dataobj)
        if not np.isfinite(data).all() or not np.equal(data, np.floor(data)).all():
            raise ScanError("The segmentation mask must contain finite integer labels.")
        if data.min() < 0 or data.max() > 4:
            raise ScanError("Mask labels must be background 0 and tumor labels 1, 2, 3, or 4.")

        cur = ori.io_orientation(img.affine)
        target = ori.axcodes2ornt(config.MODEL_ORIENTATION)
        reoriented = nib.Nifti1Image(data.astype(np.uint8), img.affine).as_reoriented(
            ori.ornt_transform(cur, target))
        mask = np.asarray(reoriented.dataobj, dtype=np.uint8)
        mask[mask == 4] = 3
        return mask, reoriented.affine
    except ScanError:
        raise
    except Exception as e:
        raise ScanError(f"The mask could not be read as a NIfTI image ({type(e).__name__}).")


def restore_mask(label_lps, scan):
    """Map a label volume from model orientation back to the original scan grid and affine."""
    import nibabel as nib
    img = nib.Nifti1Image(label_lps.astype(np.uint8), scan.affine).as_reoriented(scan.to_original)
    arr = np.asarray(img.dataobj).astype(np.uint8)
    if arr.shape != scan.orig_shape:
        raise ScanError("Internal error: restored mask does not match the original scan size.")
    out = nib.Nifti1Image(arr, scan.orig_affine)
    out.set_data_dtype(np.uint8)
    return out
