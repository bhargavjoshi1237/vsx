(function () {
	// If document is not available (e.g. Node during extension activation), skip running DOM/webview code.
	if (typeof document === 'undefined') {
		console.log('chat-panel-client.js: document is undefined; skipping webview runtime.');
		return;
	}

	// ...existing code moved from inline <script> in chat-panel.html...
	console.log('VSX Chat Panel initializing...');

	// VS Code API
	const vscode = (typeof acquireVsCodeApi === 'function')
	    ? acquireVsCodeApi()
	    : {
	        // Fallback stub for non-VSCode environments (prevents runtime errors).
	        postMessage: (msg) => {
	            console.log('[vscode.postMessage - stub]', msg);
	        }
	    };

	// Global state
	let selectedModel = 'gemini-2.0-flash-exp';
	let selectedMode = 'ask';
	let availableFiles = [];
	let contextFiles = new Set();
	let isContextPanelOpen = false;

	// DOM Elements (only query the IDs that exist in the HTML)
	const elements = {
	    chatInput: document.getElementById('chatInput'),
	    sendButton: document.getElementById('sendButton'),
	    modeSelect: document.getElementById('modeSelect'),
	    modelSelect: document.getElementById('modelSelect'),
	    contextToggle: document.getElementById('contextToggle'),
	    contextClose: document.getElementById('contextClose'),
	    clearChatBottom: document.getElementById('clearChatBottom'),
	    messagesArea: document.getElementById('messagesArea'),
	    typingIndicator: document.getElementById('typingIndicator'),
	    contextPanel: document.getElementById('contextPanel'),
	    contextCount: document.getElementById('contextCount'),
	    fileList: document.getElementById('fileList'),
	    statusIndicator: document.querySelector('.status-indicator')
	};

	// Utility Functions
	function log(message) { console.log('[VSX Chat]', message); }

	function escapeHtml(text) {
	    const div = document.createElement('div');
	    div.textContent = text;
	    return div.innerHTML;
	}

	function formatMessageContent(content) {
	    let html = escapeHtml(content);
	    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
	    html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
	    html = html.replace(/\n\n/g, '<br><br>');
	    html = html.replace(/\n/g, '<br>');
	    return html;
	}

	function createMetadataHTML(metadata) {
	    if (!metadata) return '';
	    const debugInfo = [];
	    if (metadata.mode) debugInfo.push(['Mode', metadata.mode.toUpperCase()]);
	    if (metadata.model) debugInfo.push(['Model', metadata.model]);
	    if (metadata.tokensUsed) debugInfo.push(['Tokens', metadata.tokensUsed]);
	    if (metadata.processingTime) debugInfo.push(['Response Time', metadata.processingTime + 'ms']);
	    if (metadata.contextFilesCount) debugInfo.push(['Context Files', metadata.contextFilesCount]);
	    if (debugInfo.length === 0) return '';
	    const debugItems = debugInfo.map(([label, value]) => `
	        <div class="debug-item">
	            <span class="debug-label">${label}</span>
	            <span class="debug-value">${value}</span>
	        </div>
	    `).join('');
	    return `
	        <div class="message-metadata">
	            <div class="metadata-title">
	                <span>🔍</span>
	                Debug Information
	            </div>
	            <div class="debug-info">
	                ${debugItems}
	            </div>
	        </div>
	    `;
	}

	// Message Functions
	function addMessage(message) {
	    if (!elements.messagesArea) return;
	    const welcomeState = elements.messagesArea.querySelector('.welcome-state');
	    if (welcomeState) welcomeState.remove();

	    const messageElement = document.createElement('div');
	    messageElement.className = `message ${message.role}`;

	    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	    const avatar = message.role === 'user' ? 'U' : 'AI';
	    const author = message.role === 'user' ? 'You' : 'Assistant';

	    let modeIndicator = '';
	    if (message.role === 'assistant' && message.metadata && message.metadata.mode) {
	        const mode = message.metadata.mode;
	        modeIndicator = `<span class="mode-indicator ${mode}">${mode}</span>`;
	    }

	    const metadataHTML = createMetadataHTML(message.metadata);
	    const content = formatMessageContent(message.content || '');

	    messageElement.innerHTML = `
	        <div class="message-avatar">${avatar}</div>
	        <div class="message-content">
	            <div class="message-header">
	                <span class="message-author">${author}</span>
	                ${modeIndicator}
	                <span class="message-timestamp">${timestamp}</span>
	            </div>
	            <div class="message-body">${content}</div>
	            ${metadataHTML}
	        </div>
	    `;

	    elements.messagesArea.appendChild(messageElement);
	    elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
	}

	function clearMessages() {
	    if (!elements.messagesArea) return;
	    elements.messagesArea.innerHTML = `
	        <div class="welcome-state">
	            <div class="welcome-title">Welcome to VSX AI Assistant</div>
	            <div class="welcome-subtitle">
	                I'm here to help you with coding, debugging, and development tasks. 
	                Select files from the context panel to provide additional context for better assistance.
	            </div>
	        </div>
	    `;
	}

	function showTyping() {
	    if (elements.statusIndicator) elements.statusIndicator.className = 'status-indicator processing';
	    if (elements.typingIndicator) elements.typingIndicator.classList.add('show');
	}

	function hideTyping() {
	    if (elements.statusIndicator) elements.statusIndicator.className = 'status-indicator';
	    if (elements.typingIndicator) elements.typingIndicator.classList.remove('show');
	}

	function sendMessage() {
	    if (!elements.chatInput) return;
	    const messageText = elements.chatInput.value.trim();
	    if (!messageText) return;

	    // Local echo
	    addMessage({ role: 'user', content: messageText });

	    // Send to extension backend
	    vscode.postMessage({
	        command: 'sendMessage',
	        message: messageText,
	        model: selectedModel,
	        mode: selectedMode,
	        contextFiles: Array.from(contextFiles)
	    });

	    elements.chatInput.value = '';
	    elements.chatInput.style.height = 'auto';
	    showTyping();
	}

	// Context Panel Functions
	function updateContextCount() {
	    if (elements.contextCount) elements.contextCount.textContent = contextFiles.size;
	    const contextInfo = document.getElementById('contextInfo');
	    if (contextInfo) {
	        const count = contextFiles.size;
	        contextInfo.textContent = count === 0 ? '0 files selected' :
	            count === 1 ? '1 file selected' : count + ' files selected';
	    }
	    updateContextChips();
	}

	function updateContextChips() {
	    const contextChipsContainer = document.getElementById('contextChips');
	    if (!contextChipsContainer) return;
	    contextChipsContainer.innerHTML = '';
	    contextFiles.forEach(filePath => {
	        const chip = document.createElement('div');
	        chip.className = 'context-chip';
	        chip.dataset.file = filePath;
	        const fileName = filePath.split('/').pop() || filePath;
	        chip.innerHTML = `
	            <span class="context-chip-name" title="${filePath}">${fileName}</span>
	            <button class="context-chip-remove" onclick="removeContextFile('${filePath}')">×</button>
	        `;
	        contextChipsContainer.appendChild(chip);
	    });
	}

	function removeContextFile(filePath) {
	    contextFiles.delete(filePath);
	    updateContextCount();
	    renderFileList();
	}
	window.removeContextFile = removeContextFile;

	function showContextRefreshIndicator() {
	    const chips = document.querySelectorAll('.context-chip');
	    chips.forEach(chip => {
	        chip.classList.add('refreshing');
	        setTimeout(() => chip.classList.remove('refreshing'), 2000);
	    });
	    const contextInfo = document.getElementById('contextInfo');
	    if (contextInfo) {
	        const originalText = contextInfo.textContent;
	        contextInfo.innerHTML = originalText + ' <span class="context-refresh-indicator">↻ refreshed</span>';
	        setTimeout(() => { contextInfo.textContent = originalText; }, 3000);
	    }
	}

	function toggleContextPanel() {
	    isContextPanelOpen = !isContextPanelOpen;
	    updateContextPanel();
	}

	function closeContextPanel() {
	    isContextPanelOpen = false;
	    updateContextPanel();
	}

	function updateContextPanel() {
	    if (!elements.contextPanel) return;
	    if (isContextPanelOpen) {
	        elements.contextPanel.classList.remove('collapsed');
	    } else {
	        elements.contextPanel.classList.add('collapsed');
	    }
	}

	function updateFileList(files) {
	    availableFiles = Array.isArray(files) ? files : [];
	    renderFileList();
	    updateContextCount();
	}

	function renderFileList() {
	    if (!elements.fileList) return;
	    elements.fileList.innerHTML = '';
	    availableFiles.forEach(file => {
	        const fileItem = document.createElement('div');
	        fileItem.className = 'file-item';
	        fileItem.dataset.file = file;
	        if (contextFiles.has(file)) fileItem.classList.add('selected');
	        fileItem.innerHTML = `
	            <div class="file-checkbox">${contextFiles.has(file) ? '✓' : ''}</div>
	            <div class="file-name">${file}</div>
	        `;
	        fileItem.addEventListener('click', () => toggleFileContext(file));
	        elements.fileList.appendChild(fileItem);
	    });
	}

	function toggleFileContext(file) {
	    if (contextFiles.has(file)) contextFiles.delete(file);
	    else contextFiles.add(file);
	    renderFileList();
	    updateContextCount();
	}

	function autoResizeInput() {
	    if (!elements.chatInput) return;
	    elements.chatInput.style.height = 'auto';
	    elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 120) + 'px';
	}

	// Event Listeners
	function setupEventListeners() {
	    if (elements.sendButton) elements.sendButton.addEventListener('click', sendMessage);

	    if (elements.chatInput) {
	        elements.chatInput.addEventListener('input', autoResizeInput);
	        elements.chatInput.addEventListener('keydown', (e) => {
	            if (e.key === 'Enter' && !e.shiftKey) {
	                e.preventDefault();
	                sendMessage();
	            }
	        });
	    }

	    if (elements.contextToggle) elements.contextToggle.addEventListener('click', toggleContextPanel);
	    if (elements.contextClose) elements.contextClose.addEventListener('click', closeContextPanel);

	    if (elements.clearChatBottom) {
	        elements.clearChatBottom.addEventListener('click', () => {
	            vscode.postMessage({ command: 'clearChat' });
	            clearMessages();
	        });
	    }

	    if (elements.modelSelect) {
	        elements.modelSelect.addEventListener('change', (e) => {
	            selectedModel = e.target.value;
	            log('Model changed to: ' + selectedModel);
	        });
	    }

	    if (elements.modeSelect) {
	        elements.modeSelect.addEventListener('change', (e) => {
	            selectedMode = e.target.value;
	            log('Mode changed to: ' + selectedMode);
	        });
	    }

	    // Global keyboard shortcut for focusing chat input (Esc to blur)
	    document.addEventListener('keydown', (e) => {
	        if (e.key === 'Escape' && document.activeElement === elements.chatInput) {
	            elements.chatInput.blur();
	        }
	    });
	}

	// Message handler from extension
	function handleVSCodeMessage(event) {
	    const message = event.data;
	    if (!message || !message.command) return;
	    switch (message.command) {
	        case 'addMessage':
	            hideTyping();
	            if (message.message) addMessage(message.message);
	            break;
	        case 'clearMessages':
	            hideTyping();
	            clearMessages();
	            break;
	        case 'showTyping':
	            showTyping();
	            break;
	        case 'hideTyping':
	            hideTyping();
	            break;
	        case 'updateFileList':
	            updateFileList(message.files || []);
	            break;
	        case 'contextFilesUpdated':
	            showContextRefreshIndicator();
	            break;
	        default:
	            log('Unknown command from extension: ' + message.command);
	    }
	}

	// Initialize
	function init() {
	    log('Initializing chat panel...');
	    setupEventListeners();
	    // Ask extension for workspace file list
	    vscode.postMessage({ command: 'getWorkspaceFiles' });
	    window.addEventListener('message', handleVSCodeMessage);
	    log('Chat panel initialized successfully');
	}

	if (document.readyState === 'loading') {
	    document.addEventListener('DOMContentLoaded', init);
	} else {
	    init();
	}
})();
