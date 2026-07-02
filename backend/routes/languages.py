from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List
from backend.services.storage import StorageService

router = APIRouter(prefix="/projects/{project_id}/languages", tags=["languages"])

class LanguageCreate(BaseModel):
    lang_code: str  # e.g., 'en', 'fr', 'es'

class ChapterTranslationSave(BaseModel):
    content: str

@router.get("")
def list_languages(project_id: str):
    """List all translation branches for a project."""
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return StorageService.list_languages(project_id)

@router.post("")
def create_language_branch(project_id: str, payload: LanguageCreate, background_tasks: BackgroundTasks):
    """
    Create a new translation branch and auto-translate existing chapters in the background.
    """
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    
    lang = payload.lang_code.strip().lower()
    if not lang or len(lang) > 5:
        raise HTTPException(status_code=400, detail="Ungültiger Sprachcode (z.B. 'en', 'es')")
        
    active_langs = StorageService.list_languages(project_id)
    if lang in active_langs:
        raise HTTPException(status_code=400, detail="Dieser Sprachzweig existiert bereits")
        
    # Trigger translations in background so the user doesn't wait forever
    background_tasks.add_task(StorageService.create_language_branch, project_id, lang)
    
    return {"message": f"Sprachzweig '{lang}' wird im Hintergrund angelegt und übersetzt."}

@router.get("/{lang_code}/chapters/{chapter_id}")
def get_translated_chapter(project_id: str, lang_code: str, chapter_id: str):
    """Get the markdown content of a translated chapter."""
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
        
    # Check if branch exists
    active_langs = StorageService.list_languages(project_id)
    if lang_code not in active_langs:
        raise HTTPException(status_code=404, detail="Sprachzweig nicht gefunden")
        
    return StorageService.get_translated_chapter(project_id, lang_code, chapter_id)

@router.post("/{lang_code}/chapters/{chapter_id}")
def save_translated_chapter(project_id: str, lang_code: str, chapter_id: str, payload: ChapterTranslationSave):
    """Save manual overrides or edits to a translated chapter."""
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
        
    active_langs = StorageService.list_languages(project_id)
    if lang_code not in active_langs:
        raise HTTPException(status_code=404, detail="Sprachzweig nicht gefunden")
        
    StorageService.save_translated_chapter(project_id, lang_code, chapter_id, payload.content)
    return {"message": "Übersetzung erfolgreich gespeichert."}

@router.post("/{lang_code}/chapters/{chapter_id}/translate")
def translate_chapter_now(project_id: str, lang_code: str, chapter_id: str):
    """
    Manually trigger re-translation of a specific chapter from the primary language to the target branch.
    """
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
        
    ch_data = StorageService.get_chapter_content(project_id, chapter_id)
    if "error" in ch_data:
        raise HTTPException(status_code=404, detail="Originalkapitel nicht gefunden")
        
    from backend.services.ai import AIService
    translated_content = AIService.translate_text(ch_data['content'], lang_code)
    
    StorageService.save_translated_chapter(project_id, lang_code, chapter_id, translated_content)
    
    return {"id": chapter_id, "content": translated_content}
