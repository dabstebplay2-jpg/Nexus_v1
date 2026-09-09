import { heroStats } from '../data/siteData';

export default function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-grid container">
        <div className="hero-content reveal">
          <span className="badge">No-code • UX/UI • Digital Packaging</span>
          <h1>Nexus — пространство, где дизайн, no-code и аналитика соединяются в понятные digital-продукты</h1>
          <p>
            Я создаю современные сайты и интерфейсы без лишней сложности: продумываю структуру,
            визуал, путь пользователя и упаковку проекта так, чтобы он выглядел понятно, сильно и профессионально.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#projects">Посмотреть проекты</a>
            <a className="button button-secondary" href="#contact">Связаться со мной</a>
          </div>
        </div>

        <div className="hero-panel reveal delay-1" aria-label="Nexus skills dashboard">
          <div className="panel-topbar">
            <span />
            <span />
            <span />
          </div>
          <div className="panel-orbit">
            <div className="orbit-center">Nexus</div>
            <div className="orbit-node node-1">UX</div>
            <div className="orbit-node node-2">AI</div>
            <div className="orbit-node node-3">Code</div>
            <div className="orbit-node node-4">Data</div>
          </div>
          <div className="panel-metrics">
            {heroStats.map((stat) => (
              <div className="metric" key={stat.value}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
