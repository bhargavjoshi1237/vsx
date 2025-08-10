# VSX AI Assistant

VSX is an intelligent AI assistant extension for Visual Studio Code that provides contextual help, code analysis, and file editing capabilities. Built with GitHub Copilot-style interaction patterns, VSX offers two distinct modes for different use cases.

## Features

### 🤖 Ask Mode
- **Contextual Q&A**: Get answers to coding questions without file modifications
- **Code Examples**: Receive code snippets with `...existing code...` placeholders
- **Best Practices**: Learn about coding patterns and recommendations
- **No File Changes**: Safe exploration of ideas without affecting your codebase

### ✏️ Edit Mode  
- **Direct File Editing**: Modify files directly through natural language instructions
- **Multi-file Support**: Work with multiple files simultaneously
- **Atomic Operations**: All changes are applied atomically using VS Code's WorkspaceEdit API
- **Change Validation**: Verify edits before application with detailed summaries

### 🔧 Advanced Capabilities
- **Blank Line Preservation**: Maintains exact formatting including empty lines
- **Context-Aware**: Understands your project structure and active files
- **Multiple AI Models**: Support for various Gemini models
- **Real-time Feedback**: Live typing indicators and processing status
- **Error Handling**: Graceful error recovery with detailed messages

## How It Works

### Mode Detection
VSX automatically determines the interaction mode based on context:

- **Ask Mode**: Triggered when no files are attached to your message
- **Edit Mode**: Triggered when you attach files using the context panel

### Ask Mode Example
```
User: "What's the version in this package.json?"
[With package.json attached as context]

Response: The version in your package.json is "1.0.0". This is specified on line 3 of the file.
```

### Edit Mode Example  
```
User: "Change the name to 'Demo'"
[With package.json attached as context]

Response: [Applies changes directly to file]
✅ Successfully updated 1 file(s):
- package.json
```

## Requirements

- Visual Studio Code 1.60.0 or higher
- Node.js 16.0.0 or higher
- Internet connection for AI model access

## Extension Settings

This extension contributes the following settings:

* `vsx.enable`: Enable/disable the VSX AI Assistant
* `vsx.model`: Default AI model to use (gemini-2.0-flash-exp, gemini-2.5-flash, etc.)
* `vsx.autoSave`: Automatically save files after edits are applied

## Usage

### Getting Started
1. Install the VSX extension
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run "VSX: Open Chat Panel"
4. Start chatting with the AI assistant!

### Using Ask Mode
1. Type your question in the chat input
2. Press Enter or click Send
3. Get answers without file modifications

### Using Edit Mode
1. Click "📁 Context" to open the file panel
2. Select files you want to modify
3. Type your edit request
4. VSX will apply changes directly to your files

### Context Management
- **Add Files**: Use the context panel to select files
- **Remove Files**: Click the × on context chips
- **Auto-refresh**: Context updates automatically after edits

## Known Issues

- Large files (>1MB) may cause performance issues
- Some complex refactoring operations may require multiple steps
- File watching may not detect external changes immediately

## Release Notes

### 1.0.0
- Initial release with Ask and Edit modes
- GitHub Copilot-style prompt formatting
- Multi-file context support
- Blank line preservation
- Real-time typing indicators

### 1.0.1
- Improved error handling
- Better file validation
- Enhanced mode detection

### 1.1.0
- Added mode indicators in chat
- Improved edit summaries
- Better context file management

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
