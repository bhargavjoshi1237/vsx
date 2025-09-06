const { LLMResponseSchema } = require('../types/json-schemas');

class JSONValidator {
    constructor() {
        this.schema = LLMResponseSchema;
    }

    validateLLMResponse(data) {
        try {
            const result = this.validateObject(data, this.schema);
            return {
                valid: result.valid,
                errors: result.errors,
                data: result.valid ? data : null
            };
        } catch (error) {
            return {
                valid: false,
                errors: [`Validation error: ${error.message}`],
                data: null
            };
        }
    }

    validateObject(obj, schema) {
        const errors = [];
        
        if (!obj || typeof obj !== 'object') {
            return { valid: false, errors: ['Object is null or not an object'] };
        }

        // Check required properties
        if (schema.required) {
            for (const prop of schema.required) {
                if (!(prop in obj)) {
                    errors.push(`Missing required property: ${prop}`);
                }
            }
        }

        // Check properties
        if (schema.properties) {
            for (const [prop, propSchema] of Object.entries(schema.properties)) {
                if (prop in obj) {
                    const propResult = this.validateProperty(obj[prop], propSchema, prop);
                    errors.push(...propResult.errors);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    validateProperty(value, schema, propName) {
        const errors = [];

        // Type validation
        if (schema.type) {
            if (!this.checkType(value, schema.type)) {
                errors.push(`Property '${propName}' should be of type ${schema.type}`);
            }
        }

        // Enum validation
        if (schema.enum && !schema.enum.includes(value)) {
            errors.push(`Property '${propName}' should be one of: ${schema.enum.join(', ')}`);
        }

        // Array validation
        if (schema.type === 'array' && Array.isArray(value)) {
            if (schema.items) {
                value.forEach((item, index) => {
                    const itemResult = this.validateProperty(item, schema.items, `${propName}[${index}]`);
                    errors.push(...itemResult.errors);
                });
            }
        }

        // Object validation
        if (schema.type === 'object' && typeof value === 'object' && value !== null) {
            if (schema.properties || schema.required) {
                const objResult = this.validateObject(value, schema);
                errors.push(...objResult.errors.map(err => `${propName}.${err}`));
            }
        }

        return { valid: errors.length === 0, errors };
    }

    checkType(value, expectedType) {
        switch (expectedType) {
            case 'string': return typeof value === 'string';
            case 'number': return typeof value === 'number';
            case 'boolean': return typeof value === 'boolean';
            case 'array': return Array.isArray(value);
            case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
            default: return true;
        }
    }

    extractJSONFromText(text) {
        if (!text || typeof text !== 'string') return null;

        // Try to find JSON between ```json and ``` markers
        const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
        let match = jsonBlockRegex.exec(text);
        
        if (match) {
            try {
                return JSON.parse(match[1].trim());
            } catch (e) {
                // Continue to other methods
            }
        }

        // Try to find JSON between VSX_RESPONSE_START and VSX_RESPONSE_END markers
        const markerRegex = /VSX_RESPONSE_START\s*([\s\S]*?)\s*VSX_RESPONSE_END/g;
        match = markerRegex.exec(text);
        
        if (match) {
            try {
                return JSON.parse(match[1].trim());
            } catch (e) {
                // Continue to other methods
            }
        }

        // Try to find the first valid JSON object in the text
        const lines = text.split('\n');
        let jsonStr = '';
        let braceCount = 0;
        let inJson = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{')) {
                inJson = true;
                jsonStr = trimmed;
                braceCount = (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
            } else if (inJson) {
                jsonStr += '\n' + trimmed;
                braceCount += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;
                
                if (braceCount === 0) {
                    try {
                        return JSON.parse(jsonStr);
                    } catch (e) {
                        // Reset and continue
                        inJson = false;
                        jsonStr = '';
                        braceCount = 0;
                    }
                }
            }
        }

        return null;
    }
}

module.exports = { JSONValidator };
