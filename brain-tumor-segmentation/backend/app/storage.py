"""On-disk storage of segmentation sessions: results/<id>/{meta.json, disp.npy, label.npy, mask.nii.gz, overlay.png}."""
import json
import os
import re
import shutil
import threading
from functools import lru_cache

import numpy as np

import config

ID_RE = re.compile(r"^[0-9a-f]{32}$")
_lock = threading.RLock()


class NotFound(KeyError):
    pass


def result_dir(rid):
    if not ID_RE.match(rid or ""):
        raise NotFound(rid)
    return config.RESULTS_DIR / rid


def write_meta(rid, meta):
    d = result_dir(rid)
    with _lock:
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / "meta.json.tmp"
        tmp.write_text(json.dumps(meta, indent=2))
        os.replace(tmp, d / "meta.json")


def read_meta(rid):
    p = result_dir(rid) / "meta.json"
    with _lock:
        if not p.exists():
            raise NotFound(rid)
        return json.loads(p.read_text())


def update_meta(rid, **changes):
    with _lock:
        meta = read_meta(rid)
        meta.update(changes)
        write_meta(rid, meta)
        return meta


def list_meta():
    items = []
    if config.RESULTS_DIR.exists():
        for d in config.RESULTS_DIR.iterdir():
            if d.is_dir() and ID_RE.match(d.name) and (d / "meta.json").exists():
                try:
                    items.append(json.loads((d / "meta.json").read_text()))
                except (OSError, ValueError):
                    continue
    return sorted(items, key=lambda m: m.get("created_at", ""), reverse=True)


def fail_interrupted():
    """Jobs left running by a previous server process can never finish."""
    for m in list_meta():
        if m.get("status") in ("queued", "processing"):
            update_meta(m["id"], status="failed", stage="failed", error="The server restarted before this job finished.")


@lru_cache(maxsize=4)
def load_volumes(rid):
    d = result_dir(rid)
    return np.load(d / "disp.npy", mmap_mode="r"), np.load(d / "label.npy", mmap_mode="r")


def delete(rid):
    d = result_dir(rid)
    if not d.exists():
        raise NotFound(rid)
    load_volumes.cache_clear()
    shutil.rmtree(d)
