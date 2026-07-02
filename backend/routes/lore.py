from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from backend.services.storage import StorageService

router = APIRouter(prefix="/projects/{project_id}/lore", tags=["lore"])

class LoreCreate(BaseModel):
    name: str
    category: str  # character, location, item, lore
    short_description: Optional[str] = ""
    description: Optional[str] = ""
    keywords: Optional[List[str]] = None

class LoreUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None

@router.get("")
def list_lore(project_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    return StorageService.list_lore(project_id)

@router.get("/trashed")
def list_trashed_lore(project_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    return StorageService.list_trashed_lore(project_id)

@router.post("")
def create_lore(project_id: str, lore: LoreCreate):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    if not lore.name.strip():
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    return StorageService.create_lore(
        project_id, 
        lore.name, 
        lore.category, 
        lore.short_description, 
        lore.description, 
        lore.keywords
    )

@router.get("/{lore_id}")
def get_lore(project_id: str, lore_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    entry = StorageService.get_lore(project_id, lore_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Lore entry not found")
    return entry

@router.patch("/{lore_id}")
def update_lore(project_id: str, lore_id: str, data: LoreUpdate):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    entry = StorageService.update_lore(project_id, lore_id, update_data)
    if not entry:
        raise HTTPException(status_code=404, detail="Lore entry not found")
    return entry

@router.delete("/{lore_id}")
def delete_lore(project_id: str, lore_id: str):
    success = StorageService.delete_lore(project_id, lore_id)
    if not success:
        raise HTTPException(status_code=404, detail="Lore entry not found")
    return {"message": "Lore entry soft deleted successfully"}

@router.post("/{lore_id}/restore")
def restore_lore(project_id: str, lore_id: str):
    success = StorageService.restore_lore(project_id, lore_id)
    if not success:
        raise HTTPException(status_code=404, detail="Lore entry not found in trash or restore failed")
    return {"message": "Lore entry restored successfully"}

@router.delete("/{lore_id}/permanent")
def permanent_delete_lore(project_id: str, lore_id: str):
    success = StorageService.permanent_delete_lore(project_id, lore_id)
    if not success:
        raise HTTPException(status_code=404, detail="Lore entry not found in trash")
    return {"message": "Lore entry permanently deleted"}
