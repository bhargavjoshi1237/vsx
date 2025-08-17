async function decodeLLMResponse({ response }) {
    if (!response || !response.content) return null;

    let content = response.content;

    if (typeof content !== 'string') {
        // If content is not a string, we can't parse it as JSON.
        // Stringify it to avoid returning an object.
        try {
            return JSON.stringify(content, null, 2);
        } catch (e) {
            return '[object Object]';
        }
    }

    try {
        const arr = JSON.parse(content);
        if (Array.isArray(arr)) {
            for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i].role === "assistant" && arr[i].content) {
                    return arr[i].content;
                }
            }
            if (arr.length > 0 && arr[arr.length - 1].content) {
                return arr[arr.length - 1].content;
            }
        }
    } catch (e) {
        // Not a JSON array, which is fine. We'll return the original content string.
    }

    return content;
}

module.exports = { decodeLLMResponse };
