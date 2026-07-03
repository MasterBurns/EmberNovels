import sys
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent

if getattr(sys, 'frozen', False):
    # Standalone production: persistent folder in user's home directory
    PROJECTS_DIR = Path.home() / "EmberNovels" / "projects"
else:
    # Development: inside project workspace directory
    PROJECTS_DIR = BASE_DIR / "projects"

# Ensure directories exist
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# App Settings
APP_NAME = "EmberNovels"
API_PREFIX = "/api"
