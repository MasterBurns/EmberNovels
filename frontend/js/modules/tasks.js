window.TasksModule = {
    intervalId: null,

    init: function() {
        // Starte Polling
        this.startPolling();
        
        // Navigation Listener (falls Aufgaben-Fenster geöffnet ist, häufiger abfragen)
        // Aber hier reicht einfach alle 2 Sekunden global, da Backups/KI im Hintergrund laufen.
    },

    startPolling: function() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = setInterval(() => {
            this.fetchTasks();
        }, 2000);
        // Initial fetch
        this.fetchTasks();
    },

    fetchTasks: async function() {
        try {
            const res = await fetch(API_URL + '/tasks/');
            if (!res.ok) return;
            const tasks = await res.json();
            this.renderTasks(tasks);
            this.updateGlobalIndicators(tasks);
        } catch (e) {
            console.error("Fehler beim Abrufen der Prozesse:", e);
        }
    },

    renderTasks: function(tasks) {
        const container = document.getElementById('tasks-list');
        if (!container) return;

        if (!tasks || tasks.length === 0) {
            container.innerHTML = `
                <div style="padding: 24px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: 8px; border: 1px dashed var(--border-color);">
                    Aktuell laufen keine Prozesse.
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        tasks.forEach(task => {
            const isPaused = task.status === 'paused';
            const isRunning = task.status === 'running';
            const isDone = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled';
            
            const card = document.createElement('div');
            card.style.padding = '16px';
            card.style.background = 'var(--bg-surface)';
            card.style.borderRadius = '8px';
            card.style.border = '1px solid var(--border-color)';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '8px';

            let controlsHTML = '';
            if (!isDone) {
                controlsHTML = `
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        ${isRunning ? `<button class="btn btn-secondary btn-sm" onclick="TasksModule.pauseTask('${task.id}')">⏸ Pausieren</button>` : ''}
                        ${isPaused ? `<button class="btn btn-primary btn-sm" onclick="TasksModule.resumeTask('${task.id}')">▶ Fortsetzen</button>` : ''}
                        <button class="btn btn-danger btn-sm" onclick="TasksModule.cancelTask('${task.id}')">⏹ Abbrechen</button>
                    </div>
                `;
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${window.escapeHtml(task.name)}</strong>
                    <span style="font-size: 12px; font-weight: bold; color: var(--text-muted); text-transform: uppercase;">${task.status}</span>
                </div>
                <div style="font-size: 14px; color: var(--text-secondary);">${window.escapeHtml(task.message)}</div>
                
                <div style="width: 100%; height: 8px; background: var(--bg-base); border-radius: 4px; overflow: hidden; margin-top: 4px;">
                    <div style="width: ${task.progress_percent}%; height: 100%; background: ${task.status === 'failed' ? 'var(--color-danger)' : 'var(--color-primary)'}; transition: width 0.3s;"></div>
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
                    <span>${task.current_step} / ${task.total_steps}</span>
                    <span>${task.progress_percent}%</span>
                </div>
                
                ${controlsHTML}
            `;
            container.appendChild(card);
        });
    },

    updateGlobalIndicators: function(tasks) {
        const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'paused');
        const badge = document.getElementById('nav-badge-tasks');
        if (badge) {
            if (activeTasks.length > 0) {
                badge.textContent = activeTasks.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    },

    pauseTask: async function(id) {
        await fetch(API_URL + '/tasks/' + id + '/pause', { method: 'POST' });
        this.fetchTasks();
    },

    resumeTask: async function(id) {
        await fetch(API_URL + '/tasks/' + id + '/resume', { method: 'POST' });
        this.fetchTasks();
    },

    cancelTask: async function(id) {
        if (window.showConfirm) {
            window.showConfirm("Aufgabe abbrechen", "Diesen Prozess wirklich abbrechen?", async () => {
                await fetch(API_URL + '/tasks/' + id, { method: 'DELETE' });
                this.fetchTasks();
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.TasksModule.init();
});
