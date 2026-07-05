// On Document Load
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();

    // Failsafe: hide bootloader after 4 seconds no matter what
    setTimeout(() => {
        const bootloader = document.getElementById('app-bootloader');
        if (bootloader && bootloader.style.display !== 'none') {
            console.warn("Bootloader war zu lange sichtbar - Failsafe aktiviert!");
            bootloader.style.display = 'none';
            if (!document.querySelector('.active-view')) {
                navigateTo('projects');
            }
        }
    }, 4000);

    // Wait for backend to be ready before fetching data
    await waitForBackend();

    // Fetch global settings from backend
    try {
        const res = await fetch(`${API_URL}/settings`);
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.settings) {
                if (data.settings.ui_language) {
                    state.uiLanguage = data.settings.ui_language;
                    localStorage.setItem('ember_ui_language', state.uiLanguage);
                }
                if (data.settings.first_run_completed !== undefined) {
                    state.globalSettings.first_run_completed = data.settings.first_run_completed;
                }
                if (data.settings.tutorial_modules_seen !== undefined) {
                    state.globalSettings.tutorial_modules_seen = data.settings.tutorial_modules_seen;
                }
            }
        }
    } catch (e) {
        console.error("Failed to load global settings", e);
    }
    
    // Fallback if not loaded
    if (!state.uiLanguage) {
        state.uiLanguage = localStorage.getItem('ember_ui_language') || 'de';
    }

    await loadUiLanguage(state.uiLanguage);
    
    // Render sidebar dynamically
    if (typeof ModuleManager !== 'undefined') ModuleManager.renderSidebar();
    
    try {
        setupEventListeners();
    } catch (e) {
        console.error("Error in setupEventListeners:", e);
    }
    
    // Check first run for Language OOBE
    if (!state.globalSettings.first_run_completed) {
        document.getElementById('app-bootloader').style.display = 'none';
        runOobeLanguageSetup();
    } else {
        // Strictly await projects loading before unlocking the UI
        try {
            await loadProjects(0, true); // true = called from boot
        } catch (err) {
            console.error("Bootloader: Fehler beim Laden der Projekte", err);
        }
        document.getElementById('app-bootloader').style.display = 'none';
        navigateTo('projects');
    }

    // Check local settings for autosave interval
    const savedInterval = localStorage.getItem('ember_autosave_interval');
    if (savedInterval) {
        state.autosaveInterval = parseInt(savedInterval, 10) * 1000;
        const input = document.getElementById('setting-autosave-interval');
        if (input) input.value = savedInterval;
    }
});

function runOobeLanguageSetup() {
    // Show a modal to select language
    const modal = document.getElementById('modal-language');
    if (modal) {
        modal.style.display = 'flex';
        // Add a special listener to save global settings when done
        const btnSave = modal.querySelector('.btn-primary');
        if (btnSave) {
            const oldClick = btnSave.onclick;
            btnSave.onclick = async (e) => {
                if (oldClick) oldClick(e);
                state.globalSettings.first_run_completed = true;
                await fetch(`${API_URL}/settings`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        ui_language: state.uiLanguage,
                        first_run_completed: true 
                    })
                });
                navigateTo('projects');
            };
        }
    }
}

function runSidebarTutorial() {
    if (state.globalSettings.tutorial_modules_seen) return;
    
    // Show tutorial toast or overlay
    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML = `
        <div class="tutorial-box" style="position: absolute; top: 100px; left: 260px; background: var(--bg-sidebar); border: 2px solid var(--color-primary); padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 10000; width: 300px;">
            <h3 style="margin-top: 0;" data-i18n="tutorial_modules_title">Projekte anpassen</h3>
            <p data-i18n="tutorial_modules_desc">Du kannst in jedem Projekt unter <b>Einstellungen &gt; Projekt-Module</b> genau festlegen, welche Werkzeuge in der Seitenleiste angezeigt werden sollen!</p>
            <button class="btn btn-primary" id="btn-tutorial-close" style="width: 100%;" data-i18n="btn_understood">Verstanden</button>
        </div>
    `;
    document.body.appendChild(overlay);
    
    if (window.t) {
        overlay.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = window.t(el.getAttribute('data-i18n'), el.textContent);
        });
    }
    
    document.getElementById('btn-tutorial-close').addEventListener('click', async () => {
        document.body.removeChild(overlay);
        state.globalSettings.tutorial_modules_seen = true;
        await fetch(`${API_URL}/settings`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                ui_language: state.uiLanguage,
                tutorial_modules_seen: true 
            })
        });
    });
}

