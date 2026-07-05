class EmberEditor {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = Object.assign({
      onChange: () => {},
      onLoreClick: () => {},
      initialLoreKeywords: []
    }, options);

    this.loreKeywords = this.options.initialLoreKeywords;
    
    // DOM setup
    this._buildDOM();
    this._bindEvents();
    this._renderHighlights();
  }
  
  _buildDOM() {
    this.container.innerHTML = '';
    
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ember-editor-container';

    this.innerWrapper = document.createElement('div');
    this.innerWrapper.className = 'ember-editor-wrapper';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'ember-editor-textarea';
    this.textarea.spellcheck = false;

    this.highlights = document.createElement('div');
    this.highlights.className = 'ember-editor-highlights';
    this.highlights.setAttribute('aria-hidden', 'true');

    // To ensure the textarea is under the highlights but still gets focus correctly,
    // we just put them in the DOM. Since textarea has z-index 1 and highlights z-index 2, 
    // highlights will be visually on top.
    this.innerWrapper.appendChild(this.textarea);
    this.innerWrapper.appendChild(this.highlights);
    this.wrapper.appendChild(this.innerWrapper);
    this.container.appendChild(this.wrapper);
  }

  _bindEvents() {
    this.textarea.addEventListener('input', () => {
      this._renderHighlights();
      if (typeof this.options.onChange === 'function') {
        this.options.onChange(this.textarea.value);
      }
    });

    // Sync scroll so the highlight layer perfectly follows the textarea scrolling
    this.textarea.addEventListener('scroll', () => {
      this.highlights.scrollTop = this.textarea.scrollTop;
      this.highlights.scrollLeft = this.textarea.scrollLeft;
    });

    // Event delegation for lore clicks
    this.highlights.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('lore-keyword')) {
        e.preventDefault(); // Prevent textarea from losing focus
        const keyword = e.target.getAttribute('data-keyword');
        if (typeof this.options.onLoreClick === 'function') {
          this.options.onLoreClick(keyword);
        }
      }
    });
  }

  _escapeHTML(text) {
    // A fast way to escape HTML without using innerHTML on a wrapper
    return text.replace(/[&<>'"]/g, 
      tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[tag] || tag)
    );
  }

  _renderHighlights() {
    let text = this.textarea.value;
    text = this._escapeHTML(text);

    if (this.loreKeywords && this.loreKeywords.length > 0) {
      // Sort by length descending to match longest keywords first
      const sortedKeywords = [...this.loreKeywords].sort((a, b) => b.length - a.length);
      const escapedKeywords = sortedKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      // Match keywords case-insensitively, with word boundaries
      const pattern = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
      
      text = text.replace(pattern, (match) => {
        return `<span class="lore-keyword" data-keyword="${match}">${match}</span>`;
      });
    }

    // Fix trailing newline rendering issue:
    // If text ends with a newline, HTML won't render it correctly unless there's a space or br
    if (text.endsWith('\n')) {
      text += ' ';
    }

    this.highlights.innerHTML = text;
  }

  setLoreKeywords(keywords) {
    this.loreKeywords = keywords;
    this._renderHighlights();
  }

  // ---- Public Interface for CustomAdapter ----

  getMarkdown() {
    return this.textarea.value;
  }

  getHTML() {
    let md = this.textarea.value;
    
    // Basic Markdown Converter (Bold, Italic)
    md = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    md = md.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert paragraph blocks
    const paragraphs = md.split(/\n\s*\n/).filter(p => p.trim() !== '');
    const html = paragraphs.map(p => {
      // Convert single newlines to <br> inside paragraphs
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
    
    return html;
  }

  setMarkdown(md) {
    this.textarea.value = md || '';
    this._renderHighlights();
  }

  insertText(text) {
    this.replaceSelection(text);
  }

  replaceSelection(text) {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    
    this.textarea.setRangeText(text, start, end, 'end');
    
    // Manually dispatch input event to update highlights and trigger onChange
    this.textarea.dispatchEvent(new Event('input'));
  }

  getSelectedText() {
    const start = this.textarea.selectionStart;
    const end = this.textarea.selectionEnd;
    return this.textarea.value.substring(start, end);
  }

  setSelection(start, end) {
    this.textarea.setSelectionRange(start, end);
    this.textarea.focus();
  }

  focus() {
    this.textarea.focus();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

// Attach to window if running in browser
if (typeof window !== 'undefined') {
  window.EmberEditor = EmberEditor;
}
