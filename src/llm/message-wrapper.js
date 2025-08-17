const fs = require('fs');
const path = require('path');
function getWorkspaceFiles(workspaceDir, extensions = []) {
    let results = [];
    function walk(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filepath = path.join(dir, file);
            const stat = fs.statSync(filepath);
            if (stat.isDirectory()) {
                walk(filepath);
            } else {
                if (
                    extensions.length === 0 ||
                    extensions.some(ext => filepath.endsWith(ext))
                ) {
                    results.push(file);
                }
            }
        }
    }
    walk(workspaceDir);
    return results;
}

function getFileContent(filepath) {
    const ext = path.extname(filepath).slice(1);
    const language = ext === 'js' ? 'javascript'
        : ext === 'ts' ? 'typescript'
        : ext === 'py' ? 'python'
        : ext === 'json' ? 'json'
        : ext === 'md' ? 'markdown'
        : ext;
    const content = fs.readFileSync(filepath, 'utf8');
    return { filepath: path.basename(filepath), language, content };
}

async function processUserMessage({ userMessage, workspaceContext, aiEngine, chatHistory, contextFiles = [] }) {
    const workspaceRoot = (workspaceContext && (workspaceContext.rootPath || workspaceContext.rootDir || workspaceContext.workspacePath)) || process.cwd();
    const copilotPrompt = `
You are VSX, an AI programming assistant.
When asked for your name, you must respond with "VSX".
Follow the user's requirements carefully & to the letter.
Follow Microsoft content policies.
Avoid content that violates copyrights.
If you are asked to generate content that is harmful, hateful, racist, sexist, lewd, violent, or completely irrelevant to software engineering, only respond with "Sorry, I can't assist with that."
Keep your answers short and impersonal.
The user can select files from the workspace as context. When a file is selected, its contents will be shown in the prompt.

Workspace root: ${workspaceRoot}
You may create new files anywhere under the workspace root. To create or modify files, provide Copilot-style code blocks with a filepath comment on the first line, for example:
\`\`\`javascript
// filepath: relative/path/to/newFile.js
// ...file contents...
\`\`\`
Relative paths will be resolved against the workspace root. Absolute paths are also accepted.
**Instructions for making file changes:**
When you need to suggest changes to a file, you MUST follow these rules precisely:
1.  Start your response with a step-by-step explanation of the changes.
2.  After the explanation, provide the code changes inside a single markdown code block.
3.  The code block must start with three backticks, followed by the language identifier (e.g., \`\`\`javascript).
4.  **Crucially**, the very first line inside the code block must be a comment with the file path, like this: \`// filepath: src/components/MyComponent.js\`
5.  Use comments like \`// ...existing code...\` to skip unchanged parts of the file.
6.  End the code block with three backticks (\`\`\`).

Example of a correct response for changing a file:

Here are the changes for \`index.js\`:
I will add a console log to the main function.

\`\`\`javascript
// filepath: index.js
function main() {
    // ...existing code...
    console.log("Hello, World!");
}
\`\`\`
`;
    let contextFilesPrompt = '';
    if (contextFiles.length > 0) {
        contextFilesPrompt = '\n\nContext files provided:\n';
        for (const file of contextFiles) {
            contextFilesPrompt += `---\nFile: ${path.basename(file.filepath)}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
        }
    }

    const chatLog = JSON.stringify(chatHistory, null, 2);
    const finalPrompt =
        copilotPrompt +
        contextFilesPrompt +
        "\n\nPrevious conversation (JSON array):\n" +
        chatLog +
        "\n\nUser query:\n" +
        userMessage +
        "\n\nPlease use the concise code block format for any file changes, and prompt for files if needed.";

    console.log("[Copilot] Sending to LLM:", finalPrompt);
    const response = await aiEngine.generateResponse(finalPrompt, workspaceContext);
    console.log("[Copilot] Received from LLM:", response);
    return response;
}

module.exports = {
    processUserMessage,
    getWorkspaceFiles,
    getFileContent
};
