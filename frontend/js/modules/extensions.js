// ==========================================
// G. DYNAMIC EXTENSIONS & FEATURE SET v0.2.1.4
// ==========================================

let physicsInterval = null;

function applyPhysicsLayout() {
    if (!state.relationships || !state.relationships.nodes) return;
    
    if (physicsInterval) {
        clearInterval(physicsInterval);
        physicsInterval = null;
    }
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    if (characters.length === 0) return;
    
    const nodes = characters.map(c => {
        const pos = state.relationships.nodes[c.id] || { x: 350, y: 250 };
        return {
            id: c.id,
            x: pos.x,
            y: pos.y,
            vx: 0,
            vy: 0
        };
    });
    
    const links = state.relationships.links.map(link => {
        return {
            source: link.source,
            target: link.target
        };
    });
    
    const width = 700;
    const height = 500;
    const padding = 50;
    
    const kRepulsion = 8000;
    const kSpring = 0.04;
    const desiredD = 120;
    const damping = 0.85;
    
    let ticks = 0;
    
    physicsInterval = setInterval(() => {
        ticks++;
        if (ticks > 150) {
            clearInterval(physicsInterval);
            physicsInterval = null;
            saveRelationshipsLayout(true);
            return;
        }
        
        for (let i = 0; i < nodes.length; i++) {
            const n1 = nodes[i];
            for (let j = i + 1; j < nodes.length; j++) {
                const n2 = nodes[j];
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const distSq = dx * dx + dy * dy + 1;
                const dist = Math.sqrt(distSq);
                
                const force = kRepulsion / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                n1.vx -= fx;
                n1.vy -= fy;
                n2.vx += fx;
                n2.vy += fy;
            }
        }
        
        links.forEach(link => {
            const n1 = nodes.find(n => n.id === link.source);
            const n2 = nodes.find(n => n.id === link.target);
            if (n1 && n2) {
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dist = Math.hypot(dx, dy) || 1;
                
                const force = (dist - desiredD) * kSpring;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                n1.vx += fx;
                n1.vy += fy;
                n2.vx -= fx;
                n2.vy -= fy;
            }
        });
        
        nodes.forEach(n => {
            const dx = 350 - n.x;
            const dy = 250 - n.y;
            n.vx += dx * 0.005;
            n.vy += dy * 0.005;
        });
        
        nodes.forEach(n => {
            n.x += n.vx;
            n.y += n.vy;
            
            n.vx *= damping;
            n.vy *= damping;
            
            n.x = Math.max(padding, Math.min(width - padding, n.x));
            n.y = Math.max(padding, Math.min(height - padding, n.y));
            
            state.relationships.nodes[n.id] = { x: n.x, y: n.y };
        });
        
        drawRelationships();
    }, 20);
}

