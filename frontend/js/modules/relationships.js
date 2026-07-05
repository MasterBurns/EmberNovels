// ==========================================
// F. CHARACTER RELATIONSHIPS NETWORK HELPERS
// ==========================================

async function loadRelationshipsData() {
    if (!state.currentProject) return;
    
    const char1Select = document.getElementById('rel-char-1');
    const char2Select = document.getElementById('rel-char-2');
    if (!char1Select || !char2Select) return;
    
    char1Select.innerHTML = '';
    char2Select.innerHTML = '';
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    
    if (characters.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "-- Keine Charaktere im Lore-Wiki --";
        char1Select.appendChild(opt.cloneNode(true));
        char2Select.appendChild(opt);
    } else {
        characters.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            char1Select.appendChild(opt.cloneNode(true));
            char2Select.appendChild(opt);
        });
    }
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/relationships`);
        if (!response.ok) throw new Error("Could not load relationships");
        state.relationships = await response.json();
        
        if (!state.relationships.nodes) state.relationships.nodes = {};
        if (!state.relationships.links) state.relationships.links = [];
        
        let hasChanges = false;
        const radius = 180;
        const centerX = 350;
        const centerY = 250;
        
        characters.forEach((c, idx) => {
            if (!state.relationships.nodes[c.id]) {
                const angle = idx * (2 * Math.PI / Math.max(1, characters.length));
                state.relationships.nodes[c.id] = {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
                hasChanges = true;
            }
        });
        
        for (const nodeId in state.relationships.nodes) {
            if (!characters.some(c => c.id === nodeId)) {
                delete state.relationships.nodes[nodeId];
                hasChanges = true;
            }
        }
        
        if (hasChanges) {
            await saveRelationshipsLayout(true);
        }
        
        setupRelationshipsCanvasEvents();
        drawRelationships();
        refreshRelationshipsConnectionsList();
        
    } catch(e) {
        showToast("Fehler beim Laden des Beziehungsnetzwerkes: " + e.message, 'danger');
    }
}

function setupRelationshipsCanvasEvents() {
    const canvas = document.getElementById('relationships-canvas');
    if (!canvas) return;
    
    // Auto resize canvas width/height to matches clientWidth/clientHeight (prevents oval/egg-shaped stretching)
    canvas.width = canvas.clientWidth || 700;
    canvas.height = canvas.clientHeight || 500;
    
    const newCanvas = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    
    newCanvas.addEventListener('mousedown', handleRelationshipMouseDown);
    newCanvas.addEventListener('mousemove', handleRelationshipMouseMove);
    newCanvas.addEventListener('mouseup', handleRelationshipMouseUp);
    newCanvas.addEventListener('mouseleave', handleRelationshipMouseUp);
    newCanvas.addEventListener('dblclick', handleRelationshipDoubleClick);
    newCanvas.addEventListener('wheel', handleRelationshipWheel, { passive: false });
}

function handleRelationshipWheel(e) {
    e.preventDefault();
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(wheel * zoomIntensity);
    
    const newZoom = Math.min(Math.max(state.relationshipZoom * zoomFactor, 0.2), 4.0);
    
    // Adjust panning to zoom into the mouse pointer context
    state.relationshipPan.x = mouseX - (mouseX - state.relationshipPan.x) * (newZoom / state.relationshipZoom);
    state.relationshipPan.y = mouseY - (mouseY - state.relationshipPan.y) * (newZoom / state.relationshipZoom);
    state.relationshipZoom = newZoom;
    
    drawRelationships();
}

function handleRelationshipMouseDown(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
    const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    const nodeRadius = 45;
    
    let hitNodeId = null;
    for (let i = characters.length - 1; i >= 0; i--) {
        const c = characters[i];
        const coord = state.relationships.nodes[c.id];
        if (coord) {
            const dist = Math.hypot(worldX - coord.x, worldY - coord.y);
            if (dist <= nodeRadius) {
                hitNodeId = c.id;
                state.relationshipDragOffset = { x: worldX - coord.x, y: worldY - coord.y };
                break;
            }
        }
    }
    
    if (hitNodeId) {
        state.relationshipDragNode = hitNodeId;
        canvas.style.cursor = 'grabbing';
    } else {
        // Start background panning
        state.relationshipPanning = true;
        state.relationshipPanStart = { x: e.clientX - state.relationshipPan.x, y: e.clientY - state.relationshipPan.y };
        canvas.style.cursor = 'move';
    }
}

function handleRelationshipMouseMove(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (state.relationshipDragNode) {
        // Convert screen coordinates to world coordinates
        const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
        const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
        
        // Drag node inside boundary
        state.relationships.nodes[state.relationshipDragNode] = { 
            x: worldX - state.relationshipDragOffset.x, 
            y: worldY - state.relationshipDragOffset.y 
        };
        drawRelationships();
    } else if (state.relationshipPanning) {
        // Drag background camera
        state.relationshipPan = { 
            x: e.clientX - state.relationshipPanStart.x, 
            y: e.clientY - state.relationshipPanStart.y 
        };
        drawRelationships();
    } else {
        // Hover pointer cursor check
        const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
        const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
        const characters = state.loreList.filter(entry => entry.category === 'character');
        const nodeRadius = 45;
        let hover = false;
        for (const c of characters) {
            const coord = state.relationships.nodes[c.id];
            if (coord && Math.hypot(worldX - coord.x, worldY - coord.y) <= nodeRadius) {
                hover = true;
                break;
            }
        }
        canvas.style.cursor = hover ? 'pointer' : 'grab';
    }
}

function handleRelationshipMouseUp(e) {
    const canvas = e.target;
    if (state.relationshipDragNode) {
        state.relationshipDragNode = null;
        canvas.style.cursor = 'grab';
        saveRelationshipsLayout(true);
    }
    if (state.relationshipPanning) {
        state.relationshipPanning = false;
        canvas.style.cursor = 'grab';
    }
}

function handleRelationshipDoubleClick(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const worldX = (x - state.relationshipPan.x) / state.relationshipZoom;
    const worldY = (y - state.relationshipPan.y) / state.relationshipZoom;
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    const nodeRadius = 45;
    
    let hitNodeId = null;
    for (const c of characters) {
        const coord = state.relationships.nodes[c.id];
        if (coord) {
            const dist = Math.hypot(worldX - coord.x, worldY - coord.y);
            if (dist <= nodeRadius) {
                hitNodeId = c.id;
                break;
            }
        }
    }
    
    if (hitNodeId) {
        navigateTo('lore');
        setTimeout(() => showLoreDetail(hitNodeId), 150);
    } else {
        // Reset zoom and pan on background double click
        state.relationshipPan = { x: 0, y: 0 };
        state.relationshipZoom = 1.0;
        drawRelationships();
    }
}

function drawRelationships() {
    const canvas = document.getElementById('relationships-canvas');
    if (!canvas) return;
    
    // Auto resize canvas width/height to matches clientWidth/clientHeight (prevents oval/egg-shaped stretching)
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth || 700;
        canvas.height = canvas.clientHeight || 500;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save, translate & scale context for pan & zoom support
    ctx.save();
    ctx.translate(state.relationshipPan.x, state.relationshipPan.y);
    ctx.scale(state.relationshipZoom, state.relationshipZoom);
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    
    // 1. Draw Links
    state.relationships.links.forEach(link => {
        const n1 = state.relationships.nodes[link.source];
        const n2 = state.relationships.nodes[link.target];
        
        if (n1 && n2) {
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#64748b';
            ctx.stroke();
            
            if (link.dir === 'uni') {
                const angle = Math.atan2(n2.y - n1.y, n2.x - n1.x);
                const arrowLength = 12;
                const arrowX = n2.x - 46 * Math.cos(angle);
                const arrowY = n2.y - 46 * Math.sin(angle);
                
                ctx.beginPath();
                ctx.moveTo(arrowX, arrowY);
                ctx.lineTo(arrowX - arrowLength * Math.cos(angle - Math.PI/6), arrowY - arrowLength * Math.sin(angle - Math.PI/6));
                ctx.lineTo(arrowX - arrowLength * Math.cos(angle + Math.PI/6), arrowY - arrowLength * Math.sin(angle + Math.PI/6));
                ctx.closePath();
                ctx.fillStyle = '#64748b';
                ctx.fill();
            }
            
            const midX = (n1.x + n2.x) / 2;
            const midY = (n1.y + n2.y) / 2;
            
            ctx.font = '11px Outfit, Inter, sans-serif';
            const textWidth = ctx.measureText(link.label).width;
            
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(midX - textWidth/2 - 6, midY - 9, textWidth + 12, 18);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.strokeRect(midX - textWidth/2 - 6, midY - 9, textWidth + 12, 18);
            
            ctx.fillStyle = '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(link.label, midX, midY);
        }
    });
    
    // 2. Draw Nodes
    characters.forEach(c => {
        const coord = state.relationships.nodes[c.id];
        if (coord) {
            const nodeRadius = 45;
            
            ctx.beginPath();
            ctx.arc(coord.x, coord.y, nodeRadius, 0, 2 * Math.PI);
            
            const gradient = ctx.createRadialGradient(coord.x, coord.y, 5, coord.x, coord.y, nodeRadius);
            gradient.addColorStop(0, '#f97316');
            gradient.addColorStop(1, '#ea580c');
            
            ctx.fillStyle = gradient;
            ctx.fill();
            
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Outfit, Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let displayName = c.name;
            if (ctx.measureText(displayName).width > 76) {
                displayName = c.name.split(' ')[0];
                if (ctx.measureText(displayName).width > 76) {
                    displayName = displayName.substring(0, 8) + '...';
                }
            }
            ctx.fillText(displayName, coord.x, coord.y);
        }
    });
    
    // Restore transformation context state
    ctx.restore();
}

async function addRelationshipLink() {
    if (!state.currentProject) return;
    const char1 = document.getElementById('rel-char-1').value;
    const char2 = document.getElementById('rel-char-2').value;
    const typeLabel = document.getElementById('rel-type').value.trim();
    const isBidi = document.getElementById('rel-bidirectional').checked;
    
    if (!char1 || !char2 || !typeLabel) {
        showToast("Bitte wähle beide Charaktere aus und trage einen Beziehungstyp ein.", 'warning');
        return;
    }
    
    if (char1 === char2) {
        showToast("Ein Charakter kann keine Beziehung mit sich selbst haben.", 'warning');
        return;
    }
    
    const linkId = 'link_' + Math.random().toString(36).substr(2, 9);
    const newLink = {
        id: linkId,
        source: char1,
        target: char2,
        label: typeLabel,
        dir: isBidi ? 'bi' : 'uni'
    };
    
    state.relationships.links.push(newLink);
    
    await saveRelationshipsLayout();
    document.getElementById('rel-type').value = '';
    drawRelationships();
    refreshRelationshipsConnectionsList();
}

async function deleteRelationshipLink(linkId) {
    state.relationships.links = state.relationships.links.filter(l => l.id !== linkId);
    await saveRelationshipsLayout();
    drawRelationships();
    refreshRelationshipsConnectionsList();
}

async function saveRelationshipsLayout(silent = false) {
    if (!state.currentProject) return;
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/relationships`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.relationships)
        });
        
        if (!response.ok) throw new Error();
        if (!silent) {
            showToast("Beziehungsnetzwerk-Layout erfolgreich gespeichert!", 'success');
        }
    } catch(e) {
        if (!silent) {
            showToast("Fehler beim Speichern des Layouts", 'danger');
        }
    }
}

