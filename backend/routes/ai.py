from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from backend.services.ai import AIService

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

class AICorrectionRequest(BaseModel):
    text: str
    task: str  # 'correct' (grammar/style), 'continue' (generate next paragraph)

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
