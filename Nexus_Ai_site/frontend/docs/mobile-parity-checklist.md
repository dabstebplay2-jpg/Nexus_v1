# Mobile parity checklist (manual)

Devices: iPhone SE, iPhone 15, Pixel 7, Samsung narrow — Safari + Chrome.

- [ ] Все пункты NAV доступны с телефона (drawer + bottom tabs)
- [ ] Чат: отправка, вложения, Research, web search, code panel swipe-close
- [ ] IDE: Explorer, Agent, Terminal sheet, Git, Settings, Account (More sheet)
- [ ] Оплата: TierPicker → YooKassa redirect → return URL
- [ ] Нет horizontal overflow на `/`, `/pricing`, `/ide/lite`
- [ ] Клавиатура не перекрывает поле ввода (visualViewport padding)

Automated: `npm run test:e2e` (Playwright, Pixel 7 viewport).
