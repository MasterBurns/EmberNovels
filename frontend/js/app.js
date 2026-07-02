// EmberNovels SPA App Logic

// Global state
let state = {
    currentView: 'projects', // projects, project-details, editor, trash, settings
    projects: [],
    trashedProjects: [],
    currentProject: null,
    currentChapter: null,
    autosaveTimer: null,
    autosaveInterval: 3000, // 3 seconds default
    isDirty: false,
    lastSavedContent: "",
    editor: null,
    loreList: [],
    editingLoreId: null,
    detectedKeywordsTimeout: null,
    activeLanguage: 'original',
    aiSettings: {}
};

// Base API URL
const API_URL = '/api';

// On Document Load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    navigateTo('projects');
    
    // Check local settings for autosave interval
    const savedInterval = localStorage.getItem('ember_autosave_interval');
    if (savedInterval) {
        state.autosaveInterval = parseInt(savedInterval, 10) * 1000;
        const input = document.getElementById('setting-autosave-interval');
        if (input) input.value = savedInterval;
    }
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('ember_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ember_theme', theme);
    
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeText.textContent = 'Light Mode';
    } else {
        themeIcon.textContent = '🌙';
        themeText.textContent = 'Dark Mode';
    }
    
    updateEditorTheme(theme);
}

function updateEditorTheme(theme) {
    if (!state.editor) return;
    const editorEl = document.querySelector('#editor-container .toastui-editor-defaultUI');
    if (editorEl) {
        if (theme === 'dark') {
            editorEl.classList.add('toastui-editor-theme-dark');
        } else {
            editorEl.classList.remove('toastui-editor-theme-dark');
        }
    }
}

// Navigation Router
function navigateTo(view, params = {}) {
    state.currentView = view;
    
    // Stop any existing autosave timers
    if (state.autosaveTimer) {
        clearInterval(state.autosaveTimer);
        state.autosaveTimer = null;
    }
    
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active-view');
    });
    
    // Deactivate all sidebar items
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });
    
    // Header setup defaults
    const headerTitle = document.getElementById('header-title');
    const headerAction = document.getElementById('btn-header-action');
    const btnBackProjects = document.getElementById('btn-back-to-projects');
    const btnBackDetails = document.getElementById('btn-back-to-project-details');
    const saveStatus = document.getElementById('save-status');
    
    headerAction.style.display = 'inline-flex';
    btnBackProjects.style.display = 'none';
    btnBackDetails.style.display = 'none';
    saveStatus.style.display = 'none';
    
    // Show target view
    const targetEl = document.getElementById(`view-${view}`);
    if (targetEl) {
        targetEl.classList.add('active-view');
    }
    
    // View-specific behavior
    switch (view) {
        case 'projects':
            document.getElementById('nav-projects').classList.add('active');
            headerTitle.textContent = 'Meine Romanprojekte';
            headerAction.textContent = '+ Neues Projekt';
            headerAction.onclick = () => openModal('modal-project');
            loadProjects();
            break;
            
        case 'project-details':
            document.getElementById('nav-projects').classList.add('active');
            btnBackProjects.style.display = 'inline-flex';
            btnBackProjects.onclick = () => navigateTo('projects');
            headerAction.textContent = '+ Kapitel hinzufügen';
            headerAction.onclick = () => openModal('modal-chapter');
            if (params.projectId) {
                loadProjectDetails(params.projectId);
                loadProjectLanguages(params.projectId);
            }
            break;
            
        case 'editor':
            document.getElementById('nav-projects').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => {
                // Warn user if uncommitted changes
                if (state.isDirty) {
                    if (confirm("Du hast ungespeicherte Änderungen! Möchtest du wirklich zurückgehen?")) {
                        navigateTo('project-details', { projectId: state.currentProject.id });
                    }
                } else {
                    navigateTo('project-details', { projectId: state.currentProject.id });
                }
            };
            headerAction.style.display = 'none';
            if (params.projectId && params.chapterId) {
                openEditor(params.projectId, params.chapterId);
            }
            break;
            
        case 'lore':
            document.getElementById('nav-lore').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => navigateTo('project-details', { projectId: state.currentProject.id });
            headerAction.style.display = 'none';
            headerTitle.textContent = `Lore-Datenbank: ${state.currentProject.title}`;
            loadLoreEntries();
            break;
            
        case 'trash':
            document.getElementById('nav-trash').classList.add('active');
            headerTitle.textContent = 'Papierkorb';
            headerAction.style.display = 'none';
            loadTrashedProjects();
            break;
            
        case 'settings':
            document.getElementById('nav-settings').classList.add('active');
            headerTitle.textContent = 'Einstellungen';
            headerAction.style.display = 'none';
            loadAISettingsInForm();
            break;
    }
}

