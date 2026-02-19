'use client';

// ─── Mock data ────────────────────────────────────────────────────────────────

const TILES = [
  { label: 'Tokens', value: '1.2M', sub: '24% of limit', border: 'border-blue-700/70' },
  { label: 'Cost', value: '$0.42', sub: undefined, border: 'border-emerald-700/70' },
  { label: 'Saved', value: '$0.18', sub: 'vs direct API', border: 'border-teal-700/70' },
  { label: 'Agents', value: '3', sub: undefined, border: 'border-purple-700/70' },
  { label: '% Done', value: '67%', sub: undefined, border: 'border-orange-700/70' },
];

const AGENTS = [
  { name: '🧭 Navi', status: 'working' as const },
  { name: 'Spark', status: 'working' as const },
  { name: 'Pixel', status: 'idle' as const },
  { name: 'Drift', status: 'inactive' as const },
];

type Card = { title: string; goal: string; priority: string; blocked?: boolean; active?: boolean };
const COLUMNS: { label: string; cards: Card[] }[] = [
  {
    label: 'Todo',
    cards: [
      { title: 'Stripe billing integration', goal: 'G002', priority: 'High' },
    ],
  },
  {
    label: 'In Progress',
    cards: [
      { title: 'Auth middleware refactor', goal: 'G001', priority: 'Critical', blocked: true },
    ],
  },
  {
    label: 'Done',
    cards: [
      { title: '3-pane dashboard layout', goal: 'G001', priority: 'High', active: true },
    ],
  },
];

const MESSAGES = [
  { from: 'agent' as const, text: 'Working on auth middleware — 3 of 5 steps done.' },
  { from: 'user' as const, text: "What's the ETA?" },
  { from: 'agent' as const, text: '~15 min. Will auto-update card status when done.' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'working' | 'idle' | 'inactive' }) {
  if (status === 'working') return <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />;
  if (status === 'idle') return <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 inline-block" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-gray-600 inline-block" />;
}

function MockTile({ label, value, sub, border }: typeof TILES[number]) {
  return (
    <div className={`flex-1 min-w-0 rounded border ${border} bg-gray-900 px-2 py-1.5 flex flex-col items-center justify-center`}>
      <div className="text-sm font-bold text-white">{value}</div>
      {sub && <div className="text-[8px] text-gray-500 leading-none mt-0.5">{sub}</div>}
      <div className="text-[8px] text-gray-400 mt-1 border-t border-gray-800 pt-0.5 w-full text-center">{label}</div>
    </div>
  );
}

