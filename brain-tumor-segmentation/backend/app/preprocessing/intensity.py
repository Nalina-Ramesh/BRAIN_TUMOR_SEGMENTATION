"""Intensity preprocessing identical to training (numpy only)."""
import numpy as np
import config


def preprocess_volume(vols):
    """vols: list of 4 float arrays (X,Y,Z) -> normalized (4,x,y,z), bbox slices, brain mask (cropped)."""
    brain = np.any([v != 0 for v in vols], axis=0)
    if not brain.any():
        raise ValueError("One of the scans contains no non-zero voxels.")
    idx = np.where(brain)
    bbox = tuple(slice(int(i.min()), int(i.max()) + 1) for i in idx)
    out = []
    for v in vols:
        vals = v[brain]
        lo, hi = np.percentile(vals, [0.5, 99.5])
        v = np.clip(v, lo, hi)
        vals = v[brain]
        v = (v - vals.mean()) / (vals.std() + 1e-8)
        v[~brain] = 0
        out.append(v[bbox])
    return np.stack(out).astype(np.float32), bbox, brain[bbox]


def quantize_dequantize(x, brain):
    """Same 8-bit round trip the training data went through."""
    q = (1 + np.rint((np.clip(x, config.Q_LO, config.Q_HI) - config.Q_LO) / (config.Q_HI - config.Q_LO) * 254)).astype(np.uint8)
    q[:, ~brain] = 0
    out = (q.astype(np.float32) - 1) * ((config.Q_HI - config.Q_LO) / 254) + config.Q_LO
    out[q == 0] = 0
    return out


def display_volume(v):
    """Scale one raw volume to uint8 for viewing (background stays 0)."""
    nz = v[v != 0]
    lo, hi = np.percentile(nz, [1, 99.5]) if nz.size else (0.0, 1.0)
    return (np.clip((v - lo) / max(hi - lo, 1e-6), 0, 1) * 255).astype(np.uint8)
