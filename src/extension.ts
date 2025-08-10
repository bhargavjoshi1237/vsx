// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Register the Hello World command
	const disposable = vscode.commands.registerCommand('vsx.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from VSX!');
	});
	context.subscriptions.push(disposable);

	// Register the custom sidebar view provider
	const provider = new (class implements vscode.WebviewViewProvider {
		resolveWebviewView(webviewView: vscode.WebviewView) {
			webviewView.webview.options = {
				enableScripts: true
			};
			webviewView.webview.html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Hello World</title>
				</head>
				<body>
					<h1 style="font-family: sans-serif; text-align: center; margin-top: 2em;">Hello World</h1>
				</body>
				</html>
			`;
		}
	})();
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('vsxPanel', provider)
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
