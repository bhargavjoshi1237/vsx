const assert = require('assert');
const vscode = require('vscode');
// const myExtension = require('../../extension');

describe('Extension Test Suite', function () {
    vscode.window.showInformationMessage('Start all tests.');

    it('Sample test', function () {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});
