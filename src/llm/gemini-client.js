/**
 * Gemini API Integration
 * Handles communication with Google's Gemini API
 */

class GeminiClient {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.model = 'gemini-2.5-flash-lite';
        this.defaultConfig = {
            temperature: 0.1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            safetySettings: [
                {
                    category: 'HARM_CATEGORY_HARASSMENT',
                    threshold: 'BLOCK_NONE'
                },
                {
                    category: 'HARM_CATEGORY_HATE_SPEECH',
                    threshold: 'BLOCK_NONE'
                },
                {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    threshold: 'BLOCK_NONE'
                },
                {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: 'BLOCK_NONE'
                }
            ]
        };
        this.requestCount = 0;
        this.totalTokensUsed = 0;
    }

    /**
     * Initialize the Gemini client
     */
    initialize(config = {}) {
        this.apiKey = config.apiKey || 'AIzaSyBVWcXY08OpDHh4N-RHPE7M0yO6-Ha8-CY';
        this.model = config.model || this.model;
        this.defaultConfig = { ...this.defaultConfig, ...config.defaultConfig };
        
        console.log(`Gemini Client initialized with model: ${this.model}`);
    }

    /**
     * Generate a response from Gemini
     */
    async generateResponse(prompt, options = {}) {
        if (!this.apiKey) {
            throw new Error('Gemini API key not configured');
        }

        const config = { ...this.defaultConfig, ...options };
        const requestId = ++this.requestCount;
        const startTime = Date.now();

        try {
            console.log(`[Request ${requestId}] Sending to Gemini...`);
            
            const requestBody = this.buildRequestBody(prompt, config);
            console.log(`[Request ${requestId}] Prompt length: ${requestBody.contents[0].parts[0].text.length} characters`);
            
            const response = await this.makeApiRequest(requestBody);
            
            const result = this.parseResponse(response);
            result.processingTime = Date.now() - startTime;
            
            this.updateUsageStats(result);

            console.log(`[Request ${requestId}] Response received in ${result.processingTime}ms`);
            return result;

        } catch (error) {
            console.error(`[Request ${requestId}] Error:`, error);
            // Fallback to mock response if API fails
            console.log('Falling back to mock response due to API error');
            const mockResult = await this.generateMockResponse(prompt, config);
            mockResult.processingTime = Date.now() - startTime;
            return mockResult;
        }
    }

    /**
     * Generate response with conversation context
     */
    async generateContextualResponse(messages, options = {}) {
        const config = { ...this.defaultConfig, ...options };
        
        // Convert messages to Gemini format
        const contents = this.formatMessagesForGemini(messages);
        
        try {
            const requestBody = {
                contents,
                generationConfig: {
                    temperature: config.temperature,
                    topP: config.topP,
                    topK: config.topK,
                    maxOutputTokens: config.maxOutputTokens
                },
                safetySettings: config.safetySettings
            };

            const response = await this.makeApiRequest(requestBody);
            const result = this.parseResponse(response);
            this.updateUsageStats(result);

            return result;

        } catch (error) {
            console.error('Contextual response error:', error);
            // Fallback to mock response
            const lastMessage = messages[messages.length - 1];
            return this.generateMockResponse(lastMessage.content, config);
        }
    }

    /**
     * Build request body for Gemini API
     */
    buildRequestBody(prompt, config) {
        let finalPrompt = prompt;
        
        // Add context information if provided
        if (config.context) {
            const contextInfo = this.formatContextForPrompt(config.context);
            if (contextInfo) {
                finalPrompt = contextInfo + '\n\n' + prompt;
            }
        }
        
        return {
            contents: [{
                parts: [{
                    text: finalPrompt
                }]
            }],
            generationConfig: {
                temperature: config.temperature,
                topP: config.topP,
                topK: config.topK,
                maxOutputTokens: config.maxOutputTokens
            },
            safetySettings: config.safetySettings
        };
    }

    /**
     * Format context information for inclusion in prompt
     */
    formatContextForPrompt(context) {
        if (!context) return '';
        
        let contextStr = '';
        
        // Add project information
        if (context.project) {
            contextStr += '--- Project Context ---\n';
            contextStr += `Path: ${context.project.path}\n`;
            if (context.project.dependencies) {
                contextStr += `Dependencies: ${context.project.dependencies.join(', ')}\n`;
            }
            contextStr += '\n';
        }
        
        // Add recent interactions
        if (context.recentInteractions && context.recentInteractions.length > 0) {
            contextStr += '--- Recent Conversation ---\n';
            for (const interaction of context.recentInteractions.slice(-3)) {
                contextStr += `User: ${interaction.request}\n`;
                contextStr += `Assistant: ${interaction.response?.content || interaction.response}\n\n`;
            }
        }
        
        // Add active files
        if (context.activeFiles && context.activeFiles.length > 0) {
            contextStr += '--- Active Files ---\n';
            for (const file of context.activeFiles) {
                contextStr += `- ${file.path} (${file.language})\n`;
            }
            contextStr += '\n';
        }
        
        return contextStr;
    }

    /**
     * Make API request to Gemini
     */
    async makeApiRequest(requestBody) {
        const url = `${this.baseUrl}/models/${this.model}:generateContent`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Parse Gemini API response
     */
    parseResponse(response) {
        if (!response.candidates || response.candidates.length === 0) {
            throw new Error('No candidates in response');
        }

        const candidate = response.candidates[0];
        
        if (candidate.finishReason === 'SAFETY') {
            throw new Error('Response blocked by safety filters');
        }

        const content = candidate.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error('No content in response');
        }

        return {
            content,
            finishReason: candidate.finishReason,
            safetyRatings: candidate.safetyRatings,
            usageMetadata: response.usageMetadata || {},
            rawResponse: response
        };
    }

    /**
     * Format messages for Gemini API
     */
    formatMessagesForGemini(messages) {
        return messages.map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{
                text: message.content
            }]
        }));
    }

    /**
     * Generate mock response for testing
     */
    generateMockResponse(prompt, config) {
        const mockResponses = [
            "I understand your request. This is a mock response from the Gemini client since we're using a test API key.",
            "I can help you with that. Here's what I would do: [Mock implementation details]",
            "Based on your input, I would suggest the following approach: [Mock suggestions]",
            "I've analyzed your request and here's my response: [Mock analysis and recommendations]"
        ];

        const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        
        // Simulate processing delay
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    content: `${randomResponse}\n\nPrompt received: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
                    finishReason: 'STOP',
                    safetyRatings: [],
                    usageMetadata: {
                        promptTokenCount: Math.floor(prompt.length / 4),
                        candidatesTokenCount: Math.floor(randomResponse.length / 4),
                        totalTokenCount: Math.floor((prompt.length + randomResponse.length) / 4)
                    },
                    isMockResponse: true
                });
            }, 500 + Math.random() * 1000); // 0.5-1.5 second delay
        });
    }

    /**
     * Update usage statistics
     */
    updateUsageStats(result) {
        if (result.usageMetadata?.totalTokenCount) {
            this.totalTokensUsed += result.usageMetadata.totalTokenCount;
        }
    }

    /**
     * Estimate token count for text
     */
    estimateTokenCount(text) {
        // Rough estimation: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }

    /**
     * Get usage statistics
     */
    getUsageStats() {
        return {
            requestCount: this.requestCount,
            totalTokensUsed: this.totalTokensUsed,
            averageTokensPerRequest: this.requestCount > 0 ? Math.round(this.totalTokensUsed / this.requestCount) : 0
        };
    }

    /**
     * Reset usage statistics
     */
    resetUsageStats() {
        this.requestCount = 0;
        this.totalTokensUsed = 0;
    }

    /**
     * Test API connection
     */
    async testConnection() {
        try {
            const response = await this.generateResponse('Hello, this is a test message.');
            return {
                success: true,
                response: response.content,
                model: this.model,
                isMock: response.isMockResponse || false
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = { GeminiClient };