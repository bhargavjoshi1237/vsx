const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
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

async function activate(context) {
  console.log("VSX Extension activating...");

  try {
    await initializeLLM();
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

async function initializeLLM() {
  geminiClient = new GeminiClient();
  geminiClient.initialize();
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

  context.subscriptions.push(
    helloWorldDisposable,
    openChatPanelDisposable
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

    // --- File edit handling (Copilot style) ---
    const llmContent = await decodeLLMResponse({ response });
    const codeBlockRegex = /```[\w]*\n\/\/ filepath: ([^\n]+)\n([\s\S]*?)```/g;
    let match, fileEditResults = [];
    while ((match = codeBlockRegex.exec(llmContent)) !== null) {
      const filePath = match[1].trim();
      const newContent = match[2];

      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        // Resolve target FS path and create VSCode URI correctly for absolute or relative paths
        let targetFsPath;
        if (workspaceFolder) {
          if (path.isAbsolute(filePath)) {
            targetFsPath = path.normalize(filePath);
          } else {
            targetFsPath = path.normalize(path.join(workspaceFolder.uri.fsPath, filePath));
          }
        } else {
          // No workspace folder: treat as absolute or relative to process.cwd
          targetFsPath = path.isAbsolute(filePath)
            ? path.normalize(filePath)
            : path.normalize(path.join(process.cwd(), filePath));
        }

        const fileUri = vscode.Uri.file(targetFsPath);

        // Ensure directory exists when creating new files
        const fileExists = fs.existsSync(targetFsPath);

        if (fileExists) {
          // Update existing file
          const document = await vscode.workspace.openTextDocument(fileUri);
          const workspaceEdit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );

          // Handle placeholder tokens for preserving existing code
          let finalContent = newContent;
          if (finalContent && typeof finalContent === "string" && /\.{3}existing code\.{3}/.test(finalContent)) {
            const originalText = document.getText();
            finalContent = finalContent.replace(/\/\*\s*\.{3}existing code\.{3}\s*\*\//g, originalText);
            finalContent = finalContent.replace(/\/\/\s*\.{3}existing code\.{3}/g, originalText);
            finalContent = finalContent.replace(/\.{3}existing code\.{3}/g, originalText);
          }

          workspaceEdit.replace(fileUri, fullRange, finalContent);
          const success = await vscode.workspace.applyEdit(workspaceEdit);
          if (success) await document.save();

          fileEditResults.push({
            filePath: targetFsPath,
            success,
            message: success ? "File updated successfully" : "Failed to update file"
          });
        } else {
          // Create new file and write content using vscode FS so VS Code picks it up
          const dir = path.dirname(targetFsPath);
          fs.mkdirSync(dir, { recursive: true });

          // Remove placeholder tokens for new files
          let finalContent = newContent
            .replace(/\/\*\s*\.{3}existing code\.{3}\s*\*\//g, "")
            .replace(/\/\/\s*\.{3}existing code\.{3}/g, "")
            .replace(/\.{3}existing code\.{3}/g, "")
            .replace(/^\s+/, "")
            .replace(/\s+$/, "");

          const uint8array = Buffer.from(finalContent, "utf8");
          await vscode.workspace.fs.writeFile(fileUri, uint8array);

          // Optionally open and save (ensures file is registered in editors)
          const document = await vscode.workspace.openTextDocument(fileUri);
          await document.save();

          fileEditResults.push({
            filePath: targetFsPath,
            success: true,
            message: "File created successfully"
          });
        }
      } catch (err) {
        fileEditResults.push({
          filePath,
          success: false,
          message: err.message
        });
      }
    }

    // Prepare Copilot-style summary for chat
    let summary = llmContent;
    if (fileEditResults.length > 0) {
      summary = "";
      for (const result of fileEditResults) {
        summary += `📝 **File Edits Applied to \`${result.filePath}\`:**\n\n`;
        summary += result.success
          ? `✅ Successfully updated \`${result.filePath}\`\n`
          : `❌ Failed to update \`${result.filePath}\`: ${result.message}\n`;
      }
    }

    // --- FIX: usage extraction ---
    const usage = response.usageMetadata || {};

    chatPanel.webview.postMessage({
      command: "addMessage",
      message: {
        role: "assistant",
        content: summary,
        timestamp: new Date().toLocaleTimeString(),
        isFileEdit: fileEditResults.length > 0,
        fileEdits: fileEditResults,
        metadata: {
          model: geminiClient.model,
          mode: selectedMode,
          sentTokens: usage.promptTokenCount || 0,
          receivedTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
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
