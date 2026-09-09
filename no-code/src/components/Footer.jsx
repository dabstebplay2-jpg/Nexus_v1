import { navLinks } from '../data/siteData';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <a href="#top" className="logo footer-logo">
            <span className="logo-mark">N</span>
            <span>Nexus</span>
          </a>
          <p>Nexus — personal portfolio focused on no-code, UX/UI and digital packaging.</p>
        </div>
        <nav className="footer-nav" aria-label="Footer navigation">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
        <div className="footer-copy">© 2026 Nexus. Designed with AI-assisted workflow.</div>
      </div>
    </footer>
  );
}
