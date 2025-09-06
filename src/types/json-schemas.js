/**
 * JSON Schema definitions for VSX extension communication
 */

const ResponseTypes = {
    SIMPLE_RESPONSE: 'simple_response',
    FILE_OPERATIONS: 'file_operations', 
    TERMINAL_COMMANDS: 'terminal_commands',
    PLAN_EXECUTION: 'plan_execution',
    ERROR_RESPONSE: 'error_response',
    MIXED_RESPONSE: 'mixed_response'
};

const FileOperationType = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete'
};

const TerminalCommandStatus = {
    PENDING: 'pending',
    RUNNING: 'running', 
    COMPLETED: 'completed',
    FAILED: 'failed'
};

const PlanStepStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped'
};

// Schema for LLM responses
const LLMResponseSchema = {
    type: 'object',
    required: ['response_type', 'content', 'metadata'],
    properties: {
        response_type: {
            type: 'string',
            enum: Object.values(ResponseTypes)
        },
        content: {
            type: 'object',
            oneOf: [
                { $ref: '#/definitions/SimpleResponse' },
                { $ref: '#/definitions/FileOperationsResponse' },
                { $ref: '#/definitions/TerminalCommandsResponse' },
                { $ref: '#/definitions/PlanExecutionResponse' },
                { $ref: '#/definitions/ErrorResponse' },
                { $ref: '#/definitions/MixedResponse' }
            ]
        },
        metadata: {
            type: 'object',
            properties: {
                timestamp: { type: 'string', format: 'date-time' },
                model: { type: 'string' },
                processing_time_ms: { type: 'number' },
                token_count: { type: 'number' },
                context_files: { type: 'array', items: { type: 'string' } },
                user_mode: { type: 'string', enum: ['ask', 'edit', 'legacy'] }
            },
            required: ['timestamp']
        }
    },
    definitions: {
        SimpleResponse: {
            type: 'object',
            required: ['text'],
            properties: {
                text: { type: 'string' },
                suggestions: { type: 'array', items: { type: 'string' } }
            }
        },
        FileOperationsResponse: {
            type: 'object',
            required: ['operations'],
            properties: {
                text: { type: 'string' },
                operations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['type', 'file_path'],
                        properties: {
                            type: { type: 'string', enum: Object.values(FileOperationType) },
                            file_path: { type: 'string' },
                            content: { type: 'string' },
                            language: { type: 'string' },
                            encoding: { type: 'string', default: 'utf8' },
                            backup_original: { type: 'boolean', default: true }
                        }
                    }
                }
            }
        },
        TerminalCommandsResponse: {
            type: 'object',
            required: ['commands'],
            properties: {
                text: { type: 'string' },
                commands: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['command'],
                        properties: {
                            command: { type: 'string' },
                            description: { type: 'string' },
                            working_directory: { type: 'string' },
                            require_confirmation: { type: 'boolean', default: true },
                            risk_level: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' }
                        }
                    }
                }
            }
        },
        PlanExecutionResponse: {
            type: 'object',
            required: ['plan'],
            properties: {
                text: { type: 'string' },
                plan: {
                    type: 'object',
                    required: ['title', 'steps'],
                    properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        estimated_duration: { type: 'string' },
                        steps: {
                            type: 'array',
                            items: {
                                type: 'object',
                                required: ['id', 'title', 'objective'],
                                properties: {
                                    id: { type: 'number' },
                                    title: { type: 'string' },
                                    objective: { type: 'string' },
                                    dependencies: { type: 'array', items: { type: 'number' } },
                                    estimated_duration: { type: 'string' },
                                    required_files: { type: 'array', items: { type: 'string' } },
                                    expected_outputs: { type: 'array', items: { type: 'string' } }
                                }
                            }
                        }
                    }
                }
            }
        },
        ErrorResponse: {
            type: 'object',
            required: ['error'],
            properties: {
                error: {
                    type: 'object',
                    required: ['message'],
                    properties: {
                        message: { type: 'string' },
                        code: { type: 'string' },
                        details: { type: 'object' },
                        suggestions: { type: 'array', items: { type: 'string' } }
                    }
                }
            }
        },
        MixedResponse: {
            type: 'object',
            required: ['components'],
            properties: {
                text: { type: 'string' },
                components: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: ['type', 'data'],
                        properties: {
                            type: { type: 'string', enum: ['text', 'file_operations', 'terminal_commands', 'plan'] },
                            data: { type: 'object' }
                        }
                    }
                }
            }
        }
    }
};

module.exports = {
    ResponseTypes,
    FileOperationType,
    TerminalCommandStatus,
    PlanStepStatus,
    LLMResponseSchema
};
