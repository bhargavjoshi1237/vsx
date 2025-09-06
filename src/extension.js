const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { GeminiClient } = require("./llm/gemini-client");
const { getChatPanelHTML } = require("./ui/chat-panel");
const { processUserMessage, getWorkspaceFiles, getFileContent } = require("./llm/message-wrapper");
const { decodeLLMResponse } = require("./llm/llm-response-decoder");
const { FileEditor } = require("./core/file-editor");
const fileEditor = new FileEditor();

let chatPanel = null;
let geminiClient = null;
let chatHistory = [];
let chatId = "chat_" + Date.now();
// NEW: store extension context for globalState access and permission persistence
let extensionContext = null;

// NEW: Output channel for showing VSX command outputs (do not execute twice)
let vsxOutputChannel = null;

async function activate(context) {
  console.log("VSX Extension activating...");

  try {
    // Save the context so other helpers can access globalState
    extensionContext = context;

    // Initialize the LLM client and pass secret storage context so we can read existing API key
    await initializeLLM(context);
    vscode.window.showInformationMessage("VSX AI Assistant is ready!");
    registerCommands(context);

    const treeDataProvider = new VscodeApiTreeDataProvider();
    vscode.window.registerTreeDataProvider("vsxView", treeDataProvider);

    vscode.commands.executeCommand("vsx.openChatPanel");
    console.log("VSX Extension activated successfully");
  } catch (error) {
    console.error("Failed to activate VSX Extension:", error);
    vscode.window.showErrorMessage(
      `VSX Extension failed to activate: ${error.message}`
    );
  }
}

async function initializeLLM(context) {
  geminiClient = new GeminiClient();

  // Try to get saved API keys from SecretStorage
  try {
    if (context && context.secrets) {
      const savedKey = await context.secrets.get("vsx.geminiApiKey");
      const cerebrasKey = await context.secrets.get("vsx.cerebrasApiKey");
      const nvidiaKey = await context.secrets.get("vsx.nvidiaApiKey");
      geminiClient.initialize({ apiKey: savedKey || null });
      if (cerebrasKey) geminiClient.setCerebrasKey(cerebrasKey);
      if (nvidiaKey) geminiClient.setNvidiaKey(nvidiaKey);
    } else {
      geminiClient.initialize({});
    }
  } catch (e) {
    console.warn("Failed to read saved API keys from secrets:", e);
    geminiClient.initialize({});
  }
}

