'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { AlertTriangle, Bot, ChevronDown, ChevronRight, Clock3, MessageSquare, Pencil, Plus, Send, Settings2, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EventItem, EventTimeline } from '@/components/EventTimeline';

type ChecklistItem = { id: string; text: string; checked: boolean };

type Task = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  goal: string;
  goalId: string | null;
  tags: string;
  assignedAgent: string | null;
  checklist: ChecklistItem[];
};

type ApiTask = Omit<Task, 'assignedAgent'> & { assignedAgent?: string | null; assigned_agent?: string | null };

type TaskForm = {
  title: string;
  description: string;
  goal: string;
  priority: string;
  status: string;
  tags: string;
  checklist: ChecklistItem[];
};

type Filters = { search: string; priority: string; goal: string; agent: string; tags: string };

type AgentStatus = 'working' | 'idle' | 'inactive';

type ActiveAgent = {
  agentName: string;
  tokens: number;
  costUsd: string;
  lastSeenAt: string;
  status: AgentStatus;
};

type StatsSummary = {
  pctComplete: number;
  activeAgents: number;
  totalCostUsd: string;
  savedUsd: string;
  savingsRatePct: number;
  tasksDoneToday: number;
  totalTasks: number;
  doneTasks: number;
  totalTokens: number;
  tokenLimitMonthly: number;
  tokenPctOfLimit: number | null;
  primaryAgentName: string | null;
};

const STATUS_COLUMNS = ['todo', 'in_progress', 'done'];
const STATUS_LABELS: Record<string, string> = { todo: 'Todo', in_progress: 'In Progress', done: 'Done' };
const COLUMN_LABELS_KEY = 'mc-column-labels';
const COLUMN_COLLAPSED_KEY = 'mc-column-collapsed';
const WIP_LIMITS_KEY = 'mc-wip-limits';
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const emptyForm: TaskForm = { title: '', description: '', goal: '', priority: 'Medium', status: 'todo', tags: '', checklist: [] };
const emptyFilters: Filters = { search: '', priority: 'All', goal: 'All', agent: 'All', tags: '' };

function normalizeStatus(status: string) {
  const value = (status || '').toLowerCase();
  if (['done', 'complete', 'completed'].includes(value)) return 'done';
  if (['in_progress', 'in progress', 'assigned', 'review'].includes(value)) return 'in_progress';
  return 'todo';
}

function mapTask(t: ApiTask): Task {
  return {
    ...t,
    status: normalizeStatus(t.status),
    assignedAgent: t.assignedAgent ?? t.assigned_agent ?? null,
    priority: t.priority || 'Medium',
    goal: t.goal || t.goalId || 'Unlinked',
    tags: t.tags || '',
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
  };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getTaskTags(tags: string): string[] {
  return (tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function isTaskBlocked(tags: string): boolean {
  const list = getTaskTags(tags);
  return list.includes('blocked') || list.includes('needs-human') || list.includes('needs human');
}

function isTaskNeedsHuman(tags: string): boolean {
  const list = getTaskTags(tags);
  return list.includes('needs-human') || list.includes('needs human');
}

function toggleBlockedTag(tags: string, flagKey: 'blocked' | 'needs-human'): string {
  const list = getTaskTags(tags);
  const otherFlags = ['blocked', 'needs-human', 'needs human'];
  const hasFlag = list.some((t) => otherFlags.includes(t));
  const cleaned = list.filter((t) => !otherFlags.includes(t));
  if (hasFlag) {
    return cleaned.join(', ');
  }
  return [...cleaned, flagKey].join(', ');
}

function StatsTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`h-14 w-44 rounded-lg border-2 ${color} bg-gray-900 px-3 py-1.5 flex flex-col justify-between`}>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <div className="text-base font-bold text-white truncate">{value}</div>
        {sub && <div className="text-[9px] text-gray-500 truncate">{sub}</div>}
      </div>
      <div className="text-[10px] text-gray-400 border-t border-gray-800 pt-1">{label}</div>
    </div>
  );
}

function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (next: ChecklistItem[]) => void }) {
  return (
    <div className="space-y-2 rounded-md border border-gray-800 p-2">
      <div className="text-xs text-gray-400">Checklist</div>
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2">
          <input type="checkbox" checked={item.checked} onChange={(e) => onChange(items.map((entry) => (entry.id === item.id ? { ...entry, checked: e.target.checked } : entry)))} />
          <input
            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs"
            value={item.text}
            onChange={(e) => onChange(items.map((entry) => (entry.id === item.id ? { ...entry, text: e.target.value } : entry)))}
            placeholder={`Checklist item ${index + 1}`}
          />
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}>x</Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2"
        onClick={() => onChange([...items, { id: `manual-${Date.now()}`, text: '', checked: false }])}
      >
        Add checklist item
      </Button>
    </div>
  );
}

