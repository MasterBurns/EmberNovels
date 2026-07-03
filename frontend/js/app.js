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
    leftSidebarPinned: true,
    rightSidebarPinned: true,
    zenModeActive: false,
    backupEnabled: false,
    backupDir: '',
    timelineEvents: [],
    sessionWords: 0,
    chapterWordCountOnLoad: 0,
    relationships: { nodes: {}, links: [] },
    relationshipDragNode: null,
    relationshipDragOffset: { x: 0, y: 0 },
    relationshipPan: { x: 0, y: 0 },
    relationshipZoom: 1.0,
    relationshipPanning: false,
    relationshipPanStart: { x: 0, y: 0 },
    loadingChapter: false,
    collapsedVolumes: {}
};

// Base API URL
const API_URL = '/api';

// On Document Load
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    
    // Initialize UI Language
    state.uiLanguage = localStorage.getItem('ember_ui_language') || 'de';
    await loadUiLanguage(state.uiLanguage);
    
    setupEventListeners();
    navigateTo('projects');
    
    // Fetch local version info from backend
    try {
        const response = await fetch(`${API_URL}/version`);
        if (response.ok) {
            const data = await response.json();
            state.localVersion = data.version;
            const versionLbl = document.getElementById('lbl-app-version');
            if (versionLbl) versionLbl.textContent = data.version;
        }
    } catch(e) {
        console.warn("Could not load version from backend", e);
        state.localVersion = "0.2.0.0"; // default fallback
    }

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
            headerTitle.textContent = t('title_projects', 'Meine Romanprojekte');
            headerAction.textContent = t('btn_new_project', '+ Neues Projekt');
            headerAction.onclick = () => openModal('modal-project');
            loadProjects();
            break;
            
        case 'project-details':
            document.getElementById('nav-projects').classList.add('active');
            btnBackProjects.style.display = 'inline-flex';
            btnBackProjects.onclick = () => navigateTo('projects');
            headerAction.textContent = t('btn_add_chapter', '+ Kapitel hinzufügen');
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
                    showConfirm(t('unsaved_changes_title', 'Ungespeicherte Änderungen'), t('unsaved_changes_body', 'Du hast ungespeicherte Änderungen! Möchtest du wirklich zurückgehen?'), () => {
                        state.isDirty = false;
                        navigateTo('project-details', { projectId: state.currentProject.id });
                    });
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
            headerTitle.textContent = `${t('nav_lore', 'Lore-Datenbank')}: ${state.currentProject.title}`;
            loadLoreEntries();
            break;
            
        case 'trash':
            document.getElementById('nav-trash').classList.add('active');
            headerTitle.textContent = t('trash_title', 'Papierkorb');
            headerAction.style.display = 'none';
            loadTrashedProjects();
            break;
            
        case 'settings':
            document.getElementById('nav-settings').classList.add('active');
            headerTitle.textContent = t('nav_settings', 'Einstellungen');
            headerAction.style.display = 'none';
            loadAISettingsInForm();
            break;
            
        case 'timeline':
            document.getElementById('nav-timeline').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => navigateTo('project-details', { projectId: state.currentProject.id });
            headerAction.style.display = 'none';
            headerTitle.textContent = `${t('nav_timeline', 'Zeitleiste')}: ${state.currentProject.title}`;
            loadTimelineData();
            break;
            
        case 'stats':
            document.getElementById('nav-stats').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => navigateTo('project-details', { projectId: state.currentProject.id });
            headerAction.style.display = 'none';
            headerTitle.textContent = `${t('nav_stats', 'Schreibstatistiken')}: ${state.currentProject.title}`;
            loadStatsData();
            break;

        case 'search':
            document.getElementById('nav-search').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => navigateTo('project-details', { projectId: state.currentProject.id });
            headerAction.style.display = 'none';
            headerTitle.textContent = `${t('nav_search', 'Globale Suche')}: ${state.currentProject.title}`;
            loadSearchData();
            break;

        case 'relationships':
            document.getElementById('nav-relationships').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => navigateTo('project-details', { projectId: state.currentProject.id });
            headerAction.style.display = 'none';
            headerTitle.textContent = `${t('nav_relationships', 'Beziehungsnetzwerk')}: ${state.currentProject.title}`;
            loadRelationshipsData();
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
            showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus, um auf seine Lore-Datenbank zuzugreifen.'), 'warning');
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
            showToast(t('toast_select_text_first', 'Bitte markiere zuerst ein Wort oder einen Begriff im Text.'), 'warning');
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
            showToast(t('toast_select_chapters_export', 'Bitte wähle mindestens ein Kapitel für den Export aus.'), 'warning');
            return;
        }
        closeModal('modal-export');
        handleExport(format, selectedChapterIds);
    });

    // Project details Branch selection
    const branchSelect = document.getElementById('project-branch-select');
    if (branchSelect) {
        branchSelect.addEventListener('change', (e) => {
            state.activeLanguage = e.target.value;
            if (state.currentProject) {
                loadProjectDetails(state.currentProject.id);
            }
        });
    }

    // Project details Chapter Sorting Toggle
    const btnSort = document.getElementById('btn-sort-chapters');
    if (btnSort) {
        btnSort.addEventListener('click', () => {
            state.chapterSortOrder = state.chapterSortOrder === 'asc' ? 'desc' : 'asc';
            btnSort.textContent = state.chapterSortOrder === 'asc' ? 'Sortierung: ⬆️ Alt zuerst' : 'Sortierung: ⬇️ Neu zuerst';
            if (state.currentProject) {
                loadProjectDetails(state.currentProject.id);
            }
        });
    }

    // Language Branch triggers
    document.getElementById('btn-create-language').addEventListener('click', () => openModal('modal-language'));
    document.getElementById('btn-submit-language').addEventListener('click', handleCreateLanguageBranch);
    
    // AI assistance triggers
    document.getElementById('btn-ai-correct').addEventListener('click', () => handleAIAssistant('correct'));
    document.getElementById('btn-ai-continue').addEventListener('click', () => {
        if (!state.currentProject || !state.currentChapter) return;
        // Open side panel
        const workspace = document.querySelector('.editor-workspace');
        const sidePanel = document.getElementById('editor-lore-panel');
        if (sidePanel) {
            sidePanel.style.display = 'flex';
            workspace.classList.add('editor-layout-split');
        }
        // Switch to AI tab
        switchSidePanelTab('ai');
    });
    
    // Manual Translate Trigger
    document.getElementById('btn-editor-translate-now').addEventListener('click', handleManualTranslate);

    // Import Wizard Launcher
    const btnOpenImport = document.getElementById('btn-open-import');
    if (btnOpenImport) {
        btnOpenImport.addEventListener('click', openImportWizard);
    }
    
    // Import Wizard Tab Switching
    document.getElementById('tab-import-folder').addEventListener('click', (e) => {
        document.getElementById('tab-import-folder').classList.add('active');
        document.getElementById('tab-import-file').classList.remove('active');
        document.getElementById('panel-import-folder').style.display = 'flex';
        document.getElementById('panel-import-file').style.display = 'none';
    });
    
    document.getElementById('tab-import-file').addEventListener('click', (e) => {
        document.getElementById('tab-import-file').classList.add('active');
        document.getElementById('tab-import-folder').classList.remove('active');
        document.getElementById('panel-import-file').style.display = 'flex';
        document.getElementById('panel-import-folder').style.display = 'none';
        
        // Populate existing projects list dropdown
        const projSelect = document.getElementById('import-file-target-project');
        projSelect.innerHTML = '';
        state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.title;
            projSelect.appendChild(opt);
        });
    });
    
    // File Import Mode switcher
    document.querySelectorAll('input[name="import-file-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'project') {
                document.getElementById('panel-import-file-new-project').style.display = 'flex';
                document.getElementById('panel-import-file-exist-project').style.display = 'none';
            } else {
                document.getElementById('panel-import-file-new-project').style.display = 'none';
                document.getElementById('panel-import-file-exist-project').style.display = 'flex';
            }
        });
    });
    
    document.getElementById('btn-submit-import-wizard').addEventListener('click', handleImportWizardSubmit);

    // Stats configuration dialog triggers
    const btnEditStats = document.getElementById('btn-edit-project-stats');
    if (btnEditStats) {
        btnEditStats.addEventListener('click', () => {
            if (!state.currentProject) return;
            document.getElementById('stats-project-title').value = state.currentProject.title || "";
            document.getElementById('stats-project-author').value = state.currentProject.author || "";
            document.getElementById('stats-word-goal').value = state.currentProject.word_count_goal;
            document.getElementById('stats-daily-goal').value = state.currentProject.daily_word_count_goal;
            document.getElementById('stats-deadline-date').value = state.currentProject.deadline_date || "";
            document.getElementById('stats-original-language').value = state.currentProject.original_language || "de";
            openModal('modal-project-stats');
        });
    }
    
    document.getElementById('btn-submit-project-stats').addEventListener('click', handleSaveProjectStats);

    // Update checker trigger
    const btnCheckUpdate = document.getElementById('btn-check-update');
    if (btnCheckUpdate) {
        btnCheckUpdate.addEventListener('click', checkAppUpdates);
    }

    // Tab buttons inside the editor split panel
    const tabBtnLore = document.getElementById('tab-btn-lore');
    if (tabBtnLore) tabBtnLore.addEventListener('click', () => switchSidePanelTab('lore'));
    const tabBtnAi = document.getElementById('tab-btn-ai');
    if (tabBtnAi) tabBtnAi.addEventListener('click', () => switchSidePanelTab('ai'));

    // AI Chat submit & clear triggers
    const btnAiChatSubmit = document.getElementById('btn-ai-chat-submit');
    if (btnAiChatSubmit) btnAiChatSubmit.addEventListener('click', handleAIChatSubmit);
    const btnAiChatClear = document.getElementById('btn-ai-chat-clear');
    if (btnAiChatClear) btnAiChatClear.addEventListener('click', handleAIChatClear);

    // Project Synopsis save button trigger
    const btnSaveSynopsis = document.getElementById('btn-save-project-description');
    if (btnSaveSynopsis) btnSaveSynopsis.addEventListener('click', handleSaveProjectDescription);

    // Hover popup trigger initialization
    setupLoreTooltip();

    // Relationships triggers
    const btnSaveRel = document.getElementById('btn-save-relationship');
    if (btnSaveRel) btnSaveRel.addEventListener('click', addRelationshipLink);
    const btnRelSaveLayout = document.getElementById('btn-relationships-save');
    if (btnRelSaveLayout) btnRelSaveLayout.addEventListener('click', saveRelationshipsLayout);
    const btnRelResetLayout = document.getElementById('btn-relationships-reset');
    if (btnRelResetLayout) btnRelResetLayout.addEventListener('click', resetRelationshipsLayout);

    // Nav menu items
    const navRel = document.getElementById('nav-relationships');
    if (navRel) {
        navRel.addEventListener('click', () => {
            if (state.currentProject) navigateTo('relationships');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navTimeline = document.getElementById('nav-timeline');
    if (navTimeline) {
        navTimeline.addEventListener('click', () => {
            if (state.currentProject) navigateTo('timeline');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navStats = document.getElementById('nav-stats');
    if (navStats) {
        navStats.addEventListener('click', () => {
            if (state.currentProject) navigateTo('stats');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navSearch = document.getElementById('nav-search');
    if (navSearch) {
        navSearch.addEventListener('click', () => {
            if (state.currentProject) navigateTo('search');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }

    // Bug Report Button
    const btnReportBug = document.getElementById('btn-report-bug');
    if (btnReportBug) {
        btnReportBug.addEventListener('click', () => {
            const version = state.localVersion || "0.2.0.0";
            const userAgent = navigator.userAgent;
            const title = encodeURIComponent("[Bug] EmberNovels v" + version);
            const body = encodeURIComponent(
                "## Bug Beschreibung\n\n\n## Schritte zur Reproduktion\n1. \n2. \n3. \n\n## System-Informationen\n- App-Version: " + version + "\n- Browser UserAgent: " + userAgent + "\n"
            );
            window.open("https://github.com/MasterBurns/EmberNovels/issues/new?title=" + title + "&body=" + body, "_blank");
        });
    }

    // Sidebar pin and Zen buttons
    const btnPinLeft = document.getElementById('btn-pin-left-sidebar');
    if (btnPinLeft) btnPinLeft.addEventListener('click', toggleLeftSidebarPin);
    
    const btnPinRight = document.getElementById('btn-pin-right-sidebar');
    if (btnPinRight) btnPinRight.addEventListener('click', toggleRightSidebarPin);
    
    const btnZen = document.getElementById('btn-editor-zen');
    if (btnZen) btnZen.addEventListener('click', toggleZenMode);

    // Backup triggers
    const btnManualBackup = document.getElementById('btn-trigger-manual-backup');
    if (btnManualBackup) btnManualBackup.addEventListener('click', triggerManualBackup);

    // Timeline triggers
    const btnCreateTimeline = document.getElementById('btn-create-timeline-event');
    if (btnCreateTimeline) btnCreateTimeline.addEventListener('click', () => openTimelineEventForm());
    const btnSaveTimeline = document.getElementById('btn-save-timeline-event');
    if (btnSaveTimeline) btnSaveTimeline.addEventListener('click', saveTimelineEvent);
    const btnCancelTimeline = document.getElementById('btn-cancel-timeline-event');
    if (btnCancelTimeline) btnCancelTimeline.addEventListener('click', closeTimelineEventForm);

    // Search triggers
    const btnTriggerSearch = document.getElementById('btn-trigger-global-search');
    if (btnTriggerSearch) btnTriggerSearch.addEventListener('click', performGlobalSearch);
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performGlobalSearch();
        });
    }

    // Relationship layout custom triggers
    const btnRelPhysics = document.getElementById('btn-relationships-physics');
    if (btnRelPhysics) btnRelPhysics.addEventListener('click', applyPhysicsLayout);
    const btnRelHierarchical = document.getElementById('btn-relationships-hierarchical');
    if (btnRelHierarchical) btnRelHierarchical.addEventListener('click', applyHierarchicalLayout);

    // Style Check tab & action triggers
    const tabBtnStyle = document.getElementById('tab-btn-style');
    if (tabBtnStyle) tabBtnStyle.addEventListener('click', () => switchSidePanelTab('style'));
    const btnRunStyleCheck = document.getElementById('btn-run-style-check');
    if (btnRunStyleCheck) btnRunStyleCheck.addEventListener('click', runStyleCheck);

    // Chapter settings trigger
    const btnChapterSettings = document.getElementById('btn-chapter-settings');
    if (btnChapterSettings) btnChapterSettings.addEventListener('click', openChapterSettingsModal);
    const btnSubmitChapterSettings = document.getElementById('btn-submit-chapter-settings');
    if (btnSubmitChapterSettings) btnSubmitChapterSettings.addEventListener('click', saveChapterSettings);

    // Versionsverlauf button triggers
    const btnEditorHistory = document.getElementById('btn-editor-history');
    if (btnEditorHistory) btnEditorHistory.addEventListener('click', openHistoryModal);
    const btnCreateSnapManual = document.getElementById('btn-create-snapshot-manual');
    if (btnCreateSnapManual) btnCreateSnapManual.addEventListener('click', createManualSnapshot);
    const btnRestoreSnapSelected = document.getElementById('btn-restore-snapshot-selected');
    if (btnRestoreSnapSelected) btnRestoreSnapSelected.addEventListener('click', restoreSelectedSnapshot);

    // Volume creation trigger
    const btnCreateVolume = document.getElementById('btn-create-volume');
    if (btnCreateVolume) {
        btnCreateVolume.addEventListener('click', () => {
            showPrompt("Neuen Band erstellen", "Titel des neuen Bandes:", "", async (title) => {
                if (title && title.trim()) {
                    const volumes = state.currentProject.volumes || [];
                    const volId = 'vol_' + Math.random().toString(36).substr(2, 9);
                    volumes.push({ id: volId, title: title.trim() });
                    await updateProjectMetadataDirectly({ volumes });
                    loadProjectDetails(state.currentProject.id);
                }
            });
        });
    }

    // Wiki auto scan trigger
    const btnWikiScan = document.getElementById('btn-wiki-scan');
    if (btnWikiScan) {
        btnWikiScan.addEventListener('click', async () => {
            if (!state.currentProject) return;
            btnWikiScan.disabled = true;
            const originalText = btnWikiScan.textContent;
            btnWikiScan.textContent = "Scanne...";
            showToast("Projekt wird nach Lore-Informationen gescannt...", "info");
            try {
                const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/lore/auto-scan`, {
                    method: 'POST'
                });
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "Scan fehlgeschlagen.");
                }
                const result = await response.json();
                showToast(result.message, "success");
                await loadWikiData();
                
                let allSuggestions = [];
                if (result.created_entries && result.created_entries.length > 0) {
                    result.created_entries.forEach(lore => {
                        const combinedText = (lore.short_description || '') + '\n' + (lore.description || '');
                        const sugs = extractTimepointsFromText(combinedText);
                        sugs.forEach(s => {
                            s.lore_id = lore.id;
                            s.lore_name = lore.name;
                            allSuggestions.push(s);
                        });
                    });
                }
                
                if (allSuggestions.length > 0) {
                    setTimeout(() => showTimelineSuggestionsModal(allSuggestions), 300);
                }
            } catch (e) {
                showToast("Fehler beim Lore-Scan: " + e.message, "danger");
            } finally {
                btnWikiScan.disabled = false;
                btnWikiScan.textContent = originalText;
            }
        });
    }
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
                showConfirm(t('delete_project_title', 'Projekt löschen'), `${t('delete_project_body', 'Möchtest du das Projekt wirklich in den Papierkorb verschieben?')} "${p.title}"`, () => {
                    deleteProject(p.id);
                });
            });
            
            // View details listener
            card.addEventListener('click', () => {
                navigateTo('project-details', { projectId: p.id });
            });
            
            grid.appendChild(card);
        });
        
    } catch (e) {
        showToast(t('error_load_projects', 'Fehler beim Laden der Projekte: ') + e.message, "danger");
    }
}

async function handleCreateProject() {
    const title = document.getElementById('project-title').value;
    const author = document.getElementById('project-author').value;
    const original_language = document.getElementById('project-language').value;
    const description = document.getElementById('project-description').value;
    
    if (!title.trim()) {
        showToast(t('toast_project_title_required', 'Bitte gib einen Projekttitel an.'), "warning");
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, author, description, original_language })
        });
        
        if (!response.ok) throw new Error("Failed to create project");
        const newProject = await response.json();
        closeModal('modal-project');
        showToast(t('project_created_toast_prefix', 'Projekt "') + newProject.title + t('project_created_toast_suffix', '" erfolgreich erstellt!'), 'success');
        
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
        showToast(t('project_deleted_toast', 'Projekt in den Papierkorb verschoben.'), "success");
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

        // Fetch and preload project lore entries for relationship graph
        try {
            const loreRes = await fetch(`${API_URL}/projects/${projectId}/lore`);
            if (loreRes.ok) {
                state.loreList = await loreRes.json();
            }
        } catch (e) {
            console.error("Could not preload lore entries for state", e);
        }
        
        // Populate Project synopsis
        const synopsisEl = document.getElementById('project-details-description');
        if (synopsisEl) {
            synopsisEl.value = project.description || '';
        }
        
        // Update header
        document.getElementById('header-title').textContent = project.title;
        
        // Update Stats
        let totalWords = 0;
        project.chapters.forEach(c => totalWords += c.word_count);
        
        document.getElementById('stat-total-words').textContent = totalWords.toLocaleString();
        document.getElementById('stat-word-goal').textContent = project.word_count_goal.toLocaleString();
        document.getElementById('stat-daily-goal').textContent = `${project.daily_word_count_goal} ${t('words_lbl', 'Wörter')}`;
        
        const authorEl = document.getElementById('stat-author');
        if (authorEl) {
            authorEl.textContent = project.author || '-';
        }

        const dateStr = new Date(project.created_at).toLocaleDateString(state.uiLanguage === 'de' ? 'de-DE' : 'en-US');
        document.getElementById('stat-created-at').textContent = dateStr;
        
        // Populate the dropdown selector with original + all branches
        const branchSelect = document.getElementById('project-branch-select');
        if (branchSelect) {
            const currentSelected = state.activeLanguage;
            
            const origLang = project.original_language || "de";
            const langMap = {
                "de": { flag: "🇩🇪", label: t('lang_de', "Deutsch") },
                "en": { flag: "🇬🇧", label: t('lang_en', "Englisch") },
                "fr": { flag: "🇫🇷", label: t('lang_fr', "Französisch") },
                "es": { flag: "🇪🇸", label: t('lang_es', "Spanisch") },
                "it": { flag: "🇮🇹", label: t('lang_it', "Italienisch") },
                "ja": { flag: "🇯🇵", label: t('lang_ja', "Japanisch") },
                "zh": { flag: "🇨🇳", label: t('lang_zh', "Chinesisch") }
            };
            const mapping = langMap[origLang] || { flag: "🌐", label: origLang.toUpperCase() };
            branchSelect.innerHTML = `<option value="original">${mapping.flag} ${t('branch_original_badge', 'Original')} (${mapping.label})</option>`;
            
            try {
                const langRes = await fetch(`${API_URL}/projects/${projectId}/languages`);
                if (langRes.ok) {
                    const langs = await langRes.json();
                    langs.forEach(lang => {
                        const opt = document.createElement('option');
                        opt.value = lang;
                        opt.textContent = `${t('translation_lbl', 'Übersetzung')}: ${lang.toUpperCase()}`;
                        branchSelect.appendChild(opt);
                    });
                }
            } catch(err) {
                console.error("Error loading branch selector", err);
            }
            branchSelect.value = currentSelected;
        }

        // Show/hide branch warning banner
        const warningBanner = document.getElementById('project-branch-warning-banner');
        if (warningBanner) {
            if (state.activeLanguage !== 'original') {
                warningBanner.style.display = 'flex';
                document.getElementById('active-branch-banner-name').textContent = state.activeLanguage.toUpperCase();
            } else {
                warningBanner.style.display = 'none';
            }
        }
        
        // Render Chapter List
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';
        
        const chaptersCopy = [...project.chapters];
        if (state.chapterSortOrder === 'desc') {
            chaptersCopy.reverse();
        }
        
        const volumes = project.volumes || [];
        const mapping = project.chapters_volume_mapping || {};
        
        // Group chapters
        const grouped = { unassigned: [] };
        volumes.forEach(vol => grouped[vol.id] = []);
        chaptersCopy.forEach(c => {
            const volId = mapping[c.id];
            if (volId && grouped[volId]) {
                grouped[volId].push(c);
            } else {
                grouped.unassigned.push(c);
            }
        });

        // Helper to render a chapter item
        const renderChapterItem = (c, displayIndex) => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.setAttribute('data-chapter-id', c.id);
            if (state.activeLanguage === 'original') {
                item.setAttribute('draggable', 'true');
                item.style.cursor = 'grab';
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', c.id);
                    state.draggedChapterId = c.id;
                    item.classList.add('dragging');
                });
                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    state.draggedChapterId = null;
                });
            }
            if (c.has_recovery) {
                item.style.borderColor = 'var(--color-warning)';
            }
            
            let metaText = `${c.word_count} ${t('words_lbl', 'Wörter')} · ${t('last_modified', 'Letzte Änderung')}: ${new Date(c.updated_at).toLocaleString(state.uiLanguage === 'de' ? 'de-DE' : 'en-US')}`;
            if (state.activeLanguage !== 'original') {
                metaText = `${t('edited_translation', 'Bearbeitete Übersetzung')} (${state.activeLanguage.toUpperCase()}) · ${metaText}`;
            }
            
            item.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-title">
                        <strong style="color: var(--text-secondary); margin-right: 6px;">${displayIndex}.</strong> ${escapeHtml(c.title)} 
                        ${state.activeLanguage !== 'original' ? `<span style="background-color: var(--color-primary-light); color: var(--color-primary); font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 8px;">${t('branch_badge', 'Branch')}: ${state.activeLanguage.toUpperCase()}</span>` : ''}
                        ${c.has_recovery && state.activeLanguage === 'original' ? `<span style="color: var(--color-warning); font-size: 11px; font-weight: bold; margin-left: 8px;">⚠️ ${t('recovery_available', 'Wiederherstellung verfügbar')}</span>` : ''}
                    </div>
                    <div class="list-item-meta">${metaText}</div>
                </div>
                <div class="list-item-actions">
                    <button class="card-action-btn btn-delete" title="In den Papierkorb verschieben">🗑️</button>
                </div>
            `;
            
            item.addEventListener('click', () => {
                navigateTo('editor', { projectId: project.id, chapterId: c.id });
            });
            
            item.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm(t('delete_chapter_title', 'Kapitel löschen'), `${t('delete_chapter_body', 'Möchtest du das Kapitel wirklich in den Papierkorb verschieben?')} "${c.title}"`, () => {
                    deleteChapter(project.id, c.id);
                });
            });
            
            return item;
        };

        if (chaptersCopy.length === 0 && volumes.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">${t('no_chapters_placeholder', 'Keine Kapitel angelegt. Erstelle dein erstes Kapitel!')}</div>`;
        } else {
            // Render volume folders
            volumes.forEach(vol => {
                const volContainer = document.createElement('div');
                volContainer.className = 'volume-container';
                volContainer.setAttribute('data-volume-id', vol.id);
                volContainer.style.marginBottom = '12px';
                volContainer.style.border = '1px solid var(--border-color)';
                volContainer.style.borderRadius = '8px';
                volContainer.style.backgroundColor = 'var(--bg-surface)';
                volContainer.style.overflow = 'hidden';
                
                if (state.activeLanguage === 'original') {
                    volContainer.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        volContainer.classList.add('drag-over-volume');
                    });
                    volContainer.addEventListener('dragenter', (e) => {
                        e.preventDefault();
                    });
                    volContainer.addEventListener('dragleave', () => {
                        volContainer.classList.remove('drag-over-volume');
                    });
                    volContainer.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        volContainer.classList.remove('drag-over-volume');
                        
                        const chapterId = e.dataTransfer.getData('text/plain') || state.draggedChapterId;
                        if (!chapterId) return;
                        
                        const targetVolId = vol.id;
                        const newMapping = { ...mapping };
                        newMapping[chapterId] = targetVolId;
                        
                        await updateProjectMetadataDirectly({ chapters_volume_mapping: newMapping });
                        loadProjectDetails(project.id);
                    });
                }
                
                const isCollapsed = state.collapsedVolumes && state.collapsedVolumes[vol.id];
                
                const volHeader = document.createElement('div');
                volHeader.className = 'volume-header';
                volHeader.style.display = 'flex';
                volHeader.style.justifyContent = 'space-between';
                volHeader.style.alignItems = 'center';
                volHeader.style.padding = '10px 14px';
                volHeader.style.backgroundColor = 'var(--bg-base)';
                volHeader.style.cursor = 'pointer';
                volHeader.style.userSelect = 'none';
                
                const totalWords = grouped[vol.id].reduce((sum, ch) => sum + ch.word_count, 0);
                
                volHeader.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="volume-toggle-arrow" style="font-size: 10px; width: 12px; display: inline-block;">${isCollapsed ? '▶' : '▼'}</span>
                        <strong>📁 ${escapeHtml(vol.title)}</strong>
                        <span style="font-size: 11px; color: var(--text-secondary);">(${grouped[vol.id].length} Kap. · ${totalWords.toLocaleString()} W.)</span>
                    </div>
                    <div style="display: flex; gap: 8px;" onclick="event.stopPropagation();">
                        <button class="btn btn-secondary btn-rename-vol" style="padding: 2px 6px; font-size: 11px;" title="Band umbenennen">✏️</button>
                        <button class="btn btn-secondary btn-danger btn-delete-vol" style="padding: 2px 6px; font-size: 11px;" title="Band löschen">🗑️</button>
                    </div>
                `;
                
                const volBody = document.createElement('div');
                volBody.className = 'volume-body';
                volBody.style.padding = '8px';
                volBody.style.display = isCollapsed ? 'none' : 'flex';
                volBody.style.flexDirection = 'column';
                volBody.style.gap = '8px';
                
                volHeader.addEventListener('click', () => {
                    state.collapsedVolumes = state.collapsedVolumes || {};
                    state.collapsedVolumes[vol.id] = !state.collapsedVolumes[vol.id];
                    volBody.style.display = state.collapsedVolumes[vol.id] ? 'none' : 'flex';
                    volHeader.querySelector('.volume-toggle-arrow').textContent = state.collapsedVolumes[vol.id] ? '▶' : '▼';
                });
                
                volHeader.querySelector('.btn-rename-vol').addEventListener('click', () => {
                    showPrompt("Band umbenennen", "Neuer Name des Bandes:", vol.title, async (newTitle) => {
                        if (newTitle && newTitle.trim()) {
                            vol.title = newTitle.trim();
                            await updateProjectMetadataDirectly({ volumes });
                            loadProjectDetails(project.id);
                        }
                    });
                });
                
                volHeader.querySelector('.btn-delete-vol').addEventListener('click', () => {
                    showConfirm("Band löschen", `Möchtest du den Band "${vol.title}" wirklich löschen? Die Kapitel bleiben erhalten.`, async () => {
                        const newVolumes = volumes.filter(v => v.id !== vol.id);
                        const newMapping = { ...mapping };
                        Object.keys(newMapping).forEach(chId => {
                            if (newMapping[chId] === vol.id) {
                                delete newMapping[chId];
                            }
                        });
                        await updateProjectMetadataDirectly({ volumes: newVolumes, chapters_volume_mapping: newMapping });
                        loadProjectDetails(project.id);
                    });
                });
                
                if (grouped[vol.id].length === 0) {
                    volBody.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 12px;">Keine Kapitel in diesem Band.</div>`;
                } else {
                    grouped[vol.id].forEach((c, idx) => {
                        const item = renderChapterItem(c, idx + 1);
                        volBody.appendChild(item);
                    });
                }
                
                volContainer.appendChild(volHeader);
                volContainer.appendChild(volBody);
                list.appendChild(volContainer);
            });

            // Render unassigned chapters group if volumes exist
            if (volumes.length > 0) {
                const volContainer = document.createElement('div');
                volContainer.className = 'volume-container';
                volContainer.setAttribute('data-volume-id', 'unassigned');
                volContainer.style.marginBottom = '12px';
                volContainer.style.border = '1px solid var(--border-color)';
                volContainer.style.borderRadius = '8px';
                volContainer.style.backgroundColor = 'var(--bg-surface)';
                volContainer.style.overflow = 'hidden';
                
                if (state.activeLanguage === 'original') {
                    volContainer.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        volContainer.classList.add('drag-over-volume');
                    });
                    volContainer.addEventListener('dragenter', (e) => {
                        e.preventDefault();
                    });
                    volContainer.addEventListener('dragleave', () => {
                        volContainer.classList.remove('drag-over-volume');
                    });
                    volContainer.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        volContainer.classList.remove('drag-over-volume');
                        
                        const chapterId = e.dataTransfer.getData('text/plain') || state.draggedChapterId;
                        if (!chapterId) return;
                        
                        const newMapping = { ...mapping };
                        delete newMapping[chapterId];
                        
                        await updateProjectMetadataDirectly({ chapters_volume_mapping: newMapping });
                        loadProjectDetails(project.id);
                    });
                }
                
                const isCollapsed = state.collapsedVolumes && state.collapsedVolumes['unassigned'];
                
                const volHeader = document.createElement('div');
                volHeader.className = 'volume-header';
                volHeader.style.display = 'flex';
                volHeader.style.justifyContent = 'space-between';
                volHeader.style.alignItems = 'center';
                volHeader.style.padding = '10px 14px';
                volHeader.style.backgroundColor = 'var(--bg-base)';
                volHeader.style.cursor = 'pointer';
                volHeader.style.userSelect = 'none';
                
                const totalWords = grouped.unassigned.reduce((sum, ch) => sum + ch.word_count, 0);
                
                volHeader.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="volume-toggle-arrow" style="font-size: 10px; width: 12px; display: inline-block;">${isCollapsed ? '▶' : '▼'}</span>
                        <strong>📁 Ungruppierte Kapitel</strong>
                        <span style="font-size: 11px; color: var(--text-secondary);">(${grouped.unassigned.length} Kap. · ${totalWords.toLocaleString()} W.)</span>
                    </div>
                `;
                
                const volBody = document.createElement('div');
                volBody.className = 'volume-body';
                volBody.style.padding = '8px';
                volBody.style.display = isCollapsed ? 'none' : 'flex';
                volBody.style.flexDirection = 'column';
                volBody.style.gap = '8px';
                
                volHeader.addEventListener('click', () => {
                    state.collapsedVolumes = state.collapsedVolumes || {};
                    state.collapsedVolumes['unassigned'] = !state.collapsedVolumes['unassigned'];
                    volBody.style.display = state.collapsedVolumes['unassigned'] ? 'none' : 'flex';
                    volHeader.querySelector('.volume-toggle-arrow').textContent = state.collapsedVolumes['unassigned'] ? '▶' : '▼';
                });
                
                if (grouped.unassigned.length === 0) {
                    volBody.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 12px;">Keine ungruppierten Kapitel.</div>`;
                } else {
                    grouped.unassigned.forEach((c, idx) => {
                        const item = renderChapterItem(c, idx + 1);
                        volBody.appendChild(item);
                    });
                }
                
                volContainer.appendChild(volHeader);
                volContainer.appendChild(volBody);
                list.appendChild(volContainer);
            } else {
                // No volumes, render flat list
                chaptersCopy.forEach((c, index) => {
                    const displayIndex = state.chapterSortOrder === 'desc' ? chaptersCopy.length - index : index + 1;
                    const item = renderChapterItem(c, displayIndex);
                    list.appendChild(item);
                });
            }
            
            makeChaptersDraggable();
        }
    } catch (e) {
        showToast(e.message, 'danger');
        navigateTo('projects');
    }
}

