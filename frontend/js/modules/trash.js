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

