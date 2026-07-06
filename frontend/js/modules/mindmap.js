// ==========================================
// MINDMAP MANAGER LOGIC
// ==========================================
let mindmapNetwork = null;
let mindmapNodes = new vis.DataSet([]);
let mindmapEdges = new vis.DataSet([]);

async function loadMindmapData() {
    if (!state.currentProject) return;
    try {
        const res = await fetch(`/api/projects/${state.currentProject.id}/mindmap`);
        if (res.ok) {
            const data = await res.json();
            mindmapNodes.clear();
            mindmapEdges.clear();
            if (data.nodes) mindmapNodes.add(data.nodes);
            if (data.edges) mindmapEdges.add(data.edges);
        }
        initMindmapNetwork();
    } catch (e) {
        console.error("Mindmap load error", e);
    }
}

function initMindmapNetwork() {
    const container = document.getElementById('mindmap-network');
    const data = { nodes: mindmapNodes, edges: mindmapEdges };
    const options = {
        interaction: { hover: true, navigationButtons: true },
        manipulation: {
            enabled: true,
            initiallyActive: true,
            addNode: false, // We use our own modal
            addEdge: function (edgeData, callback) {
                if (edgeData.from === edgeData.to) {
                    callback(null); // No self-connections
                    return;
                }
                callback(edgeData);
            }
        },
        physics: {
            barnesHut: { gravitationalConstant: -2000, springLength: 150 }
        }
    };
    if (mindmapNetwork) mindmapNetwork.destroy();
    mindmapNetwork = new vis.Network(container, data, options);

    mindmapNetwork.on('doubleClick', async function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const node = mindmapNodes.get(nodeId);
            if (node.entityType && node.entityId) {
                if (node.entityType === 'character') {
                    navigateTo('characters');
                    setTimeout(() => openCharacterModal(node.entityId), 300);
                } else if (node.entityType === 'lore') {
                    navigateTo('lore');
                    setTimeout(() => openLoreModal(node.entityId), 300);
                } else if (node.entityType === 'chapter') {
                    navigateTo('chapters');
                    state.currentChapterId = node.entityId;
                    setTimeout(loadChapterList, 300);
                } else if (node.entityType === 'timeline') {
                    navigateTo('timeline');
                }
            }
        }
    });
}

