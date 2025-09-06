/**
 * VSX Message Schema - Solid JSON format for all communication
 * Provides robust, reliable message handling for extension-LLM communication
 */

const MESSAGE_TYPES = {
    // User messages
    USER_MESSAGE: 'user_message',
    USER_COMMAND: 'user_command',

    // Assistant responses
    ASSISTANT_RESPONSE: 'assistant_response',
    ASSISTANT_TOOL_CALL: 'assistant_tool_call',
    ASSISTANT_TOOL_RESULT: 'assistant_tool_result',
    ASSISTANT_ERROR: 'assistant_error',

    // System messages
    SYSTEM_STATUS: 'system_status',
    SYSTEM_CONFIG: 'system_config',
    SYSTEM_ERROR: 'system_error',

    // Tool messages
    TOOL_EXECUTE: 'tool_execute',
    TOOL_RESULT: 'tool_result',
    TOOL_ERROR: 'tool_error',

    // Conversation control
    CONVERSATION_START: 'conversation_start',
    CONVERSATION_CONTINUE: 'conversation_continue',
    CONVERSATION_END: 'conversation_end',
    CONVERSATION_RECURSIVE: 'conversation_recursive'
};

const RESPONSE_MODES = {
    ASK: 'ask',           // Single response mode
    EDIT: 'edit',         // File editing mode
    RECURSIVE: 'recursive' // Multi-turn conversation
};

const TOOL_TYPES = {
    FILE_SEARCH: 'file_search',
    FILE_READ: 'file_read',
    FILE_EDIT: 'file_edit',
    FILE_CREATE: 'file_create',
    FILE_DELETE: 'file_delete',
    FILE_MOVE: 'file_move',
    FILE_COPY: 'file_copy',
    DIRECTORY_LIST: 'directory_list',
    DIRECTORY_TREE: 'directory_tree',
    TERMINAL_EXECUTE: 'terminal_execute',
    WEB_SEARCH: 'web_search'
};

/**
 * Message Schema Validator
 */
class MessageValidator {
    static validateUserMessage(message) {
        const required = ['type', 'id', 'timestamp', 'content'];
        const missing = required.filter(field => !message[field]);

        if (missing.length > 0) {
            throw new Error(`User message missing required fields: ${missing.join(', ')}`);
        }

        if (message.type !== MESSAGE_TYPES.USER_MESSAGE && message.type !== MESSAGE_TYPES.USER_COMMAND) {
            throw new Error(`Invalid user message type: ${message.type}`);
        }

        return true;
    }

    static validateAssistantResponse(message) {
        const required = ['type', 'id', 'timestamp', 'content'];
        const missing = required.filter(field => !message[field]);

        if (missing.length > 0) {
            throw new Error(`Assistant response missing required fields: ${missing.join(', ')}`);
        }

        if (message.type !== MESSAGE_TYPES.ASSISTANT_RESPONSE) {
            throw new Error(`Invalid assistant response type: ${message.type}`);
        }

        // Validate tool calls if present
        if (message.toolCalls && Array.isArray(message.toolCalls)) {
            message.toolCalls.forEach(toolCall => {
                if (!toolCall.id || !toolCall.type || !toolCall.function) {
                    throw new Error('Invalid tool call structure');
                }
            });
        }

        // Validate conversation control
        if (message.conversationControl) {
            const validControls = ['continue', 'end', 'recursive'];
            if (!validControls.includes(message.conversationControl.action)) {
                throw new Error(`Invalid conversation control action: ${message.conversationControl.action}`);
            }
        }

        return true;
    }

    static validateToolMessage(message) {
        const required = ['type', 'id', 'timestamp', 'toolCallId', 'toolType'];
        const missing = required.filter(field => !message[field]);

        if (missing.length > 0) {
            throw new Error(`Tool message missing required fields: ${missing.join(', ')}`);
        }

        if (!Object.values(TOOL_TYPES).includes(message.toolType)) {
            throw new Error(`Invalid tool type: ${message.toolType}`);
        }

        return true;
    }
}

