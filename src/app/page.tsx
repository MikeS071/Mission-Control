import Link from 'next/link';

const features = [
  {
    icon: '🗂️',
    title: 'Kanban Task Board',
    description:
      'Drag-drop task management with real-time SSE updates, priorities, and status tracking',
  },
  {
    icon: '🤖',
    title: 'Agent Assignment',
    description: "Assign tasks to specific agents, track progress per agent, see who's doing what",
  },
  {
    icon: '📊',
    title: 'Live Stats Dashboard',
    description:
      'Token usage, estimated cost, active agents, and task completion — auto-refreshing tiles',
  },
  {
    icon: '🔌',
    title: 'Gateway Integration',
    description:
      'Proxied connection to your OpenClaw gateway with health monitoring and status charts',
  },
  {
    icon: '🔒',
    title: 'Secure & Self-Hosted',
    description:
      'Google OAuth login, HTTPS-first, Cloudflare Tunnel support, no vendor lock-in',
  },
  {
    icon: '⚡',
    title: 'Real-time Updates',
    description: 'Server-Sent Events keep every connected client in sync instantly',
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-gray-950 to-gray-950" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl animate-pulse" />

      <div className="relative mx-auto flex max-w-6xl flex-col px-6 py-24 md:px-10">
        <section className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Command Your AI Squad</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg text-gray-300 sm:text-xl">
            Mission Control is your self-hosted hub for managing multi-agent AI workflows — tasks,
            coordination, and real-time oversight in one place.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signin"
              className="inline-flex h-11 items-center justify-center rounded-md bg-indigo-500 px-6 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Sign In →
            </Link>
            <Link
              href="https://github.com/MikeS071/Mission-Control"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-md border border-gray-700 bg-gray-900 px-6 text-sm font-semibold text-gray-100 transition hover:border-gray-500 hover:bg-gray-800"
            >
              View on GitHub →
            </Link>
          </div>
        </section>

        <section className="mt-20 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-lg shadow-black/20"
            >
              <div className="text-2xl">{feature.icon}</div>
              <h2 className="mt-4 text-xl font-semibold">{feature.title}</h2>
              <p className="mt-3 text-sm leading-6 text-gray-400">{feature.description}</p>
            </article>
          ))}
        </section>

        <footer className="mt-16 border-t border-gray-800 pt-8 text-center text-sm text-gray-400">
          Built with OpenClaw · archonhq.ai ·{' '}
          <Link
            href="https://github.com/MikeS071/Mission-Control"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-300 hover:text-indigo-200"
          >
            GitHub
          </Link>
        </footer>
      </div>
    </main>
  );
}
