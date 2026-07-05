import os
import json
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

def get_settings_path():
    import sys
    from pathlib import Path
    if getattr(sys, 'frozen', False):
        config_dir = Path.home() / "EmberNovels"
        config_dir.mkdir(parents=True, exist_ok=True)
        return str(config_dir / "settings.json")
    else:
        return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "settings.json")

from typing import Optional
class GlobalSettings(BaseModel):
    ui_language: str
    first_run_completed: Optional[bool] = False
    tutorial_modules_seen: Optional[bool] = False

@router.get("/settings")
def get_global_settings():
    path = get_settings_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {"success": True, "settings": data}
        except Exception:
            pass
    return {"success": True, "settings": {"ui_language": "de"}}

@router.post("/settings")
def save_global_settings(settings: GlobalSettings):
    path = get_settings_path()
    try:
        data = {}
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        
        data["ui_language"] = settings.ui_language
        if settings.first_run_completed is not None:
            data["first_run_completed"] = settings.first_run_completed
        if settings.tutorial_modules_seen is not None:
            data["tutorial_modules_seen"] = settings.tutorial_modules_seen
        
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
