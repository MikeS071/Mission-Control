'use client';

// ─── Kanban mockup data ───────────────────────────────────────────────────────

type Card = { title: string; priority: 'Critical' | 'High' | 'Medium'; blocked?: boolean; active?: boolean; done?: boolean };

const COLUMNS: { label: string; count: number; card: Card }[] = [
  {
    label: 'Todo',
    count: 4,
    card: { title: 'Stripe billing integration', priority: 'High' },
  },
  {
    label: 'In Progress',
    count: 2,
    card: { title: 'Auth middleware refactor', priority: 'Critical', blocked: true },
  },
  {
    label: 'Done',
    count: 7,
    card: { title: '3-pane dashboard layout', priority: 'High', active: true, done: true },
  },
];

const TILES = [
  { label: 'Tokens', value: '1.2M', sub: '24% of limit', border: 'border-blue-700/60' },
  { label: 'Cost', value: '$0.42', sub: 'this session', border: 'border-emerald-700/60' },
  { label: 'Saved', value: '$0.18', sub: 'vs direct API', border: 'border-teal-700/60' },
];

const AGENTS = [
  { name: '🧭 Navi', status: 'working' as const, since: '2m' },
  { name: 'Spark', status: 'working' as const, since: '5m' },
  { name: 'Pixel', status: 'idle' as const, since: '12m' },
  { name: 'Drift', status: 'inactive' as const, since: '1h' },
];

