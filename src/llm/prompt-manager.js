/**
 * Prompt Templates and Management
 * Handles system prompts, user prompts, and context injection
 */

class PromptManager {
    constructor() {
        this.systemPrompts = new Map();
        this.userPrompts = new Map();
        this.promptTemplates = new Map();
        this.contextInjectors = new Map();
    }

    /**
     * Initialize the prompt manager
     */
    initialize() {
        this.loadDefaultPrompts();
        console.log('Prompt Manager initialized');
    }

    /**
     * Load default system prompts
     */
    loadDefaultPrompts() {
        // Core system prompt
        this.systemPrompts.set('core', `You are VSX, an AI assistant built into VS Code that helps developers with coding tasks.

Key capabilities:
- Analyze and modify code files
- Generate implementation plans
- Execute tasks step by step
- Maintain context across conversations
- Use tools to interact with the file system

Guidelines:
- Be concise and practical
- Focus on actionable solutions
- Ask for clarification when needed
- Explain your reasoning briefly
- Prioritize code quality and best practices`);

        // Coding-specific prompt
        this.systemPrompts.set('coding', `You are a coding assistant specializing in software development.

When helping with code:
- Analyze the existing codebase structure
- Follow established patterns and conventions
- Write clean, maintainable code
- Include appropriate error handling
- Add helpful comments where needed
- Consider performance and security implications

Always explain your approach before implementing changes.`);

        // Planning prompt
        this.systemPrompts.set('planning', `You are a task planning specialist.

When creating plans:
- Break complex tasks into clear, actionable steps
- Identify dependencies between steps
- Estimate time and complexity
- Consider potential risks and alternatives
- Make plans flexible and adaptable

Format plans as structured markdown with clear step descriptions.`);

        // File operation prompt
        this.systemPrompts.set('file_operations', `You are a file system specialist.

When working with files:
- Always read files before modifying them
- Create backups for important changes
- Use appropriate file paths and naming
- Handle errors gracefully
- Validate file contents and structure
- Respect existing file organization`);
    }

    /**
     * Get system prompt by type
     */
    getSystemPrompt(type = 'core') {
        return this.systemPrompts.get(type) || this.systemPrompts.get('core');
    }

    /**
     * Build complete prompt with context
     */
    buildPrompt(userMessage, options = {}) {
        const {
            systemPromptType = 'core',
            context = {},
            includeHistory = true,
            maxHistoryItems = 5
        } = options;

        let prompt = '';

        // Add system prompt
        const systemPrompt = this.getSystemPrompt(systemPromptType);
        prompt += `${systemPrompt}\n\n`;

        // Add context information
        if (context.project) {
            prompt += this.injectProjectContext(context.project);
        }

        if (context.activeFiles && context.activeFiles.length > 0) {
            prompt += this.injectFileContext(context.activeFiles);
        }

        if (context.recentInteractions && includeHistory) {
            prompt += this.injectHistoryContext(context.recentInteractions, maxHistoryItems);
        }

        if (context.workingMemory && context.workingMemory.length > 0) {
            prompt += this.injectMemoryContext(context.workingMemory);
        }

        // Add current user message
        prompt += `\nUser: ${userMessage}\n\nAssistant:`;

        return prompt;
    }

    /**
     * Build contextual conversation
     */
    buildConversation(userMessage, options = {}) {
        const {
            systemPromptType = 'core',
            context = {},
            includeHistory = true,
            maxHistoryItems = 10
        } = options;

        const messages = [];

        // System message
        let systemContent = this.getSystemPrompt(systemPromptType);
        
        // Add context to system message
        if (context.project || context.activeFiles || context.workingMemory) {
            systemContent += '\n\n## Current Context\n';
            
            if (context.project) {
                systemContent += this.injectProjectContext(context.project);
            }
            
            if (context.activeFiles && context.activeFiles.length > 0) {
                systemContent += this.injectFileContext(context.activeFiles);
            }
            
            if (context.workingMemory && context.workingMemory.length > 0) {
                systemContent += this.injectMemoryContext(context.workingMemory);
            }
        }

        messages.push({
            role: 'system',
            content: systemContent
        });

        // Add conversation history
        if (includeHistory && context.recentInteractions) {
            const historyItems = context.recentInteractions.slice(-maxHistoryItems);
            
            for (const interaction of historyItems) {
                messages.push({
                    role: 'user',
                    content: interaction.request
                });
                
                if (interaction.response) {
                    messages.push({
                        role: 'assistant',
                        content: typeof interaction.response === 'string' 
                            ? interaction.response 
                            : interaction.response.content || JSON.stringify(interaction.response)
                    });
                }
            }
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: userMessage
        });

