const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { GeminiClient } = require("./llm/gemini-client");
const { getChatPanelHTML } = require("./ui/chat-panel");
const { processUserMessage, getWorkspaceFiles, getFileContent } = require("./llm/message-wrapper");
const { decodeLLMResponse } = require("./llm/llm-response-decoder");
const { FileEditor } = require("./core/file-editor");
const { ResponseProcessor } = require("./llm/response-processor");
const { runDiagnostics } = require('./utils/extension-diagnostics');
const fileEditor = new FileEditor();
const responseProcessor = new ResponseProcessor();

let chatPanel = null;
let geminiClient = null;
let chatHistory = [];
let chatId = "chat_" + Date.now();
// NEW: store extension context for globalState access and permission persistence
let extensionContext = null;

let vsxOutputChannel = null;

let cancelRequested = false; // NEW: indicates the user requested cancellation of current execution

async function activate(context) {
  console.log("VSX Extension activating...");

  try {
    // Save the context so other helpers can access globalState
    extensionContext = context;

    // Initialize the LLM client and pass secret storage context so we can read existing API key
    await initializeLLM(context);
    
    // Register commands BEFORE trying to execute them
    registerCommands(context);
    
    // Show success message
    vscode.window.showInformationMessage("VSX AI Assistant is ready!");

    // Register tree data provider
    const treeDataProvider = new VscodeApiTreeDataProvider();
    vscode.window.registerTreeDataProvider("vsxView", treeDataProvider);

    // Run diagnostics
    await runDiagnostics();

    // Open chat panel after everything is registered
    setTimeout(() => {
      console.log("Attempting to execute vsx.openChatPanel command...");
      vscode.commands.executeCommand("vsx.openChatPanel").then(
        () => console.log("Chat panel command executed successfully"),
        (error) => console.error("Failed to execute chat panel command:", error)
      );
    }, 100);
    
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
  console.log("Registering VSX commands...");
 const providers = {
  gemini: {
    keyName: "vsx.geminiApiKey",
    label: "Gemini",
    setKey: (client, key) => client.setApiKey(key),
  },
  cerebras: {
    keyName: "vsx.cerebrasApiKey",
    label: "Cerebras",
    setKey: (client, key) => client.setCerebrasKey(key),
  },
  nvidia: {
    keyName: "vsx.nvidiaApiKey",
    label: "NVIDIA",
    setKey: (client, key) => client.setNvidiaKey(key),
  },
};
  const commands = [
    {
      id: "vsx.helloWorld",
      callback: () => {
        vscode.window.showInformationMessage("Hello World from VSX!");
      }
    },
    {
      id: "vsx.openChatPanel",
      callback: () => {
        console.log("Opening chat panel...");
        openChatPanel(context);
      }
    },

{
  id: "vsx.manageApiKeys",
  callback: async () => {
    try {
      // Step 1: Pick provider
      const providerChoice = await vscode.window.showQuickPick(
        Object.keys(providers).map(k => ({
          label: providers[k].label,
          value: k,
        })),
        { placeHolder: "Select which API to manage" }
      );
      if (!providerChoice) return;

      const provider = providers[providerChoice.value];

      // Step 2: Pick action
      const action = await vscode.window.showQuickPick(
        [
          { label: "Set API Key", value: "set" },
          { label: "Clear API Key", value: "clear" },
        ],
        { placeHolder: `Do you want to set or clear the ${provider.label} API key?` }
      );
      if (!action) return;

      if (action.value === "set") {
        // Step 3a: Input key
        const input = await vscode.window.showInputBox({
          ignoreFocusOut: true,
          password: true,
          placeHolder: `Enter ${provider.label} API Key (kept in Secret Storage)`,
          prompt: `Enter your ${provider.label} API key`,
        });
        if (!input) {
          vscode.window.showInformationMessage(`No ${provider.label} API key provided.`);
          return;
        }

        if (context && context.secrets) {
          await context.secrets.store(provider.keyName, input);
        }

        if (!geminiClient) geminiClient = new GeminiClient();
        provider.setKey(geminiClient, input);

        const test = await geminiClient.testConnection();
        if (test.success) {
          vscode.window.showInformationMessage(`${provider.label} API key saved and connection successful.`);
        } else {
          vscode.window.showWarningMessage(
            `${provider.label} key saved but test failed: ${test.error || "unknown error"}`
          );
        }
      } else if (action.value === "clear") {
        // Step 3b: Clear key
        if (context && context.secrets) {
          await context.secrets.delete(provider.keyName);
        }
        if (geminiClient) provider.setKey(geminiClient, null);

        vscode.window.showInformationMessage(`${provider.label} API key cleared from Secret Storage.`);
      }
    } catch (err) {
      console.error("Error managing API key:", err);
      vscode.window.showErrorMessage("Failed to manage API key: " + err.message);
    }
  },
},

    {
      id: "vsx.allowTerminalExecution",
      callback: async () => {
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
    }
  ];

  // Register all commands
  const disposables = commands.map(cmd => {
    const disposable = vscode.commands.registerCommand(cmd.id, cmd.callback);
    console.log(`Registered command: ${cmd.id}`);
    return disposable;
  });

  // Add all disposables to context subscriptions
  context.subscriptions.push(...disposables);

  console.log(`Successfully registered ${commands.length} VSX commands`);
}

function openChatPanel(context) {
  console.log("openChatPanel called");
  
  try {
    if (chatPanel) {
      console.log("Chat panel already exists, revealing it");
      chatPanel.reveal(vscode.ViewColumn.Two);
      return;
    }

    console.log("Creating new chat panel");
    chatPanel = vscode.window.createWebviewPanel(
      "vsxChatPanel",
      "VSX AI Assistant",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    console.log("Setting webview HTML");
    chatPanel.webview.html = getChatPanelHTML();

    console.log("Setting up webview message handler");
    chatPanel.webview.onDidReceiveMessage(
      async (message) => {
        console.log("Received webview message:", message.command);
        switch (message.command) {
          case "sendMessage":
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
            try {
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (workspaceFolder) {
                const files = getWorkspaceFiles(workspaceFolder);
                chatPanel.webview.postMessage({ command: "updateFileList", files });
              } else {
                chatPanel.webview.postMessage({ command: "updateFileList", files: [] });
              }
            } catch (err) {
              console.error("Error getting workspace files:", err);
              chatPanel.webview.postMessage({ command: "updateFileList", files: [] });
            }
            break;
          case "executeCommand":
            if (message.targetCommand) {
              vscode.commands.executeCommand(message.targetCommand);
            }
            break;
          case "stopExecution": // NEW: user pressed Stop in the webview
            console.log("Stop requested by user");
            cancelRequested = true;
            // Notify webview immediately so UI can update
            if (chatPanel) {
              chatPanel.webview.postMessage({ command: "addMessage", message: { role: "assistant", content: "Execution stopping...", timestamp: new Date().toLocaleTimeString(), metadata: { stoppedByUser: true } } });
              chatPanel.webview.postMessage({ command: "hideTyping" });
            }
            break;
          default:
            console.log("Unknown webview command:", message.command);
        }
      },
      undefined,
      context.subscriptions
    );

    console.log("Setting up chat panel dispose handler");
    chatPanel.onDidDispose(
      () => {
        console.log("Chat panel disposed");
        chatPanel = null;
      },
      null,
      context.subscriptions
    );

    console.log("Chat panel created successfully");
  } catch (error) {
    console.error("Error creating chat panel:", error);
    vscode.window.showErrorMessage(`Failed to open chat panel: ${error.message}`);
  }
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
async function executeTerminalCommands(commands, options = {}) {
  const results = [];
  if (!Array.isArray(commands) || commands.length === 0) return results;

  const forceRun = options.forceRun === true;

  // Early-cancel check
  if (cancelRequested) {
    // mark all as cancelled
    for (const cmd of commands) {
      results.push({ command: cmd, status: "cancelled", message: "Cancelled by user" });
    }
    return results;
  }

  // Determine stored permission (default false)
  const stored = extensionContext ? extensionContext.globalState.get("vsx.allowTerminalExecution", false) : false;

  // If forced from a plan/automation, choose sensible default and DO NOT prompt the user
  if (forceRun) {
    // If user previously allowed automatic terminal execution, show in terminal; otherwise run in background.
    const executeMode = stored ? "terminal" : "background";
    const workspaceFolderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

    // Try to reuse or create an integrated terminal only when needed for display
    let terminalForDisplay = null;
    if (executeMode === "terminal") {
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
        const res = await execCommandCapture(cmd, workspaceFolderPath);

        if (terminalForDisplay) {
          try { terminalForDisplay.sendText(cmd, true); } catch (tErr) { /* ignore */ }
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

  // --- original interactive flow (unchanged) ---
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
    if (cancelRequested) {
      results.push({ command: cmd, status: "cancelled", message: "Cancelled by user" });
      // If we detect cancellation, stop processing further commands immediately
      break;
    }
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
      const execResults = await executeTerminalCommands(terminalCommands, { forceRun: true });
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

  // Reset cancel flag at start of plan execution (unless already set)
  cancelRequested = false;

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
    if (cancelRequested) {
      // Post cancellation notice and stop
      if (chatPanel) {
        chatPanel.webview.postMessage({
          command: "addMessage",
          message: { role: "assistant", content: `Plan execution cancelled by user at step ${si + 1}.`, timestamp: new Date().toLocaleTimeString(), metadata: { planCancelled: true } }
        });
        chatPanel.webview.postMessage({ command: "hideTyping" });
      }
      break;
    }

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
          const fixResults = await executeTerminalCommands(fixCmds, { forceRun: true });
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

  // When finishing (either normal or cancelled), ensure cancelRequested is reset to false so future runs can start fresh
  const result = { cancelled: cancelRequested, stepOutputs };
  cancelRequested = false;
  return result;
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
    // Reset cancel flag at the start of handling a new user message
    cancelRequested = false;

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

    // Initial LLM call
    let response = await processUserMessage({
      userMessage,
      workspaceContext: {},
      aiEngine: geminiClient,
      mode: selectedMode,
      chatHistory,
      contextFiles
    });

    // If user requested cancellation while awaiting LLM, bail out early
    if (cancelRequested) {
      chatPanel.webview.postMessage({ command: "hideTyping" });
      chatPanel.webview.postMessage({ command: "addMessage", message: { role: "assistant", content: "Request cancelled by user.", timestamp: new Date().toLocaleTimeString(), metadata: { cancelled: true } } });
      cancelRequested = false;
      return;
    }

    // Process the response using the new JSON format
    let processedResponse = await responseProcessor.processLLMResponse(response, {
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      contextFiles,
      selectedMode
    });

    // Execute actions based on response type
    await executeResponseActions(processedResponse);

    // Handle recursive mode: if tools were called and recursive_mode is true, feed results back
    if (processedResponse.type === 'tool_calls' && processedResponse.metadata?.recursive_mode) {
      // Collect tool results from executed actions
      const toolResults = processedResponse.actions
        .filter(action => action.type === 'tool_call' && action.result)
        .map(action => ({
          id: action.id,
          tool: action.tool,
          result: action.result
        }));

      if (toolResults.length > 0) {
        // Re-call LLM with tool results appended
        const toolResultsText = toolResults.map(tr => 
          `Tool Call ${tr.id} (${tr.tool}):\n${JSON.stringify(tr.result, null, 2)}\n`
        ).join('\n');

        const recursivePrompt = `${userMessage}\n\nTool Results:\n${toolResultsText}\n\nPlease provide your final response based on these results.`;

        response = await processUserMessage({
          userMessage: recursivePrompt,
          workspaceContext: {},
          aiEngine: geminiClient,
          mode: selectedMode,
          chatHistory,
          contextFiles
        });

        processedResponse = await responseProcessor.processLLMResponse(response, {
          workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          contextFiles,
          selectedMode
        });

        // Execute any additional actions from the final response
        await executeResponseActions(processedResponse);
      }
    }

    // Send formatted response to chat panel
    await sendFormattedResponseToChat(processedResponse);

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

async function executeResponseActions(processedResponse) {
  const { actions, type } = processedResponse;
  
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'file_operation':
          await executeFileOperation(action);
          break;
          
        case 'terminal_command':
          await executeTerminalCommand(action);
          break;
          
        case 'plan_execution':
          await executePlanFromJSON(action);
          break;

        case 'tool_call':
          await executeToolCall(action);
          break;
      }
    } catch (error) {
      console.error(`Error executing action ${action.type}:`, error);
      action.status = 'failed';
      action.error = error.message;
    }
  }
}

// New: Execute tool calls
async function executeToolCall(action) {
  const { tool, parameters, id } = action;
  
  try {
    let result;
    switch (tool) {
      case 'search_files':
        result = await executeSearchFiles(parameters);
        break;
      case 'read_file':
        result = await executeReadFile(parameters);
        break;
      case 'edit_file':
        result = await executeEditFile(parameters);
        break;
      case 'get_directory_tree':
        result = await executeGetDirectoryTree(parameters);
        break;
      case 'file_operations':
        result = await executeFileOperations(parameters);
        break;
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
    
    action.status = 'completed';
    action.result = result;
    
    // If result involves a file, open it
    if (result && result.file_path) {
      await openFileInView(result.file_path);
    }
    
  } catch (error) {
    action.status = 'failed';
    action.error = error.message;
  }
}

// Tool implementations
async function executeSearchFiles({ query, include_content = false, file_extensions = [] }) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) throw new Error('No workspace folder');
  
  const results = [];
  const walk = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filepath = path.join(dir, file);
      const stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        walk(filepath);
      } else {
        if (file_extensions.length === 0 || file_extensions.some(ext => filepath.endsWith(ext))) {
          const content = include_content ? fs.readFileSync(filepath, 'utf8') : null;
          if (!query || (content && content.includes(query)) || filepath.includes(query)) {
            results.push({ file_path: path.relative(workspaceFolder, filepath), content });
          }
        }
      }
    }
  };
  walk(workspaceFolder);
  return results;
}

async function executeReadFile({ file_path, start_line, end_line }) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) throw new Error('No workspace folder');
  
  const fullPath = path.resolve(workspaceFolder, file_path);
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  let resultContent = content;
  if (start_line !== undefined || end_line !== undefined) {
    const start = start_line ? start_line - 1 : 0;
    const end = end_line ? end_line : lines.length;
    resultContent = lines.slice(start, end).join('\n');
  }
  
  return { file_path, content: resultContent };
}

