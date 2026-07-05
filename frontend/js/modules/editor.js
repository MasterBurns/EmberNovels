// 3. EDITOR & ZERO DATA LOSS LOGIC
async function openEditor(projectId, chapterId) {
    const saveStatus = document.getElementById('save-status');
    // Populate language selection dropdown
    const langSelect = document.getElementById('editor-language-select');
    
    // Get actual project original language flag/name if possible
    let originalLangText = `${t('branch_original_badge', 'Original')} (Deutsch)`;
    if (state.currentProject && state.currentProject.original_language) {
        const langMap = {
            'de': t('lang_de', 'Deutsch'),
            'en': t('lang_en', 'Englisch'),
            'fr': t('lang_fr', 'Französisch'),
            'es': t('lang_es', 'Spanisch'),
            'it': t('lang_it', 'Italienisch'),
            'ja': t('lang_ja', 'Japanisch'),
            'zh': t('lang_zh', 'Chinesisch')
        };
        const mapped = langMap[state.currentProject.original_language];
        if (mapped) originalLangText = `${t('branch_original_badge', 'Original')} (${mapped})`;
    }
    langSelect.innerHTML = `<option value="original">${originalLangText}</option>`;
    
    const initialLang = state.activeLanguage || 'original';
    
    try {
        const langResponse = await fetch(`${API_URL}/projects/${projectId}/languages`);
        if (langResponse.ok) {
            const languages = await langResponse.json();
            languages.forEach(lang => {
                const opt = document.createElement('option');
                opt.value = lang;
                opt.textContent = `Übersetzung: ${lang.toUpperCase()}`;
                langSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Could not fetch languages for dropdown", e);
    }
    
    // Restore and apply selection
    langSelect.value = initialLang;
    state.activeLanguage = initialLang;
    document.getElementById('btn-editor-translate-now').style.display = initialLang === 'original' ? 'none' : 'block';
    
    langSelect.onchange = async () => {
        state.activeLanguage = langSelect.value;
        const translateBtn = document.getElementById('btn-editor-translate-now');
        if (state.activeLanguage === 'original') {
            translateBtn.style.display = 'none';
        } else {
            translateBtn.style.display = 'block';
        }
        await reloadEditorChapterContent(projectId, chapterId);
    };

    // Fetch project's lore entries for keyword highlighting
    try {
        const loreResponse = await fetch(`${API_URL}/projects/${projectId}/lore`);
        state.loreList = loreResponse.ok ? await loreResponse.json() : [];
    } catch (e) {
        console.error("Could not fetch lore for editor highlighting", e);
        state.loreList = [];
    }
    
    try {
        // Initialize Toast UI Editor if not done yet
        if (!state.editor) {
            state.editor = new toastui.Editor({
                el: document.getElementById('editor-container'),
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
                ]
            });
            
            // Set up change listener
            state.editor.on('change', () => {
                if (state.loadingChapter) return;
                const content = state.editor.getMarkdown();
                handleEditorInput(content);
                
                // Highlight keywords in preview pane
                clearTimeout(state.highlightTimeout);
                state.highlightTimeout = setTimeout(highlightKeywordsInPreview, 300);
                
                // Update detected keywords list in the side panel
                clearTimeout(state.detectedKeywordsTimeout);
                state.detectedKeywordsTimeout = setTimeout(updateDetectedKeywords, 400);
            });
        }
        
        // Make sure theme matches
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        updateEditorTheme(currentTheme);

        // Load chapter content depending on active branch
        await reloadEditorChapterContent(projectId, chapterId);
        
        if (state.currentChapter) {
            updateWordCount(state.currentChapter.content || '');
        }
        saveStatus.textContent = 'Synchronisiert';
        
        // Start Autosave Timer (every X seconds checks if dirty, saves to .tmp)
        state.autosaveTimer = setInterval(handleAutosaveTick, state.autosaveInterval);
        
    } catch (e) {
        showToast(e.message, 'danger');
        navigateTo('project-details', { projectId });
    }
}

function handleEditorInput(content) {
    // 1. Mark State Dirty
    state.isDirty = true;
    
    // 2. Safe Autosave to LocalStorage immediately on keypress (Zero Data Loss Frontend)
    const storageKey = `ember_backup_${state.currentProject.id}_${state.currentChapter.id}`;
    localStorage.setItem(storageKey, content);
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = t('unsaved_changes_typing', 'Ungespeicherte Änderungen (Tippe...)');
    
    updateWordCount(content);

    // Track daily/session writing progress
    if (state.chapterWordCountOnLoad !== undefined) {
        const currentWords = content.trim() ? content.trim().split(/\s+/).length : 0;
        const diff = currentWords - state.chapterWordCountOnLoad;
        state.sessionWords = Math.max(0, diff);
    }
}

// Tick-based shadow saving to backend (.tmp file)
async function handleAutosaveTick() {
    if (state.activeLanguage !== 'original') return; // Skip autosave for translated branches
    if (!state.isDirty || !state.currentChapter) return;
    
    const content = state.editor ? state.editor.getMarkdown() : '';
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = t('autosaving', 'Automatisches Sichern...');
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/autosave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        if (response.ok) {
            saveStatus.textContent = t('auto_saved_shadow_copy', 'Auto-gesichert (Schattenkopie)');
        }
    } catch (e) {
        console.error("Autosave backend connection failed", e);
        saveStatus.textContent = t('local_backup_network_error', 'Lokale Sicherung aktiv (Netzwerkfehler)');
    }
}

// Explicit User Save (Ctrl+S or Click Save)
async function handleExplicitSave() {
    if (!state.currentChapter) return;
    
    const content = state.editor ? state.editor.getMarkdown() : '';
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = t('saving_permanently', 'Speichere endgültig...');
    
    try {
        const url = state.activeLanguage === 'original'
            ? `${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/save`
            : `${API_URL}/projects/${state.currentProject.id}/languages/${state.activeLanguage}/chapters/${state.currentChapter.id}`;
            
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        if (!response.ok) throw new Error("Save failed");
        
        // Reset dirty status
        state.isDirty = false;
        state.lastSavedContent = content;
        
        // Remove browser localStorage backup
        const storageKey = `ember_backup_${state.currentProject.id}_${state.currentChapter.id}`;
        localStorage.removeItem(storageKey);
        
        saveStatus.textContent = t('saved_status', 'Gesichert');
        showToast(t('changes_saved_backup_created', 'Änderungen dauerhaft gespeichert (.history Backup erstellt)'), 'success');
        
        // Trigger auto-backup if enabled
        performAutoBackup();
    } catch (e) {
        showToast(t('error_saving', 'Fehler beim Speichern: ') + e.message, 'danger');
        saveStatus.textContent = t('error_saving_status', 'Fehler beim Speichern');
    }
}

// Resolution for Crash Recovery Alert Banner
async function resolveRecovery(keep) {
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/recovery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keep_recovery: keep })
        });
        
        if (!response.ok) throw new Error("Resolution failed");
        
        document.getElementById('recovery-banner').style.display = 'none';
        
        if (keep) {
            // Load recovery content into editor
            const recoveredContent = state.currentChapter.recovery_content;
            if (state.editor) {
                state.editor.setMarkdown(recoveredContent);
            }
            updateWordCount(recoveredContent);
            state.isDirty = true;
            showToast(t('recovery_loaded_toast', 'Wiederherstellung geladen (Schattenkopie angewendet).'), 'success');
        } else {
            showToast(t('backup_discarded_toast', 'Sicherung verworfen. Originalversion geladen.'), 'info');
        }
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

