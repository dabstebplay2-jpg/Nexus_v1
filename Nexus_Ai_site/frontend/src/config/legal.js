/**
 * Реквизиты продавца для ЮKassa и юридических страниц.
 * При смене ИП/почты обновите только этот файл.
 */
export const LEGAL = {
  serviceName: 'Nexus Pro',
  merchantName: 'Чикаидзе Давид Бесикович',
  statusLabel: 'Самозанятый (плательщик налога на профессиональный доход, НПД)',
  inn: '261813891711',
  email: 'nexusai1995@mail.ru',
  siteUrl:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_SITE_URL) ||
    'https://nexus-zeta-ruby-12.vercel.app',
  paymentProvider: 'ООО НКО «ЮMoney» (сервис ЮKassa)',
  supportHours: 'Ответ на обращения — в течение 3 рабочих дней',
};
