import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import threading
import shutil
from pathlib import Path
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .config import load_config
from .pipeline import VisitorPipeline

app = FastAPI(title="Face Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline_instance = None
pipeline_thread = None

def run_pipeline(source=None):
    global pipeline_instance
    try:
        print(f"Starting video pipeline with source: {source}...")
        config = load_config("backend/config.json")
        pipeline_instance = VisitorPipeline(config)
        
        # Override source from environment if not explicitly passed
        if source is None:
            source = os.environ.get("INPUT_SOURCE", None)
            
        pipeline_instance.run(source)
        print("Pipeline finished.")
    except Exception as e:
        print(f"Pipeline error: {e}")

@app.on_event("startup")
def startup_event():
    global pipeline_thread
    source = os.environ.get("INPUT_SOURCE", None)
    if source:
        # Only auto-start if an explicitly defined source exists
        thread = threading.Thread(target=run_pipeline, args=(source,), daemon=True)
        thread.start()
        pipeline_thread = thread

@app.get("/")
def health_check():
    return {
        "status": "ok", 
        "message": "Face tracker API is running."
    }

@app.post("/api/set-source")
async def set_source(url: str = Form(None), file: UploadFile = File(None)):
    global pipeline_instance, pipeline_thread
    
    if pipeline_instance:
        pipeline_instance.stop()
        if pipeline_thread:
            pipeline_thread.join(timeout=3.0) 
            
    source_to_use = None
    if file and file.filename:
        upload_dir = Path("backend/uploads")
        upload_dir.mkdir(parents=True, exist_ok=True)
        # Prevent path traversal by keeping only the basename.
        safe_filename = Path(file.filename).name
        file_path = upload_dir / safe_filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        source_to_use = str(file_path)
    elif url:
        source_to_use = url
        
    if not source_to_use:
        raise HTTPException(status_code=400, detail="No valid source provided")
        
    thread = threading.Thread(target=run_pipeline, args=(source_to_use,), daemon=True)
    thread.start()
    pipeline_thread = thread
    
    return {"status": "success", "source": source_to_use}

@app.get("/stats")
def get_stats():
    if not pipeline_instance or not hasattr(pipeline_instance, 'registry'):
        return {"unique_visitors": 0, "currently_inside": 0, "detection_rate": 0}
    try:
        count = pipeline_instance.registry.count()
        active = len(pipeline_instance.tracker.active_tracks())
        
        # approximate loop rate or configurable fps
        fps = 30.0 / (pipeline_instance.config.detection_skip_frames + 1)
        
        return {
            "unique_visitors": count, 
            "currently_inside": active, 
            "detection_rate": round(fps, 1)
        }
    except Exception as e:
        return {"error": str(e)}
