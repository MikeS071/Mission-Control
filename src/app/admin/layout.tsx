import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { getAdminRedirectPath } from '@/lib/admin-auth';
import { authOptions, getServerSession } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const redirectPath = getAdminRedirectPath(session);

  if (redirectPath) {
    redirect(redirectPath);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <AdminSidebar />
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
