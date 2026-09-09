const vscode = require('vscode');
const auth = require('./lib/authCore');
const { AccountWebviewProvider } = require('./lib/accountWebview');

/** @type {AccountWebviewProvider | null} */
let accountProvider = null;

function activate(context) {
  auth.setContext(context);

  accountProvider = new AccountWebviewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('nexus.account', accountProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('nexus.signIn', async () => {
      await vscode.commands.executeCommand('nexus.account.focus');
      await auth.signIn();
      accountProvider?.refresh();
    }),
    vscode.commands.registerCommand('nexus.signInGoogle', () => auth.signInWithGoogle().catch(showErr)),
    vscode.commands.registerCommand('nexus.signInEmailCode', () =>
      auth.signInWithEmailCodeInteractive().catch(showErr)
    ),
    vscode.commands.registerCommand('nexus.signOut', () => auth.signOut().catch(showErr)),
    vscode.commands.registerCommand('nexus.openProfileWeb', () => {
      vscode.env.openExternal(vscode.Uri.parse(`${auth.webAppUrl()}/profile`));
    }),
    vscode.commands.registerCommand('nexus.getSession', async () => auth.getSession()),
    vscode.commands.registerCommand('nexus.cloudFetch', async (_uri, path, init) =>
      auth.cloudFetchWithRefresh(path, init)
    ),
    vscode.commands.registerCommand('nexus.refreshProfile', () => accountProvider?.refresh()),
    vscode.window.registerUriHandler({
      handleUri(uri) {
        const exchange = new URLSearchParams(uri.query).get('exchange');
        if (!exchange) {
          vscode.window.showErrorMessage('Nexus: нет кода из браузера');
          return;
        }
        auth
          .completeGoogleExchange(exchange)
          .then(() => accountProvider?.refresh())
          .catch(showErr);
      },
    }),
    auth.authChangedEmitter.event(() => accountProvider?.refresh())
  );

  auth.getAccessToken().then((t) => {
    vscode.commands.executeCommand('setContext', 'nexus.authorized', Boolean(t));
  });

  return auth.getApiExports();
}

function showErr(e) {
  vscode.window.showErrorMessage(e?.message || String(e));
}

function deactivate() {
  auth.setContext(null);
  accountProvider = null;
}

module.exports = { activate, deactivate };