async function handleCreateChapter() {
    const title = document.getElementById('chapter-title').value;
    if (!title.trim()) {
        showToast(t('toast_chapter_title_required', 'Bitte gib einen Kapiteltitel an.'), "warning");
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
        showToast(t('chapter_created_toast_prefix', 'Kapitel "') + chapter.title + t('chapter_created_toast_suffix', '" angelegt.'), 'success');
        
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
        showToast(t('chapter_deleted_toast', 'Kapitel gelöscht.'), "success");
        loadProjectDetails(projectId);
    } catch (e) {
        showToast(e.message, "danger");
    }
}

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
                    <div class="card-desc">${escapeHtml(p.description || t('no_description', 'Keine Beschreibung.'))}</div>
                    <div class="card-meta">
                        <span>${t('deleted_at_lbl', 'Gelöscht am: ')}${new Date(p.deleted_at || Date.now()).toLocaleDateString(state.uiLanguage === 'de' ? 'de-DE' : 'en-US')}</span>
                    </div>
                    <div class="card-actions" style="opacity: 1;">
                        <button class="card-action-btn btn-restore" title="${t('btn_restore', 'Wiederherstellen')}">🔄</button>
                        <button class="card-action-btn btn-delete btn-permanent" title="${t('delete_project_perm_title', 'Endgültig löschen')}" style="background-color: rgba(239,68,68,0.1); color: var(--color-danger);">❌</button>
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
                    showConfirm(t('delete_project_perm_title', 'Projekt endgültig löschen'), `${t('delete_project_perm_body', 'ACHTUNG: Möchtest du das Projekt wirklich dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden!')} "${p.title}"`, () => {
                        permanentDeleteProject(p.id);
                    });
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
        showToast(t('project_restored_toast', 'Projekt erfolgreich wiederhergestellt!'), "success");
        loadTrashedProjects();
    } catch (e) {
        showToast(e.message, "danger");
    }
}

