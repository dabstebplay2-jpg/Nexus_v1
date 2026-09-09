import { useEffect, useState } from 'react';
import { navLinks } from '../data/siteData';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = () => setOpen(false);

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container header-inner">
        <a href="#top" className="logo" aria-label="Nexus homepage" onClick={closeMenu}>
          <span className="logo-mark">N</span>
          <span>Nexus</span>
        </a>

        <nav className={`nav ${open ? 'is-open' : ''}`} aria-label="Главная навигация">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={closeMenu}>
              {link.label}
            </a>
          ))}
        </nav>

        <a className="header-cta" href="#contact">
          Связаться
        </a>

        <button
          className={`menu-button ${open ? 'is-open' : ''}`}
          onClick={() => setOpen((value) => !value)}
          aria-label="Открыть меню"
          aria-expanded={open}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