function applyHierarchicalLayout() {
    if (!state.relationships || !state.relationships.nodes) return;
    
    if (physicsInterval) {
        clearInterval(physicsInterval);
        physicsInterval = null;
    }
    
    const characters = state.loreList.filter(entry => entry.category === 'character');
    if (characters.length === 0) return;
    
    const nodes = characters.map(c => c.id);
    const links = state.relationships.links;
    
    const adj = {};
    const inDegree = {};
    nodes.forEach(id => {
        adj[id] = [];
        inDegree[id] = 0;
    });
    
    links.forEach(link => {
        if (adj[link.source] && adj[link.target] !== undefined) {
            adj[link.source].push(link.target);
            inDegree[link.target]++;
        }
    });
    
    const levels = {};
    const queue = [];
    const visited = new Set();
    
    const startNodes = nodes.filter(id => inDegree[id] === 0);
    if (startNodes.length > 0) {
        startNodes.forEach(id => {
            levels[id] = 0;
            queue.push(id);
            visited.add(id);
        });
    } else {
        const fallback = nodes[0];
        levels[fallback] = 0;
        queue.push(fallback);
        visited.add(fallback);
    }
    
    while (queue.length > 0) {
        const curr = queue.shift();
        const currLevel = levels[curr];
        
        adj[curr].forEach(neighbor => {
            if (!visited.has(neighbor)) {
                levels[neighbor] = currLevel + 1;
                queue.push(neighbor);
                visited.add(neighbor);
            }
        });
    }
    
    nodes.forEach(id => {
        if (!visited.has(id)) {
            levels[id] = 0;
            const subQueue = [id];
            visited.add(id);
            while (subQueue.length > 0) {
                const curr = subQueue.shift();
                const currLevel = levels[curr];
                adj[curr].forEach(neighbor => {
                    if (!visited.has(neighbor)) {
                        levels[neighbor] = currLevel + 1;
                        subQueue.push(neighbor);
                        visited.add(neighbor);
                    }
                });
            }
        }
    });
    
    const groups = {};
    nodes.forEach(id => {
        const lvl = levels[id] || 0;
        if (!groups[lvl]) groups[lvl] = [];
        groups[lvl].push(id);
    });
    
    const levelsList = Object.keys(groups).map(Number).sort((a, b) => a - b);
    const maxLvl = levelsList.length - 1;
    
    const canvasWidth = 700;
    const canvasHeight = 500;
    
    levelsList.forEach((lvl, lvlIdx) => {
        const lvlNodes = groups[lvl];
        const y = lvlIdx * (canvasHeight / (maxLvl + 2)) + (canvasHeight / (maxLvl + 2));
        
        lvlNodes.forEach((nodeId, nodeIdx) => {
            const x = (nodeIdx + 1) * (canvasWidth / (lvlNodes.length + 1));
            state.relationships.nodes[nodeId] = { x, y };
        });
    });
    
    drawRelationships();
    saveRelationshipsLayout(true);
}

const FILLER_WORDS = new Set([
    'eigentlich', 'wohl', 'halt', 'gewissermaßen', 'nämlich', 'sozusagen', 
    'eh', 'ja', 'doch', 'mal', 'schon', 'eben', 'gerade', 'einfach', 
    'irgendwie', 'quasi', 'praktisch', 'überhaupt'
]);

