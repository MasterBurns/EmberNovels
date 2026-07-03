import os
import sys
import webbrowser
import threading
import tkinter as tk
from tkinter import scrolledtext
import uvicorn

# Adjust path for PyInstaller package files
if getattr(sys, 'frozen', False):
    os.chdir(sys._MEIPASS)
    sys.path.insert(0, sys._MEIPASS)

from backend.main import app

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
    webbrowser.open("http://127.0.0.1:8000")

def shutdown():
    os._exit(0)

def main():
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
    root.title("EmberNovels - Kontrollzentrum")
    root.geometry("600x400")
    root.configure(bg="#0f172a")

    title_font = ("Helvetica", 14, "bold")
    button_font = ("Helvetica", 11, "bold")
    log_font = ("Consolas", 9)

    lbl_title = tk.Label(
        root, 
        text="🔥 EmberNovels Server läuft im Hintergrund", 
        font=title_font, 
        fg="#f97316", 
        bg="#0f172a",
        pady=10
    )
    lbl_title.pack()

    btn_frame = tk.Frame(root, bg="#0f172a")
    btn_frame.pack(pady=10)

    btn_open = tk.Button(
        btn_frame, 
        text="🌐 Browser öffnen", 
        font=button_font, 
        command=open_browser,
        bg="#ea580c", 
        fg="white", 
        activebackground="#f97316", 
        activeforeground="white",
        padx=15, 
        pady=6,
        bd=0,
        cursor="hand2"
    )
    btn_open.pack(side=tk.LEFT, padx=10)

    btn_close = tk.Button(
        btn_frame, 
        text="🛑 EmberNovels beenden", 
        font=button_font, 
        command=shutdown,
        bg="#dc2626", 
        fg="white", 
        activebackground="#ef4444", 
        activeforeground="white",
        padx=15, 
        pady=6,
        bd=0,
        cursor="hand2"
    )
    btn_close.pack(side=tk.LEFT, padx=10)

    lbl_logs = tk.Label(
        root, 
        text="Server Logs:", 
        font=("Helvetica", 10), 
        fg="#94a3b8", 
        bg="#0f172a"
    )
    lbl_logs.pack(anchor="w", padx=20, pady=(10, 0))

    txt_logs = scrolledtext.ScrolledText(
        root, 
        height=12, 
        font=log_font, 
        bg="#1e293b", 
        fg="#e2e8f0", 
        insertbackground="white", 
        bd=1, 
        relief=tk.FLAT
    )
    txt_logs.pack(fill=tk.BOTH, expand=True, padx=20, pady=(5, 20))

    # Redirect stdout/stderr to ScrolledText
    redirector = LogRedirector(txt_logs)
    sys.stdout = redirector
    sys.stderr = redirector

    root.protocol("WM_DELETE_WINDOW", shutdown)

    # Auto open browser on load
    root.after(1000, open_browser)

    root.mainloop()

if __name__ == "__main__":
    main()
