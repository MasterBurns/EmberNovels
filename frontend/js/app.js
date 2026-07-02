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
    lastSavedContent: ""
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
    
    // Submit forms
    document.getElementById('btn-submit-project').addEventListener('click', handleCreateProject);
    document.getElementById('btn-submit-chapter').addEventListener('click', handleCreateChapter);
    
    // Settings save
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const interval = document.getElementById('setting-autosave-interval').value;
        localStorage.setItem('ember_autosave_interval', interval);
        state.autosaveInterval = parseInt(interval, 10) * 1000;
        showToast('Einstellungen gespeichert!', 'success');
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
    
    // Editor input changes
    const wysiwygTextarea = document.getElementById('editor-wysiwyg-content');
    const markdownTextarea = document.getElementById('editor-textarea');
    
    wysiwygTextarea.addEventListener('input', () => handleEditorInput(wysiwygTextarea.innerText));
    markdownTextarea.addEventListener('input', () => handleEditorInput(markdownTextarea.value));
    
    // Shortcut for Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            if (state.currentView === 'editor') {
                e.preventDefault();
                handleExplicitSave();
            }
        }
    });
    
    // Smart Keyword Hover logic (simplified event delegation)
    wysiwygTextarea.addEventListener('click', (e) => {
        if (e.target.classList.contains('smart-keyword')) {
            const keyword = e.target.getAttribute('data-keyword');
            showLoreQuickview(keyword);
        }
    });
    
    // Recovery actions
    document.getElementById('btn-recovery-keep').addEventListener('click', () => resolveRecovery(true));
    document.getElementById('btn-recovery-discard').addEventListener('click', () => resolveRecovery(false));
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
    const banner = document.getElementById('recovery-banner');
    banner.style.display = 'none';
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.style.display = 'inline-block';
    saveStatus.textContent = 'Lade Kapitel...';
    
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/chapters/${chapterId}`);
        if (!response.ok) throw new Error("Could not load chapter content");
        const data = await response.json();
        
        state.currentChapter = data;
        state.lastSavedContent = data.content;
        state.isDirty = false;
        
        // Populate inputs
        const wysiwygTextarea = document.getElementById('editor-wysiwyg-content');
        const markdownTextarea = document.getElementById('editor-textarea');
        
        // If recovery available, show warning banner
        if (data.has_recovery) {
            document.getElementById('recovery-chapter-title').textContent = data.id.replace('_', ' ').title();
            banner.style.display = 'flex';
        }
        
        // Load original text (in real implementation, markdown would render to HTML)
        wysiwygTextarea.innerText = data.content;
        markdownTextarea.value = data.content;
        
        updateWordCount(data.content);
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
    
    // Keep raw and Rich-text sync'd (naive synchronization for stub)
    const activeMode = document.getElementById('btn-editor-view-wysiwyg').classList.contains('active') ? 'wysiwyg' : 'markdown';
    if (activeMode === 'wysiwyg') {
        document.getElementById('editor-textarea').value = content;
    } else {
        document.getElementById('editor-wysiwyg-content').innerText = content;
    }
    
    // 2. Safe Autosave to LocalStorage immediately on keypress (Zero Data Loss Frontend)
    const storageKey = `ember_backup_${state.currentProject.id}_${state.currentChapter.id}`;
    localStorage.setItem(storageKey, content);
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = 'Ungespeicherte Änderungen (Tippe...)';
    
    updateWordCount(content);
}

// Tick-based shadow saving to backend (.tmp file)
async function handleAutosaveTick() {
    if (!state.isDirty || !state.currentChapter) return;
    
    const content = document.getElementById('editor-textarea').value;
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
    
    const content = document.getElementById('editor-textarea').value;
    const saveStatus = document.getElementById('save-status');
    saveStatus.textContent = 'Speichere endgültig...';
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/save`, {
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
            document.getElementById('editor-wysiwyg-content').innerText = recoveredContent;
            document.getElementById('editor-textarea').value = recoveredContent;
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
    const paneWysiwyg = document.getElementById('pane-wysiwyg');
    const paneMarkdown = document.getElementById('pane-markdown');
    
    if (mode === 'wysiwyg') {
        btnWysiwyg.classList.add('active');
        btnMarkdown.classList.remove('active');
        paneWysiwyg.style.display = 'block';
        paneMarkdown.style.display = 'none';
    } else {
        btnWysiwyg.classList.remove('active');
        btnMarkdown.classList.add('active');
        paneWysiwyg.style.display = 'none';
        paneMarkdown.style.display = 'block';
    }
}

function toggleEditorSplit() {
    const workspace = document.querySelector('.editor-workspace');
    const lorePanel = document.getElementById('editor-lore-panel');
    
    if (lorePanel.style.display === 'none') {
        lorePanel.style.display = 'flex';
        workspace.classList.add('editor-layout-split');
        showLoreQuickview('Erzmagier'); // Mock loading lore article
    } else {
        lorePanel.style.display = 'none';
        workspace.classList.remove('editor-layout-split');
    }
}

function showLoreQuickview(keyword) {
    document.getElementById('editor-lore-panel').style.display = 'flex';
    document.querySelector('.editor-workspace').classList.add('editor-layout-split');
    
    const title = document.getElementById('lore-quick-title');
    const type = document.getElementById('lore-quick-type');
    const desc = document.getElementById('lore-quick-desc');
    
    // Mock Lore Articles
    if (keyword.toLowerCase() === 'erzmagier') {
        title.textContent = 'Erzmagier';
        type.textContent = 'Rolle / Rang';
        desc.textContent = 'Der höchste spirituelle und magische Titel im Reich Ember. Ein Erzmagier leitet das Konzil der Flamme und wacht über die Einhaltung des Codex Arcanum. Nur eine Person pro Epoche kann den Titel tragen.';
    } else {
        title.textContent = keyword;
        type.textContent = 'Unbekannter Begriff';
        desc.textContent = `Dieser Lore-Artikel für "${keyword}" wird in Kürze implementiert, sobald das Wiki voll funktionsfähig ist.`;
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
