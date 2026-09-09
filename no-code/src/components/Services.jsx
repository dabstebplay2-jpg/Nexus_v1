import SectionHeading from './SectionHeading';
import { services } from '../data/siteData';

export default function Services() {
  return (
    <section className="section section-muted" id="services">
      <div className="container">
        <SectionHeading
          eyebrow="Services"
          title="Что я могу делать"
          text="Nexus объединяет несколько направлений: сайты без кода, UX/UI-дизайн, digital-упаковку и аналитику."
        />
        <div className="cards-grid services-grid">
          {services.map((service, index) => (
            <article className="service-card reveal" style={{ '--delay': `${index * 60}ms` }} key={service.title}>
              <span className="card-number">0{index + 1}</span>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
