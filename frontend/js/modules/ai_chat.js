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

