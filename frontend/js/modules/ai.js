// ==========================================
// D. AI SETTINGS, ASSISTANT & TRANSLATIONS
// ==========================================

function setSelectValue(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT' && val) {
        if (!Array.from(el.options).some(o => o.value === val)) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            el.appendChild(opt);
        }
    }
    el.value = val;
}

async function loadAISettingsInForm() {
    try {
        const response = await fetch(`${API_URL}/ai/settings`);
        if (!response.ok) throw new Error("Could not load AI settings");
        const settings = await response.json();
        
        state.aiSettings = settings;
        
        // General Interval and UI language
        const savedInterval = localStorage.getItem('ember_autosave_interval') || '3';
        document.getElementById('setting-autosave-interval').value = savedInterval;
        
        const savedUiLang = localStorage.getItem('ember_ui_language') || 'de';
        document.getElementById('setting-ui-language').value = savedUiLang;
        
        const savedEditorEngine = localStorage.getItem('ember_editor_engine') || 'toastui';
        document.getElementById('setting-editor-engine').value = savedEditorEngine;
        state.editorEngine = savedEditorEngine;
        
        // AI Provider Select
        const providerSelect = document.getElementById('setting-ai-provider');
        providerSelect.value = settings.ai_provider || 'none';
        
        // Fill Provider Sub-panels
        document.getElementById('setting-ollama-url').value = settings.ollama_url || 'http://localhost:11434';
        setSelectValue('setting-ollama-model', settings.ollama_model || 'llama3');
        
        document.getElementById('setting-gemini-key').value = settings.gemini_api_key || '';
        setSelectValue('setting-gemini-model', settings.gemini_model || 'gemini-1.5-flash');
        
        document.getElementById('setting-openai-key').value = settings.openai_api_key || '';
        setSelectValue('setting-openai-model', settings.openai_model || 'gpt-4o-mini');
        
        document.getElementById('setting-anthropic-key').value = settings.anthropic_api_key || '';
        setSelectValue('setting-anthropic-model', settings.anthropic_model || 'claude-3-5-sonnet');
        
        
        // Update Gemini usage Tracker
        const geminiUsageDate = settings.gemini_usage_date || '';
        const todayStr = new Date().toISOString().split('T')[0];
        let usageCount = 0;
        if (geminiUsageDate === todayStr) {
            usageCount = settings.gemini_usage_count || 0;
        }
        
        const usageTextEl = document.getElementById('gemini-usage-text');
        const usageBarEl = document.getElementById('gemini-usage-bar');
        if (usageTextEl && usageBarEl) {
            usageTextEl.textContent = `${usageCount} / 1500`;
            const pct = Math.min(100, Math.max(0, (usageCount / 1500) * 100));
            usageBarEl.style.width = `${pct}%`;
            if (pct > 90) {
                usageBarEl.style.backgroundColor = 'var(--color-danger)';
            } else if (pct > 75) {
                usageBarEl.style.backgroundColor = 'var(--color-warning)';
            } else {
                usageBarEl.style.backgroundColor = 'var(--color-primary)';
            }
        }

        // Auto translate check
        document.getElementById('setting-auto-translate').checked = settings.auto_translate_on_save !== false;
        
        // Backup settings
        document.getElementById('setting-backup-enabled').checked = settings.backup_enabled || false;
        document.getElementById('setting-backup-dir').value = settings.backup_dir || '';
        document.getElementById('setting-webdav-url').value = settings.webdav_url || '';
        document.getElementById('setting-webdav-user').value = settings.webdav_user || '';
        document.getElementById('setting-webdav-password').value = settings.webdav_password || '';
        state.backupEnabled = settings.backup_enabled || false;
        state.backupDir = settings.backup_dir || '';
        
        // Trigger visibility
        providerSelect.dispatchEvent(new Event('change'));
        
    } catch (e) {
        showToast(t('error_loading_settings', 'Fehler beim Laden der Einstellungen: ') + e.message, "danger");
    }
}

