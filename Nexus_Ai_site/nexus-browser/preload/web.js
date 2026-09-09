const { ipcRenderer } = require('electron');

function sendMediaState(payload) {
  ipcRenderer.send('media:state', payload);
}

function readMediaSession() {
  const ms = navigator.mediaSession;
  const meta = ms?.metadata;
  const artwork = meta?.artwork?.[0]?.src || '';
  const audible = Boolean(
    document.querySelector('video:not([paused]), audio:not([paused])')
  );
  sendMediaState({
    title: meta?.title || document.title || '',
    artist: meta?.artist || '',
    album: meta?.album || '',
    artwork,
    playbackState: ms?.playbackState || (audible ? 'playing' : 'paused'),
    audible,
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const requestAutofill = (target) => {
    if (!(target instanceof HTMLInputElement) || target.type !== 'password') return;
    if (!navigator.userActivation?.isActive) return;
    ipcRenderer.send('password:request-autofill', window.location.origin);
  };

  document.addEventListener('pointerdown', (event) => requestAutofill(event.target), true);
  document.addEventListener('focusin', (event) => requestAutofill(event.target), true);

  ipcRenderer.on('password:fill', (_event, { username, password }) => {
    const passInput = document.activeElement;
    if (!(passInput instanceof HTMLInputElement) || passInput.type !== 'password') return;
    if (passInput.disabled || passInput.readOnly || passInput.getClientRects().length === 0) return;

    passInput.value = password;
    passInput.dispatchEvent(new Event('input', { bubbles: true }));
    const form = passInput.form;
    if (form) {
      const userInput = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
      if (userInput && !userInput.disabled && !userInput.readOnly) {
        userInput.value = username;
        userInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      let prev = passInput.previousElementSibling;
      while (prev) {
        if (prev.tagName === 'INPUT' && (prev.type === 'text' || prev.type === 'email')) {
          prev.value = username;
          prev.dispatchEvent(new Event('input', { bubbles: true }));
          break;
        }
        prev = prev.previousElementSibling;
      }
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form) return;
    const passwordInput = form.querySelector('input[type="password"]');
    if (!passwordInput || !passwordInput.value) return;

    const userInput = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
    const username = userInput ? userInput.value : '';
    const password = passwordInput.value;

    if (username && password) {
      ipcRenderer.send('password:save-prompt', {
        origin: window.location.origin,
        username,
        password,
      });
    }
  });

  readMediaSession();
  if (navigator.mediaSession) {
    const props = ['metadata'];
    props.forEach((key) => {
      try {
        let current = navigator.mediaSession[key];
        Object.defineProperty(navigator.mediaSession, key, {
          configurable: true,
          get() {
            return current;
          },
          set(value) {
            current = value;
            readMediaSession();
          },
        });
      } catch {
        /* ignore */
      }
    });
  }

  document.addEventListener('play', () => readMediaSession(), true);
  document.addEventListener('pause', () => readMediaSession(), true);
  setInterval(readMediaSession, 4000);
});
