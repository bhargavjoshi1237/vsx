# Ask and Edit Modes Implementation

This document describes the implementation of Ask and Edit modes based on GitHub Copilot wrapper prompts.

## Overview

The VSX AI Assistant now supports two distinct interaction modes:

### Ask Mode
- **Trigger**: No context files attached
- **Behavior**: Answers questions in chat without direct file interaction
- **Prompt Format**: Uses GitHub Copilot style with reminder about avoiding code repetition
- **Response**: Provides answers with code examples using `...existing code...` placeholders

### Edit Mode  
- **Trigger**: Context files are attached
- **Behavior**: Interactive file editing with direct file modifications
- **Prompt Format**: Uses GitHub Copilot wrapper style with file status and content
- **Response**: Applies changes directly to files and shows edit summary

## Implementation Details

### Mode Detection
```javascript
determineInteractionMode(context) {
  // Edit mode: has context files attached
  if (context.contextFiles && context.contextFiles.length > 0) {
    return 'edit';
  }
  
  // Ask mode: no context files, just answering questions
  return 'ask';
}
```

### Ask Mode Prompt Structure
```
<reminder>
Avoid repeating existing code, instead use a line comment with `...existing code...` to represent regions of unchanged code. The code block for each file being edited must start with a comment containing the filepath. This includes Markdown code blocks. For existing files, make sure the filepath exactly matches the filepath of the original file. When suggesting to create new files, pick a location inside the workspace.
</reminder>

<prompt>
[User's question]
</prompt>
```

### Edit Mode Prompt Structure
```
The user has provided the following files as input. Always make changes to these files unless the user asks to create a new file. Untitled files are files that are not yet named. Make changes to them like regular files.

<file>
<status>I applied your suggestions for this file and accepted them. Here is the updated file:</status>
```[language]
// filepath: [file_path]
[file_content]
```
</file>

<reminder>
Avoid repeating existing code, instead use a line comment with `...existing code...` to represent regions of unchanged code. The code block for each file being edited must start with a comment containing the filepath. This includes Markdown code blocks. For existing files, make sure the filepath exactly matches the filepath of the original file. When suggesting to create new files, pick a location inside the workspace.
</reminder>

<prompt>
[User's edit request]
</prompt>
```

## Key Features

### Blank Line Preservation
- Normalizes line endings (`\r\n` → `\n`)
- Preserves all blank lines in file content
- Maintains proper line counting including empty lines

### File Edit Validation
- Validates line content matches expected content before applying edits
- Provides detailed error messages for failed edits
- Shows edit summaries with before/after content

### Response Processing
- **Ask Mode**: Returns formatted response with code examples
- **Edit Mode**: Parses code blocks with filepath comments and applies changes
- **Legacy Mode**: Maintains backward compatibility with existing functionality

## Usage Examples

### Ask Mode Example
User: "What's the version in this package.json?"

With attachment: `package.json`

Response: Answers the question about the version without modifying files.

### Edit Mode Example  
User: "Change the name to 'Demo'"

With attachment: `package.json`

Response: Updates the file directly and shows confirmation of changes applied.

## Error Handling

- Graceful fallback to legacy mode if mode detection fails
- Detailed error messages for file operation failures
- Validation of file paths and content before applying changes
- Atomic file operations using VS Code's WorkspaceEdit API

## Benefits

1. **Clear Separation**: Distinct modes for different use cases
2. **GitHub Copilot Compatibility**: Uses familiar prompt structures
3. **Improved UX**: Users know when files will be modified
4. **Better Error Handling**: More specific error messages and validation
5. **Blank Line Preservation**: Maintains code formatting integrity