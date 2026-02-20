'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type SettingsPayload = {
  anthropicKey?: string;
  openaiKey?: string;
  xaiKey?: string;
  models?: {
    mainAgent?: string;
    subagents?: string;
    deepResearch?: string;
    costEfficient?: string;
  };
  notifications?: {
    telegramBotToken?: string;
    telegramChatId?: string;
  };
  gateway?: {
    url?: string;
    token?: string;
    connected?: boolean;
  };
  wizardCompleted?: boolean;
};

const MODEL_OPTIONS = {
  mainAgent: ['claude-haiku-3', 'claude-sonnet-4-5', 'claude-opus-4'],
  subagents: ['gpt-4o-mini', 'gpt-4o', 'gpt-5.3-codex'],
  deepResearch: ['gpt-4o', 'gpt-5.1-codex'],
  costEfficient: ['claude-haiku-3', 'gpt-4o-mini'],
};

const MODEL_DEFAULTS = {
  mainAgent: 'claude-sonnet-4-5',
  subagents: 'gpt-5.3-codex',
  deepResearch: 'gpt-5.1-codex',
  costEfficient: 'claude-haiku-3',
};

export default function ConnectGatewayPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  const [gatewayUrl, setGatewayUrl] = useState('http://localhost:18789');
  const [gatewayToken, setGatewayToken] = useState('');
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [gatewayStatusText, setGatewayStatusText] = useState<string | null>(null);

  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [xaiKey, setXaiKey] = useState('');

  const [models, setModels] = useState({ ...MODEL_DEFAULTS });

  const [aipipeStatus, setAipipeStatus] = useState<'unchecked' | 'checking' | 'ok' | 'unavailable'>('unchecked');
  const [aipipeMsg, setAipipeMsg] = useState<string | null>(null);

  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) return;
        const data = (await response.json()) as { settings?: SettingsPayload };
        const settings = data.settings;
        if (!settings) return;

        setGatewayUrl(settings.gateway?.url || 'http://localhost:18789');
        setGatewayToken(settings.gateway?.token || '');
        setGatewayConnected(Boolean(settings.gateway?.connected));

        setAnthropicKey(settings.anthropicKey || '');
        setOpenaiKey(settings.openaiKey || '');
        setXaiKey(settings.xaiKey || '');

        setModels({
          mainAgent: settings.models?.mainAgent || MODEL_DEFAULTS.mainAgent,
          subagents: settings.models?.subagents || MODEL_DEFAULTS.subagents,
          deepResearch: settings.models?.deepResearch || MODEL_DEFAULTS.deepResearch,
          costEfficient: settings.models?.costEfficient || MODEL_DEFAULTS.costEfficient,
        });

        setTelegramBotToken(settings.notifications?.telegramBotToken || '');
        setTelegramChatId(settings.notifications?.telegramChatId || '');
      } catch {
        // ignore prefill errors
      }
    })();
  }, []);

  const progressLabel = useMemo(() => `Step ${step} of 7`, [step]);

  const saveSettings = async (partial: SettingsPayload) => {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: partial, merge: true }),
      });
    } finally {
      setSaving(false);
    }
  };

  const checkAipipe = async () => {
    setAipipeStatus('checking');
    setAipipeMsg(null);
    try {
      const res = await fetch('/api/aipipe/health');
      if (res.ok) {
        const data = (await res.json()) as { status?: string };
        if (data.status === 'ok') {
          setAipipeStatus('ok');
          setAipipeMsg('✅ Smart router is running — your keys will be routed automatically to the best model.');
        } else {
          setAipipeStatus('unavailable');
          setAipipeMsg('⚠️ Router responded but status is not ok. You can still continue without it.');
        }
      } else {
        setAipipeStatus('unavailable');
        setAipipeMsg('⚠️ Smart router is not running on this server. Your keys still work directly. You can continue.');
      }
    } catch {
      setAipipeStatus('unavailable');
      setAipipeMsg('⚠️ Could not reach the router service. You can continue — AiPipe is optional.');
    }
  };

  const testGatewayConnection = async () => {
    setLoading(true);
    setGatewayStatusText(null);
    try {
      const response = await fetch('/api/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Setup Wizard', url: gatewayUrl.trim(), token: gatewayToken.trim() || undefined }),
      });
      const data = (await response.json().catch(() => null)) as { check?: { status?: string } } | null;

      if (response.ok && data?.check?.status === 'ok') {
        setGatewayConnected(true);
        setGatewayStatusText('✅ Connected. Great job!');
        await saveSettings({ gateway: { url: gatewayUrl.trim(), token: gatewayToken.trim(), connected: true } });
      } else {
        setGatewayConnected(false);
        setGatewayStatusText("❌ Can't connect yet. Tips: check the URL, confirm OpenClaw is running, and make sure your token is right.");
      }
    } catch {
      setGatewayConnected(false);
      setGatewayStatusText("❌ Can't connect yet. Tips: check the URL, confirm OpenClaw is running, and try again.");
    } finally {
      setLoading(false);
    }
  };

  const testNotification = async () => {
    setTestingNotification(true);
    setNotificationStatus(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testNotification: true,
          settings: {
            notifications: {
              telegramBotToken: telegramBotToken.trim(),
              telegramChatId: telegramChatId.trim(),
            },
          },
        }),
      });
      if (response.ok) {
        setNotificationStatus('✅ Test message sent!');
      } else {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setNotificationStatus(`❌ ${data?.error || 'Could not send test message'}`);
      }
    } finally {
      setTestingNotification(false);
    }
  };

  const finishWizard = async () => {
    await saveSettings({ wizardCompleted: true });
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Setup Wizard</h1>
            <p className="text-sm text-gray-400">{progressLabel}</p>
          </div>
          <Link href="/dashboard" className="text-sm text-indigo-300 hover:text-indigo-200">
            Back to dashboard
          </Link>
        </div>

        <Card className="border-gray-800 bg-gray-900">
          <CardHeader>
            <CardTitle>
              {step === 1 && "Let's get your AI team set up 🚀"}
              {step === 2 && 'Connect your OpenClaw gateway'}
              {step === 3 && 'Add your AI keys 🔑'}
              {step === 4 && 'Enable Smart Routing ⚡'}
              {step === 5 && 'Pick your AI team 🤖'}
              {step === 6 && 'Stay in the loop 📱'}
              {step === 7 && 'All done! 🎉'}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <p className="text-gray-300">We'll walk you through it — takes about 5 minutes.</p>
                <Button className="h-12 px-8 text-base" onClick={() => setStep(2)}>
                  Let's go →
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-gray-300">Where is your OpenClaw running?</p>
                <input className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2" value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} placeholder="http://localhost:18789" />
                <div className="space-y-1">
                  <input className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2" value={gatewayToken} onChange={(e) => setGatewayToken(e.target.value)} placeholder="Bearer token (optional)" type="password" title="Found in your OpenClaw config" />
                  <p className="text-xs text-gray-400">Found in your OpenClaw config.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={loading || !gatewayUrl.trim()} onClick={testGatewayConnection}>{loading ? 'Testing...' : 'Test connection'}</Button>
                  <Button variant="secondary" onClick={async () => {
                    await saveSettings({ gateway: { url: gatewayUrl.trim(), token: gatewayToken.trim(), connected: false } });
                    setStep(3);
                  }}>
                    Skip for now
                  </Button>
                </div>
                {gatewayStatusText && <p className={gatewayConnected ? 'text-green-400' : 'text-red-400'}>{gatewayStatusText}</p>}
                <Button variant="secondary" onClick={() => setStep(3)} disabled={!gatewayConnected}>Continue</Button>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-gray-300">These let your agents think. You can add more later.</p>
                <p className="text-xs text-gray-400">Keys are stored on your server (secure storage improvements coming next).</p>

                <div className="space-y-3">
                  <label className="block text-sm">🧠 Anthropic (Claude) · <a className="text-indigo-300" href="https://console.anthropic.com" target="_blank" rel="noreferrer">Get key</a></label>
                  <input className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." type="password" />

                  <label className="block text-sm">✨ OpenAI (GPT + Codex) · <a className="text-indigo-300" href="https://platform.openai.com" target="_blank" rel="noreferrer">Get key</a></label>
                  <input className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-proj-..." type="password" />

                  <label className="block text-sm">⚡ xAI (Grok, optional) · <a className="text-indigo-300" href="https://console.x.ai" target="_blank" rel="noreferrer">Get key</a></label>
                  <input className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2" value={xaiKey} onChange={(e) => setXaiKey(e.target.value)} placeholder="xai-..." type="password" />
                </div>

                <Button disabled={saving || (!anthropicKey.trim() && !openaiKey.trim() && !xaiKey.trim())} onClick={async () => {
                  await saveSettings({ anthropicKey: anthropicKey.trim(), openaiKey: openaiKey.trim(), xaiKey: xaiKey.trim() });
                  setStep(4);
                }}>{saving ? 'Saving...' : 'Save & continue'}</Button>
              </>
            )}

            {step === 4 && (
              <>
                <p className="text-gray-300">
                  AiPipe is your on-device smart router — it picks the cheapest model for each request
                  automatically, saving you money without changing how your agents work.
                </p>
                <div className="rounded-md border border-gray-700 bg-gray-950 p-4 space-y-3">
                  {aipipeStatus === 'unchecked' && (
                    <p className="text-sm text-gray-400">Click below to check if AiPipe is running on this server.</p>
                  )}
                  {aipipeStatus === 'checking' && (
                    <p className="text-sm text-gray-400 animate-pulse">Checking router…</p>
                  )}
                  {aipipeStatus === 'ok' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-green-400">Smart Router Online</span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Your keys from the previous step are now routed automatically.
                        View live stats in the <span className="text-indigo-300">⚡ Router</span> dashboard tab.
                      </p>
                    </div>
                  )}
                  {aipipeStatus === 'unavailable' && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span className="text-sm font-medium text-yellow-400">Router Not Running</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Your keys still work directly. You can enable smart routing later by starting AiPipe:
                        <code className="ml-1 text-gray-400">systemctl --user start aipipe</code>
                      </p>
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    disabled={aipipeStatus === 'checking'}
                    onClick={checkAipipe}
                  >
                    {aipipeStatus === 'unchecked' ? 'Check router' : 'Re-check'}
                  </Button>
                </div>
                <Button onClick={() => setStep(5)}>Continue →</Button>
              </>
            )}

            {step === 5 && (
              <>
                <p className="text-gray-300">Different models for different jobs — we&apos;ve picked smart defaults.</p>

                <ModelPicker label="Main agent (Navi)" description="Your lead helper" value={models.mainAgent} options={MODEL_OPTIONS.mainAgent} onChange={(value) => setModels((s) => ({ ...s, mainAgent: value }))} />
                <ModelPicker label="Subagents (coding/research)" description="Fast builders and helpers" value={models.subagents} options={MODEL_OPTIONS.subagents} onChange={(value) => setModels((s) => ({ ...s, subagents: value }))} />
                <ModelPicker label="Deep research" description="Longer deep dives" value={models.deepResearch} options={MODEL_OPTIONS.deepResearch} onChange={(value) => setModels((s) => ({ ...s, deepResearch: value }))} />
                <ModelPicker label="Cost-efficient tasks" description="Great value for smaller jobs" value={models.costEfficient} options={MODEL_OPTIONS.costEfficient} onChange={(value) => setModels((s) => ({ ...s, costEfficient: value }))} />

                <Button disabled={saving} onClick={async () => {
                  await saveSettings({ models });
                  setStep(6);
                }}>{saving ? 'Saving...' : 'Save & continue'}</Button>
              </>
            )}

            {step === 6 && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm">Telegram bot token</label>
                  <input className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} placeholder="123456:ABC..." type="password" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm">Telegram chat ID</label>
                  <input className="w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="123456789" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button disabled={testingNotification || !telegramBotToken.trim() || !telegramChatId.trim()} onClick={testNotification}>
                    {testingNotification ? 'Sending...' : 'Test notification'}
                  </Button>
                  <Button disabled={saving} onClick={async () => {
                    await saveSettings({ notifications: { telegramBotToken: telegramBotToken.trim(), telegramChatId: telegramChatId.trim() } });
                    setStep(7);
                  }}>{saving ? 'Saving...' : 'Save & continue'}</Button>
                </div>
                {notificationStatus && <p className={notificationStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>{notificationStatus}</p>}
              </>
            )}

            {step === 7 && (
              <>
                <div className="space-y-2 rounded-md border border-gray-700 bg-gray-950 p-3 text-sm">
                  <p>{gatewayConnected ? '✅ Gateway connected' : '⚪ Gateway skipped for now'}</p>
                  <p>{anthropicKey || openaiKey || xaiKey ? '✅ AI keys added' : '⚪ AI keys not added yet'}</p>
                  <p>{aipipeStatus === 'ok' ? '✅ Smart routing enabled' : '⚪ Smart routing not running'}</p>
                  <p>✅ Models picked</p>
                  <p>{telegramBotToken && telegramChatId ? '✅ Notifications saved' : '⚪ Notifications skipped'}</p>
                </div>

                <Button className="h-12 px-8 text-base" onClick={finishWizard}>Go to dashboard →</Button>
                <Link href="/dashboard/connect" className="block text-sm text-indigo-300 hover:text-indigo-200">Edit settings anytime</Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ModelPicker({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1 rounded-md border border-gray-700 bg-gray-950 p-3">
      <label className="block text-sm font-medium">{label}</label>
      <p className="text-xs text-gray-400">{description}</p>
      <select className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}
