/**
 * Test file for Ask and Edit modes
 * This file demonstrates the different interaction modes
 */

// Test data for ask mode
const askModeExample = {
  userMessage: "What's the version in this package.json?",
  contextFiles: [], // No context files = ask mode
  expectedMode: 'ask'
};

// Test data for edit mode  
const editModeExample = {
  userMessage: "Change the name to 'Demo'",
  contextFiles: ['package.json'], // Has context files = edit mode
  expectedMode: 'edit'
};

// Test blank line preservation
const testContent = `{
  "name": "Title",
  "version": "1.0.0",

  "description": "Express proxy for Copilot to stream Qwen",
  
  "main": "ollama-mock.js",
  "scripts": {
    "start": "node ollama-mock.js",
    
    "test": "node test-copilot-integration.js"
  }
}`;

console.log('Test content with blank lines:');
console.log(testContent);
console.log('Line count:', testContent.split('\n').length);

module.exports = {
  askModeExample,
  editModeExample,
  testContent
};