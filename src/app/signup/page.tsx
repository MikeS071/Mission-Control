'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

type Plan = 'initiate' | 'strategos' | 'archon';

type PlanOption = {
  id: Plan;
  name: string;
  price: string;
  tagline: string;
  description: string;
  cta: string;
  badge?: string;
};

const planOptions: PlanOption[] = [
  {
    id: 'initiate',
    name: 'Initiate',
    price: '$0',
    tagline: 'Free forever — connect your own OpenClaw',
    description: 'Self-host Mission Control, 1 user, 1 agent, community support.',
    cta: 'Start for free',
  },
  {
    id: 'strategos',
    name: 'Strategos',
    price: '$39',
    tagline: 'Hosted OpenClaw included — $39/mo',
    description: 'Managed cloud, 3 agents, AiPipe router, priority support.',
    cta: 'Founding price',
    badge: 'Most popular',
  },
  {
    id: 'archon',
    name: 'Archon',
    price: '$99',
    tagline: 'Everything + priority support — $99/mo',
    description: 'Dedicated infra, 8 agents, ContentAI, CoderAI, priority support.',
    cta: 'Go Archon',
    badge: 'All-access',
  },
];

const billingPlanMap: Record<Plan, 'free' | 'pro' | 'team'> = {
  initiate: 'free',
  strategos: 'pro',
  archon: 'team',
};

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const labels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'];
  return {
    score,
    label: password ? labels[Math.min(score, labels.length - 1)] : 'Too weak',
  };
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPlan = (searchParams.get('plan') as Plan) ?? 'strategos';

  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(planOptions.some(p => p.id === initialPlan) ? initialPlan : 'strategos');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const steps = [
    { title: 'Choose your plan', description: 'Pick a plan that fits how you run OpenClaw.' },
    { title: 'Account security', description: 'Use a strong password you will remember.' },
    { title: 'Workspace', description: 'Give your Mission Control a name.' },
    { title: 'Confirm & launch', description: 'Create your workspace and jump in.' },
  ];

  const strength = passwordStrength(password);

  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(selectedPlan);
    if (step === 1) {
      const normalizedEmail = email.trim().toLowerCase();
      const validEmail = /[^@\s]+@[^@\s]+\.[^@\s]+/.test(normalizedEmail);
      const passwordsMatch = password.length >= 8 && password === confirmPassword;
      return validEmail && passwordsMatch;
    }
    if (step === 2) {
      return workspaceName.trim().length >= 3;
    }
    return true;
  }, [step, selectedPlan, email, password, confirmPassword, workspaceName]);

  const goNext = () => {
    if (step < steps.length - 1 && canContinue) {
      setStep(step + 1);
      setError('');
    }
  };

  const goBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setError('');
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canContinue || submitting) return;
    setError('');
    setSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          workspaceName: workspaceName.trim(),
          plan: selectedPlan,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not create your workspace.');
        setSubmitting(false);
        return;
      }

      const signInResult = await signIn('credentials', {
        redirect: false,
        email: normalizedEmail,
        password,
      });

      if (signInResult?.error) {
        setError('Account created, but sign-in failed. Try signing in manually.');
        setSubmitting(false);
        return;
      }

      if (selectedPlan === 'strategos' || selectedPlan === 'archon') {
        const checkout = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: billingPlanMap[selectedPlan] }),
        });
        const checkoutData = await checkout.json();
        if (checkout.ok && checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        }
      }

      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a1a12] px-4 py-16 text-[#f1f5f0]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 flex flex-col gap-3 text-center">
          <p className="text-xs font-mono uppercase tracking-[0.25em] text-[#ff6b8a]">ArchonHQ · Mission Control</p>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage, sans-serif)' }}>
            Create your workspace
          </h1>
          <p className="text-sm text-[#a3b8a8]">Four quick steps to spin up your dashboard.</p>
        </div>

        <div className="mb-8 grid grid-cols-4 gap-3 text-xs font-mono uppercase tracking-[0.2em] text-[#6a7f6f]">
          {steps.map((s, index) => (
            <div key={s.title} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${index <= step ? 'border-[#ff6b8a] text-[#ff6b8a]' : 'border-[#1a3020]'}`}
              >
                {index + 1}
              </div>
              <span className="hidden sm:inline">{s.title}</span>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-3xl border border-[#1a3020] bg-[#0f2418] p-8 shadow-2xl"
        >
          {step === 0 && (
            <section>
              <h2 className="text-2xl font-semibold">Choose your plan</h2>
              <p className="mt-2 text-sm text-[#a3b8a8]">Founding pricing locked in for life.</p>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {planOptions.map((plan) => (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`rounded-2xl border p-5 text-left transition ${selectedPlan === plan.id ? 'border-[#ff6b8a]/60 bg-[#1b3526]' : 'border-[#1a3020] bg-transparent hover:border-[#2dd47a]/40'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{plan.name}</p>
                        <p className="mt-1 text-xs text-[#a3b8a8]">{plan.tagline}</p>
                      </div>
                      {plan.badge && (
                        <span className="rounded-full border border-[#ff6b8a]/40 px-3 py-0.5 text-[10px] text-[#ff6b8a]">{plan.badge}</span>
                      )}
                    </div>
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-[#ff3b6f]">{plan.price}</span>
                      {plan.id !== 'initiate' && <span className="text-sm text-[#a3b8a8]">/mo</span>}
                    </div>
                    <p className="mt-3 text-sm text-[#a3b8a8]">{plan.description}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <div>
                <label className="text-sm text-[#a3b8a8]" htmlFor="email">Work email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-[#1a3020] bg-[#102a1c] px-4 text-sm text-[#f1f5f0] outline-none focus:border-[#ff6b8a]"
                  placeholder="alex@ops.team"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="text-sm text-[#a3b8a8]" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-[#1a3020] bg-[#102a1c] px-4 text-sm text-[#f1f5f0] outline-none focus:border-[#ff6b8a]"
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
                <div className="mt-2 flex items-center gap-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${strength.score >= i ? 'bg-[#2dd47a]' : 'bg-[#1a3020]'}`} />
                  ))}
                  <span className="text-xs text-[#a3b8a8]">{strength.label}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-[#a3b8a8]" htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-2 h-11 w-full rounded-2xl border border-[#1a3020] bg-[#102a1c] px-4 text-sm text-[#f1f5f0] outline-none focus:border-[#ff6b8a]"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                />
              </div>
              <div className="pt-2 text-center text-xs text-[#6a7f6f]">
                Prefer Google?{' '}
                <button
                  type="button"
                  onClick={() => signIn('google', { callbackUrl: `/signup/complete?plan=${selectedPlan}` })}
                  className="text-[#ff6b8a] underline-offset-2 hover:underline"
                >
                  Continue with Google
                </button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <label className="text-sm text-[#a3b8a8]" htmlFor="workspace">Workspace name</label>
              <input
                id="workspace"
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="mt-2 h-11 w-full rounded-2xl border border-[#1a3020] bg-[#102a1c] px-4 text-sm text-[#f1f5f0] outline-none focus:border-[#ff6b8a]"
                placeholder="eg. Atlas Ops"
              />
              <p className="mt-2 text-xs text-[#6a7f6f]">This will appear in the dashboard header. You can change it later.</p>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-[#1a3020] bg-[#102a1c] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6a7f6f]">Plan</p>
                <p className="mt-1 text-lg font-semibold">{planOptions.find(p => p.id === selectedPlan)?.name}</p>
                <p className="text-sm text-[#a3b8a8]">{planOptions.find(p => p.id === selectedPlan)?.tagline}</p>
              </div>
              <div className="rounded-2xl border border-[#1a3020] bg-[#102a1c] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6a7f6f]">Email</p>
                <p className="mt-1 text-sm">{email.trim() || 'Not set'}</p>
              </div>
              <div className="rounded-2xl border border-[#1a3020] bg-[#102a1c] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#6a7f6f]">Workspace</p>
                <p className="mt-1 text-sm">{workspaceName || 'Not set'}</p>
              </div>
            </section>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || submitting}
              className="rounded-xl border border-[#1a3020] px-5 py-2 text-sm text-[#a3b8a8] transition hover:border-[#ff6b8a] disabled:opacity-40"
            >
              Back
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canContinue}
                className="rounded-xl bg-[#ff3b6f] px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-40"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canContinue || submitting}
                className="rounded-xl bg-gradient-to-r from-[#ff3b6f] to-[#2dd47a] px-8 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-40"
              >
                {submitting ? 'Creating workspace…' : 'Launch Mission Control'}
              </button>
            )}
          </div>

          <div className="text-center text-xs text-[#6a7f6f]">
            Already have an account?{' '}
            <Link href="/signin" className="text-[#ff6b8a] underline-offset-2 hover:underline">Sign in</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
