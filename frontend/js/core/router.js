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
    if (typeof ModuleManager !== 'undefined') {
        ModuleManager.updateActive(view);
    } else {
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
        });
        const activeNav = document.getElementById(`nav-${view}`);
        if (activeNav) activeNav.classList.add('active');
    }
    
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
                loadProjectDetails(params.projectId).then(() => {
                    loadProjectLanguages(params.projectId);
                });
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
            if (typeof ModuleManager === 'undefined') {
                document.getElementById('nav-settings').classList.add('active');
            }
            headerTitle.textContent = t('nav_settings', 'Einstellungen');
            headerAction.style.display = 'none';
            loadAISettingsInForm();
            loadProjectModulesInForm();
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

        case 'mindmap':
            document.getElementById('nav-mindmap').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => navigateTo('project-details', { projectId: state.currentProject.id });
            headerAction.style.display = 'none';
            headerTitle.textContent = `${t('mindmap_title_project', '🧠 Mindmap Manager')}: ${state.currentProject.title}`;
            loadMindmapData();
            break;

        case 'corkboard':
            document.getElementById('nav-corkboard').classList.add('active');
            btnBackDetails.style.display = 'inline-flex';
            btnBackDetails.onclick = () => navigateTo('project-details', { projectId: state.currentProject.id });
            headerAction.style.display = 'none';
            headerTitle.textContent = `📌 Korkwand: ${state.currentProject.title}`;
            renderCorkboard();
            break;
    }
}

