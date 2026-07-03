from fastapi import APIRouter, HTTPException, Body, BackgroundTasks
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
def save_chapter(project_id: str, chapter_id: str, data: ChapterSave, background_tasks: BackgroundTasks):
    success = StorageService.save_chapter(project_id, chapter_id, data.content)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found or save failed")
        
    # Trigger background auto-translation synchronization if enabled
    from backend.services.ai import AIService
    settings = AIService.load_settings()
    if settings.get("auto_translate_on_save", True):
        background_tasks.add_task(StorageService.sync_all_translations, project_id, chapter_id, data.content)
        
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

from datetime import datetime

@router.post("/{chapter_id}/snapshots")
def create_snapshot(project_id: str, chapter_id: str):
    """
    Creates a new dated snapshot of the current chapter content.
    Saves it to projects/{project_id}/history/{chapter_id}_{timestamp}.md
    """
    result = StorageService.get_chapter_content(project_id, chapter_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
        
    content = result.get("content", "")
    
    # Save snapshot
    history_dir = StorageService.get_projects_dir() / project_id / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    snapshot_filename = f"{chapter_id}_{timestamp}.md"
    snapshot_file = history_dir / snapshot_filename
    
    try:
        with open(snapshot_file, 'w', encoding='utf-8') as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create snapshot: {str(e)}")
        
    return {
        "id": snapshot_filename.replace(".md", ""),
        "timestamp": datetime.now().isoformat(),
        "filename": snapshot_filename
    }

@router.get("/{chapter_id}/snapshots")
def get_snapshots(project_id: str, chapter_id: str):
    """
    Retrieves list of dated snapshots for the chapter.
    Returns metadata and content for diff.
    """
    history_dir = StorageService.get_projects_dir() / project_id / "history"
    if not history_dir.exists():
        return []
        
    prefix = f"{chapter_id}_"
    snapshots = []
    
    for file in history_dir.iterdir():
        if file.is_file() and file.name.startswith(prefix) and file.name.endswith(".md"):
            try:
                stat = file.stat()
                timestamp_str = file.name[len(prefix):-3] # Extract YYYYMMDD_HHMMSS
                try:
                    dt = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                    timestamp_iso = dt.isoformat()
                except Exception:
                    timestamp_iso = datetime.fromtimestamp(stat.st_mtime).isoformat()
                    
                with open(file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                snapshots.append({
                    "id": file.name.replace(".md", ""),
                    "timestamp": timestamp_iso,
                    "filename": file.name,
                    "word_count": len(content.split()),
                    "content": content
                })
            except Exception:
                pass
                
    return sorted(snapshots, key=lambda x: x["timestamp"], reverse=True)

@router.post("/{chapter_id}/snapshots/{snapshot_id}/restore")
def restore_snapshot(project_id: str, chapter_id: str, snapshot_id: str):
    """
    Restores the content of the specified snapshot.
    Saves a history backup first, then overwrites active chapter.
    """
    history_dir = StorageService.get_projects_dir() / project_id / "history"
    snapshot_file = history_dir / f"{snapshot_id}.md"
    if not snapshot_file.exists():
        raise HTTPException(status_code=404, detail="Snapshot not found")
        
    try:
        with open(snapshot_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read snapshot: {str(e)}")
        
    success = StorageService.save_chapter(project_id, chapter_id, content)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to restore snapshot")
        
    return {"message": "Snapshot restored successfully", "content": content}
