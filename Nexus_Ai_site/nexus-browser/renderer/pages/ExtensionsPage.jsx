import { useEffect, useState } from 'react';

const POPULAR = [
  { id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh', name: 'Dark Reader' },
  { id: 'ddkjiahejlhfcafbddmgiahcphecmpfh', name: 'uBlock Origin Lite' },
  { id: 'fmkadmapgofadopljbjfkapdkoienihi', name: 'React Developer Tools' },
];

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = () => window.nexusBrowser.extensions.list().then(setExtensions);

  useEffect(() => {
    refresh();
  }, []);

  const installPopular = async (id, name) => {
    setBusy(true);
    setMessage('');
    try {
      await window.nexusBrowser.extensions.installFromStore(id);
      setMessage(`${name} установлено`);
      await refresh();
    } catch (e) {
      setMessage(e.message || 'Ошибка установки');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="extensions-page">
      <h2>Расширения</h2>
      <p className="settings-desc">
        Установка из Chrome Web Store поддерживается для большинства популярных расширений.
        Полная совместимость не гарантируется — часть MV3 и enterprise-расширений может не работать.
      </p>

      <div className="extensions-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await window.nexusBrowser.extensions.openWebStore();
            } finally {
              setBusy(false);
            }
          }}
        >
          Открыть Chrome Web Store
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await window.nexusBrowser.extensions.pickAndLoad();
              await refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          Загрузить распакованное
        </button>
      </div>

      {message && <p className="extensions-message">{message}</p>}

      <h3>Рекомендуемые</h3>
      <div className="extensions-popular">
        {POPULAR.map((item) => (
          <button
            key={item.id}
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => installPopular(item.id, item.name)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <h3>Установленные</h3>
      {extensions.length === 0 ? (
        <p className="muted">Нет установленных расширений</p>
      ) : (
        <ul className="extensions-list">
          {extensions.map((ext) => (
            <li key={ext.id} className="extensions-row">
              <div>
                <strong>{ext.name}</strong>
                <span className="muted"> v{ext.version}</span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await window.nexusBrowser.extensions.remove(ext.id, ext.path);
                    await refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