function runStyleCheck() {
    if (!state.editor) return;
    
    const text = state.editor.getMarkdown();
    const resultsContainer = document.getElementById('style-check-results');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';
    
    const suggestions = [];
    
    // Heuristic Syllable counter
    const countSyllables = (word, lang) => {
        word = word.toLowerCase().replace(/[^a-zäöüßéèàùâêîôûœæ]/g, '');
        if (word.length <= 3) return 1;
        let count = (word.match(/[aeiouyäöüéèàùâêîôûœæ]+/g) || []).length;
        if (lang === 'en') {
            if (word.endsWith('e')) count--;
            if (word.endsWith('le') && !/[aeiouy]/.test(word.charAt(word.length - 3))) count++;
        }
        return Math.max(1, count);
    };
    
    // 1. Analyze readability and sentences
    const sentenceRegex = /([^.!?\n]+[.!?\n]+)/g;
    let sentenceCount = 0;
    let wordCount = 0;
    let syllableCount = 0;
    const sentences = [];
    let sMatch;
    
    while ((sMatch = sentenceRegex.exec(text)) !== null) {
        const sentenceText = sMatch[1];
        const startIndex = sMatch.index;
        const cleanWords = sentenceText.trim().split(/\s+/).filter(w => w.replace(/[^a-zA-ZäöüÄÖÜß]/g, '').length > 0);
        
        if (cleanWords.length > 0) {
            sentenceCount++;
            wordCount += cleanWords.length;
            
            cleanWords.forEach(w => {
                const syl = countSyllables(w, state.activeLanguage || 'de');
                syllableCount += syl;
            });
            
            sentences.push({
                text: sentenceText,
                startIndex,
                length: sentenceText.length,
                wordCount: cleanWords.length
            });
        }
    }
    
    // Fallback if no proper punctuation is used
    if (wordCount === 0) {
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        wordCount = words.length;
        sentenceCount = 1;
        words.forEach(w => {
            syllableCount += countSyllables(w, state.activeLanguage || 'de');
        });
    }
    
    const asl = sentenceCount > 0 ? (wordCount / sentenceCount) : 0;
    const asw = wordCount > 0 ? (syllableCount / wordCount) : 0;
    
    // Calculate Flesch Score
    let fleschScore = 100;
    if (wordCount > 0) {
        if (state.activeLanguage === 'en') {
            fleschScore = 206.835 - (1.015 * asl) - (84.6 * asw);
        } else {
            fleschScore = 180 - asl - (58.5 * asw);
        }
    }
    fleschScore = Math.max(0, Math.min(100, Math.round(fleschScore)));
    
    let fleschRating = "Sehr leicht";
    let fleschColor = "#22c55e"; // green
    if (fleschScore < 30) {
        fleschRating = "Sehr schwer (Akademiker)";
        fleschColor = "#ef4444"; // red
    } else if (fleschScore < 50) {
        fleschRating = "Schwer (Sekundarstufe II)";
        fleschColor = "#f97316"; // orange
    } else if (fleschScore < 60) {
        fleschRating = "Etwas schwer";
        fleschColor = "#eab308"; // yellow
    } else if (fleschScore < 70) {
        fleschRating = "Mittelschwer / Standard";
        fleschColor = "#3b82f6"; // blue
    } else if (fleschScore < 80) {
        fleschRating = "Mittelleicht";
        fleschColor = "#06b6d4"; // cyan
    } else if (fleschScore < 90) {
        fleschRating = "Leicht";
        fleschColor = "#10b981"; // emerald
    }
    
    // 2. Scan for duplicate consecutive words
    const duplicateRegex = /\b(\w+)\b[\s,.;:!?/-]+\b\1\b/gi;
    let match;
    while ((match = duplicateRegex.exec(text)) !== null) {
        const fullMatch = match[0];
        const firstWord = fullMatch.split(/[\s,.;:!?/-]+/)[0];
        const startIndex = match.index;
        
        suggestions.push({
            type: 'duplicate',
            title: `Doppeltes Wort: "${firstWord}"`,
            description: `Das Wort "${firstWord}" kommt doppelt hintereinander vor.`,
            index: startIndex,
            length: fullMatch.length,
            badge: 'Wiederholung'
        });
    }
    
    // 3. Scan for filler words
    const fillerRegex = /\b(\w+)\b/gi;
    while ((match = fillerRegex.exec(text)) !== null) {
        const word = match[1];
        if (FILLER_WORDS.has(word.toLowerCase())) {
            const startIndex = match.index;
            suggestions.push({
                type: 'filler',
                title: `Füllwort: "${word}"`,
                description: `Das Wort "${word}" schwächt den Satz eventuell ab. Überlege, es zu löschen oder zu ersetzen.`,
                index: startIndex,
                length: word.length,
                badge: 'Füllwort'
            });
        }
    }
    
    // 4. Highlight long sentences (> 25 words)
    sentences.forEach(s => {
        if (s.wordCount > 25) {
            suggestions.push({
                type: 'long-sentence',
                title: `Langer Satz (${s.wordCount} Wörter)`,
                description: `Dieser Satz ist recht lang und verschachtelt. Versuche, ihn aufzuteilen, um den Lesefluss zu verbessern.`,
                index: s.startIndex,
                length: s.length,
                badge: 'Langer Satz'
            });
        }
    });
    
    // 5. Highlight passive voice
    const passiveRegex = (state.activeLanguage === 'en') ? /\b(is|was|were|been|be)\b/gi : /\b(wurde|wurden|werde|werden|wird|worden)\b/gi;
    while ((match = passiveRegex.exec(text)) !== null) {
        const word = match[1];
        const startIndex = match.index;
        suggestions.push({
            type: 'passive',
            title: `Passiv-Hilfsverb: "${word}"`,
            description: `Dieser Satz nutzt eventuell eine Passiv-Konstruktion. Aktive Verben wirken oft lebendiger.`,
            index: startIndex,
            length: word.length,
            badge: 'Passiv'
        });
    }
    
    suggestions.sort((a, b) => a.index - b.index);
    
    // Draw Summary Card
    const summaryCard = document.createElement('div');
    summaryCard.style.padding = '14px';
    summaryCard.style.border = '1px solid var(--border-color)';
    summaryCard.style.borderRadius = '12px';
    summaryCard.style.backgroundColor = 'var(--bg-surface)';
    summaryCard.style.display = 'flex';
    summaryCard.style.flexDirection = 'column';
    summaryCard.style.gap = '8px';
    summaryCard.style.marginBottom = '16px';
    summaryCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Lesbarkeitsindex (Flesch)</span>
            <strong style="font-size: 20px; color: ${fleschColor};">${fleschScore}</strong>
        </div>
        <div style="font-size: 12px; color: var(--text-base); font-weight: 500;">Stufe: <span style="color: ${fleschColor};">${fleschRating}</span></div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; border-top: 1px solid var(--border-color); padding-top: 8px; color: var(--text-muted);">
            <span>Sätze: ${sentenceCount}</span>
            <span>Wörter: ${wordCount}</span>
            <span>Ø Satzlänge: ${asl.toFixed(1)} W.</span>
        </div>
    `;
    resultsContainer.appendChild(summaryCard);
    
    if (suggestions.length === 0) {
        const noAlerts = document.createElement('div');
        noAlerts.style.textAlign = 'center';
        noAlerts.style.color = 'var(--color-success)';
        noAlerts.style.fontSize = '13px';
        noAlerts.style.padding = '20px';
        noAlerts.style.fontWeight = '600';
        noAlerts.textContent = '✓ Keine Stilauffälligkeiten gefunden!';
        resultsContainer.appendChild(noAlerts);
        return;
    }
    
    suggestions.forEach(sug => {
        const card = document.createElement('div');
        card.style.padding = '12px';
        card.style.border = '1px solid var(--border-color)';
        card.style.borderRadius = '8px';
        card.style.backgroundColor = 'var(--bg-base)';
        card.style.cursor = 'pointer';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '4px';
        card.style.transition = 'background-color 0.2s';
        card.style.marginBottom = '8px';
        
        card.addEventListener('mouseenter', () => {
            card.style.backgroundColor = 'var(--bg-surface)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.backgroundColor = 'var(--bg-base)';
        });
        
        card.addEventListener('click', () => {
            highlightWordInEditor(sug.index, sug.length);
        });
        
        let badgeColor = 'var(--text-muted)';
        let badgeBg = 'rgba(241, 245, 249, 0.1)';
        if (sug.type === 'duplicate') {
            badgeColor = 'var(--color-primary)';
            badgeBg = 'var(--color-primary-light)';
        } else if (sug.type === 'long-sentence') {
            badgeColor = '#f97316';
            badgeBg = 'rgba(249, 115, 22, 0.15)';
        } else if (sug.type === 'passive') {
            badgeColor = '#3b82f6';
            badgeBg = 'rgba(59, 130, 246, 0.15)';
        }
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 13px; color: var(--text-base);">${escapeHtml(sug.title)}</strong>
                <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: ${badgeColor}; background-color: ${badgeBg};">${sug.badge}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">${escapeHtml(sug.description)}</div>
        `;
        
        resultsContainer.appendChild(card);
    });
}

