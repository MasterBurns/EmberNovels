import os
import sys
import webbrowser
import threading
import tkinter as tk
from tkinter import scrolledtext
import uvicorn
import logging
import base64
import json

def get_version():
    try:
        if getattr(sys, 'frozen', False):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(base_dir, 'version.json'), 'r', encoding='utf-8') as f:
            return json.load(f).get('version', 'Unknown')
    except Exception:
        return "Unknown"
import json

# Adjust path for PyInstaller package files
if getattr(sys, 'frozen', False):
    os.chdir(sys._MEIPASS)
    sys.path.insert(0, sys._MEIPASS)

from backend.main import app

class TkinterLogHandler(logging.Handler):
    def __init__(self, text_widget):
        super().__init__()
        self.text_widget = text_widget

    def emit(self, record):
        try:
            msg = self.format(record) + '\n'
            self.text_widget.insert(tk.END, msg)
            self.text_widget.see(tk.END)
        except Exception:
            pass

class LogRedirector:
    def __init__(self, text_widget):
        self.text_widget = text_widget

    def write(self, string):
        # Thread-safe GUI insertion
        try:
            self.text_widget.insert(tk.END, string)
            self.text_widget.see(tk.END)
        except Exception:
            pass

    def flush(self):
        pass

def start_server():
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)

def open_browser():
    # Restore original environment library path to prevent PyInstaller's
    # bundled readline/library conflict from breaking Unix shell execution.
    old_ld_path = os.environ.get("LD_LIBRARY_PATH")
    if "LD_LIBRARY_PATH_ORIG" in os.environ:
        os.environ["LD_LIBRARY_PATH"] = os.environ["LD_LIBRARY_PATH_ORIG"]
    else:
        os.environ.pop("LD_LIBRARY_PATH", None)
        
    try:
        webbrowser.open("http://127.0.0.1:8000")
    finally:
        if old_ld_path is not None:
            os.environ["LD_LIBRARY_PATH"] = old_ld_path

def shutdown():
    os._exit(0)


def get_ui_language():
    import json, sys
    if getattr(sys, 'frozen', False):
        settings_path = os.path.join(sys._MEIPASS, "settings.json")
    else:
        settings_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('ui_language', 'de')
        except:
            pass
    return 'de'

UI_TEXT = {
    'de': {'browser': '🌐 Browser öffnen', 'stop': '🛑 Beenden', 'logs': 'Server Logs:'},
    'en': {'browser': '🌐 Open Browser', 'stop': '🛑 Stop Server', 'logs': 'Server Logs:'},
    'es': {'browser': '🌐 Abrir Navegador', 'stop': '🛑 Detener Servidor', 'logs': 'Registros del Servidor:'},
    'fr': {'browser': '🌐 Ouvrir le Navigateur', 'stop': '🛑 Arrêter le Serveur', 'logs': 'Journaux du Serveur:'},
    'it': {'browser': '🌐 Apri Browser', 'stop': '🛑 Ferma il Server', 'logs': 'Log del Server:'},
    'ja': {'browser': '🌐 ブラウザを開く', 'stop': '🛑 サーバーを停止', 'logs': 'サーバーログ:'},
    'zh': {'browser': '🌐 打开浏览器', 'stop': '🛑 停止服务器', 'logs': '服务器日志:'}
}

