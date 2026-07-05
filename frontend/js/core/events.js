// Event Listeners setup
function setupEventListeners() {
    // Nav sidebar clicks are handled dynamically by ModuleManager
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
    
    // Project and Chapter creation triggers
    const cardCreateProject = document.getElementById('card-create-project');
    if (cardCreateProject) {
        cardCreateProject.addEventListener('click', () => openModal('modal-project'));
    }
    const btnCreateChapter = document.getElementById('btn-create-chapter');
    if (btnCreateChapter) {
        btnCreateChapter.addEventListener('click', () => openModal('modal-chapter'));
    }
    
    // Submit forms
    document.getElementById('btn-submit-project').addEventListener('click', handleCreateProject);
    document.getElementById('btn-submit-chapter').addEventListener('click', handleCreateChapter);
    
    // Settings save
    document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);
    
    // Bind AI model fetch buttons
    document.querySelectorAll('.btn-load-models').forEach(btn => {
        btn.addEventListener('click', async () => {
            const provider = btn.getAttribute('data-provider');
            let apiKey = "";
            let url = "";
            
            if (provider === 'gemini') apiKey = document.getElementById('setting-gemini-key').value;
            else if (provider === 'openai') apiKey = document.getElementById('setting-openai-key').value;
            else if (provider === 'anthropic') apiKey = document.getElementById('setting-anthropic-key').value;
            else if (provider === 'ollama') url = document.getElementById('setting-ollama-url').value;
            
            const originalText = btn.textContent;
            btn.textContent = "Lädt...";
            btn.disabled = true;
            
            try {
                const response = await fetch(`${API_URL}/ai/models`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider, api_key: apiKey, url })
                });
                
                if (!response.ok) throw new Error("Konnte Modelle nicht laden");
                const models = await response.json();
                
                const datalist = document.getElementById(`setting-${provider}-model`);
                if (datalist) {
                    const currentVal = datalist.value; datalist.innerHTML = ''; if (currentVal) { const opt = document.createElement('option'); opt.value = currentVal; opt.textContent = currentVal; datalist.appendChild(opt); datalist.value = currentVal; }
                    models.forEach(model => {
                        const opt = document.createElement('option');
                        opt.value = model;
                        if (!Array.from(datalist.options).some(o => o.value === model)) datalist.appendChild(opt);
                    });
                    showToast(`${models.length} Modelle geladen!`, "success");
                }
            } catch(e) {
                showToast("Fehler beim Laden der Modelle: " + e.message, "danger");
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });
    
    // AI Settings provider change panel display toggle
    document.getElementById('setting-ai-provider').addEventListener('change', (e) => {
        const val = e.target.value;
        document.getElementById('panel-settings-ollama').style.display = val === 'ollama' ? 'flex' : 'none';
        document.getElementById('panel-settings-gemini').style.display = val === 'gemini' ? 'flex' : 'none';
        document.getElementById('panel-settings-openai').style.display = val === 'openai' ? 'flex' : 'none';
        document.getElementById('panel-settings-anthropic').style.display = val === 'anthropic' ? 'flex' : 'none';
    });
    
    // Editor controls
    document.getElementById('btn-editor-view-wysiwyg').addEventListener('click', () => setEditorMode('wysiwyg'));
    document.getElementById('btn-editor-view-markdown').addEventListener('click', () => setEditorMode('markdown'));
    document.getElementById('btn-editor-split').addEventListener('click', toggleEditorSplit);
    document.getElementById('btn-editor-save').addEventListener('click', handleExplicitSave);
    document.getElementById('btn-close-lore-panel').addEventListener('click', () => {
        document.getElementById('editor-lore-panel').style.display = 'none';
        document.querySelector('.editor-workspace').classList.remove('editor-layout-split');
    });
    
    // Shortcut for Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            if (state.currentView === 'editor') {
                e.preventDefault();
                handleExplicitSave();
            }
        }
    });
    
    // Recovery actions
    document.getElementById('btn-recovery-keep').addEventListener('click', () => {
        if (state.currentChapter && state.currentChapter.has_recovery) {
            renderDiffMergeView(state.currentChapter.content, state.currentChapter.recovery_content);
            openModal('modal-merge');
        }
    });
    document.getElementById('btn-recovery-discard').addEventListener('click', () => resolveRecovery(false));

    // Merge modal triggers
    document.getElementById('btn-merge-select-all').addEventListener('click', () => {
        if (state.mergeLines) {
            state.mergeLines.forEach(item => {
                if (item.checkbox) {
                    if (item.type === 'added') item.checkbox.checked = true;
                    if (item.type === 'removed') item.checkbox.checked = false;
                }
            });
        }
    });
    
    document.getElementById('btn-merge-deselect-all').addEventListener('click', () => {
        if (state.mergeLines) {
            state.mergeLines.forEach(item => {
                if (item.checkbox) {
                    if (item.type === 'added') item.checkbox.checked = false;
                    if (item.type === 'removed') item.checkbox.checked = true;
                }
            });
        }
    });
    
    document.getElementById('btn-merge-submit').addEventListener('click', applyMerge);

    // Lore Database triggers (nav-lore handled by ModuleManager)
    
    document.getElementById('btn-wiki-create').addEventListener('click', () => openLoreModal());
    document.getElementById('btn-view-lore').addEventListener('click', () => navigateTo('lore'));
    document.getElementById('wiki-search').addEventListener('input', filterLoreEntries);
    document.getElementById('wiki-filter-category').addEventListener('change', filterLoreEntries);
    document.getElementById('btn-submit-lore').addEventListener('click', handleSaveLore);
    
    document.getElementById('btn-editor-create-lore').addEventListener('click', () => {
        if (!state.editor) return;
        const selectedText = state.editor.getSelectedText().trim();
        if (!selectedText) {
            showToast(t('toast_select_text_first', 'Bitte markiere zuerst ein Wort oder einen Begriff im Text.'), 'warning');
            return;
        }
        openLoreModal(null, selectedText);
    });
    
    // Editor keyword event delegation click listener
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
        editorContainer.addEventListener('click', (e) => {
            const keywordSpan = e.target.closest('.smart-keyword');
            if (keywordSpan) {
                e.preventDefault();
                e.stopPropagation();
                const loreId = keywordSpan.getAttribute('data-lore-id');
                showLoreQuickviewById(loreId);
            }
        });
    }

    // Bind export wizard
    document.getElementById('btn-open-export-modal').addEventListener('click', openExportModal);
    document.getElementById('btn-export-select-all').addEventListener('click', () => {
        document.querySelectorAll('.export-chapter-chk').forEach(c => c.checked = true);
    });
    document.getElementById('btn-export-deselect-all').addEventListener('click', () => {
        document.querySelectorAll('.export-chapter-chk').forEach(c => c.checked = false);
    });
    document.getElementById('btn-submit-export').addEventListener('click', () => {
        const format = document.getElementById('export-format-select').value;
        const selectedChapterIds = [];
        document.querySelectorAll('.export-chapter-chk:checked').forEach(c => selectedChapterIds.push(c.value));
        if (selectedChapterIds.length === 0) {
            showToast(t('toast_select_chapters_export', 'Bitte wähle mindestens ein Kapitel für den Export aus.'), 'warning');
            return;
        }
        closeModal('modal-export');
        handleExport(format, selectedChapterIds);
    });

    // Project details Branch selection
    const branchSelect = document.getElementById('project-branch-select');
    if (branchSelect) {
        branchSelect.addEventListener('change', (e) => {
            state.activeLanguage = e.target.value;
            if (state.currentProject) {
                loadProjectDetails(state.currentProject.id);
            }
        });
    }

    // Project details Chapter Sorting Toggle
    const btnSort = document.getElementById('btn-sort-chapters');
    if (btnSort) {
        btnSort.addEventListener('click', () => {
            state.chapterSortOrder = state.chapterSortOrder === 'asc' ? 'desc' : 'asc';
            btnSort.textContent = state.chapterSortOrder === 'asc' ? 'Sortierung: ⬆️ Alt zuerst' : 'Sortierung: ⬇️ Neu zuerst';
            if (state.currentProject) {
                loadProjectDetails(state.currentProject.id);
            }
        });
    }

    const btnToggleCorkboard = document.getElementById('btn-toggle-corkboard');
    if (btnToggleCorkboard) {
        btnToggleCorkboard.addEventListener('click', () => {
            state.viewMode = state.viewMode === 'list' ? 'corkboard' : 'list';
            btnToggleCorkboard.textContent = state.viewMode === 'list' ? '📌 Korktafel' : '📝 Liste';
            if (state.currentProject) {
                loadProjectDetails(state.currentProject.id);
            }
        });
    }

    // Language Branch triggers
    document.getElementById('btn-create-language').addEventListener('click', () => openModal('modal-language'));
    document.getElementById('btn-submit-language').addEventListener('click', handleCreateLanguageBranch);
    
    // AI assistance triggers
    document.getElementById('btn-ai-correct').addEventListener('click', () => handleAIAssistant('correct'));
    document.getElementById('btn-ai-continue').addEventListener('click', () => {
        if (!state.currentProject || !state.currentChapter) return;
        // Open side panel
        const workspace = document.querySelector('.editor-workspace');
        const sidePanel = document.getElementById('editor-lore-panel');
        if (sidePanel) {
            sidePanel.style.display = 'flex';
            workspace.classList.add('editor-layout-split');
        }
        // Switch to AI tab
        switchSidePanelTab('ai');
    });
    
    // Manual Translate Trigger
    document.getElementById('btn-editor-translate-now').addEventListener('click', handleManualTranslate);

    // Import Wizard Launcher
    const btnOpenImport = document.getElementById('btn-open-import');
    if (btnOpenImport) {
        btnOpenImport.addEventListener('click', openImportWizard);
    }
    
    // Import Wizard Tab Switching
    document.getElementById('tab-import-folder').addEventListener('click', (e) => {
        document.getElementById('tab-import-folder').classList.add('active');
        document.getElementById('tab-import-file').classList.remove('active');
        document.getElementById('panel-import-folder').style.display = 'flex';
        document.getElementById('panel-import-file').style.display = 'none';
    });
    
    document.getElementById('tab-import-file').addEventListener('click', (e) => {
        document.getElementById('tab-import-file').classList.add('active');
        document.getElementById('tab-import-folder').classList.remove('active');
        document.getElementById('panel-import-file').style.display = 'flex';
        document.getElementById('panel-import-folder').style.display = 'none';
        
        // Populate existing projects list dropdown
        const projSelect = document.getElementById('import-file-target-project');
        projSelect.innerHTML = '';
        state.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.title;
            projSelect.appendChild(opt);
        });
    });
    
    // File Import Mode switcher
    document.querySelectorAll('input[name="import-file-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'project') {
                document.getElementById('panel-import-file-new-project').style.display = 'flex';
                document.getElementById('panel-import-file-exist-project').style.display = 'none';
            } else {
                document.getElementById('panel-import-file-new-project').style.display = 'none';
                document.getElementById('panel-import-file-exist-project').style.display = 'flex';
            }
        });
    });
    
    document.getElementById('btn-submit-import-wizard').addEventListener('click', handleImportWizardSubmit);

    // Stats configuration dialog triggers
    const btnEditStats = document.getElementById('btn-edit-project-stats');
    if (btnEditStats) {
        btnEditStats.addEventListener('click', () => {
            if (!state.currentProject) return;
            document.getElementById('stats-project-title').value = state.currentProject.title || "";
            document.getElementById('stats-project-author').value = state.currentProject.author || "";
            document.getElementById('stats-word-goal').value = state.currentProject.word_count_goal;
            document.getElementById('stats-daily-goal').value = state.currentProject.daily_word_count_goal;
            document.getElementById('stats-deadline-date').value = state.currentProject.deadline_date || "";
            document.getElementById('stats-original-language').value = state.currentProject.original_language || "de";
            openModal('modal-project-stats');
        });
    }
    
    document.getElementById('btn-submit-project-stats').addEventListener('click', handleSaveProjectStats);

    // Update checker trigger
    const btnCheckUpdate = document.getElementById('btn-check-update');
    if (btnCheckUpdate) {
        btnCheckUpdate.addEventListener('click', checkAppUpdates);
    }

    // Tab buttons inside the editor split panel
    const tabBtnLore = document.getElementById('tab-btn-lore');
    if (tabBtnLore) tabBtnLore.addEventListener('click', () => switchSidePanelTab('lore'));
    const tabBtnAi = document.getElementById('tab-btn-ai');
    if (tabBtnAi) tabBtnAi.addEventListener('click', () => switchSidePanelTab('ai'));

    // AI Chat submit & clear triggers
    const btnAiChatSubmit = document.getElementById('btn-ai-chat-submit');
    if (btnAiChatSubmit) btnAiChatSubmit.addEventListener('click', handleAIChatSubmit);
    const btnAiChatClear = document.getElementById('btn-ai-chat-clear');
    if (btnAiChatClear) btnAiChatClear.addEventListener('click', handleAIChatClear);

    // Project Details save button trigger
    const btnSaveDetails = document.getElementById('btn-save-project-details');
    if (btnSaveDetails) btnSaveDetails.addEventListener('click', handleSaveProjectDetails);

    // Hover popup trigger initialization
    setupLoreTooltip();

    // Relationships triggers
    const btnSaveRel = document.getElementById('btn-save-relationship');
    if (btnSaveRel) btnSaveRel.addEventListener('click', addRelationshipLink);
    const btnRelSaveLayout = document.getElementById('btn-relationships-save');
    if (btnRelSaveLayout) btnRelSaveLayout.addEventListener('click', saveRelationshipsLayout);
    const btnRelResetLayout = document.getElementById('btn-relationships-reset');
    if (btnRelResetLayout) btnRelResetLayout.addEventListener('click', resetRelationshipsLayout);

    // Nav menu items
    const navRel = document.getElementById('nav-relationships');
    if (navRel) {
        navRel.addEventListener('click', () => {
            if (state.currentProject) navigateTo('relationships');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navMindmap = document.getElementById('nav-mindmap');
    if (navMindmap) {
        navMindmap.addEventListener('click', () => {
            if (state.currentProject) navigateTo('mindmap');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navTimeline = document.getElementById('nav-timeline');
    if (navTimeline) {
        navTimeline.addEventListener('click', () => {
            if (state.currentProject) navigateTo('timeline');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navStats = document.getElementById('nav-stats');
    if (navStats) {
        navStats.addEventListener('click', () => {
            if (state.currentProject) navigateTo('stats');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navCorkboard = document.getElementById('nav-corkboard');
    if (navCorkboard) {
        navCorkboard.addEventListener('click', () => {
            if (state.currentProject) navigateTo('corkboard');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }
    const navSearch = document.getElementById('nav-search');
    if (navSearch) {
        navSearch.addEventListener('click', () => {
            if (state.currentProject) navigateTo('search');
            else {
                showToast(t('toast_select_project_first', 'Bitte wähle zuerst ein Projekt aus.'), 'warning');
                navigateTo('projects');
            }
        });
    }

    // Bug Report Button
    const btnReportBug = document.getElementById('btn-report-bug');
    if (btnReportBug) {
        btnReportBug.addEventListener('click', () => {
            const version = state.localVersion || "0.2.1.4";
            const userAgent = navigator.userAgent;
            const title = encodeURIComponent("[Bug] EmberNovels v" + version);
            const body = encodeURIComponent(
                "## Bug Beschreibung\n\n\n## Schritte zur Reproduktion\n1. \n2. \n3. \n\n## System-Informationen\n- App-Version: " + version + "\n- Browser UserAgent: " + userAgent + "\n"
            );
            window.open("https://github.com/MasterBurns/EmberNovels/issues/new?title=" + title + "&body=" + body, "_blank");
        });
    }

    // Sidebar pin and Zen buttons
    const btnPinLeft = document.getElementById('btn-pin-left-sidebar');
    if (btnPinLeft) btnPinLeft.addEventListener('click', toggleLeftSidebarPin);
    
    const btnPinRight = document.getElementById('btn-pin-right-sidebar');
    if (btnPinRight) btnPinRight.addEventListener('click', toggleRightSidebarPin);
    
    const btnZen = document.getElementById('btn-editor-zen');
    if (btnZen) btnZen.addEventListener('click', toggleZenMode);

    // Backup triggers
    const btnManualBackup = document.getElementById('btn-trigger-manual-backup');
    if (btnManualBackup) btnManualBackup.addEventListener('click', triggerManualBackup);
    
    const btnCloudBackup = document.getElementById('btn-trigger-cloud-backup');
    if (btnCloudBackup) btnCloudBackup.addEventListener('click', handleCloudBackup);

    // Timeline triggers
    const btnCreateTimeline = document.getElementById('btn-create-timeline-event');
    if (btnCreateTimeline) btnCreateTimeline.addEventListener('click', () => openTimelineEventForm());
    const btnSaveTimeline = document.getElementById('btn-save-timeline-event');
    if (btnSaveTimeline) btnSaveTimeline.addEventListener('click', saveTimelineEvent);
    const btnCancelTimeline = document.getElementById('btn-cancel-timeline-event');
    if (btnCancelTimeline) btnCancelTimeline.addEventListener('click', closeTimelineEventForm);

    // Search triggers
    const btnTriggerSearch = document.getElementById('btn-trigger-global-search');
    if (btnTriggerSearch) btnTriggerSearch.addEventListener('click', performGlobalSearch);
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performGlobalSearch();
        });
    }

    // Relationship layout custom triggers
    const btnRelPhysics = document.getElementById('btn-relationships-physics');
    if (btnRelPhysics) btnRelPhysics.addEventListener('click', applyPhysicsLayout);
    const btnRelHierarchical = document.getElementById('btn-relationships-hierarchical');
    if (btnRelHierarchical) btnRelHierarchical.addEventListener('click', applyHierarchicalLayout);

    // Style Check tab & action triggers
    const tabBtnStyle = document.getElementById('tab-btn-style');
    if (tabBtnStyle) tabBtnStyle.addEventListener('click', () => switchSidePanelTab('style'));
    const btnRunStyleCheck = document.getElementById('btn-run-style-check');
    if (btnRunStyleCheck) btnRunStyleCheck.addEventListener('click', runStyleCheck);

    // Chapter settings trigger
    const btnChapterSettings = document.getElementById('btn-chapter-settings');
    if (btnChapterSettings) btnChapterSettings.addEventListener('click', openChapterSettingsModal);
    const btnSubmitChapterSettings = document.getElementById('btn-submit-chapter-settings');
    if (btnSubmitChapterSettings) btnSubmitChapterSettings.addEventListener('click', saveChapterSettings);

    // Versionsverlauf button triggers
    const btnEditorHistory = document.getElementById('btn-editor-history');
    if (btnEditorHistory) btnEditorHistory.addEventListener('click', openHistoryModal);
    
    const btnCopyWebnovel = document.getElementById('btn-editor-copy-webnovel');
    if (btnCopyWebnovel) btnCopyWebnovel.addEventListener('click', handleCopyForWebnovel);
    
    const btnTypography = document.getElementById('btn-editor-typography');
    if (btnTypography) btnTypography.addEventListener('click', handleCleanTypography);

    const btnCreateSnapManual = document.getElementById('btn-create-snapshot-manual');
    if (btnCreateSnapManual) btnCreateSnapManual.addEventListener('click', createManualSnapshot);
    const btnRestoreSnapSelected = document.getElementById('btn-restore-snapshot-selected');
    if (btnRestoreSnapSelected) btnRestoreSnapSelected.addEventListener('click', restoreSelectedSnapshot);

    // Volume creation trigger
    const btnCreateVolume = document.getElementById('btn-create-volume');
    if (btnCreateVolume) {
        btnCreateVolume.addEventListener('click', () => {
            showPrompt("Neuen Band erstellen", "Titel des neuen Bandes:", "", async (title) => {
                if (title && title.trim()) {
                    const volumes = state.currentProject.volumes || [];
                    const volId = 'vol_' + Math.random().toString(36).substr(2, 9);
                    volumes.push({ id: volId, title: title.trim() });
                    await updateProjectMetadataDirectly({ volumes });
                    loadProjectDetails(state.currentProject.id);
                }
            });
        });
    }

    // Search and Replace triggers
    const btnOpenSearchReplace = document.getElementById('btn-open-search-replace');
    if (btnOpenSearchReplace) btnOpenSearchReplace.addEventListener('click', () => openModal('modal-search-replace'));
    
    const btnSubmitSearchReplace = document.getElementById('btn-submit-search-replace');
    if (btnSubmitSearchReplace) btnSubmitSearchReplace.addEventListener('click', handleSearchReplace);

    // Wiki auto scan trigger
    const btnWikiScan = document.getElementById('btn-wiki-scan');
    if (btnWikiScan) {
        btnWikiScan.addEventListener('click', async () => {
            if (!state.currentProject) return;
            btnWikiScan.disabled = true;
            const originalText = btnWikiScan.textContent;
            btnWikiScan.textContent = "Scanne...";
            showToast("Projekt wird nach Lore-Informationen gescannt...", "info");
            try {
                const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/lore/auto-scan`, {
                    method: 'POST'
                });
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "Scan fehlgeschlagen.");
                }
                const result = await response.json();
                showToast(result.message, "success");
                await loadWikiData();
                
                let allSuggestions = [];
                if (result.created_entries && result.created_entries.length > 0) {
                    result.created_entries.forEach(lore => {
                        const combinedText = (lore.short_description || '') + '\n' + (lore.description || '');
                        const sugs = extractTimepointsFromText(combinedText);
                        sugs.forEach(s => {
                            s.lore_id = lore.id;
                            s.lore_name = lore.name;
                            allSuggestions.push(s);
                        });
                    });
                }
                
                if (allSuggestions.length > 0) {
                    setTimeout(() => showTimelineSuggestionsModal(allSuggestions), 300);
                }
            } catch (e) {
                showToast("Fehler beim Lore-Scan: " + e.message, "danger");
            } finally {
                btnWikiScan.disabled = false;
                btnWikiScan.textContent = originalText;
            }
        });
    }
}


