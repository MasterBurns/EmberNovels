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
    
    // Populate volume dropdown
    const volSelect = document.getElementById('export-volume-select');
    const volGroup = document.getElementById('export-volume-group');
    if (volSelect && volGroup) {
        volSelect.innerHTML = '<option value="">-- Alle Bände --</option>';
        const volumes = state.currentProject.volumes || [];
        if (volumes.length > 0) {
            volGroup.style.display = 'block';
            volumes.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.textContent = v.title;
                volSelect.appendChild(opt);
            });
        } else {
            volGroup.style.display = 'none';
        }
    }
    
    fetch(`${API_URL}/projects/${state.currentProject.id}/chapters`)
        .then(res => res.json())
        .then(chapters => {
            list.innerHTML = '';
            if (chapters.length === 0) {
                list.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">${t('no_chapters_placeholder_short', 'Keine aktiven Kapitel vorhanden.')}</div>`;
                return;
            }
            
            const mapping = state.currentProject.chapters_volume_mapping || {};
            chapters.forEach(ch => {
                const item = document.createElement('div');
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '8px';
                item.style.marginBottom = '6px';
                
                const volId = mapping[ch.id] || '';
                
                item.innerHTML = `
                    <input type="checkbox" id="export-ch-${ch.id}" class="export-chapter-chk" value="${ch.id}" data-volume="${volId}" checked>
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

function onExportVolumeChange() {
    const volId = document.getElementById('export-volume-select').value;
    const checkboxes = document.querySelectorAll('.export-chapter-chk');
    checkboxes.forEach(chk => {
        if (!volId) {
            chk.checked = true; // Select all if no volume filter
        } else {
            chk.checked = (chk.getAttribute('data-volume') === volId);
        }
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

