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
        this.container.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">TipTap Editor wird geladen (Beta)...</div>';
        this.content = '';
        this.tiptapEditor = null;
    }

    async init() {
        try {
            // Dynamically import TipTap modules via esm.sh
            const { Editor, Extension } = await import('https://esm.sh/@tiptap/core@2.2.4');
            const StarterKit = (await import('https://esm.sh/@tiptap/starter-kit@2.2.4')).default;
            const { Markdown } = await import('https://esm.sh/tiptap-markdown@0.8.9');
            const { Plugin, PluginKey } = await import('https://esm.sh/@tiptap/pm@2.2.4/state');
            const { Decoration, DecorationSet } = await import('https://esm.sh/@tiptap/pm@2.2.4/view');

            // --- Lore Extension Logic ---
            function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
            
            function findLoreDecorations(doc) {
                const decorations = [];
                if (!window.state || !window.state.loreList || window.state.loreList.length === 0) {
                    return DecorationSet.empty;
                }
                
                const keywords = window.state.loreList.map(l => escapeRegExp(l.keyword));
                const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');

                doc.descendants((node, pos) => {
                    if (!node.isText) return;
                    let match;
                    while ((match = regex.exec(node.text)) !== null) {
                        const start = pos + match.index;
                        const end = start + match[0].length;
                        decorations.push(Decoration.inline(start, end, {
                            class: 'tiptap-lore-highlight',
                            'data-keyword': match[0]
                        }));
                    }
                });
                return DecorationSet.create(doc, decorations);
            }

            const LoreHighlightExtension = Extension.create({
                name: 'loreHighlight',
                addProseMirrorPlugins() {
                    return [
                        new Plugin({
                            key: new PluginKey('loreHighlight'),
                            state: {
                                init(_, { doc }) { return findLoreDecorations(doc); },
                                apply(tr, old) { return tr.docChanged ? findLoreDecorations(tr.doc) : old; }
                            },
                            props: {
                                decorations(state) { return this.getState(state); },
                                handleClick(view, pos, event) {
                                    if (event.target.classList.contains('tiptap-lore-highlight')) {
                                        const keyword = event.target.getAttribute('data-keyword');
                                        if (window.showLoreTooltipForKeyword) {
                                            // Call global tooltip logic in editor.js
                                            window.showLoreTooltipForKeyword(keyword, event);
                                        }
                                        return true;
                                    }
                                    return false;
                                }
                            }
                        })
                    ];
                }
            });

            // Build UI
            this.container.innerHTML = `
                <div class="tiptap-toolbar" style="padding: 8px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary); display: flex; gap: 8px; align-items: center;">
                    <button class="btn btn-secondary btn-sm" data-command="bold"><b>B</b></button>
                    <button class="btn btn-secondary btn-sm" data-command="italic"><i>I</i></button>
                    <button class="btn btn-secondary btn-sm" data-command="strike"><strike>S</strike></button>
                    <div style="width: 1px; height: 24px; background: var(--border-color); margin: 0 4px;"></div>
                    <button class="btn btn-secondary btn-sm" data-command="h1">H1</button>
                    <button class="btn btn-secondary btn-sm" data-command="h2">H2</button>
                    <button class="btn btn-secondary btn-sm" data-command="h3">H3</button>
                    <div style="width: 1px; height: 24px; background: var(--border-color); margin: 0 4px;"></div>
                    <button class="btn btn-secondary btn-sm" data-command="bulletList">• Liste</button>
                    <button class="btn btn-secondary btn-sm" data-command="orderedList">1. Liste</button>
                </div>
                <div class="tiptap-content-area" style="padding: 16px; overflow-y: auto; height: calc(100% - 45px); cursor: text;"></div>
            `;

            const contentArea = this.container.querySelector('.tiptap-content-area');
            const toolbar = this.container.querySelector('.tiptap-toolbar');

            // Initialize TipTap
            this.tiptapEditor = new Editor({
                element: contentArea,
                extensions: [
                    StarterKit,
                    Markdown,
                    LoreHighlightExtension
                ],
                content: this.content,
                onUpdate: () => {
                    this.onChangeCallback();
                }
            });

            // Bind Toolbar Events
            toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const cmd = btn.dataset.command;
                
                if (cmd === 'bold') this.tiptapEditor.chain().focus().toggleBold().run();
                if (cmd === 'italic') this.tiptapEditor.chain().focus().toggleItalic().run();
                if (cmd === 'strike') this.tiptapEditor.chain().focus().toggleStrike().run();
                if (cmd === 'h1') this.tiptapEditor.chain().focus().toggleHeading({ level: 1 }).run();
                if (cmd === 'h2') this.tiptapEditor.chain().focus().toggleHeading({ level: 2 }).run();
                if (cmd === 'h3') this.tiptapEditor.chain().focus().toggleHeading({ level: 3 }).run();
                if (cmd === 'bulletList') this.tiptapEditor.chain().focus().toggleBulletList().run();
                if (cmd === 'orderedList') this.tiptapEditor.chain().focus().toggleOrderedList().run();
            });

        } catch (e) {
            console.error("TipTap failed to load:", e);
            this.container.innerHTML = '<div style="padding: 24px; color: var(--color-danger);">Fehler beim Laden von TipTap. Bitte prüfe deine Internetverbindung.</div>';
        }
    }

    getMarkdown() { 
        return this.tiptapEditor ? this.tiptapEditor.storage.markdown.getMarkdown() : this.content; 
    }
    
    getHTML() {
        return this.tiptapEditor ? this.tiptapEditor.getHTML() : '';
    }

    setMarkdown(md) { 
        this.content = md;
        if (this.tiptapEditor) {
            this.tiptapEditor.commands.setContent(md);
        }
    }

    insertText(text) { 
        if (this.tiptapEditor) {
            this.tiptapEditor.commands.insertContent(text);
        }
    }

    replaceSelection(text) { 
        if (this.tiptapEditor) {
            this.tiptapEditor.commands.insertContent(text);
        }
    }

    getSelectedText() { 
        if (!this.tiptapEditor) return '';
        const { from, to } = this.tiptapEditor.state.selection;
        return this.tiptapEditor.state.doc.textBetween(from, to, ' ');
    }

    setSelection(start, end) { 
        // Note: TipTap/ProseMirror selection requires position resolution. 
        // For simple string offsets, we need custom logic. Not fully supported in basic wrapper yet.
        if (this.tiptapEditor) {
            this.tiptapEditor.commands.setTextSelection({ from: start, to: end });
        }
    }

    changeMode(mode) { 
        // TipTap doesn't have a built-in markdown toggle mode like ToastUI.
        // It always acts as WYSIWYG but outputs Markdown via the plugin.
    }

    focus() { 
        if (this.tiptapEditor) this.tiptapEditor.commands.focus(); 
    }

    destroy() { 
        if (this.tiptapEditor) this.tiptapEditor.destroy();
        this.container.innerHTML = ''; 
    }
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
                const tipTap = new TipTapAdapter(container, options);
                await tipTap.init();
                return tipTap;
            case 'custom':
                return new CustomAdapter(container, options);
            case 'toastui':
            default:
                return new ToastUIAdapter(container, options);
        }
    }
};
