import LegalPageLayout from '../components/LegalPageLayout';
import { LEGAL } from '../config/legal';

export default function PrivacyPage() {
  const updated = '3 июня 2026 г.';

  return (
    <LegalPageLayout title="Политика конфиденциальности">
      <p className="text-zinc-500 text-xs">Редакция от {updated}</p>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">1. Оператор</h2>
        <p>
          Оператор персональных данных: {LEGAL.merchantName}, ИНН {LEGAL.inn},{' '}
          {LEGAL.statusLabel.toLowerCase()}. Контакт:{' '}
          <a href={`mailto:${LEGAL.email}`} className="text-cyan-400 hover:underline">
            {LEGAL.email}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">2. Какие данные собираем</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Адрес электронной почты при регистрации и входе.</li>
          <li>Данные профиля Google при входе через OAuth (если вы выбрали этот способ).</li>
          <li>Технические данные: IP, тип браузера, cookies сессии для авторизации.</li>
          <li>История запросов к ИИ и данные подписки — для оказания услуги и учёта лимитов.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">3. Цели обработки</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Регистрация и аутентификация в {LEGAL.serviceName}.</li>
          <li>Оказание услуг по подписке, биллинг, поддержка пользователей.</li>
          <li>Исполнение требований законодательства РФ.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">4. Передача третьим лицам</h2>
        <p>
          Данные могут передаваться хостинг-провайдерам (Vercel, Render), платёжному сервису
          ЮKassa, провайдеру ИИ (Polza.ai) и сервису email-рассылок — только в объёме,
          необходимом для работы сервиса.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">5. Хранение и права</h2>
        <p>
          Данные хранятся на время действия аккаунта и разумный срок после удаления. Вы можете
          запросить уточнение, обновление или удаление данных, написав на {LEGAL.email}.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">6. Cookies</h2>
        <p>
          Сайт использует локальное хранилище браузера и cookies для токенов входа. Без них
          авторизация и работа кабинета невозможны.
        </p>
      </section>
    </LegalPageLayout>
  );
}
