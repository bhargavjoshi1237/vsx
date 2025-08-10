# File Editing Feature Guide

## Overview

The VSX Assistant now supports intelligent file editing that parses LLM responses for specific line-by-line edit instructions and applies them directly to files, instead of showing the entire file content in chat bubbles.

## How It Works

### 1. Enhanced Prompts
When you ask the LLM to edit files, the system automatically adds instructions to the prompt telling the LLM to use specific formatting for file edits:

```
When making file edits, use these specific formats:
- Line X: [new content] - Replace line X with new content
- Lines X-Y: [new content] - Replace lines X through Y with new content  
- Insert at line X: [new content] - Insert new content at line X
- Delete line X - Delete line X
- Delete lines X-Y - Delete lines X through Y
- Replace line X with: [new content] - Replace line X with new content
- Add at end: [new content] - Add content at end of file

Do NOT show the entire file content in your response. Only show the specific line changes using the above format.
```

### 2. Response Processing
The system automatically:
- Detects when an LLM response contains file edit instructions
- Parses the instructions using pattern matching
- Applies the edits directly to the target file
- Shows only a summary of changes in the chat (not the full file)

### 3. Supported Edit Formats

#### Replace Single Line
```
Line 5: console.log("Updated message");
```

#### Replace Line Range
```
Lines 10-15: // New multi-line content here
```

#### Insert at Specific Line
```
Insert at line 8: // This is a new comment
```

#### Delete Lines
```
Delete line 12
Delete lines 5-8
```

#### Replace with Explicit Format
```
Replace line 20 with: function newFunction() {
```

#### Add at End of File
```
Add at end: // End of file comment
```

## Example Usage

### User Request:
"Update line 3 in the test file to log 'Hello Updated World' instead"

### LLM Response (Old Way):
Would show the entire file content with the change, cluttering the chat.

### LLM Response (New Way):
```
Line 3: console.log("Hello Updated World");
```

### Chat Display:
```
📝 File Edits Applied:

• Line 3: Updated
  `console.log("Hello Updated World");`

✅ Successfully applied 1 edits to `test-file.js`
```

## Technical Implementation

### Core Components

1. **FileEditor Class** (`src/core/file-editor.js`)
   - Parses LLM responses for edit instructions
   - Applies edits using VS Code's WorkspaceEdit API
   - Formats edit summaries for display

2. **Enhanced AI Engine** (`src/core/engine.js`)
   - Detects file editing requests
   - Processes responses for file edits
   - Coordinates between LLM and file operations

3. **Updated Chat Panel** (`src/ui/chat-panel.js`)
   - Displays formatted edit summaries
   - Styles file edit information clearly

### Edit Instruction Parsing

The system uses regex patterns to identify and parse edit instructions:

```javascript
// Pattern examples
/^Line\s+(\d+):\s*(.*)$/gim                    // Line X: content
/^Lines\s+(\d+)-(\d+):\s*(.*)$/gim            // Lines X-Y: content
/^Insert\s+at\s+line\s+(\d+):\s*(.*)$/gim     // Insert at line X: content
/^Delete\s+lines?\s+(\d+)(?:-(\d+))?$/gim     // Delete line(s) X(-Y)
```

### File Operation Flow

1. User sends request with context files
2. System detects file editing intent
3. Enhanced prompt includes editing instructions
4. LLM responds with structured edit commands
5. FileEditor parses and applies edits
6. Chat shows summary instead of full file
7. File is automatically saved

## Benefits

### For Users
- **Cleaner Chat**: No more cluttered chat with entire file contents
- **Precise Edits**: See exactly what changed at which lines
- **Automatic Application**: Edits are applied directly to files
- **Clear Feedback**: Visual confirmation of what was changed

### For Development
- **Reduced Token Usage**: Less content in chat responses
- **Better UX**: More focused and actionable responses
- **Atomic Operations**: All edits applied together or not at all
- **Error Handling**: Clear feedback when edits fail

## Error Handling

The system handles various error scenarios:

- **Invalid Line Numbers**: Warns and skips edits beyond file length
- **File Not Found**: Shows error message in chat
- **Parse Failures**: Falls back to showing original response
- **Edit Conflicts**: Uses VS Code's conflict resolution

## Testing

Run the file editor tests:

```bash
node src/test/file-editor.test.js
```

This tests the parsing logic without VS Code dependencies.

## Future Enhancements

- Support for multiple file edits in one response
- Undo/redo functionality for applied edits
- Preview mode before applying edits
- Integration with Git for change tracking
- Support for more complex edit patterns