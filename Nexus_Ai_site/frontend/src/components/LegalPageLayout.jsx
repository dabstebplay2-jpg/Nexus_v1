import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import AppShell from './layout/AppShell';
import { PageHero, ProductPage, SurfaceCard } from './ui/ProductPage';
import LegalFooter from './LegalFooter';

export default function LegalPageLayout({ title, children }) {
  return (
    <AppShell hideHistory>
      <ProductPage containerClassName="max-w-3xl">
        <Link to="/pricing" className="mb-7 inline-flex items-center gap-2 text-sm text-[var(--nx-muted)] hover:text-teal-300">
          <ArrowLeft size={16} /> К тарифам
        </Link>
        <PageHero eyebrow="Документы Nexus" icon={FileText} title={title} description="Актуальные условия сервиса и юридическая информация." className="mb-8" />
        <SurfaceCard className="p-5 sm:p-8">
          <article className="legal-prose space-y-6 text-sm text-[var(--nx-muted)] leading-relaxed">{children}</article>
        </SurfaceCard>
        <LegalFooter className="mt-8 rounded-2xl border border-[var(--nx-border)]" />
      </ProductPage>
    </AppShell>
  );
}
