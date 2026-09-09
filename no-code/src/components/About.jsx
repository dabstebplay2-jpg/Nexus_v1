import SectionHeading from './SectionHeading';
import { aboutCards } from '../data/siteData';

export default function About() {
  return (
    <section className="section" id="about">
      <div className="container split-section">
        <div className="reveal">
          <SectionHeading eyebrow="About" title="Обо мне" />
          <div className="rich-text">
            <p>
              Я развиваюсь на стыке UX/UI-дизайна, no-code разработки, маркетплейсов и digital-аналитики.
              Мне интересно создавать не просто красивые страницы, а понятные системы: от идеи и структуры до
              визуальной упаковки и запуска.
            </p>
            <p>
              В проектах я смотрю не только на внешний вид, но и на логику: что человек видит первым,
              как он понимает ценность, где принимает решение и почему оставляет заявку.
            </p>
          </div>
        </div>

        <div className="about-grid reveal delay-1">
          {aboutCards.map((card) => (
            <article className="soft-card" key={card.title}>
              <div className="card-icon">{card.title.slice(0, 1)}</div>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
