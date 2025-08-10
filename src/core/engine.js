/**
 * Core AI Engine and Orchestration
 * Manages the overall flow of AI operations and coordinates between components
 */

const vscode = require('vscode');
const { FileEditor } = require('./file-editor');

class AIEngine {
  constructor() {
    this.isInitialized = false;
    this.currentSession = null;
    this.activeTools = new Map();
    this.fileEditor = new FileEditor();
  }

  /**
   * Initialize the AI engine with required dependencies
   */
  async initialize(dependencies) {
    this.llmClient = dependencies.llmClient;
    this.toolManager = dependencies.toolManager;
    this.contextManager = dependencies.contextManager;
    this.planner = dependencies.planner;
    this.executor = dependencies.executor;

    this.isInitialized = true;
    console.log("AI Engine initialized successfully");
  }

  /**
   * Process a user request and orchestrate the response
   */
  async processRequest(request, context = {}) {
    if (!this.isInitialized) {
      throw new Error("AI Engine not initialized");
    }

    try {
      // Create or update session context
      this.currentSession = await this.contextManager.createSession(context);

      // Determine interaction mode based on context files
      const mode = this.determineInteractionMode(context);
      console.log(`Processing request in ${mode} mode`);

      // Generate response based on mode
      let response;
      if (mode === 'ask') {
        response = await this.handleAskMode(request, context);
      } else if (mode === 'edit') {
        response = await this.handleEditMode(request, context);
      } else {
        // Fallback to legacy behavior
        response = await this.handleLegacyMode(request, context);
      }

      // Store interaction in context
      await this.contextManager.storeInteraction(this.currentSession.id, {
        request,
        response,
        timestamp: Date.now(),
      });

      return response;
    } catch (error) {
      console.error("Error processing request:", error);
      throw error;
    }
  }

  /**
   * Determine interaction mode based on context
   */
  determineInteractionMode(context) {
    // Edit mode: has context files attached
    if (context.contextFiles && context.contextFiles.length > 0) {
      return 'edit';
    }
    
    // Ask mode: no context files, just answering questions
    return 'ask';
  }

  /**
   * Handle Ask Mode - Answer questions in chat without file interaction
   */
  async handleAskMode(request, context) {
    console.log('Processing in ASK mode');
    
    // Build ask mode prompt with reminder about avoiding file repetition
    let prompt = `<reminder>
Avoid repeating existing code, instead use a line comment with \`...existing code...\` to represent regions of unchanged code. The code block for each file being edited must start with a comment containing the filepath. This includes Markdown code blocks. For existing files, make sure the filepath exactly matches the filepath of the original file. When suggesting to create new files, pick a location inside the workspace.
</reminder>

<prompt>
${request}
</prompt>`;

    // Add context files if available (for reference only in ask mode)
    if (context.contextFiles && context.contextFiles.length > 0) {
      prompt = `<attachments>
${context.contextFiles.map((file, index) => 
  `<attachment id="file:${file.path}">
User's current visible code: Excerpt from ${file.path}, lines 1 to ${file.lineCount || 'unknown'}:
\`\`\`${this.getFileExtension(file.path)}
// filepath: ${file.path}
${file.formattedContent || file.content || ''}
\`\`\`
</attachment>`
).join('\n')}
</attachments>

${prompt}`;
    }

    // Generate response for ask mode
    const response = await this.llmClient.generateResponse(prompt, {
      maxTokens: 2000,
      temperature: 0.1,
    });

    return {
      ...response,
      mode: 'ask',
      isFileEdit: false
    };
  }

  /**
   * Handle Edit Mode - Interactive file editing with GitHub Copilot style prompts
   */
  async handleEditMode(request, context) {
    console.log('Processing in EDIT mode');
    
    // Build edit mode prompt with file editing context
    let prompt = `The user has provided the following files as input. Always make changes to these files unless the user asks to create a new file. Untitled files are files that are not yet named. Make changes to them like regular files.

${context.contextFiles.map(file => 
  `<file>
<status>I applied your suggestions for this file and accepted them. Here is the updated file:</status>
\`\`\`${this.getFileExtension(file.path)}
// filepath: ${file.path}
${file.formattedContent || file.content || ''}
\`\`\`
</file>`
).join('\n')}

<reminder>
Avoid repeating existing code, instead use a line comment with \`...existing code...\` to represent regions of unchanged code. The code block for each file being edited must start with a comment containing the filepath. This includes Markdown code blocks. For existing files, make sure the filepath exactly matches the filepath of the original file. When suggesting to create new files, pick a location inside the workspace.
</reminder>

<prompt>
${request}
</prompt>`;