function TaskFormFields({ value, onChange, goalOptions }: { value: TaskForm; onChange: (next: TaskForm) => void; goalOptions: string[] }) {
  return (
    <div className="space-y-3">
      <input className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" placeholder="Title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      <textarea className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" rows={3} placeholder="Description" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} />
      <input className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" placeholder="Tags (comma separated)" value={value.tags} onChange={(e) => onChange({ ...value, tags: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" value={value.goal} onChange={(e) => onChange({ ...value, goal: e.target.value })}>
          <option value="">Parent goal (optional)</option>
          {goalOptions.map((goalId) => <option key={goalId} value={goalId}>{goalId}</option>)}
        </select>
        <select className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm" value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
        <select className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm col-span-2" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })}>{STATUS_COLUMNS.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>
      </div>
      <ChecklistEditor items={value.checklist} onChange={(checklist) => onChange({ ...value, checklist })} />
    </div>
  );
}

// ─── Agent Team Panel ─────────────────────────────────────────────────────────

function timeSince(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function activityWord(status: AgentStatus): string {
  if (status === 'working') return 'Active';
  if (status === 'idle') return 'Idle';
  return 'Offline';
}

function ActivityLights({ status }: { status: AgentStatus }) {
  const base = 'h-1.5 w-1.5 rounded-full';
  if (status === 'working') {
    return (
      <span className="flex items-center gap-0.5">
        <span className={`${base} bg-emerald-400 animate-[pulse_1.0s_ease-in-out_infinite]`} />
        <span className={`${base} bg-emerald-400 animate-[pulse_1.0s_ease-in-out_0.33s_infinite]`} />
        <span className={`${base} bg-emerald-400 animate-[pulse_1.0s_ease-in-out_0.66s_infinite]`} />
      </span>
    );
  }
  if (status === 'idle') {
    return (
      <span className="flex items-center gap-0.5">
        <span className={`${base} bg-yellow-400 animate-[pulse_2.5s_ease-in-out_infinite]`} />
        <span className={`${base} bg-yellow-400/50`} />
        <span className={`${base} bg-yellow-400/20`} />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5">
      <span className={`${base} bg-gray-600`} />
      <span className={`${base} bg-gray-700`} />
      <span className={`${base} bg-gray-800`} />
    </span>
  );
}

function AgentTile({ name, status, lastSeen, isNavi }: { name: string; status: AgentStatus; lastSeen?: string; isNavi?: boolean }) {
  return (
    <div className={`rounded-md border p-2 space-y-1.5 ${status === 'working' ? 'border-emerald-700/60 bg-emerald-950/20' : 'border-gray-800 bg-gray-950'}`}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bot className={`h-3.5 w-3.5 flex-shrink-0 ${status === 'working' ? 'text-emerald-400' : 'text-gray-500'}`} />
          <span className="text-xs font-semibold text-white truncate" title={name}>{isNavi ? '🧭 Navi' : name}</span>
        </div>
        <ActivityLights status={status} />
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-medium ${status === 'working' ? 'text-emerald-400' : status === 'idle' ? 'text-yellow-400' : 'text-gray-500'}`}>{activityWord(status)}</span>
        {lastSeen && <span className="text-[10px] text-gray-600">{timeSince(lastSeen)}</span>}
      </div>
    </div>
  );
}

// Fun short names for sub-agents — deterministic, collision-free per session
const FUN_NAMES = ['Spark', 'Pixel', 'Drift', 'Blaze', 'Echo', 'Nova', 'Flux', 'Cleo', 'Zed', 'Rook', 'Mox', 'Sage', 'Fern', 'Byte', 'Koda', 'Vex', 'Luma', 'Cruz', 'Wren', 'Jett'];
const agentNameCache = new Map<string, string>();

function funNameFor(rawName: string): string {
  if (agentNameCache.has(rawName)) return agentNameCache.get(rawName)!;
  // Pick from names not yet assigned
  const used = new Set(agentNameCache.values());
  let hash = 0;
  for (let i = 0; i < rawName.length; i++) hash = (hash * 31 + rawName.charCodeAt(i)) >>> 0;
  const available = FUN_NAMES.filter((n) => !used.has(n));
  const pool = available.length > 0 ? available : FUN_NAMES;
  const name = pool[hash % pool.length] ?? rawName;
  agentNameCache.set(rawName, name);
  return name;
}

function AgentTeamPanel({ gatewayOk, primaryAgentName }: { gatewayOk: boolean; primaryAgentName: string | null }) {
  const [agents, setAgents] = useState<ActiveAgent[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/agents/active', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as ActiveAgent[];
        setAgents(Array.isArray(data) ? data : []);
      }
    };
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => clearInterval(interval);
  }, []);

  const displayName = primaryAgentName || 'Navi';
  const naviStatus: AgentStatus = gatewayOk ? 'working' : 'inactive';
  const subAgents = agents.filter((a) => !['navi', displayName.toLowerCase()].includes(a.agentName.toLowerCase()));

  return (
    <div className="w-full space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 px-1">Team</div>
      <AgentTile name={displayName} status={naviStatus} isNavi />
      {subAgents.map((agent) => (
        <AgentTile
          key={agent.agentName}
          name={funNameFor(agent.agentName)}
          status={agent.status}
          lastSeen={agent.lastSeenAt}
        />
      ))}
      {subAgents.length === 0 && (
        <div className="text-[10px] text-gray-600 px-1">No sub-agents active</div>
      )}
    </div>
  );
}

// ─── Resizable Divider ────────────────────────────────────────────────────────

function ResizableDivider({ onDrag }: { onDrag: (dx: number) => void }) {
  const lastX = useRef<number | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    lastX.current = e.clientX;
    const onMove = (me: MouseEvent) => {
      if (lastX.current === null) return;
      onDrag(me.clientX - lastX.current);
      lastX.current = me.clientX;
    };
    const onUp = () => {
      lastX.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  return (
    <div
      className="w-1.5 flex-shrink-0 cursor-col-resize group relative"
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-0 bg-gray-800 group-hover:bg-indigo-500/50 transition-colors duration-150" />
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-700 group-hover:bg-indigo-400 transition-colors duration-150" />
    </div>
  );
}

// ─── Chat Pane ────────────────────────────────────────────────────────────────

type ChatMessage = { id: string; from: 'agent' | 'user'; avatar: string; text: string };
type ChatThread = { id: string; label: string };

const INITIAL_THREADS: ChatThread[] = [
  { id: '1', label: 'Sprint' },
  { id: '2', label: 'Auth' },
  { id: '3', label: 'Kanban' },
  { id: '4', label: 'Docs' },
];

const PLACEHOLDER_MESSAGES: ChatMessage[] = [
  { id: '1', from: 'agent', avatar: 'N', text: 'Working on T006 — auth middleware refactor. 3 subtasks complete, wrapping up tests.' },
  { id: '2', from: 'user', avatar: 'M', text: "What's the ETA?" },
  { id: '3', from: 'agent', avatar: 'N', text: '~15 minutes. Will update T006 status to done when complete.' },
  { id: '4', from: 'agent', avatar: 'N', text: 'Also flagging: T007 analytics dashboard merged to dev. Readiness score 95 — auto-merged.' },
];

function ChatPane({ primaryAgentName }: { primaryAgentName: string | null }) {
  const displayName = primaryAgentName || 'Navi';
  const initial = displayName[0]?.toUpperCase() ?? 'N';
  const [threads, setThreads] = useState<ChatThread[]>(INITIAL_THREADS);
  const [activeThreadId, setActiveThreadId] = useState('1');
  const [messagesByThread, setMessagesByThread] = useState<Record<string, ChatMessage[]>>({
    '1': PLACEHOLDER_MESSAGES,
    '2': [],
    '3': [],
    '4': [],
  });
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = messagesByThread[activeThreadId] ?? [];

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: ChatMessage = { id: String(Date.now()), from: 'user', avatar: 'M', text };
    setMessagesByThread((prev) => ({ ...prev, [activeThreadId]: [...(prev[activeThreadId] ?? []), userMsg] }));
    setInput('');
    setTimeout(() => {
      const agentMsg: ChatMessage = { id: String(Date.now() + 1), from: 'agent', avatar: initial, text: 'Got it — on it.' };
      setMessagesByThread((prev) => ({ ...prev, [activeThreadId]: [...(prev[activeThreadId] ?? []), agentMsg] }));
    }, 800);
  };

  const addThread = () => {
    const id = String(Date.now());
    const label = `Thread ${threads.length + 1}`;
    setThreads((prev) => [...prev, { id, label }]);
    setMessagesByThread((prev) => ({ ...prev, [id]: [] }));
    setActiveThreadId(id);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeThreadId]);

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="flex h-full bg-gray-950 overflow-hidden">
      {/* Thread sidebar — narrow */}
      <div className="w-14 flex-shrink-0 border-r border-gray-800 flex flex-col bg-gray-900/40">
        {/* Header icon */}
        <div className="flex-shrink-0 h-8 flex items-center justify-center border-b border-gray-800">
          <MessageSquare className="h-3 w-3 text-gray-600" />
        </div>
        {/* Thread list */}
        <div className="flex-1 overflow-y-auto py-1 [&::-webkit-scrollbar]:w-0.5 [&::-webkit-scrollbar-thumb]:bg-gray-800">
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => setActiveThreadId(thread.id)}
              className={`w-full px-1 py-2.5 text-[9px] leading-tight text-center truncate transition-colors border-l-2 ${
                activeThreadId === thread.id
                  ? 'bg-indigo-900/40 text-indigo-300 border-indigo-500'
                  : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/40 border-transparent'
              }`}
              title={thread.label}
            >
              {thread.label}
            </button>
          ))}
        </div>
        {/* New thread */}
        <button
          type="button"
          onClick={addThread}
          className="flex-shrink-0 h-8 flex items-center justify-center border-t border-gray-800 text-gray-600 hover:text-gray-400 hover:bg-gray-800/40 transition-colors"
          title="New thread"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Main chat column */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 border-b border-gray-800 bg-gray-900/60 flex-shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(74,222,128,0.6)]" />
          <span className="text-[11px] font-semibold text-gray-200">{displayName}</span>
          {activeThread && <span className="text-[9px] text-gray-600">· {activeThread.label}</span>}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <span className="text-[10px] text-gray-700">Start a conversation…</span>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.from === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5 ${msg.from === 'agent' ? 'bg-indigo-700' : 'bg-gray-700'}`}>
                {msg.avatar}
              </div>
              <div className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-200 max-w-[88%] ${msg.from === 'agent' ? 'bg-gray-800/80' : 'bg-indigo-900/50'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input — always pinned to bottom */}
        <div className="px-2.5 py-2 border-t border-gray-800 flex-shrink-0 bg-gray-900/30">
          <div className="flex gap-1.5 items-start">
            <textarea
              className="flex-1 min-w-0 rounded border border-gray-700/60 bg-gray-900 px-2.5 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-indigo-600/60 resize-none"
              placeholder={`Message ${displayName}\u2026`}
              rows={6}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button type="button" onClick={send} className="flex-shrink-0 rounded bg-indigo-700/80 hover:bg-indigo-600 p-1.5 transition-colors mt-0.5">
              <Send className="h-3 w-3 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main KanbanBoard ─────────────────────────────────────────────────────────

export function KanbanBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [newTask, setNewTask] = useState<TaskForm>(emptyForm);
  const [editTask, setEditTask] = useState<TaskForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [stats, setStats] = useState({ tokens: '--', cost: '--', agents: '--', taskSummary: '--', saved: '--', tokenPct: '--' });
  const [primaryAgentName, setPrimaryAgentName] = useState<string | null>(null);
  const [gatewayOk, setGatewayOk] = useState(false);
  const [leftWidth, setLeftWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(402);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [openHistoryTaskId, setOpenHistoryTaskId] = useState<number | null>(null);
  const [historyByTask, setHistoryByTask] = useState<Record<number, EventItem[]>>({});
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>(STATUS_LABELS);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});
  const [wipLimits, setWipLimits] = useState<Record<string, number | null>>({});
  const [editingWipColumn, setEditingWipColumn] = useState<string | null>(null);
  const [editingWipValue, setEditingWipValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workingByTask, setWorkingByTask] = useState<Record<number, boolean>>({});
  const [doneConfirm, setDoneConfirm] = useState<{ taskId: number; fromStatus: string; incomplete: number } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/tasks', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as ApiTask[];
    setTasks(data.map(mapTask));
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [summaryRes, gatewayRes] = await Promise.all([
        fetch('/api/stats/summary', { cache: 'no-store' }),
        fetch('/api/gateway', { cache: 'no-store' }),
      ]);

      const summary = (summaryRes.ok ? await summaryRes.json() : {}) as Partial<StatsSummary>;
      const gatewayData = (gatewayRes.ok ? await gatewayRes.json() : []) as Array<{ status: string }>;
      const connected = gatewayData.filter((item) => item.status === 'ok').length;
      setGatewayOk(connected > 0);

      const totalTokens = summary.totalTokens ?? 0;
      const totalCost = parseFloat(summary.totalCostUsd ?? '0');
      const savedCost = parseFloat(summary.savedUsd ?? '0');
      const activeAgents = summary.activeAgents ?? 0;
      const pct = summary.pctComplete ?? 0;
      const tokenPct = summary.tokenPctOfLimit;

      setPrimaryAgentName(summary.primaryAgentName ?? null);
      setStats({
        tokens: formatTokens(totalTokens),
        cost: `$${totalCost.toFixed(2)}`,
        saved: `$${savedCost.toFixed(2)}`,
        agents: String(activeAgents),
        taskSummary: `${pct}%`,
        tokenPct: typeof tokenPct === 'number' ? `${tokenPct}%` : '--',
      });
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    void load();
    const es = new EventSource('/api/tasks/stream');
    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as ApiTask[];
      setTasks(data.map(mapTask));
    };
    return () => es.close();
  }, [load]);

  useEffect(() => {
    void loadStats();
    const interval = setInterval(() => void loadStats(), 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  useEffect(() => {
    setWorkingByTask((prev) => {
      const next = { ...prev };
      for (const task of tasks) {
        next[task.id] = task.status === 'in_progress' && ['High', 'Critical'].includes(task.priority);
      }
      return next;
    });
  }, [tasks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedLabels = window.localStorage.getItem(COLUMN_LABELS_KEY);
      if (savedLabels) setColumnLabels({ ...STATUS_LABELS, ...(JSON.parse(savedLabels) as Record<string, string>) });
      const savedCollapsed = window.localStorage.getItem(COLUMN_COLLAPSED_KEY);
      if (savedCollapsed) setCollapsedColumns(JSON.parse(savedCollapsed) as Record<string, boolean>);
      const savedWip = window.localStorage.getItem(WIP_LIMITS_KEY);
      if (savedWip) setWipLimits(JSON.parse(savedWip) as Record<string, number | null>);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem(COLUMN_LABELS_KEY, JSON.stringify(columnLabels)); }, [columnLabels]);
  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem(COLUMN_COLLAPSED_KEY, JSON.stringify(collapsedColumns)); }, [collapsedColumns]);
  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem(WIP_LIMITS_KEY, JSON.stringify(wipLimits)); }, [wipLimits]);

  const goalOptions = useMemo(() => Array.from(new Set(tasks.map((task) => task.goalId).filter((value): value is string => Boolean(value)))), [tasks]);
  const filterGoalOptions = useMemo(() => ['All', ...goalOptions], [goalOptions]);
  const agentOptions = useMemo(() => ['All', ...Array.from(new Set(tasks.map((t) => t.assignedAgent).filter((value): value is string => Boolean(value))))], [tasks]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const search = filters.search.trim().toLowerCase();
    const tagSearch = filters.tags.trim().toLowerCase();
    const textMatch = search.length === 0 || task.title.toLowerCase().includes(search) || (task.description || '').toLowerCase().includes(search);
    const priorityMatch = filters.priority === 'All' || task.priority === filters.priority;
    const goalMatch = filters.goal === 'All' || task.goalId === filters.goal;
    const agentMatch = filters.agent === 'All' || task.assignedAgent === filters.agent;
    const tagsMatch = tagSearch.length === 0 || (task.tags || '').toLowerCase().includes(tagSearch);
    return textMatch && priorityMatch && goalMatch && agentMatch && tagsMatch;
  }), [tasks, filters]);

  const grouped = useMemo(() => STATUS_COLUMNS.map((col) => ({ col, items: filteredTasks.filter((t) => t.status === col) })), [filteredTasks]);
  const hasActiveFilters = filters.search !== '' || filters.priority !== 'All' || filters.goal !== 'All' || filters.agent !== 'All' || filters.tags !== '';
  const hiddenCount = tasks.length - filteredTasks.length;

  const updateTask = async (id: number, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('Failed to update goal');
    return mapTask((await response.json()) as ApiTask);
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const id = Number(result.draggableId);
    const status = result.destination.droppableId;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;

    if (status === 'done') {
      const incomplete = task.checklist.filter((item) => !item.checked).length;
      if (incomplete > 0) {
        setDoneConfirm({ taskId: id, fromStatus: task.status, incomplete });
        return;
      }
    }

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const updated = await updateTask(id, { status });
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to move goal');
      void load();
    }
  };

  const onInlinePriorityChange = async (task: Task, e: ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const priority = e.target.value;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, priority } : t)));
    try {
      const updated = await updateTask(task.id, { priority });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      void load();
    }
  };

  const toggleBlocked = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTags = toggleBlockedTag(task.tags, 'blocked');
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, tags: newTags } : t)));
    try {
      const updated = await updateTask(task.id, { tags: newTags });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      void load();
    }
  };

  const toggleNeedsHuman = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTags = toggleBlockedTag(task.tags, 'needs-human');
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, tags: newTags } : t)));
    try {
      const updated = await updateTask(task.id, { tags: newTags });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      void load();
    }
  };

  const openAddForColumn = (status: string) => {
    setNewTask({ ...emptyForm, status, goal: goalOptions[0] || '' });
    setErrorMessage(null);
    setIsAddOpen(true);
  };

  const createTask = async () => {
    setErrorMessage(null);
    const payload = { ...newTask, checklist: newTask.checklist.filter((item) => item.text.trim().length > 0) };
    const response = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      let detail = 'Failed to create goal';
      try {
        const err = (await response.json()) as { error?: string };
        if (err.error) detail = err.error;
      } catch { /* noop */ }
      setErrorMessage(detail);
      return;
    }
    const created = mapTask((await response.json()) as ApiTask);
    setTasks((prev) => [...prev, created]);
    setNewTask(emptyForm);
    setIsAddOpen(false);
  };

  const saveTask = async () => {
    if (!editingId) return;
    setErrorMessage(null);
    const payload = { ...editTask, checklist: editTask.checklist.filter((item) => item.text.trim().length > 0) };
    const response = await fetch(`/api/tasks/${editingId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      setErrorMessage('Failed to save goal');
      return;
    }
    const updated = mapTask((await response.json()) as ApiTask);
    setTasks((prev) => prev.map((task) => (task.id === editingId ? updated : task)));
    setIsEditOpen(false);
    setEditingId(null);
  };

  const deleteTask = async () => {
    if (!editingId) return;
    await fetch(`/api/tasks/${editingId}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((task) => task.id !== editingId));
    setIsEditOpen(false);
    setEditingId(null);
  };

  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTask({ title: task.title, description: task.description, goal: task.goalId || task.goal || '', priority: task.priority, status: task.status, tags: task.tags || '', checklist: task.checklist || [] });
    setErrorMessage(null);
    setIsEditOpen(true);
  };

  const loadHistory = useCallback(async (taskId: number) => {
    const response = await fetch(`/api/events?taskId=${taskId}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as EventItem[];
    setHistoryByTask((prev) => ({ ...prev, [taskId]: data }));
  }, []);

  const toggleHistory = async (taskId: number) => {
    const next = openHistoryTaskId === taskId ? null : taskId;
    setOpenHistoryTaskId(next);
    if (next !== null && !historyByTask[taskId]) await loadHistory(taskId);
  };

  const confirmDoneMove = async (markDone: boolean) => {
    if (!doneConfirm) return;
    const { taskId, fromStatus } = doneConfirm;
    setDoneConfirm(null);
    if (!markDone) {
      setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: fromStatus } : task)));
      return;
    }

    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: 'done' } : task)));
    try {
      const updated = await updateTask(taskId, { status: 'done' });
      setTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
    } catch {
      void load();
    }
  };

  const startEditingLabel = (column: string) => { setEditingColumn(column); setEditingLabelValue(columnLabels[column] || STATUS_LABELS[column] || column); };
  const saveColumnLabel = (column: string) => { setColumnLabels((prev) => ({ ...prev, [column]: editingLabelValue.trim() || STATUS_LABELS[column] || column })); setEditingColumn(null); };
  const toggleColumnCollapsed = (column: string) => setCollapsedColumns((prev) => ({ ...prev, [column]: !prev[column] }));
  const startWipEdit = (column: string) => { setEditingWipColumn(column); const current = wipLimits[column]; setEditingWipValue(current && current > 0 ? String(current) : ''); };
  const saveWipLimit = (column: string) => { const parsed = Number(editingWipValue); setWipLimits((prev) => ({ ...prev, [column]: Number.isFinite(parsed) && parsed > 0 ? parsed : null })); setEditingWipColumn(null); };

  return (
    <div className="space-y-2">
      {/* Stats tiles */}
      <div className="flex gap-3 overflow-x-auto pb-0.5">
        <StatsTile label="Session Tokens" value={stats.tokens} sub={stats.tokenPct !== '--' ? `${stats.tokenPct} of limit` : undefined} color="border-blue-700" />
        <StatsTile label="Estimated Cost" value={stats.cost} color="border-emerald-700" />
        <StatsTile label="Saved via Routing" value={stats.saved} sub="vs direct API" color="border-teal-700" />
        <StatsTile label="Active Agents" value={stats.agents} color="border-purple-700" />
        <StatsTile label="% Complete" value={stats.taskSummary} color="border-orange-700" />
      </div>

      {/* 3-pane resizable layout */}
      <div className="flex h-[calc(100vh-165px)] rounded-lg overflow-hidden border border-gray-800">

        {/* ── Left pane: Agent Team ── */}
        <div style={{ width: leftWidth, minWidth: 140, maxWidth: 320 }} className="flex-shrink-0 overflow-y-auto bg-gray-900/50 p-3 space-y-2">
          <AgentTeamPanel gatewayOk={gatewayOk} primaryAgentName={primaryAgentName} />
        </div>

        <ResizableDivider onDrag={(dx) => setLeftWidth((w) => Math.max(140, Math.min(320, w + dx)))} />

        {/* ── Middle pane: Filters + Kanban ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Compact filter bar */}
          <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/30 px-3 py-2">
            <div className="flex flex-wrap gap-1.5 items-center">
              <input className="rounded border border-gray-700/60 bg-gray-950 px-2 py-1 text-xs w-36" placeholder="Search…" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} />
              <select className="rounded border border-gray-700/60 bg-gray-950 px-2 py-1 text-xs" value={filters.priority} onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}><option value="All">Priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              <select className="rounded border border-gray-700/60 bg-gray-950 px-2 py-1 text-xs" value={filters.goal} onChange={(e) => setFilters((prev) => ({ ...prev, goal: e.target.value }))}>{filterGoalOptions.map((g) => <option key={g} value={g}>{g === 'All' ? 'Goal' : g}</option>)}</select>
              <select className="rounded border border-gray-700/60 bg-gray-950 px-2 py-1 text-xs" value={filters.agent} onChange={(e) => setFilters((prev) => ({ ...prev, agent: e.target.value }))}>{agentOptions.map((a) => <option key={a} value={a}>{a === 'All' ? 'Agent' : a}</option>)}</select>
              <input className="rounded border border-gray-700/60 bg-gray-950 px-2 py-1 text-xs w-24" placeholder="Tag" value={filters.tags} onChange={(e) => setFilters((prev) => ({ ...prev, tags: e.target.value }))} />
              {hasActiveFilters && <button type="button" onClick={() => setFilters(emptyFilters)} className="text-[10px] text-gray-500 hover:text-gray-300 px-1">✕ Clear</button>}
              {hasActiveFilters && hiddenCount > 0 && <span className="text-[10px] text-gray-600">{hiddenCount} hidden</span>}
            </div>
            {errorMessage && <div className="mt-1.5 rounded border border-red-800 bg-red-950/40 px-2 py-1 text-[10px] text-red-200">{errorMessage}</div>}
          </div>

          {/* Kanban columns — styled scrollbar to match card bg */}
          <div className="flex-1 overflow-auto p-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-2 pb-2">
              {grouped.map(({ col, items }) => {
                const isCollapsed = Boolean(collapsedColumns[col]);
                const limit = wipLimits[col];
                const isOverWip = typeof limit === 'number' && limit > 0 && items.length > limit;
                const titleColor = isOverWip ? 'text-amber-300' : 'text-gray-500';

                return (
                  <div key={col} className="w-64 flex-shrink-0">
                    <div className={`mb-1.5 rounded border px-1.5 py-0.5 ${isOverWip ? 'border-amber-600 bg-amber-950/30' : 'border-transparent bg-transparent'}`}>
                      <div className="flex items-center justify-between gap-1">
                        <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${titleColor}`}>
                          <button type="button" onClick={() => toggleColumnCollapsed(col)} className="rounded p-0.5 hover:bg-gray-800" aria-label={isCollapsed ? 'Expand column' : 'Collapse column'}>
                            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                          {editingColumn === col ? <input autoFocus value={editingLabelValue} onChange={(e) => setEditingLabelValue(e.target.value)} onBlur={() => saveColumnLabel(col)} onKeyDown={(e) => { if (e.key === 'Enter') saveColumnLabel(col); if (e.key === 'Escape') setEditingColumn(null); }} className="w-28 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] normal-case text-white" /> : <span className="normal-case">{columnLabels[col] || STATUS_LABELS[col]}</span>}
                          <span className="text-gray-600">({items.length})</span>
                          {typeof limit === 'number' && limit > 0 && <span className="text-gray-600">WIP {limit}</span>}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {(col === 'todo' || col === 'in_progress') && (
                            <button type="button" onClick={() => openAddForColumn(col)} className="h-5 w-5 rounded border border-gray-700/60 p-0 text-gray-500 hover:bg-gray-800 hover:text-gray-300" aria-label={`Add ${STATUS_LABELS[col]} goal`}>
                              <Plus className="mx-auto h-3 w-3" />
                            </button>
                          )}
                          <button type="button" onClick={() => startEditingLabel(col)} className="h-5 w-5 rounded border border-gray-700/60 p-0 text-gray-500 hover:bg-gray-800 hover:text-gray-300"><Pencil className="mx-auto h-2.5 w-2.5" /></button>
                          <button type="button" onClick={() => startWipEdit(col)} className="h-5 w-5 rounded border border-gray-700/60 p-0 text-gray-500 hover:bg-gray-800 hover:text-gray-300"><Settings2 className="mx-auto h-2.5 w-2.5" /></button>
                        </div>
                      </div>
                      {editingWipColumn === col && <div className="mt-1 flex items-center gap-1.5"><input type="number" min={1} placeholder="No limit" value={editingWipValue} onChange={(e) => setEditingWipValue(e.target.value)} onBlur={() => saveWipLimit(col)} onKeyDown={(e) => { if (e.key === 'Enter') saveWipLimit(col); if (e.key === 'Escape') setEditingWipColumn(null); }} className="w-20 rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] text-white" /><span className="text-[10px] text-gray-500">0 to clear</span></div>}
                    </div>

                    {!isCollapsed && (
                      <Droppable droppableId={col}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-32 rounded-lg p-1.5 space-y-1.5 transition-colors [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-800 [&::-webkit-scrollbar-thumb]:rounded-full ${snapshot.isDraggingOver ? 'bg-gray-800/60' : 'bg-gray-900/60'}`}>
                            {items.map((task, i) => {
                              const completeCount = task.checklist.filter((item) => item.checked).length;
                              const totalCount = task.checklist.length;
                              const isWorking = Boolean(workingByTask[task.id]);
                              const blocked = isTaskBlocked(task.tags);
                              const needsHuman = isTaskNeedsHuman(task.tags);

                              return (
                                <Draggable key={task.id} draggableId={String(task.id)} index={i}>
                                  {(p, s) => (
                                    <div ref={p.innerRef} {...p.draggableProps} className={`relative rounded border bg-gray-800 p-2.5 ${blocked ? 'border-red-700/70 shadow-[0_0_8px_rgba(239,68,68,0.15)]' : isWorking ? 'border-indigo-500/40' : 'border-gray-700/70'} ${s.isDragging ? 'border-blue-500 shadow-lg' : ''}`}>
                                      {isWorking && !blocked && <div className="absolute right-1.5 top-1.5"><Bot className="h-3 w-3 text-indigo-300 animate-spin" /></div>}

                                      {/* Blocked / Needs Human label */}
                                      {blocked && (
                                        <div className="mb-1.5 flex items-center">
                                          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${needsHuman ? 'bg-red-600' : 'bg-red-700'}`}>
                                            <AlertTriangle className="h-2 w-2" />
                                            {needsHuman ? 'NEEDS YOU' : 'BLOCKED'}
                                          </span>
                                        </div>
                                      )}

                                      <div {...p.dragHandleProps} onClick={() => openEdit(task)} className="cursor-pointer">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {task.goalId && <Badge className="bg-indigo-600/80 text-white text-[9px] px-1 py-0">{task.goalId}</Badge>}
                                          <p className="text-xs font-medium text-white leading-tight">{task.title}</p>
                                        </div>
                                        {task.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 leading-snug">{task.description}</p>}
                                      </div>

                                      {task.checklist.length > 0 && (
                                        <div className="mt-1 space-y-0.5">
                                          {task.checklist.map((item) => (
                                            <label key={item.id} className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                              <input type="checkbox" checked={item.checked} readOnly className="h-2.5 w-2.5" />
                                              <span className={item.checked ? 'line-through text-gray-600' : ''}>{item.text}</span>
                                            </label>
                                          ))}
                                        </div>
                                      )}

                                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                        <select value={task.priority} onClick={(e) => e.stopPropagation()} onChange={(e) => onInlinePriorityChange(task, e)} className="rounded border border-gray-700/60 bg-gray-950 px-1.5 py-0.5 text-[10px]">{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
                                        <Badge variant="outline" className="text-[9px] px-1 py-0">{task.goal}</Badge>
                                        {task.checklist.length > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0">{completeCount}/{totalCount}</Badge>}
                                        {task.assignedAgent && <Badge className="text-[9px] px-1 py-0">{task.assignedAgent}</Badge>}
                                        {task.tags && (() => {
                                          const displayTags = task.tags.split(',').map(t => t.trim()).filter(t => t && !['blocked','needs-human','needs human'].includes(t.toLowerCase()));
                                          return displayTags.length > 0 ? <Badge variant="outline" className="text-[9px] px-1 py-0">{displayTags.join(', ')}</Badge> : null;
                                        })()}
                                      </div>

                                      {/* Quick action buttons */}
                                      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={(e) => void toggleBlocked(task, e)}
                                          className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] transition-colors ${blocked && !needsHuman ? 'border-red-700 bg-red-900/40 text-red-300' : 'border-gray-700/60 text-gray-500 hover:border-red-700 hover:text-red-300'}`}
                                          title="Toggle blocked"
                                        >
                                          <AlertTriangle className="h-2 w-2" />Blocked
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => void toggleNeedsHuman(task, e)}
                                          className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] transition-colors ${needsHuman ? 'border-red-600 bg-red-900/40 text-red-300' : 'border-gray-700/60 text-gray-500 hover:border-red-600 hover:text-red-300'}`}
                                          title="Toggle needs human"
                                        >
                                          <UserX className="h-2 w-2" />Needs you
                                        </button>
                                        <button type="button" onClick={() => void toggleHistory(task.id)} className="inline-flex items-center gap-0.5 rounded border border-gray-700/60 px-1.5 py-0.5 text-[9px] text-gray-500 hover:text-gray-300 hover:border-gray-600"><Clock3 className="h-2 w-2" />History</button>
                                      </div>

                                      {openHistoryTaskId === task.id && <div className="mt-1.5 rounded border border-gray-700/60 bg-gray-900 p-1.5"><EventTimeline events={historyByTask[task.id] || []} /></div>}
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </div>
                );
              })}
            </div>
          </DragDropContext>
          </div>{/* end overflow-auto */}
        </div>{/* end middle pane */}

        <ResizableDivider onDrag={(dx) => setRightWidth((w) => Math.max(280, Math.min(700, w - dx)))} />

        {/* ── Right pane: Chat ── */}
        <div style={{ width: rightWidth, minWidth: 280, maxWidth: 700 }} className="flex-shrink-0 overflow-hidden h-full">
          <ChatPane primaryAgentName={primaryAgentName} />
        </div>

      </div>{/* end 3-pane */}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader><DialogTitle>Add Goal</DialogTitle><DialogDescription>Create a new card on the board.</DialogDescription></DialogHeader>
          <TaskFormFields value={newTask} onChange={setNewTask} goalOptions={goalOptions} />
          <DialogFooter><Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button><Button onClick={createTask}>Create Goal</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader><DialogTitle>Edit Goal</DialogTitle><DialogDescription>Update goal details, status, and checklist.</DialogDescription></DialogHeader>
          <TaskFormFields value={editTask} onChange={setEditTask} goalOptions={goalOptions} />
          <DialogFooter className="justify-between"><Button variant="destructive" onClick={deleteTask}>Delete</Button><div className="flex gap-2"><Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button><Button onClick={saveTask}>Save</Button></div></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(doneConfirm)} onOpenChange={(open) => { if (!open) setDoneConfirm(null); }}>
        <DialogContent className="bg-gray-950 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Incomplete checklist items</DialogTitle>
            <DialogDescription>This goal has {doneConfirm?.incomplete ?? 0} incomplete items. Mark as done anyway, or keep working?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => void confirmDoneMove(false)}>Keep In Progress</Button>
            <Button onClick={() => void confirmDoneMove(true)}>Mark Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
