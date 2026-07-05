// Stats & Visualizations
function loadStatsData() {
    if (!state.currentProject) return;
    
    let totalWords = 0;
    state.currentProject.chapters.forEach(c => totalWords += c.word_count);
    
    const chaptersCount = state.currentProject.chapters.length;
    const avgWords = chaptersCount > 0 ? Math.round(totalWords / chaptersCount) : 0;
    
    // Fill text values
    document.getElementById('stats-total-words-val').textContent = totalWords.toLocaleString();
    
    const goal = state.currentProject.word_count_goal || 50000;
    const totalPercentage = Math.min(100, Math.round((totalWords / goal) * 100));
    document.getElementById('stats-total-progress-lbl').textContent = `Ziel: ${goal.toLocaleString()} (${totalPercentage}%)`;
    
    document.getElementById('stats-chapters-count-val').textContent = chaptersCount;
    document.getElementById('stats-avg-words-lbl').textContent = `Ø ${avgWords.toLocaleString()} Wörter pro Kapitel`;
    
    const dailyProgress = state.sessionWords || 0;
    document.getElementById('stats-daily-words-val').textContent = dailyProgress.toLocaleString();
    const dailyGoal = state.currentProject.daily_word_count_goal || 500;
    const dailyPercentage = Math.min(100, Math.round((dailyProgress / dailyGoal) * 100));
    document.getElementById('stats-daily-progress-lbl').textContent = `Tägliches Ziel: ${dailyGoal.toLocaleString()} (${dailyPercentage}%)`;
    
    // NaNoWriMo Planer Card Calculations
    const deadlineStr = state.currentProject.deadline_date;
    const badge = document.getElementById('nanowrimo-active-badge');
    const configHint = document.getElementById('nanowrimo-config-hint');
    const statsContent = document.getElementById('nanowrimo-stats-content');
    
    if (deadlineStr) {
        const deadline = new Date(deadlineStr);
        const today = new Date();
        today.setHours(0,0,0,0);
        deadline.setHours(0,0,0,0);
        
        const diffTime = deadline.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0) {
            badge.style.display = 'inline-block';
            badge.textContent = "Aktiv";
            badge.style.backgroundColor = 'var(--color-success-light)';
            badge.style.color = 'var(--color-success)';
            configHint.style.display = 'none';
            statsContent.style.display = 'grid';
            
            document.getElementById('nanowrimo-days-left').textContent = diffDays;
            
            const remainingWords = Math.max(0, goal - totalWords);
            const requiredDaily = diffDays > 0 ? Math.ceil(remainingWords / diffDays) : remainingWords;
            document.getElementById('nanowrimo-required-daily').textContent = requiredDaily.toLocaleString() + " Wörter";
            
            const progressPercent = Math.min(100, Math.round((totalWords / goal) * 100));
            document.getElementById('nanowrimo-progress-percent').textContent = progressPercent + "%";
            
            document.getElementById('nanowrimo-progress-bar-lbl').textContent = `${totalWords.toLocaleString()} / ${goal.toLocaleString()} Wörter`;
            document.getElementById('nanowrimo-progress-bar-fill').style.width = progressPercent + "%";
        } else {
            badge.style.display = 'inline-block';
            badge.textContent = "Beendet";
            badge.style.backgroundColor = 'var(--color-primary-light)';
            badge.style.color = 'var(--color-primary)';
            configHint.style.display = 'none';
            statsContent.style.display = 'grid';
            
            document.getElementById('nanowrimo-days-left').textContent = "Abgelaufen";
            document.getElementById('nanowrimo-required-daily').textContent = "-";
            
            const progressPercent = Math.min(100, Math.round((totalWords / goal) * 100));
            document.getElementById('nanowrimo-progress-percent').textContent = progressPercent + "%";
            document.getElementById('nanowrimo-progress-bar-lbl').textContent = `${totalWords.toLocaleString()} / ${goal.toLocaleString()} Wörter`;
            document.getElementById('nanowrimo-progress-bar-fill').style.width = progressPercent + "%";
        }
    } else {
        if (badge) badge.style.display = 'none';
        if (configHint) configHint.style.display = 'block';
        if (statsContent) statsContent.style.display = 'none';
    }
    
    // Draw Bar Chart
    renderStatsCharts();
}

function renderStatsCharts() {
    const container = document.getElementById('stats-chart-container');
    container.innerHTML = '';
    
    const chapters = state.currentProject.chapters;
    if (chapters.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); font-style: italic; width: 100%; text-align: center;">Keine Kapiteldaten vorhanden.</div>`;
        return;
    }
    
    const maxWords = Math.max(...chapters.map(c => c.word_count), 1);
    
    chapters.forEach(ch => {
        const wrapper = document.createElement('div');
        wrapper.className = 'stats-chart-bar-wrapper';
        
        const pct = Math.max(5, Math.round((ch.word_count / maxWords) * 100));
        
        wrapper.innerHTML = `
            <div class="stats-chart-bar" style="height: ${pct}%;">
                <div class="stats-chart-bar-tooltip">${ch.title}: ${ch.word_count.toLocaleString()} Wörter</div>
            </div>
            <div class="stats-chart-bar-label">${escapeHtml(ch.title)}</div>
        `;
        container.appendChild(wrapper);
    });
}

// Expose functions globally for dynamic elements (onclicks)
window.openTimelineEventForm = openTimelineEventForm;
window.deleteTimelineEvent = deleteTimelineEvent;
window.showLoreQuickviewById = showLoreQuickviewById;

