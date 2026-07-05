// EmberNovels SPA App Logic

// Application State
const state = {
    currentView: 'projects',
    projects: [],
    currentProject: null,
    currentChapter: null,
    activeLanguage: 'original',
    uiLanguage: 'de',
    translations: {},
    editor: null,
    autosaveInterval: 3000,
    autosaveTimer: null,
    isDirty: false,
    lastSavedContent: '',
    loreList: [],
    editingLoreId: null,
    highlightTimeout: null,
    detectedKeywordsTimeout: null,
    activeBranch: 'original',
    chapterSortOrder: 'asc',
    viewMode: 'list',
    leftSidebarPinned: true,
    rightSidebarPinned: true,
    zenModeActive: false,
    backupEnabled: false,
    backupDir: '',
    timelineEvents: [],
    sessionWords: 0,
    dailyGoal: 500,
    globalSettings: { first_run_completed: false, tutorial_modules_seen: false },
    chapterWordCountOnLoad: 0,
    relationships: { nodes: {}, links: [] },
    relationshipDragNode: null,
    relationshipDragOffset: { x: 0, y: 0 },
    relationshipPan: { x: 0, y: 0 },
    relationshipZoom: 1.0,
    relationshipPanning: false,
    relationshipPanStart: { x: 0, y: 0 },
    loadingChapter: false,
    collapsedVolumes: {},
    localVersion: "0.2.1.4"
};

const ModuleManager = {
    modules: [
        { id: 'projects', icon: '📚', labelKey: 'nav_projects', alwaysVisible: true },
        { id: 'lore', icon: '📖', labelKey: 'nav_lore' },
        { id: 'timeline', icon: '⏳', labelKey: 'nav_timeline' },
        { id: 'stats', icon: '📊', labelKey: 'nav_stats' },
        { id: 'corkboard', icon: '📋', labelKey: 'nav_corkboard' },
        { id: 'relationships', icon: '👥', labelKey: 'nav_relationships' },
        { id: 'mindmap', icon: '🧠', labelKey: 'nav_mindmap' },
        { id: 'search', icon: '🔍', labelKey: 'nav_search', alwaysProject: true },
        { id: 'trash', icon: '🗑️', labelKey: 'nav_trash', alwaysProject: true }
    ],
    renderSidebar() {
        const sidebar = document.getElementById('sidebar-nav');
        if (!sidebar) return;
        sidebar.innerHTML = '';
        
        // Always show Projects
        this.createItem('projects', '📚', 'nav_projects', state.currentView === 'projects');
        
        // Show project specific modules if project is active
        if (state.currentProject && state.currentProject.active_modules) {
            this.modules.forEach(mod => {
                if (mod.id === 'projects') return;
                
                // Show if it's an alwaysProject module (Search/Trash) or if enabled in active_modules
                if (mod.alwaysProject || state.currentProject.active_modules.includes(mod.id)) {
                    this.createItem(mod.id, mod.icon, mod.labelKey, state.currentView === mod.id);
                }
            });
        }
        
        const spacer = document.createElement('li');
        spacer.style.flexGrow = '1';
        sidebar.appendChild(spacer);
        
        this.createItem('settings', '⚙️', 'nav_settings', state.currentView === 'settings');
        
        const bugItem = this.createItem('btn-report-bug', '🐛', 'nav_bug_report', false, true);
        if (bugItem) {
            bugItem.querySelector('a').style.color = 'var(--color-warning)';
            bugItem.querySelector('a').style.cursor = 'pointer';
        }
    },
    createItem(id, icon, labelKey, isActive, isAction = false) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.id = isAction ? id : `nav-${id}`;
        a.className = `nav-item ${isActive ? 'active' : ''}`;
        
        if (!isAction) {
            a.addEventListener('click', () => navigateTo(id));
        } else if (id === 'btn-report-bug') {
            a.addEventListener('click', () => window.open('https://github.com/MasterBurns/EmberNovels/issues/new', '_blank'));
        }
        
        const spanIcon = document.createElement('span');
        spanIcon.className = 'nav-item-icon';
        spanIcon.textContent = icon;
        
        const spanText = document.createElement('span');
        spanText.setAttribute('data-i18n', labelKey);
        spanText.textContent = window.t ? window.t(labelKey, labelKey) : labelKey;
        
        a.appendChild(spanIcon);
        a.appendChild(spanText);
        li.appendChild(a);
        
        document.getElementById('sidebar-nav').appendChild(li);
        return li;
    },
    updateActive(viewId) {
        document.querySelectorAll('#sidebar-nav .nav-item').forEach(item => item.classList.remove('active'));
        const target = document.getElementById(`nav-${viewId}`);
        if (target) target.classList.add('active');
    }
};

// Base API URL
const API_URL = '/api';

async function waitForBackend(maxRetries = 20) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`${API_URL}/version`);
            if (response.ok) {
                const data = await response.json();
                state.localVersion = data.version;
                const versionLbl = document.getElementById('lbl-app-version');
                if (versionLbl) versionLbl.textContent = data.version;
                return true;
            }
        } catch (e) {
            // backend not ready yet
        }
        await new Promise(r => setTimeout(r, 500));
    }
    console.warn("Backend did not start in time. Falling back to defaults.");
    state.localVersion = "0.2.1.4";
    return false;
}

