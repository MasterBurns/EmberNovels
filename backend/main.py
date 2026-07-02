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

@app.get("/")
def read_root():
    return RedirectResponse(url="/index.html")

# Path to static frontend files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")
else:
    print(f"Warning: Frontend directory '{frontend_dir}' not found. Static files will not be served.")
