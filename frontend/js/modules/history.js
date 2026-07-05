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

async function renderCorkboard() {
    if (!state.currentProject) return;
    
    const container = document.getElementById('corkboard-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const chapters = state.currentProject.chapters || [];
    const volumes = state.currentProject.volumes || [];
    const mapping = state.currentProject.chapters_volume_mapping || {};
    const descs = state.currentProject.chapters_descriptions || {};
    
    // Group chapters
    const grouped = { unassigned: [] };
    volumes.forEach(vol => grouped[vol.id] = []);
    chapters.forEach(ch => {
        const volId = mapping[ch.id];
        if (volId && grouped[volId]) {
            grouped[volId].push(ch);
        } else {
            grouped.unassigned.push(ch);
        }
    });
    
    // Helper to render volume column
    const renderColumn = (colId, colTitle, colChapters) => {
        const colEl = document.createElement('div');
        colEl.className = 'corkboard-column';
        colEl.setAttribute('data-volume-id', colId);
        
        const header = document.createElement('div');
        header.className = 'corkboard-column-header';
        
        const countWords = colChapters.reduce((sum, ch) => sum + ch.word_count, 0);
        header.innerHTML = `
            <span class="corkboard-column-title">📁 ${escapeHtml(colTitle)} <span style="font-size: 11px; font-weight: normal; color: var(--text-secondary);">(${colChapters.length} Kap. · ${countWords.toLocaleString()} W.)</span></span>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px;">+ Kap.</button>
        `;
        
        // Add new chapter trigger
        header.querySelector('button').addEventListener('click', () => {
            showPrompt("Neues Kapitel erstellen", "Kapitel-Titel:", "", async (title) => {
                if (title && title.trim()) {
                    try {
                        const chRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: title })
                        });
                        if (!chRes.ok) throw new Error("Kapitel konnte nicht erstellt werden");
                        const newChapter = await chRes.json();
                        
                        // Map to this volume
                        if (colId !== 'unassigned') {
                            const newMapping = { ...state.currentProject.chapters_volume_mapping };
                            newMapping[newChapter.id] = colId;
                            await updateProjectMetadataDirectly({ chapters_volume_mapping: newMapping });
                        }
                        
                        showToast("Kapitel erstellt!", "success");
                        loadProjectDetails(state.currentProject.id).then(() => {
                            renderCorkboard();
                        });
                    } catch (err) {
                        showToast(err.message, "danger");
                    }
                }
            });
        });
        
        const grid = document.createElement('div');
        grid.className = 'corkboard-cards-grid';
        grid.setAttribute('data-volume-id', colId);
        
        // Drag over column behaviors
        colEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            colEl.style.borderColor = 'var(--color-primary)';
            colEl.style.backgroundColor = 'var(--color-primary-light)';
        });
        colEl.addEventListener('dragenter', (e) => {
            e.preventDefault();
        });
        colEl.addEventListener('dragleave', () => {
            colEl.style.borderColor = '';
            colEl.style.backgroundColor = '';
        });
        colEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            colEl.style.borderColor = '';
            colEl.style.backgroundColor = '';
            
            const chapterId = e.dataTransfer.getData('text/plain') || state.draggedChapterId;
            if (!chapterId) return;
            
            const newMapping = { ...state.currentProject.chapters_volume_mapping };
            if (colId === 'unassigned') {
                delete newMapping[chapterId];
            } else {
                newMapping[chapterId] = colId;
            }
            
            await updateProjectMetadataDirectly({ chapters_volume_mapping: newMapping });
            loadProjectDetails(state.currentProject.id).then(() => {
                renderCorkboard();
            });
        });
        
        // Populate chapter cards
        colChapters.forEach(ch => {
            const card = document.createElement('div');
            card.className = 'cork-card';
            card.setAttribute('draggable', 'true');
            card.setAttribute('data-chapter-id', ch.id);
            
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', ch.id);
                state.draggedChapterId = ch.id;
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                state.draggedChapterId = null;
            });
            
            const descVal = descs[ch.id] || ch.description || '';
            
            card.innerHTML = `
                <div class="cork-card-title" title="${escapeHtml(ch.title)}">${escapeHtml(ch.title)}</div>
                <textarea class="cork-card-desc" placeholder="Kapitelbeschreibung eingeben...">${escapeHtml(descVal)}</textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    <span style="font-size: 10px; color: var(--text-muted);">${ch.word_count} Wörter</span>
                    <button class="btn-delete" style="background:none; border:none; cursor:pointer; font-size:11px; padding:2px;" title="Löschen">🗑️</button>
                </div>
            `;
            
            // Edit synopsis blur auto-save
            const textarea = card.querySelector('textarea');
            textarea.addEventListener('blur', async () => {
                const newText = textarea.value.trim();
                const currentDescs = { ...state.currentProject.chapters_descriptions };
                if (currentDescs[ch.id] !== newText) {
                    currentDescs[ch.id] = newText;
                    await updateProjectMetadataDirectly({ chapters_descriptions: currentDescs });
                    showToast("Kapitel-Zusammenfassung gespeichert", "success");
                }
            });
            textarea.addEventListener('click', (e) => e.stopPropagation()); // prevent navigating to editor
            
            // Click card navigation to editor
            card.addEventListener('click', () => {
                navigateTo('editor', { projectId: state.currentProject.id, chapterId: ch.id });
            });
            
            // Delete chapter
            card.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm(t('delete_chapter_title', 'Kapitel löschen'), `${t('delete_chapter_body', 'Möchtest du das Kapitel wirklich in den Papierkorb verschieben?')} "${ch.title}"`, () => {
                    deleteChapter(state.currentProject.id, ch.id).then(() => {
                        loadProjectDetails(state.currentProject.id).then(() => {
                            renderCorkboard();
                        });
                    });
                });
            });
            
            grid.appendChild(card);
        });
        
        colEl.appendChild(header);
        colEl.appendChild(grid);
        return colEl;
    };
    
    // Render columns
    volumes.forEach(vol => {
        container.appendChild(renderColumn(vol.id, vol.title, grouped[vol.id]));
    });
    
    // Always render unassigned column
    container.appendChild(renderColumn('unassigned', "Ungruppierte Kapitel", grouped.unassigned));
}

