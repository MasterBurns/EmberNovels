// Timeline Management
async function loadTimelineData() {
    if (!state.currentProject) return;
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`);
        if (!response.ok) throw new Error("Could not load timeline");
        state.timelineEvents = await response.json();
        renderTimeline();
    } catch (e) {
        showToast("Fehler beim Laden der Zeitleiste: " + e.message, 'danger');
    }
}

function openTimelineEventForm(eventId = null) {
    const form = document.getElementById('timeline-form-container');
    form.style.display = 'flex';
    
    // Populate lore select dropdown
    const select = document.getElementById('timeline-event-lore');
    select.innerHTML = `<option value="">-- Keine Verknüpfung --</option>`;
    state.loreList.forEach(entry => {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = `${entry.name} (${translateCategory(entry.category)})`;
        select.appendChild(opt);
    });

    // Populate plotlines datalist
    const datalist = document.getElementById('timeline-plotline-datalist');
    if (datalist) {
        datalist.innerHTML = '';
        const uniquePlotlines = new Set();
        (state.timelineEvents || []).forEach(e => {
            if (e.plotline) uniquePlotlines.add(e.plotline);
        });
        uniquePlotlines.forEach(pl => {
            const opt = document.createElement('option');
            opt.value = pl;
            datalist.appendChild(opt);
        });
    }

    if (eventId) {
        const ev = state.timelineEvents.find(e => e.id === eventId);
        if (ev) {
            document.getElementById('timeline-event-id').value = ev.id;
            document.getElementById('timeline-event-title').value = ev.title;
            document.getElementById('timeline-event-date').value = ev.date;
            document.getElementById('timeline-event-plotline').value = ev.plotline || '';
            document.getElementById('timeline-event-desc').value = ev.desc || '';
            document.getElementById('timeline-event-lore').value = ev.lore_id || '';
        }
    } else {
        document.getElementById('timeline-event-id').value = '';
        document.getElementById('timeline-event-title').value = '';
        document.getElementById('timeline-event-date').value = '';
        document.getElementById('timeline-event-plotline').value = '';
        document.getElementById('timeline-event-desc').value = '';
        document.getElementById('timeline-event-lore').value = '';
    }
}

function closeTimelineEventForm() {
    document.getElementById('timeline-form-container').style.display = 'none';
}

async function saveTimelineEvent() {
    if (!state.currentProject) return;
    const title = document.getElementById('timeline-event-title').value.trim();
    const date = document.getElementById('timeline-event-date').value.trim();
    const plotline = document.getElementById('timeline-event-plotline').value.trim() || 'Hauptplot';
    const desc = document.getElementById('timeline-event-desc').value.trim();
    const lore_id = document.getElementById('timeline-event-lore').value;
    
    if (!title || !date) {
        showToast("Titel und Datum/Epoche sind erforderlich.", 'warning');
        return;
    }
    
    const id = document.getElementById('timeline-event-id').value || 'evt_' + Math.random().toString(36).substr(2, 9);
    
    const newEvent = { id, title, date, plotline, desc, lore_id };
    const existingIdx = state.timelineEvents.findIndex(e => e.id === id);
    
    if (existingIdx !== -1) {
        state.timelineEvents[existingIdx] = newEvent;
    } else {
        state.timelineEvents.push(newEvent);
    }
    
    try {
        const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.timelineEvents)
        });
        
        if (!response.ok) throw new Error("Failed to save timeline event");
        
        showToast("Ereignis gespeichert", "success");
        closeTimelineEventForm();
        renderTimeline();
    } catch (e) {
        showToast("Fehler beim Speichern des Ereignisses: " + e.message, "danger");
    }
}

async function deleteTimelineEvent(eventId) {
    if (!state.currentProject) return;
    showConfirm(
        "Ereignis löschen",
        "Möchtest du dieses Ereignis wirklich aus der Zeitleiste entfernen?",
        async () => {
            state.timelineEvents = state.timelineEvents.filter(e => e.id !== eventId);
            try {
                const response = await fetch(`${API_URL}/projects/${state.currentProject.id}/timeline`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(state.timelineEvents)
                });
                if (!response.ok) throw new Error();
                showToast("Ereignis gelöscht", "success");
                renderTimeline();
            } catch(e) {
                showToast("Löschen fehlgeschlagen", "danger");
            }
        }
    );
}

function renderTimeline() {
    const list = document.getElementById('timeline-events-list');
    const flow = document.getElementById('timeline-visual-flow');
    const chartContainer = document.getElementById('timeline-graphical-chart');
    
    list.innerHTML = '';
    flow.innerHTML = '';
    if (chartContainer) chartContainer.innerHTML = '';
    
    // Merge standard timeline events with Lore entries that have a timeline_date
    const loreEvents = (state.loreList || []).filter(l => l.timeline_date).map(l => ({
        id: l.id,
        is_lore: true,
        title: l.name,
        date: l.timeline_date,
        plotline: 'Lore / Weltenbau',
        desc: l.short_description || 'Lore-Eintrag',
        lore_id: l.id
    }));
    
    const displayEvents = [...(state.timelineEvents || []), ...loreEvents];

    if (displayEvents.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px;">Keine Ereignisse vorhanden.</div>`;
        flow.innerHTML = `<div style="color: var(--text-muted); font-style: italic;">Die Zeitleiste ist noch leer. Füge links Ereignisse hinzu!</div>`;
        if (chartContainer) {
            chartContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 20px;">Füge Ereignisse hinzu, um den Zeitstrahl zu zeichnen.</div>`;
        }
        return;
    }
    
    // 1. Draw SVG Plotlines Chart
    if (chartContainer) {
        const plotlines = Array.from(new Set(displayEvents.map(e => e.plotline || 'Hauptplot')));
        const plotlineEvents = {};
        plotlines.forEach(pl => plotlineEvents[pl] = []);
        displayEvents.forEach(ev => {
            const pl = ev.plotline || 'Hauptplot';
            plotlineEvents[pl].push(ev);
        });
        
        let maxEvents = 1;
        plotlines.forEach(pl => {
            maxEvents = Math.max(maxEvents, plotlineEvents[pl].length);
        });
        
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        const trackHeight = 70;
        const svgHeight = Math.max(160, 30 + plotlines.length * trackHeight);
        const svgWidth = Math.max(800, 150 + maxEvents * 170);
        
        svg.setAttribute("width", svgWidth);
        svg.setAttribute("height", svgHeight);
        svg.style.display = "block";
        
        const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#06b6d4"];
        
        plotlines.forEach((pl, plIdx) => {
            const y = 40 + plIdx * trackHeight;
            const color = colors[plIdx % colors.length];
            const events = plotlineEvents[pl];
            
            // Draw background track line
            const line = document.createElementNS(svgNS, "line");
            line.setAttribute("x1", "120");
            line.setAttribute("y1", y);
            line.setAttribute("x2", svgWidth - 40);
            line.setAttribute("y2", y);
            line.setAttribute("stroke", "var(--border-color)");
            line.setAttribute("stroke-width", "2");
            line.setAttribute("stroke-dasharray", "4,4");
            svg.appendChild(line);
            
            // Draw track label
            const label = document.createElementNS(svgNS, "text");
            label.setAttribute("x", "15");
            label.setAttribute("y", y + 4);
            label.setAttribute("font-size", "12");
            label.setAttribute("font-weight", "600");
            label.setAttribute("fill", "var(--text-base)");
            label.textContent = pl;
            svg.appendChild(label);
            
            // Connect nodes with a colored line
            if (events.length > 1) {
                const path = document.createElementNS(svgNS, "path");
                let pathD = "";
                events.forEach((ev, evIdx) => {
                    const x = 150 + evIdx * 170;
                    if (evIdx === 0) pathD += `M ${x} ${y}`;
                    else pathD += ` L ${x} ${y}`;
                });
                path.setAttribute("d", pathD);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", color);
                path.setAttribute("stroke-width", "3");
                svg.appendChild(path);
            }
            
            // Draw node circles & text
            events.forEach((ev, evIdx) => {
                const x = 150 + evIdx * 170;
                
                const group = document.createElementNS(svgNS, "g");
                group.setAttribute("cursor", "pointer");
                group.addEventListener("click", () => openTimelineEventForm(ev.id));
                
                // Circle
                const circle = document.createElementNS(svgNS, "circle");
                circle.setAttribute("cx", x);
                circle.setAttribute("cy", y);
                circle.setAttribute("r", "8");
                circle.setAttribute("fill", color);
                circle.setAttribute("stroke", "var(--bg-surface)");
                circle.setAttribute("stroke-width", "2");
                group.appendChild(circle);
                
                // Hover tooltip
                const titleNode = document.createElementNS(svgNS, "title");
                titleNode.textContent = `${ev.title} (${ev.date})\n${ev.desc || ''}`;
                group.appendChild(titleNode);
                
                // Date text
                const dateTxt = document.createElementNS(svgNS, "text");
                dateTxt.setAttribute("x", x);
                dateTxt.setAttribute("y", y - 14);
                dateTxt.setAttribute("text-anchor", "middle");
                dateTxt.setAttribute("font-size", "10");
                dateTxt.setAttribute("font-weight", "700");
                dateTxt.setAttribute("fill", "var(--color-primary)");
                dateTxt.textContent = ev.date;
                group.appendChild(dateTxt);
                
                // Title text
                const titleTxt = document.createElementNS(svgNS, "text");
                titleTxt.setAttribute("x", x);
                titleTxt.setAttribute("y", y + 20);
                titleTxt.setAttribute("text-anchor", "middle");
                titleTxt.setAttribute("font-size", "11");
                titleTxt.setAttribute("font-weight", "500");
                titleTxt.setAttribute("fill", "var(--text-base)");
                
                // Clip long titles
                let displayTitle = ev.title;
                if (displayTitle.length > 20) displayTitle = displayTitle.substring(0, 18) + "...";
                titleTxt.textContent = displayTitle;
                
                group.appendChild(titleTxt);
                svg.appendChild(group);
            });
        });
        
        chartContainer.appendChild(svg);
    }
    
    // 2. Populate Sidebar List & Vertical Flow
    displayEvents.forEach(ev => {
        // Sidebar list item
        const item = document.createElement('div');
        item.className = 'list-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '8px 12px';
        
        let controlsHtml = '';
        if (ev.is_lore) {
            controlsHtml = `<button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px;" onclick="navigateTo('lore'); showLoreDetail('${ev.id}')" title="In der Lore-Ansicht bearbeiten">📖</button>`;
        } else {
            controlsHtml = `
                <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px;" onclick="openTimelineEventForm('${ev.id}')">✏️</button>
                <button class="btn btn-secondary btn-danger" style="padding: 2px 6px; font-size: 11px;" onclick="deleteTimelineEvent('${ev.id}')">🗑️</button>
            `;
        }
        
        item.innerHTML = `
            <div style="font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">${escapeHtml(ev.title)}</div>
            <div style="display: flex; gap: 4px;">
                ${controlsHtml}
            </div>
        `;
        list.appendChild(item);
        
        // Visual flow card
        const card = document.createElement('div');
        card.className = 'timeline-card';
        
        let loreLinkHtml = '';
        if (ev.lore_id) {
            const entry = state.loreList.find(l => l.id === ev.lore_id);
            if (entry) {
                loreLinkHtml = `<div class="timeline-event-lore-link" onclick="showLoreQuickviewById('${entry.id}')">📖 Verknüpft: ${escapeHtml(entry.name)}</div>`;
            }
        }
        
        card.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-event-header">
                <div class="timeline-event-title">${escapeHtml(ev.title)}</div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <span style="font-size: 10px; background-color: var(--border-color); color: var(--text-secondary); padding: 2px 6px; border-radius: 4px; font-weight: 600;">${escapeHtml(ev.plotline || 'Hauptplot')}</span>
                    <span class="timeline-event-date">${escapeHtml(ev.date)}</span>
                </div>
            </div>
            <div class="timeline-event-desc">${escapeHtml(ev.desc || 'Keine Beschreibung vorhanden.')}</div>
            ${loreLinkHtml}
        `;
        flow.appendChild(card);
    });
}