    // Generate response for edit mode
    const response = await this.llmClient.generateResponse(prompt, {
      maxTokens: 1500,
      temperature: 0.2,
    });

    // Process response for file edits in edit mode
    return await this.processEditModeResponse(response, context);
  }

  /**
   * Handle legacy mode for backward compatibility
   */
  async handleLegacyMode(request, context) {
    console.log('Processing in LEGACY mode');
    
    // Build enhanced prompt with context files and file editing instructions
    const enhancedPrompt = this.buildEnhancedPrompt(request, context);

    // Analyze request and determine approach
    const analysis = await this.analyzeRequest(request);

    // Generate response based on analysis
    let response;
    switch (analysis.type) {
      case "simple_query":
        response = await this.llmClient.generateResponse(enhancedPrompt, {
          maxTokens: 2000,
          temperature: 0.1,
        });
        break;
      case "file_operation":
        response = await this.handleFileOperation(enhancedPrompt, analysis);
        break;
      case "complex_task":
        response = await this.handleComplexTask(enhancedPrompt, analysis);
        break;
      default:
        response = await this.llmClient.generateResponse(enhancedPrompt);
    }

    // Process response for file edits
    return await this.processResponseForFileEdits(response, context);
  }

  /**
   * Get file extension from path for syntax highlighting
   */
  getFileExtension(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const extensionMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'css': 'css',
      'html': 'html',
      'json': 'json',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml'
    };
    return extensionMap[ext] || ext || '';
  }

  /**
   * Process edit mode response for file changes
   */
  async processEditModeResponse(response, context) {
    const responseContent = response.content || response.message || JSON.stringify(response);
    
    // Parse the response for file edits using improved parsing
    const fileEdits = this.parseEditModeResponse(responseContent, context);
    
    if (fileEdits.length === 0) {
      return {
        ...response,
        mode: 'edit',
        isFileEdit: false
      };
    }

    console.log(`Found ${fileEdits.length} file edits in edit mode response`);

    // Apply file edits
    const editResults = [];
    for (const edit of fileEdits) {
      try {
        const result = await this.applyEditModeFileEdit(edit);
        editResults.push(result);
      } catch (error) {
        console.error(`Failed to apply edit to ${edit.filePath}:`, error);
        editResults.push({
          success: false,
          filePath: edit.filePath,
          error: error.message
        });
      }
    }

    // Format response for display
    const displayContent = this.formatEditModeResponse(responseContent, editResults);

    return {
      ...response,
      content: displayContent,
      mode: 'edit',
      isFileEdit: true,
      fileEdits: {
        applied: editResults.some(r => r.success),
        results: editResults
      }
    };
  }

  /**
   * Build enhanced prompt with context files and workspace information (legacy)
   */
  buildEnhancedPrompt(request, context) {
    let prompt = request;

    console.log("Building enhanced prompt with context:", {
      hasContextFiles: !!(
        context.contextFiles && context.contextFiles.length > 0
      ),
      contextFilesCount: context.contextFiles ? context.contextFiles.length : 0,
      hasProjectPath: !!context.projectPath,
      hasActiveFiles: !!(context.activeFiles && context.activeFiles.length > 0),
    });

    // Add file editing instructions
    prompt += `\n\n--- File Editing Instructions ---
When making file edits, use these specific formats:
- Line X: [new content] - Replace line X with new content
- Lines X-Y: [new content] - Replace lines X through Y with new content  
- Insert at line X: [new content] - Insert new content at line X
- Delete line X - Delete line X
- Delete lines X-Y - Delete lines X through Y
- Replace line X with: [new content] - Replace line X with new content
- Add at end: [new content] - Add content at end of file

Do NOT show the entire file content in your response. Only show the specific line changes using the above format.
`;

    // Add context files if available
    if (context.contextFiles && context.contextFiles.length > 0) {
      prompt += "\n\n--- Context Files ---\n";

      for (const file of context.contextFiles) {
        prompt += `\n## File: ${file.path}\n`;
        prompt += `Size: ${file.size} bytes (${file.lineCount || 'unknown'} lines)\n`;
        prompt += "```\n";
        // Use formattedContent to preserve blank lines, fallback to content
        prompt += file.formattedContent || file.content || "";
        prompt += "\n```\n";
      }

      console.log(
        `Added ${context.contextFiles.length} context files to prompt`
      );
    }

    // Add workspace information if available
    if (context.projectPath) {
      prompt += `\n\n--- Workspace Information ---\n`;
      prompt += `Project Path: ${context.projectPath}\n`;
    }

    // Add active files information
    if (context.activeFiles && context.activeFiles.length > 0) {
      prompt += `\n--- Active Files ---\n`;
      for (const file of context.activeFiles) {
        prompt += `- ${file.path} (${file.language})\n`;
      }
    }

    console.log(`Final prompt length: ${prompt.length} characters`);
    return prompt;
  }

  /**
   * Analyze the user request to determine the best approach
   */
  async analyzeRequest(request) {
    const lowerRequest = request.toLowerCase();
    
    // Check for file editing keywords
    const fileEditKeywords = [
      'edit', 'modify', 'change', 'update', 'fix', 'add', 'remove', 'delete',
      'replace', 'insert', 'line', 'function', 'method', 'variable'
    ];
    
    const hasFileEditKeywords = fileEditKeywords.some(keyword => 
      lowerRequest.includes(keyword)
    );
    
    if (hasFileEditKeywords) {
      return {
        type: "file_operation",
        complexity: "medium",
        requiredTools: ["fileEditor"],
        estimatedTokens: 500,
      };
    }
    
    // Default to simple query
    return {
      type: "simple_query",
      complexity: "low",
      requiredTools: [],
      estimatedTokens: 100,
    };
  }

  /**
   * Handle simple queries that don't require tools
   */
  async handleSimpleQuery(request, analysis) {
    return await this.llmClient.generateResponse(request, {
      maxTokens: 500,
      temperature: 0.1,
    });
  }

  /**
   * Handle file operations
   */
  async handleFileOperation(enhancedPrompt, analysis) {
    // Use higher temperature for file operations to get more specific instructions
    return await this.llmClient.generateResponse(enhancedPrompt, {
      maxTokens: 1500,
      temperature: 0.2,
    });
  }

  /**
   * Handle complex tasks that require planning and execution
   */
  async handleComplexTask(request, analysis) {
    // TODO: Implement complex task handling
    return {
      type: "complex_task",
      message: "Complex task handling not implemented yet",
    };
  }

  /**
   * Handle generic requests
   */
  async handleGenericRequest(request, analysis) {
    return await this.llmClient.generateResponse(request);
  }

  /**
   * Parse edit mode response for file changes
   */
  parseEditModeResponse(responseContent, context) {
    const fileEdits = [];
    
    // Look for code blocks with filepath comments
    const codeBlockRegex = /```[\w]*\n\/\/ filepath: ([^\n]+)\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(responseContent)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];
      
      // Find the original file in context
      const originalFile = context.contextFiles?.find(f => f.path === filePath);
      if (originalFile) {
        fileEdits.push({
          filePath,
          newContent: content,
          originalContent: originalFile.formattedContent || originalFile.content || '',
          hasChanges: content !== (originalFile.formattedContent || originalFile.content || '')
        });
      }
    }
    
    return fileEdits;
  }

  /**
   * Apply file edit from edit mode
   */
  async applyEditModeFileEdit(edit) {
    if (!edit.hasChanges) {
      return {
        success: true,
        filePath: edit.filePath,
        message: 'No changes detected'
      };
    }

    try {
      // Get the file URI
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, edit.filePath);
      
      // Open the document
      const document = await vscode.workspace.openTextDocument(fileUri);
      
      // Create workspace edit to replace entire file content
      const workspaceEdit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      
      workspaceEdit.replace(fileUri, fullRange, edit.newContent);
      
      // Apply the edit
      const success = await vscode.workspace.applyEdit(workspaceEdit);
      
      if (success) {
        // Save the document
        await document.save();
        
        return {
          success: true,
          filePath: edit.filePath,
          message: 'File updated successfully'
        };
      } else {
        return {
          success: false,
          filePath: edit.filePath,
          message: 'Failed to apply edit'
        };
      }

    } catch (error) {
      console.error(`Error applying edit to ${edit.filePath}:`, error);
      return {
        success: false,
        filePath: edit.filePath,
        error: error.message
      };
    }
  }

  /**
   * Format edit mode response for display
   */
  formatEditModeResponse(originalResponse, editResults) {
    let displayContent = originalResponse;
    
    // Add edit results summary
    const successfulEdits = editResults.filter(r => r.success);
    const failedEdits = editResults.filter(r => !r.success);
    
    if (successfulEdits.length > 0) {
      displayContent += `\n\n✅ **Successfully updated ${successfulEdits.length} file(s):**\n`;
      for (const edit of successfulEdits) {
        displayContent += `- \`${edit.filePath}\`\n`;
      }
    }
    
    if (failedEdits.length > 0) {
      displayContent += `\n\n❌ **Failed to update ${failedEdits.length} file(s):**\n`;
      for (const edit of failedEdits) {
        displayContent += `- \`${edit.filePath}\`: ${edit.error || edit.message}\n`;
      }
    }
    
    return displayContent;
  }

  /**
   * Process response for file edits and apply them (legacy)
   */
  async processResponseForFileEdits(response, context) {
    const responseContent = response.content || response.message || JSON.stringify(response);
    
    // Check if response contains file edit instructions
    if (!this.fileEditor.containsFileEdits(responseContent)) {
      return response;
    }

    console.log('Detected file edits in response, processing...');

    // Determine target file (use first context file or active file)
    let targetFile = null;
    if (context.contextFiles && context.contextFiles.length > 0) {
      targetFile = context.contextFiles[0].path;
    } else if (context.activeFiles && context.activeFiles.length > 0) {
      targetFile = context.activeFiles[0].path;
    }

    if (!targetFile) {
      console.warn('No target file found for edits');
      return response;
    }

    try {
      // Parse edit instructions
      const instructions = this.fileEditor.parseEditInstructions(responseContent, targetFile);
      
      if (instructions.length === 0) {
        console.log('No valid edit instructions found');
        return response;
      }

      console.log(`Found ${instructions.length} edit instructions for ${targetFile}`);

      // Apply edits to file
      const editResult = await this.fileEditor.applyEdits(instructions, targetFile);

      // Format response for display
      let displayContent = responseContent;
      
      if (editResult.success) {
        // Replace the full file content with just the edit summary
        displayContent = this.fileEditor.formatEditsForDisplay(instructions, targetFile);
        displayContent += `\n✅ Successfully applied ${editResult.appliedEdits.length} edits to \`${targetFile}\``;
      } else {
        displayContent += `\n\n❌ Failed to apply edits: ${editResult.message}`;
      }

      // Return modified response with proper structure
      return {
        ...response,
        content: displayContent,
        isFileEdit: true,
        fileEdits: {
          applied: editResult.success,
          targetFile,
          instructions,
          result: editResult
        }
      };

    } catch (error) {
      console.error('Error processing file edits:', error);
      return {
        ...response,
        content: responseContent + `\n\n❌ Error processing file edits: ${error.message}`
      };
    }
  }

  /**
   * Get current session information
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.currentSession) {
      await this.contextManager.closeSession(this.currentSession.id);
    }
    this.isInitialized = false;
  }
}

module.exports = { AIEngine };
