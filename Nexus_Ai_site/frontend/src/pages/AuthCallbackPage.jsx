import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiClient';
import { getStoredTokens } from '../lib/authStorage';

const OAUTH_ERROR_MESSAGES = {
  access_denied:
    'Google отклонил вход. Разрешите доступ и повторите попытку или войдите по коду из email.',
  oauth_state: 'Сессия входа истекла. Закройте вкладку и нажмите «Продолжить с Google» снова.',
  oauth_token:
    'Не удалось завершить вход через Google. Попробуйте ещё раз или войдите по коду из email.',
  oauth_redirect:
    'Вход через Google временно недоступен. Воспользуйтесь кодом из email или напишите в поддержку.',
  oauth_client:
    'Вход через Google временно недоступен. Воспользуйтесь кодом из email или напишите в поддержку.',
  oauth_jwt: 'Не удалось проверить токен Google. Попробуйте снова через минуту.',
  oauth_account: 'Этот email уже привязан к другому Google-аккаунту.',
  oauth_exchange:
    'Сессия входа не синхронизировалась между серверами. Обновите страницу (Ctrl+F5) и войдите через Google ещё раз.',
  oauth_failed: 'Не удалось войти через Google. Попробуйте email-код или напишите в поддержку.',
};

function messageForOAuthError(code) {
  return OAUTH_ERROR_MESSAGES[code] || OAUTH_ERROR_MESSAGES.oauth_failed;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || 'ваш аккаунт';
  const [local, domain] = email.split('@');
  const head = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${head}***@${domain}`;
}

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    authStatus,
    completeGoogleExchange,
    completeTelegramExchange,
    linkTelegramFromExchange,
    fetchProfile,
  } = useAuth();
  const [error, setError] = useState('');
  const [desktopUri, setDesktopUri] = useState('');
  const [mergeOffer, setMergeOffer] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      setError(messageForOAuthError(err));
      return;
    }
    const exchange = searchParams.get('exchange');
    if (!exchange) {
      setError('Нет кода авторизации.');
      return;
    }
    const forBrowser = sessionStorage.getItem('nexus_oauth_for_browser') === '1';
    if (forBrowser) {
      sessionStorage.removeItem('nexus_oauth_for_browser');
      const browserUri = `nexus-browser://auth?exchange=${encodeURIComponent(exchange)}`;
      setDesktopUri(browserUri);
      window.location.href = browserUri;
      return;
    }
    const forDesktop = sessionStorage.getItem('nexus_oauth_for_desktop') === '1';
    if (forDesktop) {
      sessionStorage.removeItem('nexus_oauth_for_desktop');
      const ideUri = `vscode://nexus.nexus-auth/oauth?exchange=${encodeURIComponent(exchange)}`;
      setDesktopUri(ideUri);
      window.location.href = ideUri;
      return;
    }
    (async () => {
      try {
        let tgPreview = null;
        try {
          const prevRes = await apiFetch('/auth/telegram/exchange/preview', {
            method: 'POST',
            body: JSON.stringify({ code: exchange }),
          });
          if (prevRes.ok) {
            tgPreview = await prevRes.json();
          }
        } catch {
          /* not a telegram exchange */
        }

        let currentEmail = authStatus.profile?.email;
        const hasToken = Boolean(getStoredTokens().accessToken);
        if (hasToken && !currentEmail) {
          try {
            const profRes = await apiFetch('/auth/profile');
            if (profRes.ok) {
              const prof = await profRes.json();
              currentEmail = prof.email || prof.profile?.email;
            }
          } catch {
            /* ignore */
          }
        }

        if (
          tgPreview?.is_telegram_shadow &&
          hasToken &&
          currentEmail &&
          !currentEmail.endsWith('@tg.nexus')
        ) {
          setMergeOffer({
            exchange,
            tgLabel: tgPreview.telegram_username
              ? `@${tgPreview.telegram_username.replace(/^@/, '')}`
              : tgPreview.label || 'Telegram',
            emailLabel: maskEmail(currentEmail),
          });
          return;
        }

        try {
          await completeTelegramExchange(exchange);
        } catch {
          await completeGoogleExchange(exchange);
        }
        navigate('/', { replace: true });
      } catch (e) {
        setError(e.message || 'Ошибка входа');
      }
    })();
  }, [
    searchParams,
    completeGoogleExchange,
    completeTelegramExchange,
    navigate,
    authStatus.authorized,
    authStatus.profile?.email,
  ]);

  const handleLinkToCurrent = async () => {
    if (!mergeOffer?.exchange) return;
    setBusy(true);
    setError('');
    try {
      await linkTelegramFromExchange(mergeOffer.exchange);
      await fetchProfile();
      navigate('/', { replace: true });
    } catch (e) {
      setError(e.message || 'Не удалось привязать Telegram');
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchToTelegramAccount = async () => {
    if (!mergeOffer?.exchange) return;
    setBusy(true);
    setError('');
    try {
      await completeTelegramExchange(mergeOffer.exchange);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e.message || 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };

  if (desktopUri) {
    return (
      <div className="nx-dvh-screen bg-[#07070a] flex flex-col items-center justify-center gap-4 px-6 text-center max-w-lg">
        <p className="text-zinc-300 text-sm leading-relaxed">
          Вход через Google выполнен. Если VSCodium не открылся сам, нажмите кнопку ниже и подтвердите открытие
          приложения.
        </p>
        <a
          href={desktopUri}
          className="px-4 py-2 rounded-lg bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-600/30"
        >
          Открыть Nexus IDE
        </a>
        <p className="text-zinc-500 text-xs">Можно закрыть эту вкладку после входа в IDE.</p>
      </div>
    );
  }

  if (mergeOffer) {
    return (
      <div className="nx-dvh-screen bg-[#07070a] flex flex-col items-center justify-center gap-4 px-6 text-center max-w-lg">
        <h1 className="text-lg text-zinc-100 font-medium">Привязать Telegram?</h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Вы уже вошли как <span className="text-zinc-200">{mergeOffer.emailLabel}</span>. Ссылка из бота ведёт на
          отдельный Telegram-аккаунт ({mergeOffer.tgLabel}). Обычно нужно привязать Telegram к текущему email, а не
          создавать второй аккаунт.
        </p>
        {error ? <p className="text-red-400 text-sm">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={handleLinkToCurrent}
          className="w-full max-w-sm px-4 py-2.5 rounded-lg bg-cyan-600/25 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-600/35 disabled:opacity-50"
        >
          Привязать {mergeOffer.tgLabel} к {mergeOffer.emailLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleSwitchToTelegramAccount}
          className="text-zinc-500 text-sm hover:text-zinc-300 underline-offset-2 hover:underline disabled:opacity-50"
        >
          Войти в отдельный Telegram-аккаунт
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nx-dvh-screen bg-[#07070a] flex flex-col items-center justify-center gap-4 px-6 text-center max-w-lg">
        <p className="text-red-400 text-sm leading-relaxed">{error}</p>
        <Link to="/?panel=auth" className="text-cyan-400 hover:underline">
          Вернуться к входу
        </Link>
      </div>
    );
  }

  return (
    <div className="nx-dvh-screen bg-[#07070a] flex items-center justify-center text-cyan-400">
      <RefreshCw className="animate-spin mr-2" size={24} />
      <span>Завершаем вход…</span>
    </div>
  );
}
