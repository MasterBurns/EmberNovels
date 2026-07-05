import subprocess
import glob
files = glob.glob("frontend/js/**/*.js", recursive=True)
for f in files:
    try:
        # We can use QuickJS or something, but node isn't here. 
        # Wait, is `jsmin` available? 
        pass
    except Exception as e:
        pass
