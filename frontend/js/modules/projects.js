// 1. PROJECTS LOGIC
async function loadProjects(retryCount = 0) {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    
    try {
        const response = await fetch(`${API_URL}/projects`);
        if (!response.ok) throw new Error("Could not load projects");
        const data = await response.json();
        
        // Sometimes on very first boot, OS hasn't fully propagated the directory contents
        if (Array.isArray(data) && data.length === 0 && retryCount === 0) {
            console.warn("No projects found on first try, retrying once...");
            setTimeout(() => loadProjects(1), 600);
            return;
        }
        
        state.projects = Array.isArray(data) ? data : [];
        
        // Remove all cards EXCEPT the create card
        Array.from(grid.children).forEach(child => {
            if (child.id !== 'card-create-project') {
                grid.removeChild(child);
            }
        });
        
        state.projects.forEach(p => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <div class="card-title">${escapeHtml(p.title)}</div>
                <div class="card-desc">${escapeHtml(p.description || "Keine Beschreibung.")}</div>
                <div class="card-meta">
                    <span>Autor: ${escapeHtml(p.author || "Unbekannt")}</span>
                    <span>Ziel: ${p.word_count_goal || 0} W</span>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn btn-delete" title="In den Papierkorb verschieben">🗑️</button>
                </div>
            `;
            
            // Delete listener
            const deleteBtn = card.querySelector('.btn-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showConfirm(t('delete_project_title', 'Projekt löschen'), `${t('delete_project_body', 'Möchtest du das Projekt wirklich in den Papierkorb verschieben?')} "${p.title}"`, () => {
                        deleteProject(p.id);
                    });
                });
            }
            
            // View details listener
            card.addEventListener('click', () => {
                navigateTo('project-details', { projectId: p.id });
            });
            
            grid.appendChild(card);
        });
        
    } catch (e) {
        if (retryCount < 3) {
            console.warn(`Retry ${retryCount+1}/3: Waiting for backend...`);
            setTimeout(() => loadProjects(retryCount + 1), 1000);
            return;
        }
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

