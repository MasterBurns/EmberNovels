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
        current_exe = sys.executable if is_frozen else os.path.abspath(sys.argv[0])
        exe_dir = os.path.dirname(current_exe)
        
        # Download directory
        temp_dir = os.path.join(exe_dir, ".update_temp")
        os.makedirs(temp_dir, exist_ok=True)
        
        is_zip = download_url.lower().endswith(".zip") or "zipball" in download_url.lower()
        is_tar = download_url.lower().endswith(".tar.gz") or download_url.lower().endswith(".tgz")
        
        archive_name = "update_archive.tar.gz" if is_tar else "update_archive.zip"
        archive_path = os.path.join(temp_dir, archive_name)
        is_archive = is_zip or is_tar

        if not is_archive:
            archive_path = os.path.join(temp_dir, "EmberNovels_new" + (".exe" if sys.platform == "win32" else ""))
        
        print(f"Downloading update from {download_url} to {archive_path}...")
        try:
            response = requests.get(download_url, stream=True, timeout=60)
        except requests.exceptions.SSLError:
            response = requests.get(download_url, stream=True, timeout=60, verify=False)
        response.raise_for_status()
        
        with open(archive_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        print("Download complete. Generating update script...")
        
        source_root = temp_dir
        if is_archive:
            import zipfile
            import tarfile
            extract_dir = os.path.join(temp_dir, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            if archive_path.endswith(".zip"):
                with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                    zip_ref.extractall(extract_dir)
            else:
                with tarfile.open(archive_path, 'r:gz') as tar_ref:
                    tar_ref.extractall(extract_dir)
            
            # Find the root of the source (usually inside a single top-level folder)
            extracted_items = os.listdir(extract_dir)
            if len(extracted_items) == 1:
                item_path = os.path.join(extract_dir, extracted_items[0])
                if os.path.isdir(item_path):
                    source_root = item_path
                else:
                    source_root = extract_dir
            else:
                source_root = extract_dir
                
        is_binary_update = False
        if is_archive:
            # Check if there is an executable in the source root
            for item in os.listdir(source_root):
                if item.lower() in ("embernovels", "embernovels.exe"):
                    is_binary_update = True
                    break
        
        if sys.platform == "win32":
            update_script = os.path.join(exe_dir, "update.bat")
            with open(update_script, "w") as f:
                f.write("@echo off\n")
                f.write("timeout /t 2 /nobreak > nul\n")
                if is_archive:
                    f.write(f'xcopy /E /Y /C /Q "{source_root}\\*" "{exe_dir}\\"\n')
                else:
                    f.write(f'del "{current_exe}"\n')
                    f.write(f'move "{archive_path}" "{current_exe}"\n')
                
                if is_frozen:
                    f.write(f'start "" "{current_exe}" --no-browser\n')
                else:
                    python_exe = sys.executable
                    f.write(f'start "" "{python_exe}" "{current_exe}" --no-browser\n')
                
                f.write(f'rmdir /S /Q "{temp_dir}"\n')
                f.write(f'del "%~f0"\n')
            
            print("Spawning update script...")
            subprocess.Popen(["cmd.exe", "/c", update_script], creationflags=subprocess.DETACHED_PROCESS)
            
        else:
            update_script = os.path.join(exe_dir, "update.sh")
            with open(update_script, "w") as f:
                f.write("#!/bin/bash\n")
                f.write("sleep 2\n")
                if is_archive:
                    if is_binary_update:
                        f.write(f'rm -f "{current_exe}"\n')
                        f.write(f'cp -r "{source_root}"/* "{exe_dir}"/\n')
                        f.write(f'chmod +x "{current_exe}"\n')
                    else:
                        f.write(f'cp -r "{source_root}"/* "{exe_dir}"/\n')
                else:
                    f.write(f'rm -f "{current_exe}"\n')
                    f.write(f'mv "{archive_path}" "{current_exe}"\n')
                    f.write(f'chmod +x "{current_exe}"\n')
                    
                if is_frozen and is_archive and not is_binary_update:
                    # User is on a compiled Linux binary, but we only gave them source. 
                    # Try to rebuild if pyinstaller is available
                    f.write(f'cd "{exe_dir}"\n')
                    f.write(f'if command -v pyinstaller &> /dev/null; then\n')
                    f.write(f'    pyinstaller --noconfirm --onefile --windowed --add-data "frontend:frontend" --add-data "version.json:." --name EmberNovels run_app.py > update.log 2>&1\n')
                    f.write(f'    if [ -f "install.sh" ]; then bash install.sh >> update.log 2>&1; fi\n')
                    f.write(f'else\n')
                    f.write(f'    echo "PyInstaller not found. Could not automatically rebuild the binary. Please rebuild manually." > update_error.log\n')
                    f.write(f'fi\n')
                
                f.write(f'rm -rf "{temp_dir}"\n')
                f.write(f'rm -f "$0"\n')

                if is_frozen:
                    f.write(f'exec "{current_exe}" --no-browser\n')
                else:
                    python_exe = sys.executable
                    main_script = os.path.abspath(sys.argv[0])
                    f.write(f'exec "{python_exe}" "{main_script}" --no-browser\n')
            
            os.chmod(update_script, 0o755)
            print("Exec-ing update script (replacing current process)...")
            sys.stdout.flush()
            sys.stderr.flush()
            
            clean_env = dict(os.environ)
            if 'LD_LIBRARY_PATH' in clean_env:
                del clean_env['LD_LIBRARY_PATH']
                
            os.execvpe("bash", ["bash", update_script], clean_env)
            # os.execvpe does not return.
        
    except Exception as e:
        print(f"Hot update failed: {e}")


@router.post("")
def trigger_update(data: UpdateTrigger, background_tasks: BackgroundTasks):
    try:
        import sys
        
        # Determine if we have a direct binary for this platform or must fallback to zip
        # This route relies on the frontend passing the correct URL. 
        # If the frontend passes a zip, we try to extract and rebuild (on linux).
        background_tasks.add_task(perform_hot_update, data.download_url)
        return {"success": True, "message": "Update gestartet. EmberNovels wird neu gestartet."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