async function executeEditFile({ file_path, edits }) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) throw new Error('No workspace folder');
  
  const fullPath = path.resolve(workspaceFolder, file_path);
  let content = fs.readFileSync(fullPath, 'utf8');
  
  for (const edit of edits) {
    if (edit.start_line) {
      const lines = content.split('\n');
      const lineIndex = edit.start_line - 1;
      if (lineIndex >= 0 && lineIndex < lines.length) {
        lines[lineIndex] = lines[lineIndex].replace(edit.old_string, edit.new_string);
        content = lines.join('\n');
      }
    } else {
      content = content.replace(edit.old_string, edit.new_string);
    }
  }
  
  fs.writeFileSync(fullPath, content);
  return { file_path, edits_applied: edits.length };
}

async function executeGetDirectoryTree({ path: dirPath, depth = 2 }) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) throw new Error('No workspace folder');
  
  const fullPath = path.resolve(workspaceFolder, dirPath);
  const buildTree = (dir, currentDepth = 0) => {
    if (currentDepth > depth) return null;
    const items = fs.readdirSync(dir);
    const tree = {};
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        tree[item] = buildTree(itemPath, currentDepth + 1);
      } else {
        tree[item] = 'file';
      }
    }
    return tree;
  };
  
  return { path: dirPath, tree: buildTree(fullPath) };
}

