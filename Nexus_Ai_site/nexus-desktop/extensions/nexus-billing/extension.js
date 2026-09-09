const vscode = require('vscode');

/** Контейнер Nexus в activity bar; панель аккаунта — в nexus-auth. */
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('nexus.openPricing', async () => {
      const ext = vscode.extensions.getExtension('nexus.nexus-auth');
      if (!ext) {
        vscode.window.showErrorMessage('Установите расширение Nexus Account');
        return;
      }
      if (!ext.isActive) await ext.activate();
      const session = await ext.exports.getSession();
      vscode.env.openExternal(vscode.Uri.parse(`${session.webAppUrl}/pricing`));
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
