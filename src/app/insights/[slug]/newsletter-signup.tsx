'use client';

import { useState } from 'react';

export default function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'blog' }),
      });
      setStatus(res.ok || res.status === 409 ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="rounded-xl border border-[#2dd47a]/20 bg-gradient-to-b from-[#0f2218] to-[#0a1a12] p-5">
      <p className="text-sm font-semibold text-white">Stay in the loop</p>
      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: '#a3b8a8' }}>
        Get new articles delivered to your inbox. No spam, unsubscribe anytime.
      </p>
      {status === 'success' ? (
        <p className="mt-3 text-xs font-semibold" style={{ color: '#2dd47a' }}>
          ✓ You&apos;re subscribed!
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder-[#6a7f6f] outline-none transition focus:border-[#2dd47a]/40"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-lg bg-[#2dd47a] px-3 py-2 text-xs font-semibold text-[#0a1a12] transition hover:bg-[#25b866] disabled:opacity-50"
          >
            {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
          </button>
          {status === 'error' && (
            <p className="text-xs" style={{ color: '#ff6b8a' }}>Something went wrong. Try again.</p>
          )}
        </form>
      )}
    </div>
  );
}