function MockCard({ card }: { card: Card }) {
  return (
    <div className={`rounded border p-2.5 text-[10px] relative ${
      card.blocked
        ? 'border-red-700/60 bg-gray-800 shadow-[0_0_6px_rgba(239,68,68,0.12)]'
        : card.active
        ? 'border-indigo-500/40 bg-gray-800'
        : 'border-gray-700/60 bg-gray-800'
    }`}>
      {card.active && (
        <span className="absolute right-2 top-2 text-indigo-300 text-[10px] animate-spin inline-block">⚙</span>
      )}
      {card.blocked && (
        <div className="mb-1.5">
          <span className="rounded-full bg-red-700 px-1.5 py-0.5 text-[8px] font-bold text-white uppercase">⚠ Needs You</span>
        </div>
      )}
      <div className="font-medium text-white leading-snug pr-4">{card.title}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="rounded bg-indigo-600/70 px-1.5 py-0.5 text-white text-[8px]">{card.goal}</span>
        <span className={`text-[8px] font-semibold ${
          card.priority === 'Critical' ? 'text-red-400' :
          card.priority === 'High' ? 'text-orange-400' : 'text-gray-400'
        }`}>{card.priority}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProductPreview() {
  return (
    <div className="select-none">
      {/* Browser chrome frame */}
      <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl shadow-indigo-950/50">
        {/* Chrome bar */}
        <div className="bg-gray-800 px-4 py-2 flex items-center gap-3 border-b border-white/10">
          <div className="flex gap-1.5 flex-shrink-0">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex-1 mx-2 rounded bg-gray-900/70 px-3 py-1 text-[10px] text-gray-400 text-center">
            archonhq.ai/dashboard
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(74,222,128,0.7)]" />
            <span className="text-[9px] text-gray-400">Gateway</span>
          </div>
        </div>

        {/* App shell */}
        <div className="bg-gray-950 p-3 space-y-2">
          {/* Stat tiles */}
          <div className="flex gap-2 h-14">
            {TILES.map((tile) => <MockTile key={tile.label} {...tile} />)}
          </div>

          {/* 3-pane layout */}
          <div className="flex rounded-lg border border-gray-800 overflow-hidden" style={{ height: 320 }}>

            {/* Left — Agent Team */}
            <div className="w-28 flex-shrink-0 bg-gray-900/50 border-r border-gray-800 p-2 space-y-1.5">
              <div className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Team</div>
              {AGENTS.map((a) => (
                <div key={a.name} className={`rounded border p-1.5 space-y-1 ${a.status === 'working' ? 'border-emerald-700/50 bg-emerald-950/20' : 'border-gray-800 bg-gray-950'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-semibold text-white truncate">{a.name}</span>
                    <StatusDot status={a.status} />
                  </div>
                  <div className={`text-[8px] font-medium ${a.status === 'working' ? 'text-emerald-400' : a.status === 'idle' ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {a.status === 'working' ? 'Active' : a.status === 'idle' ? 'Idle' : 'Offline'}
                  </div>
                </div>
              ))}
            </div>

            {/* Middle — Kanban */}
            <div className="flex-1 min-w-0 bg-gray-950 p-2 overflow-hidden">
              {/* Filter bar */}
              <div className="flex gap-1 mb-2">
                <div className="rounded border border-gray-700/50 bg-gray-900 px-2 py-0.5 text-[8px] text-gray-500">Search…</div>
                <div className="rounded border border-gray-700/50 bg-gray-900 px-2 py-0.5 text-[8px] text-gray-500">Priority</div>
                <div className="rounded border border-gray-700/50 bg-gray-900 px-2 py-0.5 text-[8px] text-gray-500">Goal</div>
              </div>
              <div className="flex gap-2 h-[256px]">
                {COLUMNS.map((col) => (
                  <div key={col.label} className="flex-1 min-w-0">
                    <div className="text-[8px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                      {col.label} <span className="text-gray-700">({col.cards.length})</span>
                    </div>
                    <div className="rounded-lg bg-gray-900/60 p-2 border border-gray-800/60 h-[236px]">
                      {col.cards.map((card) => <MockCard key={card.title} card={card} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="w-px bg-gray-800 flex-shrink-0" />

            {/* Right — Chat */}
            <div className="w-40 flex-shrink-0 flex bg-gray-950">
              {/* Thread sidebar */}
              <div className="w-10 flex-shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col">
                <div className="h-7 flex items-center justify-center border-b border-gray-800">
                  <span className="text-[9px] text-gray-600">💬</span>
                </div>
                {['Sprint', 'Auth', 'Kanban'].map((t, i) => (
                  <div key={t} className={`px-0.5 py-2 text-[7px] text-center border-l-2 truncate ${i === 0 ? 'text-indigo-300 border-indigo-500 bg-indigo-900/30' : 'text-gray-600 border-transparent'}`}>
                    {t}
                  </div>
                ))}
                <div className="mt-auto h-7 flex items-center justify-center border-t border-gray-800 text-gray-700 text-[10px]">+</div>
              </div>
              {/* Messages */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="h-7 flex items-center justify-center border-b border-gray-800 bg-gray-900/60 gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  <span className="text-[9px] text-gray-300 font-semibold">Navi · Sprint</span>
                </div>
                <div className="flex-1 overflow-hidden p-1.5 space-y-1.5">
                  {MESSAGES.map((msg, i) => (
                    <div key={i} className={`flex gap-1 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`h-3.5 w-3.5 rounded-full flex items-center justify-center text-[6px] font-bold text-white flex-shrink-0 mt-0.5 ${msg.from === 'agent' ? 'bg-indigo-700' : 'bg-gray-700'}`}>
                        {msg.from === 'agent' ? 'N' : 'M'}
                      </div>
                      <div className={`rounded text-[7px] px-1.5 py-1 text-gray-200 max-w-[75%] leading-snug ${msg.from === 'agent' ? 'bg-gray-800' : 'bg-indigo-900/50'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-800 p-1.5 flex gap-1">
                  <div className="flex-1 rounded border border-gray-700/50 bg-gray-900 px-1.5 py-1 text-[7px] text-gray-600">Message Navi…</div>
                  <div className="rounded bg-indigo-700/80 px-1.5 flex items-center">
                    <span className="text-[8px] text-white">↑</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Feature callouts */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: '🤖',
            title: 'Agent Team Panel',
            desc: 'See every agent live — who\'s working, who\'s idle, real-time activity lights. Sub-agents get fun short names so you can tell them apart at a glance.',
          },
          {
            icon: '📋',
            title: 'Smart Kanban',
            desc: 'Drag cards across columns, set inline priority, mark tasks blocked or escalate to yourself with one click. Spinning icon shows when an agent is actively on a card.',
          },
          {
            icon: '💰',
            title: 'Cost & Savings Tiles',
            desc: 'Live token usage, estimated spend, and savings vs direct API calls — all from your agent stats. Set a monthly token budget and watch the % consumed in real time.',
          },
          {
            icon: '💬',
            title: 'Agent Chat',
            desc: 'Threaded conversations with your primary agent. Switch topics via the thread sidebar — Sprint, Auth, Kanban, or any thread you create. Input always visible.',
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
