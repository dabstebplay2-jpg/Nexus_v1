const vscode = require('vscode');

const WELCOME_KEY = 'nexus.welcomeShown';

async function showWelcome() {
  await vscode.commands.executeCommand('workbench.action.openWalkthrough', 'nexus.nexus-welcome#nexus.welcome', false);
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('nexus.showWelcome', showWelcome));

  const shown = context.globalState.get(WELCOME_KEY);
  if (!shown) {
    context.globalState.update(WELCOME_KEY, true);
    setTimeout(() => {
      showWelcome().catch(() => {});
    }, 2000);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