function updateWordCount(text) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    document.getElementById('editor-word-count').textContent = `${t('words_lbl', 'Wörter')}: ${words}`;
}

// Editor visual configurations
function setEditorMode(mode) {
    const btnWysiwyg = document.getElementById('btn-editor-view-wysiwyg');
    const btnMarkdown = document.getElementById('btn-editor-view-markdown');
    
    if (!state.editor) return;
    
    if (mode === 'wysiwyg') {
        btnWysiwyg.classList.add('active');
        btnMarkdown.classList.remove('active');
        state.editor.changeMode('wysiwyg');
    } else {
        btnWysiwyg.classList.remove('active');
        btnMarkdown.classList.add('active');
        state.editor.changeMode('markdown');
        
        // Render highlights on switch
        setTimeout(highlightKeywordsInPreview, 150);
    }
}

function toggleEditorSplit() {
    const workspace = document.querySelector('.editor-workspace');
    const lorePanel = document.getElementById('editor-lore-panel');
    
    if (lorePanel.style.display === 'none') {
        lorePanel.style.display = 'flex';
        workspace.classList.add('editor-layout-split');
        
        // Set a friendly placeholder if empty
        const titleEl = document.getElementById('lore-quick-title');
        if (!titleEl.textContent || titleEl.textContent === 'Begriff' || titleEl.textContent === 'Lore-Quickview') {
            titleEl.textContent = 'Lore-Quickview';
            document.getElementById('lore-quick-type').textContent = 'Hinweis';
            document.getElementById('lore-quick-desc').innerHTML = 
                '<div style="padding: 12px; color: var(--text-muted); font-size: 13px;">Klicke auf ein markiertes Wort im Text oder markiere ein Wort und klicke auf "Aus Auswahl Lore erstellen", um Details anzuzeigen.</div>';
            document.getElementById('btn-lore-quick-open-wiki').style.display = 'none';
        }
        
        // Re-run highlights & scanning
        setTimeout(() => {
            highlightKeywordsInPreview();
            updateDetectedKeywords();
        }, 150);
    } else {
        lorePanel.style.display = 'none';
        workspace.classList.remove('editor-layout-split');
    }
}

async function handleCopyForWebnovel() {
    if (!state.currentChapter) return;
    try {
        let content = '';
        if (state.editorMode === 'wysiwyg' && window.toastEditor) {
            content = window.toastEditor.getHTML();
            content = content.replace(/<p><\/p>/g, '<br>');
        } else if (state.editorMode === 'markdown' && window.toastEditor) {
            content = window.toastEditor.getMarkdown();
        } else {
            content = state.currentChapter.content || '';
        }
        
        await navigator.clipboard.writeText(content);
        if (typeof showToast === 'function') {
            showToast(typeof t === 'function' ? t('copy_success', 'Text in die Zwischenablage kopiert!') : 'Kopiert!', 'success');
        }
    } catch (e) {
        if (typeof showToast === 'function') {
            showToast('Fehler beim Kopieren: ' + e.message, 'danger');
        }
    }
}

