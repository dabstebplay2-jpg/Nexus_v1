import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import BrandLogo from '../brand/BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { formatRetryCountdown, isGoogleMailbox } from '../../lib/authErrors';
import { isTelegramWidgetAllowed, telegramBotUrl } from '../../lib/telegramLogin';
import './AuthModal.css';

const OTP_LEN = 6;
const RESEND_SEC = 60;

function TelegramLoginWidget({ botUsername, onAuth, disabled }) {
  const hostRef = useRef(null);

  useEffect(() => {
    if (!botUsername || !hostRef.current || disabled) return undefined;
    const host = hostRef.current;
    host.innerHTML = '';
    window.onTelegramAuth = (user) => {
      if (user) onAuth(user);
    };
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    host.appendChild(script);
    return () => {
      delete window.onTelegramAuth;
      host.innerHTML = '';
    };
  }, [botUsername, onAuth, disabled]);

  return <div ref={hostRef} className="auth-telegram-widget" />;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c3.42-3.15 5.384-7.78 5.384-13.415z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H1.057v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H1.057A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 1.057 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function applyRateLimitError(setCooldown, setErr, error) {
  if (error?.retryAfterSeconds) {
    setCooldown(error.retryAfterSeconds);
    setErr(
      `${error.message} Повторная отправка через ${formatRetryCountdown(error.retryAfterSeconds)}.`
    );
    return;
  }
  setErr(error?.message || 'Ошибка');
}

export default function AuthModal() {
  const {
    authModalOpen,
    closeAuthModal,
    requestEmailCode,
    verifyEmailCode,
    startGoogleLogin,
    completeTelegramLogin,
    googleOAuthAvailable,
    emailAuthEnabled,
    telegramAuthEnabled,
    telegramBotUsername,
    telegramLoginDomain,
    authConfigLoaded,
  } = useAuth();

  const telegramWidgetOk = isTelegramWidgetAllowed(telegramLoginDomain);

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(Array(OTP_LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resendIn, setResendIn] = useState(RESEND_SEC);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [devCode, setDevCode] = useState('');
  const inputRefs = useRef([]);
  const dialogRef = useRef(null);

  const gmailAddress = isGoogleMailbox(email);

  useEffect(() => {
    if (!authModalOpen) {
      setStep('email');
      setEmail('');
      setDigits(Array(OTP_LEN).fill(''));
      setErr('');
      setResendIn(RESEND_SEC);
      setEmailCooldown(0);
      setDevCode('');
    }
  }, [authModalOpen]);

  useEffect(() => {
    if (!authModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector('input, button:not(.auth-modal-close)')?.focus();
    });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeAuthModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [authModalOpen, closeAuthModal]);

  useEffect(() => {
    if (step !== 'otp' || resendIn <= 0) return undefined;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, resendIn]);

  useEffect(() => {
    if (emailCooldown <= 0) return undefined;
    const t = setInterval(() => setEmailCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [emailCooldown]);

  const submitCode = useCallback(
    async (code) => {
      if (code.length !== OTP_LEN) return;
      setBusy(true);
      setErr('');
      try {
        const data = await verifyEmailCode(email, code);
        if (data?.suggest_google_link && googleOAuthAvailable) {
          setStep('link-google');
        } else {
          closeAuthModal();
        }
      } catch (e) {
        setErr(e.message);
        setDigits(Array(OTP_LEN).fill(''));
        inputRefs.current[0]?.focus();
      } finally {
        setBusy(false);
      }
    },
    [email, verifyEmailCode, closeAuthModal, googleOAuthAvailable]
  );

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (emailCooldown > 0) return;
    setBusy(true);
    setErr('');
    try {
      const data = await requestEmailCode(email);
      setDevCode(data?.dev_code || '');
      setStep('otp');
      setResendIn(RESEND_SEC);
      setEmailCooldown(0);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (ex) {
      applyRateLimitError(setEmailCooldown, setErr, ex);
    } finally {
      setBusy(false);
    }
  };

  const handleDigitChange = (index, value) => {
    const v = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    if (v && index < OTP_LEN - 1) inputRefs.current[index + 1]?.focus();
    const code = next.join('');
    if (code.length === OTP_LEN && !next.includes('')) submitCode(code);
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LEN).fill('');
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    setDigits(next);
    if (pasted.length === OTP_LEN) submitCode(pasted);
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    setBusy(true);
    setErr('');
    try {
      const data = await requestEmailCode(email);
      setDevCode(data?.dev_code || '');
      setResendIn(RESEND_SEC);
    } catch (ex) {
      applyRateLimitError(setResendIn, setErr, ex);
    } finally {
      setBusy(false);
    }
  };

  if (!authModalOpen) return null;

  const googleOnly = authConfigLoaded && googleOAuthAvailable && !emailAuthEnabled;
  const emailSubmitDisabled = busy || emailCooldown > 0;

  return (
    <AnimatePresence>
      <motion.div
        className="auth-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeAuthModal}
      >
        <motion.div
          ref={dialogRef}
          className="auth-modal"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <button type="button" className="auth-modal-close" onClick={closeAuthModal} aria-label="Закрыть">
            <X size={20} />
          </button>

          <BrandLogo
            variant="icon"
            className="auth-modal-logo"
            imgClassName="h-14 w-14 object-contain"
            fallback="text"
            fallbackText="NX"
          />

          {step === 'email' ? (
            <>
              <h2 id="auth-modal-title">
                {googleOnly ? 'Войти через Google' : 'Войти или создать аккаунт'}
              </h2>
              <p className="auth-modal-sub">
                {googleOnly
                  ? 'Один аккаунт Google — чаты, тариф и баланс на сайте и в IDE.'
                  : 'Чаты, тариф и баланс сохраняются на всех устройствах под одним email.'}
              </p>

              {!authConfigLoaded ? (
                <p className="auth-google-hint auth-google-hint--muted">Проверяем доступность входа…</p>
              ) : googleOnly ? (
                googleOAuthAvailable ? (
                  <>
                    <button
                      type="button"
                      className="auth-google-btn auth-google-btn--solo"
                      disabled={busy}
                      onClick={() => {
                        try {
                          startGoogleLogin();
                        } catch (e) {
                          setErr(e.message);
                        }
                      }}
                    >
                      <GoogleIcon />
                      Продолжить с Google
                    </button>
                    <p className="auth-google-hint">
                      Вход по email временно отключён — используйте Google-аккаунт.
                    </p>
                  </>
                ) : (
                  <p className="auth-google-hint auth-google-hint--muted">
                    Вход через Google временно недоступен. Попробуйте позже.
                  </p>
                )
              ) : (
                <>
                  {telegramAuthEnabled && telegramBotUsername ? (
                    <>
                      {telegramWidgetOk ? (
                        <TelegramLoginWidget
                          botUsername={telegramBotUsername}
                          disabled={busy}
                          onAuth={async (user) => {
                            setBusy(true);
                            setErr('');
                            try {
                              await completeTelegramLogin(user);
                            } catch (e) {
                              setErr(e.message || 'Ошибка входа через Telegram');
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      ) : null}
                      <a
                        href={telegramBotUrl(telegramBotUsername)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={telegramWidgetOk ? 'auth-telegram-bot-link' : 'auth-google-btn'}
                      >
                        {telegramWidgetOk
                          ? `Не приходит код? Войти через @${telegramBotUsername}`
                          : `Войти через бота @${telegramBotUsername}`}
                      </a>
                      <p className="auth-google-hint">
                        {telegramWidgetOk ? (
                          <>
                            В popup Telegram ищите чат <strong>Telegram</strong> (с галочкой) — не
                            бота. Номер должен совпадать с аккаунтом. В боте: /login → «Открыть
                            Nexus».
                          </>
                        ) : (
                          `Виджет только на ${telegramLoginDomain || 'продакшен-домене'}. В боте: /start или /login → «Открыть Nexus».`
                        )}
                      </p>
                    </>
                  ) : null}
                  {googleOAuthAvailable ? (
                    <>
                      <button
                        type="button"
                        className="auth-google-btn"
                        disabled={busy}
                        onClick={() => {
                          try {
                            startGoogleLogin(gmailAddress ? email : undefined);
                          } catch (e) {
                            setErr(e.message);
                          }
                        }}
                      >
                        <GoogleIcon />
                        Продолжить с Google
                      </button>
                      <p className="auth-google-hint">Вход без кода — один клик через Google.</p>
                    </>
                  ) : !telegramAuthEnabled ? (
                    <p className="auth-google-hint auth-google-hint--muted">
                      Вход по email защищён одноразовым кодом — пароль не нужен.
                    </p>
                  ) : null}
                  {(telegramAuthEnabled || googleOAuthAvailable) ? (
                    <div className="auth-divider">или email</div>
                  ) : null}
                </>
              )}

              {!googleOnly && (
                <>
                  {gmailAddress && googleOAuthAvailable && (
                    <p className="auth-gmail-tip">
                      У вас Gmail — быстрее войти через кнопку Google выше, без ожидания письма с кодом.
                    </p>
                  )}

                  <form onSubmit={handleEmailSubmit}>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="email@example.com"
                      className="auth-email-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <button type="submit" className="auth-primary-btn" disabled={emailSubmitDisabled}>
                      {busy
                        ? 'Отправка…'
                        : emailCooldown > 0
                          ? `Повтор через ${formatRetryCountdown(emailCooldown)}`
                          : 'Продолжить с email'}
                    </button>
                  </form>
                </>
              )}
            </>
          ) : step === 'otp' ? (
            <>
              <h2 id="auth-modal-title">Введите код</h2>
              <p className="auth-modal-sub">
                Мы отправили 6-значный код на <strong style={{ color: '#e4e4e7' }}>{email}</strong>
              </p>

              {devCode && (
                <button
                  type="button"
                  className="auth-dev-code"
                  disabled={busy}
                  onClick={() => {
                    setDigits(devCode.split(''));
                    submitCode(devCode);
                  }}
                >
                  <span>Локальный режим — нажмите для входа</span>
                  <strong>{devCode}</strong>
                </button>
              )}

              <div className="auth-otp-row" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="auth-otp-digit"
                    value={d}
                    disabled={busy}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    aria-label={`Цифра ${i + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                className="auth-resend"
                disabled={resendIn > 0 || busy}
                onClick={handleResend}
              >
                {resendIn > 0
                  ? `Отправить снова через ${formatRetryCountdown(resendIn)}`
                  : 'Отправить код снова'}
              </button>
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  setDevCode('');
                  setStep('email');
                }}
              >
                ← Изменить email
              </button>
            </>
          ) : (
            <>
              <h2 id="auth-modal-title">Привязать Google</h2>
              <p className="auth-modal-sub">
                Вы вошли по коду на <strong style={{ color: '#e4e4e7' }}>{email}</strong>. Привяжите
                Google — в следующий раз вход будет без кода, в один клик.
              </p>
              <button
                type="button"
                className="auth-google-btn"
                disabled={busy}
                onClick={() => {
                  try {
                    startGoogleLogin(email);
                  } catch (e) {
                    setErr(e.message);
                  }
                }}
              >
                <GoogleIcon />
                Привязать и войти через Google
              </button>
              <button type="button" className="auth-back" onClick={closeAuthModal}>
                Пропустить — остаться на входе по коду
              </button>
            </>
          )}

          {err && <p className="auth-error" role="alert" aria-live="polite">{err}</p>}

          <p className="auth-legal-note">
            Продолжая, вы принимаете{' '}
            <a href="/offer" onClick={closeAuthModal}>
              оферту
            </a>{' '}
            и{' '}
            <a href="/privacy" onClick={closeAuthModal}>
              политику конфиденциальности
            </a>
            .
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
