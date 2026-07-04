import os
import json
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

def get_settings_path():
    import sys
    if getattr(sys, 'frozen', False):
        return os.path.join(sys._MEIPASS, "settings.json")
    else:
        return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "settings.json")

class GlobalSettings(BaseModel):
    ui_language: str

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
        # Load existing if exists
        data = {}
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        
        data["ui_language"] = settings.ui_language
        
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
