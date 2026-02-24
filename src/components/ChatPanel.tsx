'use client';

/**
 * ChatPanel — Real-time chat UI for ArchonHQ Mission Control
 *
 * - Fetches message history on mount via GET /api/chat/history
 * - Sends messages via POST /api/chat
 * - Dark-themed, matching the dashboard palette
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

// ── Agent status types (mirrored from KanbanBoard) ─────────────────────────
type AgentStatus = 'working' | 'idle' | 'inactive';
interface ActiveAgent {
  agentName: string;
  status: AgentStatus;
  lastSeenAt: string;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  threadId?: number | null;
}

interface HistoryResponse {
  messages: ChatMessage[];
  error?: string;
}

function normalizeChatMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = Number(r.id);
  if (!Number.isFinite(id)) return null;

  const roleRaw = String(r.role ?? '').toLowerCase().trim();
  const role: ChatMessage['role'] =
    roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system'
      ? (roleRaw as ChatMessage['role'])
      : 'assistant';

  const threadIdRaw = (r as any).threadId;
  const threadId = typeof threadIdRaw === 'number' && Number.isFinite(threadIdRaw) ? threadIdRaw : null;

  return {
    id,
    role,
    content: String(r.content ?? ''),
    createdAt: String(r.createdAt ?? ''),
    threadId,
  };
}

function isNearDuplicate(a: ChatMessage, b: ChatMessage): boolean {
  if (String(a.id) === String(b.id)) return true;
  if (a.role !== b.role) return false;
  if (a.content !== b.content) return false;
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) < 2_000;
}

interface ChatResponse {
  reply: string;
  messageId?: number;
  userMessageId?: number;
  threadId?: number;
  error?: boolean;
}

let localIdCounter = -1;
function nextLocalId(): number {
  return localIdCounter--;
}

type ChatThread = {
  id: number;
  title: string;
  updatedAt?: string;
  createdAt?: string;
};

type ThreadsResponse = {
  threads: ChatThread[];
};

type ThreadResponse = {
  thread: ChatThread;
};

export function ChatPanel({ agentName }: { agentName?: string } = {}) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const loading = pendingCount > 0;
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [naviStatus, setNaviStatus] = useState<AgentStatus>('inactive');
  const [naviLastSeen, setNaviLastSeen] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  const stickToBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchHistory = useCallback(async (threadId: number) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/chat/history?limit=80&threadId=${encodeURIComponent(String(threadId))}`, { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data: HistoryResponse = await res.json();
      const normalized: ChatMessage[] = (data.messages ?? [])
        .map((m) => normalizeChatMessage(m))
        .filter((m): m is ChatMessage => !!m);

      // De-dupe by id, then by (role+content+near-time) to guard against
      // races between WS pushes and history polls.
      const byIdSeen = new Set<string>();
      const pass1: ChatMessage[] = [];
      for (const m of normalized) {
        const k = String(m.id);
        if (byIdSeen.has(k)) continue;
        byIdSeen.add(k);
        pass1.push(m);
      }

      const pass2: ChatMessage[] = [];
      for (const m of pass1) {
        if (pass2.some((x) => isNearDuplicate(x, m))) continue;
        pass2.push(m);
      }

      setMessages(pass2);
      setHasMore((data.messages ?? []).length >= 80);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setHistoryError(msg);
      console.error('[ChatPanel] Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchThreads = useCallback(async () => {
    const res = await fetch('/api/chat/threads', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ThreadsResponse = await res.json();
    const list = (data.threads ?? []).filter((t) => typeof t?.id === 'number');
    setThreads(list);
    return list;
  }, []);

  const createThread = useCallback(async (title?: string) => {
    const res = await fetch('/api/chat/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${t}`);
    }
    const data: ThreadResponse = await res.json();
    const thread = data.thread;
    setThreads((prev) => [thread, ...prev]);
    return thread;
  }, []);

  const renameThread = useCallback(async (id: number, title: string) => {
    const res = await fetch(`/api/chat/threads/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${t}`);
    }
    const data: ThreadResponse = await res.json();
    const thread = data.thread;
    setThreads((prev) => prev.map((x) => (x.id === id ? thread : x)));
    return thread;
  }, []);

  const deleteThread = useCallback(async (id: number) => {
    const res = await fetch(`/api/chat/threads/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${t}`);
    }
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadOlder = useCallback(async () => {
    if (loadingOlder) return;
    if (!hasMore) return;

    const first = messages[0];
    const beforeId = first?.id;
    if (!beforeId || beforeId <= 0) {
      setHasMore(false);
      return;
    }

    const container = messagesRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    setLoadingOlder(true);
    try {
      const threadId = selectedThreadId;
      if (!threadId) return;

      const res = await fetch(`/api/chat/history?limit=80&beforeId=${encodeURIComponent(String(beforeId))}&threadId=${encodeURIComponent(String(threadId))}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data: HistoryResponse = await res.json();
      const older: ChatMessage[] = (data.messages ?? [])
        .map((m) => normalizeChatMessage(m))
        .filter((m): m is ChatMessage => !!m && m.id > 0);

      if (older.length === 0) {
        setHasMore(false);
        return;
      }

      setMessages((prev) => {
        const merged: ChatMessage[] = [...older, ...prev];
        const byId = new Set<string>();
        const out: ChatMessage[] = [];
        for (const m of merged) {
          const k = String(m.id);
          if (byId.has(k)) continue;
          byId.add(k);
          out.push(m);
        }
        return out;
      });

      // Maintain visual position: keep the same content under the user's eye.
      setTimeout(() => {
        const el = messagesRef.current;
        if (!el) return;
        const nextScrollHeight = el.scrollHeight;
        const delta = nextScrollHeight - prevScrollHeight;
        el.scrollTop = prevScrollTop + delta;
      }, 0);
    } catch (err) {
      console.error('[ChatPanel] Failed to load older:', err);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, messages, messagesRef, selectedThreadId]);

  // ── Load threads on mount ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const list = await fetchThreads();
        let initial = list[0];
        if (!initial) {
          initial = await createThread('Main');
        }
        setSelectedThreadId(initial.id);
      } catch (err) {
        console.error('[ChatPanel] Failed to init threads:', err);
      }
    })();
  }, [fetchThreads, createThread]);

  // If thread changes, reload history.
  useEffect(() => {
    if (!selectedThreadId) return;
    // Reset scroll behavior for new thread
    initialScrollDone.current = false;
    stickToBottomRef.current = true;
    setMessages([]);
    void fetchHistory(selectedThreadId);
  }, [selectedThreadId, fetchHistory]);

  // ── WebSocket — real-time message push ───────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1_000); // exponential backoff start: 1s
  const unmountedRef = useRef(false);

  const connectWs = useCallback(async () => {
    if (unmountedRef.current) return;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    try {
      const tokenRes = await fetch('/api/chat/ws-token');
      if (!tokenRes.ok) return; // Unauthenticated — don't loop
      const { token } = (await tokenRes.json()) as { token: string };

      if (unmountedRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/chat/ws?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        reconnectDelayRef.current = 1_000; // reset backoff on success
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data as string) as unknown;
          const base = normalizeChatMessage(raw);
          if (!base) return;

          const msg: ChatMessage = {
            ...base,
            createdAt: base.createdAt || new Date().toISOString(),
          };

          // Thread filtering: ignore messages for other threads.
          if (selectedThreadId && msg.threadId && msg.threadId !== selectedThreadId) {
            // Still bump ordering so the thread rises to the top.
            setThreads((prev) => {
              const next = prev.map((t) => (t.id === msg.threadId ? { ...t, updatedAt: new Date().toISOString() } : t));
              next.sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')));
              return next;
            });
            return;
          }

          setMessages((prev) => {
            const key = String(msg.id);
            if (prev.some((m) => String(m.id) === key)) return prev;
            if (prev.some((m) => isNearDuplicate(m, msg))) return prev;
            return [...prev, msg];
          });
        } catch (err) {
          console.error('[ChatPanel] WS parse error:', err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsConnected(false);
        if (unmountedRef.current) return;
        // Exponential backoff: 1s → 2s → 4s → … → 30s max
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000);
        reconnectTimerRef.current = setTimeout(() => void connectWs(), reconnectDelayRef.current);
      };

      ws.onerror = () => {
        // onclose fires after onerror — reconnect logic lives there
      };
    } catch {
      if (unmountedRef.current) return;
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000);
      reconnectTimerRef.current = setTimeout(() => void connectWs(), reconnectDelayRef.current);
    }
  }, [selectedThreadId]);

  useEffect(() => {
    unmountedRef.current = false;
    void connectWs();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // ── Fallback poll when WS isn't connected (keeps MC chat fresh) ───────────
  useEffect(() => {
    if (wsConnected) return;
    if (!selectedThreadId) return;
    const id = setInterval(() => void fetchHistory(selectedThreadId), 3_000);
    return () => clearInterval(id);
  }, [wsConnected, fetchHistory, selectedThreadId]);

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    // Always jump to bottom on first paint (history load)
    if (!initialScrollDone.current) {
      el.scrollTop = el.scrollHeight;
      initialScrollDone.current = true;
      stickToBottomRef.current = true;
      return;
    }

    // Only auto-scroll when a NEW message arrives *and* the user is at the bottom.
    // (Do not couple to `loading` — that causes annoying "snap to bottom" while
    // the user is trying to scroll up during a reply.)
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // ── Poll Navi agent status ────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/agents/active', { cache: 'no-store' });
        if (!res.ok) return;
        const agents = (await res.json()) as ActiveAgent[];
        const navi = agents.find((a) =>
          ['navi', (agentName ?? 'navi').toLowerCase()].includes(a.agentName.toLowerCase())
        );
        if (navi) {
          setNaviStatus(navi.status);
          setNaviLastSeen(navi.lastSeenAt);
        } else {
          // No agent record yet — treat as working if gateway is reachable
          setNaviStatus('working');
          setNaviLastSeen(null);
        }
      } catch { /* ignore */ }
    };
    void poll();
    const id = setInterval(() => void poll(), 10_000);
    return () => clearInterval(id);
  }, [agentName]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');

    // User is actively sending → keep us pinned to bottom
    stickToBottomRef.current = true;

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: nextLocalId(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      threadId: selectedThreadId,
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setPendingCount((n) => n + 1);

    try {
      const threadId = selectedThreadId;
      if (!threadId) throw new Error('No thread selected');

      const res = await fetch('/api/chat/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, threadId }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Request failed');
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data: ChatResponse = await res.json();

      // Replace optimistic user message with confirmed DB ID.
      // NOTE: WS may deliver the same message before this replacement runs.
      // We de-dupe by final id to prevent double-renders.
      if (data.userMessageId) {
        setMessages((prev) => {
          const seen = new Set<string>();
          const out: ChatMessage[] = [];
          for (const m of prev) {
            const next = m.id === tempUserMsg.id ? { ...m, id: data.userMessageId!, threadId: data.threadId ?? m.threadId } : m;
            const k = String(next.id);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(next);
          }
          return out;
        });
      }

      const assistantMsg: ChatMessage = {
        id: data.messageId ?? nextLocalId(),
        role: 'assistant',
        content: data.reply,
        createdAt: new Date().toISOString(),
        threadId: data.threadId ?? selectedThreadId,
      };

      // WS may deliver the same assistant reply before this line runs.
      // Guard against duplicate inserts.
      setMessages((prev) => {
        const key = String(assistantMsg.id);
        if (prev.some((m) => String(m.id) === key)) return prev;
        if (prev.some((m) => isNearDuplicate(m, assistantMsg))) return prev;
        return [...prev, assistantMsg];
      });
    } catch (err) {
      console.error('[ChatPanel] Send failed:', err);
      const errMsg: ChatMessage = {
        id: nextLocalId(),
        role: 'assistant',
        content: 'Failed to get a response. Please try again.',
        createdAt: new Date().toISOString(),
        threadId: selectedThreadId,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setPendingCount((n) => Math.max(0, n - 1));
      // Refocus input after send
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, selectedThreadId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Shift+Enter inserts a newline naturally (browser default for textarea)
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ background: '#0a1a12' }}
      className="flex flex-col h-full min-h-0 rounded-lg border border-gray-800 overflow-hidden"
    >
      {/* Header — Navi status tile + thread picker */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-800 flex items-center gap-2.5">
        {/* Status dot */}
        <span
          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-[#0a1a12] ${
            naviStatus === 'working'
              ? 'bg-emerald-400 ring-emerald-600'
              : naviStatus === 'idle'
              ? 'bg-amber-400 ring-amber-600'
              : 'bg-gray-600 ring-gray-700'
          }`}
        />

        {/* Left: agent label */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white leading-none">
              {agentName ?? 'Navi'}
            </span>
            <span
              className={`text-[10px] font-medium leading-none ${
                naviStatus === 'working'
                  ? 'text-emerald-400'
                  : naviStatus === 'idle'
                  ? 'text-amber-400'
                  : 'text-gray-500'
              }`}
            >
              {naviStatus === 'working'
                ? 'Active'
                : naviStatus === 'idle'
                ? 'Idle'
                : 'Offline'}
            </span>
          </div>
          {naviLastSeen && (
            <div className="text-[10px] text-gray-600 mt-0.5">
              OpenClaw Gateway · via Telegram
            </div>
          )}
        </div>

        {/* Right: thread controls */}
        <div className="flex items-center gap-2">
          {editingThreadId && editingThreadId === selectedThreadId ? (
            <input
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const id = editingThreadId;
                  const title = editingTitle.trim();
                  if (!id || !title) return;
                  void renameThread(id, title)
                    .then(() => {
                      setEditingThreadId(null);
                      setEditingTitle('');
                    })
                    .catch((err) => {
                      console.error('[ChatPanel] rename thread failed:', err);
                    });
                }
                if (e.key === 'Escape') {
                  setEditingThreadId(null);
                  setEditingTitle('');
                }
              }}
              onBlur={() => {
                setEditingThreadId(null);
                setEditingTitle('');
              }}
              className="w-36 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white outline-none focus:border-gray-500"
              placeholder="Thread title"
              autoFocus
            />
          ) : (
            <select
              value={selectedThreadId ?? ''}
              onChange={(e) => setSelectedThreadId(Number(e.target.value) || null)}
              className="w-36 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white outline-none focus:border-gray-500"
              aria-label="Select chat thread"
            >
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}

          <button
            className="rounded-md px-2 py-1 text-xs font-semibold text-white border border-gray-700 hover:border-gray-600"
            style={{ background: '#142e1f' }}
            onClick={() => {
              void createThread('New thread')
                .then((t) => setSelectedThreadId(t.id))
                .catch((err) => console.error('[ChatPanel] create thread failed:', err));
            }}
            aria-label="Create new thread"
            title="New thread"
          >
            +
          </button>

          <button
            className="rounded-md px-2 py-1 text-xs font-semibold text-white border border-gray-700 hover:border-gray-600 disabled:opacity-50"
            style={{ background: '#142e1f' }}
            disabled={!selectedThreadId}
            onClick={() => {
              if (!selectedThreadId) return;
              const t = threads.find((x) => x.id === selectedThreadId);
              setEditingThreadId(selectedThreadId);
              setEditingTitle((t?.title ?? '').trim());
            }}
            aria-label="Rename thread"
            title="Rename"
          >
            Rename
          </button>

          <button
            className="rounded-md px-2 py-1 text-xs font-semibold text-red-300 border border-gray-700 hover:border-gray-600 disabled:opacity-50"
            style={{ background: '#142e1f' }}
            disabled={!selectedThreadId}
            onClick={() => {
              const id = selectedThreadId;
              if (!id) return;
              if (!window.confirm('Delete this thread and all its messages?')) return;
              void deleteThread(id)
                .then(async () => {
                  const remaining = threads.filter((t) => t.id !== id);
                  if (remaining[0]?.id) {
                    setSelectedThreadId(remaining[0].id);
                  } else {
                    const t = await createThread('Main');
                    setSelectedThreadId(t.id);
                  }
                })
                .catch((err) => console.error('[ChatPanel] delete thread failed:', err));
            }}
            aria-label="Delete thread"
            title="Delete"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={messagesRef}
        onScroll={() => {
          const el = messagesRef.current;
          if (!el) return;

          const prevTop = lastScrollTopRef.current;
          const nextTop = el.scrollTop;
          lastScrollTopRef.current = nextTop;

          // If the user scrolls up at all, immediately disable auto-stick.
          if (nextTop < prevTop) {
            stickToBottomRef.current = false;
          } else {
            const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            stickToBottomRef.current = distFromBottom < 20;
          }

          // Infinite scroll: when near the top, fetch older messages.
          if (el.scrollTop < 200) {
            void loadOlder();
          }
        }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700"
      >
        {historyLoading && (
          <div className="text-center text-gray-500 text-sm py-8">
            Loading conversation…
          </div>
        )}

        {historyError && (
          <div className="text-center text-red-400 text-sm py-4 px-2 bg-red-950/30 rounded-md">
            Failed to load history: {historyError}
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-12">
            Start a conversation with your AI assistant
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-xs text-white whitespace-pre-wrap break-words overflow-hidden ${
                  isUser ? 'rounded-br-sm' : 'rounded-bl-sm'
                }`}
                style={{
                  background: isUser ? '#ff3b6f' : '#142e1f',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div
              className="max-w-[75%] rounded-lg rounded-bl-sm px-3 py-2 text-xs text-gray-400"
              style={{ background: '#142e1f' }}
            >
              <span className="inline-flex gap-1 items-center">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-gray-800 px-3 py-3 flex gap-2">
        <textarea
          ref={inputRef}
          autoComplete="off"
          suppressHydrationWarning
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Navi is replying… (you can keep typing)' : 'Message Navi…'}
          className="flex-1 resize-none rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-gray-500 focus:ring-0 disabled:opacity-50 transition-colors leading-relaxed overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700"
        />
        <button
          onMouseDown={(e) => e.preventDefault()} // keep focus in textarea
          onClick={sendMessage}
          disabled={!input.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed"
          style={{ background: '#ff3b6f', opacity: 1 }}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  );
}
