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

def extract_binary_from_archive(archive_path, target_exe_path):
    temp_dir = os.path.dirname(target_exe_path)
    binary_name = "EmberNovels.exe" if sys.platform == "win32" else "EmberNovels"
    extracted_path = None
    
    # Extract to a temp filename to prevent OS locks on running executables
    temp_extracted_name = "EmberNovels_extracted_temp.exe" if sys.platform == "win32" else "EmberNovels_extracted_temp"
    temp_extracted_path = os.path.join(temp_dir, temp_extracted_name)
    
    if os.path.exists(temp_extracted_path):
        try:
            os.remove(temp_extracted_path)
        except Exception:
            pass
            
    if archive_path.endswith(".tar.gz") or archive_path.endswith(".tgz"):
        import tarfile
        with tarfile.open(archive_path, "r:gz") as tar:
            member = None
            for m in tar.getmembers():
                if os.path.basename(m.name) == binary_name:
                    member = m
                    break
            if member:
                member.name = temp_extracted_name
                tar.extract(member, path=temp_dir)
                extracted_path = temp_extracted_path
                
    elif archive_path.endswith(".zip"):
        import zipfile
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            filename = None
            for name in zip_ref.namelist():
                if os.path.basename(name) == binary_name:
                    filename = name
                    break
            if filename:
                # Extract to a temp directory to avoid naming clashes
                temp_extract_subfolder = os.path.join(temp_dir, "temp_extracted_zip_dir")
                if os.path.exists(temp_extract_subfolder):
                    import shutil
                    try:
                        shutil.rmtree(temp_extract_subfolder)
                    except Exception:
                        pass
                zip_ref.extract(filename, path=temp_extract_subfolder)
                
                original_extracted = os.path.join(temp_extract_subfolder, filename)
                if os.path.exists(original_extracted):
                    os.rename(original_extracted, temp_extracted_path)
                    extracted_path = temp_extracted_path
                    
                if os.path.exists(temp_extract_subfolder):
                    import shutil
                    try:
                        shutil.rmtree(temp_extract_subfolder)
                    except Exception:
                        pass
                
    if extracted_path and os.path.exists(extracted_path):
        if os.path.exists(target_exe_path):
            try:
                os.remove(target_exe_path)
            except Exception:
                pass
        os.rename(extracted_path, target_exe_path)
        return True
    return False

def perform_hot_update(download_url: str):
    # Give the HTTP response time to complete sending to the client
    time.sleep(1.0)
    
    try:
        is_frozen = getattr(sys, 'frozen', False)
        current_exe = sys.executable
        exe_dir = os.path.dirname(current_exe)
        
        new_exe_name = "EmberNovels_new.exe" if sys.platform == "win32" else "EmberNovels_new"
        new_exe_path = os.path.join(exe_dir, new_exe_name)
        
        # Check if URL points to an archive
        url_lower = download_url.lower()
        is_archive = url_lower.endswith(".tar.gz") or url_lower.endswith(".tgz") or url_lower.endswith(".zip")
        
        download_target = new_exe_path
        if is_archive:
            archive_ext = ".tar.gz" if ".tar.gz" in url_lower or ".tgz" in url_lower else ".zip"
            download_target = os.path.join(exe_dir, "temp_update_archive" + archive_ext)
            
        print(f"Downloading update from {download_url} to {download_target}...")
        try:
            response = requests.get(download_url, stream=True, timeout=60)
        except requests.exceptions.SSLError:
            print("SSL Certificate verification failed. Retrying with verification disabled...")
            response = requests.get(download_url, stream=True, timeout=60, verify=False)
        response.raise_for_status()
        
        with open(download_target, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        print("Download complete.")
        
        if is_archive:
            print(f"Extracting binary from archive {download_target}...")
            success = False
            try:
                success = extract_binary_from_archive(download_target, new_exe_path)
            finally:
                if os.path.exists(download_target):
                    try:
                        os.remove(download_target)
                    except Exception:
                        pass
            if not success:
                raise Exception("Failed to extract executable binary from downloaded archive.")
            print("Extraction complete.")
            
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
            devnull = os.open(os.devnull, os.O_RDWR)
            subprocess.Popen([current_exe], preexec_fn=os.setsid, stdout=devnull, stderr=devnull, stdin=devnull)
            
        print("Shutting down current server process...")
        os._exit(0)
        
    except Exception as e:
        print(f"Hot update failed: {e}")

@router.post("/trigger")
def trigger_update(data: UpdateTrigger, background_tasks: BackgroundTasks):
    background_tasks.add_task(perform_hot_update, data.download_url)
    return {"message": "Update triggered. The server is restarting."}
