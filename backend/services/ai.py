import os
import json
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, Any, Optional

class AIService:
    @classmethod
    def get_settings_file(cls) -> Path:
        config_dir = Path("projects")
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / "ai_settings.json"

    @classmethod
    def load_settings(cls) -> Dict[str, Any]:
        file_path = cls.get_settings_file()
        if not file_path.exists():
            return {
                "ai_provider": "none",
                "ollama_url": "http://localhost:11434",
                "ollama_model": "llama3",
                "gemini_api_key": "",
                "gemini_model": "gemini-1.5-flash",
                "openai_api_key": "",
                "openai_model": "gpt-4o-mini",
                "anthropic_api_key": "",
                "anthropic_model": "claude-3-5-sonnet",
                "auto_translate_on_save": True,
                "backup_enabled": False,
                "backup_dir": ""

            }
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}

    @classmethod
    def save_settings(cls, settings: Dict[str, Any]) -> Dict[str, Any]:
        file_path = cls.get_settings_file()
        current = cls.load_settings()
        current.update(settings)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(current, f, indent=4, ensure_ascii=False)
        return current

    @classmethod
    def _safe_urlopen(cls, req: urllib.request.Request, timeout: int = 30) -> Any:
        import ssl
        import urllib.error
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.URLError as e:
            reason_str = str(e.reason)
            if "CERTIFICATE_VERIFY_FAILED" in reason_str or "certificate verify failed" in reason_str:
                print("SSL certificate verification failed. Retrying with unverified context...")
                ctx = ssl._create_unverified_context()
                return urllib.request.urlopen(req, timeout=timeout, context=ctx)
            raise e

    @classmethod
    def translate_text(cls, text: str, target_lang: str) -> str:
        """
        Translates text using the configured AI provider, falling back to the free Google Translate API.
        """
        if not text.strip():
            return text
            
        settings = cls.load_settings()
        provider = settings.get("ai_provider", "none")
        
        if provider == "none":
            return cls._translate_free_google(text, target_lang)
            
        try:
            prompt = (
                f"Du bist ein professioneller Literaturübersetzer. Übersetze den folgenden Text "
                f"in die Zielsprache '{target_lang}'. Behalte den Stil, Tonfall und Absätze des Originals bei. "
                f"Gib AUSSCHLIESSLICH den übersetzten Text zurück, ohne Kommentare oder Einleitung.\n\n"
                f"Originaltext:\n{text}"
            )
            return cls.generate_completion(prompt)
        except Exception as e:
            print(f"AI translation failed, falling back to Google Translate: {e}")
            return cls._translate_free_google(text, target_lang)

    @classmethod
    def generate_completion(cls, prompt: str) -> str:
        """Sends a prompt to the active AI provider."""
        settings = cls.load_settings()
        provider = settings.get("ai_provider", "none")
        
        if provider == "ollama":
            return cls._call_ollama(settings, prompt)
        elif provider == "gemini":
            return cls._call_gemini(settings, prompt)
        elif provider == "openai":
            return cls._call_openai(settings, prompt)
        elif provider == "anthropic":
            return cls._call_anthropic(settings, prompt)
        else:
            raise ValueError("Kein aktiver KI-Anbieter konfiguriert.")

    @classmethod
    def _call_ollama(cls, settings: Dict[str, Any], prompt: str) -> str:
        url = f"{settings.get('ollama_url', 'http://localhost:11434')}/api/generate"
        payload = {
            "model": settings.get("ollama_model", "llama3"),
            "prompt": prompt,
            "stream": False
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with cls._safe_urlopen(req, timeout=30) as response:
            res = json.loads(response.read().decode('utf-8'))
            return res.get("response", "").strip()

    @classmethod
    def _call_gemini(cls, settings: Dict[str, Any], prompt: str) -> str:
        api_key = settings.get("gemini_api_key", "")
        if not api_key:
            raise ValueError("Gemini API-Key fehlt.")
            
        model = settings.get("gemini_model", "gemini-1.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with cls._safe_urlopen(req, timeout=30) as response:
            res = json.loads(response.read().decode('utf-8'))
            return res['candidates'][0]['content']['parts'][0]['text'].strip()

    @classmethod
    def _call_openai(cls, settings: Dict[str, Any], prompt: str) -> str:
        api_key = settings.get("openai_api_key", "")
        if not api_key:
            raise ValueError("OpenAI API-Key fehlt.")
            
        model = settings.get("openai_model", "gpt-4o-mini")
        url = "https://api.openai.com/v1/chat/completions"
        
        payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            }
        )
        with cls._safe_urlopen(req, timeout=30) as response:
            res = json.loads(response.read().decode('utf-8'))
            return res['choices'][0]['message']['content'].strip()

    @classmethod
    def _call_anthropic(cls, settings: Dict[str, Any], prompt: str) -> str:
        api_key = settings.get("anthropic_api_key", "")
        if not api_key:
            raise ValueError("Anthropic API-Key fehlt.")
            
        model = settings.get("anthropic_model", "claude-3-5-sonnet")
        url = "https://api.anthropic.com/v1/messages"
        
        payload = {
            "model": model,
            "max_tokens": 4000,
            "messages": [
                {"role": "user", "content": prompt}
            ]
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01'
            }
        )
        with cls._safe_urlopen(req, timeout=30) as response:
            res = json.loads(response.read().decode('utf-8'))
            return res['content'][0]['text'].strip()

    @classmethod
    def _translate_free_google(cls, text: str, target_lang: str) -> str:
        """
        Translates text block by block using the free web Google Translate API.
        """
        translated_paragraphs = []
        paragraphs = text.split('\n')
        
        for p in paragraphs:
            if not p.strip():
                translated_paragraphs.append("")
                continue
                
            try:
                # Format parameters for HTTP request
                encoded_text = urllib.parse.quote(p)
                url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={target_lang}&dt=t&q={encoded_text}"
                
                req = urllib.request.Request(
                    url,
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                )
                
                with cls._safe_urlopen(req, timeout=10) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    translated_p = "".join([sentence[0] for sentence in data[0] if sentence[0]])
                    translated_paragraphs.append(translated_p)
            except Exception as e:
                print(f"Free translate failed for paragraph: {e}")
                translated_paragraphs.append(p)
                
        return "\n".join(translated_paragraphs)
