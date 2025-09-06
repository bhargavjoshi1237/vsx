const vscode = require('vscode');

function validateExtensionSetup() {
    const issues = [];
    
    // Check if commands are registered
    const commands = [
        'vsx.openChatPanel',
        'vsx.manageApiKeys',
        'vsx.clearApiKey'
    ];
    
    console.log('Validating VSX extension setup...');
    
    // Check workspace
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        issues.push('No workspace folder is open');
    }
    
    // Check extension activation
    const extension = vscode.extensions.getExtension('your.publisher.vsx');
    if (!extension) {
        issues.push('VSX extension not found in extension registry');
    } else if (!extension.isActive) {
        issues.push('VSX extension is not active');
    }
    
    return {
        isValid: issues.length === 0,
        issues: issues
    };
}

async function runDiagnostics() {
    const result = validateExtensionSetup();
    
    if (result.isValid) {
        vscode.window.showInformationMessage('✅ VSX extension setup is valid');
    } else {
        const message = '❌ VSX extension issues found:\n' + result.issues.join('\n');
        console.error(message);
        vscode.window.showErrorMessage('VSX Extension Setup Issues', {
            detail: result.issues.join('\n')
        });
    }
    
    return result;
}

module.exports = { validateExtensionSetup, runDiagnostics };
