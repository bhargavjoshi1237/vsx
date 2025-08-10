/**
 * File Editor - Handles parsing LLM responses for file edits and applying them
 */

const vscode = require('vscode');

class FileEditor {
  constructor() {
    this.editPatterns = [
      // Pattern for line-specific edits: "Line X: content"
      /^Line\s+(\d+):\s*(.*)$/gim,
      // Pattern for line ranges: "Lines X-Y: content"
      /^Lines\s+(\d+)-(\d+):\s*(.*)$/gim,
      // Pattern for insertions: "Insert at line X: content"
      /^Insert\s+at\s+line\s+(\d+):\s*(.*)$/gim,
      // Pattern for deletions: "Delete line X" or "Delete lines X-Y"
      /^Delete\s+lines?\s+(\d+)(?:-(\d+))?$/gim,
      // Pattern for replacements: "Replace line X with: content"
      /^Replace\s+line\s+(\d+)\s+with:\s*(.*)$/gim
    ];
  }

  /**
   * Parse LLM response for file edit instructions
   */
  parseEditInstructions(response, filePath) {
    const instructions = [];
    const lines = response.split('\n');
    
    console.log(`Parsing edit instructions for ${filePath} from ${lines.length} lines`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and non-instruction lines
      if (!line || !this.isEditInstruction(line)) {
        continue;
      }

      const instruction = this.parseInstruction(line);
      if (instruction) {
        instruction.filePath = filePath;
        instructions.push(instruction);
        console.log(`Parsed instruction: ${instruction.type} at line ${instruction.lineNumber}`);
      }
    }

    console.log(`Found ${instructions.length} valid edit instructions`);
    return instructions;
  }

  /**
   * Check if a line contains an edit instruction
   */
  isEditInstruction(line) {
    const instructionKeywords = [
      'line', 'lines', 'insert', 'delete', 'replace', 
      'add', 'remove', 'update', 'change'
    ];
    
    const lowerLine = line.toLowerCase();
    return instructionKeywords.some(keyword => 
      lowerLine.includes(keyword) && 
      (lowerLine.includes(':') || lowerLine.match(/\d+/))
    );
  }

  /**
   * Parse a single instruction line
   */
  parseInstruction(line) {
    // Line X: content
    let match = line.match(/^Line\s+(\d+):\s*(.*)$/i);
    if (match) {
      return {
        type: 'replace',
        lineNumber: parseInt(match[1]),
        content: match[2],
        originalLine: line
      };
    }

    // Lines X-Y: content (replace range)
    match = line.match(/^Lines\s+(\d+)-(\d+):\s*(.*)$/i);
    if (match) {
      return {
        type: 'replaceRange',
        startLine: parseInt(match[1]),
        endLine: parseInt(match[2]),
        content: match[3],
        originalLine: line
      };
    }

    // Insert at line X: content
    match = line.match(/^Insert\s+at\s+line\s+(\d+):\s*(.*)$/i);
    if (match) {
      return {
        type: 'insert',
        lineNumber: parseInt(match[1]),
        content: match[2],
        originalLine: line
      };
    }

    // Delete line X or Delete lines X-Y
    match = line.match(/^Delete\s+lines?\s+(\d+)(?:-(\d+))?$/i);
    if (match) {
      return {
        type: 'delete',
        lineNumber: parseInt(match[1]),
        endLine: match[2] ? parseInt(match[2]) : parseInt(match[1]),
        originalLine: line
      };
    }

    // Replace line X with: content
    match = line.match(/^Replace\s+line\s+(\d+)\s+with:\s*(.*)$/i);
    if (match) {
      return {
        type: 'replace',
        lineNumber: parseInt(match[1]),
        content: match[2],
        originalLine: line
      };
    }

    // Add at end: content
    if (line.match(/^Add\s+at\s+end:\s*(.*)$/i)) {
      match = line.match(/^Add\s+at\s+end:\s*(.*)$/i);
      return {
        type: 'append',
        content: match[1],
        originalLine: line
      };
    }

    return null;
  }