function registerCommands(context) {
  const helloWorldDisposable = vscode.commands.registerCommand(
    "vsx.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from VSX!");
    }
  );

  const openChatPanelDisposable = vscode.commands.registerCommand(
    "vsx.openChatPanel",
    () => {
      openChatPanel(context);
    }
  );

  // New: Set API Key command
  const setApiKeyDisposable = vscode.commands.registerCommand(
    "vsx.setApiKey",
    async () => {
      try {
        const input = await vscode.window.showInputBox({
          ignoreFocusOut: true,
          password: true,
          placeHolder: "Enter Gemini API Key (kept in Secret Storage)",
          prompt: "Enter your Gemini API key"
        });
        if (!input) {
          vscode.window.showInformationMessage("No API key provided.");
          return;
        }

        if (context && context.secrets) {
          await context.secrets.store("vsx.geminiApiKey", input);
        }

        if (!geminiClient) geminiClient = new GeminiClient();
        geminiClient.setApiKey(input);

        // Test connection when a new key is set
        const test = await geminiClient.testConnection();
        if (test.success) {
          vscode.window.showInformationMessage("Gemini API key saved and connection successful.");
        } else {
          vscode.window.showWarningMessage(`API key saved but test failed: ${test.error || 'unknown error'}`);
        }
      } catch (err) {
        console.error("Error setting API key:", err);
        vscode.window.showErrorMessage("Failed to set API key: " + err.message);
      }
    }
  );

  // New: Set Cerebras API Key command
  const setCerebrasKeyDisposable = vscode.commands.registerCommand(
    "vsx.setCerebrasApiKey",
    async () => {
      try {
        const input = await vscode.window.showInputBox({
          ignoreFocusOut: true,
          password: true,
          placeHolder: "Enter Cerebras API Key (kept in Secret Storage)",
          prompt: "Enter your Cerebras API key"
        });
        if (!input) {
          vscode.window.showInformationMessage("No Cerebras API key provided.");
          return;
        }
        if (context && context.secrets) {
          await context.secrets.store("vsx.cerebrasApiKey", input);
        }
        if (!geminiClient) geminiClient = new GeminiClient();
        geminiClient.setCerebrasKey(input);

        // Try a minimal test call via client's testConnection (may fallback to mock)
        const test = await geminiClient.testConnection();
        if (test.success) {
          vscode.window.showInformationMessage("Cerebras API key saved. Test succeeded (or mock returned).");
        } else {
          vscode.window.showWarningMessage(`Cerebras key saved but test failed: ${test.error || 'unknown error'}`);
        }
      } catch (err) {
        console.error("Error setting Cerebras API key:", err);
        vscode.window.showErrorMessage("Failed to set Cerebras API key: " + err.message);
      }
    }
  );

    // New: Set NVIDIA API Key command
    const setNvidiaKeyDisposable = vscode.commands.registerCommand(
      "vsx.setNvidiaApiKey",
      async () => {
        try {
          const input = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            password: true,
            placeHolder: "Enter NVIDIA API Key (kept in Secret Storage)",
            prompt: "Enter your NVIDIA API key"
          });
          if (!input) {
            vscode.window.showInformationMessage("No NVIDIA API key provided.");
            return;
          }
          if (context && context.secrets) {
            await context.secrets.store("vsx.nvidiaApiKey", input);
          }
          if (!geminiClient) geminiClient = new GeminiClient();
          geminiClient.setNvidiaKey(input);

          const test = await geminiClient.testConnection();
          if (test.success) {
            vscode.window.showInformationMessage("NVIDIA API key saved. Test succeeded (or mock returned).");
          } else {
            vscode.window.showWarningMessage(`NVIDIA key saved but test failed: ${test.error || 'unknown error'}`);
          }
        } catch (err) {
          console.error("Error setting NVIDIA API key:", err);
          vscode.window.showErrorMessage("Failed to set NVIDIA API key: " + err.message);
        }
      }
    );

  // New: Clear API Key command
  const clearApiKeyDisposable = vscode.commands.registerCommand(
    "vsx.clearApiKey",
    async () => {
      try {
        if (context && context.secrets) {
          await context.secrets.delete("vsx.geminiApiKey");
        }
        if (geminiClient) geminiClient.setApiKey(null);
        vscode.window.showInformationMessage("Gemini API key cleared from Secret Storage.");
      } catch (err) {
        console.error("Error clearing API key:", err);
        vscode.window.showErrorMessage("Failed to clear API key: " + err.message);
      }
    }
  );

  // New: Clear Cerebras API Key command
  const clearCerebrasKeyDisposable = vscode.commands.registerCommand(
    "vsx.clearCerebrasApiKey",
    async () => {
      try {
        if (context && context.secrets) {
          await context.secrets.delete("vsx.cerebrasApiKey");
        }
        if (geminiClient) geminiClient.setCerebrasKey(null);
        vscode.window.showInformationMessage("Cerebras API key cleared from Secret Storage.");
      } catch (err) {
        console.error("Error clearing Cerebras API key:", err);
        vscode.window.showErrorMessage("Failed to clear Cerebras API key: " + err.message);
      }
    }
  );

  // New: Clear NVIDIA API Key command
  const clearNvidiaKeyDisposable = vscode.commands.registerCommand(
    "vsx.clearNvidiaApiKey",
    async () => {
      try {
        if (context && context.secrets) {
          await context.secrets.delete("vsx.nvidiaApiKey");
        }
        if (geminiClient) geminiClient.setNvidiaKey(null);
        vscode.window.showInformationMessage("NVIDIA API key cleared from Secret Storage.");
      } catch (err) {
        console.error("Error clearing NVIDIA API key:", err);
        vscode.window.showErrorMessage("Failed to clear NVIDIA API key: " + err.message);
      }
    }
  );

  // New command: toggle/allow terminal execution (manual)
  const allowTerminalExecDisposable = vscode.commands.registerCommand(
    "vsx.allowTerminalExecution",
    async () => {
      try {
        if (!extensionContext) {
          vscode.window.showInformationMessage("Extension context not initialized yet.");
          return;
        }
        const currently = extensionContext.globalState.get("vsx.allowTerminalExecution", false);
        const pick = await vscode.window.showQuickPick(
          [
            { label: "Always allow terminal execution", desc: "Grant persistent permission" },
            { label: "Revoke permission", desc: "Disallow automatic execution" },
            { label: "Cancel", desc: "" }
          ].map(p => p.label),
          { placeHolder: `Currently: ${currently ? "Allowed" : "Not allowed"}` }
        );
        if (pick === "Always allow terminal execution") {
          await extensionContext.globalState.update("vsx.allowTerminalExecution", true);
          vscode.window.showInformationMessage("VSX: Terminal execution will run automatically.");
        } else if (pick === "Revoke permission") {
          await extensionContext.globalState.update("vsx.allowTerminalExecution", false);
          vscode.window.showInformationMessage("VSX: Terminal execution revoked.");
        }
      } catch (err) {
        console.error("Error toggling terminal permission:", err);
        vscode.window.showErrorMessage("Failed to update execution permission.");
      }
    }
  );

  context.subscriptions.push(
    helloWorldDisposable,
    openChatPanelDisposable,
    setApiKeyDisposable,
    clearApiKeyDisposable,
    setCerebrasKeyDisposable,
    setNvidiaKeyDisposable,
    clearCerebrasKeyDisposable,
    clearNvidiaKeyDisposable,
    allowTerminalExecDisposable // <- added
  );
}

function openChatPanel(context) {
  if (chatPanel) {
    chatPanel.reveal(vscode.ViewColumn.Two);
    return;
  }

  chatPanel = vscode.window.createWebviewPanel(
    "vsxChatPanel",
    "VSX AI Assistant",
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  chatPanel.webview.html = getChatPanelHTML();

  chatPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case "sendMessage":
          // Pass contextFiles and selected mode from webview to handleChatMessage
          await handleChatMessage(
            message.message,
            message.model || "gemini-2.0-flash-exp",
            message.contextFiles || [],
            message.mode || "ask"
          );
          break;
        case "clearChat":
          handleClearChat();
          break;
        case "newChat":
          handleNewChat();
          break;
        case "getWorkspaceFiles":
          // List files in workspace and send to webview
          try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceFolder) {
              const files = getWorkspaceFiles(workspaceFolder);
              chatPanel.webview.postMessage({ command: "updateFileList", files });
            } else {
              chatPanel.webview.postMessage({ command: "updateFileList", files: [] });
            }
          } catch (err) {
            chatPanel.webview.postMessage({ command: "updateFileList", files: [] });
          }
          break;
        case "executeCommand":
          // Handle API key commands from the dropdown
          if (message.targetCommand) {
            vscode.commands.executeCommand(message.targetCommand);
          }
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  chatPanel.onDidDispose(
    () => {
      chatPanel = null;
    },
    null,
    context.subscriptions
  );
}

