import SectionHeading from './SectionHeading';
import { skillGroups } from '../data/siteData';

export default function Skills() {
  return (
    <section className="section" id="skills">
      <div className="container">
        <SectionHeading eyebrow="Skills" title="Навыки и инструменты" text="Ключевые направления, которые помогают соединять дизайн, структуру, аналитику и быстрый запуск." />
        <div className="skills-grid">
          {skillGroups.map((group) => (
            <article className="skill-card reveal" key={group.title}>
              <h3>{group.title}</h3>
              <div className="tags">
                {group.items.map((item) => <span key={item}>{item}</span>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
