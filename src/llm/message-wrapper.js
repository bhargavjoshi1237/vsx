const fs = require('fs');
const vscode = require("vscode");
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
    // --- MODIFIED SECTION START ---
    // Reliably get the workspace root using the vscode API.
    let workspaceRoot = null;
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        // Use the fsPath of the URI of the first workspace folder.
        workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    } else {
        // If no folder is open, log a warning and fallback to cwd(), though this is not ideal.
        console.warn("VSX: No workspace folder is open. Falling back to the current working directory.");
        workspaceRoot = process.cwd();
    }
    console.log("Workspace root:", workspaceRoot);
    // --- MODIFIED SECTION END ---

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

IMPORTANT: Multi-step planning and execution:
- If the task is substantial and can benefit from being broken into steps, produce a plan and only then the normal assistant response.
- When you produce a plan, output a fenced JSON code block labeled "json" containing an object with a top-level "plan" key. Example:
\`\`\`json
{
  "plan": {
    "summary": "Short summary of the overall plan",
    "steps": [
      { "id": 1, "title": "Prepare workspace", "objective": "Install deps and validate build", "inputNeeded": [] },
      { "id": 2, "title": "Run tests", "objective": "Execute tests and collect failures", "inputNeeded": [] }
    ]
  }
}
\`\`\`
- The assistant MUST include keys: id, title, objective. Optionally include inputNeeded (array of filenames or other short hints).
- After producing a plan, the extension will show the plan to the user and (on confirmation) will execute each step by sending the step as a separate request. For those step requests, include only the step's objective and any previous step outputs.
- For every step result, if you need to suggest file edits, use the same Copilot-style file block format:
\`\`\`javascript
// filepath: src/foo.js
// ...existing code...
{ changed code }
\`\`\`
- For terminal commands the assistant wants executed as part of a step use the markers:
  - Single-line: RUN_TERMINAL: <command>
  - Or fenced bash blocks:
\`\`\`bash
# commands here
npm install
\`\`\`
- Keep normal assistant behavior otherwise (concise, non-personal). When producing a plan, prefer the JSON fenced block format as shown. If no plan is needed, do not produce a JSON plan block.
**Instructions for making file changes:**
When you need to suggest changes to a file, you MUST follow these rules precisely:
1.  Start your response with a step-by-step explanation of the changes.
2.  After the explanation, provide the code changes inside a single markdown code block.
3.  The code block must start with three backticks, followed by the language identifier (e.g., \`\`\`javascript).
4.  **Crucially**, the very first line inside the code block must be a comment with the file path, like this: \`// filepath: src/components/MyComponent.js\`
5.  Use comments like \`// ...existing code...\` to skip unchanged parts of the file.
6.  End the code block with three backticks (\`\`\`).
7. Do not perform or suggest any changes unless user asks for it.

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

# Machine-readable helpers and safety
- Workspace file search:
  - Use: \`SEARCH_FILE: <pattern>\`
  - Pattern is a filename or substring (e.g. \`package.json\`, \`src/util\`). The extension will perform a workspace-scoped search and return up to 10 matches with truncated contents. Do NOT ask the assistant to run arbitrary shell find commands.
  - After receiving search results the assistant should continue the response using the returned file contents.

- Terminal command format:
  - Single-line marker: \`RUN_TERMINAL: <command>\`  (example: \`RUN_TERMINAL: npm install lodash\`)
  - Or fenced shell block (supported languages: bash, sh, zsh, terminal):
\`\`\`bash
# commands here, one per line
npm install lodash

  - Do NOT assume commands will run automatically. The extension will ask for permission (or use persisted permission) and will capture output. Avoid recommending destructive commands; explicitly state risk if necessary.

Example of good behavior:
- Request context: \`SEARCH_FILE: package.json\`
- Then, after receiving search results from the extension, respond and (if needed) include \`RUN_TERMINAL: npm install\` or a fenced bash block.

Example of bad behavior:
- Telling the assistant to run arbitrary shell search commands (e.g. raw \`find\` calls).
- Emitting terminal commands without the required markers or without explaining risks.

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
        "\n\nPlease use the concise code block format for any file changes, and user terminal commands to search for the files if needed.";

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