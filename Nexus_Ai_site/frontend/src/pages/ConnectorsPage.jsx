import AppShell from '../components/layout/AppShell';
import { ProductPage } from '../components/ui/ProductPage';
import LegalFooter from '../components/LegalFooter';
import ConnectorsPageContent from '../features/connectors/ConnectorsPage';

export default function ConnectorsPage() {
  return (
    <AppShell hideHistory>
      <ProductPage containerClassName="max-w-5xl">
        <ConnectorsPageContent />
        <LegalFooter className="mt-12 rounded-2xl border border-[var(--nx-border)]" />
      </ProductPage>
    </AppShell>
  );
}
