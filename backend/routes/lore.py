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

def _lore_scan_job(task: BackgroundTask, project_id: str, to_scan: list, scanned_chapters: list, settings: dict, project_settings: dict = None):
    from backend.services.ai import AIService
    from backend.services.storage import StorageService
    import json, re, time, uuid
    
    if project_settings is None:
        project_settings = {}
        
    extract_timeline = project_settings.get("lore_extract_timeline", True)
    auto_translate_lore = project_settings.get("lore_auto_translate", False)

    task.sub_tasks = [{"name": ch.get("title", "Unbekannt"), "status": "pending"} for ch in to_scan]

    # Load existing lore once initially, we will update it as we create new ones
    existing_lore_map = StorageService.get_all_lore_names_mapping(project_id)

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

        # Prepare context data
        existing_names = list(existing_lore_map.keys())
        known_lore_text = ", ".join(existing_names) if existing_names else "Keine"
        
        last_date = "Noch keine Ereignisse"
        if extract_timeline:
            current_timeline = StorageService.load_timeline(project_id)
            if current_timeline:
                last_date = current_timeline[-1].get("date", "Unbekannt")

        prompt = (
            "Du bist ein literarischer Analyst für Worldbuilding. Analysiere den folgenden Kapiteltext einer Geschichte. "
            "Extrahiere AUSSCHLIESSLICH WICHTIGE Charaktere (category: character), Orte (category: location) "
            "und Gegenstände (category: item), die im Text vorkommen.\n\n"
        )
        if extract_timeline:
            prompt += (
                "ZUSÄTZLICH extrahiere alle wichtigen chronologischen Ereignisse (timeline_events). "
                f"Das letzte bekannte Datum in der Geschichte war: '{last_date}'. "
                "Schätze die Zeitangaben für neue Ereignisse relativ zu diesem Punkt, falls möglich.\n\n"
            )
            
        prompt += (
            "REGELN:\n"
            "- Ignoriere unwichtige Nebenfiguren (z.B. Komparsen ohne Namen, die nur in Nebensätzen vorkommen).\n"
            "- Ignoriere Orte, die keine echte Rolle spielen oder nur als flüchtige Richtungsangabe dienen.\n"
            "- Extrahiere KEINE generischen Alltagsgegenstände (wie Autos, Uhren, Dächer, Einkaufslisten). Extrahiere NUR Gegenstände, Orte und Figuren, die einzigartig, plot-relevant oder Eigennamen sind (wie z.B. 'Das Schwert des Schicksals' oder 'Hauptquartier').\n"
            "- Bewerte die Wichtigkeit jedes Lore-Eintrags zwingend mit einem 'relevance_score' von 1 (völlig unwichtig) bis 10 (Hauptcharakter/Hauptort).\n"
            "- WICHTIG: Schreibe den 'name' der Entität IMMER auf Deutsch, selbst wenn der Text in einer anderen Sprache ist.\n"
            f"- WICHTIG: Hier ist eine Liste bereits bekannter Entitäten in diesem Projekt: [{known_lore_text}]. "
            "Wenn die Person, der Ort oder der Gegenstand im Text zu einem dieser Namen passt (auch wenn er leicht anders geschrieben wird), benutze zwingend EXAKT den bereits bekannten Namen!\n\n"
            "Gib das Ergebnis AUSSCHLIESSLICH im folgenden JSON-Format zurück. "
            "Keine Einleitung, keine Kommentare, kein Markdown außer dem JSON selbst:\n"
            "{\n"
            "  \"entities\": [\n"
            "    {\n"
            "      \"name\": \"Name der Entität\",\n"
            "      \"category\": \"character\",\n"
            "      \"short_description\": \"1-2 Sätze Kurzbeschreibung\",\n"
            "      \"description\": \"Ausführliche Beschreibung basierend auf dem Text\",\n"
            "      \"keywords\": [\"Alias\", \"Variationen\", \"Name\"],\n"
            "      \"relevance_score\": 8\n"
            "    }\n"
            "  ]"
        )
        if extract_timeline:
            prompt += (
                ",\n  \"timeline_events\": [\n"
                "    {\n"
                "      \"date\": \"Geschätzter Zeitpunkt relativ zum letzten bekannten Datum (z.B. 'Tag 2', '3 Wochen später', '2024-05-03')\",\n"
                "      \"description\": \"Kurze Beschreibung des Ereignisses im Kapitel\"\n"
                "    }\n"
                "  ]\n"
            )
        prompt += (
            "}\n\n"
            f"Kapiteltext:\n{text}"
        )

        try:
            raw_res = AIService.generate_completion(prompt)
            cleaned = raw_res.strip()
            
            match_obj = re.search(r'\{.*\}', cleaned, re.DOTALL)
            match_array = re.search(r'\[.*\]', cleaned, re.DOTALL)
            
            if match_obj:
                cleaned = match_obj.group(0)
            elif match_array:
                cleaned = match_array.group(0)
            
            parsed = json.loads(cleaned)
            
            entities = []
            timeline_events = []
            
            if isinstance(parsed, list):
                entities = parsed
            elif isinstance(parsed, dict):
                entities = parsed.get("entities", [])
                timeline_events = parsed.get("timeline_events", [])

            for ent in entities:
                score = ent.get("relevance_score", 0)
                # Erhöht auf 7 um generischen Müll zu filtern
                if score < 7:
                    continue
                name_key = ent.get("name", "").lower()
                if not name_key:
                    continue
                    
                if name_key not in existing_lore_map:
                    new_ent = StorageService.create_lore(
                        project_id=project_id,
                        name=ent.get("name", ""),
                        category=ent.get("category", "lore"),
                        short_description=ent.get("short_description", ""),
                        description=ent.get("description", ""),
                        keywords=ent.get("keywords", [])
                    )
                    existing_lore_map[name_key] = new_ent["id"]
                    
                    if auto_translate_lore:
                        _auto_translate_lore_sync(project_id, new_ent, settings)

            if extract_timeline and timeline_events:
                # current_timeline was already loaded before the prompt
                for event in timeline_events:
                    event["id"] = str(uuid.uuid4())
                    event["chapter_id"] = ch["id"]
                    event["created_at"] = time.time()
                    event["title"] = event.get("description", "Ereignis")[:50] + "..."
                    current_timeline.append(event)
                StorageService.save_timeline(project_id, current_timeline)

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
    
    project_settings = meta.get("settings", {})
    if project_settings.get("lore_scan_standard_only", True):
        to_scan = [ch for ch in to_scan if ch.get("chapter_type", "standard") == "standard"]
    
    if not to_scan:
        return {"message": "Keine neuen Kapitel zum Scannen vorhanden.", "scanned_chapters_count": 0, "created_entries": []}

    task = TaskManager.create_task("KI Lore Scan", len(to_scan), _lore_scan_job, (project_id, to_scan, scanned_chapters, settings, project_settings))
    
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

    project_settings = meta.get("settings", {})
    scanned_chapters = meta.get("scanned_chapters", [])
    task = TaskManager.create_task(f"KI Scan: {ch.get('title', chapter_id)}", 1, _lore_scan_job, (project_id, [ch], scanned_chapters, settings, project_settings))
    task.start()
    return {"message": f"Scan für {ch.get('title', chapter_id)} gestartet.", "task_id": task.id}


