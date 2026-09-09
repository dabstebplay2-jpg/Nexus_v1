import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const TITLES = {
  '/': 'Чат',
  '/ide/lite': 'IDE Web',
  '/browser': 'Скачать Browser',
  '/ide': 'Скачать IDE',
  '/pricing': 'Тарифы',
  '/updates': 'Изменения',
  '/spaces': 'Пространства',
  '/artifacts': 'Артефакты',
  '/connectors': 'Коннекторы',
};

export function usePageTitle() {
  const { pathname } = useLocation();
  const title = useMemo(() => {
    if (TITLES[pathname]) return TITLES[pathname];
    if (
      pathname.startsWith('/offer') ||
      pathname.startsWith('/privacy') ||
      pathname.startsWith('/requisites')
    ) return 'Документы';
    return 'Nexus';
  }, [pathname]);

  useEffect(() => {
    document.title = title === 'Nexus' ? 'Nexus — ИИ-чат и рабочее пространство' : `${title} — Nexus`;
  }, [title]);

  return title;
}
