import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import threading
from fastapi import FastAPI
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

def run_pipeline():
    global pipeline_instance
    try:
        print("Starting video pipeline...")
        config = load_config("backend/config.json")
        pipeline_instance = VisitorPipeline(config)
        
        # Override source from environment so RTSP can be tested without code changes
        source = os.environ.get("INPUT_SOURCE", None)
        
        pipeline_instance.run(source)
        print("Pipeline finished.")
    except Exception as e:
        print(f"Pipeline error: {e}")

@app.on_event("startup")
def startup_event():
    thread = threading.Thread(target=run_pipeline, daemon=True)
    thread.start()

@app.get("/")
def health_check():
    return {
        "status": "ok", 
        "message": "Face tracker background pipeline is running."
    }

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
