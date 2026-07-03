import os
import sys
import requests
import subprocess
import time
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

router = APIRouter(prefix="/update", tags=["update"])

class UpdateTrigger(BaseModel):
    download_url: str

def perform_hot_update(download_url: str):
    # Give the HTTP response time to complete sending to the client
    time.sleep(1.0)
    
    try:
        is_frozen = getattr(sys, 'frozen', False)
        current_exe = sys.executable
        exe_dir = os.path.dirname(current_exe)
        
        new_exe_name = "EmberNovels_new.exe" if sys.platform == "win32" else "EmberNovels_new"
        new_exe_path = os.path.join(exe_dir, new_exe_name)
        
        print(f"Downloading update from {download_url} to {new_exe_path}...")
        response = requests.get(download_url, stream=True, timeout=60)
        response.raise_for_status()
        
        with open(new_exe_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        print("Download complete.")
        
        if not is_frozen:
            print("Running in development mode. Simulating success, skipping hot-swap.")
            if os.path.exists(new_exe_path):
                os.remove(new_exe_path)
            return
            
        if sys.platform == "win32":
            # Windows hot-swap batch file
            bat_path = os.path.join(exe_dir, "update.bat")
            bat_content = f"""@echo off
timeout /t 2 /nobreak > nul
del "{current_exe}"
move "{new_exe_path}" "{current_exe}"
start "" "{current_exe}"
del "%~f0"
"""
            with open(bat_path, "w", encoding="utf-8") as f:
                f.write(bat_content)
                
            print("Spawning detached Windows update batch script...")
            subprocess.Popen(["cmd.exe", "/c", bat_path], creationflags=subprocess.DETACHED_PROCESS)
            
        else:
            # Unix (Linux / macOS) hot-swap
            old_exe_path = current_exe + ".old"
            if os.path.exists(old_exe_path):
                try:
                    os.remove(old_exe_path)
                except Exception:
                    pass
                
            os.rename(current_exe, old_exe_path)
            os.rename(new_exe_path, current_exe)
            os.chmod(current_exe, 0o755)
            
            print("Spawning new Unix process...")
            subprocess.Popen([current_exe])
            
        print("Shutting down current server process...")
        os._exit(0)
        
    except Exception as e:
        print(f"Hot update failed: {e}")

@router.post("/trigger")
def trigger_update(data: UpdateTrigger, background_tasks: BackgroundTasks):
    background_tasks.add_task(perform_hot_update, data.download_url)
    return {"message": "Update triggered. The server is restarting."}