async function handleSaveSettings() {
    // Save general interval to localStorage
    const interval = document.getElementById('setting-autosave-interval').value;
    localStorage.setItem('ember_autosave_interval', interval);
    state.autosaveInterval = parseInt(interval, 10) * 1000;
    
    // Save UI language to localStorage and reload it
    const uiLang = document.getElementById('setting-ui-language').value;
    const oldUiLang = localStorage.getItem('ember_ui_language') || 'de';
    localStorage.setItem('ember_ui_language', uiLang);
    
    // Save Editor Engine
    const editorEngine = document.getElementById('setting-editor-engine').value;
    const oldEditorEngine = localStorage.getItem('ember_editor_engine') || 'toastui';
    localStorage.setItem('ember_editor_engine', editorEngine);
    state.editorEngine = editorEngine;
    if (editorEngine !== oldEditorEngine) {
        showToast('Editor-Engine wurde gewechselt. Lade neu...', 'info');
        setTimeout(() => {
            window.location.reload(true);
        }, 800);
    }
    
    // Save to backend so the python app (Control Center) knows about it
    try {
        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ui_language: uiLang})
        });
    } catch (e) {
        console.error("Failed to save global settings to backend", e);
    }

    state.uiLanguage = uiLang;
    if (uiLang !== oldUiLang) {
        await loadUiLanguage(uiLang);
        navigateTo(state.currentView, state.currentProject ? { projectId: state.currentProject.id } : {});
    }
    
    // Gather AI settings payload
    const payload = {
        ai_provider: document.getElementById('setting-ai-provider').value,
        ollama_url: document.getElementById('setting-ollama-url').value,
        ollama_model: document.getElementById('setting-ollama-model').value,
        gemini_api_key: document.getElementById('setting-gemini-key').value,
        gemini_model: document.getElementById('setting-gemini-model').value,
        openai_api_key: document.getElementById('setting-openai-key').value,
        openai_model: document.getElementById('setting-openai-model').value,
        anthropic_api_key: document.getElementById('setting-anthropic-key').value,
        anthropic_model: document.getElementById('setting-anthropic-model').value,
        auto_translate_on_save: document.getElementById('setting-auto-translate').checked,
        backup_enabled: document.getElementById('setting-backup-enabled').checked,
        backup_dir: document.getElementById('setting-backup-dir').value,
        webdav_url: document.getElementById('setting-webdav-url').value,
        webdav_user: document.getElementById('setting-webdav-user').value,
        webdav_password: document.getElementById('setting-webdav-password').value
    };
    
    state.backupEnabled = payload.backup_enabled;
    state.backupDir = payload.backup_dir;
    
    try {
        const response = await fetch(`${API_URL}/ai/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error("API request failed");
        
        showToast(t('settings_save_success', 'Einstellungen erfolgreich gespeichert!'), 'success');
        
    } catch (e) {
        showToast(t('error_save_settings', 'KI-Einstellungen konnten nicht gespeichert werden: ') + e.message, 'danger');
    }
}

async function handleCloudBackup() {
    if (!state.currentProject) {
        showToast("Bitte öffne zuerst ein Projekt, um es in der Cloud zu sichern.", "danger");
        return;
    }
    
    // Wir speichern vorher die Settings, damit die aktuellen WebDAV-Daten ankommen
    await saveAISettings();
    
    showToast("Cloud-Backup wird gestartet... Bitte warten.", "success");
    if (window.addTask) window.addTask('backup', 'Cloud-Backup', 'Lade Projekt in die Cloud hoch...');
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/cloud-backup`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Cloud-Backup fehlgeschlagen");
        }
        
        showToast(t('backup_success', 'Cloud-Backup erfolgreich abgeschlossen!'), 'success');
        
    } catch (e) {
        showToast("Fehler beim Cloud-Backup: " + e.message, "danger");
    } finally {
        if (window.removeTask) window.removeTask('backup');
    }
}

