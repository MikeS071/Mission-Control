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
  'OpenClaw connection wizard',
  '3-pane resizable dashboard (Agent Team · Kanban · Chat)',
  'Multi-thread agent chat (per-topic threads)',
  'Cost savings tile (Saved via Routing)',
  'Blocked / Needs-you quick-label toggles',
  'Configurable tenant settings (agent name, token budget, savings rate)',
  'Fun sub-agent names (deterministic, collision-free)',
  'Full watermelon redesign + Initiate / Strategos / Archon tiers',
  'AiPipe intelligent LLM router (shipped — per-tenant key vault + routing)',
  'Subscription billing (Stripe) — plans, checkout, portal, webhook',
  'Gamification (XP, streaks, challenges, leaderboard)',
  'Multi-tenancy & org management',
  'Docs site (built-in documentation with MDX)',
  'Insights blog (AI/agent-ops articles, published at /insights)',
  'SEO — sitemap.xml, robots.txt, OpenGraph meta tags',
  'navi-ops CLI (Navi orchestrates deployments & ops automation)',
  'Kamal deploy pipeline (replaced Coolify — GitHub Actions + Kamal)',
];

const inProgress = [
  'Real-time chat backend (WebSocket/SSE + message persistence)',
  'API key encryption at rest (AES-256-GCM, retro gap in progress)',
  'Heartbeat alerting — auto-notify when gateway goes silent',
];

const planned = [
  'Stripe live keys (switch from test mode to production)',
  'Visual onboarding flow (wizard for new tenants)',
  'ContentAI — ideas-to-content pipeline (Archon tier)',
  'CoderAI — autonomous coder agent (Archon tier)',
  'Email newsletter (Resend integration)',
  'Mobile-responsive dashboard',
  'Audit logs + compliance exports (Archon tier)',
  'Per-tenant usage quotas & hard limits',
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
    <main className="relative min-h-screen px-6 py-16 text-[#f1f5f0] md:px-10" style={{ background: '#0a1a12' }}>

      {/* Background orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-48 h-[500px] w-[500px] rounded-full blur-[120px]" style={{ background: 'rgba(255,59,111,0.05)' }} />
        <div className="absolute -bottom-48 -right-24 h-[400px] w-[400px] rounded-full blur-[100px]" style={{ background: 'rgba(45,212,122,0.05)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest" style={{ color: '#ff3b6f' }}>
              — archonhq.ai
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
              Product Roadmap
            </h1>
          </div>
          <Link
            href="/"
            className="text-sm transition hover:text-[#ff6b8a]"
            style={{ color: '#6a7f6f', fontFamily: 'var(--font-jetbrains, monospace)' }}
          >
            ← Back to home
          </Link>
        </div>

        <p className="mt-4 text-sm leading-relaxed" style={{ color: '#a3b8a8' }}>
          Track what&apos;s shipped, what&apos;s actively underway, and what&apos;s planned next.
        </p>

        {/* Tier pills */}
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
          {[
            { name: 'Initiate', label: 'Free · self-hosted', color: 'rgba(45,212,122,0.15)', border: 'rgba(45,212,122,0.3)', text: '#2dd47a' },
            { name: 'Strategos', label: '$39/mo · Our Cloud', color: 'rgba(255,59,111,0.1)', border: 'rgba(255,59,111,0.3)', text: '#ff6b8a' },
            { name: 'Archon', label: '$99/mo · dedicated + ContentAI + CoderAI', color: 'rgba(255,191,36,0.1)', border: 'rgba(255,191,36,0.3)', text: '#ffc837' },
          ].map((tier) => (
            <span
              key={tier.name}
              className="rounded-full px-3 py-1"
              style={{ background: tier.color, border: `1px solid ${tier.border}`, color: tier.text }}
            >
              {tier.name} — {tier.label}
            </span>
          ))}
        </div>

        {/* Columns */}
        <section className="mt-10 grid gap-5 md:grid-cols-3">
          <RoadmapColumn
            title="Delivered"
            accentColor="#2dd47a"
            items={delivered}
            bg="rgba(45,212,122,0.04)"
            border="rgba(45,212,122,0.2)"
          />
          <RoadmapColumn
            title="In Progress"
            accentColor="#ffc837"
            items={inProgress}
            bg="rgba(255,200,55,0.04)"
            border="rgba(255,200,55,0.2)"
          />
          <RoadmapColumn
            title="Planned"
            accentColor="#6a7f6f"
            items={planned}
            bg="rgba(255,255,255,0.02)"
            border="rgba(255,255,255,0.08)"
          />
        </section>

        {/* Feature request form */}
        <section
          className="mt-12 rounded-2xl p-7"
          style={{ border: '1px solid rgba(45,212,122,0.15)', background: '#0f2418' }}
        >
          <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-widest" style={{ color: '#2dd47a' }}>
            — shape the roadmap
          </p>
          <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
            Missing something?
          </h2>
          <p className="mt-2 text-sm" style={{ color: '#a3b8a8' }}>
            Submit a feature request and we&apos;ll review it for the roadmap.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="h-11 w-full rounded-lg px-4 text-sm placeholder:text-[#4a5e4f] focus:outline-none"
              style={{
                border: '1px solid rgba(45,212,122,0.2)',
                background: 'rgba(0,0,0,0.3)',
                color: '#f1f5f0',
              }}
              required
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the feature you want..."
              rows={4}
              className="w-full rounded-lg px-4 py-3 text-sm placeholder:text-[#4a5e4f] focus:outline-none"
              style={{
                border: '1px solid rgba(45,212,122,0.2)',
                background: 'rgba(0,0,0,0.3)',
                color: '#f1f5f0',
              }}
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 rounded-lg px-6 text-sm font-semibold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: '#ff3b6f', color: '#fff' }}
            >
              {isSubmitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </form>

          {error ? <p className="mt-3 text-sm" style={{ color: '#ff6b8a' }}>{error}</p> : null}
          {success ? <p className="mt-3 text-sm" style={{ color: '#2dd47a' }}>{success}</p> : null}
        </section>
      </div>
    </main>
  );
}

function RoadmapColumn({
  title,
  items,
  accentColor,
  bg,
  border,
}: {
  title: string;
  items: string[];
  accentColor: string;
  bg: string;
  border: string;
}) {
  return (
    <article
      className="rounded-2xl p-5"
      style={{ border: `1px solid ${border}`, background: bg }}
    >
      <h2
        className="text-base font-semibold"
        style={{ color: accentColor, fontFamily: 'var(--font-bricolage, sans-serif)' }}
      >
        {title}
      </h2>
      <ul className="mt-4 space-y-2 text-sm" style={{ color: '#c4d4c8' }}>
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span
              className="mt-[5px] inline-block h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: accentColor }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