// Event Listeners setup
function setupEventListeners() {
    // Nav sidebar clicks
    document.getElementById('nav-projects').addEventListener('click', () => navigateTo('projects'));
    document.getElementById('nav-trash').addEventListener('click', () => navigateTo('projects')); // will trigger trash if active, see below
    document.getElementById('nav-trash').addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('trash');
    });
    document.getElementById('nav-settings').addEventListener('click', () => navigateTo('settings'));
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
    
    // Project and Chapter creation triggers
    const cardCreateProject = document.getElementById('card-create-project');
    if (cardCreateProject) {
        cardCreateProject.addEventListener('click', () => openModal('modal-project'));
    }
    const btnCreateChapter = document.getElementById('btn-create-chapter');
    if (btnCreateChapter) {
        btnCreateChapter.addEventListener('click', () => openModal('modal-chapter'));
    }
    
    // Submit forms
    document.getElementById('btn-submit-project').addEventListener('click', handleCreateProject);
    document.getElementById('btn-submit-chapter').addEventListener('click', handleCreateChapter);
    
    // Settings save
    document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);
    
    // AI Settings provider change panel display toggle
    document.getElementById('setting-ai-provider').addEventListener('change', (e) => {
        const val = e.target.value;
        document.getElementById('panel-settings-ollama').style.display = val === 'ollama' ? 'flex' : 'none';
        document.getElementById('panel-settings-gemini').style.display = val === 'gemini' ? 'flex' : 'none';
        document.getElementById('panel-settings-openai').style.display = val === 'openai' ? 'flex' : 'none';
        document.getElementById('panel-settings-anthropic').style.display = val === 'anthropic' ? 'flex' : 'none';
    });
    
    // Editor controls
    document.getElementById('btn-editor-view-wysiwyg').addEventListener('click', () => setEditorMode('wysiwyg'));
    document.getElementById('btn-editor-view-markdown').addEventListener('click', () => setEditorMode('markdown'));
    document.getElementById('btn-editor-split').addEventListener('click', toggleEditorSplit);
    document.getElementById('btn-editor-save').addEventListener('click', handleExplicitSave);
    document.getElementById('btn-close-lore-panel').addEventListener('click', () => {
        document.getElementById('editor-lore-panel').style.display = 'none';
        document.querySelector('.editor-workspace').classList.remove('editor-layout-split');
    });
    
    // Shortcut for Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            if (state.currentView === 'editor') {
                e.preventDefault();
                handleExplicitSave();
            }
        }
    });
    
    // Recovery actions
    document.getElementById('btn-recovery-keep').addEventListener('click', () => {
        if (state.currentChapter && state.currentChapter.has_recovery) {
            renderDiffMergeView(state.currentChapter.content, state.currentChapter.recovery_content);
            openModal('modal-merge');
        }
    });
    document.getElementById('btn-recovery-discard').addEventListener('click', () => resolveRecovery(false));

    // Merge modal triggers
    document.getElementById('btn-merge-select-all').addEventListener('click', () => {
        if (state.mergeLines) {
            state.mergeLines.forEach(item => {
                if (item.checkbox) {
                    if (item.type === 'added') item.checkbox.checked = true;
                    if (item.type === 'removed') item.checkbox.checked = false;
                }
            });
        }
    });
    
    document.getElementById('btn-merge-deselect-all').addEventListener('click', () => {
        if (state.mergeLines) {
            state.mergeLines.forEach(item => {
                if (item.checkbox) {
                    if (item.type === 'added') item.checkbox.checked = false;
                    if (item.type === 'removed') item.checkbox.checked = true;
                }
            });
        }
    });
    
    document.getElementById('btn-merge-submit').addEventListener('click', applyMerge);

    // Lore Database triggers
    document.getElementById('nav-lore').addEventListener('click', () => {
        if (state.currentProject) {
            navigateTo('lore');
        } else {
            showToast('Bitte wähle zuerst ein Projekt aus, um auf seine Lore-Datenbank zuzugreifen.', 'warning');
            navigateTo('projects');
        }
    });
    
    document.getElementById('btn-wiki-create').addEventListener('click', () => openLoreModal());
    document.getElementById('btn-view-lore').addEventListener('click', () => navigateTo('lore'));
    document.getElementById('wiki-search').addEventListener('input', filterLoreEntries);
    document.getElementById('wiki-filter-category').addEventListener('change', filterLoreEntries);
    document.getElementById('btn-submit-lore').addEventListener('click', handleSaveLore);
    
    document.getElementById('btn-editor-create-lore').addEventListener('click', () => {
        if (!state.editor) return;
        const selectedText = state.editor.getSelectedText().trim();
        if (!selectedText) {
            showToast('Bitte markiere zuerst ein Wort oder einen Begriff im Text.', 'warning');
            return;
        }
        openLoreModal(null, selectedText);
    });
    
    // Editor keyword event delegation click listener
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
        editorContainer.addEventListener('click', (e) => {
            const keywordSpan = e.target.closest('.smart-keyword');
            if (keywordSpan) {
                e.preventDefault();
                e.stopPropagation();
                const loreId = keywordSpan.getAttribute('data-lore-id');
                showLoreQuickviewById(loreId);
            }
        });
    }

    // Bind export wizard
    document.getElementById('btn-open-export-modal').addEventListener('click', openExportModal);
    document.getElementById('btn-export-select-all').addEventListener('click', () => {
        document.querySelectorAll('.export-chapter-chk').forEach(c => c.checked = true);
    });
    document.getElementById('btn-export-deselect-all').addEventListener('click', () => {
        document.querySelectorAll('.export-chapter-chk').forEach(c => c.checked = false);
    });
    document.getElementById('btn-submit-export').addEventListener('click', () => {
        const format = document.getElementById('export-format-select').value;
        const selectedChapterIds = [];
        document.querySelectorAll('.export-chapter-chk:checked').forEach(c => selectedChapterIds.push(c.value));
        if (selectedChapterIds.length === 0) {
            showToast("Bitte wähle mindestens ein Kapitel für den Export aus.", "warning");
            return;
        }
        closeModal('modal-export');
        handleExport(format, selectedChapterIds);
    });

    // Language Branch triggers
    document.getElementById('btn-create-language').addEventListener('click', () => openModal('modal-language'));
    document.getElementById('btn-submit-language').addEventListener('click', handleCreateLanguageBranch);
    
    // AI assistance triggers
    document.getElementById('btn-ai-correct').addEventListener('click', () => handleAIAssistant('correct'));
    document.getElementById('btn-ai-continue').addEventListener('click', () => handleAIAssistant('continue'));
    
    // Manual Translate Trigger
    document.getElementById('btn-editor-translate-now').addEventListener('click', handleManualTranslate);
}

// 1. PROJECTS LOGIC
async function loadProjects() {
    const grid = document.getElementById('projects-grid');
    // Clear dynamic cards except the creation one
    const createCard = document.getElementById('card-create-project');
    grid.innerHTML = '';
    grid.appendChild(createCard);
    
    try {
        const response = await fetch(`${API_URL}/projects`);
        if (!response.ok) throw new Error("Could not load projects");
        state.projects = await response.json();
        
        state.projects.forEach(p => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title">${escapeHtml(p.title)}</div>
                <div class="card-desc">${escapeHtml(p.description || "Keine Beschreibung.")}</div>
                <div class="card-meta">
                    <span>Autor: ${escapeHtml(p.author || "Unbekannt")}</span>
                    <span>Ziel: ${p.word_count_goal} W</span>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn btn-delete" title="In den Papierkorb verschieben">🗑️</button>
                </div>
            `;
            
            // Delete listener
            card.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Möchtest du das Projekt "${p.title}" wirklich in den Papierkorb verschieben?`)) {
                    deleteProject(p.id);
                }
            });
            
            // View details listener
            card.addEventListener('click', () => {
                navigateTo('project-details', { projectId: p.id });
            });
            
            grid.appendChild(card);
        });
        
    } catch (e) {
        showToast("Fehler beim Laden der Projekte: " + e.message, "danger");
    }
}

