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
    iconBg: 'border-[rgba(255,59,111,0.25)] bg-[rgba(255,59,111,0.07)]',
    title: 'Kanban Board',
    desc: 'Drag-drop task management with real-time updates, priorities, WIP limits, and collapsible columns.',
  },
  {
    icon: '📊',
    iconBg: 'border-[rgba(45,212,122,0.25)] bg-[rgba(45,212,122,0.07)]',
    title: 'Live Cost Dashboard',
    desc: 'Token usage, estimated spend, and savings vs direct API — all auto-refreshing. Set a monthly budget and track % consumed.',
  },
  {
    icon: '🔀',
    iconBg: 'border-[rgba(255,59,111,0.25)] bg-[rgba(255,59,111,0.07)]',
    title: 'Smart LLM Router',
    desc: 'AiPipe routes to the cheapest capable model for each task. Same quality, fraction of the cost.',
    soon: true,
  },
  {
    icon: '🏆',
    iconBg: 'border-[rgba(255,191,36,0.25)] bg-[rgba(255,191,36,0.07)]',
    title: 'Agent Challenges',
    desc: 'Weekly missions, XP, streaks, and leaderboards to keep your agents — and yourself — on track.',
    soon: true,
  },
  {
    icon: '📡',
    iconBg: 'border-[rgba(45,212,122,0.25)] bg-[rgba(45,212,122,0.07)]',
    title: 'Activity Feed',
    desc: 'Every task change, agent update, and system event in a live timeline. Full audit trail per card.',
  },
  {
    icon: '🔒',
    iconBg: 'border-[rgba(255,59,111,0.25)] bg-[rgba(255,59,111,0.07)]',
    title: 'Security & Privacy First',
    desc: 'End-to-end encryption, private data isolation, zero data sharing. Google OAuth, HTTPS, Cloudflare Tunnel, bearer-token API, and full audit logs.',
  },
  {
    icon: '✍️',
    iconBg: 'border-[rgba(255,59,111,0.25)] bg-[rgba(255,59,111,0.07)]',
    title: 'ContentAI',
    desc: 'Research-to-publish pipeline — scan sources, generate outlines, draft full posts, and queue for human approval. Archon-exclusive.',
    soon: true,
    exclusive: 'Archon',
  },
  {
    icon: '👨‍💻',
    iconBg: 'border-[rgba(45,212,122,0.25)] bg-[rgba(45,212,122,0.07)]',
    title: 'CoderAI',
    desc: 'Autonomous coding agent — plan, write, test, and ship code with full agent-level oversight and review gates. Archon-exclusive.',
    soon: true,
    exclusive: 'Archon',
  },
];

