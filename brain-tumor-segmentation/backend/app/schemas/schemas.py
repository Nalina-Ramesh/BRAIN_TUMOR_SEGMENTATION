from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class Health(BaseModel):
    status: str
    model_loaded: bool
    device: str


class ModelInfo(BaseModel):
    loaded: bool
    error: Optional[str] = None
    device: str
    architecture: str
    input_channels: List[str]
    output_regions: List[str]
    patch_size: List[int]
    channels: Optional[List[int]] = None
    parameters: Optional[int] = None
    checkpoint_file: Optional[str] = None
    checkpoint_epoch: Optional[int] = None
    recorded_val_dice: Optional[Dict[str, float]] = None


class JobAccepted(BaseModel):
    id: str
    status: str


class ResultSummary(BaseModel):
    id: str
    status: str
    stage: str
    progress: float
    created_at: str
    error: Optional[str] = None
    input_names: Dict[str, str] = {}
    processing_time_s: Optional[float] = None
    tumor_voxels: Optional[int] = None
    volume_ml: Optional[float] = None


class ResultDetail(ResultSummary):
    warnings: List[str] = []
    dims: Optional[Dict[str, Any]] = None
    stats: Optional[Dict[str, Any]] = None
    views: Optional[Dict[str, Any]] = None
    comparison: Optional[Dict[str, Any]] = None
    device: Optional[str] = None
    used_tta: Optional[bool] = None


class SessionInfo(BaseModel):
    processed_this_session: int
    stored_results: int