async function handleCreateProject() {
    const title = document.getElementById('project-title').value;
    const author = document.getElementById('project-author').value;
    const description = document.getElementById('project-description').value;
    
    if (!title.trim()) {
        showToast("Bitte gib einen Projekttitel an.", "warning");
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, author, description })
        });
        
        if (!response.ok) throw new Error("Failed to create project");
        const newProject = await response.json();
        closeModal('modal-project');
        showToast(`Projekt "${newProject.title}" erfolgreich erstellt!`, 'success');
        
        // Reset fields
        document.getElementById('project-title').value = '';
        document.getElementById('project-author').value = '';
        document.getElementById('project-description').value = '';
        
        navigateTo('project-details', { projectId: newProject.id });
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function deleteProject(id) {
    try {
        const response = await fetch(`${API_URL}/projects/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Failed to delete project");
        showToast("Projekt in den Papierkorb verschoben.", "success");
        loadProjects();
    } catch (e) {
        showToast(e.message, "danger");
    }
}

// 2. PROJECT DETAILS LOGIC
async function loadProjectDetails(projectId) {
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}`);
        if (!response.ok) throw new Error("Project details not found");
        const project = await response.json();
        state.currentProject = project;
        
        // Update header
        document.getElementById('header-title').textContent = project.title;
        
        // Update Stats
        let totalWords = 0;
        project.chapters.forEach(c => totalWords += c.word_count);
        
        document.getElementById('stat-total-words').textContent = totalWords.toLocaleString();
        document.getElementById('stat-word-goal').textContent = project.word_count_goal.toLocaleString();
        document.getElementById('stat-daily-goal').textContent = `${project.daily_word_count_goal} Wörter`;
        
        const dateStr = new Date(project.created_at).toLocaleDateString('de-DE');
        document.getElementById('stat-created-at').textContent = dateStr;
        
        // Render Chapter List
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';
        
        if (project.chapters.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">Keine Kapitel angelegt. Erstelle dein erstes Kapitel!</div>`;
        } else {
            project.chapters.forEach(c => {
                const item = document.createElement('div');
                item.className = 'list-item';
                if (c.has_recovery) {
                    item.style.borderColor = 'var(--color-warning)';
                }
                item.innerHTML = `
                    <div class="list-item-info">
                        <div class="list-item-title">
                            ${escapeHtml(c.title)} 
                            ${c.has_recovery ? '<span style="color: var(--color-warning); font-size: 11px; font-weight: bold; margin-left: 8px;">⚠️ Wiederherstellung verfügbar</span>' : ''}
                        </div>
                        <div class="list-item-meta">${c.word_count} Wörter · Letzte Änderung: ${new Date(c.updated_at).toLocaleString('de-DE')}</div>
                    </div>
                    <div class="list-item-actions">
                        <button class="card-action-btn btn-delete" title="In den Papierkorb verschieben">🗑️</button>
                    </div>
                `;
                
                // Open Editor
                item.addEventListener('click', () => {
                    navigateTo('editor', { projectId: project.id, chapterId: c.id });
                });
                
                // Chapter Delete listener
                item.querySelector('.btn-delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Möchtest du das Kapitel "${c.title}" wirklich löschen?`)) {
                        deleteChapter(project.id, c.id);
                    }
                });
                
                list.appendChild(item);
            });
        }
    } catch (e) {
        showToast(e.message, 'danger');
        navigateTo('projects');
    }
}

async function handleCreateChapter() {
    const title = document.getElementById('chapter-title').value;
    if (!title.trim()) {
        showToast("Bitte gib einen Kapiteltitel an.", "warning");
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        
        if (!response.ok) throw new Error("Failed to create chapter");
        const chapter = await response.json();
        closeModal('modal-chapter');
        showToast(`Kapitel "${chapter.title}" angelegt.`, 'success');
        
        document.getElementById('chapter-title').value = '';
        
        // Open the newly created chapter in editor
        navigateTo('editor', { projectId: state.currentProject.id, chapterId: chapter.id });
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function deleteChapter(projectId, chapterId) {
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/chapters/${chapterId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Failed to delete chapter");
        showToast("Kapitel gelöscht.", "success");
        loadProjectDetails(projectId);
    } catch (e) {
        showToast(e.message, "danger");
    }
}

// 3. EDITOR & ZERO DATA LOSS LOGIC
async function openEditor(projectId, chapterId) {
    // Populate language selection dropdown
    const langSelect = document.getElementById('editor-language-select');
    langSelect.innerHTML = '<option value="original">Deutsch (Original)</option>';
    state.activeLanguage = 'original';
    document.getElementById('btn-editor-translate-now').style.display = 'none';
    
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
    saveStatus.textContent = 'Ungespeicherte Änderungen (Tippe...)';
    
    updateWordCount(content);
}

// Tick-based shadow saving to backend (.tmp file)
async function handleAutosaveTick() {
    if (state.activeLanguage !== 'original') return; // Skip autosave for translated branches
    if (!state.isDirty || !state.currentChapter) return;
    
    const content = state.editor ? state.editor.getMarkdown() : '';
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = 'Automatisches Sichern...';
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/autosave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        if (response.ok) {
            saveStatus.textContent = 'Auto-gesichert (Schattenkopie)';
        }
    } catch (e) {
        console.error("Autosave backend connection failed", e);
        saveStatus.textContent = 'Lokale Sicherung aktiv (Netzwerkfehler)';
    }
}

// Explicit User Save (Ctrl+S or Click Save)
async function handleExplicitSave() {
    if (!state.currentChapter) return;
    
    const content = state.editor ? state.editor.getMarkdown() : '';
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = 'Speichere endgültig...';
    
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
        
        saveStatus.textContent = 'Gesichert';
        showToast('Änderungen dauerhaft gespeichert (.history Backup erstellt)', 'success');
    } catch (e) {
        showToast('Fehler beim Speichern: ' + e.message, 'danger');
        saveStatus.textContent = 'Fehler beim Speichern';
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
            showToast('Wiederherstellung geladen (Schattenkopie angewendet).', 'success');
        } else {
            showToast('Sicherung verworfen. Originalversion geladen.', 'info');
        }
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

function updateWordCount(text) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    document.getElementById('editor-word-count').textContent = `Wörter: ${words}`;
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

// 4. TRASH LOGIC
async function loadTrashedProjects() {
    const grid = document.getElementById('trash-grid');
    const emptyMsg = document.getElementById('trash-empty-msg');
    grid.innerHTML = '';
    
    try {
        const response = await fetch(`${API_URL}/projects/trashed`);
        if (!response.ok) throw new Error("Could not load trash");
        state.trashedProjects = await response.json();
        
        if (state.trashedProjects.length === 0) {
            emptyMsg.style.display = 'block';
            grid.style.display = 'none';
        } else {
            emptyMsg.style.display = 'none';
            grid.style.display = 'grid';
            
            state.trashedProjects.forEach(p => {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.borderColor = 'var(--border-color)';
                card.innerHTML = `
                    <div class="card-title" style="text-decoration: line-through;">${escapeHtml(p.title)}</div>
                    <div class="card-desc">${escapeHtml(p.description || "Keine Beschreibung.")}</div>
                    <div class="card-meta">
                        <span>Gelöscht am: ${new Date(p.deleted_at || Date.now()).toLocaleDateString('de-DE')}</span>
                    </div>
                    <div class="card-actions" style="opacity: 1;">
                        <button class="card-action-btn btn-restore" title="Wiederherstellen">🔄</button>
                        <button class="card-action-btn btn-delete btn-permanent" title="Endgültig löschen" style="background-color: rgba(239,68,68,0.1); color: var(--color-danger);">❌</button>
                    </div>
                `;
                
                // Restore listener
                card.querySelector('.btn-restore').addEventListener('click', (e) => {
                    e.stopPropagation();
                    restoreProject(p.id);
                });
                
                // Permanent Delete listener
                card.querySelector('.btn-permanent').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`ACHTUNG: Möchtest du das Projekt "${p.title}" wirklich dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden!`)) {
                        permanentDeleteProject(p.id);
                    }
                });
                
                grid.appendChild(card);
            });
        }
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function restoreProject(id) {
    try {
        const response = await fetch(`${API_URL}/projects/${id}/restore`, { method: 'POST' });
        if (!response.ok) throw new Error("Could not restore project");
        showToast("Projekt erfolgreich wiederhergestellt!", "success");
        loadTrashedProjects();
    } catch (e) {
        showToast(e.message, "danger");
    }
}

