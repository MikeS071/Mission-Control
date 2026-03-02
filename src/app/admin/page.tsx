import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  {
    title: 'Users',
    description: 'User management and access controls.',
  },
  {
    title: 'Tenants',
    description: 'Tenant lifecycle, plans, and ownership.',
  },
  {
    title: 'System',
    description: 'Platform health, jobs, and operational settings.',
  },
];

export default async function AdminPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Admin Dashboard</h1>
        <p className="text-sm text-gray-400">Platform administration overview.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title} className="border-gray-800 bg-gray-900/70 text-gray-100">
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription className="text-gray-400">{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-gray-300">Placeholder content</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
