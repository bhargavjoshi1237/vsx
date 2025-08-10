/**
 * Token Usage Optimization
 * Manages token counting, context windowing, and cost optimization
 */

class TokenOptimizer {
    constructor() {
        this.tokenCosts = {
            'gemini-2.0-flash-exp': {
                input: 0.000075,  // per 1K tokens
                output: 0.0003    // per 1K tokens
            }
        };
        this.usageHistory = [];
        this.maxContextTokens = 30000; // Conservative limit for Gemini
        this.reservedTokens = 2000;    // Reserve for response
    }

    /**
     * Initialize the token optimizer
     */
    initialize(config = {}) {
        this.maxContextTokens = config.maxContextTokens || this.maxContextTokens;
        this.reservedTokens = config.reservedTokens || this.reservedTokens;
        
        if (config.tokenCosts) {
            this.tokenCosts = { ...this.tokenCosts, ...config.tokenCosts };
        }
        
        console.log('Token Optimizer initialized');
    }

    /**
     * Estimate token count for text
     */
    estimateTokens(text) {
        if (!text) return 0;
        
        // More accurate estimation based on Gemini tokenization patterns
        // Rough approximation: 1 token ≈ 3.5 characters for code, 4 for natural language
        const codePatterns = /[{}();,.\[\]]/g;
        const codeMatches = (text.match(codePatterns) || []).length;
        
        if (codeMatches > text.length * 0.1) {
            // Likely code content
            return Math.ceil(text.length / 3.5);
        } else {
            // Natural language
            return Math.ceil(text.length / 4);
        }
    }

    /**
     * Estimate cost for a request
     */
    estimateCost(inputTokens, outputTokens, model = 'gemini-2.0-flash-exp') {
        const costs = this.tokenCosts[model];
        if (!costs) {
            return { error: `Unknown model: ${model}` };
        }

        const inputCost = (inputTokens / 1000) * costs.input;
        const outputCost = (outputTokens / 1000) * costs.output;
        
        return {
            inputCost,
            outputCost,
            totalCost: inputCost + outputCost,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens
        };
    }

    /**
     * Optimize context for token efficiency
     */
    optimizeContext(context, maxTokens = null) {
        const targetTokens = maxTokens || (this.maxContextTokens - this.reservedTokens);
        
        const optimized = {
            systemPrompt: context.systemPrompt || '',
            projectContext: context.projectContext || '',
            fileContext: context.fileContext || '',
            conversationHistory: context.conversationHistory || [],
            workingMemory: context.workingMemory || [],
            userMessage: context.userMessage || ''
        };

        // Calculate current token usage
        let currentTokens = this.calculateContextTokens(optimized);
        
        if (currentTokens <= targetTokens) {
            return {
                optimized,
                tokensUsed: currentTokens,
                tokensRemaining: targetTokens - currentTokens,
                optimizationsApplied: []
            };
        }

        const optimizationsApplied = [];

        // Optimization strategy: prioritize recent and relevant content
        
        // 1. Truncate working memory (keep most relevant)
        if (optimized.workingMemory.length > 0 && currentTokens > targetTokens) {
            const originalLength = optimized.workingMemory.length;
            optimized.workingMemory = this.truncateWorkingMemory(optimized.workingMemory, targetTokens * 0.1);
            currentTokens = this.calculateContextTokens(optimized);
            
            if (originalLength > optimized.workingMemory.length) {
                optimizationsApplied.push(`Reduced working memory from ${originalLength} to ${optimized.workingMemory.length} items`);
            }
        }

        // 2. Truncate conversation history (keep recent)
        if (optimized.conversationHistory.length > 0 && currentTokens > targetTokens) {
            const originalLength = optimized.conversationHistory.length;
            optimized.conversationHistory = this.truncateConversationHistory(optimized.conversationHistory, targetTokens * 0.3);
            currentTokens = this.calculateContextTokens(optimized);
            
            if (originalLength > optimized.conversationHistory.length) {
                optimizationsApplied.push(`Reduced conversation history from ${originalLength} to ${optimized.conversationHistory.length} messages`);
            }
        }

        // 3. Compress file context (keep essential info)
        if (optimized.fileContext && currentTokens > targetTokens) {
            const originalTokens = this.estimateTokens(optimized.fileContext);
            optimized.fileContext = this.compressFileContext(optimized.fileContext, targetTokens * 0.2);
            const newTokens = this.estimateTokens(optimized.fileContext);
            currentTokens = this.calculateContextTokens(optimized);
            
            if (newTokens < originalTokens) {
                optimizationsApplied.push(`Compressed file context from ${originalTokens} to ${newTokens} tokens`);
            }
        }

        // 4. Compress project context (keep structure only)
        if (optimized.projectContext && currentTokens > targetTokens) {
            const originalTokens = this.estimateTokens(optimized.projectContext);
            optimized.projectContext = this.compressProjectContext(optimized.projectContext);
            const newTokens = this.estimateTokens(optimized.projectContext);
            currentTokens = this.calculateContextTokens(optimized);
            
            if (newTokens < originalTokens) {
                optimizationsApplied.push(`Compressed project context from ${originalTokens} to ${newTokens} tokens`);
            }
        }

        return {
            optimized,
            tokensUsed: currentTokens,
            tokensRemaining: Math.max(0, targetTokens - currentTokens),
            optimizationsApplied,
            wasOptimized: optimizationsApplied.length > 0
        };
    }

