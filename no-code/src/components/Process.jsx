import SectionHeading from './SectionHeading';
import { processSteps } from '../data/siteData';

export default function Process() {
  return (
    <section className="section" id="process">
      <div className="container">
        <SectionHeading eyebrow="Process" title="Как я работаю" text="Процесс помогает не теряться в дизайне и доводить проект от идеи до понятного результата." />
        <div className="timeline">
          {processSteps.map((step, index) => (
            <article className="timeline-item reveal" key={step.title}>
              <span className="timeline-number">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
