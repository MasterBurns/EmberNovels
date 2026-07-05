class EmberEditorCore {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;
    this.onChangeCallback = null;
    this.loreKeywords = [];
    this.zoomLevel = 1;

    this._buildDOM();
    this._bindEvents();
  }

  _buildDOM() {
    this.container.innerHTML = '';
    
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ember-editor-container';

    this.content = document.createElement('div');
    this.content.className = 'ember-editor-content';
    this.content.contentEditable = 'true';
    this.content.spellcheck = false;

    // Tooltip Container for Hover events
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'ember-tooltip';
    document.body.appendChild(this.tooltip);

    this.wrapper.appendChild(this.content);
    this.container.appendChild(this.wrapper);
  }

  _bindEvents() {
    // Prevent default enter behavior and insert literal newline
    // This keeps the DOM clean (only text nodes and spans) instead of nested divs/brs
    this.content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
      }
    });

    this.content.addEventListener('input', () => {
      this._updateContent();
      if (this.onChangeCallback) {
        this.onChangeCallback(this.getContent());
      }
    });

    // Hover-Over System
    this.content.addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('lore-keyword')) {
        const keyword = e.target.getAttribute('data-keyword');
        
        // 1. Fire Custom Event / API Callback
        if (typeof this.options.onLoreHover === 'function') {
          this.options.onLoreHover(keyword, e);
        }

        // 2. Show Default Tooltip
        this.tooltip.textContent = "Lore Highlight: " + keyword;
        this.tooltip.classList.add('visible');
        
        const rect = e.target.getBoundingClientRect();
        this.tooltip.style.left = rect.left + 'px';
        this.tooltip.style.top = (rect.bottom + 8) + 'px';
      }
    });

    this.content.addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('lore-keyword')) {
        this.tooltip.classList.remove('visible');
      }
    });
  }

  // --- API Methods ---

  setContent(markdownText) {
    this.content.textContent = markdownText || '';
    this._updateContent();
  }

  getContent() {
    // Because we use pre-wrap and prevent default Enter, textContent perfectly matches Markdown
    let text = this.content.textContent;
    // Strip the zero-width space if we added it for the trailing newline fix
    if (text.endsWith('\u200B')) {
      text = text.slice(0, -1);
    }
    return text;
  }

  onContentChange(callback) {
    this.onChangeCallback = callback;
  }

  setLoreHighlights(loreArray) {
    this.loreKeywords = loreArray;
    this._updateContent();
  }

  setZoom(level) {
    this.zoomLevel = level;
    this.wrapper.style.setProperty('--editor-zoom', level);
  }

  // --- Internal Rendering & Cursor Logic ---

  _updateContent() {
    const cursorOffset = this._getCursorOffset();
    let text = this.getContent();

    const html = this._renderMarkdown(text);
    this.content.innerHTML = html;

    this._setCursorOffset(cursorOffset);
  }

  _renderMarkdown(text) {
    // Escape HTML first to prevent XSS and tag injection
    let html = text.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));

    // Headings (H1-H3)
    html = html.replace(/^(#{1,3})\s+(.*)$/gm, (match, hashes, content) => {
      const level = hashes.length;
      return `<span class="md-heading md-h${level}"><span class="md-char">${hashes} </span>${content}</span>`;
    });

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<span class="md-bold"><span class="md-char">**</span>$1<span class="md-char">**</span></span>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<span class="md-italic"><span class="md-char">*</span>$1<span class="md-char">*</span></span>');

    // Lore Keywords
    if (this.loreKeywords && this.loreKeywords.length > 0) {
      const sortedKeywords = [...this.loreKeywords].sort((a, b) => b.length - a.length);
      const escapedKeywords = sortedKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const pattern = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
      
      html = html.replace(pattern, (match) => {
        return `<span class="lore-keyword" data-keyword="${match}">${match}</span>`;
      });
    }

    // Fix trailing newline issue in contenteditable:
    // Browsers often ignore a trailing newline unless there is another character.
    // Adding a Zero-Width Space (\u200B) preserves the trailing newline visually.
    if (html.endsWith('\n')) {
      html += '\u200B';
    }

    return html;
  }

  _getCursorOffset() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;
    
    const range = selection.getRangeAt(0);
    // Ensure the cursor is inside the editor
    if (!this.content.contains(range.startContainer)) return 0;

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(this.content);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }

  _setCursorOffset(offset) {
    const selection = window.getSelection();
    if (offset === 0) {
      // Fast path for offset 0
      const range = document.createRange();
      range.setStart(this.content, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }

    let charCount = 0;
    let nodeStack = [this.content];
    let node;
    let stopNode = null;
    let stopOffset = 0;

    while (nodeStack.length > 0) {
      node = nodeStack.pop();

      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharCount = charCount + node.length;
        if (offset <= nextCharCount) {
          stopNode = node;
          stopOffset = offset - charCount;
          break;
        }
        charCount = nextCharCount;
      } else {
        // Push children in reverse order so they are processed left-to-right
        let i = node.childNodes.length;
        while (i--) {
          nodeStack.push(node.childNodes[i]);
        }
      }
    }

    if (stopNode) {
      const range = document.createRange();
      range.setStart(stopNode, stopOffset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  destroy() {
    this.container.innerHTML = '';
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
  }
}

// Attach to window if running in browser
if (typeof window !== 'undefined') {
  window.EmberEditorCore = EmberEditorCore;
}
