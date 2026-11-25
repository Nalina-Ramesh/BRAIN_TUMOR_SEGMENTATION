import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
from app import storage
from app.api.routes import router
from app.inference.engine import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("neuroseg")


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - 3600                       # remove stale temporary uploads
    for p in config.UPLOAD_DIR.iterdir():
        if p.is_file() and p.name != ".gitkeep" and p.stat().st_mtime < cutoff:
            p.unlink(missing_ok=True)
    storage.fail_interrupted()
    engine.load()                                     # the trained model is loaded ONCE here
    yield


app = FastAPI(title="NeuroSeg AI", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse({"detail": "Unexpected server error."}, status_code=500)