  /**
   * Apply edit instructions to a file
   */
  async applyEdits(instructions, filePath) {
    if (!instructions || instructions.length === 0) {
      return { success: false, message: 'No edit instructions found' };
    }

    try {
      // Get the file URI
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder found');
      }

      const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
      
      // Open the document
      const document = await vscode.workspace.openTextDocument(fileUri);
      
      // Capture original content for each instruction before making any changes
      for (const instruction of instructions) {
        await this.captureOriginalContent(document, instruction);
      }

      // Sort instructions by line number (descending for deletions, ascending for insertions)
      const sortedInstructions = [...instructions].sort((a, b) => {
        if (a.type === 'delete' || a.type === 'replace') {
          return b.lineNumber - a.lineNumber; // Descending for deletions/replacements
        }
        return a.lineNumber - b.lineNumber; // Ascending for insertions
      });

      // Apply edits using WorkspaceEdit for atomic operations
      const workspaceEdit = new vscode.WorkspaceEdit();
      const appliedEdits = [];

      for (const instruction of sortedInstructions) {
        const edit = await this.createEdit(document, instruction);
        if (edit) {
          workspaceEdit.replace(fileUri, edit.range, edit.newText);
          appliedEdits.push({
            type: instruction.type,
            line: instruction.lineNumber,
            content: instruction.content,
            originalContent: instruction.originalContent,
            originalInstruction: instruction.originalLine
          });
        }
      }

      // Apply all edits atomically
      const success = await vscode.workspace.applyEdit(workspaceEdit);
      
      if (success) {
        // Save the document
        await document.save();
        
        return {
          success: true,
          message: `Applied ${appliedEdits.length} edits to ${filePath}`,
          appliedEdits
        };
      } else {
        return {
          success: false,
          message: 'Failed to apply edits to file'
        };
      }

    } catch (error) {
      console.error('Error applying edits:', error);
      return {
        success: false,
        message: `Error applying edits: ${error.message}`
      };
    }
  }

  /**
   * Capture original content before making edits
   */
  async captureOriginalContent(document, instruction) {
    const lineCount = document.lineCount;
    
    switch (instruction.type) {
      case 'replace':
        if (instruction.lineNumber <= lineCount) {
          const line = document.lineAt(instruction.lineNumber - 1);
          instruction.originalContent = line.text;
        }
        break;
        
      case 'replaceRange':
        if (instruction.startLine <= lineCount && instruction.endLine <= lineCount) {
          const originalLines = [];
          for (let i = instruction.startLine - 1; i <= instruction.endLine - 1; i++) {
            originalLines.push(document.lineAt(i).text);
          }
          instruction.originalContent = originalLines.join('\n');
        }
        break;
        
      case 'delete':
        const deleteStartLine = Math.min(instruction.lineNumber - 1, lineCount - 1);
        const deleteEndLine = Math.min(instruction.endLine - 1, lineCount - 1);
        const deletedLines = [];
        for (let i = deleteStartLine; i <= deleteEndLine; i++) {
          deletedLines.push(document.lineAt(i).text);
        }
        instruction.originalContent = deletedLines.join('\n');
        break;
        
      case 'insert':
      case 'append':
        // No original content for inserts/appends
        instruction.originalContent = '';
        break;
    }
  }

  /**
   * Create a VS Code edit from an instruction
   */
  async createEdit(document, instruction) {
    const lineCount = document.lineCount;
    
    switch (instruction.type) {
      case 'replace':
        if (instruction.lineNumber > lineCount) {
          console.warn(`Line ${instruction.lineNumber} exceeds document length`);
          return null;
        }
        const line = document.lineAt(instruction.lineNumber - 1);
        return {
          range: line.range,
          newText: instruction.content
        };

      case 'replaceRange':
        if (instruction.startLine > lineCount || instruction.endLine > lineCount) {
          console.warn(`Line range ${instruction.startLine}-${instruction.endLine} exceeds document length`);
          return null;
        }
        const startLine = document.lineAt(instruction.startLine - 1);
        const endLine = document.lineAt(instruction.endLine - 1);
        return {
          range: new vscode.Range(startLine.range.start, endLine.range.end),
          newText: instruction.content
        };

      case 'insert':
        const insertLine = Math.min(instruction.lineNumber - 1, lineCount);
        const insertPosition = insertLine < lineCount 
          ? document.lineAt(insertLine).range.start
          : document.lineAt(lineCount - 1).range.end;
        return {
          range: new vscode.Range(insertPosition, insertPosition),
          newText: instruction.content + '\n'
        };

      case 'delete':
        const deleteStartLine = Math.min(instruction.lineNumber - 1, lineCount - 1);
        const deleteEndLine = Math.min(instruction.endLine - 1, lineCount - 1);
        const deleteStart = document.lineAt(deleteStartLine).range.start;
        const deleteEnd = deleteEndLine < lineCount - 1 
          ? document.lineAt(deleteEndLine + 1).range.start
          : document.lineAt(deleteEndLine).range.end;
        return {
          range: new vscode.Range(deleteStart, deleteEnd),
          newText: ''
        };

      case 'append':
        const lastLine = document.lineAt(lineCount - 1);
        return {
          range: new vscode.Range(lastLine.range.end, lastLine.range.end),
          newText: '\n' + instruction.content
        };

      default:
        console.warn(`Unknown instruction type: ${instruction.type}`);
        return null;
    }
  }

  /**
   * Format edit instructions for display in chat
   */
  formatEditsForDisplay(instructions, targetFile) {
    if (!instructions || instructions.length === 0) {
      return 'No file edits detected.';
    }

    let display = `📝 **File Edits Applied to \`${targetFile}\`:**\n\n`;
    
    for (const instruction of instructions) {
      switch (instruction.type) {
        case 'replace':
          display += `• **Line ${instruction.lineNumber}:** Modified\n`;
          if (instruction.originalContent) {
            display += `  - \`${instruction.originalContent}\`\n`;
          }
          display += `  + \`${instruction.content}\`\n\n`;
          break;
        case 'replaceRange':
          display += `• **Lines ${instruction.startLine}-${instruction.endLine}:** Modified\n`;
          if (instruction.originalContent) {
            display += `  - \`${instruction.originalContent}\`\n`;
          }
          display += `  + \`${instruction.content}\`\n\n`;
          break;
        case 'insert':
          display += `• **Line ${instruction.lineNumber}:** Added\n`;
          display += `  + \`${instruction.content}\`\n\n`;
          break;
        case 'delete':
          const lineText = instruction.endLine > instruction.lineNumber 
            ? `Lines ${instruction.lineNumber}-${instruction.endLine}` 
            : `Line ${instruction.lineNumber}`;
          display += `• **${lineText}:** Deleted\n`;
          if (instruction.originalContent) {
            display += `  - \`${instruction.originalContent}\`\n`;
          }
          display += '\n';
          break;
        case 'append':
          display += `• **End of file:** Added\n`;
          display += `  + \`${instruction.content}\`\n\n`;
          break;
      }
    }

    return display;
  }

  /**
   * Check if response contains file edit instructions
   */
  containsFileEdits(response) {
    const lines = response.split('\n');
    return lines.some(line => this.isEditInstruction(line.trim()));
  }

  /**
   * Validate that the line content matches what's expected before applying edits
   */
  validateLineContent(document, instruction) {
    if (!instruction.expectedContent) {
      return true; // No validation required
    }

    try {
      const lineCount = document.lineCount;
      
      switch (instruction.type) {
        case 'replace':
          if (instruction.lineNumber > lineCount) {
            return false;
          }
          const actualLine = document.lineAt(instruction.lineNumber - 1).text.trim();
          const expectedLine = instruction.expectedContent.trim();
          return actualLine === expectedLine;
          
        case 'replaceRange':
          if (instruction.startLine > lineCount || instruction.endLine > lineCount) {
            return false;
          }
          const actualLines = [];
          for (let i = instruction.startLine - 1; i <= instruction.endLine - 1; i++) {
            actualLines.push(document.lineAt(i).text);
          }
          const actualContent = actualLines.join('\n').trim();
          const expectedContent = instruction.expectedContent.trim();
          return actualContent === expectedContent;
          
        default:
          return true;
      }
    } catch (error) {
      console.warn('Error validating line content:', error);
      return false;
    }
  }

  /**
   * Preserve blank lines in file content
   */
  preserveBlankLines(content) {
    // Ensure proper line endings and preserve blank lines
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
}

module.exports = { FileEditor };