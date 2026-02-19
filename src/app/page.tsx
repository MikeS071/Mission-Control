'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProductPreview } from '@/components/ProductPreview';

// ─── Types ────────────────────────────────────────────────────────────────────

type WaitlistResponse = {
  ok?: boolean;
  position?: number;
  alreadyJoined?: boolean;
  error?: string;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: '🗂️',
    color: 'border-indigo-500/20 bg-indigo-500/5',
    title: 'Kanban Board',
    desc: 'Drag-drop task management with real-time updates, priorities, WIP limits, and collapsible columns.',
  },
  {
    icon: '📊',
    color: 'border-emerald-500/20 bg-emerald-500/5',
    title: 'Live Cost Dashboard',
    desc: 'Token usage, estimated spend, and savings vs direct API — all auto-refreshing. Set a monthly budget and track % consumed.',
  },
  {
    icon: '🔀',
    color: 'border-amber-500/20 bg-amber-500/5',
    title: 'Smart LLM Router',
    desc: 'AiPipe routes to the cheapest capable model for each task. Same quality, fraction of the cost.',
    soon: true,
  },
  {
    icon: '🏆',
    color: 'border-purple-500/20 bg-purple-500/5',
    title: 'Agent Challenges',
    desc: 'Weekly missions, XP, streaks, and leaderboards to keep your agents — and yourself — on track.',
    soon: true,
  },
  {
    icon: '📡',
    color: 'border-blue-500/20 bg-blue-500/5',
    title: 'Activity Feed',
    desc: 'Every task change, agent update, and system event in a live timeline. Full audit trail per card.',
  },
  {
    icon: '🔒',
    color: 'border-gray-500/20 bg-gray-500/5',
    title: 'Self-Hosted & Secure',
    desc: 'Your data stays on your infrastructure. Google OAuth, HTTPS, Cloudflare Tunnel, bearer token API.',
  },
];

