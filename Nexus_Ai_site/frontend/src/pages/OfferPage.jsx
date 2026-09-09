import { Link } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import { LEGAL } from '../config/legal';

export default function OfferPage() {
  const updated = '3 июня 2026 г.';

  return (
    <LegalPageLayout title="Публичная оферта">
      <p className="text-zinc-500 text-xs">Редакция от {updated}</p>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">1. Общие положения</h2>
        <p>
          Настоящий документ является официальным предложением (публичной офертой){' '}
          {LEGAL.merchantName}, действующего как {LEGAL.statusLabel.toLowerCase()}, ИНН{' '}
          {LEGAL.inn} (далее — «Исполнитель»), заключить договор возмездного оказания услуг с
          любым дееспособным лицом (далее — «Заказчик»), принявшим условия оферты.
        </p>
        <p className="mt-3">
          Акцептом оферты считается оплата подписки на сервисе {LEGAL.serviceName} по адресу{' '}
          <a href={LEGAL.siteUrl} className="text-cyan-400 hover:underline break-all">
            {LEGAL.siteUrl}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">2. Предмет договора</h2>
        <p>
          Исполнитель предоставляет Заказчику доступ к облачным функциям {LEGAL.serviceName},
          включая личный кабинет, выбранный тарифный план и месячный пул использования
          ИИ-моделей в объёме, соответствующем оплаченному тарифу. Перечень тарифов и цены в
          рублях публикуются на странице{' '}
          <Link to="/pricing" className="text-cyan-400 hover:underline">
            «Тарифы»
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">3. Стоимость и порядок оплаты</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Стоимость подписки определяется выбранным тарифом на момент оформления заказа.</li>
          <li>
            Оплата производится в рублях РФ через платёжный сервис ЮKassa (
            {LEGAL.paymentProvider}).
          </li>
          <li>Услуга считается оплаченной с момента подтверждения успешного платежа.</li>
          <li>
            Исполнитель формирует чеки в соответствии с законодательством РФ (54-ФЗ) через
            возможности платёжного сервиса.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">4. Срок оказания услуги</h2>
        <p>
          Доступ по оплаченному тарифу предоставляется на 30 (тридцать) календарных дней с даты
          активации подписки, если иное не указано в интерфейсе при оплате. По истечении периода
          доступ к платным функциям прекращается до продления подписки.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">5. Возврат средств</h2>
        <p>
          Услуга носит цифровой характер и оказывается с момента активации доступа. Возврат
          возможен, если доступ не был предоставлен по вине Исполнителя, либо в иных случаях,
          предусмотренных законодательством РФ о защите прав потребителей. Для обращения напишите
          на{' '}
          <a href={`mailto:${LEGAL.email}`} className="text-cyan-400 hover:underline">
            {LEGAL.email}
          </a>{' '}
          с указанием email аккаунта и даты платежа.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">6. Ограничение ответственности</h2>
        <p>
          Сервис зависит от работы сторонних провайдеров ИИ и инфраструктуры. Исполнитель не
          гарантирует бесперебойную работу 24/7, но прилагает разумные усилия для восстановления
          сервиса. Ответственность Исполнителя ограничена суммой платежа Заказчика за последний
          оплаченный период подписки, если иное не предусмотрено императивными нормами закона.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">7. Персональные данные</h2>
        <p>
          Обработка персональных данных описана в{' '}
          <Link to="/privacy" className="text-cyan-400 hover:underline">
            Политике конфиденциальности
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-2">8. Реквизиты Исполнителя</h2>
        <p>
          {LEGAL.merchantName}, {LEGAL.statusLabel}, ИНН {LEGAL.inn}, email:{' '}
          <a href={`mailto:${LEGAL.email}`} className="text-cyan-400 hover:underline">
            {LEGAL.email}
          </a>
          . Подробнее — на странице{' '}
          <Link to="/requisites" className="text-cyan-400 hover:underline">
            «Реквизиты»
          </Link>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