const btnMindmapSave = document.getElementById('btn-mindmap-save');
if (btnMindmapSave) {
    btnMindmapSave.addEventListener('click', async () => {
        if (!state.currentProject) return;
        try {
            const data = {
                nodes: mindmapNodes.get(),
                edges: mindmapEdges.get()
            };
            const res = await fetch(`/api/projects/${state.currentProject.id}/mindmap`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if (res.ok) {
                showToast(t('mindmap_saved', 'Mindmap gespeichert'), "success");
            }
        } catch (e) {
            console.error(e);
            showToast(t('mindmap_save_error', 'Fehler beim Speichern der Mindmap'), "error");
        }
    });
}

const btnMindmapAddNode = document.getElementById('btn-mindmap-add-node');
if (btnMindmapAddNode) {
    btnMindmapAddNode.addEventListener('click', () => {
        document.getElementById('mindmap-node-label').value = '';
        document.getElementById('mindmap-node-type').value = 'custom';
        updateMindmapEntitySelect();
        openModal('modal-mindmap-node');
    });
}

const mindmapNodeType = document.getElementById('mindmap-node-type');
if (mindmapNodeType) {
    mindmapNodeType.addEventListener('change', updateMindmapEntitySelect);
}

async function updateMindmapEntitySelect() {
    const type = document.getElementById('mindmap-node-type').value;
    const customContainer = document.getElementById('mindmap-node-custom-container');
    const entityContainer = document.getElementById('mindmap-node-entity-container');
    const select = document.getElementById('mindmap-node-entity');
    select.innerHTML = '';

    if (type === 'custom') {
        customContainer.style.display = 'block';
        entityContainer.style.display = 'none';
    } else {
        customContainer.style.display = 'none';
        entityContainer.style.display = 'block';
        
        try {
            if (type === 'character') {
                const res = await fetch(`/api/projects/${state.currentProject.id}/lore`);
                if (res.ok) {
                    const lore = await res.json();
                    lore.filter(l => l.category === 'character').forEach(c => select.add(new Option(c.name, c.id)));
                }
            } else if (type === 'lore') {
                const res = await fetch(`/api/projects/${state.currentProject.id}/lore`);
                if (res.ok) {
                    const lore = await res.json();
                    lore.filter(l => l.category !== 'character').forEach(l => select.add(new Option(l.name, l.id)));
                }
            } else if (type === 'chapter') {
                const res = await fetch(`/api/projects/${state.currentProject.id}/chapters`);
                const chaps = await res.json();
                chaps.forEach(c => select.add(new Option(c.title, c.id)));
            } else if (type === 'timeline') {
                const res = await fetch(`/api/projects/${state.currentProject.id}/timeline`);
                const tl = await res.json();
                tl.forEach((t, i) => select.add(new Option(t.title || `Ereignis ${i+1}`, t.id || i)));
            }
        } catch (e) {
            console.error("Failed to fetch entities for mindmap", e);
        }
    }
}

const btnMindmapNodeSave = document.getElementById('btn-mindmap-node-save');
if (btnMindmapNodeSave) {
    btnMindmapNodeSave.addEventListener('click', () => {
        const type = document.getElementById('mindmap-node-type').value;
        let label = '';
        let entityId = null;

        if (type === 'custom') {
            label = document.getElementById('mindmap-node-label').value;
        } else {
            const select = document.getElementById('mindmap-node-entity');
            if (select.selectedIndex >= 0) {
                label = select.options[select.selectedIndex].text;
                entityId = select.value;
            }
        }

        if (!label) {
            showToast(t('mindmap_empty_warning', 'Bitte Beschriftung oder Element auswählen'), "warning");
            return;
        }

        let color = '#ea580c'; // default orange
        let iconHtml = '📝 ';
        if (type === 'character') { color = '#3b82f6'; iconHtml = '👥 '; }
        if (type === 'lore') { color = '#10b981'; iconHtml = '📖 '; }
        if (type === 'chapter') { color = '#8b5cf6'; iconHtml = '📚 '; }
        if (type === 'timeline') { color = '#f59e0b'; iconHtml = '⏳ '; }

        mindmapNodes.add({
            id: 'node_' + Date.now(),
            label: iconHtml + label,
            entityType: type,
            entityId: entityId,
            color: { background: color, border: '#ffffff' },
            font: { color: '#ffffff' },
            shape: 'box',
            shadow: true,
            margin: 10
        });

        closeModal('modal-mindmap-node');
    });
}


async function autoGenerateMindmap() {
    if (!state.currentProject) return;
    
    showToast("Generiere Mindmap...", "info");
    
    try {
        const loreRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/lore`);
        const loreData = await loreRes.json();
        
        const chRes = await fetch(`${API_URL}/projects/${state.currentProject.id}/chapters`);
        const chData = await chRes.json();
        
        mindmapNodes.clear();
        mindmapEdges.clear();
        
        const newNodes = [];
        const newEdges = [];
        
        // Add characters
        const chars = loreData.filter(l => l.category === 'character');
        chars.forEach(c => {
            newNodes.push({
                id: c.id,
                label: c.name || "Unbekannt",
                group: 'character',
                shape: 'dot',
                color: '#3b82f6',
                font: { color: '#e2e8f0' }
            });
            
            // Link character relations
            if (c.relations) {
                for (const [targetId, relType] of Object.entries(c.relations)) {
                    newEdges.push({
                        from: c.id,
                        to: targetId,
                        label: relType,
                        arrows: 'to',
                        color: { color: '#64748b' }
                    });
                }
            }
        });
        
        // Add locations
        const locs = loreData.filter(l => l.category === 'location');
        locs.forEach(l => {
            newNodes.push({
                id: l.id,
                label: l.name || "Unbekannt",
                group: 'location',
                shape: 'square',
                color: '#10b981',
                font: { color: '#e2e8f0' }
            });
        });
        
        // Add items
        const items = loreData.filter(l => l.category === 'item');
        items.forEach(i => {
            newNodes.push({
                id: i.id,
                label: i.name || "Unbekannt",
                group: 'item',
                shape: 'triangle',
                color: '#f59e0b',
                font: { color: '#e2e8f0' }
            });
        });
        
        // Add chapters
        chData.forEach(ch => {
            newNodes.push({
                id: 'ch_' + ch.id,
                label: ch.title,
                group: 'chapter',
                shape: 'box',
                color: '#8b5cf6',
                font: { color: '#ffffff' }
            });
            
            // If the chapter has detected lore, link them
            if (ch.metadata && ch.metadata.detected_lore) {
                ch.metadata.detected_lore.forEach(loreId => {
                    newEdges.push({
                        from: 'ch_' + ch.id,
                        to: loreId,
                        arrows: 'to',
                        color: { color: '#4c1d95' }
                    });
                });
            }
        });
        
        mindmapNodes.add(newNodes);
        mindmapEdges.add(newEdges);
        
        if (mindmapNetwork) {
            mindmapNetwork.fit();
        }
        
        showToast("Mindmap erfolgreich generiert!", "success");
    } catch(e) {
        showToast("Fehler bei der Mindmap-Generierung.", "error");
        console.error(e);
    }
}

function loadProjectModulesInForm() {
    const card = document.getElementById('settings-project-modules-card');
    const loreCard = document.getElementById('settings-lore-scanner-card');
    const container = document.getElementById('project-modules-list');
    
    if (!card || !container) return;
    
    if (!state.currentProject) {
        card.style.display = 'none';
        if (loreCard) loreCard.style.display = 'none';
        return;
    }
    
    card.style.display = 'flex';
    if (loreCard) loreCard.style.display = 'flex';
    
    container.innerHTML = '';
    
    const activeMods = state.currentProject.active_modules || [];
    
    ModuleManager.modules.forEach(mod => {
        if (mod.id === 'projects' || mod.alwaysProject) return;
        
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '10px';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'mod-toggle-' + mod.id;
        cb.checked = activeMods.includes(mod.id);
        
        cb.onchange = async () => {
            const isChecked = cb.checked;
            let newMods = [...(state.currentProject.active_modules || [])];
            
            if (isChecked && !newMods.includes(mod.id)) {
                newMods.push(mod.id);
            } else if (!isChecked && newMods.includes(mod.id)) {
                newMods = newMods.filter(m => m !== mod.id);
            }
            
            state.currentProject.active_modules = newMods;
            
            // Save to backend
            try {
                await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active_modules: newMods })
                });
                // Re-render sidebar immediately
                if (typeof ModuleManager !== 'undefined') ModuleManager.renderSidebar();
                showToast(t('toast_settings_saved', 'Gespeichert'), 'success');
            } catch (e) {
                console.error("Failed to save modules", e);
                showToast("Error", "error");
            }
        };
        
        const lbl = document.createElement('label');
        lbl.htmlFor = cb.id;
        lbl.style.cursor = 'pointer';
        lbl.style.display = 'flex';
        lbl.style.alignItems = 'center';
        lbl.style.gap = '8px';
        
        const iconSpan = document.createElement('span');
        iconSpan.textContent = mod.icon;
        
        const textSpan = document.createElement('span');
        textSpan.setAttribute('data-i18n', mod.labelKey);
        textSpan.textContent = window.t ? window.t(mod.labelKey, mod.labelKey) : mod.labelKey;
        
        lbl.appendChild(iconSpan);
        lbl.appendChild(textSpan);
        
        div.appendChild(cb);
        div.appendChild(lbl);
        container.appendChild(div);
    });
}