def _auto_translate_lore_sync(project_id: str, base_ent: dict, settings: dict):
    from backend.services.ai import AIService
    from backend.services.storage import StorageService
    import json, re
    
    supported_langs = ["en", "de", "fr", "es", "it", "ja", "zh"]
    # We don't know the base language of the project here explicitly unless we fetch it, 
    # but we can just translate to all 7 and let the UI pick. 
    # Actually, translating to all 7 is what the user requested: "in alle 7 versionennmit _Sprache"
    
    for lang in supported_langs:
        prompt = (
            f"Translate the following lore entry into the language with code '{lang}'. "
            "Return ONLY valid JSON with the exact same keys but translated values for "
            "'name', 'short_description', 'description', and 'keywords'. Do not translate 'category' or 'relevance_score'.\n\n"
            f"Lore Entry: {json.dumps(base_ent, ensure_ascii=False)}"
        )
        try:
            raw_res = AIService.generate_completion(prompt)
            match_obj = re.search(r'\{.*\}', raw_res.strip(), re.DOTALL)
            if match_obj:
                translated_ent = json.loads(match_obj.group(0))
                
                # Merge original non-translatable fields just in case
                final_ent = base_ent.copy()
                final_ent.update(translated_ent)
                final_ent["id"] = base_ent["id"]
                
                StorageService.save_translated_lore(project_id, lang, base_ent["id"], final_ent)
        except Exception as e:
            print(f"Failed to translate lore entry {base_ent['id']} to {lang}: {e}")
