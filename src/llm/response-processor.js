const { JSONValidator } = require('../utils/json-validator');
const { ResponseTypes } = require('../types/json-schemas');

class ResponseProcessor {
    constructor() {
        this.validator = new JSONValidator();
    }

    async processLLMResponse(response, context = {}) {
        try {
            // Extract text content from response
            const textContent = await this.extractTextContent(response);
            
            // Try to extract and validate JSON
            const jsonData = this.validator.extractJSONFromText(textContent);
            
            if (jsonData) {
                const validation = this.validator.validateLLMResponse(jsonData);
                
                if (validation.valid) {
                    return await this.processValidatedResponse(validation.data, context);
                } else {
                    console.warn('Invalid JSON response format:', validation.errors);
                    return this.createFallbackResponse(textContent, validation.errors);
                }
            } else {
                console.warn('No JSON found in response, creating fallback');
                return this.createFallbackResponse(textContent);
            }
        } catch (error) {
            console.error('Error processing LLM response:', error);
            return this.createErrorResponse(error.message);
        }
    }

    async extractTextContent(response) {
        if (typeof response === 'string') {
            return response;
        }
        
        if (response && response.content) {
            return response.content;
        }
        
        if (response && response.message) {
            return response.message;
        }
        
        return JSON.stringify(response);
    }

    async processValidatedResponse(data, context) {
        const { response_type, content, metadata } = data;
        
        const result = {
            type: response_type,
            content: content,
            metadata: {
                ...metadata,
                processed_at: new Date().toISOString(),
                valid_json: true
            },
            actions: []
        };

        switch (response_type) {
            case ResponseTypes.FILE_OPERATIONS:
                result.actions = await this.processFileOperations(content.operations || [], context);
                break;
                
            case ResponseTypes.TERMINAL_COMMANDS:
                result.actions = await this.processTerminalCommands(content.commands || [], context);
                break;
                
            case ResponseTypes.PLAN_EXECUTION:
                result.actions = await this.processPlanExecution(content.plan, context);
                break;
                
            case ResponseTypes.MIXED_RESPONSE:
                result.actions = await this.processMixedResponse(content.components || [], context);
                break;

            case 'tool_calls':
                result.actions = await this.processToolCalls(content.tool_calls || [], context);
                break;
                
            case ResponseTypes.SIMPLE_RESPONSE:
            case ResponseTypes.ERROR_RESPONSE:
            default:
                // No additional processing needed
                break;
        }

        return result;
    }

    async processFileOperations(operations, context) {
        const actions = [];
        
        for (const op of operations) {
            actions.push({
                type: 'file_operation',
                operation: op.type,
                file_path: op.file_path,
                content: op.content,
                language: op.language,
                backup_original: op.backup_original !== false,
                status: 'pending'
            });
        }
        
        return actions;
    }

    async processTerminalCommands(commands, context) {
        const actions = [];
        
        for (const cmd of commands) {
            actions.push({
                type: 'terminal_command',
                command: cmd.command,
                description: cmd.description,
                working_directory: cmd.working_directory || context.workspaceRoot || './',
                require_confirmation: cmd.require_confirmation !== false,
                risk_level: cmd.risk_level || 'medium',
                status: 'pending'
            });
        }
        
        return actions;
    }

    async processPlanExecution(plan, context) {
        if (!plan || !plan.steps) {
            return [];
        }

        return [{
            type: 'plan_execution',
            plan: plan,
            status: 'pending',
            steps_status: plan.steps.map(step => ({
                id: step.id,
                status: 'pending',
                start_time: null,
                end_time: null,
                results: null
            }))
        }];
    }

    async processMixedResponse(components, context) {
        const actions = [];
        
        for (const component of components) {
            switch (component.type) {
                case 'file_operations':
                    const fileActions = await this.processFileOperations(
                        component.data.operations || [], 
                        context
                    );
                    actions.push(...fileActions);
                    break;
                    
                case 'terminal_commands':
                    const terminalActions = await this.processTerminalCommands(
                        component.data.commands || [], 
                        context
                    );
                    actions.push(...terminalActions);
                    break;
                    
                case 'plan':
                    const planActions = await this.processPlanExecution(
                        component.data,
                        context
                    );
                    actions.push(...planActions);
                    break;
            }
        }
        
        return actions;
    }

    async processToolCalls(toolCalls, context) {
        const actions = [];
        
        for (const call of toolCalls) {
            actions.push({
                type: 'tool_call',
                tool: call.tool,
                parameters: call.parameters,
                id: call.id,
                status: 'pending'
            });
        }
        
        return actions;
    }

    createFallbackResponse(textContent, errors = []) {
        return {
            type: ResponseTypes.SIMPLE_RESPONSE,
            content: {
                text: textContent,
                suggestions: errors.length > 0 ? ['Check response format'] : []
            },
            metadata: {
                timestamp: new Date().toISOString(),
                valid_json: false,
                fallback: true,
                validation_errors: errors
            },
            actions: []
        };
    }

    createErrorResponse(errorMessage) {
        return {
            type: ResponseTypes.ERROR_RESPONSE,
            content: {
                error: {
                    message: errorMessage,
                    code: 'PROCESSING_ERROR',
                    suggestions: ['Please try rephrasing your request']
                }
            },
            metadata: {
                timestamp: new Date().toISOString(),
                valid_json: false,
                error: true
            },
            actions: []
        };
    }
}

module.exports = { ResponseProcessor };
