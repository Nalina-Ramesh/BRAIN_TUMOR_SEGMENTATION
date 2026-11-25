"""Loads the trained checkpoint once and runs sliding-window inference."""
import logging
import threading

import numpy as np
import torch
import torch.nn.functional as F

import config
from app.models.unet3d import UNet3D

log = logging.getLogger("neuroseg.engine")


class EngineError(RuntimeError):
    """Inference could not be completed (message is safe to show to the user)."""


def _gaussian_map(patch, sigma_scale=1 / 8):
    ws = []
    for p in patch:
        t = torch.arange(p, dtype=torch.float32) - (p - 1) / 2
        ws.append(torch.exp(-0.5 * (t / (p * sigma_scale)) ** 2))
    w = ws[0][:, None, None] * ws[1][None, :, None] * ws[2][None, None, :]
    return (w / w.max()).clamp_min(1e-3)


class Engine:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.error = None
        self.info = {}
        self._lock = threading.Lock()

    @property
    def loaded(self):
        return self.model is not None

    def load(self):
        try:
            path = config.CHECKPOINT_PATH
            if not path.exists():
                raise FileNotFoundError(f"Checkpoint not found at {path}. Place your trained best.pth there "
                                        f"or set CHECKPOINT_PATH.")
            ck = torch.load(path, map_location="cpu", weights_only=True)
            state = ck["model"] if isinstance(ck, dict) and "model" in ck else ck
            model = UNet3D()
            model.load_state_dict(state, strict=True)      # fails loudly if the architecture differs
            model.to(self.device).eval()
            self.model = model
            self.error = None
            self.info = {
                "checkpoint_file": path.name,
                "epoch": ck.get("epoch") if isinstance(ck, dict) else None,
                "recorded_val_dice": ck.get("val_dice") if isinstance(ck, dict) else None,
                "parameters": sum(p.numel() for p in model.parameters()),
                "channels": list(model.channels),
            }
            log.info("Model loaded from %s on %s", path, self.device)
        except Exception as e:                                   # noqa: BLE001
            self.model = None
            self.error = f"{type(e).__name__}: {e}"
            log.error("Model loading failed: %s", self.error)

    def predict(self, x, tta=False, on_progress=None):
        """x: float32 (4,X,Y,Z) preprocessed. Returns bool (3,X,Y,Z): WT, TC, ET."""
        if not self.loaded:
            raise EngineError("The model is not loaded: " + (self.error or "unknown error"))
        with self._lock:
            try:
                return self._predict(torch.from_numpy(x), tta, on_progress)
            except torch.cuda.OutOfMemoryError:
                torch.cuda.empty_cache()
                raise EngineError("The GPU ran out of memory. Try a smaller scan, close other GPU programs, "
                                  "or run the backend on CPU (set CUDA_VISIBLE_DEVICES=-1).")
            except RuntimeError as e:
                if "out of memory" in str(e).lower():
                    if self.device.type == "cuda":
                        torch.cuda.empty_cache()
                    raise EngineError("Not enough memory to segment this scan.")
                raise

    @torch.inference_mode()
    def _predict(self, img, tta, on_progress, overlap=0.5):
        patch, n_cls = config.PATCH_SIZE, config.N_CLASSES
        shape = img.shape[1:]
        pad = [max(0, patch[i] - shape[i]) for i in range(3)]
        if any(pad):
            img = F.pad(img, (0, pad[2], 0, pad[1], 0, pad[0]))
        X, Y, Z = img.shape[1:]
        img = img.to(self.device)

        def starts(dim, p):
            s = list(range(0, dim - p + 1, max(1, int(p * (1 - overlap)))))
            if s[-1] != dim - p:
                s.append(dim - p)
            return s

        sx, sy, sz = starts(X, patch[0]), starts(Y, patch[1]), starts(Z, patch[2])
        total, done = len(sx) * len(sy) * len(sz), 0
        out = torch.zeros((n_cls, X, Y, Z), device=self.device)
        cnt = torch.zeros((1, X, Y, Z), device=self.device)
        w = _gaussian_map(patch).to(self.device)
        use_amp = self.device.type == "cuda"
        for x0 in sx:
            for y0 in sy:
                for z0 in sz:
                    sl = (slice(x0, x0 + patch[0]), slice(y0, y0 + patch[1]), slice(z0, z0 + patch[2]))
                    crop = img[(slice(None),) + sl][None]
                    with torch.autocast(self.device.type, dtype=torch.float16, enabled=use_amp):
                        p = torch.sigmoid(self.model(crop).float())
                        if tta:
                            for dims in ((2,), (3,), (4,)):
                                p = p + torch.sigmoid(self.model(crop.flip(dims)).float()).flip(dims)
                            p = p / 4
                    out[(slice(None),) + sl] += p[0] * w
                    cnt[(slice(None),) + sl] += w
                    done += 1
                    if on_progress:
                        on_progress(done / total)
        prob = (out / cnt)[:, :shape[0], :shape[1], :shape[2]]
        return (prob > 0.5).cpu().numpy()


engine = Engine()
