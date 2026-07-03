import re
from fastapi import APIRouter, HTTPException, BackgroundTasks, Body
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from backend.services.storage import StorageService

router = APIRouter(prefix="/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    author: Optional[str] = ""
    original_language: Optional[str] = "de"

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    word_count_goal: Optional[int] = None
    daily_word_count_goal: Optional[int] = None
    deadline_date: Optional[str] = None
    volumes: Optional[List[Dict[str, Any]]] = None
    chapters_volume_mapping: Optional[Dict[str, str]] = None
    original_language: Optional[str] = None
    chapters_descriptions: Optional[Dict[str, str]] = None

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
    return StorageService.create_project(
        project.title, project.description, project.author, project.original_language
    )

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

class ReorderRequest(BaseModel):
    chapters_order: List[str]

class BackupRequest(BaseModel):
    backup_dir: str

class SearchReplaceRequest(BaseModel):
    search_term: str
    replace_term: str
    match_case: bool = False
    whole_word: bool = False

@router.delete("/{project_id}/permanent")
def permanent_delete_project(project_id: str):
    success = StorageService.permanent_delete_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found in trash")
    return {"message": "Project permanently deleted"}

@router.post("/{project_id}/reorder")
def reorder_chapters(project_id: str, data: ReorderRequest):
    success = StorageService.save_chapters_order(project_id, data.chapters_order)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found or reorder failed")
    return {"message": "Reordered successfully"}

@router.get("/{project_id}/timeline")
def get_timeline(project_id: str):
    return StorageService.load_timeline(project_id)

@router.post("/{project_id}/timeline")
def save_timeline(project_id: str, events: List[Any] = Body(...)):
    success = StorageService.save_timeline(project_id, events)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save timeline")
    return {"message": "Timeline saved successfully"}

@router.post("/backup")
def trigger_backup(data: BackupRequest):
    res = StorageService.create_backup(data.backup_dir)
    if not res["success"]:
        raise HTTPException(status_code=500, detail=res["error"])
    return res

@router.get("/{project_id}/relationships")
def get_relationships(project_id: str):
    return StorageService.load_relationships(project_id)

@router.post("/{project_id}/relationships")
def save_relationships(project_id: str, data: Dict[str, Any] = Body(...)):
    success = StorageService.save_relationships(project_id, data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save relationships")
    return {"message": "Relationships saved successfully"}

@router.get("/{project_id}/stats")
def get_project_stats(project_id: str):
    import json
    from pathlib import Path
    project_dir = Path(StorageService.BASE_DIR) / project_id
    stats_file = project_dir / "stats.json"
    if stats_file.exists():
        with open(stats_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

@router.post("/{project_id}/cloud-backup")
def trigger_cloud_backup(project_id: str):
    from backend.services.cloud import CloudService
    try:
        success = CloudService.backup_project_to_webdav(project_id)
        if success:
            return {"message": "Cloud-Backup successfully uploaded."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    raise HTTPException(status_code=500, detail="Unknown error during cloud backup.")

@router.post("/{project_id}/search-replace")
def search_replace_in_project(project_id: str, data: SearchReplaceRequest):
    chapters = StorageService.list_chapters(project_id)
    replaced_count = 0
    modified_files = 0
    
    for ch in chapters:
        chapter_id = ch["id"]
        ch_data = StorageService.get_chapter_content(project_id, chapter_id)
        if "error" in ch_data:
            continue
            
        content = ch_data.get("content", "")
        if not content:
            continue
            
        # Build Regex
        flags = 0 if data.match_case else re.IGNORECASE
        pattern_str = re.escape(data.search_term)
        
        if data.whole_word:
            pattern_str = r'\b' + pattern_str + r'\b'
            
        pattern = re.compile(pattern_str, flags)
        
        # Check if match exists
        matches = len(pattern.findall(content))
        if matches > 0:
            new_content = pattern.sub(data.replace_term, content)
            StorageService.save_chapter(project_id, chapter_id, new_content)
            replaced_count += matches
            modified_files += 1
            
    return {
        "success": True,
        "replaced_count": replaced_count,
        "modified_files": modified_files
    }
