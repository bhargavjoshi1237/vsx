/**
 * Context Storage and Retrieval
 * Manages conversation history, project context, and working memory
 */

class ContextManager {
    constructor() {
        this.sessions = new Map();
        this.workingMemory = new Map();
        this.projectContext = null;
        this.maxMemorySize = 1000; // Maximum number of items in working memory
    }

    /**
     * Initialize the context manager
     */
    initialize(dependencies) {
        this.storage = dependencies.storage;
        console.log('Context Manager initialized');
    }

    /**
     * Create a new session
     */
    async createSession(context = {}) {
        const sessionId = this.generateSessionId();
        const session = {
            id: sessionId,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            context: {
                projectPath: context.projectPath || null,
                activeFiles: context.activeFiles || [],
                userPreferences: context.userPreferences || {},
                contextFiles: context.contextFiles || [],
                ...context
            },
            interactions: [],
            metadata: {
                totalInteractions: 0,
                totalTokensUsed: 0,
                averageResponseTime: 0
            }
        };

        this.sessions.set(sessionId, session);
        
        // Load project context if available
        if (session.context.projectPath) {
            await this.loadProjectContext(session.context.projectPath);
        }

        return session;
    }

    /**
     * Store an interaction in the session
     */
    async storeInteraction(sessionId, interaction) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const enrichedInteraction = {
            id: this.generateInteractionId(),
            timestamp: Date.now(),
            ...interaction
        };

        session.interactions.push(enrichedInteraction);
        session.lastActivity = Date.now();
        session.metadata.totalInteractions++;

        // Update working memory
        this.updateWorkingMemory(sessionId, enrichedInteraction);

        // Persist to storage if available
        if (this.storage) {
            await this.storage.storeInteraction(sessionId, enrichedInteraction);
        }

        return enrichedInteraction;
    }

    /**
     * Get session context for LLM prompts
     */
    getSessionContext(sessionId, options = {}) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        const context = {
            session: {
                id: sessionId,
                duration: Date.now() - session.createdAt,
                totalInteractions: session.metadata.totalInteractions
            },
            project: this.projectContext,
            recentInteractions: this.getRecentInteractions(sessionId, options.maxInteractions || 10),
            workingMemory: this.getRelevantMemory(sessionId, options.query),
            activeFiles: session.context.activeFiles,
            contextFiles: session.context.contextFiles || [],
            projectPath: session.context.projectPath,
            userPreferences: session.context.userPreferences
        };

        return context;
    }

    /**
     * Get recent interactions from session
     */
    getRecentInteractions(sessionId, maxCount = 10) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return [];
        }

        return session.interactions
            .slice(-maxCount)
            .map(interaction => ({
                timestamp: interaction.timestamp,
                request: interaction.request,
                response: interaction.response,
                tools: interaction.tools || []
            }));
    }

    /**
     * Update working memory with new information
     */
    updateWorkingMemory(sessionId, interaction) {
        const memoryKey = `${sessionId}_working`;
        let memory = this.workingMemory.get(memoryKey) || [];

        // Extract important information from interaction
        const memoryItem = {
            timestamp: interaction.timestamp,
            type: this.classifyInteraction(interaction),
            content: this.extractKeyInformation(interaction),
            relevanceScore: this.calculateRelevance(interaction)
        };

        memory.push(memoryItem);

        // Trim memory if it exceeds max size
        if (memory.length > this.maxMemorySize) {
            memory = memory
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, this.maxMemorySize);
        }

        this.workingMemory.set(memoryKey, memory);
    }

    /**
     * Get relevant memory items for a query
     */
    getRelevantMemory(sessionId, query, maxItems = 5) {
        const memoryKey = `${sessionId}_working`;
        const memory = this.workingMemory.get(memoryKey) || [];

        if (!query) {
            return memory.slice(-maxItems);
        }

        // TODO: Implement semantic similarity search
        return memory
            .filter(item => this.isRelevantToQuery(item, query))
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, maxItems);
    }

    /**
     * Load project context from workspace
     */
    async loadProjectContext(projectPath) {
        try {
            // TODO: Implement project analysis
            this.projectContext = {
                path: projectPath,
                structure: {},
                dependencies: [],
                patterns: [],
                lastAnalyzed: Date.now()
            };
        } catch (error) {
            console.error('Failed to load project context:', error);
        }
    }

    /**
     * Classify interaction type
     */
    classifyInteraction(interaction) {
        // TODO: Implement interaction classification
        if (interaction.tools && interaction.tools.length > 0) {
            return 'tool_usage';
        }
        if (interaction.request && interaction.request.includes('file')) {
            return 'file_operation';
        }
        return 'general_query';
    }

    /**
     * Extract key information from interaction
     */
    extractKeyInformation(interaction) {
        // TODO: Implement information extraction
        return {
            summary: interaction.request?.substring(0, 100) || '',
            entities: [],
            keywords: []
        };
    }

    /**
     * Calculate relevance score for memory item
     */
    calculateRelevance(interaction) {
        // TODO: Implement relevance scoring
        const recencyScore = Math.max(0, 1 - (Date.now() - interaction.timestamp) / (24 * 60 * 60 * 1000));
        const importanceScore = interaction.tools ? 0.8 : 0.5;
        return recencyScore * 0.3 + importanceScore * 0.7;
    }

    /**
     * Check if memory item is relevant to query
     */
    isRelevantToQuery(memoryItem, query) {
        // TODO: Implement semantic relevance check
        const queryLower = query.toLowerCase();
        const contentStr = JSON.stringify(memoryItem.content).toLowerCase();
        return contentStr.includes(queryLower);
    }

    /**
     * Close session and cleanup
     */
    async closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            // Persist session data if needed
            if (this.storage) {
                await this.storage.storeSession(session);
            }
            
            this.sessions.delete(sessionId);
            this.workingMemory.delete(`${sessionId}_working`);
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique interaction ID
     */
    generateInteractionId() {
        return `interaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get session statistics
     */
    getSessionStats(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        return {
            id: sessionId,
            duration: Date.now() - session.createdAt,
            totalInteractions: session.metadata.totalInteractions,
            totalTokensUsed: session.metadata.totalTokensUsed,
            averageResponseTime: session.metadata.averageResponseTime,
            memoryItems: this.workingMemory.get(`${sessionId}_working`)?.length || 0
        };
    }
}

module.exports = { ContextManager };