const pricing = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    items: ['1 user', '3 agents', 'Basic gamification', '7-day logs', 'Community support'],
    missing: ['AiPipe router'],
    cta: 'Self-host on GitHub',
    href: 'https://github.com/MikeS071/Mission-Control',
    external: true,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    items: ['1 user', 'Unlimited agents', 'Full gamification + XP', '30-day logs', 'Priority support', 'AiPipe router'],
    missing: [],
    cta: 'Lock in founding price →',
    href: '#waitlist',
    featured: true,
  },
  {
    name: 'Team',
    price: '$19',
    period: '/seat/mo',
    items: ['Min 10 seats', 'Unlimited seats', 'Team leaderboard', '90-day logs', 'Priority support', 'AiPipe + team analytics'],
    missing: [],
    cta: 'Join Waitlist',
    href: '#waitlist',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5" style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>
      <span className="h-[2px] w-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-400" />
      <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-indigo-400">{children}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [count, setCount] = useState(0);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/waitlist')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { count?: number } | null) => { if (d?.count) setCount(d.count); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError('Please enter a valid email.'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: trimmed, source: 'landing' }) });
      const data = (await res.json()) as WaitlistResponse;
      if (res.status === 409 || data.alreadyJoined) { setSuccess("You're already on the list! 👋"); setEmail(''); return; }
      if (!res.ok || !data.ok) { setError(data.error ?? 'Something went wrong.'); return; }
      const pos = data.position ? ` You're #${data.position}.` : '';
      setSuccess(`🎉 You're in!${pos}`);
      if (data.position) setCount((c) => Math.max(c, data.position ?? c));
      setEmail('');
    } catch { setError('Something went wrong. Please try again.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#080d14] text-white">

      {/* ── Background orbs ── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-64 -top-64 h-[700px] w-[700px] rounded-full bg-indigo-700/10 blur-[140px]" style={{ animation: 'pulse 9s ease-in-out infinite' }} />
        <div className="absolute -bottom-64 -right-32 h-[600px] w-[600px] rounded-full bg-purple-700/8 blur-[120px]" style={{ animation: 'pulse 12s ease-in-out infinite', animationDelay: '-5s' }} />
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-800/5 blur-[140px]" />
      </div>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080d14]/80 backdrop-blur-xl">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <span className="text-lg font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>🧭 archonhq</span>
          <div className="flex items-center gap-2">
            <Link href="/roadmap" className="hidden rounded-md px-4 py-2 text-sm text-gray-400 transition hover:text-white sm:block">Roadmap</Link>
            <Link href="/signin" className="rounded-md px-4 py-2 text-sm text-gray-400 transition hover:text-white">Sign In</Link>
            <a href="#waitlist" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">
              Get Early Access
            </a>
          </div>
        </nav>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 md:px-10">

        {/* ══ HERO ══ */}
        <section className="flex min-h-[88vh] flex-col items-center justify-center py-24 text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/8 px-4 py-1.5" style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            <span className="text-xs text-indigo-300">
              {count > 0 ? `Early Access · ${count} builders already in` : 'Now in Early Access'}
            </span>
          </div>

          {/* Heading */}
          <h1
            className="max-w-3xl text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl"
            style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
          >
            Command Your AI Squad.{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-400 bg-clip-text text-transparent">
              Cut Your LLM Bill in Half.
            </span>
          </h1>

          {/* Sub */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400">
            The operating system for your OpenClaw agents — real-time oversight, intelligent LLM routing,
            and a gamified challenge system. All in one resizable dashboard.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#waitlist"
              className="rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-900/40"
            >
              Get early access — it&apos;s free
            </a>
            <Link
              href="https://github.com/MikeS071/Mission-Control"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-8 py-3.5 text-sm font-semibold text-gray-200 transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              Self-host free →
            </Link>
          </div>

          {/* Trust strip */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-600" style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>
            <span>✅ No credit card</span>
            <span>✅ MIT Licensed</span>
            <span>✅ Self-host always free</span>
            <span>⚡ Founding pricing locked at sign-up</span>
          </div>
        </section>

        {/* ══ HOW IT WORKS ══ */}
        <section className="py-24">
          <SectionLabel>Getting Started</SectionLabel>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
            Up and running in minutes
          </h2>
          <p className="mt-4 max-w-lg text-gray-400">No complex setup. Connect your gateway, see everything, start saving.</p>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { n: '01', icon: '🔌', title: 'Connect', desc: 'Link your OpenClaw gateway in 60 seconds. One token, instant visibility into every agent session.' },
              { n: '02', icon: '🪟', title: 'See everything', desc: 'All your agents, tasks, costs, and chat in one resizable workspace. No tab-switching, no context loss.' },
              { n: '03', icon: '📉', title: 'Spend less', desc: 'AiPipe routes every LLM call to the cheapest capable model. Track your savings vs direct API in real time.' },
            ].map(({ n, icon, title, desc }) => (
              <div key={n} className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gray-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/25 hover:bg-gray-900/60">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="mb-5 text-[11px] font-bold tracking-[0.15em] text-indigo-500" style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>{n}</div>
                <div className="mb-4 text-3xl">{icon}</div>
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══ PRODUCT PREVIEW ══ */}
        <section className="py-24">
          <div className="mb-12 max-w-xl">
            <SectionLabel>The Dashboard</SectionLabel>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
              See it in action
            </h2>
            <p className="mt-4 text-gray-400">
              A real-time command centre for your AI agents — task management, cost tracking, and chat in one workspace.
            </p>
          </div>
          <ProductPreview />
        </section>

        {/* ══ GAMIFICATION ══ */}
        <section className="py-24">
          <div className="overflow-hidden rounded-3xl border border-amber-500/15 bg-gradient-to-br from-amber-950/20 via-gray-900/60 to-gray-950 px-8 py-14 md:px-14">
            <div className="flex flex-col gap-12 md:flex-row md:items-center">
              <div className="flex-1">
                <SectionLabel>Coming Soon</SectionLabel>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
                  Level up your AI operation
                </h2>
                <p className="mt-4 max-w-md text-gray-400 leading-relaxed">
                  Every task completed, challenge solved, and milestone hit earns you XP.
                  Level up to unlock real benefits — not just bragging rights.
                </p>
                <div className="mt-8 space-y-4">
                  {[
                    { level: 'Level 5', perk: 'Extended log history (90 days)', color: 'text-amber-400' },
                    { level: 'Level 10', perk: 'Custom agent personas & names', color: 'text-orange-400' },
                    { level: 'Level 20', perk: 'Priority model routing + reduced latency', color: 'text-red-400' },
                    { level: 'Level 50', perk: 'Founding Legend — permanent badge & perks', color: 'text-purple-400' },
                  ].map(({ level, perk, color }) => (
                    <div key={level} className="flex items-center gap-4">
                      <span className={`w-16 flex-shrink-0 text-xs font-bold ${color}`} style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>{level}</span>
                      <div className="flex-1 h-px bg-gray-800" />
                      <span className="text-sm text-gray-300">{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full flex-shrink-0 space-y-4 md:w-60">
                <div className="rounded-2xl border border-amber-500/20 bg-gray-900/80 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300">🌟 Daily Challenge</span>
                    <span className="text-xs text-gray-500">+150 XP</span>
                  </div>
                  <p className="text-sm font-medium text-white">Close 3 In Progress tasks</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-800">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: '66%' }} />
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-600">2 of 3 complete</p>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-gray-900/80 p-5">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Level 7 · Operator</span>
                    <span className="text-xs text-indigo-400">2,340 XP</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-800">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: '47%' }} />
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-600">47% to Level 8</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {['7-day streak 🔥', 'Early Backer ⚡', '10 tasks ✅'].map((b) => (
                      <span key={b} className="rounded-full border border-gray-700/60 bg-gray-800 px-2 py-0.5 text-[9px] text-gray-400">{b}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ FEATURES ══ */}
        <section className="py-24">
          <SectionLabel>Capabilities</SectionLabel>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
            Everything you need to run AI at scale
          </h2>
          <p className="mt-4 max-w-lg text-gray-400">Built for OpenClaw operators who want visibility, control, and lower costs.</p>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gray-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/25 hover:bg-gray-900/60 hover:shadow-xl hover:shadow-black/20">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                {f.soon && (
                  <span className="absolute right-4 top-4 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
                    Coming soon
                  </span>
                )}
                <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-[13px] border text-xl ${f.color}`}>
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{f.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ══ PRICING ══ */}
        <section className="py-24">
          <SectionLabel>Access Levels</SectionLabel>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
            Simple pricing for every stage
          </h2>
          <p className="mt-4 max-w-lg text-gray-400">Sign up now to lock in founding member pricing — guaranteed for life.</p>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {pricing.map((tier) => (
              <article
                key={tier.name}
                className={`relative overflow-hidden rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
                  tier.featured
                    ? 'border-indigo-500/40 bg-indigo-500/5 shadow-lg shadow-indigo-900/20'
                    : 'border-white/[0.07] bg-gray-900/40 hover:border-indigo-500/20 hover:bg-gray-900/60'
                }`}
              >
                {tier.featured && (
                  <>
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-purple-500 to-transparent" />
                    <span className="absolute right-5 top-5 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white">Most Popular</span>
                  </>
                )}
                <h3 className="text-sm font-medium text-gray-400">{tier.name}</h3>
                <div className="mt-2 flex items-end gap-1">
                  <span className="text-4xl font-extrabold tracking-tight text-white" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>{tier.price}</span>
                  <span className="mb-1 text-sm text-gray-500">{tier.period}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {tier.items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-300">
                      <span className="text-emerald-400 text-xs">✓</span> {item}
                    </li>
                  ))}
                  {tier.missing.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <span className="text-xs">—</span> {item}
                    </li>
                  ))}
                </ul>
                {tier.external ? (
                  <Link
                    href={tier.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-8 block w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-center text-sm font-medium text-gray-300 transition hover:bg-white/[0.06]"
                  >
                    {tier.cta}
                  </Link>
                ) : (
                  <a
                    href={tier.href}
                    className={`mt-8 block w-full rounded-xl py-2.5 text-center text-sm font-semibold text-white transition ${
                      tier.featured
                        ? 'bg-indigo-600 hover:bg-indigo-500'
                        : 'border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    {tier.cta}
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ══ ROADMAP ══ */}
        <section className="py-24">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <div className="max-w-md">
              <SectionLabel>Trajectory</SectionLabel>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
                Shape what we build next
              </h2>
              <p className="mt-4 text-gray-400 leading-relaxed">
                Early members get a direct line to the roadmap. Vote on features, submit requests, and watch your ideas ship.
              </p>
              <Link
                href="/roadmap"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-indigo-400 transition hover:text-indigo-300 hover:gap-3"
              >
                View full roadmap →
              </Link>
            </div>

            <div className="w-full max-w-sm space-y-2.5">
              {[
                { done: true, label: 'Kanban + Agent Chat' },
                { done: true, label: 'Cost Savings Tracking' },
                { done: true, label: '3-Pane Dashboard' },
                { done: false, label: 'AiPipe LLM Router' },
                { done: false, label: 'XP & Streaks' },
                { done: false, label: 'Stripe Billing' },
              ].map(({ done, label }) => (
                <div
                  key={label}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-200 hover:translate-x-1 ${
                    done
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                      : 'border-white/[0.06] bg-gray-900/40 text-gray-400 hover:border-white/10'
                  }`}
                >
                  <span>{done ? '✅' : '🔜'}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ WAITLIST CTA ══ */}
        <section id="waitlist" className="py-24">
          <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-b from-gray-900/80 to-gray-950 px-8 py-16 text-center md:px-16">
            {/* Top gradient line */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
            {/* Radial glow */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.08),transparent_70%)]" />

            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
                Join free.{' '}
                <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-indigo-400 bg-clip-text text-transparent">
                  Ship smarter.
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-gray-400">
                Get early access, lock in founding member pricing, and help shape what we build. Takes 10 seconds.
              </p>

              <ul className="mx-auto mt-7 flex flex-col items-center gap-2 text-sm text-gray-300">
                <li>⚡ Founding pricing — locked in forever at sign-up</li>
                <li>🚀 Early access before public launch</li>
                <li>🗳️ Direct vote on roadmap features</li>
              </ul>

              <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-12 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-white placeholder-gray-600 outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20"
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
                >
                  {isSubmitting ? 'Securing your spot...' : 'Get early access →'}
                </button>
              </form>

              <p className="mt-4 text-xs text-gray-600">
                {count > 0 ? `Join ${count} builders already on the waitlist` : 'No credit card · No commitment'}
              </p>

              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
              {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}
            </div>
          </div>
        </section>

      </div>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-7">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-gray-600 md:flex-row md:px-10" style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>
          <p className="font-bold text-gray-400">🧭 archonhq · Built with OpenClaw</p>
          <div className="flex gap-5">
            <Link href="https://github.com/MikeS071/Mission-Control" target="_blank" rel="noreferrer" className="transition hover:text-white">GitHub</Link>
            <Link href="/signin" className="transition hover:text-white">Sign In</Link>
            <Link href="/roadmap" className="transition hover:text-white">Roadmap</Link>
          </div>
          <p>© 2026 archonhq.ai</p>
        </div>
      </footer>

    </main>
  );
}
