// 2. PROJECT DETAILS LOGIC
async function loadProjectDetails(projectId) {
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}`);
        if (!response.ok) throw new Error("Project details not found");
        const project = await response.json();
        state.currentProject = project;
        
        if (typeof ModuleManager !== 'undefined') ModuleManager.renderSidebar();
        if (typeof runSidebarTutorial !== 'undefined') runSidebarTutorial();

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

        // Render Activity Calendar
        loadProjectStats(projectId);

        // Render Chapter List
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
            renderCorkboard(chaptersCopy, grouped);
        }
        
        // Toggle view
        const corkboardEl = document.getElementById('chapters-corkboard');
        if (state.viewMode === 'corkboard') {
            list.style.display = 'none';
            corkboardEl.style.display = 'grid';
        } else {
            list.style.display = 'block';
            corkboardEl.style.display = 'none';
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

