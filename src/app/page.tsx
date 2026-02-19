'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProductPreview } from '@/components/ProductPreview';

type WaitlistResponse = {
  ok?: boolean;
  position?: number;
  alreadyJoined?: boolean;
  error?: string;
};

const valueProps = [
  {
    icon: '🎯',
    title: 'Intelligent Routing',
    description:
      'AiPipe automatically routes every LLM call to the cheapest capable model. Simple prompts hit gpt-4o-mini. Complex reasoning escalates to Sonnet or Opus. Same quality, fraction of the cost.',
  },
  {
    icon: '🏆',
    title: 'Gamified Agent Management',
    description:
      'Earn XP, maintain streaks, and compete on leaderboards — Duolingo for your AI agents. Daily challenges turn agent maintenance from a chore into a habit.',
  },
  {
    icon: '🔌',
    title: 'OpenClaw-Native',
    description:
      'Built specifically for OpenClaw. Connect your gateway in 60 seconds, see all your agents in one place, and get Telegram alerts the moment something goes wrong.',
  },
];

const features = [
  {
    icon: '🗂️',
    title: 'Kanban Board',
    description:
      'Drag-drop task management with real-time SSE updates, priorities, WIP limits, and collapsible columns.',
  },
  {
    icon: '🪟',
    title: '3-Pane Dashboard',
    description:
      'Resizable Agent Team panel, Kanban board, and Chat — side by side. Drag the dividers to own your layout.',
  },
  {
    icon: '💬',
    title: 'Agent Chat',
    description:
      'Threaded conversations with your primary agent. Switch topics with the thread sidebar — input always in view.',
  },
  {
    icon: '📊',
    title: 'Live Cost Dashboard',
    description:
      'Token usage, estimated spend, and savings vs direct API — all auto-refreshing. Set a monthly token budget and track % consumed.',
  },
  {
    icon: '🔀',
    title: 'Smart LLM Router',
    description:
      'AiPipe routes to the cheapest model for each task. Cache hit = zero cost. Track savings in real-time.',
    comingSoon: true,
  },
  {
    icon: '🏆',
    title: 'Agent Challenges',
    description:
      'Weekly missions, XP, streaks, and leaderboards. Keep your agents — and yourself — on track.',
    comingSoon: true,
  },
  {
    icon: '📡',
    title: 'Activity Feed',
    description:
      'Every task change, agent update, and system event in a live timeline. Full audit trail per card.',
  },
  {
    icon: '🔒',
    title: 'Self-Hosted & Secure',
    description:
      'Your data stays on your infrastructure. Google OAuth, HTTPS, Cloudflare Tunnel, bearer token API.',
  },
];

const pricing = [
  {
    name: 'Free',
    price: '$0/mo',
    details: [
      '1 user',
      '3 agents',
      'Basic gamification',
      '7-day logs',
      'Community support',
      '—',
    ],
    ctaLabel: 'Self-host on GitHub',
    ctaHref: 'https://github.com/MikeS071/Mission-Control',
    external: true,
  },
  {
    name: 'Pro',
    price: '$29/mo',
    details: [
      '1 user',
      'Unlimited agents',
      'Full gamification',
      '30-day logs',
      'Priority support',
      'AiPipe router',
    ],
    ctaLabel: 'Join Waitlist',
    ctaHref: '#waitlist',
    popular: true,
  },
  {
    name: 'Team',
    price: '$19/seat/mo',
    details: [
      'Min 10 seats ($190/mo)',
      'Unlimited seats',
      'Team leaderboard',
      '90-day logs',
      'Priority support',
      'AiPipe router + team analytics',
    ],
    ctaLabel: 'Join Waitlist',
    ctaHref: '#waitlist',
  },
];

