import time
import uuid
import json
import re
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
    timeline_date: Optional[str] = ""
    project_ids: Optional[List[str]] = None

class LoreUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    timeline_date: Optional[str] = None
    project_ids: Optional[List[str]] = None

class LoreBulkDelete(BaseModel):
    lore_ids: List[str]

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
        lore.project_ids,
        lore.timeline_date
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

@router.delete("/bulk")
def bulk_delete_lore(project_id: str, payload: LoreBulkDelete):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    StorageService.bulk_delete_lore(project_id, payload.lore_ids)
    return {"status": "success"}

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

from backend.services.tasks import TaskManager, BackgroundTask

def _lore_scan_job(task: BackgroundTask, project_id: str, to_scan: list, scanned_chapters: list, settings: dict):
    from backend.services.ai import AIService
    from backend.services.storage import StorageService
    import json, re

    task.sub_tasks = [{"name": ch.get("title", "Unbekannt"), "status": "pending"} for ch in to_scan]

    for idx, ch in enumerate(to_scan):
        task.wait_if_paused()
        if task.is_cancelled():
            break

        task.sub_tasks[idx]["status"] = "running"

        task.update_progress(idx + 1, f"Analysiere Kapitel: {ch.get('title', 'Unbekannt')}")
        
        content_data = StorageService.get_chapter_content(project_id, ch["id"])
        text = content_data.get("content", "").strip()
        if not text:
            scanned_chapters.append(ch["id"])
            continue

        prompt = (
            "Du bist ein literarischer Analyst für Worldbuilding. Analysiere den folgenden Kapiteltext einer Geschichte. "
            "Extrahiere AUSSCHLIESSLICH WICHTIGE Charaktere (category: character), Orte (category: location) "
            "und Gegenstände (category: item), die im Text vorkommen.\n\n"
            "REGELN:\n"
            "- Ignoriere unwichtige Nebenfiguren (z.B. Komparsen ohne Namen, die nur in Nebensätzen vorkommen).\n"
            "- Ignoriere Orte, die keine echte Rolle spielen oder nur als flüchtige Richtungsangabe dienen.\n"
            "- Bewerte die Wichtigkeit jedes Eintrags zwingend mit einem 'relevance_score' von 1 (völlig unwichtig) bis 10 (Hauptcharakter/Hauptort).\n\n"
            "Gib das Ergebnis AUSSCHLIESSLICH im folgenden JSON-Format zurück. "
            "Keine Einleitung, keine Kommentare, kein Markdown außer dem JSON selbst:\n"
            "[\n  {\n    \"name\": \"Name der Entität\",\n    \"category\": \"character\",\n    \"short_description\": \"1-2 Sätze Kurzbeschreibung\",\n    \"description\": \"Ausführliche Beschreibung basierend auf dem Text\",\n    \"keywords\": [\"Alias\", \"Variationen\", \"Name\"],\n    \"relevance_score\": 8\n  }\n]\n\n"
            f"Kapiteltext:\n{text}"
        )

        try:
            raw_res = AIService.generate_completion(prompt)
            cleaned = raw_res.strip()
            
            # Robust JSON extraction: Find the first [ or { and the last ] or }
            start_idx = -1
            end_idx = -1
            
            # Look for JSON array or object
            match_array = re.search(r'\[.*\]', cleaned, re.DOTALL)
            match_obj = re.search(r'\{.*\}', cleaned, re.DOTALL)
            
            if match_array:
                cleaned = match_array.group(0)
            elif match_obj:
                cleaned = f"[{match_obj.group(0)}]"
            
            entities = json.loads(cleaned)
            
            # If it's a dict with an 'entities' key (common fallback)
            if isinstance(entities, dict) and "entities" in entities:
                entities = entities["entities"]
            elif isinstance(entities, dict):
                entities = [entities]

            existing_lore = {e["name"].lower(): e for e in StorageService.list_lore(project_id)}

            for ent in entities:
                # Nur relevante Einträge übernehmen
                score = ent.get("relevance_score", 0)
                if score < 5:
                    continue
                name_key = ent.get("name", "").lower()
                if not name_key:
                    continue
                    
                if name_key not in existing_lore:
                    new_ent = StorageService.create_lore(
                        project_id=project_id,
                        name=ent.get("name", ""),
                        category=ent.get("category", "lore"),
                        short_description=ent.get("short_description", ""),
                        description=ent.get("description", ""),
                        keywords=ent.get("keywords", [])
                    )
                    existing_lore[name_key] = new_ent

            task.sub_tasks[idx]["status"] = "completed"
        except json.JSONDecodeError as e:
            task.sub_tasks[idx]["status"] = "failed"
            print(f"JSON Parse Fehler bei Kapitel {ch['id']}: {e}\nRaw Response:\n{raw_res}")
        except Exception as e:
            task.sub_tasks[idx]["status"] = "failed"
            print(f"Fehler bei Lore-Extrahierung für Kapitel {ch['id']}: {e}")
            import traceback
            traceback.print_exc()

        scanned_chapters.append(ch["id"])
        
        # Save project metadata progress after every chapter
        meta = StorageService.get_project_metadata(project_id)
        if meta:
            meta["scanned_chapters"] = scanned_chapters
            StorageService.update_project_metadata(project_id, meta)
            
        task.sleep_delay() # Rate limit


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

    task = TaskManager.create_task("KI Lore Scan", len(to_scan), _lore_scan_job, (project_id, to_scan, scanned_chapters, settings))
    
    # Optional: fetch user limits from settings
    ai_batch_limit = int(settings.get("ai_batch_limit", 10))
    ai_rate_limit = float(settings.get("ai_rate_limit", 2.0))
    task.batch_limit = ai_batch_limit
    task.delay_between_steps = ai_rate_limit
    
    task.start()
    return {"message": f"Scan gestartet. {len(to_scan)} Kapitel werden im Hintergrund verarbeitet.", "task_id": task.id}

@router.post("/auto-scan/reset")
def reset_lore_scan(project_id: str):
    from backend.services.storage import StorageService
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")
    meta["scanned_chapters"] = []
    StorageService.update_project_metadata(project_id, meta)
    return {"message": "Der Scan-Fortschritt wurde zurückgesetzt. Alle Kapitel können nun neu gescannt werden."}

@router.post("/scan-chapter/{chapter_id}")
def scan_single_chapter(project_id: str, chapter_id: str):
    meta = StorageService.get_project_metadata(project_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Project not found")

    chapters = StorageService.list_chapters(project_id)
    ch = next((c for c in chapters if c["id"] == chapter_id), None)
    if not ch:
        raise HTTPException(status_code=404, detail="Chapter not found")

    from backend.services.ai import AIService
    settings = AIService.load_settings()
    if settings.get("ai_provider", "none") == "none":
        raise HTTPException(
            status_code=400, 
            detail="Kein aktiver KI-Anbieter konfiguriert."
        )

    scanned_chapters = meta.get("scanned_chapters", [])
    task = TaskManager.create_task(f"KI Scan: {ch.get('title', chapter_id)}", 1, _lore_scan_job, (project_id, [ch], scanned_chapters, settings))
    task.start()
    return {"message": f"Scan für {ch.get('title', chapter_id)} gestartet.", "task_id": task.id}
