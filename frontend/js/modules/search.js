// Global Search
function loadSearchData() {
    document.getElementById('global-search-input').value = '';
    document.getElementById('global-search-results').innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 32px;">
            Gib oben einen Suchbegriff ein und klicke auf Suchen.
        </div>
    `;
}

async function performGlobalSearch() {
    if (!state.currentProject) return;
    const searchTerm = document.getElementById('global-search-input').value.trim().toLowerCase();
    if (!searchTerm) {
        showToast("Bitte gib einen Suchbegriff ein.", "warning");
        return;
    }
    
    const resultsContainer = document.getElementById('global-search-results');
    resultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;">Suche läuft...</div>`;
    
    try {
        const promises = state.currentProject.chapters.map(async (ch) => {
            let url = `${API_URL}/projects/${state.currentProject.id}/chapters/${ch.id}`;
            if (state.activeLanguage !== 'original') {
                url = `${API_URL}/projects/${state.currentProject.id}/languages/${state.activeLanguage}/chapters/${ch.id}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                return { chapter: ch, content: data.content || '' };
            }
            return { chapter: ch, content: '' };
        });
        
        const loadedChapters = await Promise.all(promises);
        
        let html = '';
        let matchesCount = 0;
        
        // Search in chapters
        loadedChapters.forEach(({ chapter, content }) => {
            const idx = content.toLowerCase().indexOf(searchTerm);
            if (idx !== -1) {
                matchesCount++;
                const start = Math.max(0, idx - 40);
                const end = Math.min(content.length, idx + searchTerm.length + 40);
                const snippet = content.slice(start, end).replace(/\n/g, ' ');
                
                html += `
                    <div class="list-item" style="display: flex; flex-direction: column; gap: 8px; padding: 16px; align-items: flex-start;">
                        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                            <strong style="color: var(--color-primary);">${escapeHtml(chapter.title)}</strong>
                            <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="navigateTo('editor', { projectId: '${state.currentProject.id}', chapterId: '${chapter.id}' })">📖 Öffnen</button>
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); font-style: italic; background-color: var(--bg-base); padding: 8px; border-radius: 6px; width: 100%; border: 1px solid var(--border-color);">
                            ...${escapeHtml(snippet)}...
                        </div>
                    </div>
                `;
            }
        });
        
        // Search in lore
        state.loreList.forEach(entry => {
            const inName = entry.name.toLowerCase().includes(searchTerm);
            const inDesc = (entry.description || '').toLowerCase().includes(searchTerm);
            const inShort = (entry.short_description || '').toLowerCase().includes(searchTerm);
            
            if (inName || inDesc || inShort) {
                matchesCount++;
                const snippet = entry.short_description || entry.description || '';
                html += `
                    <div class="list-item" style="display: flex; flex-direction: column; gap: 8px; padding: 16px; align-items: flex-start;">
                        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                            <div>
                                <strong style="color: var(--color-primary);">${escapeHtml(entry.name)}</strong>
                                <span style="font-size: 10px; background-color: var(--color-primary-light); color: var(--color-primary); padding: 1px 4px; border-radius: 4px; margin-left: 8px; text-transform: uppercase;">${translateCategory(entry.category)}</span>
                             </div>
                             <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="navigateTo('lore'); setTimeout(() => showLoreDetail('${entry.id}'), 100)">📖 Wiki öffnen</button>
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); font-style: italic; background-color: var(--bg-base); padding: 8px; border-radius: 6px; width: 100%; border: 1px solid var(--border-color);">
                             ${escapeHtml(snippet.slice(0, 100))}...
                        </div>
                    </div>
                `;
            }
        });
        
        if (matchesCount === 0) {
            resultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;">Keine Treffer für "${escapeHtml(searchTerm)}" gefunden.</div>`;
        } else {
            resultsContainer.innerHTML = html;
        }
        
    } catch(e) {
        showToast("Suche fehlgeschlagen: " + e.message, 'danger');
    }
}

