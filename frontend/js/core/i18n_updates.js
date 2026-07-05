// ==========================================
// SYSTEM TRANSLATION (I18N) & UPDATE ENGINE
// ==========================================

// Translation lookup helper
function t(key, defaultValue) {
    if (state.translations && state.translations[key]) {
        return state.translations[key];
    }
    return defaultValue;
}

// Load selected translation JSON file and localize DOM elements
async function loadUiLanguage(lang) {
    try {
        const response = await fetch(`lang/${lang}.json`);
        if (!response.ok) throw new Error("Localization file not found");
        state.translations = await response.json();
        
        // Translate elements with data-i18n
        document.querySelectorAll('[data-i18n], [data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n') || el.getAttribute('data-i18n-html');
            const isHtml = el.hasAttribute('data-i18n-html');
            if (state.translations[key]) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = state.translations[key];
                } else {
                    if (isHtml) {
                        el.innerHTML = state.translations[key];
                    } else {
                        el.textContent = state.translations[key];
                    }
                }
            }
        });
        
        // Save choice
        localStorage.setItem('ember_ui_language', lang);
        state.uiLanguage = lang;
        
        // Update document lang
        document.documentElement.lang = lang;
        
    } catch (e) {
        console.error("Localization error:", e);
    }
}

// Check Raw GitHub repository version.json for updates
async function checkAppUpdates() {
    const btn = document.getElementById('btn-check-update');
    const panel = document.getElementById('update-status-panel');
    const msg = document.getElementById('update-status-msg');
    const notes = document.getElementById('update-release-notes');
    const triggerBtn = document.getElementById('btn-trigger-update');
    
    btn.disabled = true;
    btn.textContent = t('searching', 'Suche...');
    panel.style.display = 'flex';
    msg.textContent = t('searching_updates', 'Suche nach neuen Updates...');
    notes.textContent = '';
    triggerBtn.style.display = 'none';
    
    const currentVersion = state.localVersion || "0.2.1.4";
    
    try {
        // Fetch raw version.json from MasterBurns/EmberNovels raw endpoint
        const response = await fetch('https://raw.githubusercontent.com/MasterBurns/EmberNovels/master/version.json');
        if (!response.ok) throw new Error("Could not download updates list");
        const data = await response.json();
        
        const latestVersion = data.version || "0.2.1.4";
        const isNewer = compareVersions(latestVersion, currentVersion) > 0;
        
        if (isNewer) {
            msg.innerHTML = `<span style="color: var(--color-warning);">⚠️ ${t('update_available_prefix', 'Update verfügbar! Version')} ${latestVersion} ${t('update_available_suffix', 'ist jetzt online.')}</span>`;
            
            let notesText = '';
            if (data.release_notes) {
                if (typeof data.release_notes === 'object') {
                    notesText = data.release_notes[state.uiLanguage] || data.release_notes['en'] || data.release_notes['de'] || '';
                } else {
                    notesText = data.release_notes;
                }
            }
            notes.textContent = notesText || t('no_release_notes', 'Keine Update-Notizen vorhanden.');

            
            // Re-bind trigger click
            const newTriggerBtn = triggerBtn.cloneNode(true);
            triggerBtn.parentNode.replaceChild(newTriggerBtn, triggerBtn);
            newTriggerBtn.style.display = 'inline-block';
            newTriggerBtn.addEventListener('click', () => {
                showConfirm(
                    t('update_install_title', 'Update installieren'),
                    `Möchtest du das Update auf Version ${latestVersion} jetzt automatisch installieren lassen? EmberNovels startet danach automatisch neu.`,
                    async () => {
                        const style = document.createElement('style');
                        style.textContent = `
                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            @keyframes loading-bar {
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(350%); }
                            }
                        `;
                        document.head.appendChild(style);

                        const overlay = document.createElement('div');
                        overlay.id = 'update-fullscreen-overlay';
                        overlay.style = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(15, 23, 42, 0.98); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; color: white; font-family: sans-serif;';
                        overlay.innerHTML = `
                            <div style="font-size: 40px; animation: spin 2s linear infinite;">🔥</div>
                            <h2 style="margin: 0; font-size: 22px;">EmberNovels wird aktualisiert</h2>
                            <p style="margin: 0; color: #94a3b8; font-size: 14px;" id="update-overlay-status">Suche passende Paket-Datei...</p>
                            <div style="width: 250px; height: 6px; background-color: #1e293b; border-radius: 3px; overflow: hidden; border: 1px solid #334155;">
                                <div style="width: 30%; height: 100%; background-color: #f97316; animation: loading-bar 1.5s infinite ease-in-out;"></div>
                            </div>
                        `;
                        document.body.appendChild(overlay);

                        const statusText = document.getElementById('update-overlay-status');

                        try {
                            const releasesRes = await fetch('https://api.github.com/repos/MasterBurns/EmberNovels/releases/latest');
                            if (!releasesRes.ok) throw new Error("Konnte Release-Assets von GitHub nicht abfragen.");
                            const releaseData = await releasesRes.json();

                            const platform = navigator.userAgent.toLowerCase();
                            let targetAsset = null;

                            // If we are not compiled (running from source), we MUST download the zipball source code.
                            if (state.isCompiled === false) {
                                targetAsset = { name: "Quellcode (ZIP)", browser_download_url: releaseData.zipball_url };
                            } else {
                                if (platform.includes('win')) {
                                    targetAsset = releaseData.assets.find(a => a.name.includes('Windows') && a.name.endsWith('.zip'));
                                } else if (platform.includes('mac') || platform.includes('darwin')) {
                                    targetAsset = releaseData.assets.find(a => a.name.includes('macOS') || a.name.endsWith('.zip'));
                                } else if (platform.includes('linux')) {
                                    targetAsset = releaseData.assets.find(a => a.name.includes('Linux') && a.name.endsWith('.tar.gz'));
                                }
                                
                                if (!targetAsset) {
                                    // Fallback for source code installations
                                    targetAsset = { name: "Quellcode (ZIP)", browser_download_url: releaseData.zipball_url };
                                }
                            }

                            statusText.textContent = `Lade ${targetAsset.name} herunter...`;

                            const triggerRes = await fetch(`${API_URL}/update`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ download_url: targetAsset.browser_download_url })
                            });

                            if (!triggerRes.ok) {
                                const errData = await triggerRes.json();
                                throw new Error(errData.detail || "Server meldet Fehler beim Update-Start.");
                            }

                            statusText.textContent = "Server startet neu. Verbinde wieder...";

                            let pollCount = 0;
                            const pollInterval = setInterval(async () => {
                                pollCount++;
                                try {
                                    const verRes = await fetch('/api/version');
                                    if (verRes.ok) {
                                        const verData = await verRes.json();
                                        if (verData.version === latestVersion) {
                                            clearInterval(pollInterval);
                                            statusText.textContent = "Erfolgreich aktualisiert! Lade neu...";
                                            setTimeout(() => {
                                                location.reload();
                                            }, 1000);
                                        }
                                    }
                                } catch (e) {
                                    // Connection refused while restarting (expected)
                                }

                                if (pollCount > 80) {
                                    clearInterval(pollInterval);
                                    overlay.remove();
                                    showToast("Update-Verbindungstimeout. Bitte starte die Anwendung manuell neu.", "danger");
                                }
                            }, 1500);

                        } catch (err) {
                            overlay.remove();
                            showToast("Update fehlgeschlagen: " + err.message, "danger");
                        }
                    }
                );
            });
        } else {
            msg.innerHTML = `<span style="color: var(--color-success);">✨ ${t('app_up_to_date_prefix', 'EmberNovels ist auf dem neuesten Stand (Version')} ${currentVersion}).</span>`;
            notes.textContent = t('no_updates_available', 'Keine neuen Updates verfügbar.');
        }
    } catch(err) {
        msg.innerHTML = `<span style="color: var(--color-danger);">❌ ${t('error_checking_updates', 'Fehler beim Abfragen der Updates:')} ${err.message}</span>`;
        notes.textContent = t('check_connection_retry', 'Bitte überprüfe deine Internetverbindung oder versuche es später noch einmal.');
    } finally {
        btn.disabled = false;
        btn.textContent = t('about_update_check', 'Nach Updates suchen');
    }
}

// Compare semantic versions (e.g. 1.2.3 vs 1.2.4)
function compareVersions(a, b) {
    const pa = a.split('.');
    const pb = b.split('.');
    for (let i = 0; i < 4; i++) {
        const na = Number(pa[i] || 0);
        const nb = Number(pb[i] || 0);
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