async function permanentDeleteProject(id) {
    try {
        const response = await fetch(`${API_URL}/projects/${id}/permanent`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Failed to delete project permanently");
        showToast("Projekt dauerhaft gelöscht.", "success");
        loadTrashedProjects();
    } catch (e) {
        showToast(e.message, "danger");
    }
}

// UTILITY FUNCTIONS
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(message, type = 'primary') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    
    toast.innerHTML = `
        <span>${icon}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'toast-in 0.3s reverse forwards ease-out';
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }, 4000);
}

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Extended prototype helper for capitalizing string title
String.prototype.title = function() {
    return this.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// Recovery Diff Merge Helpers

function computeDiff(linesA, linesB) {
    const matrix = Array(linesA.length + 1).fill().map(() => Array(linesB.length + 1).fill(0));
    for (let i = 1; i <= linesA.length; i++) {
        for (let j = 1; j <= linesB.length; j++) {
            if (linesA[i - 1] === linesB[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }
    
    let i = linesA.length;
    let j = linesB.length;
    const diff = [];
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
            diff.unshift({ type: 'unchanged', text: linesA[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift({ type: 'added', text: linesB[j - 1] });
            j--;
        } else {
            diff.unshift({ type: 'removed', text: linesA[i - 1] });
            i--;
        }
    }
    return diff;
}

function renderDiffMergeView(originalText, recoveryText) {
    const linesA = originalText.split('\n');
    const linesB = recoveryText.split('\n');
    const diff = computeDiff(linesA, linesB);
    
    const container = document.getElementById('merge-diff-container');
    container.innerHTML = '';
    
    state.mergeLines = [];
    
    diff.forEach((item, index) => {
        const lineEl = document.createElement('div');
        lineEl.className = `diff-line diff-line-${item.type}`;
        
        // Line number
        const numEl = document.createElement('div');
        numEl.className = 'diff-line-num';
        numEl.textContent = index + 1;
        lineEl.appendChild(numEl);
        
        // Action checkbox
        const actionEl = document.createElement('div');
        actionEl.className = 'diff-line-action';
        
        let checkbox = null;
        if (item.type === 'added') {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true; // checked by default
            actionEl.appendChild(checkbox);
        } else if (item.type === 'removed') {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = false; // unchecked by default (we accept removal)
            actionEl.appendChild(checkbox);
        } else {
            // unchanged placeholder
            const placeholder = document.createElement('span');
            placeholder.style.width = '16px';
            actionEl.appendChild(placeholder);
        }
        lineEl.appendChild(actionEl);
        
        // Prefix indicator
        const prefixEl = document.createElement('span');
        prefixEl.className = 'diff-line-prefix';
        prefixEl.textContent = item.type === 'added' ? '+' : (item.type === 'removed' ? '-' : ' ');
        lineEl.appendChild(prefixEl);
        
        // Line content
        const contentEl = document.createElement('div');
        contentEl.className = 'diff-line-content';
        contentEl.textContent = item.text;
        lineEl.appendChild(contentEl);
        
        container.appendChild(lineEl);
        
        state.mergeLines.push({
            type: item.type,
            text: item.text,
            checkbox: checkbox
        });
    });
}

async function applyMerge() {
    const finalLines = [];
    state.mergeLines.forEach(item => {
        if (item.type === 'unchanged') {
            finalLines.push(item.text);
        } else if (item.type === 'added') {
            if (item.checkbox && item.checkbox.checked) {
                finalLines.push(item.text);
            }
        } else if (item.type === 'removed') {
            if (item.checkbox && item.checkbox.checked) {
                finalLines.push(item.text);
            }
        }
    });
    
    const mergedText = finalLines.join('\n');
    
    if (state.editor) {
        state.editor.setMarkdown(mergedText);
    }
    
    state.isDirty = true;
    
    closeModal('modal-merge');
    
    // Discard the temp file on the backend as we've completed the merge
    await resolveRecovery(false);
    
    showToast('Änderungen erfolgreich zusammengeführt!', 'success');
}

// ==========================================
// 2.5 LORE / WIKI LOGIC
// ==========================================

async function loadLoreEntries() {
    if (!state.currentProject) return;
    
    const listContainer = document.getElementById('wiki-list');
    listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted);">Lade Einträge...</div>';
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/lore`);
        if (!response.ok) throw new Error("Could not load lore database");
        state.loreList = await response.json();
        renderLoreList(state.loreList);
    } catch (e) {
        showToast("Fehler beim Laden der Lore: " + e.message, "danger");
    }
}

