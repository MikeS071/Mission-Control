'use client';

/**
 * ChatPanel — Native OpenClaw chat UI (Gateway WS via MC server proxy)
 *
 * - History: GET  /api/openclaw/chat/history
 * - Send:    POST /api/openclaw/chat/send
 *
 * Notes:
 * - Single conversation view (no MC threads)
 * - Stable OpenClaw session key per conversation (tenant + x-mc-conv-id, enforced server-side)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ── Agent status types (mirrored from KanbanBoard) ─────────────────────────
type AgentStatus = 'working' | 'idle' | 'inactive';
interface ActiveAgent {
  agentName: string;
  status: AgentStatus;
  lastSeenAt: string;
}

type UiMessage = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number; // unix millis
};

type HistoryResponse = {
  messages: UiMessage[];
  error?: string;
  details?: string;
};

type SendResponse = {
  ok: boolean;
  runId?: string;
  status?: string;
  idempotencyKey?: string;
  error?: string;
  details?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isNearDuplicate(a: UiMessage, b: UiMessage): boolean {
  if (a.role !== b.role) return false;
  if (a.text !== b.text) return false;

  // Gateway timestamps vs optimistic UI timestamps can differ.
  // Be more tolerant for user messages to avoid duplicates/flicker.
  const delta = Math.abs(a.timestamp - b.timestamp);
  if (a.role === 'user') return delta < 5 * 60_000;
  return delta < 2_000;
}

const CONV_STORAGE_KEY = 'mc-chat-conv-id:v1';

function isValidConvId(s: string): boolean {
  return /^[a-zA-Z0-9_-]{6,64}$/.test(s);
}

function makeConvId(): string {
  // url-safe, compact
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const NEW_CONVERSATION_PROMPT = `[[mc:init]]
Start a new conversation.

In your first response, include this exact line verbatim:
load memory so we can continue from previous session and print status with recommended next steps

Then do it: load memory (silently; do not dump raw memory entries) and print a status summary with recommended next steps.`;

export function ChatPanel({ agentName }: { agentName?: string } = {}) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');

  const [pendingCount, setPendingCount] = useState(0);
  const loading = pendingCount > 0;

  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [naviStatus, setNaviStatus] = useState<AgentStatus>('inactive');
  const [naviLastSeen, setNaviLastSeen] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const stickToBottomRef = useRef(true);
  const refreshingRef = useRef(false);
  const unmountedRef = useRef(false);

  const convIdRef = useRef<string | null>(null);
  const [, setConvId] = useState<string | null>(null); // UI doesn't render it, but keep state for debugging

  const buildHeaders = useCallback(
    (includeContentType?: boolean): Record<string, string> => {
      const h: Record<string, string> = {};
      if (includeContentType) h['Content-Type'] = 'application/json';

      const convId = convIdRef.current;
      if (convId) h['x-mc-conv-id'] = convId;

      return h;
    },
    [],
  );

  const refreshHistory = useCallback(async (): Promise<UiMessage[] | null> => {
    if (refreshingRef.current) return null;
    refreshingRef.current = true;

    try {
      const res = await fetch('/api/openclaw/chat/history?limit=120', {
        cache: 'no-store',
        headers: buildHeaders(),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        const trimmed = t.trim();
        const brief =
          trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
            ? 'Bad gateway / proxy error (HTML response)'
            : trimmed;
        throw new Error(`HTTP ${res.status}: ${brief.slice(0, 240)}`);
      }
      const data: HistoryResponse = await res.json();
      const incoming = Array.isArray(data.messages) ? data.messages : [];

      // De-dupe defensively (history can contain partials/tool blocks filtered to text only).
      const out: UiMessage[] = [];
      for (const m of incoming) {
        if (!m?.text?.trim()) continue;
        if (out.some((x) => isNearDuplicate(x, m))) continue;
        out.push(m);
      }

      setMessages((prev) => {
        // Merge new history with any optimistic messages that haven't landed in history yet.
        if (out.length === 0) return prev;

        const merged: UiMessage[] = [...out];
        const lastTs = out[out.length - 1]?.timestamp ?? 0;

        for (const m of prev) {
          const isNewerThanHistory = m.timestamp > lastTs - 2_000;
          if (!isNewerThanHistory) continue;
          if (merged.some((x) => isNearDuplicate(x, m))) continue;
          merged.push(m);
        }

        // Ensure stable order
        merged.sort((a, b) => a.timestamp - b.timestamp);

        // Final de-dupe pass (cheap, small list)
        const deduped: UiMessage[] = [];
        for (const m of merged) {
          if (deduped.some((x) => isNearDuplicate(x, m))) continue;
          deduped.push(m);
        }

        return deduped.slice(-250);
      });

      setHistoryError(null);
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setHistoryError(msg);
      return null;
    } finally {
      setHistoryLoading(false);
      refreshingRef.current = false;
    }
  }, [buildHeaders]);

  // Background refresh (best-effort): keeps UI current if other clients inject.
  useEffect(() => {
    const id = setInterval(() => {
      if (loading) return; // when waiting for reply, send loop does tighter polling
      void refreshHistory();
    }, 10_000);
    return () => clearInterval(id);
  }, [loading, refreshHistory]);

  // Auto-scroll on new messages (only when pinned)
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      const node = messagesRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    });
  }, [messages]);

  // ── Poll Navi agent status ────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/agents/active', { cache: 'no-store' });
        if (!res.ok) return;
        const agents = (await res.json()) as ActiveAgent[];
        const navi = agents.find((a) =>
          ['navi', (agentName ?? 'navi').toLowerCase()].includes(a.agentName.toLowerCase()),
        );
        if (navi) {
          setNaviStatus(navi.status);
          setNaviLastSeen(navi.lastSeenAt);
        } else {
          // No agent record yet — treat as working if gateway is reachable
          setNaviStatus('working');
          setNaviLastSeen(null);
        }
      } catch {
        // ignore
      }
    };

    void poll();
    const id = setInterval(() => void poll(), 10_000);
    return () => clearInterval(id);
  }, [agentName]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message) return;

      setInput('');
      stickToBottomRef.current = true;

      const optimisticTs = Date.now();
      setMessages((prev) => [...prev, { role: 'user', text: message, timestamp: optimisticTs }]);

      setPendingCount((n) => n + 1);
      try {
        const res = await fetch('/api/openclaw/chat/send', {
          method: 'POST',
          headers: buildHeaders(true),
          body: JSON.stringify({ message }),
        });

        if (!res.ok) {
          const t = await res.text().catch(() => 'Request failed');
          const trimmed = t.trim();
          const brief =
            trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
              ? 'Bad gateway / proxy error (HTML response)'
              : trimmed;
          throw new Error(`HTTP ${res.status}: ${brief.slice(0, 240)}`);
        }

        const data: SendResponse = await res.json();
        if (!data.ok) throw new Error(data.details ?? data.error ?? 'Send failed');

        // Poll history until we see an assistant message after our send.
        // (MVP: no streaming events.)
        const deadline = Date.now() + 90_000;
        while (!unmountedRef.current && Date.now() < deadline) {
          const latest = await refreshHistory();
          if (latest && latest.some((m) => m.role === 'assistant' && m.timestamp >= optimisticTs)) {
            break;
          }
          await sleep(1_250);
        }

        // One last refresh to swap optimistic user timestamp for gateway timestamp if needed.
        await refreshHistory();
      } catch (err) {
        console.error('[ChatPanel] Send failed:', err);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: 'Failed to get a response. Please try again.',
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setPendingCount((n) => Math.max(0, n - 1));
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [refreshHistory, buildHeaders],
  );

  const startNewConversation = useCallback(async () => {
    const newId = makeConvId();

    try {
      window.localStorage.setItem(CONV_STORAGE_KEY, newId);
    } catch {
      // ignore
    }

    convIdRef.current = newId;
    setConvId(newId);

    // Reset UI
    stickToBottomRef.current = true;
    setMessages([]);
    setInput('');
    setHistoryError(null);
    setHistoryLoading(true);

    setPendingCount((n) => n + 1);
    const startedAt = Date.now();

    try {
      const res = await fetch('/api/openclaw/chat/send', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({ message: NEW_CONVERSATION_PROMPT }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        const trimmed = t.trim();
        const brief =
          trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
            ? 'Bad gateway / proxy error (HTML response)'
            : trimmed;
        throw new Error(`HTTP ${res.status}: ${brief.slice(0, 240)}`);
      }

      // Poll history until assistant responds.
      const deadline = Date.now() + 90_000;
      while (!unmountedRef.current && Date.now() < deadline) {
        const latest = await refreshHistory();
        if (latest && latest.some((m) => m.role === 'assistant' && m.timestamp >= startedAt)) {
          break;
        }
        await sleep(1_250);
      }

      await refreshHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setHistoryError(msg);
      setHistoryLoading(false);
    } finally {
      setPendingCount((n) => Math.max(0, n - 1));
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [buildHeaders, refreshHistory]);

  // Initial conversation load
  // - If a conv id exists in localStorage: resume that conversation
  // - Else (first login / first visit): auto-run the New init prompt
  useEffect(() => {
    unmountedRef.current = false;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(CONV_STORAGE_KEY);
    } catch {
      // ignore
    }

    if (stored && isValidConvId(stored)) {
      convIdRef.current = stored;
      setConvId(stored);
      void refreshHistory();
    } else {
      void startNewConversation();
    }

    return () => {
      unmountedRef.current = true;
    };
  }, [refreshHistory, startNewConversation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ background: '#0a1a12' }}
      className="flex flex-col h-full min-h-0 rounded-lg border border-gray-800 overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-800 flex items-center gap-2.5">
        <span
          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-[#0a1a12] ${
            naviStatus === 'working'
              ? 'bg-emerald-400 ring-emerald-600'
              : naviStatus === 'idle'
                ? 'bg-amber-400 ring-amber-600'
                : 'bg-gray-600 ring-gray-700'
          }`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white leading-none">{agentName ?? 'Navi'}</span>
            <span
              className={`text-[10px] font-medium leading-none ${
                naviStatus === 'working'
                  ? 'text-emerald-400'
                  : naviStatus === 'idle'
                    ? 'text-amber-400'
                    : 'text-gray-500'
              }`}
            >
              {naviStatus === 'working' ? 'Active' : naviStatus === 'idle' ? 'Idle' : 'Offline'}
            </span>
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">
            OpenClaw Gateway{naviLastSeen ? ` · last seen ${new Date(naviLastSeen).toLocaleTimeString()}` : ''}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-md px-2 py-1 text-xs font-semibold text-white border border-gray-700 hover:border-gray-600"
            style={{ background: '#142e1f' }}
            onClick={() => void startNewConversation()}
            aria-label="Start new conversation"
            title="New conversation"
          >
            New
          </button>
          <button
            className="rounded-md px-2 py-1 text-xs font-semibold text-white border border-gray-700 hover:border-gray-600"
            style={{ background: '#142e1f' }}
            onClick={() => void refreshHistory()}
            aria-label="Refresh"
            title="Refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={messagesRef}
        onScroll={() => {
          const el = messagesRef.current;
          if (!el) return;
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          stickToBottomRef.current = distFromBottom < 20;
        }}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-800 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700"
      >
        {historyLoading && (
          <div className="text-center text-gray-500 text-sm py-8">Loading conversation…</div>
        )}

        {historyError && (
          <div className="text-center text-red-400 text-sm py-4 px-2 bg-red-950/30 rounded-md">
            Failed to load history: {historyError}
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-12">Start a conversation with your AI assistant</div>
        )}

        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const key = `${msg.role}:${msg.timestamp}:${idx}`;
          return (
            <div key={key} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
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
                {msg.text}
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
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
                  ·
                </span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
                  ·
                </span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
                  ·
                </span>
              </span>
            </div>
          </div>
        )}
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
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void send(input)}
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