async function permanentDeleteProject(id) {
    try {
        const response = await fetch(`${API_URL}/projects/${id}/permanent`, { method: 'DELETE' });
        if (!response.ok) throw new Error("Failed to delete project permanently");
        showToast(t('project_deleted_perm_toast', 'Projekt dauerhaft gelöscht.'), "success");
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
    
    showToast(t('merge_success_toast', 'Änderungen erfolgreich zusammengeführt!'), 'success');
}

// ==========================================
// 2.5 LORE / WIKI LOGIC
// ==========================================

async function loadLoreEntries() {
    if (!state.currentProject) return;
    
    const listContainer = document.getElementById('wiki-list');
    listContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted);">${t('loading_lore_entries', 'Lade Einträge...')}</div>`;
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/lore`);
        if (!response.ok) throw new Error("Could not load lore database");
        state.loreList = await response.json();
        renderLoreList(state.loreList);
    } catch (e) {
        showToast(t('error_load_lore', 'Fehler beim Laden der Lore: ') + e.message, "danger");
    }
}

function renderLoreList(entries) {
    const listContainer = document.getElementById('wiki-list');
    listContainer.innerHTML = '';
    
    if (entries.length === 0) {
        listContainer.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 13px;">${t('no_lore_entries_found', 'Keine Einträge gefunden.')}</div>`;
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
        showToast(t('toast_lore_name_required', 'Bitte gib dem Eintrag einen Namen.'), "warning");
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
        showToast(t('lore_save_success_prefix', 'Eintrag "') + saved.name + t('lore_save_success_suffix', '" erfolgreich gespeichert!'), 'success');
        
        // Reload list
        await loadLoreEntries();
        
        // If edit, re-render details
        if (isEdit) {
            showLoreDetail(state.editingLoreId);
        } else {
            showLoreDetail(saved.id);
        }

        // Evaluate if timepoints are mentioned and suggest timeline entries
        const combinedText = (saved.short_description || '') + '\n' + (saved.description || '');
        const suggestions = extractTimepointsFromText(combinedText);
        if (suggestions.length > 0) {
            suggestions.forEach(s => s.lore_id = saved.id);
            // Wait slightly for modal transition animations to finish
            setTimeout(() => showTimelineSuggestionsModal(suggestions), 300);
        }
        
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function deleteLoreEntry(loreId) {
    showConfirm(t('delete_lore_title', 'Lore-Eintrag löschen'), t('delete_lore_body', 'Möchtest du diesen Lore-Eintrag wirklich in den Papierkorb verschieben?'), async () => {
        try {
            const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/lore/${loreId}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("Could not delete lore entry");
            
            showToast(t('lore_deleted_toast', 'Eintrag gelöscht.'), "success");
            
            // Reset article panel
            const container = document.getElementById('wiki-article-container');
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 48px; margin: auto;">
                    <span style="font-size: 48px; display: block; margin-bottom: 16px;">📖</span>
                    <p>${t('lore_empty_state_text', 'Wähle einen Lore-Eintrag aus der Liste aus oder erstelle einen neuen, um Details anzuzeigen.')}</p>
                </div>
            `;
            
            loadLoreEntries();
        } catch (e) {
            showToast(e.message, 'danger');
        }
    });
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
                <button id="btn-wiki-edit-act" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px;">✏️ ${t('btn_edit', 'Bearbeiten')}</button>
                <button id="btn-wiki-delete-act" class="btn btn-secondary btn-danger" style="padding: 6px 12px; font-size: 13px; color: #fff;">🗑️ ${t('btn_delete', 'Löschen')}</button>
            </div>
        </div>
        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px; font-style: italic;">
            ${escapeHtml(entry.short_description || t('no_short_desc', 'Keine Kurzbeschreibung.'))}
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
        initialValue: entry.description || '_' + t('no_description_available', 'Keine ausführliche Beschreibung vorhanden.') + '_',
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
        initialValue: entry.description || entry.short_description || '_' + t('no_description_available', 'Keine Beschreibung vorhanden.') + '_',
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
        case 'character': return t('lore_cat_character', 'Charakter');
        case 'location': return t('lore_cat_location', 'Ort / Schauplatz');
        case 'item': return t('lore_cat_item', 'Objekt / Gegenstand');
        case 'lore': return t('lore_cat_lore', 'Begriff / Sonstiges');
        default: return t('lore_lbl', 'Lore');
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
    
    showToast(t('export_started_toast_prefix', 'Exportiere Buch als ') + format.toUpperCase() + t('export_started_toast_suffix', '...'), 'info');
    
    try {
        const url = `${API_URL}/projects/${state.currentProject.id}/export/${format}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapter_ids: chapterIds })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || t('export_failed', 'Export fehlgeschlagen.'));
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
        
        showToast(t('export_success_prefix', 'Export als ') + format.toUpperCase() + t('export_success_suffix', ' erfolgreich abgeschlossen!'), 'success');
    } catch (e) {
        showToast(t('error_export', 'Fehler beim Export: ') + e.message, 'danger');
    }
}

