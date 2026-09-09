import { useState, useEffect } from 'react';
import BrandLogo from '../components/BrandLogo';
import { SHORTCUT_CATALOG } from '../lib/shortcuts';

const SECTIONS = [
  { id: 'account', label: 'Я и Nexus' },
  { id: 'homepage', label: 'Главная страница' },
  { id: 'search', label: 'Поисковая система' },
  { id: 'appearance', label: 'Внешний вид' },
  { id: 'personalization', label: 'Персонализация' },
  { id: 'tabs', label: 'Вкладки и окно' },
  { id: 'shortcuts', label: 'Горячие клавиши' },
  { id: 'shields', label: 'Nexus Shields' },
  { id: 'performance', label: 'Производительность' },
  { id: 'passwords', label: 'Пароли' },
  { id: 'sync', label: 'Синхронизация' },
  { id: 'extensions', label: 'Расширения' },
  { id: 'privacy', label: 'Конфиденциальность' },
  { id: 'downloads', label: 'Загрузки' },
  { id: 'about', label: 'О браузере' },
];

function newShortcutId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function SettingsPage({
  initialSection = 'search',
  settings,
  searchEngines,
  onUpdate,
  profile,
  authorized,
  syncStatus,
  onSignIn,
  onSignOut,
  onForceSync,
  remoteTabSession,
  onOpenRemoteTab,
  onRestoreRemoteSession,
  buildInfo,
  onClearHistory,
  onClearBrowsingData,
}) {
  const [section, setSection] = useState(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [passwords, setPasswords] = useState([]);
  const [showPasswordId, setShowPasswordId] = useState(null);
  const [extensions, setExtensions] = useState([]);

  useEffect(() => {
    if (section === 'passwords' && window.nexusBrowser.passwords?.list) {
      window.nexusBrowser.passwords.list().then(setPasswords);
    }
    if (section === 'extensions' && window.nexusBrowser.extensions?.list) {
      window.nexusBrowser.extensions.list().then(setExtensions);
    }
  }, [section]);

  const visibleSections = SECTIONS.filter((s) =>
    !filter || s.label.toLowerCase().includes(filter.toLowerCase())
  );

  const shortcuts = settings.ntpShortcuts || [];

  const addShortcut = () => {
    const name = newName.trim();
    let url = newUrl.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    onUpdate({ ntpShortcuts: [...shortcuts, { id: newShortcutId(), name, url }] });
    setNewName('');
    setNewUrl('');
  };

  const syncLabel = () => {
    if (!authorized) return 'Войдите в аккаунт Nexus для синхронизации';
    if (syncStatus?.state === 'syncing') return 'Синхронизация…';
    if (syncStatus?.state === 'error') return syncStatus.error || 'Ошибка синхронизации';
    if (syncStatus?.state === 'disabled') return 'Синхронизация отключена';
    if (syncStatus?.lastSyncAt) {
      return `Последняя синхронизация: ${new Date(syncStatus.lastSyncAt).toLocaleString('ru-RU')}`;
    }
    return 'Данные синхронизируются при входе через Google';
  };

  return (
    <div className="settings-page">
      <aside className="settings-sidebar">
        <h2>Настройки</h2>
        <input
          className="settings-search"
          placeholder="Поиск настроек"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <nav>
          {visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-nav-item ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="settings-content">
        {section === 'account' && (
          <section>
            <h3>Я и Nexus</h3>
            <p className="settings-desc">Аккаунт Nexus нужен для ИИ-ассистента и синхронизации настроек между устройствами.</p>
            {authorized ? (
              <div className="settings-card">
                <p><strong>{profile?.name || profile?.email}</strong></p>
                <p className="muted">{profile?.email}</p>
                <button type="button" className="btn btn-sm" onClick={onSignOut}>Выйти</button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onSignIn}>Войти через Google</button>
            )}
          </section>
        )}

        {section === 'homepage' && (
          <section>
            <h3>Главная страница</h3>
            <p className="settings-desc">Ярлыки отображаются под поиском на новой вкладке. Лимита нет — добавляйте сколько угодно.</p>
            <div className="settings-shortcut-list">
              {shortcuts.map((s) => (
                <div key={s.id} className="settings-shortcut-row">
                  <input
                    className="settings-input"
                    value={s.name}
                    onChange={(e) => onUpdate({
                      ntpShortcuts: shortcuts.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)),
                    })}
                  />
                  <input
                    className="settings-input"
                    value={s.url}
                    onChange={(e) => onUpdate({
                      ntpShortcuts: shortcuts.map((x) => (x.id === s.id ? { ...x, url: e.target.value } : x)),
                    })}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onUpdate({ ntpShortcuts: shortcuts.filter((x) => x.id !== s.id) })}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
            <h4>Добавить ярлык</h4>
            <div className="settings-shortcut-row">
              <input className="settings-input" placeholder="Название" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input className="settings-input" placeholder="https://..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
              <button type="button" className="btn btn-primary btn-sm" onClick={addShortcut}>Добавить</button>
            </div>
          </section>
        )}

        {section === 'search' && (
          <section>
            <h3>Поисковая система</h3>
            <p className="settings-desc">Выберите поисковик для адресной строки и новой вкладки.</p>
            <div className="settings-engine-list">
              {searchEngines.map((e) => (
                <label key={e.id} className={`settings-engine-option ${settings.searchEngine === e.id ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="searchEngine"
                    checked={settings.searchEngine === e.id}
                    onChange={() => onUpdate({ searchEngine: e.id })}
                  />
                  <span className="engine-icon">{e.icon}</span>
                  <span>{e.name}</span>
                </label>
              ))}
            </div>

            <h4>Режим omnibox</h4>
            <p className="settings-desc">Enter — открыть поисковик. Ctrl+Enter — ИИ-ответ (в гибридном режиме).</p>
            <select
              className="settings-select"
              value={settings.searchMode}
              onChange={(e) => onUpdate({ searchMode: e.target.value })}
            >
              <option value="classic">Классический — открывать страницу поисковика</option>
              <option value="ai">ИИ — ответ Nexus в оверлее</option>
              <option value="hybrid">Гибрид — Enter: поисковик, Ctrl+Enter: ИИ</option>
            </select>

            <h4>Домашняя страница</h4>
            <p className="settings-desc">Открывается по кнопке «Домой» в панели навигации.</p>
            <input
              className="settings-input"
              value={settings.homepage}
              onChange={(e) => onUpdate({ homepage: e.target.value })}
            />

            <h4>Новая вкладка</h4>
            <p className="settings-desc">Что показывать при открытии новой вкладки или при закрытии последней.</p>
            <select
              className="settings-select"
              value={settings.newTabPage}
              onChange={(e) => onUpdate({ newTabPage: e.target.value })}
            >
              <option value="newtab">Страница Nexus (новая вкладка)</option>
              <option value="homepage">Домашняя страница</option>
              <option value="blank">Пустая страница</option>
              <option value="custom">Свой URL</option>
            </select>
            {settings.newTabPage === 'custom' && (
              <input
                className="settings-input"
                placeholder="https://..."
                value={settings.newTabCustomUrl}
                onChange={(e) => onUpdate({ newTabCustomUrl: e.target.value })}
              />
            )}
          </section>
        )}

        {section === 'appearance' && (
          <section>
            <h3>Внешний вид</h3>
            <p className="settings-desc">Настройте тему и цвета интерфейса. По умолчанию — нейтральная чёрная или белая тема.</p>
            <label className="settings-row">
              <span>Тема</span>
              <select
                className="settings-select"
                value={settings.theme}
                onChange={(e) => onUpdate({ theme: e.target.value })}
              >
                <option value="dark">Тёмная (чёрная)</option>
                <option value="light">Светлая (белая)</option>
                <option value="system">Системная</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Цвет акцента</span>
              <input
                type="color"
                value={settings.accentColor || '#3b82f6'}
                onChange={(e) => onUpdate({ accentColor: e.target.value })}
              />
            </label>
            <label className="settings-row">
              <span>Размер шрифта</span>
              <select
                className="settings-select"
                value={settings.fontSize || 'medium'}
                onChange={(e) => onUpdate({ fontSize: e.target.value })}
              >
                <option value="small">Мелкий</option>
                <option value="medium">Средний</option>
                <option value="large">Крупный</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Ширина ИИ-панели (px)</span>
              <input
                type="number"
                className="settings-input settings-input-inline"
                min={280}
                max={600}
                value={settings.sidebarWidth || 380}
                onChange={(e) => onUpdate({ sidebarWidth: Number(e.target.value) || 380 })}
              />
            </label>
            <label className="settings-row">
              <span>ИИ-панель по умолчанию</span>
              <input
                type="checkbox"
                checked={settings.sidebarOpen}
                onChange={(e) => onUpdate({ sidebarOpen: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Панель закладок</span>
              <input
                type="checkbox"
                checked={settings.showBookmarksBar}
                onChange={(e) => onUpdate({ showBookmarksBar: e.target.checked })}
              />
            </label>
          </section>
        )}

        {section === 'personalization' && (
          <section>
            <h3>Персонализация</h3>
            <p className="settings-desc">Настройте внешний вид вкладок, панели инструментов и живые обои.</p>
            
            <h4>Форма вкладок</h4>
            <select
              className="settings-select"
              value={settings.tabShape || 'rounded'}
              onChange={(e) => onUpdate({ tabShape: e.target.value })}
            >
              <option value="rounded">Закруглённые (Nexus)</option>
              <option value="rectangular">Прямоугольные (Chrome)</option>
              <option value="compact">Компактные (Firefox)</option>
            </select>

            <h4>Расположение вкладок</h4>
            <select
              className="settings-select"
              value={settings.tabPosition || 'top'}
              onChange={(e) => onUpdate({ tabPosition: e.target.value })}
            >
              <option value="top">Сверху (Классическое)</option>
              <option value="side">Сбоку (Вертикальные вкладки)</option>
            </select>

            <h4>Панель инструментов</h4>
            <label className="settings-row">
              <span>Компактный режим панели</span>
              <input
                type="checkbox"
                checked={settings.compactMode}
                onChange={(e) => onUpdate({ compactMode: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Показывать кнопку «Домой»</span>
              <input
                type="checkbox"
                checked={settings.showHomeButton !== false}
                onChange={(e) => onUpdate({ showHomeButton: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Показывать кнопку «Загрузки»</span>
              <input
                type="checkbox"
                checked={settings.showDownloadsButton !== false}
                onChange={(e) => onUpdate({ showDownloadsButton: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Показывать кнопку «Закладки»</span>
              <input
                type="checkbox"
                checked={settings.showBookmarksButton !== false}
                onChange={(e) => onUpdate({ showBookmarksButton: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Показывать кнопку «История»</span>
              <input
                type="checkbox"
                checked={settings.showHistoryButton !== false}
                onChange={(e) => onUpdate({ showHistoryButton: e.target.checked })}
              />
            </label>

            <h4>Живые обои на Новой вкладке</h4>
            <label className="settings-row">
              <span>Тип обоев</span>
              <select
                className="settings-select"
                value={settings.wallpaperType || 'none'}
                onChange={(e) => onUpdate({ wallpaperType: e.target.value })}
              >
                <option value="none">Без обоев</option>
                <option value="image">Изображение</option>
                <option value="video">Видео (Живые обои)</option>
              </select>
            </label>
            {settings.wallpaperType !== 'none' && (
              <>
                <label className="settings-row">
                  <span>Файл обоев</span>
                  <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                    <input className="settings-input" style={{ maxWidth: 200 }} readOnly value={settings.wallpaperPath || 'Файл не выбран'} />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={async () => {
                        const file = await window.nexusBrowser.chrome.pickWallpaper();
                        if (file) onUpdate({ wallpaperPath: file });
                      }}
                    >
                      Выбрать...
                    </button>
                  </div>
                </label>
                <label className="settings-row">
                  <span>Размытие (Blur): {settings.wallpaperBlur || 0}px</span>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    value={settings.wallpaperBlur || 0}
                    onChange={(e) => onUpdate({ wallpaperBlur: Number(e.target.value) })}
                  />
                </label>
                <label className="settings-row">
                  <span>Яркость (Brightness): {settings.wallpaperBrightness ?? 100}%</span>
                  <input
                    type="range"
                    min={30}
                    max={150}
                    value={settings.wallpaperBrightness ?? 100}
                    onChange={(e) => onUpdate({ wallpaperBrightness: Number(e.target.value) })}
                  />
                </label>
                <label className="settings-row">
                  <span>Контраст (Contrast): {settings.wallpaperContrast ?? 100}%</span>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={settings.wallpaperContrast ?? 100}
                    onChange={(e) => onUpdate({ wallpaperContrast: Number(e.target.value) })}
                  />
                </label>
              </>
            )}
          </section>
        )}

        {section === 'tabs' && (
          <section>
            <h3>Вкладки и окно</h3>
            <p className="settings-desc">При закрытии последней вкладки автоматически открывается новая (как в Chrome).</p>
            <label className="settings-row">
              <span>Масштаб по умолчанию</span>
              <select
                className="settings-select"
                value={String(settings.defaultZoom || 1)}
                onChange={(e) => onUpdate({ defaultZoom: Number(e.target.value) })}
              >
                <option value="0.75">75%</option>
                <option value="0.9">90%</option>
                <option value="1">100%</option>
                <option value="1.1">110%</option>
                <option value="1.25">125%</option>
              </select>
            </label>
            <label className="settings-row">
              <span>Инструменты разработчика (F12)</span>
              <select
                className="settings-select"
                value={settings.devToolsMode || 'bottom'}
                onChange={(e) => onUpdate({ devToolsMode: e.target.value })}
              >
                <option value="bottom">Встроенные снизу</option>
                <option value="detach">Отдельное окно</option>
              </select>
            </label>
          </section>
        )}

        {section === 'shortcuts' && (
          <section>
            <h3>Горячие клавиши</h3>
            <p className="settings-desc">Стандартные сочетания клавиш Nexus Browser (как в Chrome).</p>
            <table className="shortcuts-table">
              <thead>
                <tr>
                  <th>Комбинация</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {SHORTCUT_CATALOG.map((row) => (
                  <tr key={row.keys}>
                    <td><kbd>{row.keys}</kbd></td>
                    <td>{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {section === 'shields' && (
          <section>
            <h3>Nexus Shields</h3>
            <p className="settings-desc">Защита от рекламы, трекеров и небезопасных соединений (Brave-style).</p>
            <label className="settings-row">
              <span>Щиты включены</span>
              <input
                type="checkbox"
                checked={settings.shieldsEnabled !== false}
                onChange={(e) => onUpdate({ shieldsEnabled: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Блокировать рекламу</span>
              <input
                type="checkbox"
                checked={settings.blockAds !== false}
                onChange={(e) => onUpdate({ blockAds: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Блокировать трекеры</span>
              <input
                type="checkbox"
                checked={settings.blockTrackers !== false}
                onChange={(e) => onUpdate({ blockTrackers: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>HTTPS-обновление</span>
              <input
                type="checkbox"
                checked={Boolean(settings.httpsUpgrade)}
                onChange={(e) => onUpdate({ httpsUpgrade: e.target.checked })}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => window.nexusBrowser.tabs.navigate(null, 'nexus://extensions')}
            >
              Управление расширениями
            </button>
          </section>
        )}

        {section === 'performance' && (
          <section>
            <h3>Производительность</h3>
            <p className="settings-desc">Оптимизируйте использование ресурсов вашего компьютера для ускорения работы браузера.</p>
            
            <label className="settings-row">
              <div>
                <span>Режим экономии памяти (Tab Discarding)</span>
                <p className="settings-desc muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                  Автоматически выгружает неактивные вкладки из памяти при простое. Состояние вкладки восстанавливается при переходе на неё.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.performanceMemorySaver !== false}
                onChange={(e) => onUpdate({ performanceMemorySaver: e.target.checked })}
              />
            </label>

            {settings.performanceMemorySaver !== false && (
              <label className="settings-row">
                <span>Время простоя до выгрузки</span>
                <select
                  className="settings-select"
                  value={String(settings.performanceMemorySaverTimeout || 15)}
                  onChange={(e) => onUpdate({ performanceMemorySaverTimeout: Number(e.target.value) })}
                >
                  <option value="1">1 минута</option>
                  <option value="5">5 минут</option>
                  <option value="15">15 минут</option>
                  <option value="30">30 минут</option>
                  <option value="60">1 час</option>
                </select>
              </label>
            )}

            <label className="settings-row">
              <span>Макс. активных вкладок в памяти (LRU)</span>
              <select
                className="settings-select"
                value={String(settings.performanceMaxLiveTabs || 5)}
                onChange={(e) => onUpdate({ performanceMaxLiveTabs: Number(e.target.value) })}
              >
                <option value="8">8</option>
                <option value="12">12 (рекомендуется)</option>
                <option value="16">16</option>
                <option value="24">24</option>
              </select>
            </label>
            <label className="settings-row">
              <div>
                <span>Экономия трафика</span>
                <p className="settings-desc muted" style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                  Блокирует загрузку изображений и медиа на фоновых вкладках.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(settings.performanceSaveData)}
                onChange={(e) => onUpdate({ performanceSaveData: e.target.checked })}
              />
            </label>
            <div style={{ marginTop: 20, padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 8 }}>
              <h4 style={{ margin: '0 0 8px 0' }}>Ограничение фоновых процессов (Background Throttling)</h4>
              <p className="settings-desc muted" style={{ margin: 0 }}>
                Nexus Browser автоматически ограничивает таймеры, анимации и выполнение JS-скриптов на фоновых вкладках. Это существенно снижает нагрузку на процессор и продлевает время работы ноутбука от батареи. Данная функция включена на уровне ядра.
              </p>
            </div>
          </section>
        )}

        {section === 'passwords' && (
          <section>
            <h3>Менеджер паролей</h3>
            <p className="settings-desc">Здесь вы можете управлять сохранёнными паролями для сайтов. Все пароли надёжно зашифрованы с помощью системного API.</p>
            {passwords.length === 0 ? (
              <p className="muted">Нет сохранённых паролей</p>
            ) : (
              <div className="settings-passwords-list">
                {passwords.map((p) => (
                  <div key={p.id} className="settings-password-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-glass)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.origin}</div>
                      <div className="muted" style={{ fontSize: 12 }}>Логин: {p.username}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type={showPasswordId === p.id ? 'text' : 'password'}
                        className="settings-input"
                        style={{ width: 140, background: 'rgba(0,0,0,0.1)', border: 'none', padding: '4px 8px', fontSize: 12 }}
                        readOnly
                        value={p.password}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => setShowPasswordId(showPasswordId === p.id ? null : p.id)}
                      >
                        {showPasswordId === p.id ? 'Скрыть' : 'Показать'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        style={{ padding: '4px 8px', fontSize: 11, background: '#ef4444', color: '#fff', border: 'none' }}
                        onClick={async () => {
                          if (confirm(`Удалить сохранённый пароль для ${p.origin}?`)) {
                            const updated = await window.nexusBrowser.passwords.remove(p.id);
                            setPasswords(updated);
                          }
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {section === 'sync' && (
          <section>
            <h3>Синхронизация</h3>
            <p className="settings-desc">
              Выберите способ синхронизации ваших настроек, закладок и истории между устройствами.
            </p>

            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <label className={`settings-engine-option ${settings.syncMethod !== 'secret-key' ? 'active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '12px' }}>
                <input
                  type="radio"
                  name="syncMethod"
                  checked={settings.syncMethod !== 'secret-key'}
                  onChange={() => onUpdate({ syncMethod: 'account' })}
                />
                <span>Аккаунт Nexus (Google)</span>
              </label>
              <label className={`settings-engine-option ${settings.syncMethod === 'secret-key' ? 'active' : ''}`} style={{ flex: 1, justifyContent: 'center', padding: '12px' }}>
                <input
                  type="radio"
                  name="syncMethod"
                  checked={settings.syncMethod === 'secret-key'}
                  onChange={() => onUpdate({ syncMethod: 'secret-key' })}
                />
                <span>Секретный код (Brave-style)</span>
              </label>
            </div>

            {settings.syncMethod !== 'secret-key' ? (
              <>
                <p className="settings-desc">{syncLabel()}</p>
                <label className="settings-row">
                  <span>Синхронизация включена</span>
                  <input
                    type="checkbox"
                    checked={settings.syncEnabled !== false}
                    onChange={(e) => onUpdate({ syncEnabled: e.target.checked })}
                    disabled={!authorized}
                  />
                </label>
                <label className="settings-row">
                  <span>История посещений</span>
                  <input
                    type="checkbox"
                    checked={settings.syncHistory !== false}
                    onChange={(e) => onUpdate({ syncHistory: e.target.checked })}
                    disabled={!authorized}
                  />
                </label>
                <label className="settings-row">
                  <span>ИИ-чаты по страницам</span>
                  <input
                    type="checkbox"
                    checked={settings.syncChats !== false}
                    onChange={(e) => onUpdate({ syncChats: e.target.checked })}
                    disabled={!authorized}
                  />
                </label>
                <label className="settings-row">
                  <span>Вкладки (снимок сессии)</span>
                  <input
                    type="checkbox"
                    checked={settings.syncTabs !== false}
                    onChange={(e) => onUpdate({ syncTabs: e.target.checked })}
                    disabled={!authorized}
                  />
                </label>
                <label className="settings-row">
                  <span>Восстанавливать вкладки при входе</span>
                  <input
                    type="checkbox"
                    checked={settings.restoreSessionOnLogin !== false}
                    onChange={(e) => onUpdate({ restoreSessionOnLogin: e.target.checked })}
                    disabled={!authorized}
                  />
                </label>
                <p className="settings-desc muted">
                  Загрузки, путь сохранения и cookies остаются только на этом устройстве.
                </p>
                {authorized && (
                  <button type="button" className="btn btn-primary" onClick={onForceSync}>
                    Синхронизировать сейчас
                  </button>
                )}
                {!authorized && (
                  <button type="button" className="btn btn-primary" onClick={onSignIn}>Войти через Google</button>
                )}
              </>
            ) : (
              <>
                <p className="settings-desc">
                  Синхронизация по секретному коду полностью анонимна и не требует создания аккаунта. Все данные шифруются локально на вашем устройстве с помощью сквозного шифрования (AES-256) перед отправкой в облако.
                </p>
                {!settings.syncSecretKey ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0' }}>Создать новую цепочку</h4>
                      <p className="settings-desc muted" style={{ margin: 0 }}>Создайте новую цепочку синхронизации и получите уникальный секретный код для подключения других устройств.</p>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ marginTop: 12 }}
                        onClick={() => {
                          const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
                          let key = '';
                          for (let i = 0; i < 24; i++) {
                            key += chars[Math.floor(Math.random() * chars.length)];
                          }
                          onUpdate({ syncSecretKey: key, syncEnabled: true });
                        }}
                      >
                        Создать цепочку
                      </button>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: 16 }}>
                      <h4 style={{ margin: '0 0 8px 0' }}>Присоединиться к существующей цепочке</h4>
                      <p className="settings-desc muted" style={{ margin: '0 0 12px 0' }}>Введите секретный код с другого устройства, чтобы объединить данные.</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          className="settings-input"
                          placeholder="Введите 24-значный секретный код"
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value.trim().toLowerCase())}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={inputKey.length !== 24}
                          onClick={async () => {
                            await onUpdate({ syncSecretKey: inputKey, syncEnabled: true });
                            setInputKey('');
                            onForceSync?.();
                          }}
                        >
                          Подключиться
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0' }}>Ваш секретный код синхронизации</h4>
                      <p className="settings-desc muted" style={{ margin: '0 0 12px 0' }}>Введите этот код на другом устройстве Nexus Browser, чтобы подключить его к этой цепочке.</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          className="settings-input"
                          readOnly
                          value={settings.syncSecretKey}
                          style={{ fontFamily: 'monospace', letterSpacing: 1, fontWeight: 'bold', textAlign: 'center', background: 'rgba(0,0,0,0.2)', color: 'var(--color-accent)' }}
                        />
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            navigator.clipboard.writeText(settings.syncSecretKey);
                            alert('Код скопирован в буфер обмена');
                          }}
                        >
                          Копировать
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-glass)', paddingTop: 16 }}>
                      <button type="button" className="btn btn-primary" onClick={onForceSync}>
                        Синхронизировать сейчас
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                        onClick={() => {
                          if (confirm('Выйти из этой цепочки синхронизации? Данные больше не будут синхронизироваться.')) {
                            onUpdate({ syncSecretKey: '', syncEnabled: false });
                          }
                        }}
                      >
                        Выйти из цепочки
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {settings.syncEnabled !== false && remoteTabSession?.tabs?.length > 0 && (
              <div className="remote-tabs-section">
                <h4>Вкладки с {remoteTabSession.deviceLabel || 'другого устройства'}</h4>
                <p className="settings-desc muted">
                  {remoteTabSession.updatedAt
                    ? `Обновлено: ${new Date(remoteTabSession.updatedAt).toLocaleString('ru-RU')}`
                    : null}
                </p>
                <ul className="remote-tabs-list">
                  {remoteTabSession.tabs.map((t) => (
                    <li key={t.url}>
                      <button type="button" className="remote-tab-link" onClick={() => onOpenRemoteTab?.(t.url)}>
                        {t.title || t.url}
                      </button>
                    </li>
                  ))}
                </ul>
                {onRestoreRemoteSession && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onRestoreRemoteSession(remoteTabSession.tabs, remoteTabSession.activeIndex)}
                  >
                    Восстановить все вкладки
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {section === 'extensions' && (
          <section>
            <h3>Расширения Chrome</h3>
            <p className="settings-desc">
              Установка из Chrome Web Store и распакованных расширений. Полная совместимость не гарантируется на Electron.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.nexusBrowser.tabs.navigate(null, 'nexus://extensions')}
              >
                Страница расширений
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => window.nexusBrowser.extensions.openWebStore()}
              >
                Chrome Web Store
              </button>
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginBottom: 20 }}
              onClick={async () => {
                try {
                  const ext = await window.nexusBrowser.extensions.pickAndLoad();
                  if (ext) {
                    const list = await window.nexusBrowser.extensions.list();
                    setExtensions(list);
                  }
                } catch (e) {
                  alert(e.message);
                }
              }}
            >
              Загрузить распакованное расширение
            </button>

            {extensions.length === 0 ? (
              <p className="settings-desc muted">Нет установленных расширений.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {extensions.map((ext) => (
                  <div
                    key={ext.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 8,
                      border: '1px solid var(--border-glass)',
                    }}
                  >
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {ext.name}
                        <span style={{ fontSize: '11px', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, color: 'var(--color-accent)' }}>
                          v{ext.version}
                        </span>
                      </h4>
                      <p className="settings-desc muted" style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
                        ID: <code style={{ color: 'var(--color-accent)' }}>{ext.id}</code>
                      </p>
                      <p className="settings-desc muted" style={{ margin: 0, fontSize: '11px' }}>
                        Путь: {ext.path}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', fontSize: '12px' }}
                      onClick={async () => {
                        if (confirm(`Удалить расширение "${ext.name}"?`)) {
                          await window.nexusBrowser.extensions.remove(ext.id, ext.path);
                          const list = await window.nexusBrowser.extensions.list();
                          setExtensions(list);
                        }
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {section === 'privacy' && (
          <section>
            <h3>Конфиденциальность</h3>
            <p className="settings-desc">Очистка истории удаляет список посещённых сайтов в браузере.</p>
            <button type="button" className="btn" onClick={onClearHistory}>Очистить историю</button>
            <p className="settings-desc" style={{ marginTop: 16 }}>Очистка cookies и кэша сбрасывает данные сайтов на этом устройстве.</p>
            <button type="button" className="btn" onClick={onClearBrowsingData}>
              Очистить cookies и кэш
            </button>
          </section>
        )}

        {section === 'downloads' && (
          <section>
            <h3>Загрузки</h3>
            <label className="settings-row">
              <span>Папка загрузок</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="settings-input" readOnly value={settings.downloadPath || 'Системная папка «Загрузки»'} />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    const folder = await window.nexusBrowser.downloads.pickFolder();
                    if (folder) onUpdate({ downloadPath: folder });
                  }}
                >
                  Изменить
                </button>
              </div>
            </label>
            <label className="settings-row">
              <span>Спрашивать куда сохранять</span>
              <input
                type="checkbox"
                checked={settings.askDownloadLocation}
                onChange={(e) => onUpdate({ askDownloadLocation: e.target.checked })}
              />
            </label>
          </section>
        )}

        {section === 'about' && (
          <section>
            <BrandLogo variant="full" className="settings-about-logo" imgClassName="settings-about-logo__img" alt="Nexus" />
            <h3>О браузере Nexus</h3>
            <p>Версия: <strong>{buildInfo?.version || __APP_VERSION__}</strong></p>
            {buildInfo?.buildStamp && <p className="muted">Сборка: {__BUILD_STAMP__}</p>}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => window.nexusBrowser.shell.openExternal('https://github.com/dabstebplay2-jpg/Nexus')}
            >
              GitHub
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
