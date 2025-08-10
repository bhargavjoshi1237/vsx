const vscode = require("vscode");

// Import core components
const { AIEngine } = require("./core/engine");
const { TaskPlanner } = require("./core/planner");
const { ExecutionEngine } = require("./core/executor");
const { ContextManager } = require("./core/context-manager");
const { GeminiClient } = require("./llm/gemini-client");
const { PromptManager } = require("./llm/prompt-manager");
const { TokenOptimizer } = require("./llm/token-optimizer");
const { ToolManager } = require("./tools/tool-manager");
const { getChatPanelHTML } = require("./ui/chat-panel");

let chatPanel = null;
let aiEngine = null;

async function activate(context) {
  console.log("VSX Extension activating...");

  try {
    // Initialize all components
    await initializeAIEngine();

    vscode.window.showInformationMessage("VSX AI Assistant is ready!");

    // Register commands
    registerCommands(context);

    // Setup tree view
    const treeDataProvider = new VscodeApiTreeDataProvider();
    vscode.window.registerTreeDataProvider("vsxView", treeDataProvider);

    // Auto-open chat panel
    vscode.commands.executeCommand("vsx.openChatPanel");

    console.log("VSX Extension activated successfully");
  } catch (error) {
    console.error("Failed to activate VSX Extension:", error);
    vscode.window.showErrorMessage(
      `VSX Extension failed to activate: ${error.message}`
    );
  }
}

async function initializeAIEngine() {
  // Initialize components
  const geminiClient = new GeminiClient();
  const promptManager = new PromptManager();
  const tokenOptimizer = new TokenOptimizer();
  const toolManager = new ToolManager();
  const contextManager = new ContextManager();
  const planner = new TaskPlanner();
  const executor = new ExecutionEngine();

  // Initialize each component
  geminiClient.initialize();
  promptManager.initialize();
  tokenOptimizer.initialize();
  toolManager.initialize();
  contextManager.initialize({ storage: null }); // No persistent storage for now
  planner.initialize({ llmClient: geminiClient, toolManager });
  executor.initialize({ toolManager, contextManager, planner });

  // Create and initialize AI engine
  aiEngine = new AIEngine();
  await aiEngine.initialize({
    llmClient: geminiClient,
    promptManager,
    tokenOptimizer,
    toolManager,
    contextManager,
    planner,
    executor,
  });
}

function registerCommands(context) {
  // Hello World command
  const helloWorldDisposable = vscode.commands.registerCommand(
    "vsx.helloWorld",
    () => {
      vscode.window.showInformationMessage("Hello World from VSX!");
    }
  );

  // Open chat panel command
  const openChatPanelDisposable = vscode.commands.registerCommand(
    "vsx.openChatPanel",
    () => {
      openChatPanel(context);
    }
  );

  // Test AI connection command
  const testConnectionDisposable = vscode.commands.registerCommand(
    "vsx.testConnection",
    async () => {
      try {
        const result = await aiEngine.llmClient.testConnection();
        if (result.success) {
          vscode.window.showInformationMessage(
            `AI connection successful! Model: ${result.model}${
              result.isMock ? " (Mock)" : ""
            }`
          );
        } else {
          vscode.window.showErrorMessage(
            `AI connection failed: ${result.error}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Connection test failed: ${error.message}`
        );
      }
    }
  );

  context.subscriptions.push(
    helloWorldDisposable,
    openChatPanelDisposable,
    testConnectionDisposable
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

  // Handle messages from the webview
  chatPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case "sendMessage":
          await handleChatMessage(message.message, message.model || 'gemini-2.0-flash-exp', message.contextFiles);
          break;
        case "clearChat":
          await handleClearChat();
          break;
        case "changeModel":
          await handleModelChange(message.model);
          break;
        case "getWorkspaceFiles":
          await handleGetWorkspaceFiles();
          break;

      }
    },
    undefined,
    context.subscriptions
  );

  // Reset panel when disposed
  chatPanel.onDidDispose(
    () => {
      chatPanel = null;
    },
    null,
    context.subscriptions
  );
}