function renderLoreList(entries) {
    const listContainer = document.getElementById('wiki-list');
    listContainer.innerHTML = '';
    
    if (entries.length === 0) {
        listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">Keine Einträge gefunden.</div>';
        return;
    }
    
    entries.forEach(entry => {
        const el = document.createElement('div');
        el.className = 'list-item';
        el.style.padding = '10px 14px';
        el.innerHTML = `
            <div class="list-item-info">
                <div class="list-item-title" style="font-size: 14px; font-weight: 500;">${escapeHtml(entry.name)}</div>
                <div class="list-item-meta" style="font-size: 11px;">${translateCategory(entry.category)}</div>
            </div>
        `;
        el.addEventListener('click', () => showLoreDetail(entry.id));
        listContainer.appendChild(el);
    });
}

function filterLoreEntries() {
    const searchVal = document.getElementById('wiki-search').value.toLowerCase().trim();
    const catVal = document.getElementById('wiki-filter-category').value;
    
    const filtered = state.loreList.filter(entry => {
        const matchesSearch = entry.name.toLowerCase().includes(searchVal) || 
                              (entry.short_description || "").toLowerCase().includes(searchVal) ||
                              entry.keywords.some(k => k.toLowerCase().includes(searchVal));
                              
        const matchesCat = catVal === 'all' || entry.category === catVal;
        
        return matchesSearch && matchesCat;
    });
    
    renderLoreList(filtered);
}

function openLoreModal(loreId = null, prefilledName = null) {
    state.editingLoreId = loreId;
    
    const titleEl = document.getElementById('lore-modal-title');
    const nameEl = document.getElementById('lore-name');
    const categoryEl = document.getElementById('lore-category');
    const keywordsEl = document.getElementById('lore-keywords');
    const shortDescEl = document.getElementById('lore-short-desc');
    const descEl = document.getElementById('lore-desc');
    
    // Render project assignment checkboxes
    renderLoreProjectCheckboxes(loreId);
    
    if (loreId) {
        // Edit mode
        titleEl.textContent = 'Lore-Eintrag bearbeiten';
        const entry = state.loreList.find(e => e.id === loreId);
        if (entry) {
            nameEl.value = entry.name;
            categoryEl.value = entry.category;
            keywordsEl.value = entry.keywords.join(', ');
            shortDescEl.value = entry.short_description;
            descEl.value = entry.description;
        }
    } else {
        // Create mode
        titleEl.textContent = 'Neuer Lore-Eintrag';
        nameEl.value = prefilledName || '';
        categoryEl.value = 'character';
        keywordsEl.value = prefilledName || '';
        shortDescEl.value = '';
        descEl.value = '';
    }
    
    openModal('modal-lore');
}

function renderLoreProjectCheckboxes(loreId = null) {
    const container = document.getElementById('lore-projects-checkboxes');
    container.innerHTML = '';
    
    const entry = loreId ? state.loreList.find(e => e.id === loreId) : null;
    const assignedProjectIds = entry ? (entry.project_ids || [state.currentProject.id]) : [state.currentProject.id];
    
    state.projects.forEach(project => {
        const itemEl = document.createElement('div');
        itemEl.style.display = 'flex';
        itemEl.style.alignItems = 'center';
        itemEl.style.gap = '8px';
        itemEl.style.marginBottom = '4px';
        
        const isCurrent = project.id === state.currentProject.id;
        const isChecked = assignedProjectIds.includes(project.id) || isCurrent;
        
        itemEl.innerHTML = `
            <input type="checkbox" id="lore-project-chk-${project.id}" class="lore-project-chk" value="${project.id}" 
                   ${isChecked ? 'checked' : ''} ${isCurrent ? 'disabled' : ''}>
            <label for="lore-project-chk-${project.id}" style="font-size: 13px; cursor: ${isCurrent ? 'default' : 'pointer'};">
                ${escapeHtml(project.title)} ${isCurrent ? '<span style="color: var(--text-muted); font-size: 11px;">(Aktuelles Projekt)</span>' : ''}
            </label>
        `;
        container.appendChild(itemEl);
    });
}