// --- New: helpers to extract and run terminal commands suggested by the LLM ---
/**
 * Extract terminal commands from LLM text.
 * Supports:
 *  - Lines like: RUN_TERMINAL: <command>
 *  - Fenced code blocks with language bash/sh/zsh/terminal where the block contents are commands
 */
function extractTerminalCommandsFromText(text) {
  if (!text || typeof text !== "string") return [];

  const commands = [];

  // Match RUN_TERMINAL: <command>
  const runRegex = /RUN_TERMINAL:\s*(.+)/g;
  let m;
  while ((m = runRegex.exec(text)) !== null) {
    const cmd = m[1].trim();
    if (cmd) commands.push(cmd);
  }

  // Match fenced code blocks for bash/sh/zsh/terminal
  const blockRegex = /```(?:bash|sh|zsh|terminal)\n([\s\S]*?)```/g;
  while ((m = blockRegex.exec(text)) !== null) {
    const block = m[1].trim();
    if (!block) continue;
    // split into lines, ignore comment-only lines that start with // or #
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^\/\/|^#/.test(l));
    for (const l of lines) commands.push(l);
  }

  return commands;
}

/**
 * Execute a single shell command with captured output (cwd limited to workspace root).
 * Returns a Promise resolving to { command, stdout, stderr, code, error }
 */
function execCommandCapture(cmd, cwd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: cwd || process.cwd(), shell: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const result = {
        command: cmd,
        stdout: stdout ? String(stdout) : "",
        stderr: stderr ? String(stderr) : "",
        code: error && typeof error.code === "number" ? error.code : 0,
        error: error ? String(error.message || error) : null
      };
      resolve(result);
    });
  });
}

/**
 * Ask user (modal) and run commands, capture output and return full results so LLM can continue.
 * If the user chooses "Run in Terminal" we execute via child_process.exec (to capture)
 * and then print captured output into the integrated terminal (echo lines) so the user sees it there.
 */
/**
 * Ask user (modal) and run commands, capture output and return full results so LLM can continue.
 * If the user chooses "Run in Terminal" we execute via child_process.exec (to capture)
 * and then print captured output into the integrated terminal so the user sees it there.
 */
async function executeTerminalCommands(commands) {
  const results = [];
  if (!Array.isArray(commands) || commands.length === 0) return results;

  // Determine stored permission (default false)
  const stored = extensionContext ? extensionContext.globalState.get("vsx.allowTerminalExecution", false) : false;

  // If stored, default to terminal mode; otherwise ask user with a modal dialog
  let executeMode = stored ? "terminal" : "prompt"; // "terminal", "background", "prompt", "cancel"
  if (!stored) {
    const preview = commands.map(c => `• ${c}`).join("\n");
    const pick = await vscode.window.showWarningMessage(
      `VSX proposes to run terminal command(s):\n${preview}`,
      { modal: true },
      "Run in Terminal",
      "Run in Background",
      "Always allow (Terminal)",
      "Cancel"
    );

    if (pick === "Run in Terminal") {
      executeMode = "terminal";
    } else if (pick === "Run in Background") {
      executeMode = "background";
    } else if (pick === "Always allow (Terminal)") {
      executeMode = "terminal";
      if (extensionContext) await extensionContext.globalState.update("vsx.allowTerminalExecution", true);
    } else {
      executeMode = "cancel";
    }
  }

  if (executeMode === "cancel") {
    for (const cmd of commands) {
      results.push({ command: cmd, status: "skipped", message: "User declined execution" });
    }
    return results;
  }

  const workspaceFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

  // Try to reuse or create an integrated terminal only when needed for display
  let terminalForDisplay = null;
  const shouldShowInTerminal = executeMode === "terminal";
  if (shouldShowInTerminal) {
    try {
      const terminalName = "VSX Assistant";
      terminalForDisplay = vscode.window.terminals.find(t => t.name === terminalName) || vscode.window.createTerminal(terminalName);
      terminalForDisplay.show(true);
    } catch (e) {
      terminalForDisplay = null;
    }
  }

  for (const cmd of commands) {
    try {
      // Execute command and wait for completion (capture stdout/stderr)
      const res = await execCommandCapture(cmd, workspaceFolderPath);

      // If user requested terminal display, run the command in the integrated terminal
      if (terminalForDisplay) {
        try {
          terminalForDisplay.sendText(cmd, true);
        } catch (tErr) {
          // ignore terminal printing errors
        }
      }

      results.push({
        command: cmd,
        status: "done",
        stdout: res.stdout,
        stderr: res.stderr,
        code: res.code,
        error: res.error
      });
    } catch (err) {
      results.push({
        command: cmd,
        status: "error",
        error: String(err)
      });
    }
  }

  return results;
}
// --- end new helpers ---

