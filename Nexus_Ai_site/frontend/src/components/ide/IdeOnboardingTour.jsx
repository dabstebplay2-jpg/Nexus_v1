import { useState } from 'react';
import { FolderTree, Sparkles, User, X } from 'lucide-react';

const STEPS = [
  {
    icon: FolderTree,
    title: 'Explorer',
    text: 'Дерево файлов проекта. В демо-режиме — встроенный пример, локально — ваша папка.',
    tab: 'explorer',
  },
  {
    icon: Sparkles,
    title: 'Agent',
    text: 'Облачный ИИ с контекстом файлов: правки, объяснения, быстрые сценарии.',
    tab: 'ai',
  },
  {
    icon: User,
    title: 'Аккаунт',
    text: 'Войдите через Google — тот же тариф и баланс, что на сайте.',
    tab: 'profile',
  },
];

const STORAGE_KEY = 'nexus_ide_lite_tour_done';

export function shouldShowIdeTour() {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function dismissIdeTour() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export default function IdeOnboardingTour({ onGoToTab, onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;

  const finish = () => {
    dismissIdeTour();
    onClose?.();
  };

  const next = () => {
    onGoToTab?.(current.tab);
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-teal-500/30 bg-[#12141a] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30">
            <Icon size={20} className="text-teal-400" />
          </div>
          <button
            type="button"
            onClick={finish}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400/80 mb-1">
          Шаг {step + 1} из {STEPS.length}
        </p>
        <h3 className="text-lg font-semibold text-white mb-2">{current.title}</h3>
        <p className="text-sm text-zinc-400 leading-relaxed mb-5">{current.text}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={next}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold"
          >
            {step >= STEPS.length - 1 ? 'Готово' : 'Далее'}
          </button>
          <button
            type="button"
            onClick={finish}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-sm text-zinc-400 hover:text-white"
          >
            Пропустить
          </button>
        </div>
      </div>
    </div>
  );
}
