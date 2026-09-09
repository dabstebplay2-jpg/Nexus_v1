import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Nexus interface crashed', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-[100dvh] bg-[#08080a] text-zinc-100 flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900/90 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-400">Nexus</p>
          <h1 className="mt-2 text-2xl font-semibold">Интерфейс не смог загрузиться</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Обновите страницу. Если ошибка повторится, вернитесь на главную и сообщите в поддержку,
            что произошло перед сбоем.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-teal-400"
            >
              Обновить страницу
            </button>
            <a
              href="/"
              className="min-h-11 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium flex items-center hover:bg-white/5"
            >
              На главную
            </a>
          </div>
        </section>
      </main>
    );
  }
}
