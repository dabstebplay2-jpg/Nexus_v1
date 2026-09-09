import { useState } from 'react';
import SectionHeading from './SectionHeading';
import { contactLinks } from '../data/siteData';

export default function Contact() {
  const [sent, setSent] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setSent(true);
    event.currentTarget.reset();
  };

  return (
    <section className="section contact-section" id="contact">
      <div className="container contact-grid">
        <div className="reveal">
          <SectionHeading eyebrow="Contact" title="Давай обсудим проект" />
          <p className="contact-text">
            Если тебе нужен сайт, портфолио, лендинг или digital-упаковка проекта — напиши мне.
            Я помогу превратить идею в понятную структуру и современный визуал.
          </p>
          <div className="contact-actions">
            <a className="button button-primary" href={contactLinks.telegram} target="_blank" rel="noreferrer">Написать в Telegram</a>
            <a className="button button-secondary" href={`mailto:${contactLinks.email}`}>Отправить email</a>
          </div>
          <div className="contact-note">
            Замени контакты в <code>src/data/siteData.js</code> на свои Telegram и email.
          </div>
        </div>

        <form className="contact-form reveal delay-1" onSubmit={handleSubmit}>
          <label>
            Имя
            <input type="text" name="name" placeholder="Как к тебе обращаться?" required />
          </label>
          <label>
            Контакт
            <input type="text" name="contact" placeholder="Telegram или email" required />
          </label>
          <label>
            Что нужно сделать
            <textarea name="message" rows="5" placeholder="Например: хочу портфолио, лендинг или упаковку проекта" required />
          </label>
          <button className="button button-primary" type="submit">Отправить</button>
          {sent && <p className="form-success">Спасибо! Сейчас форма работает как демо. Для связи используй Telegram или email.</p>}
        </form>
      </div>
    </section>
  );
}