export default function LandingPage() {
  const [count, setCount] = useState(0);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadCount = async () => {
      try {
        const res = await fetch('/api/waitlist');
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        setCount(data.count ?? 0);
      } catch {
        // noop
      }
    };

    void loadCount();
  }, []);

  const handleJoinWaitlist = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const trimmedEmail = email.trim().toLowerCase();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

    if (!validEmail) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, source: 'landing' }),
      });

      const data = (await res.json()) as WaitlistResponse;

      if (res.status === 409 || data.alreadyJoined) {
        setSuccess("You're already on the list! 👋");
        setEmail('');
        return;
      }

      if (!res.ok || !data.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      const positionText = data.position ? ` You're #${data.position} on the waitlist.` : '';
      setSuccess(`🎉 You're on the list! We'll be in touch.${positionText}`);
      if (data.position) {
        setCount((current) => Math.max(current, data.position ?? current));
      }
      setEmail('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/70 backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <span className="text-lg font-extrabold tracking-tight">🧭 archonhq</span>
          <div className="flex items-center gap-3">
            <Link
              href="/roadmap"
              className="hidden items-center rounded-md px-4 text-sm font-medium text-gray-300 transition hover:bg-white/10 sm:inline-flex sm:h-10"
            >
              Roadmap
            </Link>
            <Link
              href="/signin"
              className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-gray-200 transition hover:bg-white/10"
            >
              Sign In
            </Link>
            <a
              href="#waitlist"
              className="inline-flex h-10 items-center rounded-md bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Get Early Access
            </a>
          </div>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-14 md:px-10 md:pt-20">
        <section className="text-center">
          <div className="mx-auto inline-flex items-center rounded-full border border-indigo-400/40 bg-indigo-500/10 px-4 py-1 text-xs font-medium text-indigo-200">
            Now in Early Access · Join the waitlist
          </div>
          <h1 className="mt-6 whitespace-pre-line bg-gradient-to-r from-indigo-300 via-indigo-100 to-purple-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl">
            {`Command Your AI Squad.\nCut Your LLM Bill in Half.`}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-gray-300 sm:text-lg">
            Mission Control is the operating system for your OpenClaw agents — real-time oversight,
            intelligent LLM routing, and a gamified challenge system that keeps your agents
            performing at their best.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#waitlist"
              className="inline-flex h-11 items-center justify-center rounded-md bg-indigo-500 px-6 text-sm font-semibold text-white transition hover:bg-indigo-400"
            >
              Join the Waitlist
            </a>
            <Link
              href="https://github.com/MikeS071/Mission-Control"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-md border border-gray-700 bg-gray-900 px-6 text-sm font-semibold text-gray-100 transition hover:border-gray-500 hover:bg-gray-800"
            >
              Self-host free →
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            🔒 No credit card · Self-host always free · {count} builders on the waitlist
          </p>
        </section>

        {/* Product preview */}
        <section className="mt-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold">See it in action</h2>
            <p className="mt-3 text-gray-400 max-w-2xl mx-auto text-sm leading-6">
              A real-time command centre for your AI agents — overview, task management, and chat in one resizable workspace.
            </p>
          </div>
          <ProductPreview />
        </section>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {valueProps.map((item) => (
            <article key={item.title} className="rounded-xl border border-white/10 bg-gray-900/70 p-6">
              <div className="text-2xl">{item.icon}</div>
              <h2 className="mt-3 text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-300">{item.description}</p>
            </article>
          ))}
          {features.map((feature) => (
            <article
              key={feature.title}
              className="relative rounded-xl border border-white/10 bg-gray-900/70 p-5"
            >
              {feature.comingSoon ? (
                <span className="absolute right-3 top-3 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
                  Coming soon
                </span>
              ) : null}
              <div className="text-2xl">{feature.icon}</div>
              <h3 className="mt-3 pr-20 text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-300">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="mt-20">
          <h2 className="text-center text-3xl font-bold">Simple pricing for every stage</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {pricing.map((tier) => (
              <article
                key={tier.name}
                className={`relative rounded-2xl border p-6 ${
                  tier.popular
                    ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-900/40'
                    : 'border-white/10 bg-gray-900/70'
                }`}
              >
                {tier.popular ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                ) : null}
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <p className="mt-2 text-3xl font-extrabold">{tier.price}</p>
                <ul className="mt-5 space-y-2 text-sm text-gray-300">
                  {tier.details.map((detail) => (
                    <li key={detail}>• {detail}</li>
                  ))}
                </ul>
                {tier.external ? (
                  <Link
                    href={tier.ctaHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-sm font-medium hover:bg-gray-800"
                  >
                    {tier.ctaLabel}
                  </Link>
                ) : (
                  <a
                    href={tier.ctaHref}
                    className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-indigo-500 text-sm font-semibold text-white hover:bg-indigo-400"
                  >
                    {tier.ctaLabel}
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-2xl border border-white/10 bg-gray-900/50 px-8 py-10 md:px-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold">What&apos;s coming next?</h2>
              <p className="mt-2 max-w-xl text-sm text-gray-300">
                AiPipe router, gamification, multi-tenancy, Stripe billing — see what&apos;s
                shipped, in progress, and planned. Vote for what matters to you.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {['✅ Kanban + Agent Chat', '✅ Cost Savings Tracking', '🔜 AiPipe Router', '🔜 Stripe Billing'].map(
                  (item) => (
                    <li
                      key={item}
                      className="rounded-full border border-white/10 bg-gray-800 px-3 py-1 text-xs text-gray-200"
                    >
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <Link
              href="/roadmap"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-indigo-400/60 px-6 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300 hover:text-indigo-100"
            >
              View full roadmap →
            </Link>
          </div>
        </section>

        <section
          id="waitlist"
          className="mt-20 rounded-2xl border border-indigo-400/40 bg-gradient-to-br from-indigo-900/40 to-gray-900 p-8 md:p-10"
        >
          <h2 className="text-3xl font-extrabold">Be First. Shape the Product.</h2>
          <p className="mt-3 max-w-3xl text-gray-200">
            Join the early access waitlist. Get notified when Pro launches, lock in founding member
            pricing, and help us prioritise what we build next.
          </p>

          <ul className="mt-6 space-y-2 text-sm text-gray-100 md:text-base">
            <li>✅ Founding member pricing — locked in at launch</li>
            <li>✅ Early access before public launch</li>
            <li>✅ Monthly product updates &amp; roadmap previews</li>
          </ul>

          <form onSubmit={handleJoinWaitlist} className="mt-7 flex flex-col gap-3 md:flex-row">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="h-11 flex-1 rounded-md border border-white/20 bg-gray-950/80 px-4 text-white placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-md bg-indigo-500 px-6 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Joining...' : 'Join Waitlist'}
            </button>
          </form>

          <p className="mt-3 text-sm text-indigo-100">Join {count} builders already on the waitlist</p>

          {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
          {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}
        </section>
      </div>

      <footer className="border-t border-white/10 py-6 text-xs text-gray-400">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row md:px-10">
          <p>🧭 archonhq · Built with OpenClaw</p>
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/MikeS071/Mission-Control"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              GitHub
            </Link>
            <Link href="/signin" className="hover:text-white">
              Sign In
            </Link>
            <Link href="/roadmap" className="hover:text-white">
              Roadmap
            </Link>
          </div>
          <p>© 2026 archonhq.ai</p>
        </div>
      </footer>
    </main>
  );
}
