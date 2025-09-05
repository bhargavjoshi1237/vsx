class GeminiClient {
    constructor() {
        this.apiKey = null;
        this.cerebrasApiKey = null; // Stays null until set
        this.nvidiaApiKey = null; // New: For NVIDIA API
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.cerebrasBaseUrl = 'https://api.cerebras.ai/v1';
        this.nvidiaBaseUrl = 'https://integrate.api.nvidia.com/v1'; // New: NVIDIA API base URL
        this.model = 'gemini-2.5-flash-lite';
        this.cerebrasModels = [
            'qwen-3-coder-480b',
            'qwen-3-32b',
            'qwen-3-235b-a22b-thinking-2507',
            'qwen-3-235b-a22b-instruct-2507',
            'gpt-oss-120b'
        ];
        this.nvidiaModels = [ // New: List of NVIDIA models
            "deepseek-ai/deepseek-v3.1",
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
            "nvidia/llama-3.3-nemotron-super-49b-v1.5",
            "moonshotai/kimi-k2-instruct",
            "deepseek-ai/deepseek-r1-0528",
        ];
        this.defaultConfig = {
            temperature: 0.1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
            ]
        };
        this.requestCount = 0;
        this.totalTokensUsed = 0;
    }

    initialize(config = {}) {
        this.apiKey = config.apiKey || '<YOUR API KEY HEAR>';
        this.cerebrasApiKey = config.cerebrasApiKey || process.env.CEREBRAS_API_KEY;
        this.nvidiaApiKey = config.nvidiaApiKey || process.env.NVIDIA_API_KEY; // New: Initialize NVIDIA API key
        this.model = config.model || this.model;
        this.defaultConfig = { ...this.defaultConfig, ...config.defaultConfig };

        console.log(`Gemini Client initialized with model: ${this.model}`);
    }

    /**
     * New method to set the Cerebras API key after initialization.
     * @param {string} key The Cerebras API key.
     */
    setCerebrasKey(key) {
        if (key && typeof key === 'string') {
            this.cerebrasApiKey = key;
            console.log("Cerebras API key has been set.");
        }
    }

    /**
     * New: Method to set the NVIDIA API key after initialization.
     * @param {string} key The NVIDIA API key.
     */
    setNvidiaKey(key) {
        if (key && typeof key === 'string') {
            this.nvidiaApiKey = key;
            console.log("NVIDIA API key has been set.");
        }
    }


    async generateResponse(prompt, options = {}) {
        if (this.cerebrasModels.includes(this.model)) {
            return this.generateCerebrasResponse(prompt, options);
        }

        if (this.nvidiaModels.includes(this.model)) { // New: Check for NVIDIA models
            return this.generateNvidiaResponse(prompt, options);
        }

        if (!this.apiKey) {
            throw new Error('Gemini API key not configured');
        }

        const config = { ...this.defaultConfig, ...options };
        const requestId = ++this.requestCount;
        const startTime = Date.now();

        try {
            console.log(`[Request ${requestId}] Sending to Gemini...`);

            const requestBody = this.buildRequestBody(prompt, config);
            const response = await this.makeApiRequest(requestBody);
            const result = this.parseResponse(response);
            result.processingTime = Date.now() - startTime;
            this.updateUsageStats(result);

            console.log(`[Request ${requestId}] Response received in ${result.processingTime}ms`);
            return result;

        } catch (error) {
            console.error(`[Request ${requestId}] Error:`, error);
            console.log('Falling back to mock response due to API error');
            const mockResult = await this.generateMockResponse(prompt, config);
            mockResult.processingTime = Date.now() - startTime;
            return mockResult;
        }
    }

    async generateContextualResponse(messages, options = {}) {
        if (this.cerebrasModels.includes(this.model)) {
            const lastMessage = messages[messages.length - 1];
            return this.generateCerebrasResponse(lastMessage.content, options, messages);
        }

        if (this.nvidiaModels.includes(this.model)) { // New: Check for NVIDIA models
            const lastMessage = messages[messages.length - 1];
            return this.generateNvidiaResponse(lastMessage.content, options, messages);
        }

        const config = { ...this.defaultConfig, ...options };
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
            const lastMessage = messages[messages.length - 1];
            return this.generateMockResponse(lastMessage.content, config);
        }
    }

    async generateCerebrasResponse(prompt, options = {}, messages = []) {
        if (!this.cerebrasApiKey) {
            throw new Error('Cerebras API key not configured');
        }

        const config = { ...this.defaultConfig, ...options };
        const requestId = ++this.requestCount;
        const startTime = Date.now();

        try {
            console.log(`[Request ${requestId}] Sending to Cerebras with model ${this.model}...`);

            const requestBody = this.buildCerebrasRequestBody(prompt, config, messages);
            const response = await this.makeCerebrasApiRequest(requestBody);
            const result = await this.parseCerebrasResponse(response);
            result.processingTime = Date.now() - startTime;

            console.log(`[Request ${requestId}] Response received in ${result.processingTime}ms`);
            return result;

        } catch (error) {
            console.error(`[Request ${requestId}] Error:`, error);
            console.log('Falling back to mock response due to API error');
            const mockResult = await this.generateMockResponse(prompt, config);
            mockResult.processingTime = Date.now() - startTime;
            return mockResult;
        }
    }

    /**
     * New: Method to generate a response from the NVIDIA API.
     */
    async generateNvidiaResponse(prompt, options = {}, messages = []) {
        if (!this.nvidiaApiKey) {
            throw new Error('NVIDIA API key not configured');
        }

        const config = { ...this.defaultConfig, ...options };
        const requestId = ++this.requestCount;
        const startTime = Date.now();

        try {
            console.log(`[Request ${requestId}] Sending to NVIDIA with model ${this.model}...`);

            const requestBody = this.buildNvidiaRequestBody(prompt, config, messages);
            const response = await this.makeNvidiaApiRequest(requestBody);
            const result = await this.parseNvidiaResponse(response);
            result.processingTime = Date.now() - startTime;

            console.log(`[Request ${requestId}] Response received in ${result.processingTime}ms`);
            return result;

        } catch (error) {
            console.error(`[Request ${requestId}] Error:`, error);
            console.log('Falling back to mock response due to API error');
            const mockResult = await this.generateMockResponse(prompt, config);
            mockResult.processingTime = Date.now() - startTime;
            return mockResult;
        }
    }

    buildRequestBody(prompt, config) {
        let finalPrompt = prompt;
        if (config.context) {
            const contextInfo = this.formatContextForPrompt(config.context);
            if (contextInfo) {
                finalPrompt = contextInfo + '\n\n' + prompt;
            }
        }
        return {
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig: {
                temperature: config.temperature,
                topP: config.topP,
                topK: config.topK,
                maxOutputTokens: config.maxOutputTokens
            },
            safetySettings: config.safetySettings
        };
    }

    buildCerebrasRequestBody(prompt, config, messages) {
        let modelParams = {};
        switch (this.model) {
            case 'gpt-oss-120b':
                modelParams = { max_tokens: 65536, temperature: 1, top_p: 1, reasoning_effort: "high" };
                break;
            case 'qwen-3-coder-480b':
                modelParams = { max_tokens: 40000, temperature: 0.7, top_p: 0.8 };
                break;
            case 'qwen-3-235b-a22b-instruct-2507':
                modelParams = { max_tokens: 20000, temperature: 0.7, top_p: 0.8 };
                break;
            case 'qwen-3-235b-a22b-thinking-2507':
                modelParams = { max_tokens: 65536, temperature: 0.6, top_p: 0.95 };
                break;
            case 'qwen-3-32b':
                modelParams = { max_tokens: 16382, temperature: 0.6, top_p: 0.95 };
                break;
        }

        const formattedMessages = messages.length > 0
            ? messages.map(m => ({ role: m.role, content: m.content }))
            : [{ role: 'user', content: prompt }];

        return {
            model: this.model,
            stream: true,
            ...modelParams,
            messages: [{ role: 'system', content: '' }, ...formattedMessages]
        };
    }

    /**
     * New: Method to build the request body for the NVIDIA API.
     */
    buildNvidiaRequestBody(prompt, config, messages) {
        let modelParams = {};
        const isChatModel = !["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(this.model);

        if (isChatModel) {
            const formattedMessages = messages.length > 0
                ? messages.map(m => ({ role: m.role, content: m.content }))
                : [{ role: 'user', content: prompt }];

            switch (this.model) {
                case "deepseek-ai/deepseek-v3.1":
                    modelParams = { temperature: 0.2, top_p: 0.7, max_tokens: 8192, seed: 42, chat_template_kwargs: { thinking: false } };
                    break;
                case "nvidia/llama-3.3-nemotron-super-49b-v1.5":
                    modelParams = { temperature: 0.6, top_p: 0.95, max_tokens: 65536, frequency_penalty: 0, presence_penalty: 0 };
                    break;
                case "moonshotai/kimi-k2-instruct":
                case "deepseek-ai/deepseek-r1-0528":
                    modelParams = { temperature: 0.6, top_p: 0.9, frequency_penalty: 0, presence_penalty: 0, max_tokens: 4096 };
                    break;
            }

            return {
                model: this.model,
                messages: formattedMessages,
                stream: true,
                ...modelParams
            };
        } else { // Completion models
            return {
                model: this.model,
                input: [prompt],
                max_output_tokens: 4096,
                top_p: 1,
                temperature: 1,
                stream: true
            };
        }
    }


    formatContextForPrompt(context) {
        if (!context) return '';
        let contextStr = '';
        if (context.project) {
            contextStr += '--- Project Context ---\n';
            contextStr += `Path: ${context.project.path}\n`;
            if (context.project.dependencies) {
                contextStr += `Dependencies: ${context.project.dependencies.join(', ')}\n`;
            }
            contextStr += '\n';
        }
        if (context.recentInteractions && context.recentInteractions.length > 0) {
            contextStr += '--- Recent Conversation ---\n';
            for (const interaction of context.recentInteractions.slice(-3)) {
                contextStr += `User: ${interaction.request}\n`;
                contextStr += `Assistant: ${interaction.response?.content || interaction.response}\n\n`;
            }
        }
        if (context.activeFiles && context.activeFiles.length > 0) {
            contextStr += '--- Active Files ---\n';
            for (const file of context.activeFiles) {
                contextStr += `- ${file.path} (${file.language})\n`;
            }
            contextStr += '\n';
        }
        return contextStr;
    }

    async makeApiRequest(requestBody) {
        const url = `${this.baseUrl}/models/${this.model}:generateContent`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }
        return await response.json();
    }

    async makeCerebrasApiRequest(requestBody) {
        const url = `${this.cerebrasBaseUrl}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.cerebrasApiKey}` },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorData}`);
        }

        // Normalize return: if JSON, return parsed object; otherwise return the body/stream
        const contentType = (response.headers && response.headers.get ? response.headers.get('content-type') : '') || '';
        if (contentType.includes('application/json')) {
            // Non-streaming JSON response (common)
            return await response.json();
        }

        // Streaming responses (SSE / event-stream) or raw body: return the body for downstream parsing.
        // This may be a web ReadableStream (has getReader) or a Node async iterable.
        return response.body;
    }

    /**
     * New: Method to make API requests to the NVIDIA API.
     */
    async makeNvidiaApiRequest(requestBody) {
        const isChatModel = !["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(this.model);
        const endpoint = isChatModel ? '/chat/completions' : '/responses';
        const url = `${this.nvidiaBaseUrl}${endpoint}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.nvidiaApiKey}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorData}`);
        }
        return response.body;
    }

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

    async parseCerebrasResponse(streamOrJson) {
        // Handle null/empty
        if (!streamOrJson) {
            return { content: '', finishReason: null, safetyRatings: [], usageMetadata: {}, rawResponse: null };
        }

        // If it's a web ReadableStream (browser / modern fetch)
        if (typeof streamOrJson.getReader === 'function') {
            const reader = streamOrJson.getReader();
            const decoder = new TextDecoder();
            let content = '';
            let finishReason = null;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            if (data === '[DONE]') break;
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices && parsed.choices[0]) {
                                    const delta = parsed.choices[0].delta;
                                    if (delta && delta.content) content += delta.content;
                                    if (parsed.choices[0].finish_reason) finishReason = parsed.choices[0].finish_reason;
                                }
                            } catch (error) {
                                // ignore malformed chunks
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error reading web stream:', e);
            }
            return { content, finishReason, safetyRatings: [], usageMetadata: {}, rawResponse: null };
        }

        // If it's already a parsed JSON object (non-streaming)
        if (typeof streamOrJson === 'object' && !streamOrJson.pipe && !streamOrJson[Symbol.asyncIterator]) {
            const json = streamOrJson;
            let content = '';
            let finishReason = json.choices?.[0]?.finish_reason || json.finish_reason || null;

            // Common shapes: choices[].message.content, choices[].delta.content, choices[].text
            if (Array.isArray(json.choices)) {
                for (const ch of json.choices) {
                    if (ch.message && ch.message.content) content += ch.message.content;
                    else if (ch.delta && ch.delta.content) content += ch.delta.content;
                    else if (typeof ch.text === 'string') content += ch.text;
                }
            } else if (typeof json.text === 'string') {
                content = json.text;
            }

            return { content, finishReason, safetyRatings: json.safety || [], usageMetadata: json.usage || {}, rawResponse: json };
        }

        // If it's a Node Readable stream or async iterable (response.body in Node can be async iterable)
        if (typeof streamOrJson[Symbol.asyncIterator] === 'function' || typeof streamOrJson.on === 'function') {
            const decoder = new TextDecoder();
            let content = '';
            let finishReason = null;
            try {
                for await (const chunk of streamOrJson) {
                    // chunk could be Buffer or string
                    const chunkStr = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
                    const lines = chunkStr.split('\n\n').filter(line => line.trim() !== '');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            if (data === '[DONE]') break;
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices && parsed.choices[0]) {
                                    const delta = parsed.choices[0].delta;
                                    if (delta && delta.content) content += delta.content;
                                    if (parsed.choices[0].finish_reason) finishReason = parsed.choices[0].finish_reason;
                                }
                            } catch (error) {
                                // try treating the chunk as a full JSON response if it isn't SSE
                                try {
                                    const parsedWhole = JSON.parse(chunkStr);
                                    return await this.parseCerebrasResponse(parsedWhole);
                                } catch (e) {
                                    // ignore
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error reading Node stream:', e);
            }
            return { content, finishReason, safetyRatings: [], usageMetadata: {}, rawResponse: null };
        }

        // Unknown shape: attempt to stringify/parse as last resort
        try {
            const text = String(streamOrJson);
            try {
                const parsed = JSON.parse(text);
                return await this.parseCerebrasResponse(parsed);
            } catch (e) {
                // parse SSE-like lines
                let content = '';
                const lines = text.split('\n\n').filter(l => l.trim());
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data !== '[DONE]') {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                    content += parsed.choices[0].delta.content;
                                }
                            } catch (ex) { /* ignore */ }
                        }
                    }
                }
                return { content, finishReason: null, safetyRatings: [], usageMetadata: {}, rawResponse: null };
            }
        } catch (e) {
            return { content: '', finishReason: null, safetyRatings: [], usageMetadata: {}, rawResponse: null };
        }
    }

    /**
     * New: Method to parse the response from the NVIDIA API.
     */
    async parseNvidiaResponse(stream) {
        let content = '';
        let finishReason = null;
        const reader = stream.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data.trim() === '[DONE]') {
                        break;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices && parsed.choices[0].delta) {
                            content += parsed.choices[0].delta.content || '';
                        } else if (parsed.choices && parsed.choices[0].text) {
                            content += parsed.choices[0].text;
                        }
                        if (parsed.choices && parsed.choices[0].finish_reason) {
                            finishReason = parsed.choices[0].finish_reason;
                        }
                    } catch (e) {
                        // Ignore parsing errors for incomplete JSON
                    }
                }
            }
        }

        return {
            content,
            finishReason,
            safetyRatings: [],
            usageMetadata: {},
            rawResponse: null // Raw response is not stored for streaming
        };
    }

    formatMessagesForGemini(messages) {
        return messages.map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
        }));
    }

    generateMockResponse(prompt, config) {
        const mockResponses = [
            "This is a mock response from the client as the API key is for testing.",
            "I can help with that. Here are mock implementation details...",
            "Based on your input, I suggest the following mock approach...",
        ];
        const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    content: `${randomResponse}\n\nPrompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
                    finishReason: 'STOP',
                    safetyRatings: [],
                    usageMetadata: {
                        promptTokenCount: Math.floor(prompt.length / 4),
                        candidatesTokenCount: Math.floor(randomResponse.length / 4),
                        totalTokenCount: Math.floor((prompt.length + randomResponse.length) / 4)
                    },
                    isMockResponse: true
                });
            }, 500 + Math.random() * 1000);
        });
    }

    updateUsageStats(result) {
        if (result.usageMetadata?.totalTokenCount) {
            this.totalTokensUsed += result.usageMetadata.totalTokenCount;
        }
    }

    estimateTokenCount(text) {
        return Math.ceil(text.length / 4);
    }

    getUsageStats() {
        return {
            requestCount: this.requestCount,
            totalTokensUsed: this.totalTokensUsed,
            averageTokensPerRequest: this.requestCount > 0 ? Math.round(this.totalTokensUsed / this.requestCount) : 0
        };
    }

    resetUsageStats() {
        this.requestCount = 0;
        this.totalTokensUsed = 0;
    }

    /**
     * Updated to be model-aware. Tests the appropriate API endpoint (Gemini, Cerebras or NVIDIA)
     * based on the currently configured model.
     */
    async testConnection() {
        const isCerebrasModel = this.cerebrasModels.includes(this.model);
        const isNvidiaModel = this.nvidiaModels.includes(this.model);
        console.log(`Testing connection for model: ${this.model} (isCerebras: ${isCerebrasModel}, isNvidia: ${isNvidiaModel})`);

        // Check if the required API key is available before making a request
        if (isCerebrasModel && !this.cerebrasApiKey) {
            return { success: false, error: 'Cerebras API key is not set.' };
        }
        if (isNvidiaModel && !this.nvidiaApiKey) {
            return { success: false, error: 'NVIDIA API key is not set.' };
        }
        if (!isCerebrasModel && !isNvidiaModel && (!this.apiKey || this.apiKey === '<YOUR API KEY HEAR>')) {
            return { success: false, error: 'Gemini API key is not set.' };
        }
        
        try {
            // The generateResponse method already handles routing to Cerebras, NVIDIA or Gemini
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