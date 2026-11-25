"""Turn region masks into a BraTS label map and compute statistics (numpy only)."""
import numpy as np


def regions_to_label(regions):
    """regions: bool (3,x,y,z) = WT, TC, ET  ->  uint8 labels 0 background, 1 necrotic core, 2 edema, 3 enhancing."""
    wt, tc, et = regions
    lab = np.zeros(wt.shape, np.uint8)
    lab[wt] = 2
    lab[tc] = 1
    lab[et] = 3
    return lab


def embed(label_small, bbox, full_shape):
    full = np.zeros(full_shape, np.uint8)
    full[bbox] = label_small
    return full


def compute_stats(lab, zooms, brain_voxels):
    valid = all(np.isfinite(z) and z > 0 for z in zooms)
    voxel_mm3 = float(np.prod(zooms)) if valid else None

    def region(mask):
        n = int(mask.sum())
        return {"voxels": n, "volume_ml": round(n * voxel_mm3 / 1000.0, 3) if voxel_mm3 else None}

    wt = lab > 0
    total = int(lab.size)
    n_wt = int(wt.sum())
    return {
        "slices_processed": int(lab.shape[2]),
        "tumor_voxels": n_wt,
        "tumor_percent_of_volume": round(100.0 * n_wt / total, 4),
        "tumor_percent_of_brain": round(100.0 * n_wt / brain_voxels, 3) if brain_voxels else None,
        "volume_ml": round(n_wt * voxel_mm3 / 1000.0, 3) if voxel_mm3 else None,
        "regions": {
            "whole_tumor": region(wt),
            "tumor_core": region((lab == 1) | (lab == 3)),
            "enhancing_tumor": region(lab == 3),
            "necrotic_core": region(lab == 1),
            "edema": region(lab == 2),
        },
    }


def center_slices(lab):
    """Axial / coronal / sagittal index with the largest tumor area (volume center if no tumor)."""
    X, Y, Z = lab.shape
    if not lab.any():
        return {"axial": Z // 2, "coronal": Y // 2, "sagittal": X // 2}
    m = lab > 0
    return {"axial": int(np.argmax(m.sum((0, 1)))), "coronal": int(np.argmax(m.sum((0, 2)))),
            "sagittal": int(np.argmax(m.sum((1, 2))))}
