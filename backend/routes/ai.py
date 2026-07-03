from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from backend.services.ai import AIService
from backend.services.storage import StorageService

router = APIRouter(prefix="/ai", tags=["ai"])

class AISettingsUpdate(BaseModel):
    ai_provider: Optional[str] = None
    ollama_url: Optional[str] = None
    ollama_model: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    anthropic_model: Optional[str] = None
    auto_translate_on_save: Optional[bool] = None
    backup_enabled: Optional[bool] = None
    backup_dir: Optional[str] = None


class AICorrectionRequest(BaseModel):
    text: str
    task: str  # 'correct' (grammar/style), 'continue' (generate next paragraph)

class AIChatRequest(BaseModel):
    project_id: str
    chapter_id: str
    text_before: str
    prompt: str
    include_lore: bool
    include_chapters: bool
    include_synopsis: bool

@router.get("/settings")
def get_settings():
    return AIService.load_settings()

@router.post("/settings")
def update_settings(settings: AISettingsUpdate):
    update_data = {k: v for k, v in settings.model_dump().items() if v is not None}
    return AIService.save_settings(update_data)

@router.post("/assist")
def assistant_task(req: AICorrectionRequest):
    if not req.text.strip():
        return {"result": ""}
        
    try:
        if req.task == 'correct':
            prompt = (
                f"Du bist ein professioneller Lektor. Korrigiere die Grammatik, Rechtschreibung und "
                f"den Stil des folgenden Texts. Verbessere den Lesefluss, aber behalte die Bedeutung bei. "
                f"Gib AUSSCHLIESSLICH den korrigierten Text zurück, ohne Kommentare oder Einleitung.\n\n"
                f"Text:\n{req.text}"
            )
        elif req.task == 'continue':
            prompt = (
                f"Du bist ein kreativer Novel-Co-Autor. Schreibe den folgenden Text logisch, atmosphärisch "
                f"und spannend fort (etwa 1-2 Absätze). "
                f"Gib AUSSCHLIESSLICH den fortgeführten Text zurück (ohne den Originaltext zu wiederholen, "
                f"ohne Kommentare und ohne Einleitung).\n\n"
                f"Bisheriger Text:\n{req.text}"
            )
        else:
            raise HTTPException(status_code=400, detail="Ungültige Aufgabe.")
            
        result = AIService.generate_completion(prompt)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
def ai_chat_assistant(req: AIChatRequest):
    try:
        synopsis_text = ""
        if req.include_synopsis:
            meta = StorageService.get_project_metadata(req.project_id)
            if meta:
                synopsis_text = meta.get("description", "")

        prev_chapter_text = ""
        prev_chapter_title = ""
        if req.include_chapters:
            chapters = StorageService.list_chapters(req.project_id)
            current_idx = -1
            for idx, ch in enumerate(chapters):
                if ch.get("id") == req.chapter_id:
                    current_idx = idx
                    break
            if current_idx > 0:
                prev_ch = chapters[current_idx - 1]
                prev_ch_id = prev_ch.get("id")
                prev_chapter_title = prev_ch.get("title", "")
                content_res = StorageService.get_chapter_content(req.project_id, prev_ch_id)
                if content_res and "content" in content_res:
                    prev_chapter_text = content_res["content"]
                    # Limit preceding chapter context length
                    if len(prev_chapter_text) > 2000:
                        prev_chapter_text = "..." + prev_chapter_text[-2000:]

        matched_lore = []
        if req.include_lore:
            lore_entries = StorageService.list_lore(req.project_id)
            for entry in lore_entries:
                keywords = entry.get("keywords", [])
                name = entry.get("name", "")
                keywords_to_check = [name] + keywords
                for kw in keywords_to_check:
                    if kw and (kw.lower() in req.text_before.lower() or kw.lower() in req.prompt.lower()):
                        matched_lore.append(entry)
                        break

        # Construct final prompt
        system_prompt = (
            "Du bist ein kreativer Co-Autor für Romane. Deine Aufgabe ist es, den Text eines Kapitels "
            "anhand einer Benutzeranweisung fortzuschreiben.\n\n"
        )
        
        context_str = ""
        if req.include_synopsis and synopsis_text:
            context_str += f"### PROJEKT-SYNOPSE / ZUSAMMENFASSUNG:\n{synopsis_text}\n\n"
            
        if req.include_chapters and prev_chapter_text:
            context_str += f"### HINTERGRUND AUS DEM VORHERIGEN KAPITEL ({prev_chapter_title}):\n{prev_chapter_text}\n\n"
            
        if req.include_lore and matched_lore:
            context_str += "### RELEVANTE LORE / ENZYKLOPÄDIE-EINTRÄGE:\n"
            for entry in matched_lore:
                desc_part = entry.get("description", entry.get("short_description", ""))
                context_str += f"- **{entry['name']}** ({entry.get('category', 'Lore')}): {desc_part}\n"
            context_str += "\n"
            
        text_context = req.text_before
        if len(text_context) > 2000:
            text_context = "..." + text_context[-2000:]
            
        context_str += f"### AKTUELLER TEXT DES KAPITELS (Bisher geschrieben):\n{text_context}\n\n"
        
        prompt_message = (
            f"{context_str}"
            f"### ANWEISUNG FÜR DIE FORTSETZUNG:\n{req.prompt}\n\n"
            f"Schreibe den Text basierend auf der obigen Anweisung und dem Kontext passend fort (etwa 1-3 Absätze).\n"
            f"Behalte den Schreibstil, die Erzählperspektive und den Ton des bisherigen Texts bei.\n"
            f"Gib AUSSCHLIESSLICH den fortgeführten Text zurück (ohne Kommentare, ohne Einleitung, ohne Formatierungen wie 'Hier ist die Fortsetzung:')."
        )
        
        full_prompt = system_prompt + prompt_message
        result = AIService.generate_completion(full_prompt)
        return {"result": result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

