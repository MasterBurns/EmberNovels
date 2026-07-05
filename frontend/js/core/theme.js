// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('ember_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ember_theme', theme);
    
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (theme === 'dark') {
        themeIcon.textContent = '☀️';
        themeText.textContent = 'Light Mode';
    } else {
        themeIcon.textContent = '🌙';
        themeText.textContent = 'Dark Mode';
    }
    
    updateEditorTheme(theme);
}

function updateEditorTheme(theme) {
    if (!state.editor) return;
    const editorEl = document.querySelector('#editor-container .toastui-editor-defaultUI');
    if (editorEl) {
        if (theme === 'dark') {
            editorEl.classList.add('toastui-editor-theme-dark');
        } else {
            editorEl.classList.remove('toastui-editor-theme-dark');
        }
    }
}

