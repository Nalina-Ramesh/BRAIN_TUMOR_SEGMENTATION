"""Central configuration. Override any value with an environment variable or backend/.env"""
import os
from pathlib import Path

try:  # optional .env support
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent


def _path(name: str, default: Path) -> Path:
    return Path(os.getenv(name, str(default))).expanduser().resolve()


CHECKPOINT_PATH = _path("CHECKPOINT_PATH", BASE_DIR / "checkpoints" / "best.pth")
UPLOAD_DIR = _path("UPLOAD_DIR", ROOT_DIR / "uploads")
RESULTS_DIR = _path("RESULTS_DIR", ROOT_DIR / "results")
TRAINING_INFO_PATH = BASE_DIR / "training_info.json"

MAX_FILE_MB = int(os.getenv("MAX_FILE_MB", "300"))          # per uploaded file
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# The trained model takes FOUR co-registered sequences, in this channel order.
MODALITIES = [("flair", "FLAIR"), ("t1", "T1"), ("t1c", "T1 contrast"), ("t2", "T2")]

# Must match the training pipeline (kaggle_2_train_eval.py)
PATCH_SIZE = (128, 128, 128)
N_CLASSES = 3                      # WT, TC, ET
Q_LO, Q_HI = -3.0, 6.0             # 8-bit intensity round trip used in training
MODEL_ORIENTATION = ("L", "P", "S")  # BraTS array orientation
MIN_DIM, MAX_DIM = 32, 600         # accepted volume size per axis