const pricing = [
  {
    name: 'Initiate',
    label: 'Self-hosted · Run on your own machine',
    price: '$0',
    period: '/mo',
    items: ['1 user', '1 agent', 'Gamification + XP', 'Leaderboard', '7-day logs', 'Community support'],
    missing: ['AiPipe router', 'ContentAI', 'CoderAI'],
    cta: 'Self-host on GitHub',
    href: 'https://github.com/MikeS071/Mission-Control',
    external: true,
  },
  {
    name: 'Strategos',
    label: '☁️ Our Cloud · Fully managed · 3 agents',
    price: '$39',
    regularPrice: '$59',
    period: '/mo',
    founding: true,
    items: ['1 user', '3 agents', 'Gamification + XP', 'Leaderboard', '30-day logs', 'Priority support', 'AiPipe router', 'Managed secure cloud infra', 'End-to-end encryption', 'Private data isolation'],
    missing: ['ContentAI', 'CoderAI'],
    cta: 'Lock in founding price →',
    href: '/dashboard/billing?plan=pro',
    featured: true,
  },
  {
    name: 'Archon',
    label: '☁️ Our Cloud · Dedicated infra · 8 agents',
    price: '$99',
    regularPrice: '$149',
    period: '/mo',
    founding: true,
    items: ['1 user', '8 agents', 'Gamification + XP', 'Leaderboard', '90-day logs', 'Priority support', 'AiPipe router', 'Dedicated secure cloud infra', '🔒 Advanced privacy controls', '📋 Audit logs + compliance exports', '✍️ ContentAI — ideas-to-content pipeline', '👨‍💻 CoderAI — autonomous coder agent'],
    missing: [],
    cta: 'Lock in founding price →',
    href: '/dashboard/billing?plan=team',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5" style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>
      <span className="h-[2px] w-6 rounded-full" style={{ background: 'linear-gradient(90deg, #ff3b6f, #2dd47a)' }} />
      <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#ff6b8a]">{children}</span>
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
    <main className="relative min-h-screen overflow-x-hidden text-[#f1f5f0]" style={{ background: '#0a1a12' }}>

      {/* ── Background orbs ── */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-64 -top-64 h-[700px] w-[700px] rounded-full blur-[140px]" style={{ background: 'rgba(255,59,111,0.07)', animation: 'pulse 9s ease-in-out infinite' }} />
        <div className="absolute -bottom-64 -right-32 h-[600px] w-[600px] rounded-full blur-[120px]" style={{ background: 'rgba(45,212,122,0.07)', animation: 'pulse 12s ease-in-out infinite', animationDelay: '-5s' }} />
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[140px]" style={{ background: 'rgba(255,59,111,0.04)' }} />
      </div>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ background: 'rgba(10,26,18,0.85)', borderBottom: '1px solid rgba(45,212,122,0.1)' }}>
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <span className="text-lg font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>🧭 archonhq</span>
          <div className="flex items-center gap-2">
            <Link href="/docs" className="rounded-md px-4 py-2 text-sm transition hover:text-white" style={{ color: '#a3b8a8' }}>Docs</Link>
            <Link href="/roadmap" className="hidden rounded-md px-4 py-2 text-sm transition hover:text-white sm:block" style={{ color: '#a3b8a8' }}>Roadmap</Link>
            <Link href="/signin" className="rounded-md px-4 py-2 text-sm transition hover:text-white" style={{ color: '#a3b8a8' }}>Sign In</Link>
            <a
              href="#waitlist"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px"
              style={{ background: 'linear-gradient(135deg, #ff3b6f, #e91e5a)', boxShadow: '0 4px 20px rgba(255,59,111,0.2)' }}
            >
              Get Early Access
            </a>
          </div>
        </nav>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 md:px-10">

        {/* ══ HERO ══ */}
        <section className="flex min-h-[88vh] flex-col items-center justify-center py-24 text-center">
          {/* Badge */}
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
            style={{ fontFamily: 'var(--font-jetbrains, monospace)', border: '1px solid rgba(255,59,111,0.25)', background: 'rgba(255,59,111,0.06)' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#2dd47a]" style={{ boxShadow: '0 0 8px rgba(45,212,122,0.6)', animation: 'pulse 2s ease-in-out infinite' }} />
            <span className="text-xs text-[#ff6b8a]">
              {count > 0 ? `Early Access · ${count} builders already in` : 'Now in Early Access'}
            </span>
          </div>

          {/* Heading */}
          <h1
            className="max-w-3xl text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl"
            style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}
          >
            Command Your AI Squad.{' '}
            <span style={{ background: 'linear-gradient(135deg, #ff3b6f, #ff6b8a, #2dd47a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Cut Your LLM Bill in Half.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed" style={{ color: '#a3b8a8' }}>
            The operating system for your OpenClaw agents — real-time oversight, intelligent LLM routing,
            and a gamified challenge system. All in one resizable dashboard.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#waitlist"
              className="rounded-xl px-8 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #ff3b6f, #e91e5a)', boxShadow: '0 4px 24px rgba(255,59,111,0.2)' }}
            >
              Get early access — it&apos;s free
            </a>
            <Link
              href="https://github.com/MikeS071/Mission-Control"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-8 py-3.5 text-sm font-semibold transition hover:-translate-y-0.5"
              style={{ color: '#a3b8a8', border: '1px solid rgba(45,212,122,0.2)', background: 'rgba(45,212,122,0.04)' }}
            >
              Self-host free →
            </Link>
          </div>

          {/* Trust strip */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs" style={{ fontFamily: 'var(--font-jetbrains, monospace)', color: '#6a7f6f' }}>
            <span>✅ No credit card</span>
            <span>✅ Apache 2.0 Licensed</span>
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
          <p className="mt-4 max-w-lg" style={{ color: '#a3b8a8' }}>No complex setup. Connect your gateway, see everything, start saving.</p>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { n: '01', icon: '🔌', title: 'Connect', desc: 'Link your OpenClaw gateway in 60 seconds. One token, instant visibility into every agent session.' },
              { n: '02', icon: '🪟', title: 'See everything', desc: 'All your agents, tasks, costs, and chat in one resizable workspace. No tab-switching, no context loss.' },
              { n: '03', icon: '📉', title: 'Spend less', desc: 'AiPipe routes every LLM call to the cheapest capable model. Track your savings vs direct API in real time.' },
            ].map(({ n, icon, title, desc }) => (
              <div
                key={n}
                className="group relative overflow-hidden rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1.5"
                style={{ border: '1px solid rgba(45,212,122,0.12)', background: '#0f2418' }}
                onMouseEnter={(e) => { (e.currentTarget.querySelector('.top-line') as HTMLElement | null)?.style.setProperty('opacity', '1'); }}
                onMouseLeave={(e) => { (e.currentTarget.querySelector('.top-line') as HTMLElement | null)?.style.setProperty('opacity', '0'); }}
              >
                <div className="top-line absolute inset-x-0 top-0 h-[2px] rounded-t-2xl transition-opacity duration-300" style={{ background: 'linear-gradient(90deg, transparent, #ff3b6f, #2dd47a, transparent)', opacity: 0 }} />
                <div className="mb-5 text-[11px] font-bold tracking-[0.15em] text-[#ff6b8a]" style={{ fontFamily: 'var(--font-jetbrains, monospace)' }}>{n}</div>
                <div className="mb-4 text-3xl">{icon}</div>
                <h3 className="text-base font-semibold text-[#f1f5f0]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#a3b8a8' }}>{desc}</p>
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
            <p className="mt-4" style={{ color: '#a3b8a8' }}>
              A real-time command centre for your AI agents — task management, cost tracking, and chat in one workspace.
            </p>
          </div>
          <ProductPreview />
        </section>

        {/* ══ GAMIFICATION ══ */}
        <section className="py-24">
          <div className="overflow-hidden rounded-3xl px-8 py-14 md:px-14" style={{ border: '1px solid rgba(255,59,111,0.15)', background: 'linear-gradient(135deg, rgba(255,59,111,0.05), #0f2418 50%, #0a1a12)' }}>
            <div className="flex flex-col gap-12 md:flex-row md:items-center">
              <div className="flex-1">
                <SectionLabel>Coming Soon</SectionLabel>
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
                  Level up your AI operation
                </h2>
                <p className="mt-4 max-w-md leading-relaxed" style={{ color: '#a3b8a8' }}>
                  Every task completed, challenge solved, and milestone hit earns you XP.
                  Level up to unlock real benefits — not just bragging rights.
                </p>
                <div className="mt-8 space-y-4">
                  {[
                    { level: 'Level 5',  perk: 'Extended log history (90 days)',            color: '#2dd47a' },
                    { level: 'Level 10', perk: 'Custom agent personas & names',              color: '#5eeaa0' },
                    { level: 'Level 20', perk: 'Priority model routing + reduced latency',   color: '#ff6b8a' },
                    { level: 'Level 50', perk: 'Founding Legend — permanent badge & perks',  color: '#ff3b6f' },
                  ].map(({ level, perk, color }) => (
                    <div key={level} className="flex items-center gap-4">
                      <span className="w-16 flex-shrink-0 text-xs font-bold" style={{ fontFamily: 'var(--font-jetbrains, monospace)', color }}>{level}</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(45,212,122,0.12)' }} />
                      <span className="text-sm text-[#a3b8a8]">{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full flex-shrink-0 space-y-4 md:w-60">
                <div className="rounded-2xl p-5" style={{ border: '1px solid rgba(255,59,111,0.2)', background: 'rgba(15,36,24,0.9)' }}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#ff6b8a]">🌟 Daily Challenge</span>
                    <span className="text-xs" style={{ color: '#6a7f6f' }}>+150 XP</span>
                  </div>
                  <p className="text-sm font-medium text-[#f1f5f0]">Close 3 In Progress tasks</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(45,212,122,0.12)' }}>
                    <div className="h-full rounded-full" style={{ width: '66%', background: 'linear-gradient(90deg, #ff3b6f, #2dd47a)' }} />
                  </div>
                  <p className="mt-1.5 text-[10px]" style={{ color: '#6a7f6f' }}>2 of 3 complete</p>
                </div>

                <div className="rounded-2xl p-5" style={{ border: '1px solid rgba(45,212,122,0.12)', background: 'rgba(15,36,24,0.9)' }}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#f1f5f0]">Level 7 · Operator</span>
                    <span className="text-xs text-[#ff6b8a]">2,340 XP</span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(45,212,122,0.12)' }}>
                    <div className="h-full rounded-full" style={{ width: '47%', background: 'linear-gradient(90deg, #ff3b6f, #2dd47a)' }} />
                  </div>
                  <p className="mt-1.5 text-[10px]" style={{ color: '#6a7f6f' }}>47% to Level 8</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {['7-day streak 🔥', 'Early Backer ⚡', '10 tasks ✅'].map((b) => (
                      <span key={b} className="rounded-full px-2 py-0.5 text-[9px]" style={{ border: '1px solid rgba(45,212,122,0.2)', background: 'rgba(45,212,122,0.05)', color: '#a3b8a8' }}>{b}</span>
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
          <p className="mt-4 max-w-lg" style={{ color: '#a3b8a8' }}>Built for OpenClaw operators who want visibility, control, and lower costs.</p>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article
                key={f.title}
                className="group relative overflow-hidden rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1.5"
                style={{ border: '1px solid rgba(45,212,122,0.12)', background: '#0f2418' }}
                onMouseEnter={(e) => { (e.currentTarget.querySelector('.top-line') as HTMLElement | null)?.style.setProperty('opacity', '1'); }}
                onMouseLeave={(e) => { (e.currentTarget.querySelector('.top-line') as HTMLElement | null)?.style.setProperty('opacity', '0'); }}
              >
                <div className="top-line absolute inset-x-0 top-0 h-[2px] rounded-t-2xl transition-opacity duration-300" style={{ background: 'linear-gradient(90deg, transparent, #ff3b6f, #2dd47a, transparent)', opacity: 0 }} />
                <div className="absolute right-4 top-4 flex flex-col items-end gap-1.5">
                  {'exclusive' in f && f.exclusive && (
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ border: '1px solid rgba(255,59,111,0.4)', background: 'rgba(255,59,111,0.12)', color: '#ff6b8a' }}>
                      {f.exclusive} only
                    </span>
                  )}
                  {f.soon && (
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-[#ff6b8a]" style={{ border: '1px solid rgba(255,59,111,0.25)', background: 'rgba(255,59,111,0.07)' }}>
                      Coming soon
                    </span>
                  )}
                </div>
                <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-[13px] border text-xl ${f.iconBg}`}>
                  {f.icon}
                </div>
                <h3 className="text-base font-semibold text-[#f1f5f0]">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#a3b8a8' }}>{f.desc}</p>
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
          <p className="mt-4 max-w-lg" style={{ color: '#a3b8a8' }}>Sign up now to lock in founding member pricing — guaranteed for life.</p>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {pricing.map((tier) => (
              <article
                key={tier.name}
                className="relative overflow-hidden rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1.5"
                style={tier.featured ? {
                  border: '1px solid rgba(255,59,111,0.35)',
                  background: 'linear-gradient(180deg, rgba(255,59,111,0.05), #0f2418)',
                  boxShadow: '0 0 40px rgba(255,59,111,0.06)',
                } : {
                  border: '1px solid rgba(45,212,122,0.12)',
                  background: '#0f2418',
                }}
              >
                {tier.featured && (
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, transparent, #ff3b6f, #2dd47a, transparent)' }} />
                )}
                {'founding' in tier && tier.founding && (
                  <span className="absolute right-5 top-5 rounded-full px-2.5 py-1 text-[10px] font-bold font-mono tracking-wider" style={{ border: '1px solid rgba(255,59,111,0.4)', background: 'rgba(255,59,111,0.1)', color: '#ff3b6f' }}>FOUNDING</span>
                )}
                <h3 className="text-xl font-bold text-[#f1f5f0]" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>{tier.name}</h3>
                <p className="mt-0.5 text-[11px]" style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}>{tier.label}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-extrabold tracking-tight text-[#f1f5f0]" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>{tier.price}</span>
                  <span className="mb-1 text-sm" style={{ color: '#6a7f6f' }}>{tier.period}</span>
                  {'regularPrice' in tier && tier.regularPrice && (
                    <span className="mb-1 ml-1 text-sm line-through" style={{ color: '#6a7f6f' }}>{tier.regularPrice}</span>
                  )}
                </div>
                <ul className="mt-6 space-y-2.5">
                  {tier.items.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color: '#a3b8a8' }}>
                      <span className="text-xs text-[#2dd47a]">✓</span> {item}
                    </li>
                  ))}
                  {tier.missing.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color: '#6a7f6f' }}>
                      <span className="text-xs">—</span> {item}
                    </li>
                  ))}
                </ul>
                {tier.external ? (
                  <Link
                    href={tier.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-8 block w-full rounded-xl py-2.5 text-center text-sm font-medium transition hover:-translate-y-px"
                    style={{ border: '1px solid rgba(45,212,122,0.2)', background: 'rgba(45,212,122,0.04)', color: '#a3b8a8' }}
                  >
                    {tier.cta}
                  </Link>
                ) : (
                  <a
                    href={tier.href}
                    className="mt-8 block w-full rounded-xl py-2.5 text-center text-sm font-semibold text-white transition hover:-translate-y-px"
                    style={tier.featured ? {
                      background: 'linear-gradient(135deg, #ff3b6f, #e91e5a)',
                      boxShadow: '0 4px 16px rgba(255,59,111,0.2)',
                    } : {
                      border: '1px solid rgba(45,212,122,0.2)',
                      background: 'rgba(45,212,122,0.04)',
                      color: '#a3b8a8',
                    }}
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
              <p className="mt-4 leading-relaxed" style={{ color: '#a3b8a8' }}>
                Early members get a direct line to the roadmap. Vote on features, submit requests, and watch your ideas ship.
              </p>
              <Link
                href="/roadmap"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium transition hover:gap-3"
                style={{ color: '#ff6b8a' }}
              >
                View full roadmap →
              </Link>
            </div>

            <div className="w-full max-w-sm space-y-2.5">
              {[
                { done: true,  label: 'Kanban + Agent Chat' },
                { done: true,  label: 'Cost Savings Tracking' },
                { done: true,  label: '3-Pane Dashboard' },
                { done: false, label: 'AiPipe LLM Router' },
                { done: false, label: 'XP & Streaks' },
                { done: false, label: 'Stripe Billing' },
              ].map(({ done, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200 hover:translate-x-1.5"
                  style={done ? {
                    border: '1px solid rgba(45,212,122,0.25)',
                    background: 'rgba(45,212,122,0.05)',
                    color: '#5eeaa0',
                  } : {
                    border: '1px solid rgba(45,212,122,0.1)',
                    background: '#0f2418',
                    color: '#a3b8a8',
                  }}
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
          <div className="relative overflow-hidden rounded-3xl px-8 py-16 text-center md:px-16" style={{ border: '1px solid rgba(255,59,111,0.2)', background: 'linear-gradient(180deg, #0f2418, #0a1a12)' }}>
            <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-3xl" style={{ background: 'linear-gradient(90deg, transparent, #ff3b6f, #2dd47a, transparent)' }} />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-64" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,59,111,0.07), transparent 70%)' }} />

            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
                Join free.{' '}
                <span style={{ background: 'linear-gradient(135deg, #ff3b6f, #ff6b8a, #2dd47a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  Ship smarter.
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-md" style={{ color: '#a3b8a8' }}>
                Get early access, lock in founding member pricing, and help shape what we build. Takes 10 seconds.
              </p>

              <ul className="mx-auto mt-7 flex flex-col items-center gap-2 text-sm" style={{ color: '#a3b8a8' }}>
                <li><span className="text-[#2dd47a]">⚡</span> Founding pricing — locked in forever at sign-up</li>
                <li><span className="text-[#2dd47a]">🚀</span> Early access before public launch</li>
                <li><span className="text-[#2dd47a]">🗳️</span> Direct vote on roadmap features</li>
              </ul>

              <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-12 flex-1 rounded-xl px-4 text-[#f1f5f0] placeholder-[#6a7f6f] outline-none transition"
                  style={{ border: '1px solid rgba(45,212,122,0.25)', background: 'rgba(45,212,122,0.04)' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,59,111,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,59,111,0.1)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(45,212,122,0.25)'; e.currentTarget.style.boxShadow = 'none'; }}
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-12 rounded-xl px-6 text-sm font-semibold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
                  style={{ background: 'linear-gradient(135deg, #ff3b6f, #e91e5a)', boxShadow: '0 4px 20px rgba(255,59,111,0.25)' }}
                >
                  {isSubmitting ? 'Securing your spot...' : 'Get early access →'}
                </button>
              </form>

              <p className="mt-4 text-xs" style={{ color: '#6a7f6f' }}>
                {count > 0 ? `Join ${count} builders already on the waitlist` : 'No credit card · No commitment'}
              </p>
              {error && <p className="mt-3 text-sm text-[#ff6b8a]">{error}</p>}
              {success && <p className="mt-3 text-sm text-[#2dd47a]">{success}</p>}
            </div>
          </div>
        </section>

      </div>

      {/* ── Footer ── */}
      <footer className="relative z-10 py-7" style={{ borderTop: '1px solid rgba(45,212,122,0.1)' }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs md:flex-row md:px-10" style={{ fontFamily: 'var(--font-jetbrains, monospace)', color: '#6a7f6f' }}>
          <p className="font-bold text-[#a3b8a8]">🧭 archonhq · Built with{' '}
            <a href="https://openclaw.ai" target="_blank" rel="noreferrer" className="hover:text-[#2dd47a] transition">OpenClaw</a>
          </p>
          <div className="flex gap-5">
            <Link href="https://github.com/MikeS071/Mission-Control" target="_blank" rel="noreferrer" className="transition hover:text-[#ff6b8a]">GitHub</Link>
            <Link href="/signin" className="transition hover:text-[#ff6b8a]">Sign In</Link>
            <Link href="/docs" className="transition hover:text-[#ff6b8a]">Docs</Link>
            <Link href="/roadmap" className="transition hover:text-[#ff6b8a]">Roadmap</Link>
          </div>
          <p>© 2026 archonhq.ai</p>
        </div>
      </footer>

      {/* ── JSON-LD Structured Data ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Mission Control',
            url: 'https://archonhq.ai',
            description:
              'AI agent coordination dashboard with smart LLM routing, kanban task management, cost tracking, and Telegram notifications.',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Web',
            offers: [
              {
                '@type': 'Offer',
                name: 'Strategos',
                price: '39.00',
                priceCurrency: 'USD',
                billingIncrement: 'P1M',
              },
              {
                '@type': 'Offer',
                name: 'Archon',
                price: '99.00',
                priceCurrency: 'USD',
                billingIncrement: 'P1M',
              },
            ],
            creator: {
              '@type': 'Organization',
              name: 'ArchonHQ',
              url: 'https://archonhq.ai',
            },
          }),
        }}
      />

    </main>
  );
}
