/**
 * Test file for FileEditor functionality
 */

// Mock FileEditor class for testing (without VS Code dependencies)
class TestFileEditor {
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

    return null;
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
}

// Simple test function
function testFileEditor() {
  const fileEditor = new TestFileEditor();
  
  console.log('Testing FileEditor...');
  
  // Test parsing edit instructions
  const testResponse = `
Here are the changes needed:

Line 3: console.log("Hello Updated World");
Insert at line 5: // This is a new comment
Delete line 7
Replace line 9 with: function newFunction() {

These changes will update the file.
  `;
  
  const instructions = fileEditor.parseEditInstructions(testResponse, 'test-file.js');
  
  console.log('Parsed instructions:', instructions);
  console.log('Number of instructions:', instructions.length);
  
  // Test formatting for display
  const displayText = fileEditor.formatEditsForDisplay(instructions, 'test-file.js');
  console.log('Display text:', displayText);
  
  // Test containsFileEdits
  const containsEdits = fileEditor.containsFileEdits(testResponse);
  console.log('Contains file edits:', containsEdits);
  
  console.log('FileEditor test completed');
}

// Run test if this file is executed directly
if (require.main === module) {
  testFileEditor();
}

module.exports = { testFileEditor };