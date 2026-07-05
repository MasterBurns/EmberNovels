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