async function handleSaveLore() {
    if (!state.currentProject) return;
    
    const name = document.getElementById('lore-name').value.trim();
    const category = document.getElementById('lore-category').value;
    const keywordsRaw = document.getElementById('lore-keywords').value;
    const short_description = document.getElementById('lore-short-desc').value.trim();
    const description = document.getElementById('lore-desc').value;
    
    if (!name) {
        showToast("Bitte gib dem Eintrag einen Namen.", "warning");
        return;
    }
    
    // Process keywords: split by comma, trim
    const keywords = keywordsRaw.split(',')
                                .map(k => k.trim())
                                .filter(k => k.length > 0);
                                
    // If empty, default to name
    if (keywords.length === 0) {
        keywords.push(name);
    }
    
    // Gather selected project IDs
    const project_ids = [];
    document.querySelectorAll('.lore-project-chk').forEach(chk => {
        if (chk.checked || chk.value === state.currentProject.id) {
            project_ids.push(chk.value);
        }
    });
    
    const payload = { name, category, short_description, description, keywords, project_ids };
    
    const isEdit = !!state.editingLoreId;
    const url = isEdit 
        ? `${API_URL}/projects/${state.currentProject.id}/lore/${state.editingLoreId}`
        : `${API_URL}/projects/${state.currentProject.id}/lore`;
        
    try {
        const response = await fetch(url, {
            method: isEdit ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error("Could not save lore entry");
        
        const saved = await response.json();
        closeModal('modal-lore');
        showToast(`Eintrag "${saved.name}" erfolgreich gespeichert!`, 'success');
        
        // Reload list
        await loadLoreEntries();
        
        // If edit, re-render details
        if (isEdit) {
            showLoreDetail(state.editingLoreId);
        } else {
            showLoreDetail(saved.id);
        }
        
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function deleteLoreEntry(loreId) {
    if (!confirm("Möchtest du diesen Lore-Eintrag wirklich in den Papierkorb verschieben?")) return;
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/lore/${loreId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error("Could not delete lore entry");
        
        showToast("Eintrag gelöscht.", "success");
        
        // Reset article panel
        const container = document.getElementById('wiki-article-container');
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 48px; margin: auto;">
                <span style="font-size: 48px; display: block; margin-bottom: 16px;">📖</span>
                <p>Wähle einen Lore-Eintrag aus der Liste aus oder erstelle einen neuen, um Details anzuzeigen.</p>
            </div>
        `;
        
        loadLoreEntries();
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

function showLoreDetail(loreId) {
    const entry = state.loreList.find(e => e.id === loreId);
    if (!entry) return;
    
    const container = document.getElementById('wiki-article-container');
    container.innerHTML = `
        <div class="wiki-detail-header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
            <div>
                <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">${escapeHtml(entry.name)}</h2>
                <span style="font-size: 11px; background-color: var(--color-primary-light); color: var(--color-primary); padding: 3px 8px; border-radius: 4px; font-weight: 600;">${translateCategory(entry.category)}</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="btn-wiki-edit-act" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px;">✏️ Bearbeiten</button>
                <button id="btn-wiki-delete-act" class="btn btn-secondary btn-danger" style="padding: 6px 12px; font-size: 13px; color: #fff;">🗑️ Löschen</button>
            </div>
        </div>
        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px; font-style: italic;">
            ${escapeHtml(entry.short_description || "Keine Kurzbeschreibung.")}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 20px;">
            <strong>Keywords:</strong> ${entry.keywords.map(k => `<span style="background-color: var(--bg-base); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 4px; margin-right: 4px;">${escapeHtml(k)}</span>`).join('')}
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin-bottom: 20px;">
        <div id="wiki-rendered-markdown" class="editor-preview-content"></div>
    `;
    
    // Bind buttons
    document.getElementById('btn-wiki-edit-act').addEventListener('click', () => openLoreModal(entry.id));
    document.getElementById('btn-wiki-delete-act').addEventListener('click', () => deleteLoreEntry(entry.id));
    
    // Render Markdown full article using Toast UI Viewer
    toastui.Editor.factory({
        el: document.getElementById('wiki-rendered-markdown'),
        viewer: true,
        initialValue: entry.description || '_Keine ausführliche Beschreibung vorhanden._',
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    });
}

function showLoreQuickviewById(loreId) {
    if (!state.loreList || state.loreList.length === 0) return;
    
    const entry = state.loreList.find(e => e.id === loreId);
    if (!entry) return;
    
    // Open split panel
    const workspace = document.querySelector('.editor-workspace');
    const lorePanel = document.getElementById('editor-lore-panel');
    
    lorePanel.style.display = 'flex';
    workspace.classList.add('editor-layout-split');
    
    // Populate panel elements
    document.getElementById('lore-quick-title').textContent = entry.name;
    document.getElementById('lore-quick-type').textContent = translateCategory(entry.category);
    
    const descEl = document.getElementById('lore-quick-desc');
    descEl.innerHTML = '';
    
    // Render detail Markdown in quickview sidebar using Toast UI Viewer
    toastui.Editor.factory({
        el: descEl,
        viewer: true,
        initialValue: entry.description || entry.short_description || '_Keine Beschreibung vorhanden._',
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    });
    
    // Show and wire up "Im Wiki öffnen" button
    const openWikiBtn = document.getElementById('btn-lore-quick-open-wiki');
    if (openWikiBtn) {
        openWikiBtn.style.display = 'block';
        openWikiBtn.onclick = () => {
            navigateTo('lore');
            setTimeout(() => showLoreDetail(loreId), 50);
        };
    }
}

function translateCategory(cat) {
    switch (cat) {
        case 'character': return 'Charakter';
        case 'location': return 'Ort / Schauplatz';
        case 'item': return 'Objekt / Gegenstand';
        case 'lore': return 'Begriff / Sonstiges';
        default: return 'Lore';
    }
}

// Smart keyword parser

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightKeywordsInPreview() {
    // Only query the active editor preview pane, not any other viewers
    const previewContainer = document.querySelector('#editor-container .toastui-editor-md-preview .toastui-editor-contents');
    if (!previewContainer || !state.loreList || state.loreList.length === 0) return;
    
    // Clean up any previous highlights to avoid nested elements
    const wrappers = previewContainer.querySelectorAll('.smart-keyword-wrapper');
    wrappers.forEach(w => {
        const parent = w.parentNode;
        if (parent) {
            while (w.firstChild) {
                parent.insertBefore(w.firstChild, w);
            }
            parent.removeChild(w);
        }
    });
    
    // Re-merge adjacent text nodes that were split by unwrapping
    previewContainer.normalize();
    
    // Build keywords list
    const allKeywords = [];
    state.loreList.forEach(item => {
        item.keywords.forEach(kw => {
            if (kw.trim()) {
                allKeywords.push({ keyword: kw.trim(), loreId: item.id, item: item });
            }
        });
    });
    if (allKeywords.length === 0) return;
    
    // Sort keywords by length desc so longer words match first (e.g. "Erzmagier" before "Erz")
    allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);
    
    // Build unified RegExp for single-pass replacement
    const regexParts = allKeywords.map(kwObj => escapeRegExp(kwObj.keyword));
    const regex = new RegExp(`(?<![a-zA-Z0-9äöüÄÖÜß])(${regexParts.join('|')})(?![a-zA-Z0-9äöüÄÖÜß])`, 'gi');
    
    highlightKeywords(previewContainer, regex, allKeywords);
}

function highlightKeywords(node, regex, allKeywords) {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue;
        if (!text.trim()) return;
        
        let matched = false;
        const newHtml = escapeHtml(text).replace(regex, (match) => {
            const matchLower = match.toLowerCase();
            const kwObj = allKeywords.find(k => k.keyword.toLowerCase() === matchLower);
            if (kwObj) {
                matched = true;
                return `<span class="smart-keyword" data-lore-id="${kwObj.loreId}" title="${escapeHtml(kwObj.item.short_description || '')}">${escapeHtml(match)}</span>`;
            }
            return match;
        });
        
        if (matched) {
            const span = document.createElement('span');
            span.className = 'smart-keyword-wrapper';
            span.innerHTML = newHtml;
            node.parentNode.replaceChild(span, node);
        }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const name = node.nodeName.toUpperCase();
        // Skip links, existing smart-keyword spans, inputs, scripts, style sheets
        if (name === 'A' || name === 'TEXTAREA' || name === 'INPUT' || name === 'SCRIPT' || name === 'STYLE' || node.classList.contains('smart-keyword')) {
            return;
        }
        const children = Array.from(node.childNodes);
        children.forEach(child => highlightKeywords(child, regex, allKeywords));
    }
}

// Expose openLoreModal and deleteLoreEntry globally so onclick in generated HTML works
window.openLoreModal = openLoreModal;
window.deleteLoreEntry = deleteLoreEntry;

// ==========================================
// C. EXPORT & DETECTED KEYWORDS ENGINE
// ==========================================

async function handleExport(format, chapterIds = null) {
    if (!state.currentProject) return;
    
    showToast(`Exportiere Buch als ${format.toUpperCase()}...`, 'info');
    
    try {
        const url = `${API_URL}/projects/${state.currentProject.id}/export/${format}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapter_ids: chapterIds })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Export fehlgeschlagen.");
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = downloadUrl;
        
        // Extract filename from content-disposition header if available
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `${state.currentProject.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format}`;
        if (contentDisposition) {
            const matches = /filename="?([^"]+)"?/.exec(contentDisposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
        
        showToast(`Export als ${format.toUpperCase()} erfolgreich abgeschlossen!`, 'success');
    } catch (e) {
        showToast(`Fehler beim Export: ${e.message}`, 'danger');
    }
}

function openExportModal() {
    if (!state.currentProject) return;
    
    const list = document.getElementById('export-chapters-list');
    list.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">Lade Kapitel...</div>';
    
    fetch(`${API_URL}/projects/${state.currentProject.id}/chapters`)
        .then(res => res.json())
        .then(chapters => {
            list.innerHTML = '';
            if (chapters.length === 0) {
                list.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">Keine aktiven Kapitel vorhanden.</div>';
                return;
            }
            
            chapters.forEach(ch => {
                const item = document.createElement('div');
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '8px';
                item.style.marginBottom = '6px';
                
                item.innerHTML = `
                    <input type="checkbox" id="export-ch-${ch.id}" class="export-chapter-chk" value="${ch.id}" checked>
                    <label for="export-ch-${ch.id}" style="font-size: 13px; cursor: pointer; user-select: none;">
                        ${escapeHtml(ch.title)}
                    </label>
                `;
                list.appendChild(item);
            });
            
            openModal('modal-export');
        })
        .catch(e => {
            showToast("Kapitel konnten nicht geladen werden.", "danger");
        });
}

function updateDetectedKeywords() {
    const detectedSection = document.getElementById('lore-quick-detected-section');
    const detectedList = document.getElementById('lore-quick-detected-list');
    if (!detectedSection || !detectedList || !state.editor || !state.loreList || state.loreList.length === 0) {
        if (detectedSection) detectedSection.style.display = 'none';
        return;
    }
    
    const content = state.editor.getMarkdown().toLowerCase();
    const detected = [];
    
    state.loreList.forEach(item => {
        const hasKeyword = item.keywords.some(kw => {
            if (!kw.trim()) return false;
            const regex = new RegExp(`(?<![a-zA-Z0-9äöüÄÖÜß])${escapeRegExp(kw.toLowerCase())}(?![a-zA-Z0-9äöüÄÖÜß])`, 'i');
            return regex.test(content);
        });
        if (hasKeyword) {
            detected.push(item);
        }
    });
    
    if (detected.length > 0) {
        detectedSection.style.display = 'block';
        detectedList.innerHTML = '';
        detected.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.style.padding = '4px 8px';
            btn.style.fontSize = '12px';
            btn.style.borderRadius = '4px';
            btn.style.border = '1px solid var(--border-color)';
            btn.style.backgroundColor = 'var(--bg-base)';
            btn.style.color = 'var(--text-primary)';
            btn.style.cursor = 'pointer';
            btn.textContent = item.name;
            btn.addEventListener('click', () => showLoreQuickviewById(item.id));
            detectedList.appendChild(btn);
        });
    } else {
        detectedSection.style.display = 'none';
    }
}