function highlightWordInEditor(startIndex, wordLength) {
    if (!state.editor) return;
    
    const text = state.editor.getMarkdown();
    const beforeText = text.substring(0, startIndex);
    
    const linesBefore = beforeText.split('\n');
    const startLine = linesBefore.length;
    const startCol = linesBefore[linesBefore.length - 1].length;
    
    const matchText = text.substring(startIndex, startIndex + wordLength);
    const linesMatch = matchText.split('\n');
    const endLine = startLine + linesMatch.length - 1;
    const endCol = linesMatch.length > 1 ? linesMatch[linesMatch.length - 1].length : startCol + wordLength;
    
    state.editor.focus();
    
    if (typeof state.editor.setSelection === 'function') {
        state.editor.setSelection([startLine, startCol], [endLine, endCol]);
    } else if (state.editor.state && state.editor.state.editor) {
        state.editor.state.editor.setSelection([startLine, startCol], [endLine, endCol]);
    }
}

async function updateProjectMetadataDirectly(updates) {
    if (!state.currentProject) return;
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (response.ok) {
            const data = await response.json();
            state.currentProject = data;
        }
    } catch (e) {
        console.error("Failed to update project metadata", e);
    }
}

function openChapterSettingsModal() {
    if (!state.currentProject || !state.currentChapter) return;
    
    const select = document.getElementById('chapter-settings-volume');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Keinem Band zugeordnet --</option>';
    
    const volumes = state.currentProject.volumes || [];
    volumes.forEach(vol => {
        const opt = document.createElement('option');
        opt.value = vol.id;
        opt.textContent = vol.title;
        select.appendChild(opt);
    });
    
    const mapping = state.currentProject.chapters_volume_mapping || {};
    select.value = mapping[state.currentChapter.id] || "";
    
    openModal('modal-chapter-settings');
}

