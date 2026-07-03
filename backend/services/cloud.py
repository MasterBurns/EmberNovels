import requests
import base64
import os
from pathlib import Path
from backend.services.ai import AIService
from backend.services.export import ExportService
from backend.services.storage import StorageService

class CloudService:
    @classmethod
    def backup_project_to_webdav(cls, project_id: str) -> bool:
        settings = AIService.load_settings()
        webdav_url = settings.get('webdav_url')
        webdav_user = settings.get('webdav_user')
        webdav_password = settings.get('webdav_password')

        if not webdav_url or not webdav_user or not webdav_password:
            raise ValueError("WebDAV Zugangsdaten sind nicht vollständig konfiguriert.")

        if not webdav_url.endswith('/'):
            webdav_url += '/'

        # Create zip export
        project_meta = StorageService.get_project_metadata(project_id)
        if not project_meta:
            raise ValueError("Projekt nicht gefunden.")

        safe_title = project_meta.get('title', project_id).replace(' ', '_')
        
        zip_path = None
        try:
            # We use a temporary filename for the upload
            import tempfile
            temp_dir = Path(tempfile.gettempdir())
            zip_filename = f"{safe_title}_Backup.zip"
            zip_path = temp_dir / zip_filename
            
            # Export zip
            ExportService._export_zip(zip_path, project_id)
            
            # Upload to WebDAV via HTTP PUT
            upload_url = f"{webdav_url}{zip_filename}"
            auth = (webdav_user, webdav_password)
            
            with open(zip_path, 'rb') as f:
                response = requests.put(upload_url, data=f, auth=auth)
                
            if response.status_code not in (200, 201, 204):
                raise Exception(f"Upload fehlgeschlagen. Status: {response.status_code}, Response: {response.text}")
                
            return True
        finally:
            if zip_path and zip_path.exists():
                try:
                    os.remove(zip_path)
                except:
                    pass
