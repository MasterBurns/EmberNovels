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