// --- NEW: parse a JSON plan block from LLM text ---
function parsePlanFromText(text) {
  if (!text || typeof text !== "string") return null;
  // look for a fenced json block first
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  let m;
  while ((m = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && (parsed.plan || parsed.steps)) {
        const plan = parsed.plan || { steps: parsed.steps };
        // normalize steps to have id/title/objective
        if (Array.isArray(plan.steps)) {
          plan.steps = plan.steps.map((s, idx) => ({
            id: s.id || idx + 1,
            title: s.title || `Step ${idx + 1}`,
            objective: s.objective || s.description || "",
            inputNeeded: s.inputNeeded || s.inputs || []
          }));
          return plan;
        }
      }
    } catch (e) {
      continue;
    }
  }

  // fallback: look for PLAN_JSON: { ... } inline after marker
  const inlineRegex = /PLAN_JSON:\s*(\{[\s\S]*\})/;
  const im = inlineRegex.exec(text);
  if (im) {
    try {
      const parsed = JSON.parse(im[1]);
      const plan = parsed.plan || { steps: parsed.steps };
      if (Array.isArray(plan.steps)) {
        plan.steps = plan.steps.map((s, idx) => ({
          id: s.id || idx + 1,
          title: s.title || `Step ${idx + 1}`,
          objective: s.objective || s.description || "",
          inputNeeded: s.inputNeeded || s.inputs || []
        }));
        return plan;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}
// --- end parse plan ---

// --- NEW: central helper to process LLM content: run terminal cmds, apply file edits, return summary ---
async function processLLMInstructions({ llmContent, workspaceFolder, contextFiles = [], geminiClient, chatPanel }) {
  const result = {
    llmContent,
    fileEditResults: [],
    execResults: []
  };

  try {
    // Terminal commands
    const terminalCommands = extractTerminalCommandsFromText(llmContent);
    if (terminalCommands.length > 0) {
      const execResults = await executeTerminalCommands(terminalCommands);
      result.execResults = execResults;
    }

    // File edit handling (Copilot style)
    const codeBlockRegex = /```[^\n]*\n\/\/ filepath: ([^\n]+)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(llmContent)) !== null) {
      const filePath = match[1].trim();
      const newContent = match[2];
      try {
        const workspace = workspaceFolder;
        let targetFsPath;
        if (workspace) {
          if (path.isAbsolute(filePath)) {
            targetFsPath = path.normalize(filePath);
          } else {
            targetFsPath = path.normalize(path.join(workspace.uri.fsPath, filePath));
          }
        } else {
          targetFsPath = path.isAbsolute(filePath)
            ? path.normalize(filePath)
            : path.normalize(path.join(process.cwd(), filePath));
        }
        const fileUri = vscode.Uri.file(targetFsPath);
        const fileExists = fs.existsSync(targetFsPath);

        if (fileExists) {
          const document = await vscode.workspace.openTextDocument(fileUri);
          const workspaceEdit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
          let finalContent = newContent;
          if (finalContent && /\.{3}existing code\.{3}/.test(finalContent)) {
            const originalText = document.getText();
            finalContent = finalContent.replace(/\/\*\s*\.{3}existing code\.{3}\s*\*\//g, originalText);
            finalContent = finalContent.replace(/\/\/\s*\.{3}existing code\.{3}/g, originalText);
            finalContent = finalContent.replace(/\.{3}existing code\.{3}/g, originalText);
          }
          workspaceEdit.replace(fileUri, fullRange, finalContent);
          const success = await vscode.workspace.applyEdit(workspaceEdit);
          if (success) await document.save();
          result.fileEditResults.push({ filePath: targetFsPath, success, message: success ? "Updated" : "Failed" });
        } else {
          const dir = path.dirname(targetFsPath);
          fs.mkdirSync(dir, { recursive: true });
          let finalContent = newContent
            .replace(/\/\*\s*\.{3}existing code\.{3}\s*\*\//g, "")
            .replace(/\/\/\s*\.{3}existing code\.{3}/g, "")
            .replace(/\.{3}existing code\.{3}/g, "")
            .replace(/^\s+/, "")
            .replace(/\s+$/, "");
          const uint8array = Buffer.from(finalContent, "utf8");
          await vscode.workspace.fs.writeFile(fileUri, uint8array);
          const document = await vscode.workspace.openTextDocument(fileUri);
          await document.save();
          result.fileEditResults.push({ filePath: targetFsPath, success: true, message: "Created" });
        }
      } catch (err) {
        result.fileEditResults.push({ filePath, success: false, message: String(err) });
      }
    }
  } catch (err) {
    // swallow to avoid breaking the main flow
    console.error("processLLMInstructions error:", err);
  }
  return result;
}
// --- end central helper ---

// --- NEW: execute plan steps sequentially (auto-execute, with retries) ---
async function executePlanSteps(plan, { workspaceFolder, contextFiles = [], geminiClient, chatPanel, chatHistory, selectedMode }) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return null;
  const lines = [`Planned ${plan.steps.length} step(s):`, `${plan.summary || ""}`, ""];
  for (const s of plan.steps) {
    lines.push(`- [${s.id}] ${s.title}: ${s.objective}`);
  }
  if (chatPanel) {
    chatPanel.webview.postMessage({
      command: "addMessage",
      message: { role: "assistant", content: lines.join("\n"), timestamp: new Date().toLocaleTimeString(), metadata: { planPreview: true } }
    });
  }

  // Auto-execute plans without asking for confirmation
  if (chatPanel) {
    chatPanel.webview.postMessage({
      command: "addMessage",
      message: { role: "assistant", content: `Executing plan automatically...`, timestamp: new Date().toLocaleTimeString(), metadata: { planAutoExecute: true } }
    });
  }

  const stepOutputs = [];
  for (let si = 0; si < plan.steps.length; si++) {
    const step = plan.steps[si];

    if (chatPanel) {
      chatPanel.webview.postMessage({
        command: "addMessage",
        message: { role: "assistant", content: `Starting step [${step.id}] ${step.title}: ${step.objective}`, timestamp: new Date().toLocaleTimeString(), metadata: { stepId: step.id } }
      });
    }

    const previousSummary = stepOutputs.map((o, i) => `Step ${i + 1} result:\n${o.result || o.content || ''}`).join("\n\n");
    const stepPrompt = `EXECUTE_STEP:
Step ID: ${step.id}
Title: ${step.title}
Objective: ${step.objective}
Previous step outputs (if any):
${previousSummary || '(none)'}
Provide any suggested file edits (use Copilot-style filepath blocks) or terminal commands (RUN_TERMINAL: or fenced bash). Keep answer concise.`;

    const stepResponse = await processUserMessage({
      userMessage: stepPrompt,
      workspaceContext: {},
      aiEngine: geminiClient,
      chatHistory,
      contextFiles
    });

    const stepContent = await decodeLLMResponse({ response: stepResponse });

    if (chatPanel) {
      chatPanel.webview.postMessage({
        command: "addMessage",
        message: { role: "assistant", content: `Step [${step.id}] result:\n\n${stepContent}`, timestamp: new Date().toLocaleTimeString(), metadata: { stepId: step.id } }
      });
    }

    // Process terminal commands & file edits found in this step's response
    const stepProcessing = await processLLMInstructions({ llmContent: stepContent, workspaceFolder, contextFiles, geminiClient, chatPanel });

    const stepOutput = {
      stepId: step.id,
      title: step.title,
      content: stepContent,
      fileEdits: stepProcessing.fileEditResults || [],
      terminal: stepProcessing.execResults || [],
      fixExecution: []
    };
    stepOutputs.push(stepOutput);

    // Notify webview about file-changes (so context may be refreshed)
    if (chatPanel && stepProcessing.fileEditResults && stepProcessing.fileEditResults.length > 0) {
      chatPanel.webview.postMessage({ command: "contextFilesUpdated" });
    }

    // --- Validation with retries (up to 5) ---
    try {
      let validation = await validateStepExecution({
        step,
        execResults: stepProcessing.execResults || [],
        fileEdits: stepProcessing.fileEditResults || [],
        geminiClient,
        chatHistory,
        contextFiles
      });

      // Post initial validation summary
      if (chatPanel) {
        const vmsg = `Validation for step [${step.id}]: completed=${validation.completed ? 'true' : 'false'}${validation.notes ? `\nNotes: ${validation.notes}` : ''}${validation.fixCommands && validation.fixCommands.length ? `\nSuggested fixes: ${validation.fixCommands.join(' && ')}` : ''}`;
        chatPanel.webview.postMessage({
          command: "addMessage",
          message: { role: "assistant", content: vmsg, timestamp: new Date().toLocaleTimeString(), metadata: { validation: true, stepId: step.id } }
        });
      }

      const maxRetries = 5;
      let attempt = 0;
      // Retry loop: if not completed, try up to maxRetries
      while (!validation.completed && attempt < maxRetries) {
        attempt++;

        const fixCmds = Array.isArray(validation.fixCommands) ? validation.fixCommands.filter(Boolean) : [];

        if (fixCmds.length > 0) {
          // Execute suggested fixes automatically (executeTerminalCommands will respect stored permission)
          const fixResults = await executeTerminalCommands(fixCmds);
          stepOutput.fixExecution = stepOutput.fixExecution.concat(fixResults);

          // Post fix execution summary
          if (chatPanel) {
            const truncate = (s, n = 400) => (s && s.length > n ? s.substring(0, n) + '...[truncated]' : (s || ''));
            const summaryLines = fixResults.map(r => `Ran: \`${r.command}\` -> ${r.status}${r.stdout ? `\n\`\`\`\n${truncate(r.stdout)}\n\`\`\`` : ''}`).join("\n\n");
            chatPanel.webview.postMessage({
              command: "addMessage",
              message: { role: "assistant", content: `Attempt ${attempt}/${maxRetries}: Executed suggested fixes:\n\n${summaryLines}`, timestamp: new Date().toLocaleTimeString(), metadata: { fixRunAttempt: attempt, stepId: step.id } }
            });
          }

          // Re-validate using combined exec results (original + fixes)
          const combinedExec = (stepProcessing.execResults || []).concat(stepOutput.fixExecution || []);
          validation = await validateStepExecution({
            step,
            execResults: combinedExec,
            fileEdits: stepProcessing.fileEditResults || [],
            geminiClient,
            chatHistory,
            contextFiles
          });

          // Post revalidation summary
          if (chatPanel) {
            chatPanel.webview.postMessage({
              command: "addMessage",
              message: { role: "assistant", content: `Re-validation after attempt ${attempt}: completed=${validation.completed ? 'true' : 'false'}${validation.notes ? `\nNotes: ${validation.notes}` : ''}`, timestamp: new Date().toLocaleTimeString(), metadata: { revalidation: true, attempt, stepId: step.id } }
            });
          }

        } else {
          // No fix commands suggested. Re-request validation (LLM may now provide guidance) up to retries.
          validation = await validateStepExecution({
            step,
            execResults: stepProcessing.execResults || [],
            fileEdits: stepProcessing.fileEditResults || [],
            geminiClient,
            chatHistory,
            contextFiles
          });

          if (chatPanel) {
            chatPanel.webview.postMessage({
              command: "addMessage",
              message: { role: "assistant", content: `Attempt ${attempt}/${maxRetries}: validation re-check returned completed=${validation.completed ? 'true' : 'false'}${validation.notes ? `\nNotes: ${validation.notes}` : ''}`, timestamp: new Date().toLocaleTimeString(), metadata: { revalidationNoFix: true, attempt, stepId: step.id } }
            });
          }
        }

        // If resolved, break out early
        if (validation.completed) break;
      } // end retries

      // After retries: if still not completed, either merge fixes to next step or report final failure
      if (!validation.completed) {
        const finalFixes = Array.isArray(validation.fixCommands) ? validation.fixCommands.filter(Boolean) : [];
        if (si + 1 < plan.steps.length && finalFixes.length > 0) {
          // Merge remediation into next step objective
          const nextStep = plan.steps[si + 1];
          nextStep.objective = `${nextStep.objective}\n\n[Backtrack from step ${step.id}]: Please also run or consider these remediation commands before/while performing the next step: ${finalFixes.join(' ; ')}`;
          if (chatPanel) {
            chatPanel.webview.postMessage({
              command: "addMessage",
              message: { role: "assistant", content: `After ${maxRetries} attempts, merged remediation for step ${step.id} into next step [${nextStep.id}] objective.`, timestamp: new Date().toLocaleTimeString(), metadata: { mergedFixes: true, fromStep: step.id, toStep: nextStep.id, attempts: maxRetries } }
            });
          }
        } else {
          // No next step or no fixes: final failure notice
          if (chatPanel) {
            chatPanel.webview.postMessage({
              command: "addMessage",
              message: { role: "assistant", content: `Step ${step.id} not validated after ${maxRetries} attempts. Stopping further remediation for this step.`, timestamp: new Date().toLocaleTimeString(), metadata: { validationFailed: true, stepId: step.id, attempts: maxRetries } }
            });
          }
        }
      }
    } catch (vErr) {
      console.error("Validation/backtrack error:", vErr);
    }
    // --- end validation/backtrack ---

  } // end steps loop

  // Summarize results to user
  const summaryLines = ["Plan execution completed. Summary:"];
  for (const o of stepOutputs) {
    summaryLines.push(`Step [${o.stepId}] ${o.title}:`);
    if ((o.fileEdits || []).length > 0) {
      for (const fe of o.fileEdits) {
        summaryLines.push(` - File ${fe.filePath}: ${fe.success ? "OK" : "FAIL"} ${fe.message || ""}`);
      }
    }
    if ((o.terminal || []).length > 0) {
      for (const te of o.terminal) {
        summaryLines.push(` - Command: ${te.command} -> ${te.status}`);
      }
    }
    if (o.fixExecution && o.fixExecution.length > 0) {
      for (const fe of o.fixExecution) {
        summaryLines.push(` - Fix command: ${fe.command} -> ${fe.status}`);
      }
    }
    summaryLines.push("");
  }

  if (chatPanel) {
    chatPanel.webview.postMessage({
      command: "addMessage",
      message: { role: "assistant", content: summaryLines.join("\n"), timestamp: new Date().toLocaleTimeString(), metadata: { planExecuted: true } }
    });
  }

  return { cancelled: false, stepOutputs };
}
// --- end replaced function ---

// --- NEW helper: extract JSON object from LLM text (fenced ```json or inline {...}) ---
function extractJSONFromText(text) {
  if (!text || typeof text !== 'string') return null;
  // Try fenced json block first
  const fenced = /```json\s*([\s\S]*?)```/m.exec(text);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch (e) {
      // fallthrough
    }
  }
  // Try to find the first {...} block that parses as JSON
  const inlineMatch = /(\{[\s\S]*\})/.exec(text);
  if (inlineMatch) {
    try {
      return JSON.parse(inlineMatch[1]);
    } catch (e) {
      return null;
    }
  }
  return null;
}
// --- end helper ---

// --- NEW: validate a step by asking the LLM to inspect executed commands and outputs and respond with JSON ---
async function validateStepExecution({ step, execResults = [], fileEdits = [], geminiClient, chatHistory = [], contextFiles = [] }) {
  try {
    // Build a descriptive prompt including commands + outputs
    const cmdsDesc = execResults.length > 0
      ? execResults.map(r => `Command: ${r.command}\nExit code: ${r.code || 0}\nStdout:\n${r.stdout || '(none)'}\nStderr:\n${r.stderr || '(none)'}\n`).join("\n---\n")
      : "(no terminal commands were executed)";

    const filesDesc = fileEdits.length > 0
      ? fileEdits.map(f => `File: ${f.filePath}\nResult: ${f.success ? 'updated/created' : 'failed'}\nMessage: ${f.message || ''}`).join("\n---\n")
      : "(no file edits)";

    const userPrompt = `
You are VSX. Validate whether the step below achieved its objective given the executed commands and file edits. 
Respond ONLY with a JSON object (no extra text). Format:
{
  "stepId": <number>,
  "completed": <true|false>,
  "fixCommands": [ "command1", "command2" ],    // optional, empty array if none
  "notes": "short explanation"
}

Step:
ID: ${step.id}
Title: ${step.title}
Objective: ${step.objective}

Executed terminal commands and outputs:
${cmdsDesc}

File edits performed:
${filesDesc}

Answer now in JSON only.
`.trim();

    const resp = await processUserMessage({
      userMessage: userPrompt,
      workspaceContext: {},
      aiEngine: geminiClient,
      chatHistory,
      contextFiles
    });

    const decoded = await decodeLLMResponse({ response: resp });
    const parsed = extractJSONFromText(decoded);
    if (parsed && typeof parsed === 'object' && (typeof parsed.completed === 'boolean' || typeof parsed.stepId !== 'undefined')) {
      return parsed;
    }

    // If parsing failed, be conservative and return unknown -> not completed
    return { stepId: step.id, completed: false, fixCommands: [], notes: 'Could not parse validation response' };
  } catch (e) {
    return { stepId: step.id, completed: false, fixCommands: [], notes: `Validation error: ${String(e)}` };
  }
}
// --- end validate helper ---

async function handleChatMessage(userMessage, selectedModel, contextFilesList = [], selectedMode = "ask") {
  if (!chatPanel || !geminiClient) return;

  try {
    chatHistory.push({
      role: "user",
      content: userMessage,
      mode: selectedMode,
      timestamp: new Date().toLocaleTimeString(),
    });

    chatPanel.webview.postMessage({
      command: "addMessage",
      message: {
        role: "user",
        content: userMessage,
        metadata: { mode: selectedMode },
        timestamp: new Date().toLocaleTimeString(),
      },
    });

    chatPanel.webview.postMessage({
      command: "showTyping",
    });

    if (selectedModel && geminiClient) {
      geminiClient.model = selectedModel;
    }

    // Read selected files and send as context
    let contextFiles = [];
    if (Array.isArray(contextFilesList) && contextFilesList.length > 0) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      for (const fileName of contextFilesList) {
        try {
          const filePath = workspaceFolder ? require("path").join(workspaceFolder, fileName) : fileName;
          contextFiles.push(getFileContent(filePath));
        } catch (err) {
          // Ignore unreadable files
        }
      }
    }

    const response = await processUserMessage({
      userMessage,
      workspaceContext: {},
      aiEngine: geminiClient,
      mode: selectedMode,
      chatHistory,
      contextFiles
    });

    chatPanel.webview.postMessage({
      command: "hideTyping",
    });

    // decode the LLM response
    let llmContent = await decodeLLMResponse({ response });

    // --- NEW: process SEARCH_FILE requests in the LLM response ---
    try {
      const searchPatterns = extractSearchRequestsFromText(llmContent);
      if (searchPatterns.length > 0) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workspaceRoot = workspaceFolder?.uri.fsPath;
        
        if (workspaceRoot) {
          const readFiles = [];
          
          for (const pattern of searchPatterns) {
            const matches = await searchWorkspaceFiles(pattern, workspaceRoot, 10);
            
            // Read the content of found files
            for (const match of matches) {
              const content = readFileLimited(match.path);
              if (content !== null) {
                readFiles.push({
                  filePath: match.relPath,
                  content: content
                });
              }
            }
          }
          
          // Notify in chat about files that were read (file names only)
          if (readFiles.length > 0) {
            const fileNames = readFiles.map(f => f.filePath).join(', ');
            chatPanel.webview.postMessage({
              command: "addMessage",
              message: {
                role: "assistant",
                content: `📖 Read files: ${fileNames}`,
                timestamp: new Date().toLocaleTimeString(),
                metadata: { fileSearch: true }
              }
            });
            
            // Append file content to the existing LLM response for context
            let searchContext = "\n\nFile contents found:\n";
            for (const file of readFiles) {
              searchContext += `---\nFile: ${file.filePath}\n\`\`\`\n${file.content}\n\`\`\`\n`;
            }
            llmContent += searchContext;
          }
        }
      }
    } catch (err) {
      console.error("Error processing SEARCH_FILE requests:", err);
      // Don't break the flow, just log the error
    }
    // --- end search file processing ---

    // --- NEW: detect a plan in the LLM content and offer to execute
    try {
      const plan = parsePlanFromText(llmContent);
      if (plan && plan.steps && plan.steps.length > 0) {
        // Show plan in chat and ask user to confirm & execute
        // executePlanSteps will post its own messages and perform steps if user confirms
        await executePlanSteps(plan, {
          workspaceFolder: vscode.workspace.workspaceFolders?.[0],
          contextFiles,
          geminiClient,
          chatPanel,
          chatHistory,
          selectedMode
        });

        // After plan execution, do not fall-through to duplicate processing of the original plan-block content.
        // Instead, replace llmContent with a short notice (already posted in executePlanSteps) or leave as-is.
      }
    } catch (err) {
      console.error("Error handling plan detection/execution:", err);
    }
    // --- end plan handling ---

    // For non-plan responses or continued flows: process the LLM content the same way as before
    const processed = await processLLMInstructions({ llmContent, workspaceFolder: vscode.workspace.workspaceFolders?.[0], contextFiles, geminiClient, chatPanel });

    // build summary to post for this top-level assistant response (file edits take precedence)
    let summary = llmContent;
    if (processed.fileEditResults.length > 0) {
      summary = "";
      for (const result of processed.fileEditResults) {
        summary += `📝 **File Edits Applied to \`${result.filePath}\`:**\n\n`;
        summary += result.success
          ? `✅ Successfully updated \`${result.filePath}\`\n`
          : `❌ Failed to update \`${result.filePath}\`: ${result.message}\n`;
      }
    }

    // usage and metadata extraction (existing code)
    // ...existing code that estimates tokens and builds metadata...
    // Replace the final webview post with the processed summary & metadata
    const usage = response.usageMetadata || {};
    const promptTokens = geminiClient && typeof geminiClient.estimateTokenCount === 'function'
      ? geminiClient.estimateTokenCount(`${userMessage}`)
      : Math.ceil((`${userMessage}`).length / 4);
    const completionTokens = geminiClient && typeof geminiClient.estimateTokenCount === 'function'
      ? geminiClient.estimateTokenCount((response && (response.content || response.message || '')) || summary || '')
      : Math.ceil(((response && (response.content || response.message || '')) || summary || '').length / 4);
    const totalTokens = promptTokens + completionTokens;

    chatPanel.webview.postMessage({
      command: "addMessage",
      message: {
        role: "assistant",
        content: summary,
        timestamp: new Date().toLocaleTimeString(),
        isFileEdit: processed.fileEditResults.length > 0,
        fileEdits: processed.fileEditResults,
        metadata: {
          model: geminiClient.model,
          mode: selectedMode,
          sentTokens: usage.promptTokenCount || promptTokens,
          receivedTokens: usage.candidatesTokenCount || completionTokens,
          totalTokens: usage.totalTokenCount || totalTokens,
          promptTokens,
          completionTokens,
          tokensUsed: usage.totalTokenCount || totalTokens,
          processingTime: response.processingTime || 0,
          contextFilesCount: contextFiles.length
        },
      },
    });

  } catch (error) {
    console.error("Error handling chat message:", error);

    chatPanel.webview.postMessage({
      command: "hideTyping",
    });

    chatPanel.webview.postMessage({
      command: "addMessage",
      message: {
        role: "assistant",
        content: `I encountered an error: ${error.message}. Please try again or rephrase your question.`,
        timestamp: new Date().toLocaleTimeString(),
        isError: true,
      },
    });
  }
}