async function resetRelationshipsLayout() {
    if (!state.currentProject) return;
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    if (characters.length === 0) return;
    
    showConfirm(
        "Layout zurücksetzen",
        "Möchtest du die Anordnung aller Charaktere wirklich zurücksetzen? (Sie werden kreisförmig angeordnet)",
        async () => {
            const radius = 180;
            const centerX = 350;
            const centerY = 250;
            
            characters.forEach((c, idx) => {
                const angle = idx * (2 * Math.PI / characters.length);
                state.relationships.nodes[c.id] = {
                    x: centerX + radius * Math.cos(angle),
                    y: centerY + radius * Math.sin(angle)
                };
            });
            
            await saveRelationshipsLayout();
            drawRelationships();
        }
    );
}

function refreshRelationshipsConnectionsList() {
    const list = document.getElementById('relationships-connections-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (state.relationships.links.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px;">Keine aktiven Verbindungen.</div>`;
        return;
    }
    
    state.relationships.links.forEach(link => {
        const c1 = state.loreList.find(l => l.id === link.source);
        const c2 = state.loreList.find(l => l.id === link.target);
        
        if (c1 && c2) {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '8px 12px';
            
            const dirSymbol = link.dir === 'bi' ? '&harr;' : '&rarr;';
            item.innerHTML = `
                <div style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;">
                    <strong>${escapeHtml(c1.name)}</strong> <span style="color: var(--color-primary);">${dirSymbol}</span> <strong>${escapeHtml(c2.name)}</strong>
                    <br><span style="color: var(--text-muted); font-style: italic; font-size: 11px;">(${escapeHtml(link.label)})</span>
                </div>
                <button class="btn btn-secondary btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="deleteRelationshipLink('${link.id}')">🗑️</button>
            `;
            list.appendChild(item);
        }
    });
}

// Expose relationship helper window bindings
window.deleteRelationshipLink = deleteRelationshipLink;