// ==========================================
// D. AI SETTINGS, ASSISTANT & TRANSLATIONS
// ==========================================

async function loadAISettingsInForm() {
    try {
        const response = await fetch(`${API_URL}/ai/settings`);
        if (!response.ok) throw new Error("Could not load AI settings");
        const settings = await response.json();
        
        state.aiSettings = settings;
        
        // General Interval
        const savedInterval = localStorage.getItem('ember_autosave_interval') || '3';
        document.getElementById('setting-autosave-interval').value = savedInterval;
        
        // AI Provider Select
        const providerSelect = document.getElementById('setting-ai-provider');
        providerSelect.value = settings.ai_provider || 'none';
        
        // Fill Provider Sub-panels
        document.getElementById('setting-ollama-url').value = settings.ollama_url || 'http://localhost:11434';
        document.getElementById('setting-ollama-model').value = settings.ollama_model || 'llama3';
        
        document.getElementById('setting-gemini-key').value = settings.gemini_api_key || '';
        document.getElementById('setting-gemini-model').value = settings.gemini_model || 'gemini-1.5-flash';
        
        document.getElementById('setting-openai-key').value = settings.openai_api_key || '';
        document.getElementById('setting-openai-model').value = settings.openai_model || 'gpt-4o-mini';
        
        document.getElementById('setting-anthropic-key').value = settings.anthropic_api_key || '';
        document.getElementById('setting-anthropic-model').value = settings.anthropic_model || 'claude-3-5-sonnet';
        
        // Auto translate check
        document.getElementById('setting-auto-translate').checked = settings.auto_translate_on_save !== false;
        
        // Trigger visibility
        providerSelect.dispatchEvent(new Event('change'));
        
    } catch (e) {
        showToast("Fehler beim Laden der Einstellungen: " + e.message, "danger");
    }
}