function openExportModal() {
    if (!state.currentProject) return;
    
    const list = document.getElementById('export-chapters-list');
    list.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">${t('loading_chapter', 'Lade Kapitel...')}</div>`;
    
    fetch(`${API_URL}/projects/${state.currentProject.id}/chapters`)
        .then(res => res.json())
        .then(chapters => {
            list.innerHTML = '';
            if (chapters.length === 0) {
                list.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">${t('no_chapters_placeholder_short', 'Keine aktiven Kapitel vorhanden.')}</div>`;
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
            showToast(t('error_load_chapters', 'Kapitel konnten nicht geladen werden.'), "danger");
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
        
        // General Interval and UI language
        const savedInterval = localStorage.getItem('ember_autosave_interval') || '3';
        document.getElementById('setting-autosave-interval').value = savedInterval;
        
        const savedUiLang = localStorage.getItem('ember_ui_language') || 'de';
        document.getElementById('setting-ui-language').value = savedUiLang;
        
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
        
        // Backup settings
        document.getElementById('setting-backup-enabled').checked = settings.backup_enabled || false;
        document.getElementById('setting-backup-dir').value = settings.backup_dir || '';
        state.backupEnabled = settings.backup_enabled || false;
        state.backupDir = settings.backup_dir || '';
        
        // Trigger visibility
        providerSelect.dispatchEvent(new Event('change'));
        
    } catch (e) {
        showToast(t('error_loading_settings', 'Fehler beim Laden der Einstellungen: ') + e.message, "danger");
    }
}

async function handleSaveSettings() {
    // Save general interval to localStorage
    const interval = document.getElementById('setting-autosave-interval').value;
    localStorage.setItem('ember_autosave_interval', interval);
    state.autosaveInterval = parseInt(interval, 10) * 1000;
    
    // Save UI language to localStorage and reload it
    const uiLang = document.getElementById('setting-ui-language').value;
    const oldUiLang = localStorage.getItem('ember_ui_language') || 'de';
    localStorage.setItem('ember_ui_language', uiLang);
    state.uiLanguage = uiLang;
    if (uiLang !== oldUiLang) {
        await loadUiLanguage(uiLang);
        navigateTo(state.currentView, state.currentProject ? { projectId: state.currentProject.id } : {});
    }
    
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
        auto_translate_on_save: document.getElementById('setting-auto-translate').checked,
        backup_enabled: document.getElementById('setting-backup-enabled').checked,
        backup_dir: document.getElementById('setting-backup-dir').value
    };
    
    state.backupEnabled = payload.backup_enabled;
    state.backupDir = payload.backup_dir;
    
    try {
        const response = await fetch(`${API_URL}/ai/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error("API request failed");
        
        showToast(t('settings_save_success', 'Einstellungen erfolgreich gespeichert!'), 'success');
        
    } catch (e) {
        showToast(t('error_save_settings', 'KI-Einstellungen konnten nicht gespeichert werden: ') + e.message, 'danger');
    }
}

async function loadProjectLanguages(projectId) {
    const list = document.getElementById('project-languages-list');
    list.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">${t('loading_languages', 'Lade Sprachen...')}</div>`;
    
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
        origEl.style.cursor = 'pointer';
        
        if (state.activeLanguage === 'original') {
            origEl.style.borderColor = 'var(--color-primary)';
            origEl.style.backgroundColor = 'var(--color-primary-light)';
        }
        
        origEl.innerHTML = `
            <span style="font-size: 13px; font-weight: 500;">🇩🇪 Deutsch (${t('branch_original_badge', 'Original')})</span>
            <span style="font-size: 10px; background-color: var(--color-primary-light); color: var(--color-primary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">${t('branch_original_badge', 'Original')}</span>
        `;
        
        origEl.addEventListener('click', () => {
            state.activeLanguage = 'original';
            loadProjectDetails(projectId);
            loadProjectLanguages(projectId);
        });
        list.appendChild(origEl);
        
        // Add other branches
        langs.forEach(lang => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.style.padding = '8px 12px';
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            el.style.cursor = 'pointer';
            
            if (state.activeLanguage === lang) {
                el.style.borderColor = 'var(--color-primary)';
                el.style.backgroundColor = 'var(--color-primary-light)';
            }
            
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
            
            el.addEventListener('click', () => {
                state.activeLanguage = lang;
                loadProjectDetails(projectId);
                loadProjectLanguages(projectId);
            });
            list.appendChild(el);
        });
    } catch (e) {
        list.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">${t('error_loading', 'Fehler beim Laden.')}</div>`;
    }
}

async function handleCreateLanguageBranch() {
    if (!state.currentProject) return;
    
    const codeEl = document.getElementById('new-language-code');
    const lang_code = codeEl.value.trim().toLowerCase();
    
    if (!lang_code) {
        showToast(t('toast_lang_code_required', 'Bitte gib einen Sprachcode ein.'), "warning");
        return;
    }
    
    showToast(t('branch_creating_prefix', 'Erstelle Sprachzweig "') + lang_code.toUpperCase() + t('branch_creating_suffix', '"...'), 'info');
    closeModal('modal-language');
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/languages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lang_code })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || t('error_create_branch', 'Failed to create language branch'));
        }
        
        showToast(t('branch_translating_bg_prefix', 'Sprachzweig "') + lang_code.toUpperCase() + t('branch_translating_bg_suffix', '" wird im Hintergrund übersetzt!'), 'success');
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

        // Track initial word count for session progress
        const text = data.content || '';
        state.chapterWordCountOnLoad = text.trim() ? text.trim().split(/\s+/).length : 0;
        state.sessionWords = 0;
        
        if (state.editor) {
            state.loadingChapter = true;
            state.editor.setMarkdown(data.content || '');
            state.loadingChapter = false;
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
            updateEditorNavigation();
        }, 150);
        
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function handleManualTranslate() {
    if (!state.currentProject || !state.currentChapter || state.activeLanguage === 'original') return;
    
    showConfirm(t('translate_chapter_title', 'Kapitel übersetzen'), `${t('translate_chapter_body', 'Möchtest du dieses Kapitel jetzt neu aus dem Original übersetzen? Eigene Änderungen an dieser Übersetzung werden überschrieben.')} (${state.activeLanguage.toUpperCase()})`, async () => {
        const saveStatus = document.getElementById('save-status');
        saveStatus.style.display = 'inline-block';
        saveStatus.textContent = t('translating', 'Übersetze...');
        
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
            showToast(t('chapter_translated_toast', 'Kapitel erfolgreich neu übersetzt!'), "success");
            
        } catch (e) {
            showToast(t('error_translation', 'Fehler bei der Übersetzung: ') + e.message, 'danger');
        } finally {
            saveStatus.style.display = 'none';
        }
    });
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
        showToast(t('toast_no_text_to_process', 'Es gibt keinen Text zum Verarbeiten.'), "warning");
        return;
    }
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.style.display = 'inline-block';
    saveStatus.textContent = task === 'correct' ? t('ai_proofreading_running', 'Lektorat läuft...') : t('ai_continue_writing', 'Schreibe weiter...');
    
    try {
        const response = await fetch(`${API_URL}/ai/assist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, task })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || t('error_ai_request_failed', 'AI Request failed'));
        }
        
        const data = await response.json();
        const result = data.result;
        
        if (!result) {
            showToast(t('toast_no_ai_response', 'Keine Antwort erhalten.'), "warning");
            return;
        }
        
        if (task === 'correct') {
            if (isSelection) {
                state.editor.replaceSelection(result);
            } else {
                state.editor.setMarkdown(result);
            }
            showToast(t('text_proofread_toast', 'Text erfolgreich lektoriert!'), "success");
        } else if (task === 'continue') {
            state.editor.insertText("\n" + result);
            showToast(t('text_continued_toast', 'Text erfolgreich fortgeführt!'), "success");
        }
        
        state.isDirty = true;
        
    } catch (e) {
        showToast("KI-Fehler: " + e.message, "danger");
    } finally {
        saveStatus.style.display = 'none';
    }
}

// ==========================================
// CUSTOM DIALOG & WIZARD EXTENSIONS
// ==========================================

// Custom non-blocking web confirm implementation
function showConfirm(title, message, onSubmit) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = message;
    
    const submitBtn = document.getElementById('btn-confirm-submit');
    const cancelBtn = document.getElementById('btn-confirm-cancel');
    
    // Reset click listener
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    
    newSubmitBtn.addEventListener('click', () => {
        closeModal('modal-confirm');
        if (onSubmit) onSubmit();
    });
    
    openModal('modal-confirm');
}

// Custom non-blocking web prompt implementation
function showPrompt(title, message, defaultValue, callback) {
    const modal = document.getElementById('modal-prompt');
    const titleEl = document.getElementById('prompt-title');
    const msgEl = document.getElementById('prompt-message');
    const inputEl = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('btn-prompt-submit');

    if (!modal || !titleEl || !msgEl || !inputEl || !submitBtn) {
        const res = prompt(message, defaultValue);
        callback(res);
        return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    inputEl.value = defaultValue || '';
    
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    
    newSubmitBtn.addEventListener('click', () => {
        const val = inputEl.value;
        closeModal('modal-prompt');
        callback(val);
    });

    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            newSubmitBtn.click();
        }
    };

    openModal('modal-prompt');
    setTimeout(() => inputEl.focus(), 100);
}

// Open Import Wizard Modal
function openImportWizard() {
    // Reset inputs
    document.getElementById('import-folder-picker').value = '';
    document.getElementById('import-file-picker').value = '';
    
    // Activate default tab
    document.getElementById('tab-import-folder').classList.add('active');
    document.getElementById('tab-import-file').classList.remove('active');
    document.getElementById('panel-import-folder').style.display = 'flex';
    document.getElementById('panel-import-file').style.display = 'none';
    
    openModal('modal-import');
}

// Process Markdown Single-File Chapter Extraction
function parseMarkdownToChapters(text, defaultTitle) {
    const lines = text.split('\n');
    const chapters = [];
    let currentTitle = "";
    let currentContent = [];
    
    for (let line of lines) {
        if (line.match(/^#+\s+/)) {
            if (currentTitle || currentContent.length > 0) {
                chapters.push({
                    title: currentTitle || defaultTitle || "Kapitel",
                    content: currentContent.join('\n')
                });
            }
            currentTitle = line.replace(/^#+\s+/, '').trim();
            currentContent = [];
        } else {
            currentContent.push(line);
        }
    }
    
    if (currentTitle || currentContent.length > 0) {
        chapters.push({
            title: currentTitle || defaultTitle || "Kapitel",
            content: currentContent.join('\n')
        });
    }
    
    if (chapters.length === 0) {
        chapters.push({
            title: defaultTitle || "Kapitel 1",
            content: text
        });
    }
    
    return chapters;
}

// Handle Import Submission
async function handleImportWizardSubmit() {
    const isFolder = document.getElementById('tab-import-folder').classList.contains('active');
    
    if (isFolder) {
        const picker = document.getElementById('import-folder-picker');
        if (!picker.files || picker.files.length === 0) {
            showToast("Bitte wähle einen Ordner zum Importieren aus.", "warning");
            return;
        }
        
        const mdFiles = Array.from(picker.files).filter(f => f.name.endsWith('.md') || f.name.endsWith('.txt'));
        if (mdFiles.length === 0) {
            showToast("Keine Markdown (.md) Dateien im ausgewählten Ordner gefunden.", "warning");
            return;
        }
        
        // Sort files numerically/alphabetically
        mdFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        
        let folderName = t('imported_project_default_title', "Importiertes Projekt");
        if (mdFiles[0].webkitRelativePath) {
            const parts = mdFiles[0].webkitRelativePath.split('/');
            if (parts.length > 1) {
                folderName = parts[0];
            }
        }
        
        const original_language = document.getElementById('import-folder-lang').value;
        
        showToast(t('toast_project_creating', "Projekt wird erstellt..."), "info");
        try {
            const projRes = await fetch(`${API_URL}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: folderName, author: t('imported_author_placeholder', "Importiert"), description: t('import_folder_desc_prefix', "Ordner-Import von ") + folderName, original_language })
            });
            if (!projRes.ok) throw new Error("Failed to create project");
            const project = await projRes.json();
            
            for (let i = 0; i < mdFiles.length; i++) {
                const file = mdFiles[i];
                const title = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                const content = await file.text();
                
                const chRes = await fetch(`${API_URL}/projects/${project.id}/chapters`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title })
                });
                if (!chRes.ok) continue;
                const chapter = await chRes.json();
                
                await fetch(`${API_URL}/projects/${project.id}/chapters/${chapter.id}/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
            }
            
            showToast(t('import_folder_success_toast', "Ordner-Import erfolgreich abgeschlossen!"), "success");
            closeModal('modal-import');
            loadProjects();
        } catch(err) {
            showToast(t('error_import', "Fehler beim Import: ") + err.message, "danger");
        }
        
    } else {
        const picker = document.getElementById('import-file-picker');
        if (!picker.files || picker.files.length === 0) {
            showToast(t('toast_select_md_file_first', "Bitte wähle eine .md Datei zum Importieren aus."), "warning");
            return;
        }
        
        const file = picker.files[0];
        const fileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        const mode = document.querySelector('input[name="import-file-mode"]:checked').value;
        
        showToast(t('toast_reading_file', "Lese Datei..."), "info");
        const fileText = await file.text();
        
        if (mode === 'project') {
            const original_language = document.getElementById('import-file-lang').value;
            const parsedChapters = parseMarkdownToChapters(fileText, fileName);
            
            showToast(t('toast_creating_project_chapters_prefix', "Erstelle Projekt mit ") + parsedChapters.length + t('toast_creating_project_chapters_suffix', " Kapiteln..."), "info");
            try {
                const projRes = await fetch(`${API_URL}/projects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: fileName, author: t('imported_author_placeholder', "Importiert"), description: t('import_file_desc_prefix', "Datei-Import von ") + file.name, original_language })
                });
                if (!projRes.ok) throw new Error("Failed to create project");
                const project = await projRes.json();
                
                for (let i = 0; i < parsedChapters.length; i++) {
                    const chData = parsedChapters[i];
                    
                    const chRes = await fetch(`${API_URL}/projects/${project.id}/chapters`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: chData.title })
                    });
                    if (!chRes.ok) continue;
                    const chapter = await chRes.json();
                    
                    await fetch(`${API_URL}/projects/${project.id}/chapters/${chapter.id}/save`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: chData.content })
                    });
                }
                
                showToast(t('import_book_success_toast', "Buch-Import erfolgreich abgeschlossen!"), "success");
                closeModal('modal-import');
                loadProjects();
            } catch(err) {
                showToast(t('error_import', "Fehler beim Import: ") + err.message, "danger");
            }
        } else {
            const projectId = document.getElementById('import-file-target-project').value;
            if (!projectId) {
                showToast(t('toast_select_target_project_first', "Bitte wähle ein Ziel-Projekt aus."), "warning");
                return;
            }
            
            try {
                const chRes = await fetch(`${API_URL}/projects/${projectId}/chapters`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: fileName })
                });
                if (!chRes.ok) throw new Error(t('error_create_chapter_failed', "Kapitel konnte nicht erstellt werden"));
                const chapter = await chRes.json();
                
                await fetch(`${API_URL}/projects/${projectId}/chapters/${chapter.id}/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: fileText })
                });
                
                showToast(t('import_chapter_success_toast', "Kapitel erfolgreich importiert!"), "success");
                closeModal('modal-import');
                if (state.currentProject && state.currentProject.id === projectId) {
                    loadProjectDetails(projectId);
                } else {
                    navigateTo('project-details', { projectId });
                }
            } catch(err) {
                showToast(t('error_import', "Fehler beim Import: ") + err.message, "danger");
            }
        }
    }
}

async function handleSaveProjectStats() {
    if (!state.currentProject) return;
    
    const title = document.getElementById('stats-project-title').value.trim();
    const author = document.getElementById('stats-project-author').value.trim();
    const word_count_goal = parseInt(document.getElementById('stats-word-goal').value) || 50000;
    const daily_word_count_goal = parseInt(document.getElementById('stats-daily-goal').value) || 500;
    const deadline_date = document.getElementById('stats-deadline-date').value || "";
    const original_language = document.getElementById('stats-original-language').value || "de";
    
    if (!title) {
        showToast("Projekt-Titel darf nicht leer sein.", "danger");
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, author, word_count_goal, daily_word_count_goal, deadline_date, original_language })
        });
        
        if (!response.ok) throw new Error("Failed to update project stats");
        
        showToast(t('stats_update_success_toast', "Projekt-Ziele erfolgreich aktualisiert!"), "success");
        closeModal('modal-project-stats');
        loadProjectDetails(state.currentProject.id);
    } catch(err) {
        showToast(err.message, "danger");
    }
}

// Drag & Drop sequence sorting of original chapters list
function makeChaptersDraggable() {
    if (state.activeLanguage !== 'original') return; // Read-only ordering for translation branches
    
    const list = document.getElementById('chapters-list');
    const items = list.querySelectorAll('.list-item');
    
    let dragSrcEl = null;
    
    items.forEach(item => {
        item.setAttribute('draggable', 'true');
        item.style.cursor = 'grab';
        
        item.addEventListener('dragstart', (e) => {
            dragSrcEl = item;
            e.dataTransfer.setData('text/plain', item.getAttribute('data-chapter-id'));
            state.draggedChapterId = item.getAttribute('data-chapter-id');
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            return false;
        });
        
        item.addEventListener('dragenter', (e) => {
            if (item !== dragSrcEl) {
                item.classList.add('drag-over');
            }
        });
        
        item.addEventListener('dragleave', (e) => {
            item.classList.remove('drag-over');
        });
        
        item.addEventListener('drop', async (e) => {
            e.stopPropagation();
            if (dragSrcEl && dragSrcEl !== item) {
                const dragParent = dragSrcEl.parentNode;
                const dropParent = item.parentNode;
                
                if (dragParent === dropParent) {
                    const allItems = Array.from(dragParent.children);
                    const dragIndex = allItems.indexOf(dragSrcEl);
                    const dropIndex = allItems.indexOf(item);
                    
                    if (dragIndex < dropIndex) {
                        dragParent.insertBefore(dragSrcEl, item.nextSibling);
                    } else {
                        dragParent.insertBefore(dragSrcEl, item);
                    }
                    
                    const newOrder = Array.from(list.querySelectorAll('.list-item')).map(child => {
                        return child.getAttribute('data-chapter-id');
                    });
                    
                    try {
                        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/reorder`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chapters_order: newOrder })
                        });
                        
                        if (response.ok) {
                            showToast(t('reorder_success_toast', "Reihenfolge aktualisiert!"), "success");
                            list.querySelectorAll('.volume-body, #chapters-list').forEach(body => {
                                if (body.id === 'chapters-list' && list.querySelector('.volume-container')) {
                                    return; // skip outer container list if volumes are present
                                }
                                let localIdx = 1;
                                body.querySelectorAll('.list-item').forEach(chEl => {
                                    const titleEl = chEl.querySelector('.list-item-title strong');
                                    if (titleEl) {
                                        titleEl.textContent = `${localIdx}.`;
                                        localIdx++;
                                    }
                                });
                            });
                        }
                    } catch(err) {
                        showToast(t('error_reorder', "Fehler beim Umsortieren: ") + err.message, "danger");
                    }
                }
            }
            return false;
        });
        
        item.addEventListener('dragend', () => {
            items.forEach(it => {
                it.classList.remove('drag-over');
                it.classList.remove('dragging');
            });
            state.draggedChapterId = null;
        });
    });
}

// ==========================================
// SYSTEM TRANSLATION (I18N) & UPDATE ENGINE
// ==========================================

// Translation lookup helper
function t(key, defaultValue) {
    if (state.translations && state.translations[key]) {
        return state.translations[key];
    }
    return defaultValue;
}

// Load selected translation JSON file and localize DOM elements
async function loadUiLanguage(lang) {
    try {
        const response = await fetch(`lang/${lang}.json`);
        if (!response.ok) throw new Error("Localization file not found");
        state.translations = await response.json();
        
        // Translate elements with data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (state.translations[key]) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = state.translations[key];
                } else {
                    el.textContent = state.translations[key];
                }
            }
        });
        
        // Save choice
        localStorage.setItem('ember_ui_language', lang);
        state.uiLanguage = lang;
        
        // Update document lang
        document.documentElement.lang = lang;
        
    } catch (e) {
        console.error("Localization error:", e);
    }
}

// Check Raw GitHub repository version.json for updates
async function checkAppUpdates() {
    const btn = document.getElementById('btn-check-update');
    const panel = document.getElementById('update-status-panel');
    const msg = document.getElementById('update-status-msg');
    const notes = document.getElementById('update-release-notes');
    const triggerBtn = document.getElementById('btn-trigger-update');
    
    btn.disabled = true;
    btn.textContent = t('searching', 'Suche...');
    panel.style.display = 'flex';
    msg.textContent = t('searching_updates', 'Suche nach neuen Updates...');
    notes.textContent = '';
    triggerBtn.style.display = 'none';
    
    const currentVersion = state.localVersion || "0.2.0.0";
    
    try {
        // Fetch raw version.json from MasterBurns/EmberNovels raw endpoint
        const response = await fetch('https://raw.githubusercontent.com/MasterBurns/EmberNovels/master/version.json');
        if (!response.ok) throw new Error("Could not download updates list");
        const data = await response.json();
        
        const latestVersion = data.version || "0.2.0.0";
        const isNewer = compareVersions(latestVersion, currentVersion) > 0;
        
        if (isNewer) {
            msg.innerHTML = `<span style="color: var(--color-warning);">⚠️ ${t('update_available_prefix', 'Update verfügbar! Version')} ${latestVersion} ${t('update_available_suffix', 'ist jetzt online.')}</span>`;
            
            let notesText = '';
            if (data.release_notes) {
                if (typeof data.release_notes === 'object') {
                    notesText = data.release_notes[state.uiLanguage] || data.release_notes['en'] || data.release_notes['de'] || '';
                } else {
                    notesText = data.release_notes;
                }
            }
            notes.textContent = notesText || t('no_release_notes', 'Keine Update-Notizen vorhanden.');

            
            // Re-bind trigger click
            const newTriggerBtn = triggerBtn.cloneNode(true);
            triggerBtn.parentNode.replaceChild(newTriggerBtn, triggerBtn);
            newTriggerBtn.style.display = 'inline-block';
            newTriggerBtn.addEventListener('click', () => {
                showConfirm(
                    t('update_install_title', 'Update installieren'),
                    `Möchtest du das Update auf Version ${latestVersion} jetzt automatisch installieren lassen? EmberNovels startet danach automatisch neu.`,
                    async () => {
                        const style = document.createElement('style');
                        style.textContent = `
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            @keyframes loading-bar {
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(350%); }
                            }
                        `;
                        document.head.appendChild(style);

                        const overlay = document.createElement('div');
                        overlay.id = 'update-fullscreen-overlay';
                        overlay.style = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(15, 23, 42, 0.98); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; color: white; font-family: sans-serif;';
                        overlay.innerHTML = `
                            <div style="font-size: 40px; animation: spin 2s linear infinite;">🔥</div>
                            <h2 style="margin: 0; font-size: 22px;">EmberNovels wird aktualisiert</h2>
                            <p style="margin: 0; color: #94a3b8; font-size: 14px;" id="update-overlay-status">Suche passende Paket-Datei...</p>
                            <div style="width: 250px; height: 6px; background-color: #1e293b; border-radius: 3px; overflow: hidden; border: 1px solid #334155;">
                                <div style="width: 30%; height: 100%; background-color: #f97316; animation: loading-bar 1.5s infinite ease-in-out;"></div>
                            </div>
                        `;
                        document.body.appendChild(overlay);

                        const statusText = document.getElementById('update-overlay-status');

                        try {
                            const releasesRes = await fetch('https://api.github.com/repos/MasterBurns/EmberNovels/releases/latest');
                            if (!releasesRes.ok) throw new Error("Konnte Release-Assets von GitHub nicht abfragen.");
                            const releaseData = await releasesRes.json();

                            const platform = navigator.userAgent.toLowerCase();
                            let targetAsset = null;

                            if (platform.includes('win')) {
                                targetAsset = releaseData.assets.find(a => a.name.includes('Windows') && a.name.endsWith('.zip'));
                            } else if (platform.includes('mac') || platform.includes('darwin')) {
                                targetAsset = releaseData.assets.find(a => a.name.includes('macOS') || a.name.endsWith('.zip'));
                            } else if (platform.includes('linux')) {
                                targetAsset = releaseData.assets.find(a => a.name.includes('Linux') && a.name.endsWith('.tar.gz'));
                            }

                            if (!targetAsset) {
                                throw new Error("Kein passendes ausführbares Paket für dein Betriebssystem gefunden.");
                            }

                            statusText.textContent = `Lade ${targetAsset.name} herunter...`;

                            const triggerRes = await fetch(`${API_URL}/update/trigger`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ download_url: targetAsset.browser_download_url })
                            });

                            if (!triggerRes.ok) {
                                const errData = await triggerRes.json();
                                throw new Error(errData.detail || "Server meldet Fehler beim Update-Start.");
                            }

                            statusText.textContent = "Server startet neu. Verbinde wieder...";

                            let pollCount = 0;
                            const pollInterval = setInterval(async () => {
                                pollCount++;
                                try {
                                    const verRes = await fetch('/api/version');
                                    if (verRes.ok) {
                                        const verData = await verRes.json();
                                        if (verData.version === latestVersion) {
                                            clearInterval(pollInterval);
                                            statusText.textContent = "Erfolgreich aktualisiert! Lade neu...";
                                            setTimeout(() => {
                                                location.reload();
                                            }, 1000);
                                        }
                                    }
                                } catch (e) {
                                    // Connection refused while restarting (expected)
                                }

                                if (pollCount > 80) {
                                    clearInterval(pollInterval);
                                    overlay.remove();
                                    showToast("Update-Verbindungstimeout. Bitte starte die Anwendung manuell neu.", "danger");
                                }
                            }, 1500);

                        } catch (err) {
                            overlay.remove();
                            showToast("Update fehlgeschlagen: " + err.message, "danger");
                        }
                    }
                );
            });
        } else {
            msg.innerHTML = `<span style="color: var(--color-success);">✨ ${t('app_up_to_date_prefix', 'EmberNovels ist auf dem neuesten Stand (Version')} ${currentVersion}).</span>`;
            notes.textContent = t('no_updates_available', 'Keine neuen Updates verfügbar.');
        }
    } catch(err) {
        msg.innerHTML = `<span style="color: var(--color-danger);">❌ ${t('error_checking_updates', 'Fehler beim Abfragen der Updates:')} ${err.message}</span>`;
        notes.textContent = t('check_connection_retry', 'Bitte überprüfe deine Internetverbindung oder versuche es später noch einmal.');
    } finally {
        btn.disabled = false;
        btn.textContent = t('about_update_check', 'Nach Updates suchen');
    }
}