async function saveChapterSettings() {
    if (!state.currentProject || !state.currentChapter) return;
    
    const select = document.getElementById('chapter-settings-volume');
    if (!select) return;
    
    const mapping = state.currentProject.chapters_volume_mapping || {};
    if (select.value) {
        mapping[state.currentChapter.id] = select.value;
    } else {
        delete mapping[state.currentChapter.id];
    }
    
    await updateProjectMetadataDirectly({ chapters_volume_mapping: mapping });
    closeModal('modal-chapter-settings');
    showToast("Kapitel-Einstellungen gespeichert!", "success");
    loadProjectDetails(state.currentProject.id);
}

function updateEditorNavigation() {
    if (!state.currentProject || !state.currentChapter) return;
    
    const chapters = state.currentProject.chapters || [];
    const index = chapters.findIndex(c => c.id === state.currentChapter.id);
    
    const prevBtn = document.getElementById('btn-editor-prev-chapter');
    const nextBtn = document.getElementById('btn-editor-next-chapter');
    const titleSpan = document.getElementById('editor-nav-current-chapter-title');
    
    if (titleSpan) titleSpan.textContent = state.currentChapter.title || state.currentChapter.id;
    
    if (prevBtn) {
        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        if (index > 0) {
            newPrevBtn.disabled = false;
            newPrevBtn.style.opacity = '1';
            newPrevBtn.style.cursor = 'pointer';
            newPrevBtn.addEventListener('click', () => navigateToChapter(chapters[index - 1].id));
        } else {
            newPrevBtn.disabled = true;
            newPrevBtn.style.opacity = '0.5';
            newPrevBtn.style.cursor = 'not-allowed';
        }
    }
    
    if (nextBtn) {
        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        if (index >= 0 && index < chapters.length - 1) {
            newNextBtn.disabled = false;
            newNextBtn.style.opacity = '1';
            newNextBtn.style.cursor = 'pointer';
            newNextBtn.addEventListener('click', () => navigateToChapter(chapters[index + 1].id));
        } else {
            newNextBtn.disabled = true;
            newNextBtn.style.opacity = '0.5';
            newNextBtn.style.cursor = 'not-allowed';
        }
    }
}

async function navigateToChapter(chapterId) {
    if (!state.currentProject) return;
    
    if (typeof handleExplicitSave === 'function') {
        await handleExplicitSave();
    }
    
    navigateTo('editor', { projectId: state.currentProject.id, chapterId });
}

