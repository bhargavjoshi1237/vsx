/**
 * Chat UI Components and HTML Template
 */

function getChatPanelHTML() {
  return `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>VSX AI Assistant</title>
    <style>
        :root {
            /* VS Code Theme Variables */
            --vscode-foreground: #cccccc;
            --vscode-background: #1e1e1e;
            --vscode-sideBar-background: #252526;
            --vscode-input-background: #3c3c3c;
            --vscode-input-border: #3c3c3c;
            --vscode-button-background: #0e639c;
            --vscode-list-hoverBackground: #2a2d2e;
            
            /* Modern Color Palette */
            --bg-primary: #0a0a0a;
            --bg-secondary: #111111;
            --bg-tertiary: #1a1a1a;
            --bg-elevated: #222222;
            --border-primary: #333333;
            --border-secondary: #2a2a2a;
            --text-primary: #ffffff;
            --text-secondary: #a1a1aa;
            --text-tertiary: #71717a;
            --accent-primary: #3b82f6;
            --accent-secondary: #8b5cf6;
            --accent-success: #10b981;
            --accent-warning: #f59e0b;
            --accent-error: #ef4444;
            
            /* Gradients */
            --gradient-primary: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
            --gradient-success: linear-gradient(135deg, #10b981 0%, #059669 100%);
            --gradient-warning: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            
            /* Spacing */
            --space-1: 4px;
            --space-2: 8px;
            --space-3: 12px;
            --space-4: 16px;
            --space-5: 20px;
            --space-6: 24px;
            --space-8: 32px;
            
            /* Border Radius */
            --radius-sm: 6px;
            --radius-md: 8px;
            --radius-lg: 12px;
            --radius-xl: 16px;
            
            /* Shadows */
            --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            overflow: hidden;
            font-size: 14px;
            line-height: 1.5;
        }

        .chat-container {
            display: flex;
            height: 100vh;
            background: var(--bg-primary);
        }

        /* Main Chat Area */
        .chat-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        /* Header */
        .chat-header {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-primary);
            padding: var(--space-4);
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 60px;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: var(--space-3);
        }

        .header-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--accent-success);
            animation: pulse 2s infinite;
        }

        .status-indicator.processing {
            background: var(--accent-warning);
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .header-button {
            background: transparent;
            border: 1px solid var(--border-primary);
            color: var(--text-secondary);
            padding: var(--space-2) var(--space-3);
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: var(--space-1);
        }

        .header-button:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border-color: var(--border-secondary);
        }

        .context-toggle {
            position: relative;
        }

        .context-count {
            background: var(--accent-primary);
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: var(--space-1);
            min-width: 18px;
            text-align: center;
        }

        /* Messages Area */
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: var(--space-4);
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
        }

        .welcome-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            color: var(--text-tertiary);
        }

        .welcome-icon {
            font-size: 48px;
            margin-bottom: var(--space-4);
            opacity: 0.5;
        }

        .welcome-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: var(--space-2);
            color: var(--text-secondary);
        }

        .welcome-subtitle {
            font-size: 14px;
            max-width: 400px;
            line-height: 1.6;
        }

        /* Message Styles */
        .message {
            display: flex;
            gap: var(--space-3);
            max-width: 100%;
            animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
            flex-shrink: 0;
        }

        .message.user .message-avatar {
            background: var(--gradient-primary);
            color: white;
        }

        .message.assistant .message-avatar {
            background: var(--bg-elevated);
            color: var(--text-secondary);
            border: 1px solid var(--border-primary);
        }

        .message-content {
            flex: 1;
            min-width: 0;
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            margin-bottom: var(--space-1);
        }

        .message-author {
            font-weight: 600;
            font-size: 13px;
        }

        .message.user .message-author {
            color: var(--accent-primary);
        }

        .message.assistant .message-author {
            color: var(--text-secondary);
        }

        .message-timestamp {
            font-size: 11px;
            color: var(--text-tertiary);
        }

        .message-body {
            color: var(--text-primary);
            line-height: 1.6;
            word-wrap: break-word;
        }

        .message-body pre {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-sm);
            padding: var(--space-3);
            overflow-x: auto;
            margin: var(--space-2) 0;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
        }

        .message-body code {
            background: var(--bg-tertiary);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
        }

        .message-body strong {
            color: var(--text-primary);
            font-weight: 600;
        }

        /* Metadata */
        .message-metadata {
            margin-top: var(--space-3);
            padding: var(--space-3);
            background: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-md);
            font-size: 12px;
        }

        .metadata-title {
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: var(--space-2);
            display: flex;
            align-items: center;
            gap: var(--space-1);
        }

        .debug-info {
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
        }

        .debug-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-1) 0;
            border-bottom: 1px solid var(--border-secondary);
        }

        .debug-item:last-child {
            border-bottom: none;
        }

        .debug-label {
            color: var(--text-tertiary);
            font-size: 11px;
        }

        .debug-value {
            color: var(--text-secondary);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
        }

        /* Input Area */
        .input-container {
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-primary);
            padding: var(--space-4);
        }

        .input-wrapper {
            position: relative;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-lg);
            transition: all 0.2s ease;
        }

        .input-wrapper:focus-within {
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .chat-input {
            width: 100%;
            background: transparent;
            border: none;
            padding: var(--space-4);
            padding-right: 120px;
            color: var(--text-primary);
            font-size: 14px;
            line-height: 1.5;
            resize: none;
            min-height: 20px;
            max-height: 120px;
            font-family: inherit;
        }

        .chat-input:focus {
            outline: none;
        }

        .chat-input::placeholder {
            color: var(--text-tertiary);
        }

        .input-actions {
            position: absolute;
            right: var(--space-2);
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            align-items: center;
            gap: var(--space-1);
        }

        .model-selector {
            position: relative;
        }

        .model-button {
            background: var(--bg-elevated);
            border: 1px solid var(--border-primary);
            color: var(--text-secondary);
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: var(--space-1);
        }

        .model-button:hover,
        .model-button.active {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .model-dropdown {
            position: absolute;
            bottom: 100%;
            right: 0;
            background: var(--bg-elevated);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            min-width: 200px;
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transform: translateY(10px);
            transition: all 0.2s ease;
            margin-bottom: var(--space-1);
        }

        .model-button.active + .model-dropdown {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .model-option {
            padding: var(--space-2) var(--space-3);
            cursor: pointer;
            font-size: 12px;
            border-bottom: 1px solid var(--border-secondary);
            transition: background-color 0.2s ease;
        }

        .model-option:last-child {
            border-bottom: none;
        }

        .model-option:hover {
            background: var(--bg-tertiary);
        }

        .model-option.selected {
            background: var(--accent-primary);
            color: white;
        }

        .model-name {
            font-weight: 600;
            color: var(--text-primary);
        }

        .model-description {
            color: var(--text-tertiary);
            font-size: 11px;
            margin-top: 2px;
        }

        .send-button {
            background: var(--gradient-primary);
            border: none;
            color: white;
            padding: var(--space-2);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
        }

        .send-button:hover {
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }

        .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        /* Typing Indicator */
        .typing-indicator {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-3);
            color: var(--text-tertiary);
            font-size: 13px;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }

        .typing-indicator.show {
            opacity: 1;
            visibility: visible;
        }

        .typing-dots {
            display: flex;
            gap: 4px;
        }

        .typing-dot {
            width: 6px;
            height: 6px;
            background: var(--text-tertiary);
            border-radius: 50%;
            animation: typingDot 1.4s infinite ease-in-out;
        }

        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }

        @keyframes typingDot {
            0%, 80%, 100% {
                transform: scale(0.8);
                opacity: 0.5;
            }
            40% {
                transform: scale(1);
                opacity: 1;
            }
        }

        /* Context Panel */
        .context-panel {
            width: 300px;
            background: var(--bg-secondary);
            border-left: 1px solid var(--border-primary);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
        }

        .context-panel.collapsed {
            width: 0;
            overflow: hidden;
        }

        .context-header {
            padding: var(--space-4);
            border-bottom: 1px solid var(--border-primary);
            background: var(--bg-tertiary);
        }

        .context-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: var(--space-1);
        }

        .context-subtitle {
            font-size: 12px;
            color: var(--text-tertiary);
        }

        .context-content {
            flex: 1;
            overflow-y: auto;
            padding: var(--space-3);
        }

        .file-list {
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
        }

        .file-item:hover {
            background: var(--bg-tertiary);
        }

        .file-item.selected {
            background: var(--accent-primary);
            color: white;
        }

        .file-checkbox {
            width: 16px;
            height: 16px;
            border: 1px solid var(--border-primary);
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .file-item.selected .file-checkbox {
            background: white;
            border-color: white;
        }

        .file-name {
            flex: 1;
            color: var(--text-secondary);
            font-family: 'Consolas', 'Monaco', monospace;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .file-item.selected .file-name {
            color: white;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--border-primary);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--border-secondary);
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .context-panel {
                position: absolute;
                right: 0;
                top: 0;
                height: 100%;
                z-index: 100;
                box-shadow: var(--shadow-xl);
            }
            
            .context-panel.collapsed {
                width: 0;
            }
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-main">
            <div class="chat-header">
                <div class="header-left">
                    <div class="status-indicator"></div>
                    <h1 class="header-title">VSX AI Assistant</h1>
                </div>
                <div class="header-actions">
                    <button class="header-button context-toggle" id="contextToggle">
                        📁 Context
                        <span class="context-count" id="contextCount">0</span>
                    </button>
                    <button class="header-button" id="clearChat">🗑️ Clear</button>
                </div>
            </div>
            
            <div class="messages-container" id="messagesArea">
                <div class="welcome-state">
                    <div class="welcome-icon">🤖</div>
                    <div class="welcome-title">Welcome to VSX AI Assistant</div>
                    <div class="welcome-subtitle">
                        I'm here to help you with coding, debugging, and development tasks. 
                        Select files from the context panel to provide additional context for better assistance.
                    </div>
                </div>
            </div>
            
            <div class="typing-indicator" id="typingIndicator">
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
                <span>Assistant is thinking...</span>
            </div>
            
            <div class="input-container">
                <div class="input-wrapper">
                    <textarea 
                        class="chat-input" 
                        id="chatInput" 
                        placeholder="Ask me anything about your code..."
                        rows="1"
                    ></textarea>
                    <div class="input-actions">
                        <div class="model-selector">
                            <button class="model-button" id="modelButton">
                                <span id="selectedModel">gemini-1.5-flash</span>
                                <span>▼</span>
                            </button>
                            <div class="model-dropdown">
                                <div class="model-option selected" data-model="gemini-1.5-flash">
                                    <div class="model-name">Gemini 1.5 Flash</div>
                                    <div class="model-description">Fast and efficient for most tasks</div>
                                </div>
                                <div class="model-option" data-model="gemini-1.5-pro">
                                    <div class="model-name">Gemini 1.5 Pro</div>
                                    <div class="model-description">Advanced reasoning and complex tasks</div>
                                </div>
                            </div>
                        </div>
                        <button class="send-button" id="sendButton">
                            <span>→</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="context-panel collapsed" id="contextPanel">
            <div class="context-header">
                <div class="context-title">File Context</div>
                <div class="context-subtitle">Select files to include in conversation</div>
            </div>
            <div class="context-content">
                <div class="file-list" id="fileList">
                    <!-- Files will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <script>
        // Chat initialization will be injected here
    </script>
</body>
</html>
  `;
}

module.exports = { getChatPanelHTML };