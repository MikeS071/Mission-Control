import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TenantPolicyEditor } from '@/components/admin/TenantPolicyEditor';

type TenantPolicyDetailPageProps = {
  params: Promise<{ tenantId: string }>;
};

function toPositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export default async function AdminTenantPolicyPage({ params }: TenantPolicyDetailPageProps) {
  const { tenantId: tenantIdParam } = await params;
  const tenantId = toPositiveInt(tenantIdParam);

  if (!tenantId) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-8 text-gray-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Admin / Policies</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Tenant Policy</h1>
            <p className="mt-2 text-sm text-gray-400">Tenant ID: {tenantId}</p>
          </div>
          <Link href="/admin/policies" className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-gray-900">
            Back to policies
          </Link>
        </header>

        <TenantPolicyEditor tenantId={tenantId} />
      </div>
    </main>
  );
}
