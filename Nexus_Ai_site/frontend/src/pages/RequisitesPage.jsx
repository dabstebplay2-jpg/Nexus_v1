import { Link } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import { LEGAL } from '../config/legal';

export default function RequisitesPage() {
  return (
    <LegalPageLayout title="Реквизиты и контакты">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Продавец услуг</h2>
        <dl className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <dt className="text-zinc-500">ФИО</dt>
          <dd className="text-zinc-200">{LEGAL.merchantName}</dd>
          <dt className="text-zinc-500">Статус</dt>
          <dd className="text-zinc-200">{LEGAL.statusLabel}</dd>
          <dt className="text-zinc-500">ИНН</dt>
          <dd className="text-zinc-200 font-mono">{LEGAL.inn}</dd>
          <dt className="text-zinc-500">Email</dt>
          <dd>
            <a href={`mailto:${LEGAL.email}`} className="text-cyan-400 hover:underline">
              {LEGAL.email}
            </a>
          </dd>
          <dt className="text-zinc-500">Сайт</dt>
          <dd>
            <a href={LEGAL.siteUrl} className="text-cyan-400 hover:underline break-all">
              {LEGAL.siteUrl}
            </a>
          </dd>
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Об услуге</h2>
        <p>
          {LEGAL.serviceName} — облачный сервис доступа к ИИ-моделям по подписке: личный кабинет,
          тарифы с месячным пулом использования, интеграция с IDE. Стоимость тарифов указана на
          странице{' '}
          <Link to="/pricing" className="text-cyan-400 hover:underline">
            «Тарифы»
          </Link>{' '}
          в рублях; пересчёт из USD по курсу ЦБ РФ на дату оформления счёта.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Оплата</h2>
        <p>
          Приём платежей осуществляется через {LEGAL.paymentProvider}. После успешной оплаты
          подписка активируется автоматически на срок 30 календарных дней, если иное не указано в
          оферте.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Поддержка</h2>
        <p>
          По вопросам оплаты, активации тарифа и работы сервиса:{' '}
          <a href={`mailto:${LEGAL.email}`} className="text-cyan-400 hover:underline">
            {LEGAL.email}
          </a>
          . {LEGAL.supportHours}.
        </p>
      </section>
    </LegalPageLayout>
  );
}
