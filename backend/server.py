import threading
from fastapi import FastAPI
from .config import load_config
from .pipeline import VisitorPipeline

app = FastAPI(title="Face Tracker API")

def run_pipeline():
    try:
        print("Starting video pipeline...")
        config = load_config("backend/config.json")
        pipeline = VisitorPipeline(config)
        pipeline.run(None)
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
        "message": "Face tracker background pipeline is running. Head over to the logs directory to see events."
    }
