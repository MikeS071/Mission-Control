import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AgentTeamsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/signin');
  }

  return (
    <iframe
      src="/agentteams-static/index.html"
      style={{
        width: '100vw',
        height: '100vh',
        border: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
      }}
      title="AgentTeams"
    />
  );
}