async function handleChatMessage(userMessage, selectedModel, contextFiles = []) {
  if (!chatPanel || !aiEngine) return;

  const startTime = Date.now();

  try {
    // Send user message to webview immediately
    chatPanel.webview.postMessage({
      command: "addMessage",
      message: {
        role: "user",
        content: userMessage,
        timestamp: new Date().toLocaleTimeString(),
      },
    });

    // Show typing indicator
    chatPanel.webview.postMessage({
      command: "showTyping",
    });

    // Get workspace context
    const workspaceContext = await getWorkspaceContext();

    // Add context files content if provided
    if (contextFiles && contextFiles.length > 0) {
      workspaceContext.contextFiles = await getContextFilesContent(contextFiles);
      console.log(`Added ${workspaceContext.contextFiles.length} context files to request`);
    }

    // Update AI engine model if provided
    if (selectedModel && aiEngine.llmClient) {
      aiEngine.llmClient.model = selectedModel;
      console.log(`Using model: ${selectedModel}`);
    }

    // Process the request through AI engine
    const response = await aiEngine.processRequest(
      userMessage,
      workspaceContext
    );

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Hide typing indicator
    chatPanel.webview.postMessage({
      command: "hideTyping",
    });

    // Send AI response to webview with enhanced metadata
    chatPanel.webview.postMessage({
      command: "addMessage",
      message: {
        role: "assistant",
        content: response.content || response.message || JSON.stringify(response),
        timestamp: new Date().toLocaleTimeString(),
        isFileEdit: response.isFileEdit || false,
        fileEdits: response.fileEdits || null,
        mode: response.mode || 'legacy',
        metadata: {
          tokensUsed: response.usageMetadata?.totalTokenCount || 0,
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          responseTokens: response.usageMetadata?.candidatesTokenCount || 0,
          model: aiEngine.llmClient.model,
          processingTime: processingTime,
          contextFilesCount: contextFiles ? contextFiles.length : 0,
          isMockResponse: response.isMockResponse || false,
          mode: response.mode || 'legacy'
        },
      },
    });

    // Refresh context files if the LLM made file changes
    if (contextFiles && contextFiles.length > 0 && (response.isFileEdit || response.fileEdits)) {
      console.log('LLM made file changes, refreshing context...');
      await refreshContextFiles(contextFiles);
    }
  } catch (error) {
    console.error("Error handling chat message:", error);

    // Hide typing indicator
    chatPanel.webview.postMessage({
      command: "hideTyping",
    });

    // Send error message to webview
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

async function handleClearChat() {
  if (!chatPanel) return;

  chatPanel.webview.postMessage({
    command: "clearMessages",
  });
}

async function handleModelChange(newModel) {
  if (!aiEngine) return;

  try {
    // Update the Gemini client with the new model
    aiEngine.llmClient.model = newModel;
    console.log(`Model changed to: ${newModel}`);

    // Optionally test the new model
    const testResult = await aiEngine.llmClient.testConnection();
    if (testResult.success) {
      console.log(`Model ${newModel} is working correctly`);
    } else {
      console.warn(`Model ${newModel} test failed:`, testResult.error);
    }
  } catch (error) {
    console.error("Error changing model:", error);
  }
}

async function getWorkspaceContext() {
  const context = {
    activeFiles: [],
    projectPath: null,
    userPreferences: {},
  };

  // Get workspace folder
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    context.projectPath = workspaceFolders[0].uri.fsPath;
  }

  // Get active editor info
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) {
    const document = activeEditor.document;
    context.activeFiles.push({
      path: vscode.workspace.asRelativePath(document.uri),
      language: document.languageId,
      size: document.getText().length,
      isDirty: document.isDirty,
    });
  }

  return context;
}

async function getContextFilesContent(contextFiles) {
  const filesContent = [];
  
  for (const filePath of contextFiles) {
    try {
      console.log(`Reading context file: ${filePath}`);
      const result = await aiEngine.toolManager.executeTool('readFile', { filePath });
      
      if (result.success && result.result) {
        // Preserve exact file content including blank lines
        const originalContent = result.result.content || '';
        
        // Normalize line endings but preserve all blank lines
        const normalizedContent = originalContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Count lines properly including blank lines
        const lines = normalizedContent.split('\n');
        
        const fileContent = {
          path: filePath,
          content: originalContent,
          size: result.result.size || originalContent.length,
          // Ensure blank lines are preserved with normalized line endings
          formattedContent: normalizedContent,
          lineCount: lines.length,
          lastModified: Date.now(),
          // Store individual lines for better processing
          lines: lines
        };
        filesContent.push(fileContent);
        console.log(`Successfully read ${filePath}: ${fileContent.size} bytes, ${fileContent.lineCount} lines`);
      } else {
        console.warn(`Failed to read context file ${filePath}:`, result.error || 'Unknown error');
      }
    } catch (error) {
      console.error(`Exception reading context file ${filePath}:`, error);
    }
  }
  
  console.log(`Total context files loaded: ${filesContent.length}`);
  return filesContent;
}

async function refreshContextFiles(contextFiles) {
  // Refresh context files after LLM makes changes
  if (contextFiles && contextFiles.length > 0) {
    console.log('Refreshing context files after LLM response...');
    const refreshedContent = await getContextFilesContent(contextFiles);
    
    // Send updated context to webview
    if (chatPanel) {
      chatPanel.webview.postMessage({
        command: 'contextFilesUpdated',
        files: refreshedContent
      });
    }
    
    return refreshedContent;
  }
  return [];
}

async function handleGetWorkspaceFiles() {
  if (!chatPanel) return;
  
  try {
    const result = await aiEngine.toolManager.executeTool('listFiles', { 
      recursive: true,
      pattern: '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,css,html,json,md,txt,yml,yaml}'
    });
    
    if (result.success) {
      const files = result.result.files
        .filter(file => file.type === 'file')
        .map(file => file.path)
        .slice(0, 50); // Limit to 50 files for performance
      
      chatPanel.webview.postMessage({
        command: 'updateFileList',
        files: files
      });
    }
  } catch (error) {
    console.error('Failed to get workspace files:', error);
  }
}

function deactivate() {
  if (aiEngine) {
    aiEngine.cleanup();
  }
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
        this._item("Test AI Connection", "vsx.testConnection"),
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
      command === "vsx.openChatPanel"
        ? "comment-discussion"
        : "debug-disconnect"
    );
    return item;
  }
}