        return messages;
    }

    /**
     * Inject project context into prompt
     */
    injectProjectContext(project) {
        if (!project) return '';

        let context = '## Project Context\n';
        context += `- Path: ${project.path}\n`;
        
        if (project.structure && Object.keys(project.structure).length > 0) {
            context += `- Structure: ${JSON.stringify(project.structure, null, 2)}\n`;
        }
        
        if (project.dependencies && project.dependencies.length > 0) {
            context += `- Dependencies: ${project.dependencies.join(', ')}\n`;
        }
        
        context += '\n';
        return context;
    }

    /**
     * Inject file context into prompt
     */
    injectFileContext(activeFiles) {
        if (!activeFiles || activeFiles.length === 0) return '';

        let context = '## Active Files\n';
        
        for (const file of activeFiles.slice(0, 5)) { // Limit to 5 files
            context += `- ${file.path}`;
            if (file.language) {
                context += ` (${file.language})`;
            }
            if (file.size) {
                context += ` - ${file.size} bytes`;
            }
            context += '\n';
        }
        
        context += '\n';
        return context;
    }

    /**
     * Inject conversation history into prompt
     */
    injectHistoryContext(interactions, maxItems = 5) {
        if (!interactions || interactions.length === 0) return '';

        let context = '## Recent Conversation\n';
        
        const recentItems = interactions.slice(-maxItems);
        for (const interaction of recentItems) {
            const timestamp = new Date(interaction.timestamp).toLocaleTimeString();
            context += `[${timestamp}] User: ${interaction.request.substring(0, 100)}${interaction.request.length > 100 ? '...' : ''}\n`;
            
            if (interaction.response) {
                const responseText = typeof interaction.response === 'string' 
                    ? interaction.response 
                    : interaction.response.content || 'Response received';
                context += `[${timestamp}] Assistant: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}\n`;
            }
        }
        
        context += '\n';
        return context;
    }

    /**
     * Inject working memory into prompt
     */
    injectMemoryContext(memoryItems) {
        if (!memoryItems || memoryItems.length === 0) return '';

        let context = '## Relevant Context\n';
        
        for (const item of memoryItems.slice(0, 3)) { // Limit to 3 most relevant items
            context += `- ${item.type}: ${JSON.stringify(item.content.summary || item.content)}\n`;
        }
        
        context += '\n';
        return context;
    }

    /**
     * Create prompt template
     */
    createTemplate(name, template, variables = []) {
        this.promptTemplates.set(name, {
            template,
            variables,
            createdAt: Date.now()
        });
    }

    /**
     * Use prompt template
     */
    useTemplate(name, variables = {}) {
        const template = this.promptTemplates.get(name);
        if (!template) {
            throw new Error(`Template '${name}' not found`);
        }

        let prompt = template.template;
        
        // Replace variables
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{{${key}}}`;
            prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
        }

        return prompt;
    }

    /**
     * Estimate token count for prompt
     */
    estimateTokenCount(prompt) {
        // Rough estimation: 1 token ≈ 4 characters
        return Math.ceil(prompt.length / 4);
    }

    /**
     * Optimize prompt for token efficiency
     */
    optimizePrompt(prompt, maxTokens = 4000) {
        const estimatedTokens = this.estimateTokenCount(prompt);
        
        if (estimatedTokens <= maxTokens) {
            return prompt;
        }

        // Simple optimization: truncate from the middle, keeping system prompt and recent context
        const lines = prompt.split('\n');
        const systemPromptEnd = lines.findIndex(line => line.includes('## Current Context') || line.includes('User:'));
        
        if (systemPromptEnd === -1) {
            // Fallback: truncate from end
            const targetLength = Math.floor(prompt.length * (maxTokens / estimatedTokens));
            return prompt.substring(0, targetLength) + '\n\n[Content truncated for token limit]';
        }

        // Keep system prompt and recent parts, truncate middle context
        const systemPart = lines.slice(0, Math.min(systemPromptEnd + 10, lines.length)).join('\n');
        const userPart = lines.slice(-10).join('\n');
        
        return systemPart + '\n\n[Context truncated for token limit]\n\n' + userPart;
    }

    /**
     * Get all available prompt types
     */
    getAvailablePromptTypes() {
        return Array.from(this.systemPrompts.keys());
    }

    /**
     * Add custom system prompt
     */
    addSystemPrompt(type, prompt) {
        this.systemPrompts.set(type, prompt);
    }

    /**
     * Get prompt statistics
     */
    getPromptStats() {
        return {
            systemPrompts: this.systemPrompts.size,
            userPrompts: this.userPrompts.size,
            templates: this.promptTemplates.size,
            contextInjectors: this.contextInjectors.size
        };
    }
}

module.exports = { PromptManager };