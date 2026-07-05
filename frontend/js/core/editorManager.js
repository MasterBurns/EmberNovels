// Base Editor Interface
class BaseEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.onChangeCallback = options.onChange || (() => {});
    }
    
    getMarkdown() { return ''; }
    getHTML() { return ''; }
    setMarkdown(md) {}
    insertText(text) {}
    replaceSelection(text) {}
    getSelectedText() { return ''; }
    setSelection(start, end) {}
    changeMode(mode) {} // 'wysiwyg' or 'markdown'
    focus() {}
    destroy() {}
    
    // Some editors like ToastUI have `.on` methods
    on(event, callback) {
        if (event === 'change') {
            this.onChangeCallback = callback;
        }
    }
}

// ------------------------------------------------------------------
// 1. ToastUI Adapter (Standard Editor)
// ------------------------------------------------------------------
class ToastUIAdapter extends BaseEditor {
    constructor(container, options) {
        super(container, options);
        
        this.editor = new toastui.Editor({
            el: container,
            height: '100%',
            initialEditType: 'wysiwyg',
            previewStyle: 'vertical',
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
            hideModeSwitch: true,
            toolbarItems: [
                ['heading', 'bold', 'italic', 'strike'],
                ['hr', 'quote'],
                ['ul', 'ol', 'task', 'indent', 'outdent'],
                ['table', 'image', 'link'],
                ['code', 'codeblock']
            ],
            hooks: options.hooks || {}
        });
        
        this.editor.on('change', () => {
            this.onChangeCallback();
        });
    }

    getMarkdown() { return this.editor.getMarkdown(); }
    getHTML() { return this.editor.getHTML(); }
    setMarkdown(md) { this.editor.setMarkdown(md); }
    insertText(text) { this.editor.insertText(text); }
    replaceSelection(text) { this.editor.replaceSelection(text); }
    getSelectedText() { return this.editor.getSelectedText(); }
    setSelection(start, end) { 
        if (typeof this.editor.setSelection === 'function') {
            this.editor.setSelection(start, end);
        } else if (this.editor.state && this.editor.state.editor) {
            this.editor.state.editor.setSelection(start, end);
        }
    }
    changeMode(mode) { this.editor.changeMode(mode); }
    focus() { this.editor.focus(); }
    destroy() { this.editor.destroy(); }
}

// ------------------------------------------------------------------
// 2. TipTap Adapter (Beta / Under Construction)
// ------------------------------------------------------------------
class TipTapAdapter extends BaseEditor {
    constructor(container, options) {
        super(container, options);
        container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">TipTap Editor wird geladen (Beta)...</div>';
        
        // Setup will follow in later phases
        this.content = '';
    }
    getMarkdown() { return this.content; }
    setMarkdown(md) { this.content = md; }
    insertText(text) {}
    replaceSelection(text) {}
    getSelectedText() { return ''; }
    setSelection(start, end) {}
    changeMode(mode) {}
    focus() {}
    destroy() { this.container.innerHTML = ''; }
}

// ------------------------------------------------------------------
// 3. Custom Adapter (Future / Editor 3)
// ------------------------------------------------------------------
class CustomAdapter extends BaseEditor {
    constructor(container, options) {
        super(container, options);
        container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">Eigener Editor 3 (Platzhalter)</div>';
        this.content = '';
    }
    getMarkdown() { return this.content; }
    setMarkdown(md) { this.content = md; }
    insertText(text) {}
    replaceSelection(text) {}
    getSelectedText() { return ''; }
    setSelection(start, end) {}
    changeMode(mode) {}
    focus() {}
    destroy() { this.container.innerHTML = ''; }
}


// ------------------------------------------------------------------
// Editor Manager (Factory)
// ------------------------------------------------------------------
window.EditorManager = {
    async createEditor(container, engineType, options = {}) {
        // Fallback for missing or invalid engine
        if (!['toastui', 'tiptap', 'custom'].includes(engineType)) {
            engineType = 'toastui';
        }
        
        // Clean container
        container.innerHTML = '';
        
        switch (engineType) {
            case 'tiptap':
                return new TipTapAdapter(container, options);
            case 'custom':
                return new CustomAdapter(container, options);
            case 'toastui':
            default:
                return new ToastUIAdapter(container, options);
        }
    }
};