async function handleSearchReplace() {
    const searchTerm = document.getElementById('search-replace-find').value;
    const replaceTerm = document.getElementById('search-replace-with').value;
    const matchCase = document.getElementById('search-replace-match-case').checked;
    const wholeWord = document.getElementById('search-replace-whole-word').checked;
    
    if (!searchTerm) {
        showToast("Bitte Suchbegriff eingeben.", "warning");
        return;
    }
    if (!state.currentProject) {
        showToast("Kein Projekt geladen.", "danger");
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/projects/${state.currentProject.id}/search-replace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                search_term: searchTerm,
                replace_term: replaceTerm,
                match_case: matchCase,
                whole_word: wholeWord
            })
        });
        
        if (!res.ok) throw new Error("Ersetzen fehlgeschlagen");
        
        const data = await res.json();
        showToast(`Erfolgreich! ${data.replaced_count} Ersetzungen in ${data.modified_files} Dateien vorgenommen.`, "success");
        closeModal('modal-search-replace');
        
        // Reload chapter if in editor
        if (state.currentChapter) {
            loadChapterContent(state.currentProject.id, state.currentChapter.id);
        }
    } catch (e) {
        showToast(e.message, "danger");
    }
}

function handleCleanTypography() {
    if (!state.editor) return;
    
    let text = state.editor.getMarkdown();
    
    // Replace logic for smart typography (German)
    // 1. Double quotes "..." to „...“
    // We use a regex to find words wrapped in quotes
    text = text.replace(/"([^"]*)"/g, '„$1“');
    // 2. Single quotes '...' to ‚...‘ (Optional, might conflict with apostrophes, so skip or use carefully)
    // 3. Ellipses ... to …
    text = text.replace(/\.{3}/g, '…');
    // 4. Double dashes -- to em-dash —
    text = text.replace(/--/g, '—');
    
    state.editor.setMarkdown(text);
    showToast("Typografie bereinigt! ✨", "success");
    markDirty();
}
async function loadProjectStats(projectId) {
    const calendarContainer = document.getElementById('stat-activity-calendar');
    if (!calendarContainer) return;
    
    calendarContainer.innerHTML = '';
    
    try {
        const res = await fetch(`${API_URL}/projects/${projectId}/stats`);
        const stats = res.ok ? await res.json() : {};
        
        // Generate last 30 days
        const today = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            
            const dayStats = stats[dateStr];
            const words = dayStats ? dayStats.words_added : 0;
            
            const box = document.createElement('div');
            box.style.width = '14px';
            box.style.height = '14px';
            box.style.borderRadius = '3px';
            box.style.backgroundColor = 'var(--bg-base)';
            box.title = `${dateStr}: ${words} Wörter`;
            
            if (words > 0) {
                // Determine color intensity based on word count
                if (words < 500) {
                    box.style.backgroundColor = '#9be9a8';
                } else if (words < 1500) {
                    box.style.backgroundColor = '#40c463';
                } else if (words < 3000) {
                    box.style.backgroundColor = '#30a14e';
                } else {
                    box.style.backgroundColor = '#216e39';
                }
            }
            
            calendarContainer.appendChild(box);
        }
    } catch (e) {
        console.error("Error loading stats", e);
    }
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
window.renderCorkboard = renderCorkboard;
window.loadProjectStats = loadProjectStats;

