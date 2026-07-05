import re
with open("frontend/js/core/events.js") as f:
    events_js = f.read()
with open("frontend/index.html") as f:
    index_html = f.read()
ids = re.findall(r"document\.getElementById\(['\"]([^'\"]+)['\"]\)", events_js)
print(f"Found {len(ids)} getElementById calls")
missing = [i for i in ids if f'id="{i}"' not in index_html and f"id='{i}'" not in index_html]
print(f"Missing: {missing}")
