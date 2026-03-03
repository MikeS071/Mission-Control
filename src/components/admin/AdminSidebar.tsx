import Link from 'next/link';

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/tenants', label: 'Tenants' },
  { href: '/admin/policies', label: 'Policies' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/provisioning', label: 'Provisioning' },
  { href: '/admin/audit-log', label: 'Audit Log' },
  { href: '/admin/system', label: 'System' },
];

export function AdminSidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-gray-800 bg-gray-900/60 p-4">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-gray-400">Platform</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Admin</h2>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-800 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
