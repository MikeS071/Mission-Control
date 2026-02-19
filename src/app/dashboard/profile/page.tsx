import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/signin');

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="mt-2 text-sm text-gray-400">Profile management coming soon.</p>
      <div className="mt-4 rounded-md border border-gray-800 bg-gray-900 p-4 text-sm">
        <div>Email: {session.user?.email ?? 'Unknown'}</div>
      </div>
    </div>
  );
}
