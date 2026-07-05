// UTILITY FUNCTIONS
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(message, type = 'primary') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    
    toast.innerHTML = `
        <span>${icon}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'toast-in 0.3s reverse forwards ease-out';
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }, 4000);
}

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Extended prototype helper for capitalizing string title
String.prototype.title = function() {
    return this.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// Recovery Diff Merge Helpers

function computeDiff(linesA, linesB) {
    const matrix = Array(linesA.length + 1).fill().map(() => Array(linesB.length + 1).fill(0));
    for (let i = 1; i <= linesA.length; i++) {
        for (let j = 1; j <= linesB.length; j++) {
            if (linesA[i - 1] === linesB[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }
    
    let i = linesA.length;
    let j = linesB.length;
    const diff = [];
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
            diff.unshift({ type: 'unchanged', text: linesA[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift({ type: 'added', text: linesB[j - 1] });
            j--;
        } else {
            diff.unshift({ type: 'removed', text: linesA[i - 1] });
            i--;
        }
    }
    return diff;
}

function renderDiffMergeView(originalText, recoveryText) {
    const linesA = originalText.split('\n');
    const linesB = recoveryText.split('\n');
    const diff = computeDiff(linesA, linesB);
    
    const container = document.getElementById('merge-diff-container');
    container.innerHTML = '';
    
    state.mergeLines = [];
    
    diff.forEach((item, index) => {
        const lineEl = document.createElement('div');
        lineEl.className = `diff-line diff-line-${item.type}`;
        
        // Line number
        const numEl = document.createElement('div');
        numEl.className = 'diff-line-num';
        numEl.textContent = index + 1;
        lineEl.appendChild(numEl);
        
        // Action checkbox
        const actionEl = document.createElement('div');
        actionEl.className = 'diff-line-action';
        
        let checkbox = null;
        if (item.type === 'added') {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true; // checked by default
            actionEl.appendChild(checkbox);
        } else if (item.type === 'removed') {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = false; // unchecked by default (we accept removal)
            actionEl.appendChild(checkbox);
        } else {
            // unchanged placeholder
            const placeholder = document.createElement('span');
            placeholder.style.width = '16px';
            actionEl.appendChild(placeholder);
        }
        lineEl.appendChild(actionEl);
        
        // Prefix indicator
        const prefixEl = document.createElement('span');
        prefixEl.className = 'diff-line-prefix';
        prefixEl.textContent = item.type === 'added' ? '+' : (item.type === 'removed' ? '-' : ' ');
        lineEl.appendChild(prefixEl);
        
        // Line content
        const contentEl = document.createElement('div');
        contentEl.className = 'diff-line-content';
        contentEl.textContent = item.text;
        lineEl.appendChild(contentEl);
        
        container.appendChild(lineEl);
        
        state.mergeLines.push({
            type: item.type,
            text: item.text,
            checkbox: checkbox
        });
    });
}

async function applyMerge() {
    const finalLines = [];
    state.mergeLines.forEach(item => {
        if (item.type === 'unchanged') {
            finalLines.push(item.text);
        } else if (item.type === 'added') {
            if (item.checkbox && item.checkbox.checked) {
                finalLines.push(item.text);
            }
        } else if (item.type === 'removed') {
            if (item.checkbox && item.checkbox.checked) {
                finalLines.push(item.text);
            }
        }
    });
    
    const mergedText = finalLines.join('\n');
    
    if (state.editor) {
        state.editor.setMarkdown(mergedText);
    }
    
    state.isDirty = true;
    
    closeModal('modal-merge');
    
    // Discard the temp file on the backend as we've completed the merge
    await resolveRecovery(false);
    
    showToast(t('merge_success_toast', 'Änderungen erfolgreich zusammengeführt!'), 'success');
}

