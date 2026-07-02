from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional
from backend.services.storage import StorageService

router = APIRouter(prefix="/projects/{project_id}/chapters", tags=["chapters"])

class ChapterCreate(BaseModel):
    title: str

class ChapterSave(BaseModel):
    content: str

class RecoveryResolve(BaseModel):
    keep_recovery: bool

@router.get("")
def list_chapters(project_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    return StorageService.list_chapters(project_id)

@router.get("/trashed")
def list_trashed_chapters(project_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    return StorageService.list_trashed_chapters(project_id)

@router.post("")
def create_chapter(project_id: str, chapter: ChapterCreate):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    if not chapter.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    return StorageService.create_chapter(project_id, chapter.title)

@router.get("/{chapter_id}")
def get_chapter(project_id: str, chapter_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = StorageService.get_chapter_content(project_id, chapter_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@router.post("/{chapter_id}/autosave")
def autosave_chapter(project_id: str, chapter_id: str, data: ChapterSave):
    success = StorageService.autosave_chapter(project_id, chapter_id, data.content)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found or autosave failed")
    return {"message": "Autosaved successfully to temp file"}

@router.post("/{chapter_id}/save")
def save_chapter(project_id: str, chapter_id: str, data: ChapterSave):
    success = StorageService.save_chapter(project_id, chapter_id, data.content)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found or save failed")
    return {"message": "Saved successfully with history snapshot"}

@router.delete("/{chapter_id}")
def delete_chapter(project_id: str, chapter_id: str):
    success = StorageService.delete_chapter(project_id, chapter_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return {"message": "Chapter soft deleted successfully"}

@router.post("/{chapter_id}/restore")
def restore_chapter(project_id: str, chapter_id: str):
    success = StorageService.restore_chapter(project_id, chapter_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found in trash or restore failed")
    return {"message": "Chapter restored successfully"}

@router.delete("/{chapter_id}/permanent")
def permanent_delete_chapter(project_id: str, chapter_id: str):
    success = StorageService.permanent_delete_chapter(project_id, chapter_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found in trash")
    return {"message": "Chapter permanently deleted"}

@router.post("/{chapter_id}/recovery")
def resolve_recovery(project_id: str, chapter_id: str, data: RecoveryResolve):
    success = StorageService.resolve_recovery(project_id, chapter_id, data.keep_recovery)
    if not success:
        raise HTTPException(status_code=404, detail="Recovery resolution failed or no recovery candidate found")
    return {"message": f"Recovery resolved. Kept recovery: {data.keep_recovery}"}