async function executeFileOperations({ operation, source_path, target_path }) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) throw new Error('No workspace folder');
  
  const sourceFull = path.resolve(workspaceFolder, source_path);
  const targetFull = target_path ? path.resolve(workspaceFolder, target_path) : null;
  
  switch (operation) {
    case 'move':
      fs.renameSync(sourceFull, targetFull);
      break;
    case 'copy':
      fs.copyFileSync(sourceFull, targetFull);
      break;
    case 'rename':
      fs.renameSync(sourceFull, targetFull);
      break;
    case 'delete':
      fs.unlinkSync(sourceFull);
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  
  return { operation, source_path, target_path };
}

async function openFileInView(filePath) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) return;
  
  const fullPath = path.resolve(workspaceFolder, filePath);
  const uri = vscode.Uri.file(fullPath);
  await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(uri);
}

// Add these helpers so the webview's clear/new chat buttons and response rendering work.

function handleClearChat() {
  try {
    if (!chatPanel) return;
    // Inform webview to clear UI
    chatPanel.webview.postMessage({ command: "clearMessages" });
    // Reset server-side history
    chatHistory = [];
    console.log("Chat cleared via handleClearChat");
  } catch (e) {
    console.error("handleClearChat error:", e);
  }
}

function handleNewChat() {
  try {
    chatId = "chat_" + Date.now();
    chatHistory = [];
    if (chatPanel) {
      chatPanel.webview.postMessage({ command: "clearMessages" });
    }
    console.log("Started new chat:", chatId);
  } catch (e) {
    console.error("handleNewChat error:", e);
  }
}

