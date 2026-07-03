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
    project_ids: Optional[List[str]] = None

class LoreUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    project_ids: Optional[List[str]] = None

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
        lore.keywords,
        lore.project_ids
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

import json
import re

@router.post("/auto-scan")
def auto_scan_lore(project_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
        
    from backend.services.ai import AIService
    settings = AIService.load_settings()
    if settings.get("ai_provider", "none") == "none":
        raise HTTPException(
            status_code=400, 
            detail="Kein aktiver KI-Anbieter konfiguriert. Bitte richte einen Anbieter in den Einstellungen ein."
        )
        
    scanned_chapters = meta.get("scanned_chapters", [])
    chapters = StorageService.list_chapters(project_id)
    to_scan = [ch for ch in chapters if ch["id"] not in scanned_chapters]
    
    if not to_scan:
        return {"message": "Keine neuen Kapitel zum Scannen vorhanden.", "scanned_chapters_count": 0, "created_entries": []}
        
    created_entries = []
    
    for ch in to_scan:
        content_data = StorageService.get_chapter_content(project_id, ch["id"])
        text = content_data.get("content", "").strip()
        if not text:
            scanned_chapters.append(ch["id"])
            continue
            
        prompt = (
            "Du bist ein literarischer Analyst. Analysiere den folgenden Kapiteltext einer Geschichte. "
            "Extrahiere alle wichtigen Charaktere (category: character), Orte (category: location) "
            "und Gegenstände (category: item), die im Text vorkommen.\n\n"
            "Gib das Ergebnis AUSSCHLIESSLICH im folgenden JSON-Format zurück. "
            "Keine Einleitung, keine Kommentare, kein Markdown außer dem JSON selbst:\n"
            "[\n"
            "  {\n"
            "    \"name\": \"Name der Entität\",\n"
            "    \"category\": \"character\",\n"
            "    \"short_description\": \"1-2 Sätze Kurzbeschreibung\",\n"
            "    \"description\": \"Ausführliche Beschreibung basierend auf dem Text\",\n"
            "    \"keywords\": [\"Alias\", \"Variationen\", \"Name\"]\n"
            "  }\n"
            "]\n\n"
            f"Kapiteltext:\n{text}"
        )
        
        try:
            raw_res = AIService.generate_completion(prompt)
            cleaned = raw_res.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```(?:json)?\n", "", cleaned)
                cleaned = re.sub(r"\n```$", "", cleaned)
                cleaned = cleaned.strip()
                
            entities = json.loads(cleaned)
            
            # Load existing lore to prevent duplicates
            existing_lore = {e["name"].lower(): e for e in StorageService.list_lore(project_id)}
            
            for ent in entities:
                name = ent.get("name", "").strip()
                category = ent.get("category", "lore").strip()
                short_desc = ent.get("short_description", "").strip()
                long_desc = ent.get("description", "").strip()
                keywords = ent.get("keywords", [])
                
                if not name or category not in ["character", "location", "item", "lore"]:
                    continue
                    
                if name.lower() not in existing_lore:
                    created = StorageService.create_lore(
                        project_id=project_id,
                        name=name,
                        category=category,
                        short_description=short_desc,
                        description=long_desc,
                        keywords=keywords
                    )
                    created_entries.append(created)
                    
            scanned_chapters.append(ch["id"])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Fehler beim KI-Scan für Kapitel {ch['title']}: {str(e)}")
            
    StorageService.update_project_metadata(project_id, {"scanned_chapters": scanned_chapters})
    
    return {
        "message": f"{len(to_scan)} Kapitel erfolgreich gescannt. {len(created_entries)} neue Einträge erstellt.",
        "scanned_chapters_count": len(to_scan),
        "created_entries": created_entries
    }