def main():
    ui_lang = get_ui_language()
    texts = UI_TEXT.get(ui_lang, UI_TEXT['de'])

    # Clean up old Unix binary after update hotswap
    if getattr(sys, 'frozen', False):
        old_exe_path = sys.executable + ".old"
        if os.path.exists(old_exe_path):
            try:
                os.remove(old_exe_path)
            except Exception:
                pass

    # Start Uvicorn in daemon thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Create GUI Control Window
    root = tk.Tk()
    root.title("EmberNovels Kontrollzentrum" if ui_lang == "de" else "EmberNovels Control Center")
    root.geometry("600x400")
    root.configure(bg="#0f172a")

    # Set window taskbar icon (base64 transparent flame logo)
    try:
        icon_data = """iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5wcIDg4nKy6rLwAAA4VJREFUWMPtlr1vG0cUhX/z7s7ukpRIihIlO7YTK3YSO3bsFnZTx02B/JcEadOkSJEiRYEiRYECRYECRYECRYoCbYECbYoURYoCBdqkKJAiRYD8kyB27NiWFSdRYu8ud4fFiqIkUuQnCdBv8zEcDme++753HhnhP/1jRPlj98fuf/qEa7oPAB4Cj4D7wFe0n+FhX2j/k91wP0qN6cOq2fT+1t7V/gHwAPgJ+GmtH9b5KLu/NqP2F9o/1/4l8BjoXUeD2v5F7X/eDfuwVdZ/oP1O+/vAnwTfQ+AR0M97sH/eDfej1D9hVvt7tN/hR8Ad4K/1aFDbn7Z/uBv2Ya2s/0j7nfa/AHcInoTAA6BfD2H/vBvuR6mF2t/Tfod9D9wE7hB4BPTL/qBf9of7UerLtL+t/V3gfWD4g+AfAA+ARwR/F/if9vcI/l3tP9D+L4EvgN/nEXgdAheAj2m/uRvuh9TvaL+v/S+BPwR/TPA94G/grwXeI3ifwG1gn/Zrux9Sv6X9jvYd8DXwF4H3aL+j/Sbtx+6H1G9pv6N9C9wncB94h8A9gn8l8B/ad2m/tvsh9Rva72i/Tvs12r8EHtH+LcAftL9D+7H7Ieq3td/RfoN2N2k/dD+k3a16h/Y/af+V9ku0e0T7W4BnwL8I/AXtz9B+aE7f+hHth/R6h+2H7n/kftNuhux2t+h/U/+n+h/V/y/1d6p/6R7tHqT/7S6g20W3y+5/uz/5P+5e1X2j+0f3B/c/vGv+b+8H93+6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/dve6XfS76XbZ/Zpujz41/9Ld/911/lX3f3a/vB88DB6Y8WH2gd43bO23xoK376dWD7V61OpR+zPmn07vUdBn+Rfwv1jP/r8j/qfs/a8YuAN43g3g+QSex8HzIHju075P+z7t+/8C8NwLnofFs1I8K8Wz0r9SPA6PG/4fgJoT2Fv4W4kAAAAASUVORK5CYII="""
        img = tk.PhotoImage(data=icon_data)
        root.iconphoto(True, img)
    except Exception as e:
        print(f"Failed to set window icon: {e}")

    app_version = get_version()

    title_font = ("Helvetica", 16, "bold")
    button_font = ("Helvetica", 11, "bold")
    log_font = ("Consolas", 9)

    # Header frame for modern layout
    header_frame = tk.Frame(root, bg="#0f172a", pady=15)
    header_frame.pack(fill=tk.X)

    lbl_title = tk.Label(
        header_frame, 
        text="🔥 EmberNovels Server", 
        font=title_font, 
        fg="#f97316", 
        bg="#0f172a"
    )
    lbl_title.pack()

    lbl_version = tk.Label(
        header_frame,
        text=f"Version {app_version}",
        font=("Helvetica", 10),
        fg="#94a3b8",
        bg="#0f172a"
    )
    lbl_version.pack(pady=(2, 0))

    btn_frame = tk.Frame(root, bg="#0f172a")
    btn_frame.pack(pady=10)

    btn_open = tk.Button(
        btn_frame, 
        text=texts["browser"], 
        font=button_font, 
        command=open_browser,
        bg="#ea580c", 
        fg="white", 
        activebackground="#f97316", 
        activeforeground="white",
        padx=20, 
        pady=8,
        bd=0,
        cursor="hand2"
    )
    btn_open.pack(side=tk.LEFT, padx=10)

    btn_close = tk.Button(
        btn_frame, 
        text=texts["stop"], 
        font=button_font, 
        command=shutdown,
        bg="#1e293b", 
        fg="#e2e8f0", 
        activebackground="#334155", 
        activeforeground="white",
        padx=20, 
        pady=8,
        bd=0,
        cursor="hand2"
    )
    btn_close.pack(side=tk.LEFT, padx=10)

    lbl_logs = tk.Label(
        root, 
        text=texts["logs"], 
        font=("Helvetica", 10, "bold"), 
        fg="#94a3b8", 
        bg="#0f172a"
    )
    lbl_logs.pack(anchor="w", padx=20, pady=(10, 0))

    txt_logs = scrolledtext.ScrolledText(
        root, 
        height=14, 
        font=log_font, 
        bg="#1e293b", 
        fg="#cbd5e1", 
        insertbackground="white", 
        bd=0, 
        relief=tk.FLAT,
        padx=10,
        pady=10
    )
    txt_logs.pack(fill=tk.BOTH, expand=True, padx=20, pady=(5, 20))

    # Redirect stdout/stderr to ScrolledText
    redirector = LogRedirector(txt_logs)
    sys.stdout = redirector
    sys.stderr = redirector

    # Configure custom logging handler for Python / Uvicorn logger streams
    log_handler = TkinterLogHandler(txt_logs)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', '%H:%M:%S')
    log_handler.setFormatter(formatter)
    
    # Also add a file handler so we have a persistent log
    log_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "embernovels_server.log")
    file_handler = logging.FileHandler(log_file_path, mode="w", encoding="utf-8")
    file_handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(log_handler)
    root_logger.addHandler(file_handler)

    for logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        logger = logging.getLogger(logger_name)
        logger.addHandler(log_handler)
        logger.propagate = False

    root.protocol("WM_DELETE_WINDOW", shutdown)

    # Auto open browser on load (unless disabled via flag)
    if "--no-browser" not in sys.argv:
        root.after(1000, open_browser)

    root.mainloop()

if __name__ == "__main__":
    main()