    /**
     * Calculate total tokens for context
     */
    calculateContextTokens(context) {
        let total = 0;
        
        total += this.estimateTokens(context.systemPrompt);
        total += this.estimateTokens(context.projectContext);
        total += this.estimateTokens(context.fileContext);
        total += this.estimateTokens(context.userMessage);
        
        // Conversation history
        if (context.conversationHistory) {
            for (const message of context.conversationHistory) {
                total += this.estimateTokens(message.content || message);
            }
        }
        
        // Working memory
        if (context.workingMemory) {
            for (const item of context.workingMemory) {
                total += this.estimateTokens(JSON.stringify(item.content || item));
            }
        }
        
        return total;
    }

    /**
     * Truncate working memory keeping most relevant items
     */
    truncateWorkingMemory(memory, maxTokens) {
        if (!memory || memory.length === 0) return memory;
        
        // Sort by relevance score (descending)
        const sorted = [...memory].sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        
        const truncated = [];
        let currentTokens = 0;
        
        for (const item of sorted) {
            const itemTokens = this.estimateTokens(JSON.stringify(item.content || item));
            if (currentTokens + itemTokens <= maxTokens) {
                truncated.push(item);
                currentTokens += itemTokens;
            } else {
                break;
            }
        }
        
        return truncated;
    }

    /**
     * Truncate conversation history keeping recent messages
     */
    truncateConversationHistory(history, maxTokens) {
        if (!history || history.length === 0) return history;
        
        const truncated = [];
        let currentTokens = 0;
        
        // Start from most recent messages
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            const messageTokens = this.estimateTokens(message.content || message);
            
            if (currentTokens + messageTokens <= maxTokens) {
                truncated.unshift(message);
                currentTokens += messageTokens;
            } else {
                break;
            }
        }
        
