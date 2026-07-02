import os
import sys
import webbrowser
from threading import Timer
import uvicorn

def open_browser():
    webbrowser.open("http://127.0.0.1:8000")

if __name__ == "__main__":
    # If compiled with PyInstaller, the sys._MEIPASS path contains the unpacked files.
    # We can use that to ensure the backend can find the frontend directory.
    if hasattr(sys, '_MEIPASS'):
        os.chdir(sys._MEIPASS)
        # Add current directory to path so python can find backend module
        sys.path.insert(0, sys._MEIPASS)

    print("Starte EmberNovels...")
    # Open browser after 1.5 seconds when uvicorn is running
    Timer(1.5, open_browser).start()
    
    # Run uvicorn server
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