async function loadProjectLanguages(projectId) {
    const list = document.getElementById('project-languages-list');
    list.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">${t('loading_languages', 'Lade Sprachen...')}</div>`;
    
    try {
        const response = await fetch(`${API_URL}/projects/${projectId}/languages`);
        if (!response.ok) throw new Error("Languages load failed");
        const langs = await response.json();
        
        list.innerHTML = '';
        
        // Add Original dynamic element based on currentProject original language
        const origEl = document.createElement('div');
        origEl.className = 'list-item';
        origEl.style.padding = '8px 12px';
        origEl.style.display = 'flex';
        origEl.style.justifyContent = 'space-between';
        origEl.style.alignItems = 'center';
        origEl.style.cursor = 'pointer';
        
        if (state.activeLanguage === 'original') {
            origEl.style.borderColor = 'var(--color-primary)';
            origEl.style.backgroundColor = 'var(--color-primary-light)';
        }
        
        const origLang = (state.currentProject && state.currentProject.original_language) || "de";
        const langMap = {
            "de": { flag: "🇩🇪", label: t('lang_de', "Deutsch") },
            "en": { flag: "🇬🇧", label: t('lang_en', "Englisch") },
            "fr": { flag: "🇫🇷", label: t('lang_fr', "Französisch") },
            "es": { flag: "🇪🇸", label: t('lang_es', "Spanisch") },
            "it": { flag: "🇮🇹", label: t('lang_it', "Italienisch") },
            "ja": { flag: "🇯🇵", label: t('lang_ja', "Japanisch") },
            "zh": { flag: "🇨🇳", label: t('lang_zh', "Chinesisch") }
        };
        const origMapping = langMap[origLang] || { flag: "🌐", label: origLang.toUpperCase() };
        
        origEl.innerHTML = `
            <span style="font-size: 13px; font-weight: 500;">${origMapping.flag} ${origMapping.label} (${t('branch_original_badge', 'Original')})</span>
            <span style="font-size: 10px; background-color: var(--color-primary-light); color: var(--color-primary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">${t('branch_original_badge', 'Original')}</span>
        `;
        
        origEl.addEventListener('click', () => {
            state.activeLanguage = 'original';
            loadProjectDetails(projectId);
            loadProjectLanguages(projectId);
        });
        list.appendChild(origEl);
        
        // Add other branches
        langs.forEach(lang => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.style.padding = '8px 12px';
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            el.style.cursor = 'pointer';
            
            if (state.activeLanguage === lang) {
                el.style.borderColor = 'var(--color-primary)';
                el.style.backgroundColor = 'var(--color-primary-light)';
            }
            
            const mapping = langMap[lang] || { flag: "🏳️", label: lang.toUpperCase() };
            
            el.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 13px; font-weight: 500;">${mapping.flag} ${mapping.label}</span>
                    <span style="font-size: 10px; background-color: var(--bg-base); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 2px 6px; border-radius: 4px;">Branch</span>
                </div>
                <button class="card-action-btn btn-delete-branch" title="Sprachzweig löschen" style="background: none; border: none; cursor: pointer; padding: 4px;">🗑️</button>
            `;
            
            el.addEventListener('click', () => {
                state.activeLanguage = lang;
                loadProjectDetails(projectId);
                loadProjectLanguages(projectId);
            });
            
            const btnDelete = el.querySelector('.btn-delete-branch');
            if (btnDelete) {
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showConfirm("Sprachzweig löschen", `Möchtest du den Sprachzweig "${mapping.label}" und alle darin übersetzten Kapitel wirklich unwiderruflich löschen?`, async () => {
                        try {
                            const delRes = await fetch(`${API_URL}/projects/${projectId}/languages/${lang}`, { method: 'DELETE' });
                            if (!delRes.ok) throw new Error("Could not delete translation branch");
                            
                            showToast("Sprachzweig erfolgreich gelöscht.", "success");
                            if (state.activeLanguage === lang) {
                                state.activeLanguage = 'original';
                            }
                            loadProjectDetails(projectId);
                            loadProjectLanguages(projectId);
                        } catch (err) {
                            showToast(err.message, "danger");
                        }
                    });
                });
            }
            
            list.appendChild(el);
        });
    } catch (e) {
        list.innerHTML = `<div style="font-size: 13px; color: var(--text-muted);">${t('error_loading', 'Fehler beim Laden.')}</div>`;
    }
}

async function handleCreateLanguageBranch() {
    if (!state.currentProject) return;
    
    const codeEl = document.getElementById('new-language-code');
    const lang_code = codeEl.value.trim().toLowerCase();
    
    if (!lang_code) {
        showToast(t('toast_lang_code_required', 'Bitte gib einen Sprachcode ein.'), "warning");
        return;
    }
    
    showToast(t('branch_creating_prefix', 'Erstelle Sprachzweig "') + lang_code.toUpperCase() + t('branch_creating_suffix', '"...'), 'info');
    closeModal('modal-language');
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/languages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lang_code })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || t('error_create_branch', 'Failed to create language branch'));
        }
        
        showToast(t('branch_translating_bg_prefix', 'Sprachzweig "') + lang_code.toUpperCase() + t('branch_translating_bg_suffix', '" wird im Hintergrund übersetzt!'), 'success');
        codeEl.value = '';
        
        // Reload list after short delay
        setTimeout(() => loadProjectLanguages(state.currentProject.id), 2000);
        
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function reloadEditorChapterContent(projectId, chapterId) {
    const banner = document.getElementById('recovery-banner');
    banner.style.display = 'none';
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.style.display = 'inline-block';
    saveStatus.textContent = 'Lade Kapitel...';
    
    try {
        let url = `${API_URL}/projects/${projectId}/chapters/${chapterId}`;
        if (state.activeLanguage !== 'original') {
            url = `${API_URL}/projects/${projectId}/languages/${state.activeLanguage}/chapters/${chapterId}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Could not load chapter content");
        const data = await response.json();
        
        state.currentChapter = data;
        state.lastSavedContent = data.content || '';
        state.isDirty = false;

        // Track initial word count for session progress
        const text = data.content || '';
        state.chapterWordCountOnLoad = text.trim() ? text.trim().split(/\s+/).length : 0;
        state.sessionWords = 0;
        
        if (state.editor) {
            state.loadingChapter = true;
            state.editor.setMarkdown(data.content || '');
            state.loadingChapter = false;
        }
        
        // Warning banner for original recovery file if it exists
        if (state.activeLanguage === 'original' && data.has_recovery) {
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
        
        saveStatus.style.display = 'none';
        
        setTimeout(() => {
            highlightKeywordsInPreview();
            updateDetectedKeywords();
            updateEditorNavigation();
        }, 150);
        
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function handleManualTranslate() {
    if (!state.currentProject || !state.currentChapter || state.activeLanguage === 'original') return;
    
    showConfirm(t('translate_chapter_title', 'Kapitel übersetzen'), `${t('translate_chapter_body', 'Möchtest du dieses Kapitel jetzt neu aus dem Original übersetzen? Eigene Änderungen an dieser Übersetzung werden überschrieben.')} (${state.activeLanguage.toUpperCase()})`, async () => {
        const saveStatus = document.getElementById('save-status');
        saveStatus.style.display = 'inline-block';
        saveStatus.textContent = t('translating', 'Übersetze...');
        
        try {
            const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/languages/${state.activeLanguage}/chapters/${state.currentChapter.id}/translate`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error("Translation failed");
            const data = await response.json();
            
            if (state.editor) {
                state.editor.setMarkdown(data.content || '');
            }
            
            state.lastSavedContent = data.content || '';
            state.isDirty = false;
            showToast(t('chapter_translated_toast', 'Kapitel erfolgreich neu übersetzt!'), "success");
            
        } catch (e) {
            showToast(t('error_translation', 'Fehler bei der Übersetzung: ') + e.message, 'danger');
        } finally {
            saveStatus.style.display = 'none';
        }
    });
}

async function handleAIAssistant(task) {
    if (!state.editor || !state.currentChapter) return;
    
    let text = state.editor.getSelectedText().trim();
    const isSelection = !!text;
    
    if (!text) {
        if (task === 'correct') {
            text = state.editor.getMarkdown().trim();
        } else {
            // For 'continue', get last 1500 chars of the content
            text = state.editor.getMarkdown().trim();
            if (text.length > 1500) {
                text = text.slice(-1500);
            }
        }
    }
    
    if (!text) {
        showToast(t('toast_no_text_to_process', 'Es gibt keinen Text zum Verarbeiten.'), "warning");
        return;
    }
    
    const saveStatus = document.getElementById('save-status');
    saveStatus.style.display = 'inline-block';
    saveStatus.textContent = task === 'correct' ? t('ai_proofreading_running', 'Lektorat läuft...') : t('ai_continue_writing', 'Schreibe weiter...');
    
    try {
        const response = await fetch(`${API_URL}/ai/assist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, task })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || t('error_ai_request_failed', 'AI Request failed'));
        }
        
        const data = await response.json();
        const result = data.result;
        
        if (!result) {
            showToast(t('toast_no_ai_response', 'Keine Antwort erhalten.'), "warning");
            return;
        }
        
        if (task === 'correct') {
            // AUTOMATIC SAFETY BACKUP: Create snapshot before AI overwrites text
            try {
                await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters/${state.currentChapter.id}/snapshots`, {
                    method: 'POST'
                });
            } catch(e) {
                console.warn("Could not create automatic backup snapshot before AI correction", e);
            }
            
            if (isSelection) {
                state.editor.replaceSelection(result);
            } else {
                state.editor.setMarkdown(result);
            }
            showToast(t('text_proofread_toast', 'Text erfolgreich lektoriert! Backup wurde erstellt.'), "success");
        } else if (task === 'continue') {
            state.editor.insertText("\n" + result);
            showToast(t('text_continued_toast', 'Text erfolgreich fortgeführt!'), "success");
        }
        
        state.isDirty = true;
        
    } catch (e) {
        showToast("KI-Fehler: " + e.message, "danger");
    } finally {
        saveStatus.style.display = 'none';
    }
}