/**
 * Message Factory - Creates properly formatted messages
 */
class MessageFactory {
    static createUserMessage(content, options = {}) {
        const message = {
            type: MESSAGE_TYPES.USER_MESSAGE,
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            content: content,
            metadata: {
                mode: options.mode || RESPONSE_MODES.ASK,
                contextFiles: options.contextFiles || [],
                model: options.model || null,
                ...options.metadata
            }
        };

        MessageValidator.validateUserMessage(message);
        return message;
    }

    static createAssistantResponse(content, options = {}) {
        const message = {
            type: MESSAGE_TYPES.ASSISTANT_RESPONSE,
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            content: content,
            metadata: {
                mode: options.mode || RESPONSE_MODES.ASK,
                model: options.model || null,
                processingTime: options.processingTime || null,
                tokensUsed: options.tokensUsed || null,
                ...options.metadata
            },
            toolCalls: options.toolCalls || [],
            conversationControl: options.conversationControl || null
        };

        MessageValidator.validateAssistantResponse(message);
        return message;
    }

    static createToolCall(toolType, functionName, parameters, options = {}) {
        return {
            id: this.generateId(),
            type: 'function',
            function: {
                name: functionName,
                parameters: parameters
            },
            metadata: {
                toolType: toolType,
                ...options.metadata
            }
        };
    }

    static createToolResult(toolCallId, result, options = {}) {
        const message = {
            type: MESSAGE_TYPES.TOOL_RESULT,
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            toolCallId: toolCallId,
            toolType: options.toolType,
            result: result,
            success: options.success !== false,
            metadata: options.metadata || {}
        };

        MessageValidator.validateToolMessage(message);
        return message;
    }

    static createSystemStatus(status, details = {}) {
        return {
            type: MESSAGE_TYPES.SYSTEM_STATUS,
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            status: status,
            details: details
        };
    }

    static createConversationControl(action, options = {}) {
        return {
            action: action,
            nextPrompt: options.nextPrompt || null,
            maxTurns: options.maxTurns || null,
            conditions: options.conditions || null
        };
    }

    static generateId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Tool Parameter Schemas
 */
const TOOL_SCHEMAS = {
    [TOOL_TYPES.FILE_SEARCH]: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search query or pattern' },
            directory: { type: 'string', description: 'Directory to search in' },
            fileTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'File extensions to include'
            },
            maxResults: { type: 'number', description: 'Maximum number of results' }
        },
        required: ['query']
    },

    [TOOL_TYPES.FILE_READ]: {
        type: 'object',
        properties: {
            filePath: { type: 'string', description: 'Path to the file to read' },
            startLine: { type: 'number', description: 'Starting line number (optional)' },
            endLine: { type: 'number', description: 'Ending line number (optional)' },
            encoding: { type: 'string', description: 'File encoding', default: 'utf8' }
        },
        required: ['filePath']
    },

    [TOOL_TYPES.FILE_EDIT]: {
        type: 'object',
        properties: {
            filePath: { type: 'string', description: 'Path to the file to edit' },
            operation: {
                type: 'string',
                enum: ['replace', 'insert', 'delete'],
                description: 'Edit operation type'
            },
            oldString: { type: 'string', description: 'String to replace (for replace operation)' },
            newString: { type: 'string', description: 'New string content' },
            lineNumber: { type: 'number', description: 'Line number for insert/delete operations' },
            createIfNotExists: { type: 'boolean', description: 'Create file if it doesn\'t exist' }
        },
        required: ['filePath', 'operation']
    },

    [TOOL_TYPES.DIRECTORY_LIST]: {
        type: 'object',
        properties: {
            directoryPath: { type: 'string', description: 'Directory path to list' },
            recursive: { type: 'boolean', description: 'Include subdirectories' },
            showHidden: { type: 'boolean', description: 'Show hidden files' }
        },
        required: ['directoryPath']
    },

    [TOOL_TYPES.FILE_MOVE]: {
        type: 'object',
        properties: {
            sourcePath: { type: 'string', description: 'Source file path' },
            destinationPath: { type: 'string', description: 'Destination file path' },
            overwrite: { type: 'boolean', description: 'Overwrite if destination exists' }
        },
        required: ['sourcePath', 'destinationPath']
    },

    [TOOL_TYPES.FILE_COPY]: {
        type: 'object',
        properties: {
            sourcePath: { type: 'string', description: 'Source file path' },
            destinationPath: { type: 'string', description: 'Destination file path' },
            overwrite: { type: 'boolean', description: 'Overwrite if destination exists' }
        },
        required: ['sourcePath', 'destinationPath']
    },

    [TOOL_TYPES.FILE_DELETE]: {
        type: 'object',
        properties: {
            filePath: { type: 'string', description: 'Path to file to delete' },
            recursive: { type: 'boolean', description: 'Delete directories recursively' }
        },
        required: ['filePath']
    }
};

