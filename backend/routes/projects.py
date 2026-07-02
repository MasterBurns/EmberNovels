from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Any
from backend.services.storage import StorageService

router = APIRouter(prefix="/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    author: Optional[str] = ""

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    word_count_goal: Optional[int] = None
    daily_word_count_goal: Optional[int] = None

@router.get("")
def list_projects():
    return StorageService.list_projects()

@router.get("/trashed")
def list_trashed_projects():
    return StorageService.list_trashed_projects()

@router.post("")
def create_project(project: ProjectCreate):
    if not project.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    return StorageService.create_project(project.title, project.description, project.author)

@router.get("/{project_id}")
def get_project(project_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Load chapters
    chapters = StorageService.list_chapters(project_id)
    meta["chapters"] = chapters
    return meta

@router.patch("/{project_id}")
def update_project(project_id: str, data: ProjectUpdate):
    # Filter out None fields to avoid resetting
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    meta = StorageService.update_project_metadata(project_id, update_data)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    return meta

@router.delete("/{project_id}")
def delete_project(project_id: str):
    success = StorageService.delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found or could not be deleted")
    return {"message": "Project soft deleted successfully"}

@router.post("/{project_id}/restore")
def restore_project(project_id: str):
    success = StorageService.restore_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found in trash or could not be restored")
    return {"message": "Project restored successfully"}

@router.delete("/{project_id}/permanent")
def permanent_delete_project(project_id: str):
    success = StorageService.permanent_delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found in trash")
    return {"message": "Project permanently deleted"}
