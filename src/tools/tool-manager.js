/**
 * Tool Registration and Execution Manager
 * Manages all available tools and their execution
 */

const { FileTools } = require('./file-tools');

class ToolManager {
    constructor() {
        this.tools = new Map();
        this.toolCategories = new Map();
        this.executionHistory = [];
        this.maxHistorySize = 100;
    }

    /**
     * Initialize the tool manager with all available tools
     */
    initialize() {
        // Register file tools
        this.fileTools = new FileTools();
        this.registerToolCategory('file', this.fileTools);
        
        console.log('Tool Manager initialized with', this.tools.size, 'tools');
    }

    /**
     * Register a tool category
     */
    registerToolCategory(categoryName, toolProvider) {
        this.toolCategories.set(categoryName, toolProvider);
        
        // Register individual tools from the provider
        const availableTools = toolProvider.getAvailableTools();
        for (const tool of availableTools) {
            this.tools.set(tool.name, {
                ...tool,
                category: categoryName,
                provider: toolProvider
            });
        }
    }

    /**
     * Execute a tool by name
     */
    async executeTool(toolName, parameters = {}) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found. Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
        }

        // Validate parameters
        const validation = this.validateToolParameters(toolName, parameters);
        if (!validation.valid) {
            throw new Error(`Invalid parameters for tool '${toolName}': ${validation.errors.join(', ')}`);
        }

        const executionStart = Date.now();
        
        try {
            console.log(`Executing tool: ${toolName} with parameters:`, parameters);
            
            const result = await tool.provider.executeTool(toolName, parameters);
            const executionTime = Date.now() - executionStart;
            
            // Record execution in history
            this.recordExecution({
                toolName,
                parameters,
                result,
                executionTime,
                success: result.success,
                timestamp: new Date().toISOString()
            });

            console.log(`Tool ${toolName} executed in ${executionTime}ms`);
            return result;
            
        } catch (error) {
            const executionTime = Date.now() - executionStart;
            
            // Record failed execution
            this.recordExecution({
                toolName,
                parameters,
                error: error.message,
                executionTime,
                success: false,
                timestamp: new Date().toISOString()
            });

            console.error(`Tool ${toolName} failed after ${executionTime}ms:`, error.message);
            throw error;
        }
    }

    /**
     * Execute multiple tools in sequence
     */
    async executeToolSequence(toolSequence) {
        const results = [];
        
        for (const { toolName, parameters } of toolSequence) {
            try {
                const result = await this.executeTool(toolName, parameters);
                results.push(result);
                
                // If a tool fails and it's marked as critical, stop execution
                if (!result.success && parameters._critical !== false) {
                    break;
                }
            } catch (error) {
                results.push({
                    toolName,
                    success: false,
                    error: error.message,
                    executedAt: new Date().toISOString()
                });
                
                // Stop on error unless explicitly told to continue
                if (parameters._continueOnError !== true) {
                    break;
                }
            }
        }
        
        return {
            success: results.every(r => r.success),
            results,
            totalTools: toolSequence.length,
            executedTools: results.length
        };
    }

    /**
     * Get tool information
     */
    getToolInfo(toolName) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            return null;
        }

        return {
            name: tool.name,
            description: tool.description,
            category: tool.category,
            parameters: tool.parameters,
            usage: this.getToolUsageStats(toolName)
        };
    }

    /**
     * Get all available tools
     */
    getAvailableTools() {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            category: tool.category,
            parameters: tool.parameters
        }));
    }

    /**
     * Get tools by category
     */
    getToolsByCategory(category) {
        return Array.from(this.tools.values())
            .filter(tool => tool.category === category)
            .map(tool => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }));
    }

    /**
     * Validate tool parameters
     */
    validateToolParameters(toolName, parameters) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            return { valid: false, errors: [`Tool '${toolName}' not found`] };
        }

        return tool.provider.validateParameters(toolName, parameters);
    }

    /**
     * Record tool execution in history
     */
    recordExecution(execution) {
        this.executionHistory.push(execution);
        
        // Trim history if it gets too large
        if (this.executionHistory.length > this.maxHistorySize) {
            this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Get execution history
     */
    getExecutionHistory(limit = 10) {
        return this.executionHistory.slice(-limit);
    }

    /**
     * Get tool usage statistics
     */
    getToolUsageStats(toolName = null) {
        const history = toolName 
            ? this.executionHistory.filter(e => e.toolName === toolName)
            : this.executionHistory;

        if (history.length === 0) {
            return {
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                averageExecutionTime: 0,
                successRate: 0
            };
        }

        const successful = history.filter(e => e.success);
        const failed = history.filter(e => !e.success);
        const totalTime = history.reduce((sum, e) => sum + (e.executionTime || 0), 0);

        return {
            totalExecutions: history.length,
            successfulExecutions: successful.length,
            failedExecutions: failed.length,
            averageExecutionTime: Math.round(totalTime / history.length),
            successRate: Math.round((successful.length / history.length) * 100),
            recentExecutions: history.slice(-5)
        };
    }

    /**
     * Get recommended tools for a task
     */
    getRecommendedTools(taskDescription) {
        const keywords = taskDescription.toLowerCase();
        const recommendations = [];

        // Simple keyword-based recommendations
        if (keywords.includes('read') || keywords.includes('file') || keywords.includes('content')) {
            recommendations.push('readFile');
        }
        
        if (keywords.includes('write') || keywords.includes('save') || keywords.includes('create')) {
            recommendations.push('writeFile');
        }
        
        if (keywords.includes('search') || keywords.includes('find')) {
            recommendations.push('searchInFiles');
        }
        
        if (keywords.includes('list') || keywords.includes('directory') || keywords.includes('folder')) {
            recommendations.push('listFiles');
        }
        
        if (keywords.includes('active') || keywords.includes('current')) {
            recommendations.push('getActiveFile');
        }
        
        if (keywords.includes('workspace') || keywords.includes('project')) {
            recommendations.push('getWorkspaceInfo');
        }

        return recommendations.map(toolName => this.getToolInfo(toolName)).filter(Boolean);
    }

    /**
     * Clear execution history
     */
    clearHistory() {
        this.executionHistory = [];
    }

    /**
     * Get tool manager statistics
     */
    getStats() {
        const categories = Array.from(this.toolCategories.keys());
        const totalTools = this.tools.size;
        const usageStats = this.getToolUsageStats();

        return {
            totalTools,
            categories: categories.length,
            categoryBreakdown: categories.map(cat => ({
                name: cat,
                toolCount: this.getToolsByCategory(cat).length
            })),
            usage: usageStats,
            historySize: this.executionHistory.length
        };
    }

    /**
     * Export tool definitions for documentation
     */
    exportToolDefinitions() {
        const tools = this.getAvailableTools();
        
        return {
            version: '1.0.0',
            generatedAt: new Date().toISOString(),
            totalTools: tools.length,
            categories: Array.from(this.toolCategories.keys()),
            tools: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                category: tool.category,
                parameters: Object.entries(tool.parameters).map(([name, def]) => ({
                    name,
                    type: def.type,
                    required: def.required,
                    description: def.description
                }))
            }))
        };
    }
}

module.exports = { ToolManager };