/**
 * LLM Response Format Template
 */
const LLM_RESPONSE_TEMPLATE = {
    response: {
        type: 'object',
        properties: {
            content: {
                type: 'string',
                description: 'The main response content'
            },
            toolCalls: {
                type: 'array',
                description: 'Array of tool calls to execute',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        type: { type: 'string', enum: ['function'] },
                        function: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                parameters: { type: 'object' }
                            },
                            required: ['name', 'parameters']
                        }
                    },
                    required: ['id', 'type', 'function']
                }
            },
            conversationControl: {
                type: 'object',
                description: 'Control for conversation flow',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['continue', 'end', 'recursive'],
                        description: 'Conversation control action'
                    },
                    nextPrompt: {
                        type: 'string',
                        description: 'Next prompt for recursive mode'
                    },
                    maxTurns: {
                        type: 'number',
                        description: 'Maximum turns for recursive mode'
                    },
                    conditions: {
                        type: 'object',
                        description: 'Conditions for continuing conversation'
                    }
                }
            },
            metadata: {
                type: 'object',
                description: 'Additional metadata'
            }
        },
        required: ['content']
    }
};

/**
 * Message Processor - Handles message routing and validation
 */
class MessageProcessor {
    constructor() {
        this.handlers = new Map();
        this.middleware = [];
    }

    registerHandler(messageType, handler) {
        this.handlers.set(messageType, handler);
    }

    addMiddleware(middleware) {
        this.middleware.push(middleware);
    }

    async processMessage(message) {
        try {
            // Run middleware
            for (const mw of this.middleware) {
                message = await mw(message);
            }

            // Validate message
            this.validateMessage(message);

            // Route to handler
            const handler = this.handlers.get(message.type);
            if (!handler) {
                throw new Error(`No handler registered for message type: ${message.type}`);
            }

            return await handler(message);
        } catch (error) {
            console.error('Message processing error:', error);
            throw error;
        }
    }

    validateMessage(message) {
        if (!message || typeof message !== 'object') {
            throw new Error('Invalid message format');
        }

        if (!message.type) {
            throw new Error('Message missing type field');
        }

        // Type-specific validation
        switch (message.type) {
            case MESSAGE_TYPES.USER_MESSAGE:
            case MESSAGE_TYPES.USER_COMMAND:
                MessageValidator.validateUserMessage(message);
                break;
            case MESSAGE_TYPES.ASSISTANT_RESPONSE:
                MessageValidator.validateAssistantResponse(message);
                break;
            case MESSAGE_TYPES.TOOL_EXECUTE:
            case MESSAGE_TYPES.TOOL_RESULT:
            case MESSAGE_TYPES.TOOL_ERROR:
                MessageValidator.validateToolMessage(message);
                break;
        }
    }
}

module.exports = {
    MESSAGE_TYPES,
    RESPONSE_MODES,
    TOOL_TYPES,
    MessageValidator,
    MessageFactory,
    MessageProcessor,
    TOOL_SCHEMAS,
    LLM_RESPONSE_TEMPLATE
};