// Compare semantic versions (e.g. 1.2.3 vs 1.2.4)
function compareVersions(a, b) {
    const pa = a.split('.');
    const pb = b.split('.');
    for (let i = 0; i < 4; i++) {
        const na = Number(pa[i] || 0);
        const nb = Number(pb[i] || 0);
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

// ==========================================
// D. NEW AI CHAT & LORE TOOLTIP HELPERS
// ==========================================

// Side Panel Tab Switching
function switchSidePanelTab(tabName) {
    const tabBtnLore = document.getElementById('tab-btn-lore');
    const tabBtnAi = document.getElementById('tab-btn-ai');
    const tabBtnStyle = document.getElementById('tab-btn-style');
    const contentLore = document.getElementById('tab-content-lore');
    const contentAi = document.getElementById('tab-content-ai');
    const contentStyle = document.getElementById('tab-content-style');
    
    if (!tabBtnLore || !tabBtnAi || !contentLore || !contentAi) return;

    // Reset styles
    [tabBtnLore, tabBtnAi, tabBtnStyle].forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
            btn.style.borderBottom = '2px solid transparent';
            btn.style.color = 'var(--text-muted)';
        }
    });
    [contentLore, contentAi, contentStyle].forEach(c => {
        if (c) c.style.display = 'none';
    });

    if (tabName === 'lore') {
        tabBtnLore.classList.add('active');
        tabBtnLore.style.borderBottom = '2px solid var(--color-primary)';
        tabBtnLore.style.color = 'var(--text-base)';
        contentLore.style.display = 'flex';
    } else if (tabName === 'ai') {
        tabBtnAi.classList.add('active');
        tabBtnAi.style.borderBottom = '2px solid var(--color-primary)';
        tabBtnAi.style.color = 'var(--text-base)';
        contentAi.style.display = 'flex';
    } else if (tabName === 'style') {
        if (tabBtnStyle) {
            tabBtnStyle.classList.add('active');
            tabBtnStyle.style.borderBottom = '2px solid var(--color-primary)';
            tabBtnStyle.style.color = 'var(--text-base)';
        }
        if (contentStyle) contentStyle.style.display = 'flex';
        // Auto check when switching to style tab if results are empty
        const results = document.getElementById('style-check-results');
        if (results && results.innerHTML.includes('Klicke auf "Prüfen"')) {
            runStyleCheck();
        }
    }
}

// Save Project Synopsis (Description)
async function handleSaveProjectDescription() {
    if (!state.currentProject) return;
    const synopsis = document.getElementById('project-details-description').value;
    
    const saveBtn = document.getElementById('btn-save-project-description');
    saveBtn.disabled = true;
    saveBtn.textContent = t('saving_lbl', 'Speichert...');
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: synopsis })
        });
        
        if (!response.ok) throw new Error("Failed to save project synopsis");
        
        state.currentProject.description = synopsis;
        showToast(t('synopsis_saved_toast', 'Projekt-Zusammenfassung erfolgreich gespeichert!'), 'success');
    } catch (e) {
        showToast(t('error_save_synopsis', 'Fehler beim Speichern: ') + e.message, 'danger');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = t('btn_save_synopsis', 'Zusammenfassung speichern');
    }
}

// AI Chat Clear
function handleAIChatClear() {
    const history = document.getElementById('ai-chat-history');
    if (history) {
        history.innerHTML = `
            <div class="ai-chat-message system" style="color: var(--text-muted); text-align: center; padding: 12px;">
                ${t('ai_chat_welcome', 'Gib unten eine Anweisung ein. Die KI wird den aktivierten Kontext nutzen, um den Text fortzuführen.')}
            </div>
        `;
    }
}

// AI Chat Submit
async function handleAIChatSubmit() {
    if (!state.editor || !state.currentProject || !state.currentChapter) return;
    
    const promptInput = document.getElementById('ai-chat-input');
    const prompt = promptInput.value.trim();
    if (!prompt) {
        showToast(t('toast_enter_prompt_first', 'Bitte gib zuerst eine Anweisung ein.'), 'warning');
        return;
    }
    
    const submitBtn = document.getElementById('btn-ai-chat-submit');
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = t('ai_loading', 'Generiere...');
    
    // Add user message to history
    const history = document.getElementById('ai-chat-history');
    
    // Remove welcome system message if present
    const welcomeMsg = history.querySelector('.ai-chat-message.system');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    const userMsgEl = document.createElement('div');
    userMsgEl.className = 'ai-chat-message user';
    userMsgEl.textContent = prompt;
    history.appendChild(userMsgEl);
    history.scrollTop = history.scrollHeight;
    
    // Gather contexts
    const includeLore = document.getElementById('ai-opt-include-lore').checked;
    const includeChapters = document.getElementById('ai-opt-include-chapters').checked;
    const includeSynopsis = document.getElementById('ai-opt-include-synopsis').checked;
    
    // Text before cursor
    const text_before = state.editor.getMarkdown().trim();
    
    const payload = {
        project_id: state.currentProject.id,
        chapter_id: state.currentChapter.id,
        text_before: text_before,
        prompt: prompt,
        include_lore: includeLore,
        include_chapters: includeChapters,
        include_synopsis: includeSynopsis
    };
    
    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'API request failed');
        }
        
        const data = await response.json();
        const result = data.result;
        
        if (!result) {
            throw new Error(t('toast_no_ai_response', 'Keine Antwort erhalten.'));
        }
        
        // Render AI message in history
        const aiMsgEl = document.createElement('div');
        aiMsgEl.className = 'ai-chat-message ai';
        
        // Escape content but preserve line breaks
        const formattedResult = escapeHtml(result).replace(/\n/g, '<br>');
        
        aiMsgEl.innerHTML = `
            <div style="font-size: 13px; line-height: 1.5; margin-bottom: 8px;">${formattedResult}</div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-ai-chat-insert" style="padding: 4px 8px; font-size: 11px;">📥 Einfügen</button>
                <button class="btn btn-secondary btn-ai-chat-copy" style="padding: 4px 8px; font-size: 11px;">📋 Kopieren</button>
            </div>
        `;
        
        // Bind insert button click
        aiMsgEl.querySelector('.btn-ai-chat-insert').addEventListener('click', () => {
            state.editor.insertText("\n\n" + result);
            showToast(t('text_inserted_toast', 'Text erfolgreich eingefügt!'), 'success');
            state.isDirty = true;
        });
        
        // Bind copy button click
        aiMsgEl.querySelector('.btn-ai-chat-copy').addEventListener('click', () => {
            navigator.clipboard.writeText(result);
            showToast(t('copied_to_clipboard', 'Kopiert!'), 'success');
        });
        
        history.appendChild(aiMsgEl);
        promptInput.value = '';
        
    } catch (e) {
        showToast(e.message, 'danger');
        const errEl = document.createElement('div');
        errEl.className = 'ai-chat-message system';
        errEl.style.color = 'var(--color-danger)';
        errEl.textContent = `Fehler: ${e.message}`;
        history.appendChild(errEl);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        history.scrollTop = history.scrollHeight;
    }
}

// Setup Hover Tooltip for Smart Keywords
function setupLoreTooltip() {
    let tooltipEl = document.getElementById('lore-hover-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'lore-hover-tooltip';
        tooltipEl.className = 'lore-tooltip';
        tooltipEl.style.position = 'fixed';
        tooltipEl.style.display = 'none';
        tooltipEl.style.zIndex = '9999';
        tooltipEl.style.pointerEvents = 'none';
        document.body.appendChild(tooltipEl);
    }

    // Event delegation
    document.addEventListener('mouseover', (e) => {
        const keyword = e.target.closest('.smart-keyword');
        if (keyword) {
            const loreId = keyword.getAttribute('data-lore-id');
            if (!state.loreList) return;
            const entry = state.loreList.find(item => item.id === loreId);
            if (entry) {
                // Populate tooltip
                tooltipEl.innerHTML = `
                    <div class="lore-tooltip-title">${escapeHtml(entry.name)}</div>
                    <div class="lore-tooltip-badge">${translateCategory(entry.category)}</div>
                    <div class="lore-tooltip-content">${escapeHtml(entry.short_description || t('no_description_available', 'Keine Kurzbeschreibung vorhanden.'))}</div>
                `;
                tooltipEl.style.display = 'block';

                // Position tooltip
                const rect = keyword.getBoundingClientRect();
                
                // Align to top center of the keyword
                let left = rect.left + (rect.width / 2) - (tooltipEl.offsetWidth / 2);
                let top = rect.top - tooltipEl.offsetHeight - 8;

                // Bounds check
                if (left < 10) left = 10;
                if (left + tooltipEl.offsetWidth > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipEl.offsetWidth - 10;
                }
                if (top < 10) {
                    // Place below if not enough space on top
                    top = rect.bottom + 8;
                }

                tooltipEl.style.left = `${left}px`;
                tooltipEl.style.top = `${top}px`;
                tooltipEl.style.opacity = '1';
            }
        }
    });

    document.addEventListener('mouseout', (e) => {
        const keyword = e.target.closest('.smart-keyword');
        if (keyword) {
            tooltipEl.style.display = 'none';
            tooltipEl.style.opacity = '0';
        }
    });
}

// ==========================================
// E. TIMELINE, STATS, SEARCH & ZEN MODE HELPERS
// ==========================================

// Zen Mode Toggle
function toggleZenMode() {
    state.zenModeActive = !state.zenModeActive;
    const zenBtn = document.getElementById('btn-editor-zen');
    if (!zenBtn) return;
    
    if (state.zenModeActive) {
        zenBtn.classList.add('active');
        zenBtn.style.color = 'var(--color-primary)';
        
        // Collapse left sidebar if not pinned
        if (!state.leftSidebarPinned) {
            document.querySelector('.app-container').classList.add('sidebar-collapsed');
        }
        
        // Collapse right sidebar if not pinned
        if (!state.rightSidebarPinned) {
            const workspace = document.querySelector('.editor-workspace');
            const sidePanel = document.getElementById('editor-lore-panel');
            if (sidePanel) {
                sidePanel.style.display = 'none';
                workspace.classList.remove('editor-layout-split');
            }
        }
    } else {
        zenBtn.classList.remove('active');
        zenBtn.style.color = '';
        
        // Restore left sidebar
        document.querySelector('.app-container').classList.remove('sidebar-collapsed');
        
        // Restore right sidebar
        const workspace = document.querySelector('.editor-workspace');
        const sidePanel = document.getElementById('editor-lore-panel');
        if (sidePanel && state.currentChapter) {
            sidePanel.style.display = 'flex';
            workspace.classList.add('editor-layout-split');
        }
    }
}

function toggleLeftSidebarPin() {
    state.leftSidebarPinned = !state.leftSidebarPinned;
    const pinBtn = document.getElementById('btn-pin-left-sidebar');
    if (!pinBtn) return;
    
    if (state.leftSidebarPinned) {
        pinBtn.classList.add('active');
        pinBtn.textContent = '📌';
        document.querySelector('.app-container').classList.remove('sidebar-collapsed');
    } else {
        pinBtn.classList.remove('active');
        pinBtn.textContent = '📍';
        if (state.zenModeActive) {
            document.querySelector('.app-container').classList.add('sidebar-collapsed');
        }
    }
}

function toggleRightSidebarPin() {
    state.rightSidebarPinned = !state.rightSidebarPinned;
    const pinBtn = document.getElementById('btn-pin-right-sidebar');
    if (!pinBtn) return;
    
    if (state.rightSidebarPinned) {
        pinBtn.classList.add('active');
        pinBtn.textContent = '📌';
        const workspace = document.querySelector('.editor-workspace');
        const sidePanel = document.getElementById('editor-lore-panel');
        if (sidePanel && sidePanel.style.display !== 'none') {
            workspace.classList.add('editor-layout-split');
        }
    } else {
        pinBtn.classList.remove('active');
        pinBtn.textContent = '📍';
        if (state.zenModeActive) {
            const workspace = document.querySelector('.editor-workspace');
            const sidePanel = document.getElementById('editor-lore-panel');
            if (sidePanel) {
                sidePanel.style.display = 'none';
                workspace.classList.remove('editor-layout-split');
            }
        }
    }
}

// Backup Functions
async function triggerManualBackup() {
    const backupDir = document.getElementById('setting-backup-dir').value.trim();
    if (!backupDir) {
        showToast(t('toast_enter_backup_dir', 'Bitte gib ein Backup-Verzeichnis an.'), 'warning');
        return;
    }
    
    const btn = document.getElementById('btn-trigger-manual-backup');
    btn.disabled = true;
    btn.textContent = t('backing_up_lbl', 'Sichere...');
    
    try {
        const response = await fetch(`${API_URL}/projects/backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backup_dir: backupDir })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Backup failed');
        }
        
        const data = await response.json();
        showToast(t('backup_success_toast', 'Sicherung erfolgreich erstellt: ') + data.filename, 'success');
    } catch (e) {
        showToast(t('error_backup_failed', 'Sicherung fehlgeschlagen: ') + e.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.textContent = t('settings_btn_manual_backup', 'Jetzt manuelles Backup erstellen');
    }
}

async function performAutoBackup() {
    if (!state.backupEnabled || !state.backupDir) return;
    try {
        const response = await fetch(`${API_URL}/projects/backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backup_dir: state.backupDir })
        });
        if (response.ok) {
            console.log("Auto-backup successfully triggered in background.");
        }
    } catch (e) {
        console.error("Auto-backup failed", e);
    }
}

function extractTimepointsFromText(text) {
    if (!text) return [];
    
    const events = [];
    const regexes = [
        /(?:im Jahr(?:e)?|anno|seit|im|in der Epoche|um)\s+(\d{3,4})(?:\s*(?:n\.\s*Chr\.|v\.\s*Chr\.|n\.Chr\.|v\.Chr\.|BC|AD))?/gi,
        /(\d{3,4})\s*(?:n\.\s*Chr\.|v\.\s*Chr\.|n\.Chr\.|v\.Chr\.)/gi,
        /(?:geboren|starb|gegründet|errichtet|zerstört)\s+(\d{3,4})/gi,
        /(?:^|\s)(\d{4})(?:\s|$|\.|\,)/g
    ];
    
    const lines = text.split(/[.\n]/);
    const seenYears = new Set();
    
    lines.forEach(line => {
        for (const regex of regexes) {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(line)) !== null) {
                const year = match[1];
                if (year && !seenYears.has(year)) {
                    const yearNum = parseInt(year);
                    if (yearNum >= 1 && yearNum <= 3000) {
                        seenYears.add(year);
                        let eventTitle = line.trim();
                        if (eventTitle.length > 80) {
                            eventTitle = eventTitle.substring(0, 77) + "...";
                        }
                        events.push({
                            date: year,
                            title: eventTitle || `Ereignis im Jahr ${year}`,
                            desc: line.trim()
                        });
                    }
                }
            }
        }
    });
    
    return events;
}