        return truncated;
    }

    /**
     * Compress file context to essential information
     */
    compressFileContext(fileContext, maxTokens) {
        if (!fileContext) return fileContext;
        
        const currentTokens = this.estimateTokens(fileContext);
        if (currentTokens <= maxTokens) return fileContext;
        
        // Extract key information: file names, structure, key functions
        const lines = fileContext.split('\n');
        const compressed = [];
        let tokens = 0;
        
        for (const line of lines) {
            // Prioritize important lines
            if (this.isImportantLine(line)) {
                const lineTokens = this.estimateTokens(line);
                if (tokens + lineTokens <= maxTokens) {
                    compressed.push(line);
                    tokens += lineTokens;
                } else {
                    break;
                }
            }
        }
        
        if (compressed.length < lines.length) {
            compressed.push(`\n[... ${lines.length - compressed.length} lines truncated for token limit ...]`);
        }
        
        return compressed.join('\n');
    }

    /**
     * Check if a line contains important information
     */
    isImportantLine(line) {
        const importantPatterns = [
            /^##?\s+/,           // Headers
            /^-\s+/,             // List items
            /^class\s+/,         // Class definitions
            /^function\s+/,      // Function definitions
            /^const\s+/,         // Constants
            /^import\s+/,        // Imports
            /^export\s+/,        // Exports
            /^\s*\/\*\*/,        // JSDoc comments
            /Path:|Structure:|Dependencies:/ // Context markers
        ];
        
        return importantPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Compress project context to essential structure
     */
    compressProjectContext(projectContext) {
        if (!projectContext) return projectContext;
        
        // Keep only essential project information
        const lines = projectContext.split('\n');
        const essential = lines.filter(line => {
            return line.includes('Path:') || 
                   line.includes('Dependencies:') || 
                   line.includes('Structure:') ||
                   line.trim().startsWith('-') ||
                   line.trim().startsWith('##');
        });
        
        return essential.join('\n');
    }

    /**
     * Track token usage for analytics
     */
    trackUsage(usage) {
        this.usageHistory.push({
            timestamp: Date.now(),
            ...usage
        });
        
        // Keep only last 100 entries
        if (this.usageHistory.length > 100) {
            this.usageHistory = this.usageHistory.slice(-100);
        }
    }

    /**
     * Get usage statistics
     */
    getUsageStats() {
        if (this.usageHistory.length === 0) {
            return {
                totalRequests: 0,
                totalTokens: 0,
                totalCost: 0,
                averageTokensPerRequest: 0,
                averageCostPerRequest: 0
            };
        }
        
        const totalRequests = this.usageHistory.length;
        const totalTokens = this.usageHistory.reduce((sum, usage) => sum + (usage.totalTokens || 0), 0);
        const totalCost = this.usageHistory.reduce((sum, usage) => sum + (usage.totalCost || 0), 0);
        
        return {
            totalRequests,
            totalTokens,
            totalCost,
            averageTokensPerRequest: Math.round(totalTokens / totalRequests),
            averageCostPerRequest: totalCost / totalRequests,
            recentUsage: this.usageHistory.slice(-10)
        };
    }

    /**
     * Check if request is within budget
     */
    checkBudget(estimatedTokens, dailyBudget = 1.0) {
        const today = new Date().toDateString();
        const todayUsage = this.usageHistory.filter(usage => 
            new Date(usage.timestamp).toDateString() === today
        );
        
        const todayCost = todayUsage.reduce((sum, usage) => sum + (usage.totalCost || 0), 0);
        const estimatedCost = this.estimateCost(estimatedTokens, estimatedTokens * 0.5);
        
        return {
            withinBudget: todayCost + estimatedCost.totalCost <= dailyBudget,
            todaySpent: todayCost,
            estimatedCost: estimatedCost.totalCost,
            remainingBudget: dailyBudget - todayCost,
            dailyBudget
        };
    }

    /**
     * Get optimization recommendations
     */
    getOptimizationRecommendations() {
        const stats = this.getUsageStats();
        const recommendations = [];
        
        if (stats.averageTokensPerRequest > 10000) {
            recommendations.push('Consider reducing context size - average request uses many tokens');
        }
        
        if (stats.totalCost > 0.1) {
            recommendations.push('High token usage detected - consider implementing more aggressive optimization');
        }
        
        const recentHighUsage = this.usageHistory.slice(-5).filter(usage => 
            (usage.totalTokens || 0) > 15000
        );
        
        if (recentHighUsage.length > 2) {
            recommendations.push('Recent requests are token-heavy - review context optimization settings');
        }
        
        return recommendations;
    }
}

module.exports = { TokenOptimizer };