function handleClearChat() {
  if (!chatPanel) return;
  chatPanel.webview.postMessage({
    command: "clearMessages",
  });
  chatHistory = [];
}

function handleNewChat() {
  chatId = "chat_" + Date.now();
  chatHistory = [];
  if (chatPanel) {
    chatPanel.webview.postMessage({ command: "clearMessages" });
  }
}

function deactivate() {
  // No cleanup needed for GeminiClient
}

module.exports = {
  activate,
  deactivate,
};

class VscodeApiTreeDataProvider {
  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      return [
        this._item("Open Chat Panel", "vsx.openChatPanel"),
      ];
    }
    return [];
  }

  _item(label, command) {
    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.None
    );
    item.command = { command, title: label };
    item.iconPath = new vscode.ThemeIcon(
      "comment-discussion"
    );
    return item;
  }
}

// --- New: helpers for SEARCH_FILE requests ---
// Extract SEARCH_FILE requests from LLM text, returns array of patterns
function extractSearchRequestsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const regex = /SEARCH_FILE:\s*([^\s\n]+)/g;
  const patterns = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const p = (m[1] || '').trim();
    if (p) patterns.push(p);
  }
  return patterns;
}

// Recursively search workspace for filenames matching pattern (basename substring or exact)
// Limits results to maxMatches and protects against huge workspaces.
async function searchWorkspaceFiles(pattern, workspaceRoot, maxMatches = 10) {
  const matches = [];
  if (!workspaceRoot) return matches;

  // simple substring matching on basename or full relative path
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (matches.length >= maxMatches) return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          // skip node_modules and .git for performance
          const nameLower = e.name.toLowerCase();
          if (nameLower === 'node_modules' || nameLower === '.git') continue;
          walk(full);
        } else if (e.isFile()) {
          const rel = path.relative(workspaceRoot, full);
          const basename = path.basename(full);
          const pat = pattern.replace(/^\*+|\*+$/g, '').toLowerCase(); // trim leading/trailing stars
          if (!pat) continue;
          if (basename.toLowerCase().includes(pat) || rel.toLowerCase().includes(pat)) {
            matches.push({ path: full, relPath: rel });
            if (matches.length >= maxMatches) return;
          }
        }
      }
    } catch (err) {
      // ignore permission issues
    }
  }

  walk(workspaceRoot);
  return matches;
}

// Read file with a size cap and return truncated content
function readFileLimited(filePath, maxBytes = 100 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    const size = stat.size;
    const content = fs.readFileSync(filePath, 'utf8');
    if (size > maxBytes) {
      return content.slice(0, maxBytes) + '\n...[truncated]';
    }
    return content;
  } catch (err) {
    return null;
  }
}
// --- end new helpers ---