function showTimelineSuggestionsModal(suggestions) {
    const listContainer = document.getElementById('timeline-suggestions-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    suggestions.forEach((sug, idx) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'flex-start';
        item.style.gap = '10px';
        item.style.padding = '8px';
        item.style.backgroundColor = 'var(--bg-surface)';
        item.style.border = '1px solid var(--border-color)';
        item.style.borderRadius = '6px';
        item.style.marginBottom = '8px';
        
        const contextText = sug.lore_name ? `<div style="font-size: 11px; color: var(--color-primary); margin-bottom: 2px;">📖 Gefunden in: ${escapeHtml(sug.lore_name)}</div>` : '';
        
        item.innerHTML = `
            <input type="checkbox" class="timeline-sug-chk" value="${idx}" checked style="margin-top: 4px; width: auto;">
            <div style="flex-grow: 1;">
                ${contextText}
                <div style="font-size: 13px; font-weight: bold; color: var(--text-base);">
                    <input type="text" class="timeline-sug-date" value="${sug.date}" style="width: 60px; display: inline-block; padding: 2px 4px; font-size: 12px; margin-right: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-surface); color: var(--text-base);"> - 
                    <input type="text" class="timeline-sug-title" value="${escapeHtml(sug.title)}" style="width: 250px; display: inline-block; padding: 2px 4px; font-size: 12px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-surface); color: var(--text-base);">
                </div>
                <textarea class="timeline-sug-desc" style="width: 100%; font-size: 12px; margin-top: 4px; padding: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-surface); color: var(--text-muted); resize: vertical;" rows="2">${escapeHtml(sug.desc)}</textarea>
                <input type="hidden" class="timeline-sug-lore-id" value="${sug.lore_id || ''}">
            </div>
        `;
        listContainer.appendChild(item);
    });
    
    const submitBtn = document.getElementById('btn-submit-timeline-suggestions');
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    
    newSubmitBtn.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.timeline-sug-chk');
        let newEventsAdded = false;
        
        if (!state.timelineEvents || state.timelineEvents.length === 0) {
            try {
                const timelineRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`);
                if (timelineRes.ok) {
                    state.timelineEvents = await timelineRes.json();
                }
            } catch(e) {
                state.timelineEvents = [];
            }
        }
        
        checkboxes.forEach((chk) => {
            if (chk.checked) {
                const parent = chk.parentNode;
                const dateVal = parent.querySelector('.timeline-sug-date').value.trim();
                const titleVal = parent.querySelector('.timeline-sug-title').value.trim();
                const descVal = parent.querySelector('.timeline-sug-desc').value.trim();
                const loreIdVal = parent.querySelector('.timeline-sug-lore-id').value;
                
                if (dateVal && titleVal) {
                    const evtId = 'evt_' + Math.random().toString(36).substr(2, 9);
                    state.timelineEvents.push({
                        id: evtId,
                        date: dateVal,
                        title: titleVal,
                        desc: descVal,
                        lore_id: loreIdVal || null
                    });
                    newEventsAdded = true;
                }
            }
        });
        
        if (newEventsAdded) {
            try {
                const saveRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(state.timelineEvents)
                });
                if (saveRes.ok) {
                    showToast("Ereignisse erfolgreich zur Zeitleiste hinzugefügt!", "success");
                    if (state.currentView === 'timeline') {
                        loadTimelineData();
                    }
                }
            } catch(e) {
                showToast("Fehler beim Speichern der Zeitleiste: " + e.message, "danger");
            }
        }
        closeModal('modal-timeline-suggestions');
    });
    
    openModal('modal-timeline-suggestions');
}

// Timeline Management
async function loadTimelineData() {
    if (!state.currentProject) return;
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`);
        if (!response.ok) throw new Error("Could not load timeline");
        state.timelineEvents = await response.json();
        renderTimeline();
    } catch (e) {
        showToast("Fehler beim Laden der Zeitleiste: " + e.message, 'danger');
    }
}

function openTimelineEventForm(eventId = null) {
    const form = document.getElementById('timeline-form-container');
    form.style.display = 'flex';
    
    // Populate lore select dropdown
    const select = document.getElementById('timeline-event-lore');
    select.innerHTML = `<option value="">-- Keine Verknüpfung --</option>`;
    state.loreList.forEach(entry => {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = `${entry.name} (${translateCategory(entry.category)})`;
        select.appendChild(opt);
    });

    if (eventId) {
        const ev = state.timelineEvents.find(e => e.id === eventId);
        if (ev) {
            document.getElementById('timeline-event-id').value = ev.id;
            document.getElementById('timeline-event-title').value = ev.title;
            document.getElementById('timeline-event-date').value = ev.date;
            document.getElementById('timeline-event-desc').value = ev.desc || '';
            document.getElementById('timeline-event-lore').value = ev.lore_id || '';
        }
    } else {
        document.getElementById('timeline-event-id').value = '';
        document.getElementById('timeline-event-title').value = '';
        document.getElementById('timeline-event-date').value = '';
        document.getElementById('timeline-event-desc').value = '';
        document.getElementById('timeline-event-lore').value = '';
    }
}

function closeTimelineEventForm() {
    document.getElementById('timeline-form-container').style.display = 'none';
}

async function saveTimelineEvent() {
    if (!state.currentProject) return;
    const title = document.getElementById('timeline-event-title').value.trim();
    const date = document.getElementById('timeline-event-date').value.trim();
    const desc = document.getElementById('timeline-event-desc').value.trim();
    const lore_id = document.getElementById('timeline-event-lore').value;
    
    if (!title || !date) {
        showToast("Titel und Datum/Epoche sind erforderlich.", 'warning');
        return;
    }
    
    const id = document.getElementById('timeline-event-id').value || 'evt_' + Math.random().toString(36).substr(2, 9);
    
    const newEvent = { id, title, date, desc, lore_id };
    const existingIdx = state.timelineEvents.findIndex(e => e.id === id);
    
    if (existingIdx !== -1) {
        state.timelineEvents[existingIdx] = newEvent;
    } else {
        state.timelineEvents.push(newEvent);
    }
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.timelineEvents)
        });
        
        if (!response.ok) throw new Error("Failed to save timeline event");
        
        showToast("Ereignis gespeichert", "success");
        closeTimelineEventForm();
        renderTimeline();
    } catch (e) {
        showToast("Fehler beim Speichern des Ereignisses: " + e.message, "danger");
    }
}

async function deleteTimelineEvent(eventId) {
    if (!state.currentProject) return;
    showConfirm(
        "Ereignis löschen",
        "Möchtest du dieses Ereignis wirklich aus der Zeitleiste entfernen?",
        async () => {
            state.timelineEvents = state.timelineEvents.filter(e => e.id !== eventId);
            try {
                const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(state.timelineEvents)
                });
                if (!response.ok) throw new Error();
                showToast("Ereignis gelöscht", "success");
                renderTimeline();
            } catch(e) {
                showToast("Löschen fehlgeschlagen", "danger");
            }
        }
    );
}

function renderTimeline() {
    const list = document.getElementById('timeline-events-list');
    const flow = document.getElementById('timeline-visual-flow');
    list.innerHTML = '';
    flow.innerHTML = '';
    
    if (state.timelineEvents.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px;">Keine Ereignisse vorhanden.</div>`;
        flow.innerHTML = `<div style="color: var(--text-muted); font-style: italic;">Die Zeitleiste ist noch leer. Füge links Ereignisse hinzu!</div>`;
        return;
    }
    
    state.timelineEvents.forEach(ev => {
        // Sidebar list item
        const item = document.createElement('div');
        item.className = 'list-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '8px 12px';
        item.innerHTML = `
            <div style="font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${escapeHtml(ev.title)}</div>
            <div style="display: flex; gap: 4px;">
                <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px;" onclick="openTimelineEventForm('${ev.id}')">✏️</button>
                <button class="btn btn-secondary btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="deleteTimelineEvent('${ev.id}')">🗑️</button>
            </div>
        `;
        list.appendChild(item);
        
        // Visual flow card
        const card = document.createElement('div');
        card.className = 'timeline-card';
        
        let loreLinkHtml = '';
        if (ev.lore_id) {
            const entry = state.loreList.find(l => l.id === ev.lore_id);
            if (entry) {
                loreLinkHtml = `<div class="timeline-event-lore-link" onclick="showLoreQuickviewById('${entry.id}')">📖 Verknüpft: ${escapeHtml(entry.name)}</div>`;
            }
        }
        
        card.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-event-header">
                <div class="timeline-event-title">${escapeHtml(ev.title)}</div>
                <div class="timeline-event-date">${escapeHtml(ev.date)}</div>
            </div>
            <div class="timeline-event-desc">${escapeHtml(ev.desc || 'Keine Beschreibung vorhanden.')}</div>
            ${loreLinkHtml}
        `;
        flow.appendChild(card);
    });
}

// Global Search
function loadSearchData() {
    document.getElementById('global-search-input').value = '';
    document.getElementById('global-search-results').innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 32px;">
            Gib oben einen Suchbegriff ein und klicke auf Suchen.
        </div>
    `;
}

async function performGlobalSearch() {
    if (!state.currentProject) return;
    const searchTerm = document.getElementById('global-search-input').value.trim().toLowerCase();
    if (!searchTerm) {
        showToast("Bitte gib einen Suchbegriff ein.", "warning");
        return;
    }
    
    const resultsContainer = document.getElementById('global-search-results');
    resultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;">Suche läuft...</div>`;
    
    try {
        const promises = state.currentProject.chapters.map(async (ch) => {
            let url = `${API_URL}/projects/${state.currentProject.id}/chapters/${ch.id}`;
            if (state.activeLanguage !== 'original') {
                url = `${API_URL}/projects/${state.currentProject.id}/languages/${state.activeLanguage}/chapters/${ch.id}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                return { chapter: ch, content: data.content || '' };
            }
            return { chapter: ch, content: '' };
        });
        
        const loadedChapters = await Promise.all(promises);
        
        let html = '';
        let matchesCount = 0;
        
        // Search in chapters
        loadedChapters.forEach(({ chapter, content }) => {
            const idx = content.toLowerCase().indexOf(searchTerm);
            if (idx !== -1) {
                matchesCount++;
                const start = Math.max(0, idx - 40);
                const end = Math.min(content.length, idx + searchTerm.length + 40);
                const snippet = content.slice(start, end).replace(/\n/g, ' ');
                
                html += `
                    <div class="list-item" style="display: flex; flex-direction: column; gap: 8px; padding: 16px; align-items: flex-start;">
                        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                            <strong style="color: var(--color-primary);">${escapeHtml(chapter.title)}</strong>
                            <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="navigateTo('editor', { projectId: '${state.currentProject.id}', chapterId: '${chapter.id}' })">📖 Öffnen</button>
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); font-style: italic; background-color: var(--bg-base); padding: 8px; border-radius: 6px; width: 100%; border: 1px solid var(--border-color);">
                            ...${escapeHtml(snippet)}...
                        </div>
                    </div>
                `;
            }
        });
        
        // Search in lore
        state.loreList.forEach(entry => {
            const inName = entry.name.toLowerCase().includes(searchTerm);
            const inDesc = (entry.description || '').toLowerCase().includes(searchTerm);
            const inShort = (entry.short_description || '').toLowerCase().includes(searchTerm);
            
            if (inName || inDesc || inShort) {
                matchesCount++;
                const snippet = entry.short_description || entry.description || '';
                html += `
                    <div class="list-item" style="display: flex; flex-direction: column; gap: 8px; padding: 16px; align-items: flex-start;">
                        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                            <div>
                                <strong style="color: var(--color-primary);">${escapeHtml(entry.name)}</strong>
                                <span style="font-size: 10px; background-color: var(--color-primary-light); color: var(--color-primary); padding: 1px 4px; border-radius: 4px; margin-left: 8px; text-transform: uppercase;">${translateCategory(entry.category)}</span>
                             </div>
                             <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="navigateTo('lore'); setTimeout(() => showLoreDetail('${entry.id}'), 100)">📖 Wiki öffnen</button>
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); font-style: italic; background-color: var(--bg-base); padding: 8px; border-radius: 6px; width: 100%; border: 1px solid var(--border-color);">
                             ${escapeHtml(snippet.slice(0, 100))}...
                        </div>
                    </div>
                `;
            }
        });
        
        if (matchesCount === 0) {
            resultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;">Keine Treffer für "${escapeHtml(searchTerm)}" gefunden.</div>`;
        } else {
            resultsContainer.innerHTML = html;
        }
        
    } catch(e) {
        showToast("Suche fehlgeschlagen: " + e.message, 'danger');
    }
}

// Stats & Visualizations
function loadStatsData() {
    if (!state.currentProject) return;
    
    let totalWords = 0;
    state.currentProject.chapters.forEach(c => totalWords += c.word_count);
    
    const chaptersCount = state.currentProject.chapters.length;
    const avgWords = chaptersCount > 0 ? Math.round(totalWords / chaptersCount) : 0;
    
    // Fill text values
    document.getElementById('stats-total-words-val').textContent = totalWords.toLocaleString();
    
    const goal = state.currentProject.word_count_goal || 50000;
    const totalPercentage = Math.min(100, Math.round((totalWords / goal) * 100));
    document.getElementById('stats-total-progress-lbl').textContent = `Ziel: ${goal.toLocaleString()} (${totalPercentage}%)`;
    
    document.getElementById('stats-chapters-count-val').textContent = chaptersCount;
    document.getElementById('stats-avg-words-lbl').textContent = `Ø ${avgWords.toLocaleString()} Wörter pro Kapitel`;
    
    const dailyProgress = state.sessionWords || 0;
    document.getElementById('stats-daily-words-val').textContent = dailyProgress.toLocaleString();
    const dailyGoal = state.currentProject.daily_word_count_goal || 500;
    const dailyPercentage = Math.min(100, Math.round((dailyProgress / dailyGoal) * 100));
    document.getElementById('stats-daily-progress-lbl').textContent = `Tägliches Ziel: ${dailyGoal.toLocaleString()} (${dailyPercentage}%)`;
    
    // NaNoWriMo Planer Card Calculations
    const deadlineStr = state.currentProject.deadline_date;
    const badge = document.getElementById('nanowrimo-active-badge');
    const configHint = document.getElementById('nanowrimo-config-hint');
    const statsContent = document.getElementById('nanowrimo-stats-content');
    
    if (deadlineStr) {
        const deadline = new Date(deadlineStr);
        const today = new Date();
        today.setHours(0,0,0,0);
        deadline.setHours(0,0,0,0);
        
        const diffTime = deadline.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0) {
            badge.style.display = 'inline-block';
            badge.textContent = "Aktiv";
            badge.style.backgroundColor = 'var(--color-success-light)';
            badge.style.color = 'var(--color-success)';
            configHint.style.display = 'none';
            statsContent.style.display = 'grid';
            
            document.getElementById('nanowrimo-days-left').textContent = diffDays;
            
            const remainingWords = Math.max(0, goal - totalWords);
            const requiredDaily = diffDays > 0 ? Math.ceil(remainingWords / diffDays) : remainingWords;
            document.getElementById('nanowrimo-required-daily').textContent = requiredDaily.toLocaleString() + " Wörter";
            
            const progressPercent = Math.min(100, Math.round((totalWords / goal) * 100));
            document.getElementById('nanowrimo-progress-percent').textContent = progressPercent + "%";
            
            document.getElementById('nanowrimo-progress-bar-lbl').textContent = `${totalWords.toLocaleString()} / ${goal.toLocaleString()} Wörter`;
            document.getElementById('nanowrimo-progress-bar-fill').style.width = progressPercent + "%";
        } else {
            badge.style.display = 'inline-block';
            badge.textContent = "Beendet";
            badge.style.backgroundColor = 'var(--color-primary-light)';
            badge.style.color = 'var(--color-primary)';
            configHint.style.display = 'none';
            statsContent.style.display = 'grid';
            
            document.getElementById('nanowrimo-days-left').textContent = "Abgelaufen";
            document.getElementById('nanowrimo-required-daily').textContent = "-";
            
            const progressPercent = Math.min(100, Math.round((totalWords / goal) * 100));
            document.getElementById('nanowrimo-progress-percent').textContent = progressPercent + "%";
            document.getElementById('nanowrimo-progress-bar-lbl').textContent = `${totalWords.toLocaleString()} / ${goal.toLocaleString()} Wörter`;
            document.getElementById('nanowrimo-progress-bar-fill').style.width = progressPercent + "%";
        }
    } else {
        if (badge) badge.style.display = 'none';
        if (configHint) configHint.style.display = 'block';
        if (statsContent) statsContent.style.display = 'none';
    }
    
    // Draw Bar Chart
    renderStatsCharts();
}

function renderStatsCharts() {
    const container = document.getElementById('stats-chart-container');
    container.innerHTML = '';
    
    const chapters = state.currentProject.chapters;
    if (chapters.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); font-style: italic; width: 100%; text-align: center;">Keine Kapiteldaten vorhanden.</div>`;
        return;
    }
    
    const maxWords = Math.max(...chapters.map(c => c.word_count), 1);
    
    chapters.forEach(ch => {
        const wrapper = document.createElement('div');
        wrapper.className = 'stats-chart-bar-wrapper';
        
        const pct = Math.max(5, Math.round((ch.word_count / maxWords) * 100));
        
        wrapper.innerHTML = `
            <div class="stats-chart-bar" style="height: ${pct}%;">
                <div class="stats-chart-bar-tooltip">${ch.title}: ${ch.word_count.toLocaleString()} Wörter</div>
            </div>
            <div class="stats-chart-bar-label">${escapeHtml(ch.title)}</div>
        `;
        container.appendChild(wrapper);
    });
}

