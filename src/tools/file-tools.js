/**
 * File System Operations Tools
 * Handles reading, writing, and analyzing files in the workspace
 */

const vscode = require('vscode');
const path = require('path');

class FileTools {
    constructor() {
        this.tools = new Map();
        this.registerTools();
    }

    /**
     * Register all file operation tools
     */
    registerTools() {
        this.tools.set('readFile', {
            name: 'readFile',
            description: 'Read the contents of a file',
            parameters: {
                filePath: { type: 'string', required: true, description: 'Path to the file to read' },
                encoding: { type: 'string', required: false, description: 'File encoding (default: utf8)' }
            },
            execute: this.readFile.bind(this)
        });

        this.tools.set('writeFile', {
            name: 'writeFile',
            description: 'Write content to a file',
            parameters: {
                filePath: { type: 'string', required: true, description: 'Path to the file to write' },
                content: { type: 'string', required: true, description: 'Content to write to the file' },
                createBackup: { type: 'boolean', required: false, description: 'Create backup before writing' }
            },
            execute: this.writeFile.bind(this)
        });

        this.tools.set('listFiles', {
            name: 'listFiles',
            description: 'List files in a directory',
            parameters: {
                dirPath: { type: 'string', required: false, description: 'Directory path (default: workspace root)' },
                pattern: { type: 'string', required: false, description: 'File pattern to match' },
                recursive: { type: 'boolean', required: false, description: 'Search recursively' }
            },
            execute: this.listFiles.bind(this)
        });

        this.tools.set('searchInFiles', {
            name: 'searchInFiles',
            description: 'Search for text in files',
            parameters: {
                query: { type: 'string', required: true, description: 'Text to search for' },
                filePattern: { type: 'string', required: false, description: 'File pattern to search in' },
                caseSensitive: { type: 'boolean', required: false, description: 'Case sensitive search' }
            },
            execute: this.searchInFiles.bind(this)
        });

        this.tools.set('getActiveFile', {
            name: 'getActiveFile',
            description: 'Get information about the currently active file',
            parameters: {},
            execute: this.getActiveFile.bind(this)
        });

        this.tools.set('getWorkspaceInfo', {
            name: 'getWorkspaceInfo',
            description: 'Get information about the current workspace',
            parameters: {},
            execute: this.getWorkspaceInfo.bind(this)
        });
    }

    /**
     * Read file contents
     */
    async readFile(params) {
        try {
            const { filePath, encoding = 'utf8' } = params;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            const fullPath = path.isAbsolute(filePath) 
                ? vscode.Uri.file(filePath)
                : vscode.Uri.joinPath(workspaceFolder.uri, filePath);

            const fileContent = await vscode.workspace.fs.readFile(fullPath);
            const content = Buffer.from(fileContent).toString(encoding);

            return {
                success: true,
                filePath: fullPath.fsPath,
                content,
                size: fileContent.length,
                encoding
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                filePath: params.filePath
            };
        }
    }

    /**
     * Write content to file
     */
    async writeFile(params) {
        try {
            const { filePath, content, createBackup = false } = params;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            const fullPath = path.isAbsolute(filePath) 
                ? vscode.Uri.file(filePath)
                : vscode.Uri.joinPath(workspaceFolder.uri, filePath);

            // Create backup if requested
            if (createBackup) {
                try {
                    const existingContent = await vscode.workspace.fs.readFile(fullPath);
                    const backupPath = vscode.Uri.file(fullPath.fsPath + '.backup');
                    await vscode.workspace.fs.writeFile(backupPath, existingContent);
                } catch (error) {
                    // File might not exist, continue without backup
                }
            }

            // Write the new content
            const contentBuffer = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(fullPath, contentBuffer);

            return {
                success: true,
                filePath: fullPath.fsPath,
                bytesWritten: contentBuffer.length,
                backupCreated: createBackup
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                filePath: params.filePath
            };
        }
    }

    /**
     * List files in directory
     */
    async listFiles(params) {
        try {
            const { dirPath, pattern, recursive = false } = params;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            const searchPath = dirPath 
                ? (path.isAbsolute(dirPath) ? vscode.Uri.file(dirPath) : vscode.Uri.joinPath(workspaceFolder.uri, dirPath))
                : workspaceFolder.uri;

            const searchPattern = pattern || '**/*';
            const searchGlob = recursive 
                ? new vscode.RelativePattern(searchPath, searchPattern)
                : new vscode.RelativePattern(searchPath, searchPattern);

            const files = await vscode.workspace.findFiles(searchGlob, null, 100);
            
            const fileList = await Promise.all(files.map(async (fileUri) => {
                try {
                    const stat = await vscode.workspace.fs.stat(fileUri);
                    return {
                        path: vscode.workspace.asRelativePath(fileUri),
                        fullPath: fileUri.fsPath,
                        size: stat.size,
                        type: stat.type === vscode.FileType.Directory ? 'directory' : 'file',
                        modified: new Date(stat.mtime).toISOString()
                    };
                } catch (error) {
                    return {
                        path: vscode.workspace.asRelativePath(fileUri),
                        fullPath: fileUri.fsPath,
                        error: error.message
                    };
                }
            }));

            return {
                success: true,
                directory: searchPath.fsPath,
                files: fileList,
                count: fileList.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                directory: params.dirPath
            };
        }
    }

