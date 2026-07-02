import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = BASE_DIR

# Storage directories
PROJECTS_DIR = WORKSPACE_DIR / "projects"

# Ensure directories exist
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# App Settings
APP_NAME = "EmberNovels"
API_PREFIX = "/api"