const MESSAGES = [
  { from: 'agent' as const, text: 'Auth refactor — 3 of 5 steps done.' },
  { from: 'user' as const, text: "What's the ETA?" },
  { from: 'agent' as const, text: '~15 min. Card status updates automatically.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityColor(p: Card['priority']) {
  if (p === 'Critical') return 'border-l-red-500';
  if (p === 'High') return 'border-l-orange-400';
  return 'border-l-gray-600';
}

function priorityLabel(p: Card['priority']) {
  if (p === 'Critical') return <span className="text-red-400 text-[10px] font-semibold">{p}</span>;
  if (p === 'High') return <span className="text-orange-400 text-[10px] font-semibold">{p}</span>;
  return <span className="text-gray-500 text-[10px]">{p}</span>;
}

// ─── Browser chrome + kanban ──────────────────────────────────────────────────

function KanbanMockup() {
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-indigo-950/50">
      {/* Chrome bar */}
      <div className="bg-gray-800 px-4 py-2.5 flex items-center gap-3 border-b border-white/10">
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <div className="flex-1 mx-2 rounded bg-gray-900/70 px-3 py-1 text-[11px] text-gray-400 text-center">
          archonhq.ai/dashboard
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(74,222,128,0.7)]" />
          <span className="text-[10px] text-gray-400">Gateway · Live</span>
        </div>
      </div>

      {/* App shell */}
      <div className="bg-gray-950 p-5 space-y-4">
        {/* Stat tiles */}
        <div className="flex gap-3">
          {TILES.map((t) => (
            <div key={t.label} className={`flex-1 rounded-lg border ${t.border} bg-gray-900 px-4 py-3 flex flex-col items-center`}>
              <div className="text-xl font-bold text-white">{t.value}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{t.sub}</div>
              <div className="text-[10px] text-gray-400 mt-2 border-t border-gray-800 pt-1.5 w-full text-center">{t.label}</div>
            </div>
          ))}
        </div>

        {/* Kanban columns */}
        <div className="flex gap-4">
          {COLUMNS.map(({ label, count, card }) => (
            <div key={label} className="flex-1 min-w-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
                <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">{count}</span>
              </div>

              {/* Column drop zone */}
              <div className="rounded-lg bg-gray-900/50 border border-gray-800/60 p-2.5 min-h-[120px] space-y-2">
                {/* The featured card */}
                <div className={`rounded border border-gray-700/50 border-l-2 ${priorityColor(card.priority)} bg-gray-800 p-3 relative`}>
                  {card.active && (
                    <span className="absolute right-2.5 top-2.5 text-indigo-300 text-xs animate-spin leading-none">⚙</span>
                  )}
                  {card.blocked && (
                    <div className="mb-2">
                      <span className="rounded-full bg-red-700/90 px-2 py-0.5 text-[9px] font-bold text-white tracking-wide">
                        ⚠ Needs You
                      </span>
                    </div>
                  )}
                  <p className="text-sm font-medium text-white leading-snug pr-5">{card.title}</p>
                  <div className="mt-2">{priorityLabel(card.priority)}</div>
                </div>

                {/* Ghost card to hint there are more */}
                <div className="rounded border border-gray-800/40 bg-gray-900/40 px-3 py-2 h-8" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Agent Team panel close-up ────────────────────────────────────────────────

function AgentTeamMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-900/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/80">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Agent Team</span>
      </div>
      <div className="p-3 space-y-2">
        {AGENTS.map((a) => (
          <div key={a.name} className={`rounded border p-2.5 flex items-center justify-between ${a.status === 'working' ? 'border-emerald-700/40 bg-emerald-950/20' : 'border-gray-800 bg-gray-950'}`}>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${a.status === 'working' ? 'bg-emerald-400 animate-pulse' : a.status === 'idle' ? 'bg-yellow-400' : 'bg-gray-600'}`} />
              <span className="text-xs font-medium text-white">{a.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium ${a.status === 'working' ? 'text-emerald-400' : a.status === 'idle' ? 'text-yellow-400' : 'text-gray-600'}`}>
                {a.status === 'working' ? 'Active' : a.status === 'idle' ? 'Idle' : 'Offline'}
              </span>
              <span className="text-[10px] text-gray-600">{a.since}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Chat pane close-up ───────────────────────────────────────────────────────

function ChatMockup() {
  return (
    <div className="rounded-xl border border-white/10 bg-gray-950 overflow-hidden flex flex-col" style={{ minHeight: 220 }}>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-900/60 flex items-center gap-2 flex-shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(74,222,128,0.6)]" />
        <span className="text-xs font-semibold text-gray-200">Navi</span>
        <span className="text-[10px] text-gray-600">· Sprint</span>
        <div className="ml-auto flex gap-1">
          {['Sprint', 'Auth', 'Docs'].map((t, i) => (
            <span key={t} className={`rounded px-1.5 py-0.5 text-[9px] ${i === 0 ? 'bg-indigo-800/60 text-indigo-300' : 'text-gray-600'}`}>{t}</span>
          ))}
        </div>
      </div>
      {/* Messages */}
      <div className="flex-1 p-3 space-y-2.5 overflow-hidden">
        {MESSAGES.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5 ${msg.from === 'agent' ? 'bg-indigo-700' : 'bg-gray-700'}`}>
              {msg.from === 'agent' ? 'N' : 'M'}
            </div>
            <div className={`rounded-lg px-2.5 py-1.5 text-xs leading-relaxed text-gray-200 max-w-[80%] ${msg.from === 'agent' ? 'bg-gray-800' : 'bg-indigo-900/50'}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-800 flex gap-2 flex-shrink-0">
        <div className="flex-1 rounded border border-gray-700/50 bg-gray-900 px-3 py-1.5 text-[10px] text-gray-600">Message Navi…</div>
        <div className="rounded bg-indigo-700/80 px-2.5 flex items-center justify-center">
          <span className="text-xs text-white">↑</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ProductPreview() {
  return (
    <div className="space-y-6 select-none">
      {/* Hero: focused kanban mockup */}
      <KanbanMockup />

      {/* Secondary: agent team + chat side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <AgentTeamMockup />
        <ChatMockup />
      </div>

      {/* Feature callouts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: '📋',
            title: 'Smart Kanban',
            desc: 'Drag cards across columns, set inline priority, mark tasks blocked or escalate with one click. A spinning icon shows when an agent is actively working a card.',
          },
          {
            icon: '🤖',
            title: 'Agent Team Panel',
            desc: 'See every agent live — who\'s active, who\'s idle, for how long. Sub-agents get fun short names so you can tell them apart at a glance.',
          },
          {
            icon: '💰',
            title: 'Cost & Savings Tiles',
            desc: 'Live token usage, estimated spend, and savings vs direct API calls. Set a monthly token budget and watch the % consumed update in real time.',
          },
          {
            icon: '💬',
            title: 'Agent Chat',
            desc: 'Threaded conversations with your primary agent. Switch topics via the thread bar — Sprint, Auth, Docs, or any thread you create. Input always visible.',
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-white/10 bg-gray-900/60 p-5">
            <div className="text-2xl">{item.icon}</div>
            <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-400">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
