import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from backend.config import APP_NAME, API_PREFIX
from backend.routes.projects import router as projects_router
from backend.routes.chapters import router as chapters_router
from backend.routes.lore import router as lore_router
from backend.routes.exports import router as exports_router
from backend.routes.languages import router as languages_router
from backend.routes.ai import router as ai_router
from backend.routes.update import router as update_router
from backend.routes.settings import router as settings_router
from backend.routes.tasks import router as tasks_router

app = FastAPI(title=APP_NAME, description="Local web-based writing software")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for local desktop app usage
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(projects_router, prefix=API_PREFIX)
app.include_router(chapters_router, prefix=API_PREFIX)
app.include_router(lore_router, prefix=API_PREFIX)
app.include_router(exports_router, prefix=API_PREFIX)
app.include_router(languages_router, prefix=API_PREFIX)
app.include_router(ai_router, prefix=API_PREFIX)
app.include_router(update_router, prefix=API_PREFIX)
app.include_router(settings_router, prefix=API_PREFIX)
app.include_router(tasks_router, prefix=API_PREFIX)

import json

@app.get(f"{API_PREFIX}/version")
def get_version():
    import sys
    is_compiled = getattr(sys, 'frozen', False)
    if is_compiled:
        version_path = os.path.join(sys._MEIPASS, "version.json")
    else:
        version_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "version.json")
        
    if not os.path.exists(version_path):
        return {"version": "0.1.2.0", "release_notes": {}, "is_compiled": is_compiled}
    try:
        with open(version_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            data["is_compiled"] = is_compiled
            return data
    except Exception as e:
        return {"version": "0.1.2.0", "error": str(e), "is_compiled": is_compiled}

@app.get("/")
def read_root():
    return RedirectResponse(url="/index.html")


# Path to static frontend files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")
else:
    print(f"Warning: Frontend directory '{frontend_dir}' not found. Static files will not be served.")
