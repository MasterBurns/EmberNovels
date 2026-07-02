import os
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from backend.services.export import ExportService

router = APIRouter(prefix="/projects/{project_id}/export", tags=["export"])

class ExportRequest(BaseModel):
    chapter_ids: Optional[List[str]] = None

@router.post("/{file_format}")
def export_project(project_id: str, file_format: str, req: ExportRequest, background_tasks: BackgroundTasks):
    """
    Export project chapters to the specified format and trigger client download.
    Cleans up the temporary file automatically afterwards using BackgroundTasks.
    """
    try:
        file_path, filename = ExportService.export_project(project_id, file_format, req.chapter_ids)
        
        # Add background task to clean up the temporary file after download
        background_tasks.add_task(lambda: os.unlink(file_path) if file_path.exists() else None)
        
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type="application/octet-stream"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ImportError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export-Fehler: {str(e)}")
