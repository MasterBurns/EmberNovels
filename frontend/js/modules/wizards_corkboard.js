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

function renderCorkboard(chapters, grouped) {
    const container = document.getElementById('chapters-corkboard');
    container.innerHTML = '';
    
    if (typeof Sortable === 'undefined') {
        container.innerHTML = '<div style="color: var(--danger);">SortableJS is missing.</div>';
        return;
    }
    
    // We render a flat grid for now. Grouping on corkboard would be more complex (multiple grids).
    chapters.forEach((c, index) => {
        const card = document.createElement('div');
        card.className = 'corkboard-card';
        card.setAttribute('data-chapter-id', c.id);
        
        const isOriginal = state.activeLanguage === 'original';
        
        let metaText = `${c.word_count} W.`;
        if (!isOriginal) {
            metaText = `(${state.activeLanguage.toUpperCase()}) ${metaText}`;
        }
        
        card.innerHTML = `
            <div class="corkboard-pin"></div>
            <div class="corkboard-title" style="flex-grow: 1;">${escapeHtml(c.title)}</div>
            <div class="corkboard-meta" style="display: flex; justify-content: space-between; align-items: center;">
                <span>${metaText}</span>
                <span>🗑️</span>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (e.target.innerText === '🗑️') {
                e.stopPropagation();
                showConfirm("Kapitel löschen", `Möchtest du das Kapitel "${c.title}" wirklich löschen?`, () => {
                    deleteChapter(state.currentProject.id, c.id);
                });
            } else {
                navigateTo('editor', { projectId: state.currentProject.id, chapterId: c.id });
            }
        });
        
        container.appendChild(card);
    });
    
    // Initialize Sortable
    if (state.activeLanguage === 'original') {
        new Sortable(container, {
            animation: 150,
            ghostClass: 'dragging',
            onEnd: async (evt) => {
                const itemEl = evt.item;
                const chapterId = itemEl.getAttribute('data-chapter-id');
                const newIndex = evt.newIndex;
                
                // Construct new order array
                const newOrder = [];
                container.querySelectorAll('.corkboard-card').forEach(card => {
                    newOrder.push(card.getAttribute('data-chapter-id'));
                });
                
                // If sorted desc, we need to reverse newOrder before saving
                if (state.chapterSortOrder === 'desc') {
                    newOrder.reverse();
                }
                
                try {
                    await fetch(`${API_URL}/projects/${state.currentProject.id}/reorder`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newOrder)
                    });
                } catch (e) {
                    showToast("Fehler beim Speichern der Reihenfolge", "danger");
                }
                // Reload to sync with list view
                loadProjectDetails(state.currentProject.id);
            }
        });
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