    /**
     * Search for text in files
     */
    async searchInFiles(params) {
        try {
            const { query, filePattern = '**/*', caseSensitive = false } = params;
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            
            if (!workspaceFolder) {
                throw new Error('No workspace folder open');
            }

            const searchGlob = new vscode.RelativePattern(workspaceFolder, filePattern);
            const files = await vscode.workspace.findFiles(searchGlob, null, 50);
            
            const results = [];
            const searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi');

            for (const fileUri of files) {
                try {
                    const fileContent = await vscode.workspace.fs.readFile(fileUri);
                    const content = Buffer.from(fileContent).toString('utf8');
                    const lines = content.split('\n');
                    
                    const matches = [];
                    lines.forEach((line, lineNumber) => {
                        const match = line.match(searchRegex);
                        if (match) {
                            matches.push({
                                lineNumber: lineNumber + 1,
                                line: line.trim(),
                                match: match[0]
                            });
                        }
                    });

                    if (matches.length > 0) {
                        results.push({
                            file: vscode.workspace.asRelativePath(fileUri),
                            fullPath: fileUri.fsPath,
                            matches
                        });
                    }
                } catch (error) {
                    // Skip files that can't be read
                    continue;
                }
            }

            return {
                success: true,
                query,
                results,
                totalMatches: results.reduce((sum, result) => sum + result.matches.length, 0)
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                query: params.query
            };
        }
    }

    /**
     * Get active file information
     */
    async getActiveFile() {
        try {
            const activeEditor = vscode.window.activeTextEditor;
            
            if (!activeEditor) {
                return {
                    success: true,
                    hasActiveFile: false,
                    message: 'No file is currently active'
                };
            }

            const document = activeEditor.document;
            const selection = activeEditor.selection;

            return {
                success: true,
                hasActiveFile: true,
                file: {
                    path: vscode.workspace.asRelativePath(document.uri),
                    fullPath: document.uri.fsPath,
                    language: document.languageId,
                    lineCount: document.lineCount,
                    isDirty: document.isDirty,
                    selection: {
                        start: { line: selection.start.line, character: selection.start.character },
                        end: { line: selection.end.line, character: selection.end.character },
                        isEmpty: selection.isEmpty,
                        selectedText: selection.isEmpty ? null : document.getText(selection)
                    }
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get workspace information
     */
    async getWorkspaceInfo() {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {
                    success: true,
                    hasWorkspace: false,
                    message: 'No workspace folder is open'
                };
            }

            const workspaceInfo = {
                success: true,
                hasWorkspace: true,
                folders: workspaceFolders.map(folder => ({
                    name: folder.name,
                    path: folder.uri.fsPath,
                    scheme: folder.uri.scheme
                })),
                name: vscode.workspace.name,
                rootPath: workspaceFolders[0].uri.fsPath
            };

            // Try to get package.json info if it exists
            try {
                const packageJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'package.json');
                const packageContent = await vscode.workspace.fs.readFile(packageJsonUri);
                const packageJson = JSON.parse(Buffer.from(packageContent).toString('utf8'));
                
                workspaceInfo.project = {
                    name: packageJson.name,
                    version: packageJson.version,
                    description: packageJson.description,
                    dependencies: Object.keys(packageJson.dependencies || {}),
                    devDependencies: Object.keys(packageJson.devDependencies || {})
                };
            } catch (error) {
                // No package.json or couldn't read it
                workspaceInfo.project = null;
            }

            return workspaceInfo;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all available tools
     */
    getAvailableTools() {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }));
    }

    /**
     * Execute a tool by name
     */
    async executeTool(toolName, parameters) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found`);
        }

        try {
            const result = await tool.execute(parameters);
            return {
                toolName,
                success: true,
                result,
                executedAt: new Date().toISOString()
            };
        } catch (error) {
            return {
                toolName,
                success: false,
                error: error.message,
                executedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Validate tool parameters
     */
    validateParameters(toolName, parameters) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            return { valid: false, error: `Tool '${toolName}' not found` };
        }

        const errors = [];
        
        for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
            if (paramDef.required && !(paramName in parameters)) {
                errors.push(`Required parameter '${paramName}' is missing`);
            }
            
            if (paramName in parameters) {
                const value = parameters[paramName];
                const expectedType = paramDef.type;
                
                if (expectedType === 'string' && typeof value !== 'string') {
                    errors.push(`Parameter '${paramName}' must be a string`);
                } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
                    errors.push(`Parameter '${paramName}' must be a boolean`);
                } else if (expectedType === 'number' && typeof value !== 'number') {
                    errors.push(`Parameter '${paramName}' must be a number`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = { FileTools };