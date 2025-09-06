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
	let isProcessing = false; // Track if a request is currently being processed

	// DOM Elements (only query the IDs that exist in the HTML)
	const elements = {
	    chatInput: document.getElementById('chatInput'),
	    sendButton: document.getElementById('sendButton'),
	    stopButton: document.getElementById('stopButton'),
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
	    // Check if content is JSON
	    if (isJsonContent(content)) {
	        return formatJsonContent(content);
	    }

	    let html = escapeHtml(content);
	    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
	    html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
	    html = html.replace(/\n\n/g, '<br><br>');
	    html = html.replace(/\n/g, '<br>');
	    return html;
	}

	function isJsonContent(content) {
	    const trimmed = content.trim();
	    // Check if content starts and ends with braces or brackets
	    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
	           (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
	           (trimmed.startsWith('```json') && trimmed.endsWith('```'));
	}

	function formatJsonContent(content) {
	    try {
	        let jsonText = content.trim();

	        // Remove markdown code block markers if present
	        if (jsonText.startsWith('```json')) {
	            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	        }

	        const parsed = JSON.parse(jsonText);
	        const formatted = JSON.stringify(parsed, null, 2);

	        // Create a collapsible JSON viewer
	        return `
	            <div class="json-container">
	                <div class="json-header">
	                    <span class="json-toggle" onclick="toggleJsonView(this)">▶</span>
	                    <span class="json-label">JSON Response</span>
	                    <button class="json-copy-btn" onclick="copyJsonContent('${escapeHtml(JSON.stringify(parsed))}')">Copy</button>
	                </div>
	                <pre class="json-content collapsed"><code class="language-json">${escapeHtml(formatted)}</code></pre>
	            </div>
	        `;
	    } catch (e) {
	        // If JSON parsing fails, fall back to regular formatting
	        let html = escapeHtml(content);
	        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
	        html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
	        html = html.replace(/\n\n/g, '<br><br>');
	        html = html.replace(/\n/g, '<br>');
	        return html;
	    }
	}

	function createMetadataHTML(metadata) {
	    if (!metadata) return '';
	    const debugInfo = [];
	    if (metadata.mode) debugInfo.push(['Mode', metadata.mode.toUpperCase()]);
	    if (metadata.model) debugInfo.push(['Model', metadata.model]);

	    // New: show token breakdown (prompt / completion / total) if available
	    if (typeof metadata.promptTokens === 'number' || typeof metadata.completionTokens === 'number' || typeof metadata.tokensUsed === 'number') {
	        if (typeof metadata.promptTokens === 'number') debugInfo.push(['Prompt Tokens', metadata.promptTokens]);
	        if (typeof metadata.completionTokens === 'number') debugInfo.push(['Completion Tokens', metadata.completionTokens]);
	        // total / tokensUsed fallback
	        const total = (typeof metadata.tokensUsed === 'number') ? metadata.tokensUsed : metadata.totalTokens;
	        if (typeof total === 'number') debugInfo.push(['Total Tokens', total]);
	    } else if (metadata.tokensUsed) {
	        // backward-compat: single tokensUsed field
	        debugInfo.push(['Tokens', metadata.tokensUsed]);
	    }

	    if (metadata.processingTime) debugInfo.push(['Response Time', metadata.processingTime + 'ms']);
	    if (metadata.contextFilesCount !== undefined) debugInfo.push(['Context Files', metadata.contextFilesCount]);

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
	    // Reset processing state when typing is hidden
	    setProcessingState(false);
	}

        function sendMessage() {
            if (!elements.chatInput) return;
            const messageText = elements.chatInput.value.trim();
            if (!messageText) return;

            // Set processing state
            setProcessingState(true);

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

	function stopMessage() {
	    // Send stop command to extension
	    vscode.postMessage({
	        command: 'stopMessage'
	    });

	    // Reset processing state
	    setProcessingState(false);
	    hideTyping();
	}

	function setProcessingState(processing) {
	    isProcessing = processing;

	    if (elements.sendButton && elements.stopButton) {
	        if (processing) {
	            // Show stop button, hide send button
	            elements.sendButton.style.display = 'none';
	            elements.stopButton.style.display = 'flex';
	            elements.chatInput.disabled = true;
	            elements.chatInput.placeholder = 'Processing...';
	        } else {
	            // Show send button, hide stop button
	            elements.sendButton.style.display = 'flex';
	            elements.stopButton.style.display = 'none';
	            elements.chatInput.disabled = false;
	            elements.chatInput.placeholder = 'Ask me anything about your code...';
	        }
	    }
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

	// New: expanded model list (value, label, description)
	const MODEL_OPTIONS = [
	    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp', desc: 'Latest experimental model with enhanced capabilities' },
	    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'High-performance model for complex reasoning' },
	    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Balanced performance and speed' },
	    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', desc: 'Lightweight version for faster responses' },
	    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', desc: 'Optimized for speed and efficiency' },

	    // Cerebras
	    { value: 'cerebras-gpt-oss-120b', label: 'Cerebras GPT-OSS-120B', desc: 'Cerebras large open model (requires Cerebras API key)' },

	    // Qwen family (these require provider support / keys)
	    { value: 'qwen-3-235b-a22b-instruct-2507', label: 'Qwen-3-235B Instruct', desc: 'Qwen instruct model (requires Qwen API key)' },
	    { value: 'qwen-3-235b-a22b-thinking-2507', label: 'Qwen-3-235B Thinking', desc: 'Qwen thinking variant (requires Qwen API key)' },
	    { value: 'qwen-3-32b', label: 'Qwen-3-32B', desc: 'Qwen medium model' },
	    { value: 'qwen-3-coder-480b', label: 'Qwen-3-Coder-480B', desc: 'Qwen coder model (coding tasks)' },

	    // NVIDIA / DeepSeek examples
	    { value: 'nvidia-deepseek-v3.1', label: 'NVIDIA deepseek-v3.1', desc: 'NVIDIA DeepSeek model (requires NVIDIA API key)' },
	    { value: 'nvidia-deepseek-r1-0528', label: 'NVIDIA deepseek-r1-0528', desc: 'NVIDIA DeepSeek R1 model' },
	    { value: 'nvidia-kimi-k2-instruct', label: 'NVIDIA Kimi K2 Instruct', desc: 'NVIDIA Kimi instruct model' }
	];

	// Populate the model <select> with options and titles (so user can see descriptions)
	function populateModelOptions() {
	    const sel = elements.modelSelect;
	    if (!sel) return;
	    sel.innerHTML = ''; // clear existing options
	    MODEL_OPTIONS.forEach(opt => {
	        const el = document.createElement('option');
	        el.value = opt.value;
	        el.textContent = opt.label;
	        if (opt.desc) el.title = opt.desc;
	        sel.appendChild(el);
	    });
	    // Reflect current selectedModel in UI
	    try {
	        sel.value = selectedModel;
	    } catch (e) {
	        // If current selectedModel not present, keep first option and update state
	        selectedModel = sel.options[0]?.value || selectedModel;
	    }
	}

	// Event Listeners
	function setupEventListeners() {
	    if (elements.sendButton) elements.sendButton.addEventListener('click', sendMessage);
	    if (elements.stopButton) elements.stopButton.addEventListener('click', stopMessage);

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

	    // Model selector change handler (preserve existing behavior)
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
	            setProcessingState(false); // Ensure processing state is reset
	            if (message.message) addMessage(message.message);
	            break;
	        case 'clearMessages':
	            hideTyping();
	            setProcessingState(false);
	            clearMessages();
	            break;
	        case 'showTyping':
	            showTyping();
	            setProcessingState(true);
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

	// Global functions for JSON handling
	window.toggleJsonView = function(toggleElement) {
	    const jsonContent = toggleElement.closest('.json-container').querySelector('.json-content');
	    const isCollapsed = jsonContent.classList.contains('collapsed');

	    if (isCollapsed) {
	        jsonContent.classList.remove('collapsed');
	        toggleElement.classList.add('expanded');
	        toggleElement.textContent = '▼';
	    } else {
	        jsonContent.classList.add('collapsed');
	        toggleElement.classList.remove('expanded');
	        toggleElement.textContent = '▶';
	    }
	};

	window.copyJsonContent = function(jsonString) {
	    navigator.clipboard.writeText(JSON.parse(jsonString)).then(() => {
	        // Show temporary success feedback
	        const btn = event.target;
	        const originalText = btn.textContent;
	        btn.textContent = 'Copied!';
	        btn.style.background = 'var(--accent-success)';
	        setTimeout(() => {
	            btn.textContent = originalText;
	            btn.style.background = 'var(--accent-primary)';
	        }, 2000);
	    }).catch(err => {
	        console.error('Failed to copy JSON:', err);
	    });
	};

	// Initialize
	function init() {
	    log('Initializing chat panel...');
	    // Ensure model selector is populated with the expanded list
	    populateModelOptions();
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