// Expose functions globally for dynamic elements (onclicks)
window.openTimelineEventForm = openTimelineEventForm;
window.deleteTimelineEvent = deleteTimelineEvent;
window.showLoreQuickviewById = showLoreQuickviewById;

// ==========================================
// F. CHARACTER RELATIONSHIPS NETWORK HELPERS
// ==========================================

async function loadRelationshipsData() {
    if (!state.currentProject) return;
    
    const char1Select = document.getElementById('rel-char-1');
    const char2Select = document.getElementById('rel-char-2');
    if (!char1Select || !char2Select) return;
    
    char1Select.innerHTML = '';
    char2Select.innerHTML = '';
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    
    if (characters.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "-- Keine Charaktere im Lore-Wiki --";
        char1Select.appendChild(opt.cloneNode(true));
        char2Select.appendChild(opt);
    } else {
        characters.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            char1Select.appendChild(opt.cloneNode(true));
            char2Select.appendChild(opt);
        });
    }
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/relationships`);
        if (!response.ok) throw new Error("Could not load relationships");
        state.relationships = await response.json();
        
        if (!state.relationships.nodes) state.relationships.nodes = {};
        if (!state.relationships.links) state.relationships.links = [];
        
        let hasChanges = false;
        const radius = 180;
        const centerX = 350;
        const centerY = 250;
        
        characters.forEach((c, idx) => {
            if (!state.relationships.nodes[c.id]) {
                const angle = idx * (2 * Math.PI / Math.max(1, characters.length));
                state.relationships.nodes[c.id] = {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
                hasChanges = true;
            }
        });
        
        for (const nodeId in state.relationships.nodes) {
            if (!characters.some(c => c.id === nodeId)) {
                delete state.relationships.nodes[nodeId];
                hasChanges = true;
            }
        }
        
        if (hasChanges) {
            await saveRelationshipsLayout(true);
        }
        
        setupRelationshipsCanvasEvents();
        drawRelationships();
        refreshRelationshipsConnectionsList();
        
    } catch(e) {
        showToast("Fehler beim Laden des Beziehungsnetzwerkes: " + e.message, 'danger');
    }
}

function setupRelationshipsCanvasEvents() {
    const canvas = document.getElementById('relationships-canvas');
    if (!canvas) return;
    
    // Auto resize canvas width/height to matches clientWidth/clientHeight (prevents oval/egg-shaped stretching)
    canvas.width = canvas.clientWidth || 700;
    canvas.height = canvas.clientHeight || 500;
    
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    
    newCanvas.addEventListener('mousedown', handleRelationshipMouseDown);
    newCanvas.addEventListener('mousemove', handleRelationshipMouseMove);
    newCanvas.addEventListener('mouseup', handleRelationshipMouseUp);
    newCanvas.addEventListener('mouseleave', handleRelationshipMouseUp);
    newCanvas.addEventListener('dblclick', handleRelationshipDoubleClick);
    newCanvas.addEventListener('wheel', handleRelationshipWheel, { passive: false });
}

function handleRelationshipWheel(e) {
    e.preventDefault();
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(wheel * zoomIntensity);
    
    const newZoom = Math.min(Math.max(state.relationshipZoom * zoomFactor, 0.2), 4.0);
    
    // Adjust panning to zoom into the mouse pointer context
    state.relationshipPan.x = mouseX - (mouseX - state.relationshipPan.x) * (newZoom / state.relationshipZoom);
    state.relationshipPan.y = mouseY - (mouseY - state.relationshipPan.y) * (newZoom / state.relationshipZoom);
    state.relationshipZoom = newZoom;
    
    drawRelationships();
}

function handleRelationshipMouseDown(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
    const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    const nodeRadius = 45;
    
    let hitNodeId = null;
    for (let i = characters.length - 1; i >= 0; i--) {
        const c = characters[i];
        const coord = state.relationships.nodes[c.id];
        if (coord) {
            const dist = Math.hypot(worldX - coord.x, worldY - coord.y);
            if (dist <= nodeRadius) {
                hitNodeId = c.id;
                state.relationshipDragOffset = { x: worldX - coord.x, y: worldY - coord.y };
                break;
            }
        }
    }
    
    if (hitNodeId) {
        state.relationshipDragNode = hitNodeId;
        canvas.style.cursor = 'grabbing';
    } else {
        // Start background panning
        state.relationshipPanning = true;
        state.relationshipPanStart = { x: e.clientX - state.relationshipPan.x, y: e.clientY - state.relationshipPan.y };
        canvas.style.cursor = 'move';
    }
}

function handleRelationshipMouseMove(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (state.relationshipDragNode) {
        // Convert screen coordinates to world coordinates
        const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
        const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
        
        // Drag node inside boundary
        state.relationships.nodes[state.relationshipDragNode] = { 
            x: worldX - state.relationshipDragOffset.x, 
            y: worldY - state.relationshipDragOffset.y 
        };
        drawRelationships();
    } else if (state.relationshipPanning) {
        // Drag background camera
        state.relationshipPan = { 
            x: e.clientX - state.relationshipPanStart.x, 
            y: e.clientY - state.relationshipPanStart.y 
        };
        drawRelationships();
    } else {
        // Hover pointer cursor check
        const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
        const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
        const characters = state.loreList.filter(entry => entry.category === 'character');
        const nodeRadius = 45;
        let hover = false;
        for (const c of characters) {
            const coord = state.relationships.nodes[c.id];
            if (coord && Math.hypot(worldX - coord.x, worldY - coord.y) <= nodeRadius) {
                hover = true;
                break;
            }
        }
        canvas.style.cursor = hover ? 'pointer' : 'grab';
    }
}

function handleRelationshipMouseUp(e) {
    const canvas = e.target;
    if (state.relationshipDragNode) {
        state.relationshipDragNode = null;
        canvas.style.cursor = 'grab';
        saveRelationshipsLayout(true);
    }
    if (state.relationshipPanning) {
        state.relationshipPanning = false;
        canvas.style.cursor = 'grab';
    }
}

function handleRelationshipDoubleClick(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
    const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    const nodeRadius = 45;
    
    let hitNodeId = null;
    for (const c of characters) {
        const coord = state.relationships.nodes[c.id];
        if (coord) {
            const dist = Math.hypot(worldX - coord.x, worldY - coord.y);
            if (dist <= nodeRadius) {
                hitNodeId = c.id;
                break;
            }
        }
    }
    
    if (hitNodeId) {
        navigateTo('lore');
        setTimeout(() => showLoreDetail(hitNodeId), 150);
    } else {
        // Reset zoom and pan on background double click
        state.relationshipPan = { x: 0, y: 0 };
        state.relationshipZoom = 1.0;
        drawRelationships();
    }
}

function drawRelationships() {
    const canvas = document.getElementById('relationships-canvas');
    if (!canvas) return;
    
    // Auto resize canvas width/height to matches clientWidth/clientHeight (prevents oval/egg-shaped stretching)
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth || 700;
        canvas.height = canvas.clientHeight || 500;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save, translate & scale context for pan & zoom support
    ctx.save();
    ctx.translate(state.relationshipPan.x, state.relationshipPan.y);
    ctx.scale(state.relationshipZoom, state.relationshipZoom);
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    
    // 1. Draw Links
    state.relationships.links.forEach(link => {
        const n1 = state.relationships.nodes[link.source];
        const n2 = state.relationships.nodes[link.target];
        
        if (n1 && n2) {
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#64748b';
            ctx.stroke();
            
            if (link.dir === 'uni') {
                const angle = Math.atan2(n2.y - n1.y, n2.x - n1.x);
                const arrowLength = 12;
                const arrowX = n2.x - 46 * Math.cos(angle);
                const arrowY = n2.y - 46 * Math.sin(angle);
                
                ctx.beginPath();
                ctx.moveTo(arrowX, arrowY);
                ctx.lineTo(arrowX - arrowLength * Math.cos(angle - Math.PI/6), arrowY - arrowLength * Math.sin(angle - Math.PI/6));
                ctx.lineTo(arrowX - arrowLength * Math.cos(angle + Math.PI/6), arrowY - arrowLength * Math.sin(angle + Math.PI/6));
                ctx.closePath();
                ctx.fillStyle = '#64748b';
                ctx.fill();
            }
            
            const midX = (n1.x + n2.x) / 2;
            const midY = (n1.y + n2.y) / 2;
            
            ctx.font = '11px Outfit, Inter, sans-serif';
            const textWidth = ctx.measureText(link.label).width;
            
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(midX - textWidth/2 - 6, midY - 9, textWidth + 12, 18);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.strokeRect(midX - textWidth/2 - 6, midY - 9, textWidth + 12, 18);
            
            ctx.fillStyle = '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(link.label, midX, midY);
        }
    });
    
    // 2. Draw Nodes
    characters.forEach(c => {
        const coord = state.relationships.nodes[c.id];
        if (coord) {
            const nodeRadius = 45;
            
            ctx.beginPath();
            ctx.arc(coord.x, coord.y, nodeRadius, 0, 2 * Math.PI);
            
            const gradient = ctx.createRadialGradient(coord.x, coord.y, 5, coord.x, coord.y, nodeRadius);
            gradient.addColorStop(0, '#f97316');
            gradient.addColorStop(1, '#ea580c');
            
            ctx.fillStyle = gradient;
            ctx.fill();
            
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Outfit, Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let displayName = c.name;
            if (ctx.measureText(displayName).width > 76) {
                displayName = c.name.split(' ')[0];
                if (ctx.measureText(displayName).width > 76) {
                    displayName = displayName.substring(0, 8) + '...';
                }
            }
            ctx.fillText(displayName, coord.x, coord.y);
        }
    });
    
    // Restore transformation context state
    ctx.restore();
}

async function addRelationshipLink() {
    if (!state.currentProject) return;
    const char1 = document.getElementById('rel-char-1').value;
    const char2 = document.getElementById('rel-char-2').value;
    const typeLabel = document.getElementById('rel-type').value.trim();
    const isBidi = document.getElementById('rel-bidirectional').checked;
    
    if (!char1 || !char2 || !typeLabel) {
        showToast("Bitte wähle beide Charaktere aus und trage einen Beziehungstyp ein.", 'warning');
        return;
    }
    
    if (char1 === char2) {
        showToast("Ein Charakter kann keine Beziehung mit sich selbst haben.", 'warning');
        return;
    }
    
    const linkId = 'link_' + Math.random().toString(36).substr(2, 9);
    const newLink = {
        id: linkId,
        source: char1,
        target: char2,
        label: typeLabel,
        dir: isBidi ? 'bi' : 'uni'
    };
    
    state.relationships.links.push(newLink);
    
    await saveRelationshipsLayout();
    document.getElementById('rel-type').value = '';
    drawRelationships();
    refreshRelationshipsConnectionsList();
}

async function deleteRelationshipLink(linkId) {
    state.relationships.links = state.relationships.links.filter(l => l.id !== linkId);
    await saveRelationshipsLayout();
    drawRelationships();
    refreshRelationshipsConnectionsList();
}

async function saveRelationshipsLayout(silent = false) {
    if (!state.currentProject) return;
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/relationships`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.relationships)
        });
        
        if (!response.ok) throw new Error();
        if (!silent) {
            showToast("Beziehungsnetzwerk-Layout erfolgreich gespeichert!", 'success');
        }
    } catch(e) {
        if (!silent) {
            showToast("Fehler beim Speichern des Layouts", 'danger');
        }
    }
}

