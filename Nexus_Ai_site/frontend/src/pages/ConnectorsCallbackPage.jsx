import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

export default function ConnectorsCallbackPage() {
  const [params] = useSearchParams();
  const [msg, setMsg] = useState('Обработка…');

  useEffect(() => {
    const status = params.get('status');
    const connector = params.get('connector');
    const label = params.get('label');
    const error = params.get('error');
    if (error) {
      setMsg(`Ошибка подключения (${connector || '?'}): ${error}`);
      return;
    }
    if (status === 'ok') {
      setMsg(
        label
          ? `Подключено: ${decodeURIComponent(label)} (${connector})`
          : `Коннектор ${connector} подключён.`
      );
      return;
    }
    setMsg('Завершение OAuth…');
  }, [params]);

  return (
    <div className="nx-dvh-screen bg-[#07070a] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-zinc-300 max-w-md">{msg}</p>
      <Link
        to="/?settings=connectors"
        className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-500"
      >
        Вернуться к коннекторам
      </Link>
    </div>
  );
}