// Render processedResponse into chat panel (defensive)
async function sendFormattedResponseToChat(processedResponse) {
  if (!chatPanel || !processedResponse) return;

  const actions = Array.isArray(processedResponse.actions) ? processedResponse.actions : [];
  const type = processedResponse.type || (processedResponse.content && processedResponse.content.plan ? 'plan_execution' : 'simple_response');
  const content = processedResponse.content || {};
  const metadata = processedResponse.metadata || {};

  let displayContent = '';

  try {
    switch (type) {
      case 'simple_response':
        displayContent = content.text || String(content || '');
        break;

      case 'file_operations':
        displayContent = content.text || 'File operations suggested/processed.';
        if (actions.length) {
          displayContent += '\n\n📝 File Operations:\n';
          for (const a of actions.filter(x => x.type === 'file_operation')) {
            const status = a.status || 'pending';
            const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : status === 'skipped' ? '🚫' : '⏳';
            displayContent += `${emoji} ${a.operation || 'update'}: \`${a.file_path || a.filePath || 'unknown'}\`\n`;
          }
        }
        break;

      case 'terminal_commands':
        displayContent = content.text || 'Terminal commands suggested/processed.';
        if (actions.length) {
          displayContent += '\n\n💻 Commands:\n';
          const truncate = (s, n = 300) => {
        if (!s) return '';
        const clean = String(s).trim();
        return clean.length > n ? clean.substring(0, n) + '...[truncated]' : clean;
          };
          for (const a of actions.filter(x => x.type === 'terminal_command')) {
        const status = a.status || 'pending';
        const emoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : status === 'cancelled' ? '🚫' : '⏳';
        const res = a.result || {};
        const stdout = res.stdout ? String(res.stdout) : '';
        const stderr = res.stderr ? String(res.stderr) : '';
        const stdoutLines = stdout ? stdout.split(/\r?\n/).length : 0;
        const stderrLines = stderr ? stderr.split(/\r?\n/).length : 0;
        displayContent += `${emoji} \`${a.command}\` -> ${status}${typeof res.code !== 'undefined' ? ` (exit ${res.code})` : ''}\n`;
        if (stdout) {
          displayContent += `  • Stdout: ${truncate(stdout, 400)}${stdoutLines > 1 ? ` (showing 1/${stdoutLines} lines)` : ''}\n`;
        }
        if (stderr) {
          displayContent += `  • Stderr: ${truncate(stderr, 400)}${stderrLines > 1 ? ` (showing 1/${stderrLines} lines)` : ''}\n`;
        }
        // include short note if there was an execution error object
        if (res.error) {
          displayContent += `  • Error: ${truncate(res.error, 300)}\n`;
        }
        displayContent += '\n';
          }
          displayContent += 'Full command outputs are not shown here — expand in logs or open the VSX Assistant terminal for details.';
        }
        break;

      case 'plan_execution':
        displayContent = content.text || `Plan "${content.plan?.title || 'unnamed'}" executed/queued.`;
        if (actions.length) {
          const planAction = actions.find(a => a.type === 'plan_execution');
          if (planAction && Array.isArray(planAction.plan?.steps)) {
            displayContent += `\n\n📋 Steps (${planAction.plan.steps.length}):\n`;
            for (const s of planAction.plan.steps) {
              displayContent += `- [${s.id}] ${s.title}: ${s.objective || ''}\n`;
            }
          }
        }
        break;

      case 'mixed_response':
        displayContent = content.text || 'Mixed response with multiple components.';
        if (actions.length) {
          displayContent += '\n\n🔧 Actions:\n';
          for (const a of actions) {
            if (a.type === 'file_operation') displayContent += `- File: ${a.operation} ${a.file_path}\n`;
            if (a.type === 'terminal_command') displayContent += `- Cmd: ${a.command}\n`;
            if (a.type === 'plan_execution') displayContent += `- Plan: ${a.plan?.title || 'plan'} (${a.status || 'pending'})\n`;
          }
        }
        break;

      case 'error_response':
        displayContent = `❌ Error: ${content.error?.message || 'Unknown error'}`;
        if (content.error?.suggestions && content.error.suggestions.length) {
          displayContent += '\n\nSuggestions:\n' + content.error.suggestions.map(s => `• ${s}`).join('\n');
        }
        break;

      default:
        displayContent = content.text || JSON.stringify(content || processedResponse, null, 2);
        break;
    }
  } catch (e) {
    displayContent = 'Error formatting response for display.';
    console.error('sendFormattedResponseToChat formatting error:', e);
  }

  const responseMetadata = {
    ...metadata,
    responseType: type,
    actionsCount: actions.length
  };

  chatPanel.webview.postMessage({
    command: "addMessage",
    message: {
      role: "assistant",
      content: displayContent,
      timestamp: new Date().toLocaleTimeString(),
      metadata: responseMetadata
    }
  });
}

function deactivate() {
  console.log("VSX Extension deactivating...");
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
        this._item("Set API Keys", "vsx.manageApiKeys"),
        this._item("Configure Settings", "vsx.allowTerminalExecution"),
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
      command === "vsx.openChatPanel" ? "comment-discussion" : "gear"
    );
    return item;
  }
}