async function resetRelationshipsLayout() {
    if (!state.currentProject) return;
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    if (characters.length === 0) return;
    
    showConfirm(
        "Layout zurücksetzen",
        "Möchtest du die Anordnung aller Charaktere wirklich zurücksetzen? (Sie werden kreisförmig angeordnet)",
        async () => {
            const radius = 180;
            const centerX = 350;
            const centerY = 250;
            
            characters.forEach((c, idx) => {
                const angle = idx * (2 * Math.PI / characters.length);
                state.relationships.nodes[c.id] = {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
            });
            
            await saveRelationshipsLayout();
            drawRelationships();
        }
    );
}

function refreshRelationshipsConnectionsList() {
    const list = document.getElementById('relationships-connections-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (state.relationships.links.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px;">Keine aktiven Verbindungen.</div>`;
        return;
    }
    
    state.relationships.links.forEach(link => {
        const c1 = state.loreList.find(l => l.id === link.source);
        const c2 = state.loreList.find(l => l.id === link.target);
        
        if (c1 && c2) {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '8px 12px';
            
            const dirSymbol = link.dir === 'bi' ? '&harr;' : '&rarr;';
            item.innerHTML = `
                <div style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;">
                    <strong>${escapeHtml(c1.name)}</strong> <span style="color: var(--color-primary);">${dirSymbol}</span> <strong>${escapeHtml(c2.name)}</strong>
                    <br><span style="color: var(--text-muted); font-style: italic; font-size: 11px;">(${escapeHtml(link.label)})</span>
                </div>
                <button class="btn btn-secondary btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="deleteRelationshipLink('${link.id}')">🗑️</button>
            `;
            list.appendChild(item);
        }
    });
}

// Expose relationship helper window bindings
window.deleteRelationshipLink = deleteRelationshipLink;

// ==========================================
// G. DYNAMIC EXTENSIONS & FEATURE SET v0.2.0.0
// ==========================================

let physicsInterval = null;

function applyPhysicsLayout() {
    if (!state.relationships || !state.relationships.nodes) return;
    
    if (physicsInterval) {
        clearInterval(physicsInterval);
        physicsInterval = null;
    }
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    if (characters.length === 0) return;
    
    const nodes = characters.map(c => {
        const pos = state.relationships.nodes[c.id] || { x: 350, y: 250 };
        return {
            id: c.id,
            x: pos.x,
            y: pos.y,
            vx: 0,
            vy: 0
        };
    });
    
    const links = state.relationships.links.map(link => {
        return {
            source: link.source,
            target: link.target
        };
    });
    
    const width = 700;
    const height = 500;
    const padding = 50;
    
    const kRepulsion = 8000;
    const kSpring = 0.04;
    const desiredD = 120;
    const damping = 0.85;
    
    let ticks = 0;
    
    physicsInterval = setInterval(() => {
        ticks++;
        if (ticks > 150) {
            clearInterval(physicsInterval);
            physicsInterval = null;
            saveRelationshipsLayout(true);
            return;
        }
        
        for (let i = 0; i < nodes.length; i++) {
            const n1 = nodes[i];
            for (let j = i + 1; j < nodes.length; j++) {
                const n2 = nodes[j];
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const distSq = dx * dx + dy * dy + 1;
                const dist = Math.sqrt(distSq);
                
                const force = kRepulsion / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                n1.vx -= fx;
                n1.vy -= fy;
                n2.vx += fx;
                n2.vy += fy;
            }
        }
        
        links.forEach(link => {
            const n1 = nodes.find(n => n.id === link.source);
            const n2 = nodes.find(n => n.id === link.target);
            if (n1 && n2) {
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dist = Math.hypot(dx, dy) || 1;
                
                const force = (dist - desiredD) * kSpring;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                n1.vx += fx;
                n1.vy += fy;
                n2.vx -= fx;
                n2.vy -= fy;
            }
        });
        
        nodes.forEach(n => {
            const dx = 350 - n.x;
            const dy = 250 - n.y;
            n.vx += dx * 0.005;
            n.vy += dy * 0.005;
        });
        
        nodes.forEach(n => {
            n.x += n.vx;
            n.y += n.vy;
            
            n.vx *= damping;
            n.vy *= damping;
            
            n.x = Math.max(padding, Math.min(width - padding, n.x));
            n.y = Math.max(padding, Math.min(height - padding, n.y));
            
            state.relationships.nodes[n.id] = { x: n.x, y: n.y };
        });
        
        drawRelationships();
    }, 20);
}

function applyHierarchicalLayout() {
    if (!state.relationships || !state.relationships.nodes) return;
    
    if (physicsInterval) {
        clearInterval(physicsInterval);
        physicsInterval = null;
    }
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    if (characters.length === 0) return;
    
    const nodes = characters.map(c => c.id);
    const links = state.relationships.links;
    
    const adj = {};
    const inDegree = {};
    nodes.forEach(id => {
        adj[id] = [];
        inDegree[id] = 0;
    });
    
    links.forEach(link => {
        if (adj[link.source] && adj[link.target] !== undefined) {
            adj[link.source].push(link.target);
            inDegree[link.target]++;
        }
    });
    
    const levels = {};
    const queue = [];
    const visited = new Set();
    
    const startNodes = nodes.filter(id => inDegree[id] === 0);
    if (startNodes.length > 0) {
        startNodes.forEach(id => {
            levels[id] = 0;
            queue.push(id);
            visited.add(id);
        });
    } else {
        const fallback = nodes[0];
        levels[fallback] = 0;
        queue.push(fallback);
        visited.add(fallback);
    }
    
    while (queue.length > 0) {
        const curr = queue.shift();
        const currLevel = levels[curr];
        
        adj[curr].forEach(neighbor => {
            if (!visited.has(neighbor)) {
                levels[neighbor] = currLevel + 1;
                queue.push(neighbor);
                visited.add(neighbor);
            }
        });
    }
    
    nodes.forEach(id => {
        if (!visited.has(id)) {
            levels[id] = 0;
            const subQueue = [id];
            visited.add(id);
            while (subQueue.length > 0) {
                const curr = subQueue.shift();
                const currLevel = levels[curr];
                adj[curr].forEach(neighbor => {
                    if (!visited.has(neighbor)) {
                        levels[neighbor] = currLevel + 1;
                        subQueue.push(neighbor);
                        visited.add(neighbor);
                    }
                });
            }
        }
    });
    
    const groups = {};
    nodes.forEach(id => {
        const lvl = levels[id] || 0;
        if (!groups[lvl]) groups[lvl] = [];
        groups[lvl].push(id);
    });
    
    const levelsList = Object.keys(groups).map(Number).sort((a, b) => a - b);
    const maxLvl = levelsList.length - 1;
    
    const canvasWidth = 700;
    const canvasHeight = 500;
    
    levelsList.forEach((lvl, lvlIdx) => {
        const lvlNodes = groups[lvl];
        const y = lvlIdx * (canvasHeight / (maxLvl + 2)) + (canvasHeight / (maxLvl + 2));
        
        lvlNodes.forEach((nodeId, nodeIdx) => {
            const x = (nodeIdx + 1) * (canvasWidth / (lvlNodes.length + 1));
            state.relationships.nodes[nodeId] = { x, y };
        });
    });
    
    drawRelationships();
    saveRelationshipsLayout(true);
}

const FILLER_WORDS = new Set([
    'eigentlich', 'wohl', 'halt', 'gewissermaßen', 'nämlich', 'sozusagen', 
    'eh', 'ja', 'doch', 'mal', 'schon', 'eben', 'gerade', 'einfach', 
    'irgendwie', 'quasi', 'praktisch', 'überhaupt'
]);

function runStyleCheck() {
    if (!state.editor) return;
    
    const text = state.editor.getMarkdown();
    const resultsContainer = document.getElementById('style-check-results');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    
    const suggestions = [];
    const duplicateRegex = /\b(\w+)\b[\s,.;:!?/-]+\b\1\b/gi;
    let match;
    while ((match = duplicateRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const firstWord = fullMatch.split(/[\s,.;:!?/-]+/)[0];
        const startIndex = match.index;
        
        suggestions.push({
            type: 'duplicate',
            title: `Doppeltes Wort: "${firstWord}"`,
            description: `Das Wort "${firstWord}" kommt doppelt hintereinander vor.`,
            index: startIndex,
            length: fullMatch.length,
            badge: 'Wiederholung'
        });
    }
    
    const fillerRegex = /\b(\w+)\b/gi;
    while ((match = fillerRegex.exec(text)) !== null) {
        const word = match[1];
        if (FILLER_WORDS.has(word.toLowerCase())) {
            const startIndex = match.index;
            suggestions.push({
                type: 'filler',
                title: `Füllwort: "${word}"`,
                description: `Das Wort "${word}" schwächt den Satz eventuell ab. Überlege, es zu löschen oder zu ersetzen.`,
                index: startIndex,
                length: word.length,
                badge: 'Füllwort'
            });
        }
    }
    
    suggestions.sort((a, b) => a.index - b.index);
    
    if (suggestions.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; color: var(--color-success); font-size: 13px; padding: 20px; font-weight: 600;">
                ✓ Keine Stilauffälligkeiten gefunden!
            </div>
        `;
        return;
    }
    
    suggestions.forEach(sug => {
        const card = document.createElement('div');
        card.style.padding = '12px';
        card.style.border = '1px solid var(--border-color)';
        card.style.borderRadius = '8px';
        card.style.backgroundColor = 'var(--bg-base)';
        card.style.cursor = 'pointer';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '4px';
        card.style.transition = 'background-color 0.2s';
        
        card.addEventListener('mouseenter', () => {
            card.style.backgroundColor = 'var(--bg-surface)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.backgroundColor = 'var(--bg-base)';
        });
        
        card.addEventListener('click', () => {
            highlightWordInEditor(sug.index, sug.length);
        });
        
        const badgeColor = sug.type === 'duplicate' ? 'var(--color-primary)' : 'var(--text-muted)';
        const badgeBg = sug.type === 'duplicate' ? 'var(--color-primary-light)' : 'rgba(241, 245, 249, 0.1)';
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 13px; color: var(--text-base);">${escapeHtml(sug.title)}</strong>
                <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: ${badgeColor}; background-color: ${badgeBg};">${sug.badge}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">${escapeHtml(sug.description)}</div>
        `;
        
        resultsContainer.appendChild(card);
    });
}

function highlightWordInEditor(startIndex, wordLength) {
    if (!state.editor) return;
    
    const text = state.editor.getMarkdown();
    const beforeText = text.substring(0, startIndex);
    
    const linesBefore = beforeText.split('\n');
    const startLine = linesBefore.length;
    const startCol = linesBefore[linesBefore.length - 1].length;
    
    const matchText = text.substring(startIndex, startIndex + wordLength);
    const linesMatch = matchText.split('\n');
    const endLine = startLine + linesMatch.length - 1;
    const endCol = linesMatch.length > 1 ? linesMatch[linesMatch.length - 1].length : startCol + wordLength;
    
    state.editor.focus();
    
    if (typeof state.editor.setSelection === 'function') {
        state.editor.setSelection([startLine, startCol], [endLine, endCol]);
    } else if (state.editor.state && state.editor.state.editor) {
        state.editor.state.editor.setSelection([startLine, startCol], [endLine, endCol]);
    }
}

async function updateProjectMetadataDirectly(updates) {
    if (!state.currentProject) return;
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (response.ok) {
            const data = await response.json();
            state.currentProject = data;
        }
    } catch (e) {
        console.error("Failed to update project metadata", e);
    }
}

function openChapterSettingsModal() {
    if (!state.currentProject || !state.currentChapter) return;
    
    const select = document.getElementById('chapter-settings-volume');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Keinem Band zugeordnet --</option>';
    
    const volumes = state.currentProject.volumes || [];
    volumes.forEach(vol => {
        const opt = document.createElement('option');
        opt.value = vol.id;
        opt.textContent = vol.title;
        select.appendChild(opt);
    });
    
    const mapping = state.currentProject.chapters_volume_mapping || {};
    select.value = mapping[state.currentChapter.id] || "";
    
    openModal('modal-chapter-settings');
}

async function saveChapterSettings() {
    if (!state.currentProject || !state.currentChapter) return;
    
    const select = document.getElementById('chapter-settings-volume');
    if (!select) return;
    
    const mapping = state.currentProject.chapters_volume_mapping || {};
    if (select.value) {
        mapping[state.currentChapter.id] = select.value;
    } else {
        delete mapping[state.currentChapter.id];
    }
    
    await updateProjectMetadataDirectly({ chapters_volume_mapping: mapping });
    closeModal('modal-chapter-settings');
    showToast("Kapitel-Einstellungen gespeichert!", "success");
    loadProjectDetails(state.currentProject.id);
}

function updateEditorNavigation() {
    if (!state.currentProject || !state.currentChapter) return;
    
    const chapters = state.currentProject.chapters || [];
    const index = chapters.findIndex(c => c.id === state.currentChapter.id);
    
    const prevBtn = document.getElementById('btn-editor-prev-chapter');
    const nextBtn = document.getElementById('btn-editor-next-chapter');
    const titleSpan = document.getElementById('editor-nav-current-chapter-title');
    
    if (titleSpan) titleSpan.textContent = state.currentChapter.title || state.currentChapter.id;
    
    if (prevBtn) {
        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        if (index > 0) {
            newPrevBtn.disabled = false;
            newPrevBtn.style.opacity = '1';
            newPrevBtn.style.cursor = 'pointer';
            newPrevBtn.addEventListener('click', () => navigateToChapter(chapters[index - 1].id));
        } else {
            newPrevBtn.disabled = true;
            newPrevBtn.style.opacity = '0.5';
            newPrevBtn.style.cursor = 'not-allowed';
        }
    }
    
    if (nextBtn) {
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        if (index >= 0 && index < chapters.length - 1) {
            newNextBtn.disabled = false;
            newNextBtn.style.opacity = '1';
            newNextBtn.style.cursor = 'pointer';
            newNextBtn.addEventListener('click', () => navigateToChapter(chapters[index + 1].id));
        } else {
            newNextBtn.disabled = true;
            newNextBtn.style.opacity = '0.5';
            newNextBtn.style.cursor = 'not-allowed';
        }
    }
}

async function navigateToChapter(chapterId) {
    if (!state.currentProject) return;
    
    if (typeof handleExplicitSave === 'function') {
        await handleExplicitSave();
    }
    
    navigateTo('editor', { projectId: state.currentProject.id, chapterId });
}

// Snapshot & History Panel logic
let selectedSnapshotId = null;
let selectedSnapshotContent = null;

async function openHistoryModal() {
    if (!state.currentProject || !state.currentChapter) return;
    openModal('modal-history');
    selectedSnapshotId = null;
    selectedSnapshotContent = null;
    
    const restoreBtn = document.getElementById('btn-restore-snapshot-selected');
    if (restoreBtn) restoreBtn.style.display = 'none';
    
    const diffContainer = document.getElementById('history-diff-container');
    if (diffContainer) {
        diffContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-style: italic; font-size: 13px;">
                Wähle eine Version aus der Liste aus, um den Vergleich anzuzeigen.
            </div>
        `;
    }
    await loadSnapshotsList();
}

async function loadSnapshotsList() {
    const list = document.getElementById('history-snapshots-list');
    if (!list) return;
    list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px; font-size: 12px;">Lade Versionen...</div>`;
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/snapshots`);
        if (!response.ok) throw new Error("Could not load snapshots list");
        
        const snapshots = await response.json();
        list.innerHTML = '';
        
        if (snapshots.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 12px; font-size: 12px; font-style: italic;">Keine Sicherungspunkte vorhanden.</div>`;
            return;
        }
        
        snapshots.forEach(snap => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.style.cursor = 'pointer';
            item.style.padding = '8px 12px';
            item.style.borderRadius = '6px';
            item.style.border = '1px solid var(--border-color)';
            item.style.backgroundColor = 'var(--bg-base)';
            item.style.marginBottom = '6px';
            
            let displayDate = snap.timestamp;
            try {
                const dt = new Date(snap.timestamp);
                displayDate = dt.toLocaleString('de-DE');
            } catch(e) {}
            
            item.innerHTML = `
                <div style="font-size: 13px; font-weight: 600; color: var(--text-base);">${displayDate}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${snap.word_count.toLocaleString()} Wörter</div>
            `;
            
            item.addEventListener('click', () => {
                list.querySelectorAll('.list-item').forEach(el => {
                    el.style.borderColor = 'var(--border-color)';
                    el.style.backgroundColor = 'var(--bg-base)';
                });
                item.style.borderColor = 'var(--color-primary)';
                item.style.backgroundColor = 'var(--bg-surface)';
                
                selectedSnapshotId = snap.id;
                selectedSnapshotContent = snap.content;
                
                const restoreBtn = document.getElementById('btn-restore-snapshot-selected');
                if (restoreBtn) restoreBtn.style.display = 'inline-block';
                
                const currentContent = state.editor ? state.editor.getMarkdown() : '';
                renderSideBySideDiff(snap.content, currentContent);
            });
            
            list.appendChild(item);
        });
    } catch(e) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-danger); padding: 12px; font-size: 12px;">Fehler: ${escapeHtml(e.message)}</div>`;
    }
}

async function createManualSnapshot() {
    if (!state.currentProject || !state.currentChapter) return;
    
    await handleExplicitSave();
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/snapshots`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error("Could not create snapshot");
        
        showToast("Snapshot erfolgreich erstellt!", "success");
        await loadSnapshotsList();
    } catch(e) {
        showToast("Fehler beim Erstellen des Snapshots: " + e.message, "danger");
    }
}

async function restoreSelectedSnapshot() {
    if (!state.currentProject || !state.currentChapter || !selectedSnapshotId) return;
    
    showConfirm(
        "Version wiederherstellen",
        "Möchtest du das Kapitel wirklich auf den ausgewählten Sicherungspunkt zurücksetzen? Der aktuelle Text wird überschrieben.",
        async () => {
            try {
                const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/snapshots/${selectedSnapshotId}/restore`, {
                    method: 'POST'
                });
                
                if (!response.ok) throw new Error("Could not restore snapshot");
                
                await reloadEditorChapterContent(state.currentProject.id, state.currentChapter.id);
                closeModal('modal-history');
                showToast("Version erfolgreich wiederhergestellt!", "success");
            } catch(e) {
                showToast("Fehler beim Wiederherstellen: " + e.message, "danger");
            }
        }
    );
}

function renderSideBySideDiff(snapshotText, currentText) {
    const linesA = snapshotText.split('\n');
    const linesB = currentText.split('\n');
    const diff = computeDiff(linesA, linesB);
    
    const container = document.getElementById('history-diff-container');
    if (!container) return;
    container.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';
    grid.style.height = '100%';
    grid.style.overflowY = 'auto';
    grid.style.fontFamily = 'monospace';
    grid.style.fontSize = '12px';
    grid.style.lineHeight = '1.5';
    grid.style.whiteSpace = 'pre-wrap';
    grid.style.wordBreak = 'break-all';
    grid.style.alignContent = 'start';
    
    diff.forEach((item) => {
        const leftEl = document.createElement('div');
        const rightEl = document.createElement('div');
        
        leftEl.style.padding = '2px 8px';
        rightEl.style.padding = '2px 8px';
        leftEl.style.minHeight = '18px';
        rightEl.style.minHeight = '18px';
        
        if (item.type === 'removed') {
            leftEl.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            leftEl.style.color = '#ef4444';
            leftEl.textContent = '- ' + item.text;
            
            rightEl.style.backgroundColor = 'rgba(241, 245, 249, 0.02)';
            rightEl.textContent = '';
        } else if (item.type === 'added') {
            leftEl.style.backgroundColor = 'rgba(241, 245, 249, 0.02)';
            leftEl.textContent = '';
            
            rightEl.style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
            rightEl.style.color = '#22c55e';
            rightEl.textContent = '+ ' + item.text;
        } else {
            leftEl.textContent = '  ' + item.text;
            rightEl.textContent = '  ' + item.text;
        }
        
        grid.appendChild(leftEl);
        grid.appendChild(rightEl);
    });
    
    container.appendChild(grid);
}

// Expose functions globally
window.applyPhysicsLayout = applyPhysicsLayout;
window.applyHierarchicalLayout = applyHierarchicalLayout;
window.openHistoryModal = openHistoryModal;
window.createManualSnapshot = createManualSnapshot;
window.restoreSelectedSnapshot = restoreSelectedSnapshot;
window.openChapterSettingsModal = openChapterSettingsModal;
window.saveChapterSettings = saveChapterSettings;
window.runStyleCheck = runStyleCheck;
