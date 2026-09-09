const STORAGE_KEY = 'nexus_installed_extensions';

/** Каталог расширений Nexus (как VS Code Marketplace — локальный каталог) */
export const EXTENSION_CATALOG = [
  {
    id: 'nexus.rest-client',
    name: 'REST Client',
    publisher: 'Nexus',
    description: 'Отправка HTTP-запросов из IDE (GET, POST, headers, body).',
    version: '1.0.0',
    icon: '🌐',
    downloads: '12k',
    rating: 4.8,
    category: 'Other',
    enablesView: 'api_client',
  },
  {
    id: 'nexus.sqlite',
    name: 'SQLite Viewer',
    publisher: 'Nexus',
    description: 'Просмотр таблиц и выполнение SQL к локальным .db файлам.',
    version: '1.0.0',
    icon: '🗄️',
    downloads: '8k',
    rating: 4.6,
    category: 'Data',
    enablesView: 'db',
  },
  {
    id: 'nexus.gitlens-lite',
    name: 'GitLens Lite',
    publisher: 'Nexus',
    description: 'Blame, история файла и улучшенный вид Source Control.',
    version: '0.9.0',
    icon: '🔀',
    downloads: '24k',
    rating: 4.9,
    category: 'SCM',
    enablesView: null,
  },
  {
    id: 'nexus.prettier',
    name: 'Prettier',
    publisher: 'Nexus',
    description: 'Форматирование JS/TS/JSON/CSS по сохранению.',
    version: '3.2.0',
    icon: '✨',
    downloads: '40k',
    rating: 4.7,
    category: 'Formatters',
    enablesView: null,
  },
  {
    id: 'nexus.python',
    name: 'Python',
    publisher: 'Nexus',
    description: 'Подсветка, snippets и запуск через терминал.',
    version: '2024.1.0',
    icon: '🐍',
    downloads: '55k',
    rating: 4.8,
    category: 'Programming',
    enablesView: null,
  },
  {
    id: 'nexus.theme-cursor',
    name: 'Cursor Dark Pro',
    publisher: 'Nexus',
    description: 'Тема оформления ближе к Cursor / VS Code Dark+.',
    version: '1.0.0',
    icon: '🎨',
    downloads: '18k',
    rating: 4.9,
    category: 'Themes',
    enablesView: null,
  },
  {
    id: 'nexus.eslint',
    name: 'ESLint',
    publisher: 'Nexus',
    description: 'Линтинг JavaScript/TypeScript в Problems.',
    version: '2.4.0',
    icon: '📋',
    downloads: '30k',
    rating: 4.5,
    category: 'Linters',
    enablesView: null,
  },
  {
    id: 'nexus.copilot-plus',
    name: 'Copilot Plus',
    publisher: 'Nexus',
    description: 'Доп. промпты и быстрые действия в панели ИИ.',
    version: '1.1.0',
    icon: '🤖',
    downloads: '9k',
    rating: 4.7,
    category: 'AI',
    enablesView: null,
  },
  {
    id: 'nexus.docker',
    name: 'Docker',
    publisher: 'Nexus',
    description: 'Управление контейнерами и compose из палитры команд.',
    version: '1.4.0',
    icon: '🐳',
    downloads: '22k',
    rating: 4.6,
    category: 'Other',
    enablesView: null,
  },
  {
    id: 'nexus.live-server',
    name: 'Live Server',
    publisher: 'Nexus',
    description: 'Локальный dev-сервер с автообновлением для HTML/CSS.',
    version: '5.7.0',
    icon: '📡',
    downloads: '35k',
    rating: 4.8,
    category: 'Other',
    enablesView: null,
  },
  {
    id: 'nexus.markdown',
    name: 'Markdown All in One',
    publisher: 'Nexus',
    description: 'Превью Markdown, TOC, горячие клавиши.',
    version: '3.6.0',
    icon: '📝',
    downloads: '28k',
    rating: 4.9,
    category: 'Other',
    enablesView: null,
  },
  {
    id: 'nexus.remote-ssh',
    name: 'Remote - SSH',
    publisher: 'Nexus',
    description: 'Подключение к удалённым хостам (планируется).',
    version: '0.1.0',
    icon: '🔐',
    downloads: '15k',
    rating: 4.4,
    category: 'Other',
    enablesView: null,
  },
];

/** Рекомендуемые при первом запуске (как VS Code) */
export const RECOMMENDED_EXTENSION_IDS = [
  'nexus.prettier',
  'nexus.eslint',
  'nexus.gitlens-lite',
  'nexus.theme-cursor',
];

export function getInstalledIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isInstalled(id) {
  return getInstalledIds().includes(id);
}

export function installExtension(id) {
  const ids = getInstalledIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent('nexus-extensions-changed'));
  }
}

export function uninstallExtension(id) {
  const ids = getInstalledIds().filter((x) => x !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent('nexus-extensions-changed'));
}

export function getEnabledViews() {
  const installed = getInstalledIds();
  const views = new Set();
  EXTENSION_CATALOG.forEach((ext) => {
    if (installed.includes(ext.id) && ext.enablesView) {
      views.add(ext.enablesView);
    }
  });
  return views;
}

export function extensionById(id) {
  return EXTENSION_CATALOG.find((e) => e.id === id);
}