async function handleSaveSettings() {
    // Save general interval to localStorage
    const interval = document.getElementById('setting-autosave-interval').value;
    localStorage.setItem('ember_autosave_interval', interval);
    state.autosaveInterval = parseInt(interval, 10) * 1000;
    
    // Gather AI settings payload
    const payload = {
        ai_provider: document.getElementById('setting-ai-provider').value,
        ollama_url: document.getElementById('setting-ollama-url').value,
        ollama_model: document.getElementById('setting-ollama-model').value,
        gemini_api_key: document.getElementById('setting-gemini-key').value,
        gemini_model: document.getElementById('setting-gemini-model').value,
        openai_api_key: document.getElementById('setting-openai-key').value,
        openai_model: document.getElementById('setting-openai-model').value,
        anthropic_api_key: document.getElementById('setting-anthropic-key').value,
        anthropic_model: document.getElementById('setting-anthropic-model').value,
        auto_translate_on_save: document.getElementById('setting-auto-translate').checked
    };
    
    try {
        const response = await fetch(`${API_URL}/ai/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error("API request failed");
        
        showToast('Einstellungen erfolgreich gespeichert!', 'success');
        
    } catch (e) {
        showToast('KI-Einstellungen konnten nicht gespeichert werden: ' + e.message, 'danger');
    }
}

async function loadProjectLanguages(projectId) {
    const list = document.getElementById('project-languages-list');
    list.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">Lade Sprachen...</div>';
    
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/languages`);
        if (!response.ok) throw new Error("Languages load failed");
        const langs = await response.json();
        
        list.innerHTML = '';
        
        // Add German (Original) always as static
        const origEl = document.createElement('div');
        origEl.className = 'list-item';
        origEl.style.padding = '8px 12px';
        origEl.style.display = 'flex';
        origEl.style.justifyContent = 'space-between';
        origEl.style.alignItems = 'center';
        origEl.innerHTML = `
            <span style="font-size: 13px; font-weight: 500;">🇩🇪 Deutsch (Original)</span>
            <span style="font-size: 10px; background-color: var(--color-primary-light); color: var(--color-primary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">Original</span>
        `;
        list.appendChild(origEl);
        
        // Add other branches
        langs.forEach(lang => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.style.padding = '8px 12px';
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            
            // Map common language flags
            let flag = '🏳️';
            if (lang === 'en') flag = '🇬🇧';
            else if (lang === 'fr') flag = '🇫🇷';
            else if (lang === 'es') flag = '🇪🇸';
            else if (lang === 'it') flag = '🇮🇹';
            
            el.innerHTML = `
                <span style="font-size: 13px; font-weight: 500;">${flag} ${lang.toUpperCase()}</span>
                <span style="font-size: 10px; background-color: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 2px 6px; border-radius: 4px;">Branch</span>
            `;
            list.appendChild(el);
        });
        
    } catch (e) {
        list.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">Fehler beim Laden.</div>';
    }
}

async function handleCreateLanguageBranch() {
    if (!state.currentProject) return;
    
    const codeEl = document.getElementById('new-language-code');
    const lang_code = codeEl.value.trim().toLowerCase();
    
    if (!lang_code) {
        showToast("Bitte gib einen Sprachcode ein.", "warning");
        return;
    }
    
    showToast(`Erstelle Sprachzweig '${lang_code.toUpperCase()}'...`, 'info');
    closeModal('modal-language');
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/languages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lang_code })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Failed to create language branch");
        }
        
        showToast(`Sprachzweig '${lang_code.toUpperCase()}' wird im Hintergrund übersetzt!`, 'success');
        codeEl.value = '';
        
        // Reload list after short delay
        setTimeout(() => loadProjectLanguages(state.currentProject.id), 2000);
        
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function reloadEditorChapterContent(projectId, chapterId) {
    const banner = document.getElementById('recovery-banner');
    banner.style.display = 'none';
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.style.display = 'inline-block';
    saveStatus.textContent = 'Lade Kapitel...';
    
    try {
        let url = `${API_URL}/projects/${projectId}/chapters/${chapterId}`;
        if (state.activeLanguage !== 'original') {
            url = `${API_URL}/projects/${projectId}/languages/${state.activeLanguage}/chapters/${chapterId}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Could not load chapter content");
        const data = await response.json();
        
        state.currentChapter = data;
        state.lastSavedContent = data.content || '';
        state.isDirty = false;
        
        if (state.editor) {
            state.editor.setMarkdown(data.content || '');
        }
        
        // Warning banner for original recovery file if it exists
        if (state.activeLanguage === 'original' && data.has_recovery) {
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
        
        saveStatus.style.display = 'none';
        
        setTimeout(() => {
            highlightKeywordsInPreview();
            updateDetectedKeywords();
        }, 150);
        
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function handleManualTranslate() {
    if (!state.currentProject || !state.currentChapter || state.activeLanguage === 'original') return;
    
    if (!confirm(`Möchtest du dieses Kapitel jetzt neu aus dem deutschen Original in '${state.activeLanguage.toUpperCase()}' übersetzen? Eigene Änderungen an dieser Übersetzung werden überschrieben.`)) return;
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.style.display = 'inline-block';
    saveStatus.textContent = 'Übersetze...';
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/languages/${state.activeLanguage}/chapters/${state.currentChapter.id}/translate`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error("Translation failed");
        const data = await response.json();
        
        if (state.editor) {
            state.editor.setMarkdown(data.content || '');
        }
        
        state.lastSavedContent = data.content || '';
        state.isDirty = false;
        showToast("Kapitel erfolgreich neu übersetzt!", "success");
        
    } catch (e) {
        showToast("Fehler bei der Übersetzung: " + e.message, 'danger');
    } finally {
        saveStatus.style.display = 'none';
    }
}

async function handleAIAssistant(task) {
    if (!state.editor || !state.currentChapter) return;
    
    let text = state.editor.getSelectedText().trim();
    const isSelection = !!text;
    
    if (!text) {
        if (task === 'correct') {
            text = state.editor.getMarkdown().trim();
        } else {
            // For 'continue', get last 1500 chars of the content
            text = state.editor.getMarkdown().trim();
            if (text.length > 1500) {
                text = text.slice(-1500);
            }
        }
    }
    
    if (!text) {
        showToast("Es gibt keinen Text zum Verarbeiten.", "warning");
        return;
    }
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.style.display = 'inline-block';
    saveStatus.textContent = task === 'correct' ? 'Lektorat läuft...' : 'Schreibe weiter...';
    
    try {
        const response = await fetch(`${API_URL}/ai/assist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, task })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "AI Request failed");
        }
        
        const data = await response.json();
        const result = data.result;
        
        if (!result) {
            showToast("Keine Antwort erhalten.", "warning");
            return;
        }
        
        if (task === 'correct') {
            if (isSelection) {
                state.editor.replaceSelection(result);
            } else {
                state.editor.setMarkdown(result);
            }
            showToast("Text erfolgreich lektoriert!", "success");
        } else if (task === 'continue') {
            state.editor.insertText("\n" + result);
            showToast("Text erfolgreich fortgeführt!", "success");
        }
        
        state.isDirty = true;
        
    } catch (e) {
        showToast("KI-Fehler: " + e.message, "danger");
    } finally {
        saveStatus.style.display = 'none';
    }
}


