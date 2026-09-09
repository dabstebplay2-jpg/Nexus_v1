import SectionHeading from './SectionHeading';
import { projects } from '../data/siteData';

export default function Projects() {
  return (
    <section className="section section-muted" id="projects">
      <div className="container">
        <SectionHeading
          eyebrow="Projects"
          title="Проекты"
          text="Здесь собраны реальные, учебные и концептуальные проекты, через которые я показываю подход к структуре, дизайну и digital-упаковке."
        />
        <div className="projects-grid">
          {projects.map((project, index) => (
            <article className="project-card reveal" key={project.title}>
              <div className={`project-cover cover-${index + 1}`}>
                <div className="cover-window">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="cover-lines">
                  <b />
                  <b />
                  <b />
                </div>
              </div>
              <div className="project-body">
                <span className="project-type">{project.type}</span>
                <h3>{project.title}</h3>
                <p>{project.text}</p>
                <div className="tags project-tags">
                  {project.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <a className="text-link" href="#contact">Подробнее →</a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
