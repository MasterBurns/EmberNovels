import os
import json
import shutil
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from backend.config import PROJECTS_DIR

def sanitize_filename(filename: str) -> str:
    """Sanitizes a string to be a safe folder/file name."""
    # Replace spaces with underscores, remove non-alphanumeric characters
    s = re.sub(r'[^\w\s-]', '', filename).strip().replace(' ', '_')
    return re.sub(r'[-\s]+', '_', s).lower()

class StorageService:
    @staticmethod
    def get_projects_dir() -> Path:
        PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
        return PROJECTS_DIR

    @staticmethod
    def get_trash_dir() -> Path:
        trash = PROJECTS_DIR / ".trash"
        trash.mkdir(parents=True, exist_ok=True)
        return trash

    @classmethod
    def list_projects(cls) -> List[Dict[str, Any]]:
        """List all active (non-deleted) projects."""
        projects_dir = cls.get_projects_dir()
        projects = []
        
        for p_dir in projects_dir.iterdir():
            if p_dir.is_dir() and not p_dir.name.startswith('.'):
                meta_path = p_dir / "project.json"
                if meta_path.exists():
                    try:
                        with open(meta_path, 'r', encoding='utf-8') as f:
                            meta = json.load(f)
                            # Ensure id is in metadata
                            meta['id'] = p_dir.name
                            projects.append(meta)
                    except Exception as e:
                        # Log error or skip corrupted project files
                        pass
        return sorted(projects, key=lambda x: x.get('updated_at', ''), reverse=True)

    @classmethod
    def list_trashed_projects(cls) -> List[Dict[str, Any]]:
        """List all soft-deleted projects."""
        trash_dir = cls.get_trash_dir()
        projects = []
        for p_dir in trash_dir.iterdir():
            if p_dir.is_dir():
                meta_path = p_dir / "project.json"
                if meta_path.exists():
                    try:
                        with open(meta_path, 'r', encoding='utf-8') as f:
                            meta = json.load(f)
                            meta['id'] = p_dir.name
                            projects.append(meta)
                    except Exception:
                        pass
        return projects

    @classmethod
    def create_project(cls, title: str, description: str = "", author: str = "", original_language: str = "de") -> Dict[str, Any]:
        """Create a new project folder and metadata."""
        project_id = sanitize_filename(title)
        projects_dir = cls.get_projects_dir()
        
        # Avoid collisions by appending timestamp if folder already exists
        base_id = project_id
        counter = 1
        while (projects_dir / project_id).exists() or (cls.get_trash_dir() / project_id).exists():
            project_id = f"{base_id}_{counter}"
            counter += 1
            
        project_path = projects_dir / project_id
        project_path.mkdir(parents=True, exist_ok=True)
        
        # Create directories for chapters, lore
        (project_path / "chapters").mkdir(parents=True, exist_ok=True)
        (project_path / "chapters" / ".trash").mkdir(parents=True, exist_ok=True)
        (project_path / "chapters" / ".history").mkdir(parents=True, exist_ok=True)
        (project_path / "lore").mkdir(parents=True, exist_ok=True)
        (project_path / "lore" / ".trash").mkdir(parents=True, exist_ok=True)
        
        # Initialize metadata
        now_str = datetime.now().isoformat()
        metadata = {
            "id": project_id,
            "title": title,
            "description": description,
            "author": author,
            "original_language": original_language,
            "created_at": now_str,
            "updated_at": now_str,
            "word_count_goal": 50000,
            "daily_word_count_goal": 500,
            "status": "active",
            "chapters_order": []
        }
        
        with open(project_path / "project.json", 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=4, ensure_ascii=False)
            
        return metadata

    @classmethod
    def get_project_metadata(cls, project_id: str) -> Optional[Dict[str, Any]]:
        """Read project metadata."""
        meta_path = cls.get_projects_dir() / project_id / "project.json"
        if not meta_path.exists():
            # Check trash
            meta_path = cls.get_trash_dir() / project_id / "project.json"
            if not meta_path.exists():
                return None
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
                meta['id'] = project_id
                return meta
        except Exception:
            return None

    @classmethod
    def update_project_metadata(cls, project_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update project metadata."""
        project_path = cls.get_projects_dir() / project_id
        if not project_path.exists():
            return None
        
        meta_path = project_path / "project.json"
        meta = cls.get_project_metadata(project_id) or {}
        
        for k, v in data.items():
            if k not in ['id', 'created_at']: # Protect immutable fields
                meta[k] = v
        meta['updated_at'] = datetime.now().isoformat()
        
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, indent=4, ensure_ascii=False)
        return meta

    @classmethod
    def delete_project(cls, project_id: str) -> bool:
        """Soft delete a project by moving it to the trash folder."""
        source = cls.get_projects_dir() / project_id
        if not source.exists() or source.is_file():
            return False
            
        trash_dir = cls.get_trash_dir()
        destination = trash_dir / project_id
        
        # If destination already exists in trash, remove it first
        if destination.exists():
            shutil.rmtree(destination)
            
        shutil.move(str(source), str(destination))
        
        # Update metadata status
        meta = cls.get_project_metadata(project_id)
        if meta:
            meta['status'] = 'deleted'
            meta['deleted_at'] = datetime.now().isoformat()
            with open(destination / "project.json", 'w', encoding='utf-8') as f:
                json.dump(meta, f, indent=4, ensure_ascii=False)
        return True

    @classmethod
    def restore_project(cls, project_id: str) -> bool:
        """Restore a soft-deleted project from trash."""
        source = cls.get_trash_dir() / project_id
        if not source.exists() or source.is_file():
            return False
            
        destination = cls.get_projects_dir() / project_id
        if destination.exists():
            # If active folder already exists somehow, append suffix to restored
            suffix = datetime.now().strftime("%Y%m%d%H%M%S")
            destination = cls.get_projects_dir() / f"{project_id}_{suffix}"
            project_id = destination.name
            
        shutil.move(str(source), str(destination))
        
        meta = cls.get_project_metadata(project_id)
        if meta:
            meta['status'] = 'active'
            meta.pop('deleted_at', None)
            with open(destination / "project.json", 'w', encoding='utf-8') as f:
                json.dump(meta, f, indent=4, ensure_ascii=False)
        return True

    @classmethod
    def permanent_delete_project(cls, project_id: str) -> bool:
        """Permanently delete a project from trash."""
        target = cls.get_trash_dir() / project_id
        if not target.exists():
            # If not in trash, check if active (should only permanently delete from trash, but let's be safe)
            target = cls.get_projects_dir() / project_id
            if not target.exists():
                return False
        shutil.rmtree(target)
        return True

    # CHAPTER MANAGEMENT (Zero-Data-Loss Integrations)
    
    @classmethod
    def get_chapters_dir(cls, project_id: str) -> Path:
        p_dir = cls.get_projects_dir() / project_id
        c_dir = p_dir / "chapters"
        c_dir.mkdir(parents=True, exist_ok=True)
        (c_dir / ".trash").mkdir(parents=True, exist_ok=True)
        (c_dir / ".history").mkdir(parents=True, exist_ok=True)
        return c_dir

    @classmethod
    def list_chapters(cls, project_id: str) -> List[Dict[str, Any]]:
        """List active chapters in a project."""
        chapters_dir = cls.get_chapters_dir(project_id)
        chapters = []
        
        # Load chapter list
        for file in chapters_dir.iterdir():
            if file.is_file() and file.suffix == '.md' and not file.name.startswith('.'):
                stat = file.stat()
                chapter_id = file.stem
                
                # Check if a newer .tmp file exists for crash recovery
                tmp_file = chapters_dir / f".{file.name}.tmp"
                has_recovery = False
                if tmp_file.exists():
                    if tmp_file.stat().st_mtime > stat.st_mtime:
                        has_recovery = True
                
                # Word count calculation
                word_count = 0
                try:
                    with open(file, 'r', encoding='utf-8') as f:
                        text = f.read()
                        word_count = len(re.findall(r'\b\w+\b', text))
                except Exception:
                    pass
                
                chapters.append({
                    "id": chapter_id,
                    "title": chapter_id.replace('_', ' ').title(),
                    "word_count": word_count,
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "has_recovery": has_recovery
                })
                
        # Sort based on chapters_order in project.json if available
        meta_path = cls.get_projects_dir() / project_id / "project.json"
        if meta_path.exists():
            try:
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                    order = meta.get("chapters_order", [])
                    if order:
                        order_map = {ch_id: i for i, ch_id in enumerate(order)}
                        # Return sorted by order map index, appending unknown chapters at end
                        return sorted(chapters, key=lambda x: order_map.get(x['id'], len(order) + chapters.index(x)))
            except Exception:
                pass
                
        return sorted(chapters, key=lambda x: x['id'])

    @classmethod
    def list_trashed_chapters(cls, project_id: str) -> List[Dict[str, Any]]:
        """List soft-deleted chapters."""
        trash_dir = cls.get_chapters_dir(project_id) / ".trash"
        chapters = []
        for file in trash_dir.iterdir():
            if file.is_file() and file.suffix == '.md':
                stat = file.stat()
                chapters.append({
                    "id": file.stem,
                    "title": file.stem.replace('_', ' ').title(),
                    "deleted_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        return chapters

    @classmethod
    def create_chapter(cls, project_id: str, title: str) -> Dict[str, Any]:
        """Create a new chapter markdown file."""
        chapters_dir = cls.get_chapters_dir(project_id)
        chapter_id = sanitize_filename(title)
        
        base_id = chapter_id
        counter = 1
        while (chapters_dir / f"{chapter_id}.md").exists() or (chapters_dir / ".trash" / f"{chapter_id}.md").exists():
            chapter_id = f"{base_id}_{counter}"
            counter += 1
            
        file_path = chapters_dir / f"{chapter_id}.md"
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"# {title}\n\nSchreibe dein Kapitel hier...")
            
        stat = file_path.stat()
        
        # Update chapters_order in project.json
        meta_path = cls.get_projects_dir() / project_id / "project.json"
        if meta_path.exists():
            try:
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                order = meta.get("chapters_order", [])
                if chapter_id not in order:
                    order.append(chapter_id)
                meta["chapters_order"] = order
                with open(meta_path, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, indent=4, ensure_ascii=False)
            except Exception:
                pass
                
        return {
            "id": chapter_id,
            "title": title,
            "word_count": 4,
            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "has_recovery": False
        }

    @classmethod
    def delete_chapter(cls, project_id: str, chapter_id: str) -> bool:
        """Soft delete a chapter by moving it to the chapters' .trash folder."""
        chapters_dir = cls.get_chapters_dir(project_id)
        source = chapters_dir / f"{chapter_id}.md"
        if not source.exists():
            return False
            
        destination = chapters_dir / ".trash" / f"{chapter_id}.md"
        if destination.exists():
            destination.unlink()
            
        # Move both original and potential tmp file
        shutil.move(str(source), str(destination))
        
        tmp_file = chapters_dir / f".{chapter_id}.md.tmp"
        if tmp_file.exists():
            tmp_file.unlink() # Delete temp autosave on delete
            
        return True

    @classmethod
    def restore_chapter(cls, project_id: str, chapter_id: str) -> bool:
        """Restore a chapter from the projects' .trash folder."""
        chapters_dir = cls.get_chapters_dir(project_id)
        source = chapters_dir / ".trash" / f"{chapter_id}.md"
        if not source.exists():
            return False
            
        destination = chapters_dir / f"{chapter_id}.md"
        if destination.exists():
            suffix = datetime.now().strftime("%Y%m%d%H%M%S")
            destination = chapters_dir / f"{chapter_id}_{suffix}.md"
            
        shutil.move(str(source), str(destination))
        return True

    @classmethod
    def permanent_delete_chapter(cls, project_id: str, chapter_id: str) -> bool:
        """Permanently delete a chapter."""
        trash_dir = cls.get_chapters_dir(project_id) / ".trash"
        target = trash_dir / f"{chapter_id}.md"
        if not target.exists():
            return False
        target.unlink()
        return True

    # ZERO DATA LOSS READ / WRITE OPERATIONS
    
    @classmethod
    def get_chapter_content(cls, project_id: str, chapter_id: str) -> Dict[str, Any]:
        """
        Gets a chapter's content.
        Checks for a newer .tmp file and returns flags for crash recovery.
        """
        chapters_dir = cls.get_chapters_dir(project_id)
        file_path = chapters_dir / f"{chapter_id}.md"
        tmp_path = chapters_dir / f".{chapter_id}.md.tmp"
        
        if not file_path.exists():
            # Might be in trash or deleted
            return {"error": "Chapter not found"}
            
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
            
        has_recovery = False
        tmp_content = ""
        tmp_mtime = 0.0
        
        if tmp_path.exists():
            orig_mtime = file_path.stat().st_mtime
            tmp_mtime = tmp_path.stat().st_mtime
            if tmp_mtime > orig_mtime:
                has_recovery = True
                try:
                    with open(tmp_path, 'r', encoding='utf-8') as f:
                        tmp_content = f.read()
                except Exception:
                    has_recovery = False
                    
        return {
            "id": chapter_id,
            "content": original_content,
            "has_recovery": has_recovery,
            "recovery_content": tmp_content if has_recovery else None,
            "recovery_timestamp": datetime.fromtimestamp(tmp_mtime).isoformat() if has_recovery else None
        }

    @classmethod
    def autosave_chapter(cls, project_id: str, chapter_id: str, content: str) -> bool:
        """Autosave (Shadow Save) content to a hidden .tmp file."""
        chapters_dir = cls.get_chapters_dir(project_id)
        tmp_path = chapters_dir / f".{chapter_id}.md.tmp"
        
        # Verify parent chapter file exists first
        if not (chapters_dir / f"{chapter_id}.md").exists():
            return False
            
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True

    @classmethod
    def save_chapter(cls, project_id: str, chapter_id: str, content: str) -> bool:
        """
        Save chapter content explicitly.
        1. Prepares a snapshot in .history/ with timestamp.
        2. Writes to the original file.
        3. Cleans up the .tmp file.
        """
        chapters_dir = cls.get_chapters_dir(project_id)
        file_path = chapters_dir / f"{chapter_id}.md"
        tmp_path = chapters_dir / f".{chapter_id}.md.tmp"
        history_dir = chapters_dir / ".history"
        history_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. Create history snapshot of previous version if it exists
        if file_path.exists():
            try:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                history_file = history_dir / f"{chapter_id}_{timestamp}.md"
                shutil.copy2(file_path, history_file)
            except Exception as e:
                # Log or handle backup failure, but proceed to save
                pass
                
        # 2. Save original file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
        # 3. Remove .tmp file
        if tmp_path.exists():
            tmp_path.unlink()
            
        # Update project updated_at timestamp
        cls.update_project_metadata(project_id, {})
        return True

    @classmethod
    def resolve_recovery(cls, project_id: str, chapter_id: str, keep_recovery: bool) -> bool:
        """Resolve crash recovery warning by either restoring or discarding tmp."""
        chapters_dir = cls.get_chapters_dir(project_id)
        file_path = chapters_dir / f"{chapter_id}.md"
        tmp_path = chapters_dir / f".{chapter_id}.md.tmp"
        
        if not tmp_path.exists():
            return False
            
        if keep_recovery:
            # Load recovery content and save explicitly
            try:
                with open(tmp_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                cls.save_chapter(project_id, chapter_id, content)
                return True
            except Exception:
                return False
        else:
            # Just delete the tmp file
            tmp_path.unlink()
            return True

    # LORE / WIKI DATABASE MANAGEMENT
    
    @classmethod
    def get_lore_dir(cls, project_id: str) -> Path:
        p_dir = cls.get_projects_dir() / project_id
        l_dir = p_dir / "lore"
        l_dir.mkdir(parents=True, exist_ok=True)
        (l_dir / ".trash").mkdir(parents=True, exist_ok=True)
        return l_dir

    @classmethod
    def list_lore(cls, project_id: str) -> List[Dict[str, Any]]:
        """List active lore entries in a project."""
        lore_dir = cls.get_lore_dir(project_id)
        entries = []
        for file in lore_dir.iterdir():
            if file.is_file() and file.suffix == '.json' and not file.name.startswith('.'):
                try:
                    with open(file, 'r', encoding='utf-8') as f:
                        entry = json.load(f)
                        entry['id'] = file.stem
                        entries.append(entry)
                except Exception:
                    pass
        return sorted(entries, key=lambda x: x.get('name', '').lower())

    @classmethod
    def list_trashed_lore(cls, project_id: str) -> List[Dict[str, Any]]:
        """List soft-deleted lore entries."""
        trash_dir = cls.get_lore_dir(project_id) / ".trash"
        entries = []
        for file in trash_dir.iterdir():
            if file.is_file() and file.suffix == '.json':
                try:
                    with open(file, 'r', encoding='utf-8') as f:
                        entry = json.load(f)
                        entry['id'] = file.stem
                        entries.append(entry)
                except Exception:
                    pass
        return entries

    @classmethod
    def create_lore(cls, project_id: str, name: str, category: str, short_description: str = "", description: str = "", keywords: List[str] = None, project_ids: List[str] = None) -> Dict[str, Any]:
        """Create a new lore JSON entry and sync it to all selected projects."""
        if not project_ids:
            project_ids = [project_id]
        if project_id not in project_ids:
            project_ids.append(project_id)
            
        lore_id = sanitize_filename(name)
        
        # Avoid collisions in any of the target projects
        counter = 1
        base_id = lore_id
        while any((cls.get_lore_dir(p_id) / f"{lore_id}.json").exists() for p_id in project_ids):
            lore_id = f"{base_id}_{counter}"
            counter += 1
            
        now_str = datetime.now().isoformat()
        
        entry = {
            "id": lore_id,
            "name": name,
            "category": category, # character, location, item, lore
            "short_description": short_description,
            "description": description,
            "keywords": keywords or [name],
            "project_ids": project_ids,
            "created_at": now_str,
            "updated_at": now_str
        }
        
        # Save to all selected projects
        for p_id in project_ids:
            lore_dir = cls.get_lore_dir(p_id)
            file_path = lore_dir / f"{lore_id}.json"
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(entry, f, indent=4, ensure_ascii=False)
                
        return entry

    @classmethod
    def get_lore(cls, project_id: str, lore_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific lore entry."""
        lore_dir = cls.get_lore_dir(project_id)
        file_path = lore_dir / f"{lore_id}.json"
        if not file_path.exists():
            # Check trash
            file_path = lore_dir / ".trash" / f"{lore_id}.json"
            if not file_path.exists():
                return None
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                entry = json.load(f)
                entry['id'] = lore_id
                return entry
        except Exception:
            return None

    @classmethod
    def update_lore(cls, project_id: str, lore_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update a specific lore entry and sync/desync across projects."""
        entry = cls.get_lore(project_id, lore_id)
        if not entry:
            return None
            
        old_project_ids = entry.get('project_ids', [project_id])
        new_project_ids = data.get('project_ids', old_project_ids)
        if project_id not in new_project_ids:
            new_project_ids.append(project_id)
            
        # Update fields
        for k, v in data.items():
            if k not in ['id', 'created_at']:
                entry[k] = v
        entry['project_ids'] = new_project_ids
        entry['updated_at'] = datetime.now().isoformat()
        
        # Save/Update in all new checked projects
        for p_id in new_project_ids:
            lore_dir = cls.get_lore_dir(p_id)
            with open(lore_dir / f"{lore_id}.json", 'w', encoding='utf-8') as f:
                json.dump(entry, f, indent=4, ensure_ascii=False)
                
        # Delete/Soft-delete from projects that were unchecked
        for p_id in old_project_ids:
            if p_id not in new_project_ids:
                cls.delete_lore(p_id, lore_id)
                
        return entry

    @classmethod
    def delete_lore(cls, project_id: str, lore_id: str) -> bool:
        """Soft delete a lore entry by moving it to the lore .trash folder."""
        lore_dir = cls.get_lore_dir(project_id)
        source = lore_dir / f"{lore_id}.json"
        if not source.exists():
            return False
            
        destination = lore_dir / ".trash" / f"{lore_id}.json"
        if destination.exists():
            destination.unlink()
            
        shutil.move(str(source), str(destination))
        return True

    @classmethod
    def restore_lore(cls, project_id: str, lore_id: str) -> bool:
        """Restore a lore entry from trash."""
        lore_dir = cls.get_lore_dir(project_id)
        source = lore_dir / ".trash" / f"{lore_id}.json"
        if not source.exists():
            return False
            
        destination = lore_dir / f"{lore_id}.json"
        if destination.exists():
            suffix = datetime.now().strftime("%Y%m%d%H%M%S")
            destination = lore_dir / f"{lore_id}_{suffix}.json"
            
        shutil.move(str(source), str(destination))
        return True

    @classmethod
    def permanent_delete_lore(cls, project_id: str, lore_id: str) -> bool:
        """Permanently delete a lore entry."""
        lore_dir = cls.get_lore_dir(project_id)
        target = lore_dir / ".trash" / f"{lore_id}.json"
        if not target.exists():
            return False
        target.unlink()
        return True

    @classmethod
    def get_translations_dir(cls, project_id: str, lang: str = None) -> Path:
        p_dir = cls.get_projects_dir() / project_id
        t_dir = p_dir / "translations"
        t_dir.mkdir(parents=True, exist_ok=True)
        if lang:
            l_dir = t_dir / lang
            l_dir.mkdir(parents=True, exist_ok=True)
            c_dir = l_dir / "chapters"
            c_dir.mkdir(parents=True, exist_ok=True)
            return c_dir
        return t_dir

    @classmethod
    def list_languages(cls, project_id: str) -> List[str]:
        """List active translation branch language codes."""
        t_dir = cls.get_translations_dir(project_id)
        langs = []
        for file in t_dir.iterdir():
            if file.is_dir() and not file.name.startswith('.'):
                langs.append(file.name)
        return langs

    @classmethod
    def create_language_branch(cls, project_id: str, lang_code: str):
        """Create language branch directory and translate all existing active chapters."""
        from backend.services.ai import AIService
        lang_dir = cls.get_translations_dir(project_id, lang_code)
        
        # Translate all active chapters
        chapters = cls.list_chapters(project_id)
        for ch in chapters:
            ch_data = cls.get_chapter_content(project_id, ch['id'])
            original_content = ch_data.get('content', '')
            
            # Translate content
            translated_content = AIService.translate_text(original_content, lang_code)
            
            # Save to translated chapter file
            ch_file = lang_dir / f"{ch['id']}.md"
            with open(ch_file, 'w', encoding='utf-8') as f:
                f.write(translated_content)

    @classmethod
    def get_translated_chapter(cls, project_id: str, lang_code: str, chapter_id: str) -> Dict[str, Any]:
        """Get translated chapter content."""
        lang_dir = cls.get_translations_dir(project_id, lang_code)
        file_path = lang_dir / f"{chapter_id}.md"
        if not file_path.exists():
            return {"content": "", "id": chapter_id}
            
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"id": chapter_id, "content": content}

    @classmethod
    def save_translated_chapter(cls, project_id: str, lang_code: str, chapter_id: str, content: str):
        """Save manual edits to translated chapter."""
        lang_dir = cls.get_translations_dir(project_id, lang_code)
        file_path = lang_dir / f"{chapter_id}.md"
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

    @classmethod
    def sync_all_translations(cls, project_id: str, chapter_id: str, primary_content: str):
        """Automatically translates and saves chapter edits to all active language branches."""
        from backend.services.ai import AIService
        langs = cls.list_languages(project_id)
        for lang in langs:
            try:
                lang_dir = cls.get_translations_dir(project_id, lang)
                translated_content = AIService.translate_text(primary_content, lang)
                ch_file = lang_dir / f"{chapter_id}.md"
                with open(ch_file, 'w', encoding='utf-8') as f:
                    f.write(translated_content)
            except Exception as e:
                print(f"Failed to auto-translate chapter {chapter_id} to {lang}: {e}")

    @classmethod
    def save_chapters_order(cls, project_id: str, chapters_order: List[str]) -> bool:
        """Save custom sorted sequence order of chapters inside project metadata."""
        meta_path = cls.get_projects_dir() / project_id / "project.json"
        if not meta_path.exists():
            return False
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            meta["chapters_order"] = chapters_order
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump(meta, f, indent=4, ensure_ascii=False)
            return True
        except Exception:
            return False

    @classmethod
    def get_timeline_file(cls, project_id: str) -> Path:
        return cls.get_projects_dir() / project_id / "timeline.json"

    @classmethod
    def load_timeline(cls, project_id: str) -> List[Dict[str, Any]]:
        file_path = cls.get_timeline_file(project_id)
        if not file_path.exists():
            return []
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return []

    @classmethod
    def save_timeline(cls, project_id: str, timeline_events: List[Dict[str, Any]]) -> bool:
        file_path = cls.get_timeline_file(project_id)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(timeline_events, f, indent=4, ensure_ascii=False)
            return True
        except Exception:
            return False

    @classmethod
    def create_backup(cls, backup_dir_path: str) -> Dict[str, Any]:
        """
        Creates a ZIP backup of all projects and saves it to the specified backup directory.
        """
        import zipfile
        import os
        from datetime import datetime
        
        backup_path = Path(backup_dir_path)
        if not backup_path.exists():
            try:
                backup_path.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                return {"success": False, "error": f"Backup-Verzeichnis konnte nicht erstellt werden: {str(e)}"}
                
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"embernovels_backup_{timestamp}.zip"
        zip_filepath = backup_path / zip_filename
        
        projects_dir = cls.get_projects_dir()
        if not projects_dir.exists():
            return {"success": False, "error": "Projekte-Verzeichnis existiert nicht."}
            
        try:
            with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for root, dirs, files in os.walk(projects_dir):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(projects_dir.parent)
                        zip_file.write(file_path, arcname)
            
            return {
                "success": True, 
                "filename": zip_filename, 
                "filepath": str(zip_filepath),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {"success": False, "error": f"Backup-Verzeichnis/Dateizugriff fehlgeschlagen: {str(e)}"}

    @classmethod
    def get_relationships_file(cls, project_id: str) -> Path:
        return cls.get_projects_dir() / project_id / "relationships.json"

    @classmethod
    def load_relationships(cls, project_id: str) -> Dict[str, Any]:
        file_path = cls.get_relationships_file(project_id)
        if not file_path.exists():
            return {"nodes": {}, "links": []}
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {"nodes": {}, "links": []}

    @classmethod
    def save_relationships(cls, project_id: str, data: Dict[str, Any]) -> bool:
        file_path = cls.get_relationships_file(project_id)
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            return True
        except Exception:
            return False


