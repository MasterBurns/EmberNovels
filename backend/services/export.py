import re
import tempfile
import markdown
from pathlib import Path
from typing import List, Dict, Any, Tuple
from datetime import datetime

# Optional imports handled safely
try:
    from docx import Document
except ImportError:
    Document = None

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
except ImportError:
    SimpleDocTemplate = None

try:
    import ebooklib
    from ebooklib import epub
except ImportError:
    epub = None

from backend.services.storage import StorageService

class ExportService:
    @classmethod
    def get_project_chapters_content(cls, project_id: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """Load project metadata and all active chapters with content."""
        project = StorageService.get_project_metadata(project_id)
        if not project:
            raise ValueError("Projekt nicht gefunden.")
            
        chapters_meta = StorageService.list_chapters(project_id)
        chapters = []
        
        for ch_meta in chapters_meta:
            ch_data = StorageService.get_chapter(project_id, ch_meta['id'])
            if ch_data:
                chapters.append({
                    "id": ch_meta['id'],
                    "title": ch_meta['title'],
                    "content": ch_data['content']
                })
        return project, chapters

    @classmethod
    def export_project(cls, project_id: str, file_format: str) -> Tuple[Path, str]:
        """
        Export project chapters into a single file of the given format.
        Returns: Tuple[Path_to_temp_file, File_name]
        """
        project, chapters = cls.get_project_chapters_content(project_id)
        project_title = project.get('title', 'Unbenanntes Buch')
        project_desc = project.get('description', '')
        
        # Sanitize filename for download header
        safe_title = re.sub(r'[^a-zA-Z0-9_-]', '_', project_title)
        temp_dir = Path(tempfile.gettempdir())
        
        if file_format == 'txt':
            filename = f"{safe_title}.txt"
            file_path = temp_dir / filename
            cls._export_txt(file_path, project_title, project_desc, chapters)
            
        elif file_format == 'html':
            filename = f"{safe_title}.html"
            file_path = temp_dir / filename
            cls._export_html(file_path, project_title, project_desc, chapters)
            
        elif file_format == 'docx':
            if not Document:
                raise ImportError("python-docx ist nicht installiert.")
            filename = f"{safe_title}.docx"
            file_path = temp_dir / filename
            cls._export_docx(file_path, project_title, project_desc, chapters)
            
        elif file_format == 'pdf':
            if not SimpleDocTemplate:
                raise ImportError("reportlab ist nicht installiert.")
            filename = f"{safe_title}.pdf"
            file_path = temp_dir / filename
            cls._export_pdf(file_path, project_title, project_desc, chapters)
            
        elif file_format == 'epub':
            if not epub:
                raise ImportError("ebooklib ist nicht installiert.")
            filename = f"{safe_title}.epub"
            file_path = temp_dir / filename
            cls._export_epub(file_path, project_id, project_title, project_desc, chapters)
            
        else:
            raise ValueError(f"Ungültiges Format: {file_format}")
            
        return file_path, filename

    @classmethod
    def _export_txt(cls, file_path: Path, title: str, desc: str, chapters: List[Dict[str, Any]]):
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"=========================================\n")
            f.write(f"{title}\n")
            if desc:
                f.write(f"{desc}\n")
            f.write(f"=========================================\n\n")
            
            for ch in chapters:
                f.write(f"--- {ch['title']} ---\n\n")
                f.write(ch['content'])
                f.write("\n\n")

    @classmethod
    def _export_html(cls, file_path: Path, title: str, desc: str, chapters: List[Dict[str, Any]]):
        body_content = ""
        toc_content = "<ul>"
        
        for i, ch in enumerate(chapters):
            ch_html = markdown.markdown(ch['content'])
            anchor = f"chapter-{i}"
            toc_content += f'<li><a href="#{anchor}">{ch["title"]}</a></li>'
            body_content += f'<section id="{anchor}" style="margin-top: 48px; border-top: 1px solid #ddd; padding-top: 24px;">'
            body_content += f'<h1>{ch["title"]}</h1>'
            body_content += ch_html
            body_content += '</section>'
            
        toc_content += "</ul>"
        
        html_template = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{title}</title>
    <style>
        body {{
            font-family: 'Georgia', serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
        }}
        h1, h2, h3 {{ font-family: sans-serif; }}
        nav {{ background: #f9f9f9; padding: 16px; border-radius: 8px; margin-bottom: 40px; }}
        .cover {{ text-align: center; margin-bottom: 60px; }}
        .cover h1 {{ font-size: 3em; margin-bottom: 10px; }}
        .cover p {{ font-style: italic; color: #666; font-size: 1.2em; }}
    </style>
</head>
<body>
    <div class="cover">
        <h1>{title}</h1>
        <p>{desc}</p>
    </div>
    <nav>
        <h2>Inhaltsverzeichnis</h2>
        {toc_content}
    </nav>
    {body_content}
</body>
</html>"""
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_template)

    @classmethod
    def _export_docx(cls, file_path: Path, title: str, desc: str, chapters: List[Dict[str, Any]]):
        doc = Document()
        doc.add_heading(title, 0)
        if desc:
            p = doc.add_paragraph()
            p.add_run(desc).italic = True
            
        doc.add_page_break()
        
        for ch in chapters:
            doc.add_heading(ch['title'], level=1)
            lines = ch['content'].split('\n')
            for line in lines:
                if line.strip().startswith('#'):
                    level = min(5, len(line) - len(line.lstrip('#')))
                    doc.add_heading(line.strip().lstrip('#').strip(), level=level + 1)
                else:
                    doc.add_paragraph(line)
            doc.add_page_break()
            
        doc.save(str(file_path))

    @classmethod
    def _export_pdf(cls, file_path: Path, title: str, desc: str, chapters: List[Dict[str, Any]]):
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'CoverTitle',
            parent=styles['Title'],
            fontName='Helvetica-Bold',
            fontSize=28,
            leading=34,
            alignment=TA_CENTER,
            spaceAfter=15
        )
        desc_style = ParagraphStyle(
            'CoverDesc',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=14,
            leading=18,
            alignment=TA_CENTER,
            spaceAfter=30
        )
        h1_style = ParagraphStyle(
            'ChapterHeader',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=20,
            leading=24,
            spaceBefore=20,
            spaceAfter=15,
            keepWithNext=True
        )
        body_style = ParagraphStyle(
            'BookBody',
            parent=styles['BodyText'],
            fontName='Helvetica',
            fontSize=11,
            leading=16,
            alignment=TA_JUSTIFY,
            spaceAfter=10
        )
        
        story = []
        # Cover Page
        story.append(Spacer(1, 150))
        story.append(Paragraph(title, title_style))
        if desc:
            story.append(Paragraph(desc, desc_style))
        story.append(PageBreak())
        
        for ch in chapters:
            story.append(Paragraph(ch['title'], h1_style))
            lines = ch['content'].split('\n')
            for line in lines:
                if line.strip():
                    if line.strip().startswith('#'):
                        level = min(5, len(line) - len(line.lstrip('#')))
                        sub_style = ParagraphStyle(
                            f'SubHead_{level}',
                            parent=styles['Heading2'],
                            fontName='Helvetica-Bold',
                            fontSize=14 if level == 2 else 12,
                            leading=18,
                            spaceBefore=12,
                            spaceAfter=6,
                            keepWithNext=True
                        )
                        story.append(Paragraph(line.strip().lstrip('#').strip(), sub_style))
                    else:
                        story.append(Paragraph(line, body_style))
            story.append(PageBreak())
            
        doc = SimpleDocTemplate(str(file_path), pagesize=letter)
        doc.build(story)

    @classmethod
    def _export_epub(cls, file_path: Path, project_id: str, title: str, desc: str, chapters: List[Dict[str, Any]]):
        book = epub.EpubBook()
        book.set_identifier(project_id)
        book.set_title(title)
        book.set_language('de')
        book.add_author('EmberNovels Author')
        
        # Cover/Intro
        intro = epub.EpubHtml(title='Titelblatt', file_name='intro.xhtml', lang='de')
        intro.content = f'<div style="text-align: center; margin-top: 100px;"><h1>{title}</h1><p><i>{desc}</i></p></div>'
        book.add_item(intro)
        
        spine = [intro]
        
        for i, ch in enumerate(chapters):
            ch_html = markdown.markdown(ch['content'])
            c = epub.EpubHtml(title=ch['title'], file_name=f'chap_{i}.xhtml', lang='de')
            c.content = f"<h1>{ch['title']}</h1>{ch_html}"
            book.add_item(c)
            spine.append(c)
            
        book.toc = tuple(spine)
        book.spine = ['nav'] + spine
        book.add_item(epub.EpubNav())
        book.add_item(epub.EpubNcx())
        
        epub.write_epub(str(file_path), book, {})
