const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
/**
 * Applies Copilot-style LLM file edits to a VS Code file.
 * @param {string} fileUri - Absolute file URI or path.
 * @param {string} llmResponse - LLM response containing code block(s) with filepath.
 * @returns {Promise<{success: boolean, message: string, files?: string[], error?: string}>}
 */
async function applyLLMFileEdit(fileUri, llmResponse) {
  try {
    const codeBlockRegex = /```[\w-]*\n(?:\/\/\s*filepath:\s*([^\n]+)|\/\/\s*([^\n]+))\n([\s\S]*?)```/g;
    let match;
    const blocks = [];
    while ((match = codeBlockRegex.exec(llmResponse)) !== null) {
      const blockPath = (match[1] || match[2] || '').trim();
      const content = match[3];
      if (!blockPath) continue;
      blocks.push({ blockPath, content });
    }

    if (blocks.length === 0) {
      return { success: false, message: "No Copilot-style code blocks found in LLM response" };
    }

    // Resolve workspace root (fallback to dirname of provided fileUri or process.cwd)
    const workspaceRoot =
      (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri && vscode.workspace.workspaceFolders[0].uri.fsPath)
        || (fileUri ? path.dirname(fileUri) : process.cwd());

    const results = [];

    for (const blk of blocks) {
      let targetPath = blk.blockPath;
      // If relative path, resolve against workspace root
      if (!path.isAbsolute(targetPath)) {
        targetPath = path.normalize(path.join(workspaceRoot, targetPath));
      }

      const exists = fs.existsSync(targetPath);
      let finalContent = blk.content;

      // Normalize CRLF to LF to avoid editing surprises
      finalContent = finalContent.replace(/\r\n/g, '\n');

      // Decide whether to create or update
      if (exists) {
        // Update existing file: open document and replace whole contents,
        // handling the "...existing code..." placeholder by replacing with original content.
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        const originalText = document.getText();

        // Replace markers with original content (if present)
        finalContent = finalContent.replace(/\/\*\s*(?:\.{3}|\u2026)\s*existing code\s*(?:\.{3}|\u2026)\s*\*\//gi, originalText);
        finalContent = finalContent.replace(/\/\/\s*(?:\.{3}|\u2026)\s*existing code\s*(?:\.{3}|\u2026)/gi, originalText);
        finalContent = finalContent.replace(/(?:\.{3}|\u2026)\s*existing code\s*(?:\.{3}|\u2026)/gi, originalText);

        finalContent = finalContent.replace(/^\s+/, '').replace(/\s+$/, '');

        const workspaceEdit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        workspaceEdit.replace(document.uri, fullRange, finalContent);

        const applied = await vscode.workspace.applyEdit(workspaceEdit);
        if (applied) {
          await document.save();
          results.push({ path: targetPath, action: 'updated' });
        } else {
          results.push({ path: targetPath, action: 'failed_update' });
        }
      } else {
        // Create new file: ensure directory exists and write file (remove "existing code" placeholders)
        const dir = path.dirname(targetPath);
        fs.mkdirSync(dir, { recursive: true });

        // Remove existing-code placeholders for new files
        finalContent = finalContent.replace(/\/\*\s*(?:\.{3}|\u2026)\s*existing code\s*(?:\.{3}|\u2026)\s*\*\//gi, '');
        finalContent = finalContent.replace(/\/\/\s*(?:\.{3}|\u2026)\s*existing code\s*(?:\.{3}|\u2026)/gi, '');
        finalContent = finalContent.replace(/(?:\.{3}|\u2026)\s*existing code\s*(?:\.{3}|\u2026)/gi, '');

        finalContent = finalContent.replace(/^\s+/, '').replace(/\s+$/, '');

        // Use vscode fs to write file so VS Code recognizes it immediately
        const uint8array = Buffer.from(finalContent, 'utf8');
        await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), uint8array);
        results.push({ path: targetPath, action: 'created' });
      }
    }

    return { success: true, message: "Applied blocks", files: results.map(r => `${r.action}: ${r.path}`) };
  } catch (error) {
    return { success: false, message: "Error applying file edits", error: error.message };
  }
}

module.exports = { applyLLMFileEdit };
