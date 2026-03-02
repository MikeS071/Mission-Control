import { ProvisioningPanel } from '@/components/ProvisioningPanel';

export default function AdminProvisioningPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Provisioning</h1>
        <p className="text-sm text-gray-400">Manage trial and production VPS provisioning workflows.</p>
      </header>

      <ProvisioningPanel />
    </section>
  );
}
