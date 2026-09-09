/**
 * Web IDE Lite — maintenance mode only.
 * Primary product: Nexus IDE Desktop (nexus-desktop / VSCodium).
 * Do not extend toward Cursor parity here; use desktop + OpenVSX.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Editor, DiffEditor } from '@monaco-editor/react';
import { 
  FolderTree, Search, GitBranch, Settings, X, RefreshCw, Save, Check, Terminal, FileCode2, Sliders, AlertCircle, Sparkles, FolderOpen, Send, Trash2, FilePlus, FolderPlus, ChevronUp, ChevronDown, Globe, Database, User, History, Clock, Info, Puzzle, Play, Home, LayoutGrid
} from 'lucide-react';
import FileTreeNode from './components/FileTreeNode';
import TerminalArea from './components/TerminalArea';
import ExtensionsPanel from './components/ide/ExtensionsPanel';
import CommandPalette from './components/ide/CommandPalette';
import SidebarHeader from './components/ide/SidebarHeader';
import { getEnabledViews } from './lib/extensionsStore';
import TierPicker from './components/TierPicker';
import DailyLimitBar from './components/DailyLimitBar';
import AmbientBackground from './components/AmbientBackground';
import IdeCopilotPanel from './components/ide/IdeCopilotPanel';
import IdeVercelBanner from './components/ide/IdeVercelBanner';
import IdeWelcome from './components/ide/IdeWelcome';
import IdeOnboardingTour, { shouldShowIdeTour } from './components/ide/IdeOnboardingTour';
import IdeStatusBar from './components/ide/IdeStatusBar';
import IdeMobileDock from './components/ide/IdeMobileDock';
import IdeMobileTitlebar from './components/ide/mobile/IdeMobileTitlebar';
import IdeMobileMoreSheet from './components/ide/mobile/IdeMobileMoreSheet';
import IdeMobileBottomSheet from './components/ide/mobile/IdeMobileBottomSheet';
import IdeDialog from './components/ide/IdeDialog';
import { useBreakpoint } from './hooks/useBreakpoint';
import { fetchModels, pickDefaultModel } from './lib/chatApi';
import { normalizeBalance, formatBalanceUsd } from './lib/formatBalance';
import { resolveWorkspaceMode } from './lib/workspaceMode';
import {
  initDemoWorkspace,
  getDemoTree,
  getDemoRootPath,
  demoReadFile,
  demoWriteFile,
  demoCreateFile,
  demoCreateFolder,
  demoDelete,
  demoSearch,
  buildDemoContextForAI,
} from './lib/demoWorkspace';
import { runDemoIdeAgent } from './lib/ideDemoAgent';

import { API_BASE, IS_VERCEL_HOST } from './lib/api';
import { apiFetch } from './lib/apiClient';
import { useAuth } from './context/AuthContext';

function getLanguageFromPath(path) {
  const ext = path.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'py': return 'python';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'md': return 'markdown';
    default: return 'plaintext';
  }
}

function formatTreeForAI(node, depth = 0) {
  if (!node) return "";
  const indent = "  ".repeat(depth);
  let result = `${indent}${node.is_dir ? '📁' : '📄'} ${node.name}\n`;
  if (node.is_dir && node.children) {
    for (const child of node.children) {
      result += formatTreeForAI(child, depth + 1);
    }
  }
  return result;
}

function IdeApp({ embedded = false }) {
  const { isMobile } = useBreakpoint();
  const [activeTab, setActiveTab] = useState(IS_VERCEL_HOST ? 'ai' : 'explorer');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileTerminalOpen, setMobileTerminalOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(IS_VERCEL_HOST);
  const [showTour, setShowTour] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [bottomPanel, setBottomPanel] = useState('terminal');
  const [enabledViews, setEnabledViews] = useState(() => getEnabledViews());
  const [outputLog, setOutputLog] = useState('Nexus Pro IDE initialized.\n');
  const [problems] = useState([]);
  const [workspacePath, setWorkspacePath] = useState('C:\\nexus-ide');
  const [fileTree, setFileTree] = useState(null);
  const [error, setError] = useState(null);

  // Редактор, файлы и Diff-режим
  const [openFiles, setOpenFiles] = useState({});
  const [activeFilePath, setActiveFilePath] = useState(null);
  const [isDiffMode, setIsDiffMode] = useState(false); 

  // Ссылка на инстанс Monaco Editor для удаленного управления
  const editorRef = useRef(null);

  // Сворачивание и скрытие панелей интерфейса
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  const selectIdeTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsSidebarCollapsed(false);
        setMobileTerminalOpen(false);
      }
    },
    []
  );

  const closeMobileSidePanel = useCallback(() => {
    setIsSidebarCollapsed(true);
  }, []);

  const openNexusDrawer = useCallback(() => {
    window.dispatchEvent(new CustomEvent('nexus-open-drawer'));
  }, []);

  // Глобальный поиск
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Интеграция с Git (Staging & Commit)
  const [gitInfo, setGitInfo] = useState({ is_git: false, files: [], branch: 'None' });
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [gitLoading, setGitLoading] = useState(false);

  // Интеграция со встроенной СУБД SQLite
  const [dbPath, setDbPath] = useState('C:\\nexus-ide\\backend\\test.db');
  const [dbTables, setDbTables] = useState([]);
  const [dbQuery, setDbQuery] = useState('SELECT * FROM sqlite_master;');
  const [dbResponse, setDbResponse] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);

  // Настройки редактора
  const [editorFontSize, setEditorFontSize] = useState(13);
  const [showMinimap, setShowMinimap] = useState(true);

  // Состояние встроенного REST API Клиента
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiUrl, setApiUrl] = useState('');
  const [apiHeaders, setApiHeaders] = useState([{ key: 'Content-Type', value: 'application/json' }]);
  const [apiBody, setApiBody] = useState('');
  const [apiResponse, setApiResponse] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);

  const {
    authStatus,
    fetchProfile,
    fetchTransactions,
    logout: authLogout,
    openAuthModal,
    transactions,
    txLoading,
  } = useAuth();
  const [quotaRemainingUsd, setQuotaRemainingUsd] = useState(0.0);

  // Интерактивное верхнее меню (dropdowns и hover chains)
  const [activeMenu, setActiveMenu] = useState(null); // 'file' | 'edit' | 'selection' | 'view' | 'terminal' | 'help' | null
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [ideDialog, setIdeDialog] = useState(null);
  const closeIdeDialog = useCallback(() => setIdeDialog(null), []);
  const showIdeNotice = useCallback((title, message, tone = 'info') => {
    setIdeDialog({ type: 'notice', title, message, tone });
  }, []);

  // Интеграция с ИИ
  const [ideModels, setIdeModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('deepseek/deepseek-v4-flash');
  const [useFileContext, setUseFileContext] = useState(true);
  const [aiInput, setAiInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [lastPromptCost, setLastPromptCost] = useState(null);
  
  // Функция сохранения ссылки на инстанс редактора Monaco при его монтировании
  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    fetchProfile();
    if (authStatus.authorized) fetchTransactions();
  }, [activeTab, fetchProfile, fetchTransactions, authStatus.authorized]);

  useEffect(() => {
    if (!authStatus.authorized || !authStatus.profile) return;
    setQuotaRemainingUsd(
      normalizeBalance(
        authStatus.profile.monthly_remaining_usd ??
          authStatus.profile.daily_remaining_usd ??
          0
      )
    );
    (async () => {
      try {
        const mData = await fetchModels();
        const list = mData.models || [];
        setIdeModels(list);
        setSelectedModel((prev) => pickDefaultModel(list, prev));
      } catch {
        /* optional */
      }
    })();
  }, [authStatus.authorized, authStatus.profile?.email]);

  // Вызов нативного диалога выбора папок Windows через бэкенд
  const handleOpenFolderDialog = async () => {
    try {
      const res = await fetch(`${API_BASE}/workspace/select`, { method: 'POST' });
      if (!res.ok) throw new Error("Could not contact folder selection API");
      const data = await res.json();
      if (data.status === 'success' && data.path) {
        setWorkspacePath(data.path);
        loadWorkspaceWithPath(data.path);
      }
    } catch (err) {
      showIdeNotice('Не удалось открыть папку', err.message, 'error');
    }
  };

  const loadWorkspaceWithPath = async (path) => {
    try {
      setError(null);
      if (demoMode) {
        setFileTree(await getDemoTree());
        return;
      }
      const res = await fetch(`${API_BASE}/files/tree?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error('Workspace not found');
      const data = await res.json();
      setFileTree(data);
      updateGitStatusWithPath(path);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadWorkspace = () => {
    loadWorkspaceWithPath(workspacePath);
  };

  const updateGitStatusWithPath = async (path) => {
    try {
      const res = await fetch(`${API_BASE}/git/status?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setGitInfo(data);
      }
    } catch (err) {
      console.error('Git status error:', err);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      if (demoMode) {
        setSearchResults(await demoSearch(searchQuery));
      } else {
        const res = await fetch(
          `${API_BASE}/search?query=${encodeURIComponent(searchQuery)}&path=${encodeURIComponent(workspacePath)}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const mode = await resolveWorkspaceMode();
      const isDemo = mode === 'demo';
      setDemoMode(isDemo);
      if (isDemo) {
        await initDemoWorkspace();
        setFileTree(await getDemoTree());
        setWorkspacePath(getDemoRootPath());
        if (shouldShowIdeTour()) setShowTour(true);
        const readmePath = `${getDemoRootPath()}/README.md`;
        try {
          const data = await demoReadFile(readmePath);
          setOpenFiles({
            [readmePath]: {
              path: readmePath,
              name: 'README.md',
              originalContent: data.content,
              currentContent: data.content,
              isDirty: false,
            },
          });
          setActiveFilePath(readmePath);
        } catch {
          /* optional */
        }
      } else {
        loadWorkspace();
      }
    })();
  }, []);

  const handleFileSelect = async (path, { throwOnError = false } = {}) => {
    if (openFiles[path]) {
      setActiveFilePath(path);
      return;
    }

    try {
      const data = demoMode
        ? await demoReadFile(path)
        : await (async () => {
            const res = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
            if (!res.ok) throw new Error('Could not read file');
            return res.json();
          })();
      const name = path.split(/[/\\]/).pop();

      setOpenFiles((prev) => ({
        ...prev,
        [path]: {
          path,
          name,
          originalContent: data.content,
          currentContent: data.content,
          isDirty: false,
        }
      }));
      setActiveFilePath(path);
    } catch (err) {
      if (throwOnError) throw err;
      showIdeNotice('Не удалось открыть файл', err.message, 'error');
    }
  };

  const handleCloseFile = (path, e) => {
    if (e) e.stopPropagation();
    const openPaths = Object.keys(openFiles);
    const updated = { ...openFiles };
    delete updated[path];
    setOpenFiles(updated);

    if (activeFilePath === path) {
      const remaining = openPaths.filter((p) => p !== path);
      if (remaining.length > 0) {
        setActiveFilePath(remaining[remaining.length - 1]);
      } else {
        setActiveFilePath(null);
      }
    }
  };

  const handleEditorChange = (value) => {
    if (!activeFilePath) return;
    setOpenFiles((prev) => {
      const file = prev[activeFilePath];
      const isDirty = (value ?? '') !== file.originalContent;
      return {
        ...prev,
        [activeFilePath]: {
          ...file,
          currentContent: value ?? '',
          isDirty,
        }
      };
    });
  };

  const handleSaveActiveFile = async () => {
    if (!activeFilePath) return;
    const file = openFiles[activeFilePath];
    if (!file.isDirty) return;

    try {
      if (demoMode) {
        await demoWriteFile(file.path, file.currentContent);
      } else {
        const res = await fetch(`${API_BASE}/files/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: file.path, content: file.currentContent }),
        });
        if (!res.ok) throw new Error('Failed to write');
      }

      setOpenFiles((prev) => ({
        ...prev,
        [activeFilePath]: {
          ...file,
          originalContent: file.currentContent,
          isDirty: false,
        }
      }));
      updateGitStatusWithPath(workspacePath);
    } catch (err) {
      showIdeNotice('Не удалось сохранить файл', err.message, 'error');
    }
  };

  const refreshOpenFiles = async () => {
    const paths = Object.keys(openFiles);
    if (paths.length === 0) return;
    const updated = { ...openFiles };
    for (const path of paths) {
      try {
        const data = demoMode
          ? await demoReadFile(path)
          : await (async () => {
              const res = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
              if (!res.ok) return null;
              return res.json();
            })();
        if (data?.content != null) {
          updated[path] = {
            ...updated[path],
            originalContent: data.content,
            currentContent: data.content,
            isDirty: false,
          };
        }
      } catch (e) {
        console.error('Failed to sync file content:', e);
      }
    }
    setOpenFiles(updated);
  };

  const createFile = async (fileName) => {
    let parentPath = workspacePath;
    if (activeFilePath) {
      const sep = activeFilePath.includes('/') ? '/' : '\\';
      parentPath = activeFilePath.substring(0, activeFilePath.lastIndexOf(sep));
    }

    try {
      let data;
      if (demoMode) {
        data = await demoCreateFile(parentPath, fileName);
      } else {
        const res = await fetch(`${API_BASE}/files/create_file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_path: parentPath, name: fileName }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Failed to create file');
        }
        data = await res.json();
      }
      loadWorkspace();
      await handleFileSelect(data.path, { throwOnError: true });
    } catch (error) {
      throw new Error(error.message || 'Не удалось создать файл');
    }
  };

  // Создание файла через интерфейс Nexus без системного prompt.
  const handleCreateFileUI = () => {
    setIdeDialog({
      type: 'prompt',
      title: 'Новый файл',
      message: 'Файл будет создан в текущей папке проекта.',
      inputLabel: 'Имя файла',
      placeholder: 'например, app.js',
      confirmLabel: 'Создать файл',
      onConfirm: createFile,
    });
  };

  const createFolder = async (folderName) => {
    let parentPath = workspacePath;
    if (activeFilePath) {
      const sep = activeFilePath.includes('/') ? '/' : '\\';
      parentPath = activeFilePath.substring(0, activeFilePath.lastIndexOf(sep));
    }

    try {
      if (demoMode) {
        await demoCreateFolder(parentPath, folderName);
        loadWorkspace();
        return;
      }
      const res = await fetch(`${API_BASE}/files/create_folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_path: parentPath, name: folderName })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create folder");
      }
      loadWorkspace();
    } catch (error) {
      throw new Error(error.message || 'Не удалось создать папку');
    }
  };

  // Создание папки через интерфейс Nexus без системного prompt.
  const handleCreateFolderUI = () => {
    setIdeDialog({
      type: 'prompt',
      title: 'Новая папка',
      message: 'Папка будет создана рядом с выбранным файлом.',
      inputLabel: 'Имя папки',
      placeholder: 'например, components',
      confirmLabel: 'Создать папку',
      onConfirm: createFolder,
    });
  };

  // Удаление выделенного элемента через UI
  const handleDeleteItemUI = async () => {
    if (!activeFilePath) {
      showIdeNotice('Нечего удалять', 'Сначала выберите файл в проводнике или откройте его в редакторе.');
      return;
    }
    const fileName = activeFilePath.split(/[/\\]/).pop();
    const pathToDelete = activeFilePath;
    setIdeDialog({
      type: 'confirm',
      tone: 'danger',
      title: 'Удалить файл?',
      message: `«${fileName}» будет удалён без возможности восстановления.`,
      confirmLabel: 'Удалить',
      onConfirm: async () => {
        if (demoMode) {
          await demoDelete(pathToDelete);
        } else {
          const res = await fetch(`${API_BASE}/files/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: pathToDelete }),
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Не удалось удалить файл');
          }
        }
        setOpenFiles((current) => {
          const updated = { ...current };
          delete updated[pathToDelete];
          return updated;
        });
        setActiveFilePath(null);
        loadWorkspace();
      },
    });
  };

  // Выполнение HTTP-запроса через встроенный API-клиент
  const handleSendAPIRequest = async (e) => {
    e.preventDefault();
    if (!apiUrl.trim() || apiLoading) return;
    setApiLoading(true);
    setApiResponse(null);

    const headersObj = {};
    apiHeaders.forEach(h => {
      if (h.key.trim()) {
        headersObj[h.key] = h.value;
      }
    });

    try {
      const res = await fetch(`${API_BASE}/tools/http_request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: apiMethod,
          url: apiUrl,
          headers: headersObj,
          body: apiMethod !== 'GET' ? apiBody : ''
        })
      });

      if (!res.ok) throw new Error("REST client proxy call failed");
      const data = await res.json();
      setApiResponse(data);
    } catch (err) {
      setApiResponse({ status: 'error', message: err.message });
    } finally {
      setApiLoading(false);
    }
  };

  const handleAddHeaderRow = () => {
    setApiHeaders([...apiHeaders, { key: '', value: '' }]);
  };
  const handleRemoveHeaderRow = (idx) => {
    setApiHeaders(apiHeaders.filter((_, i) => i !== idx));
  };
  const handleHeaderChange = (idx, field, val) => {
    const updated = [...apiHeaders];
    updated[idx][field] = val;
    setApiHeaders(updated);
  };

  // Индексация и коммит изменений в Git
  const handleGitCommit = async (e) => {
    e.preventDefault();
    if (!gitCommitMessage.trim() || gitLoading) return;
    setGitLoading(true);
    try {
      const res = await fetch(`${API_BASE}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, message: gitCommitMessage })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setGitCommitMessage('');
        updateGitStatusWithPath(workspacePath);
        showIdeNotice('Коммит создан', data.output || 'Изменения успешно сохранены в Git.', 'success');
      } else {
        showIdeNotice('Не удалось создать коммит', data.message || 'Git вернул ошибку.', 'error');
      }
    } catch (err) {
      showIdeNotice('Ошибка Git', err.message, 'error');
    } finally {
      setGitLoading(false);
    }
  };

  // Отправка коммитов в удаленный репозиторий (git push)
  const handleGitPush = async () => {
    if (gitLoading) return;
    setGitLoading(true);
    try {
      const res = await fetch(`${API_BASE}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath })
      });
      const data = await res.json();
      if (data.status === 'success') {
        showIdeNotice('Изменения отправлены', data.output || 'Удалённый репозиторий обновлён.', 'success');
      } else {
        showIdeNotice('Не удалось отправить изменения', data.message || 'Git вернул ошибку.', 'error');
      }
    } catch (err) {
      showIdeNotice('Ошибка Git', err.message, 'error');
    } finally {
      setGitLoading(false);
    }
  };

  // Подключение к SQLite БД и чтение таблиц
  const handleConnectDatabase = async () => {
    if (!dbPath.trim() || dbLoading) return;
    setDbLoading(true);
    try {
      const res = await fetch(`${API_BASE}/db/schema?path=${encodeURIComponent(dbPath)}`);
      if (!res.ok) throw new Error("Could not connect to database file");
      const data = await res.json();
      if (data.status === 'success') {
        setDbTables(data.tables);
        setDbResponse({ status: 'success', message: "Successfully connected. Loaded " + data.tables.length + " tables." });
      }
    } catch (err) {
      showIdeNotice('Не удалось открыть базу', err.message, 'error');
      setDbTables([]);
    } finally {
      setDbLoading(false);
    }
  };

  // Выполнение SQL-запроса к SQLite
  const handleRunSQLQuery = async (e) => {
    e.preventDefault();
    if (!dbQuery.trim() || dbLoading) return;
    setDbLoading(true);
    try {
      const res = await fetch(`${API_BASE}/db/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dbPath, query: dbQuery })
      });
      const data = await res.json();
      setDbResponse(data);
      if (data.status === 'success' && data.type !== 'select') {
        handleConnectDatabase();
      }
    } catch (err) {
      setDbResponse({ status: 'error', message: err.message });
    } finally {
      setDbLoading(false);
    }
  };

  // Отправка промпта ИИ-ассистенту через облако
  const handleAISendMessage = async (e, overrideText) => {
    e?.preventDefault();
    const text = (overrideText ?? aiInput).trim();
    if (!text || aiLoading) return;

    if (!authStatus.authorized) {
      setActiveTab('profile');
      openAuthModal();
      return;
    }

    const userMessage = { role: 'user', content: text };
    setChatHistory((prev) => [...prev, userMessage]);
    setAiInput('');
    setAiLoading(true);
    setLastPromptCost(null);

    const activeFileContext = (useFileContext && activeFilePath && openFiles[activeFilePath]) 
      ? openFiles[activeFilePath].currentContent 
      : "";

    const directoryContext = demoMode
      ? await buildDemoContextForAI(fileTree, formatTreeForAI)
      : fileTree
        ? formatTreeForAI(fileTree)
        : '';

    try {
      let data;
      if (demoMode) {
        data = await runDemoIdeAgent({
          model: selectedModel,
          workspacePath,
          directoryContext,
          fileContext: activeFileContext,
          chatHistory,
          userPrompt: userMessage.content,
        });
        if (data.status === 'quota') {
          setChatHistory((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                'Пул ИИ исчерпан. Пополните баланс или продлите подписку в разделе «Тарифы» (Account → тарифы).',
            },
          ]);
          return;
        }
        data = { status: 'success', reply: data.reply, actions: data.actions, billing: data.billing };
      } else {
        const res = await fetch(`${API_BASE}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userMessage.content,
            workspace_path: workspacePath,
            file_context: activeFileContext,
            directory_context: directoryContext,
            chat_history: chatHistory,
            model: selectedModel,
          }),
        });

        if (res.status === 402 || res.status === 429) {
          const errData = await res.json().catch(() => ({}));
          const detail =
            typeof errData.detail === 'string'
              ? errData.detail
              : 'Месячный пул ИИ исчерпан. Продлите подписку или пополните баланс в разделе «Тарифы».';
          setChatHistory((prev) => [...prev, { role: 'assistant', content: detail }]);
          return;
        }
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'AI Agent request failed');
        }
        data = await res.json();
      }

      if (data.status === 'success') {
        setChatHistory((prev) => [...prev, { role: 'assistant', content: data.reply }]);

        if (data.billing) {
          const rem = data.billing.daily?.remaining_usd ?? data.billing.remaining_usd;
          if (rem != null) setQuotaRemainingUsd(normalizeBalance(rem));
          setLastPromptCost(data.billing.deducted_usd);
        }

        if (data.actions?.length) {
          for (const action of data.actions) {
            if (action.type === 'open_file') {
              handleFileSelect(action.path);
            }
          }
        }

        await refreshOpenFiles();
        loadWorkspaceWithPath(workspacePath);
      } else {
        setChatHistory((prev) => [...prev, { role: 'assistant', content: `Error: ${data.message}` }]);
      }
    } catch (err) {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: `Error communicating with model: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Метод удаленного триггера встроенных экшенов Monaco Editor
  const triggerMonacoAction = (actionId) => {
    if (editorRef.current) {
      editorRef.current.focus();
      editorRef.current.trigger('menubar', actionId);
    }
    setMenuOpen(false);
    setActiveMenu(null);
  };

  // Настройка глобальных хоткеев клавиатуры в React
  useEffect(() => {
    const syncExt = () => setEnabledViews(getEnabledViews());
    window.addEventListener('nexus-extensions-changed', syncExt);
    return () => window.removeEventListener('nexus-extensions-changed', syncExt);
  }, []);

  const appendOutput = useCallback((line) => {
    setOutputLog((prev) => prev + line + '\n');
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('nexus_from_chat')) {
        sessionStorage.removeItem('nexus_from_chat');
        appendOutput('Открыто из чата Nexus — Copilot и workspace готовы.');
        setBottomPanel('output');
      }
    } catch {
      /* ignore */
    }
  }, [appendOutput]);

  useEffect(() => {
    if (activeTab === 'api_client' && !enabledViews.has('api_client')) {
      setActiveTab('extensions');
      appendOutput('Install "REST Client" from Extensions (Ctrl+Shift+X).');
      setBottomPanel('output');
    }
    if (activeTab === 'db' && !enabledViews.has('db')) {
      setActiveTab('extensions');
      appendOutput('Install "SQLite Viewer" from Extensions.');
      setBottomPanel('output');
    }
  }, [activeTab, enabledViews, appendOutput]);

  const commandHandlersRef = useRef({});
  commandHandlersRef.current = {
    handleOpenFolderDialog,
    handleSaveActiveFile,
    handleCreateFileUI,
    setCommandPaletteOpen,
    setIsSidebarCollapsed,
    setIsTerminalCollapsed,
    setBottomPanel,
    setActiveTab,
  };

  const commandList = useMemo(
    () => {
      const h = () => commandHandlersRef.current;
      return [
        { id: 'palette', category: 'View', label: 'Show Command Palette', keys: 'Ctrl+Shift+P', run: () => h().setCommandPaletteOpen(true) },
        { id: 'file.openFolder', category: 'File', label: 'Open Folder...', keys: 'Ctrl+K Ctrl+O', run: () => h().handleOpenFolderDialog() },
        { id: 'file.save', category: 'File', label: 'Save', keys: 'Ctrl+S', run: () => h().handleSaveActiveFile() },
        { id: 'file.new', category: 'File', label: 'New File', keys: 'Ctrl+N', run: () => h().handleCreateFileUI() },
        { id: 'view.sidebar', category: 'View', label: 'Toggle Sidebar', keys: 'Ctrl+B', run: () => h().setIsSidebarCollapsed((p) => !p) },
        { id: 'view.terminal', category: 'View', label: 'Toggle Terminal', keys: 'Ctrl+`', run: () => { h().setIsTerminalCollapsed((p) => !p); h().setBottomPanel('terminal'); } },
        { id: 'view.explorer', category: 'View', label: 'Show Explorer', run: () => h().setActiveTab('explorer') },
        { id: 'view.search', category: 'View', label: 'Show Search', run: () => h().setActiveTab('search') },
        { id: 'view.scm', category: 'View', label: 'Show Source Control', run: () => h().setActiveTab('git') },
        { id: 'view.extensions', category: 'View', label: 'Show Extensions', run: () => h().setActiveTab('extensions') },
        { id: 'view.copilot', category: 'View', label: 'Show Copilot', run: () => h().setActiveTab('ai') },
        { id: 'go.settings', category: 'Preferences', label: 'Open Settings', run: () => h().setActiveTab('settings') },
        { id: 'account.profile', category: 'Account', label: 'Nexus Account', run: () => h().setActiveTab('profile') },
      ];
    },
    [activeFilePath, openFiles]
  );

  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setIsTerminalCollapsed((prev) => !prev);
        setBottomPanel('terminal');
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveActiveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath, openFiles]);

  const activeFile = activeFilePath ? openFiles[activeFilePath] : null;

  // Логика переключения меню по ховеру (Hover Chain)
  const handleMenuHeaderHover = (menuKey) => {
    if (menuOpen) {
      setActiveMenu(menuKey);
    }
  };

  const handleMenuHeaderClick = (menuKey) => {
    if (menuOpen && activeMenu === menuKey) {
      setMenuOpen(false);
      setActiveMenu(null);
    } else {
      setMenuOpen(true);
      setActiveMenu(menuKey);
    }
  };

  const handleCloseDropdowns = () => {
    setMenuOpen(false);
    setActiveMenu(null);
  };

  const ActivityBtn = ({ tab, title, icon: Icon, badge }) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      className={`ide-activity-btn w-full h-12 flex items-center justify-center relative text-[var(--ide-muted)] hover:text-[var(--ide-fg)] transition-colors ${
        activeTab === tab ? 'ide-activity-btn--active' : ''
      }`}
      title={title}
    >
      <Icon size={22} strokeWidth={1.5} />
      {badge}
    </button>
  );

  return (
    <div
      className={`ide-shell flex flex-col overflow-hidden font-sans antialiased relative ${
        embedded ? 'h-full min-h-0 flex-1' : 'nx-h-dvh'
      }`}
    >
      <AmbientBackground focus="composer" />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commandList}
      />
      <IdeDialog dialog={ideDialog} onClose={closeIdeDialog} />
      
      {/* Backdrop клика для плавного закрытия меню */}
      {menuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-transparent" 
          onClick={handleCloseDropdowns} 
        />
      )}

      <IdeVercelBanner demoMode={demoMode} />
      {showTour && (
        <IdeOnboardingTour onGoToTab={setActiveTab} onClose={() => setShowTour(false)} />
      )}

      <IdeMobileTitlebar
        onOpenNav={openNexusDrawer}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenAccount={() => selectIdeTab('profile')}
      />

      {/* Top Header & Professional Application Menubar — desktop */}
      <header className="hidden md:flex ide-titlebar items-center justify-between px-2 h-[36px] select-none shrink-0 relative z-50 text-[var(--ide-fg)]">
        <div className="flex items-center gap-2">
          {!embedded && (
            <>
              <Link to="/" className="flex items-center gap-1.5 px-2 hover:bg-[var(--ide-hover)] rounded-lg h-[26px] text-[11px]" title="Чат">
                <Home size={14} />
                <span className="hidden sm:inline">Чат</span>
              </Link>
              <Link to="/spaces" className="px-2 hover:bg-[var(--ide-hover)] rounded-lg h-[26px] text-[11px] hidden md:inline" title="Пространства">
                Пространства
              </Link>
              <Link to="/profile" className="px-2 hover:bg-[var(--ide-hover)] rounded-lg h-[26px] text-[11px]" title="Профиль">
                Профиль
              </Link>
            </>
          )}
          <div className="flex items-center gap-1.5 px-2 border-l border-[var(--ide-border)]">
            <span className="text-[10px] font-black text-teal-400">NX</span>
            <span className="text-[12px] font-medium">IDE</span>
          </div>
          
          {/* Навигационное выпадающее интерактивное меню */}
          <nav className="flex items-center gap-1 text-xs text-[#a1a1aa] relative">
            
            {/* FILE DROPDOWN */}
            <div className="relative">
              <button
                onClick={() => handleMenuHeaderClick('file')}
                onMouseEnter={() => handleMenuHeaderHover('file')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeMenu === 'file' ? 'bg-[#2d2d30] text-white' : 'hover:bg-[#2d2d30] hover:text-white'
                }`}
              >
                File
              </button>
              {menuOpen && activeMenu === 'file' && (
                <div className="absolute left-0 mt-1 w-52 bg-[#1e1e24] border border-[#2d2d30] rounded shadow-2xl py-1 z-50 font-medium">
                  <button 
                    onClick={() => { handleCreateFileUI(); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>New File</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+N</span>
                  </button>
                  <button 
                    onClick={() => { handleCreateFolderUI(); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>New Folder</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+Shift+N</span>
                  </button>
                  <button 
                    onClick={() => { handleOpenFolderDialog(); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center border-b border-[#2d2d30] pb-2"
                  >
                    <span>Open Folder...</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+K Ctrl+O</span>
                  </button>
                  <button 
                    onClick={() => { handleSaveActiveFile(); handleCloseDropdowns(); }}
                    disabled={!activeFile || !activeFile.isDirty}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center pt-2"
                  >
                    <span>Save Changes</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+S</span>
                  </button>
                  <button 
                    onClick={() => { if (activeFilePath) handleCloseFile(activeFilePath); handleCloseDropdowns(); }}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Close File</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+W</span>
                  </button>
                </div>
              )}
            </div>

            {/* EDIT DROPDOWN */}
            <div className="relative">
              <button
                onClick={() => handleMenuHeaderClick('edit')}
                onMouseEnter={() => handleMenuHeaderHover('edit')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeMenu === 'edit' ? 'bg-[#2d2d30] text-white' : 'hover:bg-[#2d2d30] hover:text-white'
                }`}
              >
                Edit
              </button>
              {menuOpen && activeMenu === 'edit' && (
                <div className="absolute left-0 mt-1 w-48 bg-[#1e1e24] border border-[#2d2d30] rounded shadow-2xl py-1 z-50 font-medium">
                  <button 
                    onClick={() => triggerMonacoAction('undo')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Undo</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+Z</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('redo')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center border-b border-[#2d2d30] pb-2"
                  >
                    <span>Redo</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+Y</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.clipboardCutAction')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center pt-2"
                  >
                    <span>Cut</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+X</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.clipboardCopyAction')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Copy</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+C</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.clipboardPasteAction')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center border-b border-[#2d2d30] pb-2"
                  >
                    <span>Paste</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+V</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('actions.find')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center pt-2"
                  >
                    <span>Find</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+F</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.startFindReplaceAction')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Replace</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+H</span>
                  </button>
                </div>
              )}
            </div>

            {/* SELECTION DROPDOWN */}
            <div className="relative">
              <button
                onClick={() => handleMenuHeaderClick('selection')}
                onMouseEnter={() => handleMenuHeaderHover('selection')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeMenu === 'selection' ? 'bg-[#2d2d30] text-white' : 'hover:bg-[#2d2d30] hover:text-white'
                }`}
              >
                Selection
              </button>
              {menuOpen && activeMenu === 'selection' && (
                <div className="absolute left-0 mt-1 w-56 bg-[#1e1e24] border border-[#2d2d30] rounded shadow-2xl py-1 z-50 font-medium">
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.selectAll')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Select All</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+A</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.commentLine')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Toggle Line Comment</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+/</span>
                  </button>
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.formatDocument')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Format Document</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Shift+Alt+F</span>
                  </button>
                </div>
              )}
            </div>

            {/* VIEW DROPDOWN */}
            <div className="relative">
              <button
                onClick={() => handleMenuHeaderClick('view')}
                onMouseEnter={() => handleMenuHeaderHover('view')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeMenu === 'view' ? 'bg-[#2d2d30] text-white' : 'hover:bg-[#2d2d30] hover:text-white'
                }`}
              >
                View
              </button>
              {menuOpen && activeMenu === 'view' && (
                <div className="absolute left-0 mt-1 w-52 bg-[#252526] border border-[#3c3c3c] rounded shadow-2xl py-1 z-50 font-medium">
                  <button 
                    onClick={() => { setIsSidebarCollapsed(!isSidebarCollapsed); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Toggle Sidebar</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+B</span>
                  </button>
                  <button 
                    onClick={() => { setIsTerminalCollapsed(!isTerminalCollapsed); setBottomPanel('terminal'); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Toggle Terminal</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+`</span>
                  </button>
                  <button 
                    onClick={() => { setActiveTab('extensions'); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Extensions</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+Shift+X</span>
                  </button>
                  <button 
                    onClick={() => { setCommandPaletteOpen(true); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center border-b border-[#3c3c3c] pb-2"
                  >
                    <span>Command Palette</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+Shift+P</span>
                  </button>
                  <button 
                    onClick={() => { setShowMinimap(!showMinimap); handleCloseDropdowns(); }}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center pt-2"
                  >
                    <span>Toggle Minimap</span>
                  </button>
                  <button 
                    onClick={() => { setEditorFontSize(prev => Math.min(24, prev + 1)); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Zoom In</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+=</span>
                  </button>
                  <button 
                    onClick={() => { setEditorFontSize(prev => Math.max(10, prev - 1)); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Zoom Out</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+-</span>
                  </button>
                  <button 
                    onClick={() => { setEditorFontSize(13); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Reset Zoom</span>
                  </button>
                </div>
              )}
            </div>

            {/* TERMINAL DROPDOWN */}
            <div className="relative">
              <button
                onClick={() => handleMenuHeaderClick('terminal')}
                onMouseEnter={() => handleMenuHeaderHover('terminal')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeMenu === 'terminal' ? 'bg-[#2d2d30] text-white' : 'hover:bg-[#2d2d30] hover:text-white'
                }`}
              >
                Terminal
              </button>
              {menuOpen && activeMenu === 'terminal' && (
                <div className="absolute left-0 mt-1 w-52 bg-[#1e1e24] border border-[#2d2d30] rounded shadow-2xl py-1 z-50 font-medium">
                  <button 
                    onClick={() => {
                      const event = new CustomEvent('clear_terminal');
                      window.dispatchEvent(event);
                      handleCloseDropdowns();
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8]"
                  >
                    Clear Terminal Output
                  </button>
                </div>
              )}
            </div>

            {/* HELP DROPDOWN */}
            <div className="relative">
              <button
                onClick={() => handleMenuHeaderClick('help')}
                onMouseEnter={() => handleMenuHeaderHover('help')}
                className={`px-3 py-1 rounded transition-colors ${
                  activeMenu === 'help' ? 'bg-[#2d2d30] text-white' : 'hover:bg-[#2d2d30] hover:text-white'
                }`}
              >
                Help
              </button>
              {menuOpen && activeMenu === 'help' && (
                <div className="absolute left-0 mt-1 w-56 bg-[#1e1e24] border border-[#2d2d30] rounded shadow-2xl py-1 z-50 font-medium">
                  <button 
                    onClick={() => triggerMonacoAction('editor.action.quickCommand')}
                    disabled={!activeFilePath}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] disabled:hover:bg-transparent disabled:opacity-40 text-left text-[11px] text-[#d4d4d8] flex justify-between items-center"
                  >
                    <span>Command Palette...</span>
                    <span className="text-[9px] text-[#71717a] font-mono">Ctrl+Shift+P</span>
                  </button>
                  <button 
                    onClick={() => {
                      handleFileSelect('~/.nexus_ide_agent.log');
                      handleCloseDropdowns();
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] border-b border-[#2d2d30] pb-2"
                  >
                    View Agent Logs
                  </button>
                  <button 
                    onClick={() => { setShowAboutModal(true); handleCloseDropdowns(); }}
                    className="w-full px-3 py-1.5 hover:bg-[#2d2d30] text-left text-[11px] text-[#d4d4d8] pt-2"
                  >
                    About Nexus Pro
                  </button>
                </div>
              )}
            </div>

          </nav>
        </div>
        
        <div className="text-[11px] text-[#71717a] font-mono truncate max-w-sm lg:max-w-md">
          {activeFilePath ? activeFilePath : workspacePath}
        </div>

        <div className="flex items-center gap-2">
          {activeFile && (
            <button
              onClick={handleSaveActiveFile}
              disabled={!activeFile.isDirty}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                activeFile.isDirty 
                  ? 'bg-[var(--ide-accent)] hover:bg-teal-500 text-white shadow-lg' 
                  : 'bg-[#2d2d30] text-[#71717a] cursor-not-allowed'
              }`}
            >
              <Save size={12} />
              Save Changes
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">
        {isMobile && !isSidebarCollapsed && (
          <button
            type="button"
            className="fixed inset-0 z-[40] bg-black/50 md:hidden"
            aria-label="Закрыть панель"
            onClick={closeMobileSidePanel}
          />
        )}

        {/* Activity Bar — как VS Code / Cursor */}
        <div className="ide-activity-bar hidden md:flex w-14 flex-col shrink-0 select-none relative z-20">
          <ActivityBtn tab="explorer" title="Explorer (Ctrl+Shift+E)" icon={FolderTree} />
          <ActivityBtn tab="search" title="Search (Ctrl+Shift+F)" icon={Search} />
          <ActivityBtn
            tab="git"
            title="Source Control (Ctrl+Shift+G)"
            icon={GitBranch}
            badge={
              gitInfo.files.length > 0 ? (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] text-[9px] bg-teal-600 text-white rounded-full flex items-center justify-center px-0.5">
                  {gitInfo.files.length}
                </span>
              ) : null
            }
          />
          <ActivityBtn tab="run" title="Run and Debug (Ctrl+Shift+D)" icon={Play} />
          <ActivityBtn tab="extensions" title="Extensions (Ctrl+Shift+X)" icon={Puzzle} />
          {enabledViews.has('api_client') && (
            <ActivityBtn tab="api_client" title="REST Client" icon={Globe} />
          )}
          {enabledViews.has('db') && (
            <ActivityBtn tab="db" title="SQLite" icon={Database} />
          )}
          <ActivityBtn tab="ai" title="Nexus Copilot (Cursor-style)" icon={Sparkles} />
          <div className="flex-1" />
          <ActivityBtn tab="profile" title="Account" icon={User} />
          <ActivityBtn tab="settings" title="Settings (Ctrl+,)" icon={Settings} />
        </div>

        {/* 2. Side Panel Container */}
        <aside
          className={`ide-side-panel flex flex-col shrink-0 min-w-0 transition-all duration-150 z-[45] ${
            isSidebarCollapsed ? 'hidden' : 'flex'
          } ${
            isMobile
              ? 'fixed inset-y-0 left-0 w-[min(100vw,360px)] max-w-full shadow-2xl'
              : 'relative w-[min(340px,32vw)] z-20'
          }`}
        >
          {isMobile && !isSidebarCollapsed && (
            <button
              type="button"
              onClick={closeMobileSidePanel}
              className="absolute top-2 right-2 z-10 p-2 rounded-lg bg-[var(--ide-hover)] min-w-[44px] min-h-[44px] flex items-center justify-center md:hidden"
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          )}
          
          {activeTab === 'extensions' && (
            <div className="flex flex-col h-full overflow-hidden">
              <SidebarHeader title="Extensions" />
              <ExtensionsPanel
                onOpenView={(view) => {
                  const views = getEnabledViews();
                  setEnabledViews(views);
                  if (views.has(view)) {
                    setActiveTab(view);
                  } else {
                    appendOutput(`Install extension to open ${view} panel.`);
                    setBottomPanel('output');
                  }
                }}
              />
            </div>
          )}

          {activeTab === 'run' && (
            <div className="flex flex-col h-full p-4 text-[12px] text-[#858585]">
              <SidebarHeader title="Run and Debug" />
              <p className="mt-2 text-[var(--ide-muted)]">
                Запуск через терминал (Ctrl+`) или попросите Agent выполнить команду.
              </p>
            </div>
          )}

          {/* EXPLORER TAB */}
          {activeTab === 'explorer' && (
            <div className="flex flex-col h-full overflow-hidden">
              <SidebarHeader
                title="Explorer"
                actions={
                  <>
                    <button type="button" onClick={handleCreateFileUI} className="p-1 hover:bg-[#3c3c3c] rounded" title="New File"><FilePlus size={16} /></button>
                    <button type="button" onClick={handleCreateFolderUI} className="p-1 hover:bg-[#3c3c3c] rounded" title="New Folder"><FolderPlus size={16} /></button>
                    <button type="button" onClick={loadWorkspace} className="p-1 hover:bg-[#3c3c3c] rounded" title="Refresh"><RefreshCw size={16} /></button>
                  </>
                }
              />
              <div className="px-2 pb-2 flex flex-col gap-2 shrink-0">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={workspacePath}
                    onChange={(e) => setWorkspacePath(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadWorkspace()}
                    className="flex-1 bg-[#18181c] text-xs px-2 py-1 rounded border border-[#2d2d30] text-[#d4d4d8] outline-none"
                    placeholder="Workspace path..."
                  />
                  <button
                    onClick={loadWorkspace}
                    className="p-1 bg-[#2d2d30] hover:bg-[#3e3e42] text-neutral-300 rounded transition-colors"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {error ? (
                  <div className="text-xs text-red-400 p-2 flex items-center gap-1.5 bg-red-950/20 rounded border border-red-900/30">
                    <AlertCircle size={14} />
                    <span>{error}</span>
                  </div>
                ) : fileTree ? (
                  <FileTreeNode 
                    node={fileTree} 
                    onFileSelect={handleFileSelect} 
                    activeFilePath={activeFilePath} 
                  />
                ) : (
                  <div className="text-xs text-[#71717a] p-2">No workspace loaded.</div>
                )}
              </div>
            </div>
          )}

          {/* SEARCH TAB */}
          {activeTab === 'search' && (
            <div className="flex flex-col h-full overflow-hidden p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717a] mb-2 shrink-0">Search Workspace</span>
              <form onSubmit={handleSearch} className="flex gap-1.5 shrink-0 mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-[#18181c] text-xs px-2 py-1 rounded border border-[#2d2d30] text-[#d4d4d8] outline-none"
                  placeholder="Text to find..."
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="px-2.5 bg-[var(--ide-accent)] hover:bg-teal-500 text-white text-xs rounded font-medium"
                >
                  Find
                </button>
              </form>

              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                {searchLoading ? (
                  <div className="text-xs text-[#71717a] p-2 flex items-center gap-1.5">
                    <RefreshCw size={12} className="animate-spin" /> Searching...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((result, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => handleFileSelect(result.file_path)}
                      className="p-1.5 rounded bg-[#18181c] border border-[#2d2d30] cursor-pointer hover:border-[#3e3e42] transition-colors"
                    >
                      <div className="text-[11px] font-bold text-teal-400 truncate">{result.relative_path}</div>
                      <div className="text-[10px] text-[#71717a] font-mono mt-0.5">Line {result.line_num}:</div>
                      <div className="text-xs text-[#d4d4d8] font-mono bg-[#141416] p-1 rounded mt-1 truncate">
                        {result.text}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[#71717a] p-2">No matches found.</div>
                )}
              </div>
            </div>
          )}

          {/* GIT TAB */}
          {activeTab === 'git' && (
            <div className="flex flex-col h-full overflow-hidden p-3 text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717a] mb-2 shrink-0">Source Control</span>
              {demoMode ? (
                <div className="rounded-lg border border-[var(--ide-border)] bg-[var(--ide-input)] p-4 text-[var(--ide-muted)] leading-relaxed">
                  <p className="text-[var(--ide-fg)] font-medium mb-2">Демо-режим</p>
                  <p>Git доступен с локальным backend или в Nexus IDE Desktop. Здесь можно редактировать файлы демо-проекта и пользоваться Agent.</p>
                  <Link to="/ide" className="inline-block mt-3 text-teal-400 hover:underline text-sm">
                    Скачать Desktop IDE
                  </Link>
                </div>
              ) : gitInfo.is_git ? (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex items-center gap-1.5 text-xs text-[#a1a1aa] bg-[#18181c] p-2 rounded border border-[#2d2d30] mb-3 shrink-0">
                    <GitBranch size={14} className="text-blue-400" />
                    <span>Branch: <b className="text-white">{gitInfo.branch}</b></span>
                  </div>
                  
                  <button
                    onClick={handleGitPush}
                    disabled={gitLoading}
                    className="w-full py-1.5 mb-3 bg-[#2d2d30] hover:bg-[#3e3e42] hover:text-teal-400 text-white rounded text-xs font-semibold shrink-0 transition-colors"
                  >
                    {gitLoading ? "Pushing..." : "Push to Remote (Origin)"}
                  </button>

                  <span className="text-[10px] uppercase font-bold text-[#71717a] mb-1">Changes ({gitInfo.files.length})</span>
                  
                  <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar mb-3">
                    {gitInfo.files.map((file, idx) => (
                      <div 
                        key={idx}
                        onClick={() => handleFileSelect(workspacePath + '\\' + file.path)}
                        className="flex items-center justify-between p-1.5 hover:bg-[#18181c] rounded cursor-pointer"
                      >
                        <span className="text-xs truncate text-[#d4d4d8]">{file.path}</span>
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          file.status === 'M' ? 'bg-amber-950/40 text-amber-400 border border-amber-900/30' :
                          file.status === '??' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30' :
                          'bg-neutral-800 text-[#a1a1aa]'
                        }`}>
                          {file.status}
                        </span>
                      </div>
                    ))}
                    {gitInfo.files.length === 0 && (
                      <div className="text-[#71717a] p-2 text-center">No changes.</div>
                    )}
                  </div>

                  {gitInfo.files.length > 0 && (
                    <form onSubmit={handleGitCommit} className="border-t border-[#2d2d30] pt-3 shrink-0 flex flex-col gap-1.5">
                      <textarea
                        value={gitCommitMessage}
                        onChange={(e) => setGitCommitMessage(e.target.value)}
                        placeholder="Commit message..."
                        rows={2}
                        className="w-full bg-[#18181c] text-xs p-2 rounded border border-[#2d2d30] text-[#d4d4d8] outline-none"
                        required
                      />
                      <button
                        type="submit"
                        disabled={gitLoading}
                        className="w-full py-1.5 bg-[var(--ide-accent)] hover:bg-teal-500 text-white text-xs font-semibold rounded"
                      >
                        {gitLoading ? "Staging & Committing..." : "Commit All"}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="text-[#71717a] p-2">No git repo found at workspace root.</div>
              )}
            </div>
          )}

          {/* AI ASSISTANT TAB */}
          {activeTab === 'ai' && (
            <IdeCopilotPanel
              authStatus={authStatus}
              models={ideModels}
              mediaModels={[]}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              chatHistory={chatHistory}
              aiLoading={aiLoading}
              aiInput={aiInput}
              onAiInputChange={setAiInput}
              onSend={handleAISendMessage}
              onClear={() => {
                setChatHistory([]);
                setLastPromptCost(null);
              }}
              useFileContext={useFileContext}
              onUseFileContextChange={setUseFileContext}
              activeFile={activeFile}
              hasWorkspace={Boolean(fileTree)}
              demoMode={demoMode}
              lastPromptCost={lastPromptCost}
              quotaRemainingUsd={quotaRemainingUsd}
              profile={authStatus.profile}
            />
          )}

          {/* REST API CLIENT TAB */}
          {activeTab === 'api_client' && (
            <div className="flex flex-col h-full overflow-hidden p-3 bg-[#1e1e24] text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717a] mb-2 shrink-0 flex items-center gap-1">
                <Globe size={13} /> REST API Client
              </span>
              
              <form onSubmit={handleSendAPIRequest} className="space-y-3 shrink-0 mb-3 border-b border-[#2d2d30] pb-3">
                <div className="flex gap-1.5">
                  <select
                    value={apiMethod}
                    onChange={(e) => setApiMethod(e.target.value)}
                    className="bg-[#18181c] text-xs px-2 py-1.5 rounded border border-[#2d2d30] text-[#white] outline-none font-bold shrink-0"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="flex-1 bg-[#18181c] text-xs px-2 py-1.5 rounded border border-[#2d2d30] text-[#d4d4d8] outline-none font-mono"
                    placeholder="https://api.example.com/endpoint"
                  />
                  <button
                    type="submit"
                    disabled={apiLoading}
                    className="px-3 bg-[var(--ide-accent)] hover:bg-teal-500 text-white text-xs rounded font-bold transition-all shrink-0"
                  >
                    {apiLoading ? "..." : "Send"}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#71717a] font-bold uppercase">Headers</span>
                    <button
                      type="button"
                      onClick={handleAddHeaderRow}
                      className="text-[10px] text-teal-400 hover:underline"
                    >
                      + Add Header
                    </button>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1 custom-scrollbar">
                    {apiHeaders.map((header, idx) => (
                      <div key={idx} className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          value={header.key}
                          onChange={(e) => handleHeaderChange(idx, 'key', e.target.value)}
                          placeholder="Header"
                          className="flex-1 bg-[#18181c] text-[11px] px-2 py-1 rounded border border-[#2d2d30] outline-none font-mono"
                        />
                        <input
                          type="text"
                          value={header.value}
                          onChange={(e) => handleHeaderChange(idx, 'value', e.target.value)}
                          placeholder="Value"
                          className="flex-1 bg-[#18181c] text-[11px] px-2 py-1 rounded border border-[#2d2d30] outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveHeaderRow(idx)}
                          className="p-1 hover:bg-[#2d2d30] text-[#71717a] hover:text-red-400 rounded"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {apiMethod !== 'GET' && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-[#71717a] font-bold uppercase">Body (raw JSON / text)</span>
                    <textarea
                      value={apiBody}
                      onChange={(e) => setApiBody(e.target.value)}
                      placeholder='{ "key": "value" }'
                      rows={3}
                      className="w-full bg-[#18181c] text-[11px] p-2 rounded border border-[#2d2d30] text-[#d4d4d8] outline-none font-mono placeholder-[#52525b]"
                    />
                  </div>
                )}
              </form>

              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <span className="text-[10px] text-[#71717a] font-bold uppercase mb-1 shrink-0">Response</span>
                <div className="flex-1 bg-[#18181c] rounded border border-[#2d2d30] p-2.5 overflow-y-auto custom-scrollbar font-mono text-[11px] select-text">
                  {apiResponse ? (
                    apiResponse.status === 'success' ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 border-b border-[#2d2d30] pb-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            apiResponse.status_code >= 200 && apiResponse.status_code < 300 
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40' 
                              : 'bg-red-950 text-red-400 border border-red-900/40'
                          }`}>
                            Status: {apiResponse.status_code}
                          </span>
                          <span className="text-[#71717a] text-[10px]">Time: <b className="text-[#d4d4d8]">{apiResponse.time_ms} ms</b></span>
                        </div>
                        <pre className="whitespace-pre-wrap text-[#d4d4d8] max-w-full">
                          {apiResponse.text}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-red-400 flex items-center gap-1.5">
                        <AlertCircle size={12} /> {apiResponse.message}
                      </div>
                    )
                  ) : (
                    <div className="text-[#71717a] text-center mt-8">
                      No response yet. Fill fields above and click "Send".
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DATABASE CLIENT TAB */}
          {activeTab === 'db' && (
            <div className="flex flex-col h-full overflow-hidden p-3 bg-[#1e1e24] text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717a] mb-2 shrink-0 flex items-center gap-1.5">
                <Database size={13} className="text-amber-500" /> Database Explorer (SQLite)
              </span>

              <div className="space-y-1.5 mb-3 shrink-0">
                <span className="text-[10px] text-[#71717a] font-bold uppercase">DB File Path</span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={dbPath}
                    onChange={(e) => setDbPath(e.target.value)}
                    className="flex-1 bg-[#18181c] text-xs px-2 py-1.5 rounded border border-[#2d2d30] text-[#d4d4d8] outline-none font-mono"
                    placeholder="Path to .db file..."
                  />
                  <button
                    onClick={handleConnectDatabase}
                    disabled={dbLoading}
                    className="px-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-xs font-semibold"
                  >
                    Connect
                  </button>
                </div>
              </div>

              {dbTables.length > 0 && (
                <div className="shrink-0 mb-3">
                  <span className="text-[10px] text-[#71717a] font-bold uppercase mb-1 block">Tables ({dbTables.length})</span>
                  <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto p-1 bg-[#18181c] rounded border border-[#2d2d30] custom-scrollbar">
                    {dbTables.map((table, idx) => (
                      <span 
                        key={idx} 
                        onClick={() => {
                          setDbQuery(`SELECT * FROM ${table} LIMIT 10;`);
                        }}
                        className="text-[10px] bg-neutral-800 hover:bg-[var(--ide-accent)]/20 text-neutral-300 hover:text-white px-1.5 py-0.5 rounded cursor-pointer border border-[#2d2d30] transition-colors"
                        title="Click to generate SELECT query"
                      >
                        📊 {table}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleRunSQLQuery} className="space-y-1.5 mb-3 shrink-0">
                <span className="text-[10px] text-[#71717a] font-bold uppercase">SQL Console</span>
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={dbQuery}
                    onChange={(e) => setDbQuery(e.target.value)}
                    className="w-full bg-[#18181c] p-2 rounded border border-[#2d2d30] text-[#d4d4d8] outline-none font-mono placeholder-[#52525b]"
                    rows={3}
                  />
                  <button
                    type="submit"
                    disabled={dbLoading}
                    className="w-full py-1.5 bg-[var(--ide-accent)] hover:bg-teal-500 text-white text-xs font-semibold rounded"
                  >
                    {dbLoading ? "Executing..." : "Execute Query"}
                  </button>
                </div>
              </form>

              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <span className="text-[10px] text-[#71717a] font-bold uppercase mb-1 shrink-0">Console Output</span>
                <div className="flex-1 bg-[#18181c] rounded border border-[#2d2d30] p-2.5 overflow-auto custom-scrollbar select-text font-mono text-[11px]">
                  {dbResponse ? (
                    dbResponse.status === 'success' ? (
                      dbResponse.type === 'select' ? (
                        <div className="space-y-2">
                          <span className="text-[10px] text-emerald-500 font-bold">Query returned {dbResponse.rows.length} rows</span>
                          <table className="w-full text-left border-collapse border border-[#2d2d30]">
                            <thead>
                              <tr className="bg-neutral-900 border-b border-[#2d2d30]">
                                {dbResponse.columns.map((col, idx) => (
                                  <th key={idx} className="p-1.5 font-bold text-white uppercase text-[10px]">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {dbResponse.rows.map((row, rIdx) => (
                                <tr key={rIdx} className="border-b border-[#2d2d30] hover:bg-neutral-800/30">
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="p-1.5 text-neutral-300 truncate max-w-[120px]">{String(cell)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-emerald-400 flex items-center gap-1.5">
                          <Check size={12} /> Successfully executed. Affected rows: {dbResponse.affected_rows}
                        </div>
                      )
                    ) : (
                      <div className="text-red-400 flex items-center gap-1.5">
                        <AlertCircle size={12} /> {dbResponse.message}
                      </div>
                    )
                  ) : (
                    <div className="text-[#71717a] text-center mt-8">
                      No queries executed yet. Connect to a database file and write SQL.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* NEXUS PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="flex flex-col h-full overflow-hidden p-3 bg-[#1e1e24] text-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717a] mb-3 shrink-0 block">
                Nexus Cloud Management
              </span>

              {authStatus.authorized ? (
                <div className="flex flex-col h-full overflow-hidden space-y-3">
                  <div className="bg-[#18181c] p-3 rounded-lg border border-[#2d2d30] space-y-2 shrink-0">
                    <p className="text-[#71717a] text-[10px] uppercase font-bold">Logged In As</p>
                    <p className="text-white font-mono font-bold truncate">{authStatus.profile.email}</p>
                  </div>

                  <div className="bg-[#18181c] p-2 rounded-lg border border-[#2d2d30] shrink-0 max-h-[42vh] overflow-y-auto custom-scrollbar">
                    <p className="text-[#71717a] text-[10px] uppercase font-bold mb-2 px-1">Тариф</p>
                    <TierPicker
                      mode="subscribe"
                      currentTierId={authStatus.profile.subscription_tier}
                      compact
                      layout="stack"
                    />
                  </div>

                  <div className="bg-[#18181c] p-3 rounded-lg border border-[#2d2d30] space-y-2 shrink-0">
                    <p className="text-[#71717a] text-[10px] uppercase font-bold">Пул ИИ</p>
                    {authStatus.profile?.monthly_cap_rub > 0 ||
                    authStatus.profile?.monthly_cap_usd > 0 ||
                    authStatus.profile?.daily_cap_rub > 0 ||
                    authStatus.profile?.daily_cap_usd > 0 ||
                    (authStatus.profile?.topup_balance_rub ?? authStatus.profile?.balance_rub ?? 0) > 0 ? (
                      <>
                        <DailyLimitBar profile={authStatus.profile} />
                        <p className="text-[10px] text-[#71717a] leading-snug">
                          Пул на 30 дней. После исчерпания — пополнение баланса в «Тарифы».
                        </p>
                      </>
                    ) : (
                      <p className="text-[10px] text-amber-400/90 leading-snug">
                        На Free облачный ИИ недоступен. Оформите подписку в блоке тарифов ниже.
                      </p>
                    )}
                  </div>

                  {/* История транзакций */}
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#18181c] border border-[#2d2d30] rounded-lg p-2">
                    <p className="text-[#71717a] text-[10px] uppercase font-bold mb-2 flex items-center gap-1 select-none">
                      <History size={11} /> Transaction History
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                      {txLoading ? (
                        <p className="text-center text-[#71717a] py-4">Loading history...</p>
                      ) : transactions.length > 0 ? (
                        transactions.map((tx, idx) => (
                          <div key={idx} className="p-1.5 rounded bg-[#1e1e24] border border-[#2d2d30] flex items-center justify-between text-[11px] font-mono">
                            <div className="truncate max-w-[120px]">
                              <span className="text-white block truncate">{tx.description || tx.tx_type}</span>
                              <span className="text-[9px] text-[#71717a]">{new Date(tx.created_at).toLocaleDateString()}</span>
                            </div>
                            <span className={`font-bold ${tx.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {tx.amount < 0 ? '' : '+'}${tx.amount.toFixed(4)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-[#71717a] py-6">No transactions found.</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => authLogout()}
                    className="w-full py-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/30 rounded font-semibold transition-colors shrink-0"
                  >
                    Log Out From System
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[#a1a1aa] text-xs leading-relaxed">
                    Войдите через Google — чаты и тариф синхронизируются с сайтом.
                  </p>
                  <button
                    type="button"
                    onClick={() => openAuthModal()}
                    className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg text-xs transition-colors"
                  >
                    Войти в Nexus
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="flex flex-col h-full overflow-hidden p-3 gap-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717a] shrink-0">IDE Settings</span>
              <div className="space-y-4 text-xs">
                
                <div className="flex flex-col gap-1.5">
                  <span className="text-[#a1a1aa] flex items-center gap-1.5"><Sliders size={13} /> Editor Font: {editorFontSize}px</span>
                  <input 
                    type="range" 
                    min="10" 
                    max="24" 
                    value={editorFontSize} 
                    onChange={(e) => setEditorFontSize(parseInt(e.target.value))}
                    className="w-full accent-teal-400 cursor-pointer bg-[#18181c] h-1.5 rounded"
                  />
                </div>

                <div className="flex items-center justify-between bg-[#18181c] p-2 rounded border border-[#2d2d30]">
                  <span className="text-[#a1a1aa]">Monaco Minimap</span>
                  <input 
                    type="checkbox" 
                    checked={showMinimap} 
                    onChange={(e) => setShowMinimap(e.target.checked)}
                    className="w-4 h-4 rounded accent-teal-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* 3. Editor & Terminal Main Frame */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10">
          
          <div className="flex-1 flex flex-col min-h-0 ide-editor-frame">
            
            {/* Tab strip */}
            <div className="flex bg-[#18181c] border-b border-[#2d2d30] overflow-x-auto custom-scrollbar select-none">
              {Object.values(openFiles).map((file) => {
                const isActive = file.path === activeFilePath;
                return (
                  <div
                    key={file.path}
                    onClick={() => {
                      setActiveFilePath(file.path);
                      setIsDiffMode(false); 
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs border-r border-[#2d2d30] cursor-pointer transition-colors shrink-0 ${
                      isActive 
                        ? 'bg-[#1e1e1e] text-[#f4f4f5] border-t-2 border-teal-500 font-medium' 
                        : 'bg-[#18181c] text-[#71717a] hover:bg-[#1e1e24] hover:text-[#d4d4d8]'
                    }`}
                  >
                    <FileCode2 size={13} className={isActive ? "text-teal-400" : "text-[#71717a]"} />
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    {file.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                    <button
                      onClick={(e) => handleCloseFile(file.path, e)}
                      className="p-0.5 rounded hover:bg-[#2d2d30] hover:text-white"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
              
              {activeFile && (
                <div className="flex items-center ml-auto px-3">
                  <button
                    onClick={() => setIsDiffMode(!isDiffMode)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                      isDiffMode 
                        ? 'bg-[var(--ide-accent)] text-white shadow-md' 
                        : 'bg-[#2d2d30] text-[#a1a1aa] hover:text-[#d4d4d8]'
                    }`}
                    title="Toggle Split Diff View"
                  >
                    <FileCode2 size={12} />
                    {isDiffMode ? "Show Editor" : "Show Diff"}
                  </button>
                </div>
              )}
            </div>

            {/* Monaco Space */}
            <div className="flex-1 relative">
              {activeFile ? (
                isDiffMode ? (
                  <DiffEditor
                    height="100%"
                    theme="vs-dark"
                    original={activeFile.originalContent}
                    modified={activeFile.currentContent}
                    language={getLanguageFromPath(activeFile.path)}
                    options={{
                      fontSize: isMobile ? 14 : editorFontSize,
                      fontFamily: 'Consolas, monospace',
                      minimap: { enabled: isMobile ? false : showMinimap },
                      lineHeight: 20,
                    }}
                  />
                ) : (
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    language={getLanguageFromPath(activeFile.path)}
                    value={activeFile.currentContent}
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    options={{
                      automaticLayout: true,
                      fontSize: isMobile ? 14 : editorFontSize,
                      fontFamily: 'Consolas, monospace',
                      minimap: { enabled: isMobile ? false : showMinimap },
                      cursorBlinking: "smooth",
                      lineHeight: 20
                    }}
                  />
                )
              ) : (
                <IdeWelcome
                  demoMode={demoMode}
                  onOpenFolder={handleOpenFolderDialog}
                  onOpenAgent={() => setActiveTab('ai')}
                />
              )}
            </div>
          </div>

          {/* Panel — Problems / Output / Terminal (VS Code) — desktop */}
          <div className={`hidden md:flex transition-all duration-200 border-t border-[#3c3c3c] flex-col bg-[#1e1e1e] ${
            isTerminalCollapsed ? 'h-[22px]' : 'h-[220px]'
          }`}>
            <div className="h-[22px] bg-[#252526] flex items-center justify-between shrink-0 select-none text-[11px] uppercase">
              <div className="flex h-full">
                {[
                  ['problems', 'Problems', problems.length],
                  ['output', 'Output', null],
                  ['terminal', 'Terminal', null],
                ].map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setBottomPanel(id); setIsTerminalCollapsed(false); }}
                    className={`px-3 h-full border-r border-[#3c3c3c] ${
                      bottomPanel === id && !isTerminalCollapsed
                        ? 'bg-[#1e1e1e] text-white border-t border-t-white'
                        : 'text-[#858585] hover:text-[#cccccc]'
                    }`}
                  >
                    {label}
                    {count != null && count > 0 ? ` (${count})` : ''}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsTerminalCollapsed(!isTerminalCollapsed)}
                className="px-2 h-full hover:bg-[#3c3c3c] text-[#858585]"
                title={isTerminalCollapsed ? 'Expand Panel' : 'Collapse Panel'}
              >
                {isTerminalCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            {!isTerminalCollapsed && (
              <div className="flex-1 min-h-0 overflow-hidden">
                {bottomPanel === 'terminal' && (
                  <TerminalArea workspacePath={workspacePath} demoMode={demoMode} />
                )}
                {bottomPanel === 'output' && (
                  <pre className="h-full overflow-auto p-3 text-[12px] font-mono text-[#cccccc] custom-scrollbar whitespace-pre-wrap">
                    {outputLog}
                  </pre>
                )}
                {bottomPanel === 'problems' && (
                  <div className="h-full p-3 text-[12px] text-[#858585]">
                    {problems.length === 0
                      ? 'No problems have been detected in the workspace.'
                      : problems.map((p, i) => <div key={i}>{p}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <IdeMobileDock
        activeTab={activeTab}
        onSelectTab={selectIdeTab}
        onToggleTerminal={() => {
          setMobileTerminalOpen((o) => !o);
          setBottomPanel('terminal');
          setIsSidebarCollapsed(true);
        }}
        onOpenMore={() => setMobileMoreOpen(true)}
        terminalOpen={mobileTerminalOpen}
      />
      <IdeMobileMoreSheet
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        onSelectTab={selectIdeTab}
        enabledViews={enabledViews}
      />
      <IdeMobileBottomSheet
        open={mobileTerminalOpen}
        title="Terminal"
        onClose={() => setMobileTerminalOpen(false)}
      >
        <TerminalArea workspacePath={workspacePath} demoMode={demoMode} />
      </IdeMobileBottomSheet>
      <IdeStatusBar
        demoMode={demoMode}
        gitInfo={gitInfo}
        authStatus={authStatus}
        activeFile={activeFile}
        getLanguageFromPath={getLanguageFromPath}
      />

      {/* ABOUT MODAL (Help -> About) */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1e1e24] border border-[#2d2d30] rounded-xl shadow-2xl p-6 w-full max-w-sm relative text-center">
            <button 
              onClick={() => setShowAboutModal(false)}
              className="absolute right-4 top-4 p-1 rounded-md hover:bg-[#2d2d30] text-[#71717a] hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="w-16 h-16 bg-[var(--ide-accent)]/10 border border-teal-500/20 text-teal-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-black tracking-widest shadow-inner select-none">
              NX
            </div>

            <h3 className="text-lg font-bold text-[#f4f4f5] mb-1 select-none">Nexus Pro IDE</h3>
            <p className="text-[11px] text-[#71717a] font-mono mb-4 select-none">Version 0.1.5 (MVP Release)</p>
            
            <div className="bg-[#18181c] border border-[#2d2d30] rounded-lg p-3 text-left space-y-2 mb-4 text-[11px]">
              <div className="flex justify-between border-b border-[#2d2d30] pb-1.5 select-none">
                <span className="text-[#71717a]">Engine:</span>
                <span className="text-white font-semibold">Vite + React + Monaco</span>
              </div>
              <div className="flex justify-between border-b border-[#2d2d30] pb-1.5 select-none">
                <span className="text-[#71717a]">Backend:</span>
                <span className="text-white font-semibold">FastAPI + Async Shell</span>
              </div>
              <div className="flex justify-between select-none">
                <span className="text-[#71717a]">Auth Status:</span>
                <span className={`font-bold ${authStatus.authorized ? 'text-green-400' : 'text-red-400'}`}>
                  {authStatus.authorized ? authStatus.profile.subscription_tier : "Not Logged In"}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-[#71717a] leading-relaxed mb-4 select-none">
              Nexus Pro is a highly customizable, lightweight code editor optimized for cloud AI agents and local system development.
            </p>

            <button
              onClick={() => setShowAboutModal(false)}
              className="w-full py-2 bg-[var(--ide-accent)] hover:bg-teal-500 text-white font-semibold rounded-lg text-xs transition-colors"
            >
              Close Info
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default IdeApp;
