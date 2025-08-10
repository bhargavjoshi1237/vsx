/**
 * VSX Assistant Chat Panel - Full Implementation
 * Based on successful minimal test approach
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

        /* Loading State */
        .message.loading {
            opacity: 0.7;
        }

        .loading-spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--border-primary);
            border-radius: 50%;
            border-top-color: var(--accent-primary);
            animation: spin 1s ease-in-out infinite;
            margin-left: var(--space-2);
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* File Chips */
        .file-chips {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-1);
            margin-top: var(--space-2);
        }

        .file-chip {
            background: var(--bg-elevated);
            border: 1px solid var(--border-primary);
            color: var(--text-secondary);
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-sm);
            font-size: 11px;
            font-family: 'Consolas', 'Monaco', monospace;
            display: flex;
            align-items: center;
            gap: var(--space-1);
        }

        .file-chip-icon {
            font-size: 10px;
        }

        /* Response without bubble */
        .message.assistant.no-bubble .message-body {
            background: transparent;
            border: none;
            padding: 0;
        }

        /* Change chips */
        .change-chips {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-2);
            margin-top: var(--space-3);
        }

        .change-chip {
            background: var(--bg-elevated);
            border: 1px solid var(--border-primary);
            color: var(--text-secondary);
            padding: var(--space-2) var(--space-3);
            border-radius: var(--radius-md);
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .change-chip.created {
            border-color: var(--accent-success);
            background: rgba(16, 185, 129, 0.1);
        }

        .change-chip.modified {
            border-color: var(--accent-warning);
            background: rgba(245, 158, 11, 0.1);
        }

        .change-chip-icon {
            font-size: 14px;
        }

        .change-chip-file {
            font-family: 'Consolas', 'Monaco', monospace;
            font-weight: 600;
        }

        .change-chip-stats {
            font-size: 11px;
            color: var(--text-tertiary);
        }

        .change-chip.created .change-chip-stats {
            color: var(--accent-success);
        }

        .change-chip.modified .change-chip-stats {
            color: var(--accent-warning);
        }

        /* Reload button */
        .reload-button {
            background: var(--bg-elevated);
            border: 1px solid var(--border-primary);
            color: var(--text-secondary);
            padding: var(--space-2) var(--space-3);
            border-radius: var(--radius-md);
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: var(--space-1);
            margin-top: var(--space-3);
        }

        .reload-button:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border-color: var(--accent-primary);
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

        .mode-indicator {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            margin-left: var(--space-1);
        }

        .mode-indicator.ask {
            background: var(--accent-primary);
            color: white;
        }

        .mode-indicator.edit {
            background: var(--accent-warning);
            color: white;
        }

        .mode-indicator.legacy {
            background: var(--text-tertiary);
            color: white;
        }

        /* Input Area */
        .input-container {
            background: var(--bg-secondary);
            border-top: 1px solid var(--border-primary);
            padding: var(--space-3);
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
        }

        .input-top-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 var(--space-2);
        }

        .input-left-controls {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            flex-wrap: wrap;
        }

        .context-chips {
            display: flex;
            align-items: center;
            gap: var(--space-1);
            flex-wrap: wrap;
        }

        .context-chip {
            background: var(--bg-elevated);
            border: 1px solid var(--border-primary);
            color: var(--text-secondary);
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-sm);
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: var(--space-1);
            max-width: 150px;
            transition: all 0.2s ease;
        }

        .context-chip:hover {
            background: var(--bg-tertiary);
            border-color: var(--border-secondary);
        }

        .context-chip-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-family: 'Consolas', 'Monaco', monospace;
        }

        .context-chip-remove {
            background: none;
            border: none;
            color: var(--text-tertiary);
            cursor: pointer;
            padding: 0;
            width: 12px;
            height: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            font-size: 10px;
            transition: all 0.2s ease;
        }

        .context-chip-remove:hover {
            background: var(--accent-error);
            color: white;
        }

        .context-chip.refreshing {
            opacity: 0.6;
            animation: contextRefresh 1s infinite;
        }

        @keyframes contextRefresh {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
        }

        .context-refresh-indicator {
            color: var(--accent-warning);
            font-size: 10px;
            margin-left: var(--space-1);
        }

        .add-context-btn {
            background: transparent;
            border: 1px solid var(--border-primary);
            color: var(--text-secondary);
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: var(--space-1);
        }

        .add-context-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .input-right-controls {
            display: flex;
            align-items: center;
            gap: var(--space-2);
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
            padding-right: 60px;
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

        .input-bottom-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 var(--space-2);
            font-size: 12px;
            color: var(--text-tertiary);
        }

        .input-bottom-left {
            display: flex;
            align-items: center;
            gap: var(--space-3);
        }

        .model-shortcut {
            color: var(--text-tertiary);
            font-size: 11px;
        }

        .context-info {
            color: var(--text-tertiary);
            font-size: 11px;
        }

        .model-selector {
            position: relative;
        }

        .model-button {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-size: 12px;
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
            left: 0;
            background: var(--bg-elevated);
            border: 1px solid var(--border-primary);
            border-radius: var(--radius-md);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
            min-width: 280px;
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
            padding: var(--space-3);
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
            margin-bottom: var(--space-1);
        }

        .model-description {
            color: var(--text-tertiary);
            font-size: 11px;
            line-height: 1.4;
        }

        .model-option.selected .model-name,
        .model-option.selected .model-description {
            color: white;
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
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
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
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .context-header-left {
            flex: 1;
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

        .context-close {
            background: transparent;
            border: none;
            color: var(--text-tertiary);
            cursor: pointer;
            padding: var(--space-1);
            border-radius: var(--radius-sm);
            transition: all 0.2s ease;
            font-size: 16px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .context-close:hover {
            background: var(--bg-elevated);
            color: var(--text-primary);
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
            font-size: 10px;
        }

        .file-item.selected .file-checkbox {
            background: white;
            border-color: white;
            color: var(--accent-primary);
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
                    <button class="header-button" id="contextToggle">
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
                <div class="input-top-bar">
                    <div class="input-left-controls">
                        <button class="add-context-btn" id="addContextBtn">
                            📎 Add Context...
                        </button>
                        <div class="context-chips" id="contextChips">
                            <!-- Context file chips will be populated here -->
                        </div>
                    </div>
                    <div class="input-right-controls">
                        <button class="header-button" id="clearChatBottom">🗑️ Clear</button>
                    </div>
                </div>
                
                <div class="input-wrapper">
                    <textarea 
                        class="chat-input" 
                        id="chatInput" 
                        placeholder="Ask me anything about your code..."
                        rows="1"
                    ></textarea>
                    <div class="input-actions">
                        <button class="send-button" id="sendButton">
                            <span>→</span>
                        </button>
                    </div>
                </div>
                
                <div class="input-bottom-bar">
                    <div class="input-bottom-left">
                        <div class="model-selector">
                            <button class="model-button" id="modelButton">
                                <span id="selectedModel">Gemini 2.0 Flash Exp</span>
                                <span>▼</span>
                            </button>
                            <div class="model-dropdown">
                                <div class="model-option selected" data-model="gemini-2.0-flash-exp">
                                    <div class="model-name">Gemini 2.0 Flash Experimental</div>
                                    <div class="model-description">Latest experimental model with enhanced capabilities</div>
                                </div>
                                <div class="model-option" data-model="gemini-2.5-flash">
                                    <div class="model-name">Gemini 2.5 Flash</div>
                                    <div class="model-description">High-performance model for complex reasoning</div>
                                </div>
                                <div class="model-option" data-model="gemini-2.0-flash">
                                    <div class="model-name">Gemini 2.0 Flash</div>
                                    <div class="model-description">Balanced performance and speed</div>
                                </div>
                                <div class="model-option" data-model="gemini-2.0-flash-lite">
                                    <div class="model-name">Gemini 2.0 Flash Lite</div>
                                    <div class="model-description">Lightweight version for faster responses</div>
                                </div>
                                <div class="model-option" data-model="gemini-2.5-flash-lite">
                                    <div class="model-name">Gemini 2.5 Flash Lite</div>
                                    <div class="model-description">Optimized for speed and efficiency</div>
                                </div>
                            </div>
                        </div>
                        <span class="model-shortcut">Pick Model (Ctrl+Alt+.)</span>
                    </div>
                    <div class="input-bottom-right">
                        <span class="context-info" id="contextInfo">0 files selected</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="context-panel collapsed" id="contextPanel">
            <div class="context-header">
                <div class="context-header-left">
                    <div class="context-title">File Context</div>
                    <div class="context-subtitle">Select files to include in conversation</div>
                </div>
                <button class="context-close" id="contextClose">×</button>
            </div>
            <div class="context-content">
                <div class="file-list" id="fileList">
                    <!-- Files will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <script>
        console.log('VSX Chat Panel initializing...');
        
        // VS Code API
        const vscode = acquireVsCodeApi();
        console.log('VS Code API acquired');

        // Global state
        let selectedModel = 'gemini-2.0-flash-exp';
        let availableFiles = [];
        let contextFiles = new Set();
        let isContextPanelOpen = false;

        // DOM Elements
        const elements = {
            chatInput: document.getElementById('chatInput'),
            sendButton: document.getElementById('sendButton'),
            modelButton: document.getElementById('modelButton'),
            selectedModelSpan: document.getElementById('selectedModel'),
            contextToggle: document.getElementById('contextToggle'),
            contextClose: document.getElementById('contextClose'),
            clearChat: document.getElementById('clearChat'),
            messagesArea: document.getElementById('messagesArea'),
            typingIndicator: document.getElementById('typingIndicator'),
            contextPanel: document.getElementById('contextPanel'),
            contextCount: document.getElementById('contextCount'),
            fileList: document.getElementById('fileList'),
            modelDropdown: document.querySelector('.model-dropdown'),
            statusIndicator: document.querySelector('.status-indicator')
        };

        // Utility Functions
        function log(message) {
            console.log('[VSX Chat]', message);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatMessageContent(content) {
            let html = escapeHtml(content);
            html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
            html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
            // Preserve empty lines by replacing double newlines with paragraph breaks
            html = html.replace(/\\n\\n/g, '<br><br>');
            html = html.replace(/\\n/g, '<br>');
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
            
            const debugItems = debugInfo.map(([label, value]) => \`
                <div class="debug-item">
                    <span class="debug-label">\${label}</span>
                    <span class="debug-value">\${value}</span>
                </div>
            \`).join('');
            
            return \`
                <div class="message-metadata">
                    <div class="metadata-title">
                        <span>🔍</span>
                        Debug Information
                    </div>
                    <div class="debug-info">
                        \${debugItems}
                    </div>
                </div>
            \`;
        }

        // Message Functions
        function addMessage(message) {
            if (!elements.messagesArea) return;
            
            // Remove welcome state if it exists
            const welcomeState = elements.messagesArea.querySelector('.welcome-state');
            if (welcomeState) {
                welcomeState.remove();
            }

            const messageElement = document.createElement('div');
            messageElement.className = \`message \${message.role}\`;
            
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const avatar = message.role === 'user' ? 'U' : 'AI';
            const author = message.role === 'user' ? 'You' : 'Assistant';
            
            // Add mode indicator for assistant messages
            let modeIndicator = '';
            if (message.role === 'assistant' && message.metadata && message.metadata.mode) {
                const mode = message.metadata.mode;
                modeIndicator = \`<span class="mode-indicator \${mode}">\${mode}</span>\`;
            }
            
            const metadataHTML = createMetadataHTML(message.metadata);
            const content = formatMessageContent(message.content);
            
            messageElement.innerHTML = \`
                <div class="message-avatar">\${avatar}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-author">\${author}</span>
                        \${modeIndicator}
                        <span class="message-timestamp">\${timestamp}</span>
                    </div>
                    <div class="message-body">\${content}</div>
                    \${metadataHTML}
                </div>
            \`;
            
            elements.messagesArea.appendChild(messageElement);
            elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
        }

        function clearMessages() {
            if (!elements.messagesArea) return;
            
            elements.messagesArea.innerHTML = \`
                <div class="welcome-state">
                    <div class="welcome-icon">🤖</div>
                    <div class="welcome-title">Welcome to VSX AI Assistant</div>
                    <div class="welcome-subtitle">
                        I'm here to help you with coding, debugging, and development tasks. 
                        Select files from the context panel to provide additional context for better assistance.
                    </div>
                </div>
            \`;
        }

        function showTyping() {
            if (elements.statusIndicator) {
                elements.statusIndicator.className = 'status-indicator processing';
            }
            if (elements.typingIndicator) {
                elements.typingIndicator.classList.add('show');
            }
        }

        function hideTyping() {
            if (elements.statusIndicator) {
                elements.statusIndicator.className = 'status-indicator';
            }
            if (elements.typingIndicator) {
                elements.typingIndicator.classList.remove('show');
            }
        }

        function sendMessage() {
            if (!elements.chatInput) return;
            
            const message = elements.chatInput.value.trim();
            if (!message) return;

            addMessage({
                role: 'user',
                content: message
            });

            const contextFilesList = Array.from(contextFiles);

            vscode.postMessage({
                command: 'sendMessage',
                message: message,
                model: selectedModel,
                contextFiles: contextFilesList
            });

            elements.chatInput.value = '';
            elements.chatInput.style.height = 'auto';
            showTyping();
        }

        // Context Panel Functions
        function updateContextCount() {
            if (elements.contextCount) {
                elements.contextCount.textContent = contextFiles.size;
            }
            
            // Update context info in bottom bar
            const contextInfo = document.getElementById('contextInfo');
            if (contextInfo) {
                const count = contextFiles.size;
                contextInfo.textContent = count === 0 ? '0 files selected' : 
                    count === 1 ? '1 file selected' : count + ' files selected';
            }
            
            // Update Add Context button text
            const addContextBtn = document.getElementById('addContextBtn');
            if (addContextBtn) {
                const count = contextFiles.size;
                addContextBtn.textContent = count === 0 ? '📎 Add Context...' : 
                    '📎 Manage Context (' + count + ')';
            }
            
            // Update context chips
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
                
                chip.innerHTML = \`
                    <span class="context-chip-name" title="\${filePath}">\${fileName}</span>
                    <button class="context-chip-remove" onclick="removeContextFile('\${filePath}')">×</button>
                \`;
                
                contextChipsContainer.appendChild(chip);
            });
        }

        function removeContextFile(filePath) {
            contextFiles.delete(filePath);
            updateContextCount();
            renderFileList();
        }

        function showContextRefreshIndicator() {
            // Add refreshing animation to context chips
            const chips = document.querySelectorAll('.context-chip');
            chips.forEach(chip => {
                chip.classList.add('refreshing');
                setTimeout(() => {
                    chip.classList.remove('refreshing');
                }, 2000);
            });
            
            // Show temporary refresh indicator
            const contextInfo = document.getElementById('contextInfo');
            if (contextInfo) {
                const originalText = contextInfo.textContent;
                contextInfo.innerHTML = originalText + ' <span class="context-refresh-indicator">↻ refreshed</span>';
                setTimeout(() => {
                    contextInfo.textContent = originalText;
                }, 3000);
            }
        }

        // Make functions available globally
        window.removeContextFile = removeContextFile;

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
            availableFiles = files;
            renderFileList();
        }

        function renderFileList() {
            if (!elements.fileList) return;
            
            elements.fileList.innerHTML = '';
            
            availableFiles.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.dataset.file = file;
                
                if (contextFiles.has(file)) {
                    fileItem.classList.add('selected');
                }
                
                fileItem.innerHTML = \`
                    <div class="file-checkbox">
                        \${contextFiles.has(file) ? '✓' : ''}
                    </div>
                    <div class="file-name">\${file}</div>
                \`;
                
                fileItem.addEventListener('click', () => toggleFileContext(file));
                elements.fileList.appendChild(fileItem);
            });
        }

        function toggleFileContext(file) {
            if (contextFiles.has(file)) {
                contextFiles.delete(file);
            } else {
                contextFiles.add(file);
            }
            renderFileList();
            updateContextCount();
        }

        // Auto-resize input
        function autoResizeInput() {
            if (!elements.chatInput) return;
            
            elements.chatInput.style.height = 'auto';
            elements.chatInput.style.height = Math.min(elements.chatInput.scrollHeight, 120) + 'px';
        }

        // Event Listeners
        function setupEventListeners() {
            // Send button
            if (elements.sendButton) {
                elements.sendButton.addEventListener('click', sendMessage);
            }

            // Chat input
            if (elements.chatInput) {
                elements.chatInput.addEventListener('input', autoResizeInput);
                elements.chatInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });
            }

            // Context toggle
            if (elements.contextToggle) {
                elements.contextToggle.addEventListener('click', toggleContextPanel);
            }

            // Context close
            if (elements.contextClose) {
                elements.contextClose.addEventListener('click', closeContextPanel);
            }

            // Clear chat
            if (elements.clearChat) {
                elements.clearChat.addEventListener('click', () => {
                    vscode.postMessage({ command: 'clearChat' });
                });
            }

            // Clear chat (bottom button)
            const clearChatBottom = document.getElementById('clearChatBottom');
            if (clearChatBottom) {
                clearChatBottom.addEventListener('click', () => {
                    vscode.postMessage({ command: 'clearChat' });
                });
            }

            // Add context button
            const addContextBtn = document.getElementById('addContextBtn');
            if (addContextBtn) {
                addContextBtn.addEventListener('click', () => {
                    toggleContextPanel();
                });
            }

            // Model selector
            if (elements.modelButton && elements.modelDropdown) {
                elements.modelButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    elements.modelButton.classList.toggle('active');
                });

                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.model-selector')) {
                        elements.modelButton.classList.remove('active');
                    }
                });

                elements.modelDropdown.addEventListener('click', (e) => {
                    const option = e.target.closest('.model-option');
                    if (!option) return;

                    elements.modelDropdown.querySelectorAll('.model-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    option.classList.add('selected');

                    selectedModel = option.dataset.model;
                    const modelName = option.querySelector('.model-name');
                    if (modelName && elements.selectedModelSpan) {
                        elements.selectedModelSpan.textContent = modelName.textContent;
                    }
                    
                    elements.modelButton.classList.remove('active');
                    log('Model changed to: ' + selectedModel);
                });

                // Keyboard shortcut for model picker (Ctrl+Alt+.)
                document.addEventListener('keydown', (e) => {
                    if (e.ctrlKey && e.altKey && e.key === '.') {
                        e.preventDefault();
                        elements.modelButton.classList.toggle('active');
                    }
                });
            }
        }

        // Message handler from extension
        function handleVSCodeMessage(event) {
            const message = event.data;
            
            switch (message.command) {
                case 'addMessage':
                    hideTyping();
                    addMessage(message.message);
                    break;
                case 'clearMessages':
                    clearMessages();
                    break;
                case 'showTyping':
                    showTyping();
                    break;
                case 'hideTyping':
                    hideTyping();
                    break;
                case 'updateFileList':
                    updateFileList(message.files);
                    break;
                case 'contextFilesUpdated':
                    log('Context files updated after LLM changes');
                    // Show visual indication that context was refreshed
                    showContextRefreshIndicator();
                    break;
            }
        }

        // Initialize
        function init() {
            log('Initializing chat panel...');
            
            setupEventListeners();
            
            // Request workspace files
            vscode.postMessage({ command: 'getWorkspaceFiles' });
            
            // Set up message listener
            window.addEventListener('message', handleVSCodeMessage);
            
            log('Chat panel initialized successfully');
        }

        // Start initialization
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    </script>
</body>
</html>
  `;
}

module.exports = { getChatPanelHTML };
