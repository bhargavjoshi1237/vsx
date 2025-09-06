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

async function processUserMessage({ userMessage, workspaceContext, aiEngine, chatHistory, contextFiles = [], toolResults = [] }) {
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

**CRITICAL: You MUST respond in a specific JSON format. Your entire response must be wrapped in VSX_RESPONSE_START and VSX_RESPONSE_END markers.**

Response Format:
VSX_RESPONSE_START
{
  "response_type": "simple_response|file_operations|terminal_commands|plan_execution|tool_calls|error_response|mixed_response",
  "content": {
    // Content structure depends on response_type - see examples below
  },
  "metadata": {
    "timestamp": "ISO_8601_timestamp",
    "model": "model_name",
    "user_mode": "ask|edit|legacy",
    "context_files": ["file1.js", "file2.py"],
    "recursive_mode": false  // Set to true if you need to call tools recursively until you have enough info to respond
  }
}
VSX_RESPONSE_END

**Tool Definitions:**
You have access to the following tools. Use them when needed to gather information or perform actions before responding.

1. **search_files**: Search for files or content in the workspace.
   - Parameters: { "query": "string", "include_content": boolean, "file_extensions": ["ext1", "ext2"] }

2. **read_file**: Read full or partial file content.
   - Parameters: { "file_path": "relative/path/to/file.js", "start_line": number (optional), "end_line": number (optional) }

3. **edit_file**: Apply edits to a file.
   - Parameters: { "file_path": "relative/path/to/file.js", "edits": [{ "old_string": "text to replace", "new_string": "replacement text", "start_line": number (optional) }] }

4. **get_directory_tree**: Get file structure and tree for a directory.
   - Parameters: { "path": "relative/path/to/dir", "depth": number (optional, default 2) }

5. **file_operations**: Move, copy, rename, or delete files.
   - Parameters: { "operation": "move|copy|rename|delete", "source_path": "path/to/source", "target_path": "path/to/target" (for move/copy/rename) }

**Tool Call Format (use response_type: "tool_calls"):**
{
  "response_type": "tool_calls",
  "content": {
    "text": "Brief explanation of why tools are needed",
    "tool_calls": [
      {
        "tool": "search_files",
        "parameters": { ... },
        "id": "unique_id"
      }
    ]
  }
}

**Recursive Mode:**
- Set "recursive_mode": true in metadata if you need to call tools and then continue processing.
- The system will execute tools and feed results back to you in the next iteration.
- Set "recursive_mode": false when you have enough information to provide a final response.

**Response Type Examples:**

1. Simple Response (for basic questions/explanations):
{
  "response_type": "simple_response",
  "content": {
    "text": "Your explanation or answer here",
    "suggestions": ["optional", "follow-up", "suggestions"]
  }
}

2. File Operations (for creating/modifying files):
{
  "response_type": "file_operations", 
  "content": {
    "text": "Brief explanation of the file changes",
    "operations": [
      {
        "type": "create|update|delete",
        "file_path": "relative/path/to/file.js",
        "content": "// File content here...",
        "language": "javascript",
        "backup_original": true
      }
    ]
  }
}

3. Terminal Commands (for running shell commands):
{
  "response_type": "terminal_commands",
  "content": {
    "text": "Brief explanation of what commands will do", 
    "commands": [
      {
        "command": "npm install lodash",
        "description": "Install lodash dependency",
        "working_directory": "./",
        "require_confirmation": true,
        "risk_level": "low"
      }
    ]
  }
}

4. Plan Execution (for multi-step tasks):
{
  "response_type": "plan_execution",
  "content": {
    "text": "Overview of the plan",
    "plan": {
      "title": "Plan title",
      "description": "Detailed plan description", 
      "estimated_duration": "5-10 minutes",
      "steps": [
        {
          "id": 1,
          "title": "Step title",
          "objective": "What this step accomplishes",
          "dependencies": [],
          "estimated_duration": "2 minutes",
          "required_files": ["package.json"],
          "expected_outputs": ["Dependencies installed"]
        }
      ]
    }
  }
}

5. Mixed Response (combines multiple types):
{
  "response_type": "mixed_response",
  "content": {
    "text": "Main explanation",
    "components": [
      {
        "type": "file_operations",
        "data": { "operations": [...] }
      },
      {
        "type": "terminal_commands", 
        "data": { "commands": [...] }
      }
    ]
  }
}

6. Error Response:
{
  "response_type": "error_response",
  "content": {
    "error": {
      "message": "Clear error description",
      "code": "ERROR_CODE",
      "suggestions": ["How to fix this"]
    }
  }
}

7. Tool Calls:
{
  "response_type": "tool_calls",
  "content": {
    "text": "Searching for relevant files...",
    "tool_calls": [
      {
        "tool": "search_files",
        "parameters": { "query": "function", "file_extensions": ["js", "ts"] },
        "id": "search_1"
      }
    ]
  },
  "metadata": { "recursive_mode": true }
}

Workspace root: ${workspaceRoot}

**File Path Rules:**
- Always use forward slashes (/) in file paths
- Relative paths will be resolved against workspace root: ${workspaceRoot}
- For file operations, include the language field for syntax highlighting

**Search Capability:**
- If you need to find files, use: SEARCH_FILE: <pattern>
- The system will return matching files with their content before you respond

**Important Guidelines:**
- Always validate your JSON before responding
- Include helpful explanatory text in the "text" fields
- Set appropriate risk levels for terminal commands
- Keep file content complete but concise
- Use descriptive step titles and objectives in plans
`;
    let contextFilesPrompt = '';
    if (contextFiles.length > 0) {
        contextFilesPrompt = '\n\nContext files provided:\n';
        for (const file of contextFiles) {
            contextFilesPrompt += `---\nFile: ${path.basename(file.filepath)}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n`;
        }
    }

    const chatLog = JSON.stringify(chatHistory, null, 2);
    let finalPrompt =
        copilotPrompt +
        contextFilesPrompt +
        "\n\nPrevious conversation (JSON array):\n" +
        chatLog +
        "\n\nUser query:\n" +
        userMessage +
        "\n\nPlease use the concise code block format for any file changes, and user terminal commands to search for the files if needed.";

    // Append tool results if provided
    if (toolResults && toolResults.length > 0) {
        const toolResultsText = toolResults.map(tr => 
          `Tool Call ${tr.id} (${tr.tool}):\n${JSON.stringify(tr.result, null, 2)}\n`
        ).join('\n');
        finalPrompt += `\n\nTool Results:\n${toolResultsText}\n\nPlease provide your final response based on these results.`;
    }

    console.log("[VSX] Sending structured prompt to LLM");
    const response = await aiEngine.generateResponse(finalPrompt, workspaceContext);
    console.log("[VSX] Received response from LLM");
    return response;
}

module.exports = {
    processUserMessage,
    getWorkspaceFiles,
    getFileContent
};