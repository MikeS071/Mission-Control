'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

const delivered = [
  'Kanban board with drag-drop',
  'Real-time SSE updates',
  'Activity feed & per-card timeline',
  'Agent cost charts',
  'Gateway health monitoring',
  'Telegram notifications',
  'Filtering & search',
  'Bearer token API auth',
  'Docker Compose support',
  'OpenAPI docs (Swagger UI)',
  'Heartbeat sync',
  'Early access waitlist',
  'Landing page (archonhq.ai)',
  'Public roadmap',
];

const inProgress = ['Phase 4: Multi-tenancy & org model', 'OpenClaw connection wizard'];

const planned = [
  'AiPipe intelligent LLM router',
  'Gamification (XP, streaks, challenges, leaderboard)',
  'Multi-tenancy & org management',
  'Subscription billing (Stripe)',
  'Per-tenant API key vault',
  'Connect your OpenClaw instance',
  'Public blog',
  'Email newsletter',
  'Visual onboarding flow',
  'Mobile-responsive dashboard',
];

export default function RoadmapPage() {
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const cleanedEmail = email.trim().toLowerCase();
    const cleanedDescription = description.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      setError('Please enter a valid email.');
      return;
    }

    if (!cleanedDescription) {
      setError('Please enter a feature request.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/feature-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanedEmail, description: cleanedDescription }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || 'Could not submit request.');
        return;
      }

      setSuccess("Thanks! We'll review your request.");
      setEmail('');
      setDescription('');
    } catch {
      setError('Could not submit request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 px-6 py-12 text-white md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-extrabold">Product Roadmap</h1>
          <Link href="/" className="text-sm text-indigo-300 hover:text-indigo-200">
            ← Back to home
          </Link>
        </div>

        <p className="mt-4 text-gray-300">
          Track what&apos;s shipped, what&apos;s actively underway, and what&apos;s planned next.
        </p>

        <section className="mt-10 grid gap-6 md:grid-cols-3">
          <RoadmapColumn
            title="Delivered"
            dotClass="bg-emerald-400"
            items={delivered}
            cardClass="border-emerald-500/30 bg-emerald-500/5"
          />
          <RoadmapColumn
            title="In Progress"
            dotClass="bg-yellow-400"
            items={inProgress}
            cardClass="border-yellow-500/30 bg-yellow-500/5"
          />
          <RoadmapColumn
            title="Planned"
            dotClass="bg-gray-700"
            items={planned}
            cardClass="border-gray-700 bg-gray-900/60"
          />
        </section>

        <section className="mt-12 rounded-xl border border-white/10 bg-gray-900/70 p-6">
          <h2 className="text-2xl font-bold">Missing something?</h2>
          <p className="mt-2 text-sm text-gray-300">
            Submit a feature request and we&apos;ll review it for the roadmap.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="h-11 w-full rounded-md border border-white/15 bg-gray-950 px-4 text-sm text-white placeholder:text-gray-500 focus:border-indigo-400 focus:outline-none"
              required
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the feature you want..."
              rows={5}
              className="w-full rounded-md border border-white/15 bg-gray-950 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-indigo-400 focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 rounded-md bg-indigo-500 px-5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>

          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}
        </section>
      </div>
    </main>
  );
}

function RoadmapColumn({
  title,
  items,
  dotClass,
  cardClass,
}: {
  title: string;
  items: string[];
  dotClass: string;
  cardClass: string;
}) {
  return (
    <article className={`rounded-xl border p-5 ${cardClass}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-4 space-y-2 text-sm text-gray-200">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${dotClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
