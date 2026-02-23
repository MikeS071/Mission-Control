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
}

interface HistoryResponse {
  messages: ChatMessage[];
  error?: string;
}

interface ChatResponse {
  reply: string;
  messageId?: number;
  userMessageId?: number;
  error?: boolean;
}

let localIdCounter = -1;
function nextLocalId(): number {
  return localIdCounter--;
}

export function ChatPanel({ agentName }: { agentName?: string } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [naviStatus, setNaviStatus] = useState<AgentStatus>('inactive');
  const [naviLastSeen, setNaviLastSeen] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  // ── Load history on mount ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetch('/api/chat/history?limit=50');
        if (!res.ok) {
          const text = await res.text().catch(() => 'Unknown error');
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        const data: HistoryResponse = await res.json();
        if (!cancelled) {
          setMessages(data.messages ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setHistoryError(msg);
          console.error('[ChatPanel] Failed to load history:', err);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, []);

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
        reconnectDelayRef.current = 1_000; // reset backoff on success
      };

      ws.onmessage = (event) => {
        try {
          const msg: ChatMessage = JSON.parse(event.data as string);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        } catch (err) {
          console.error('[ChatPanel] WS parse error:', err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
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
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    void connectWs();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    // Instant on first load (avoids page-level scroll side-effects), smooth after
    if (!initialScrollDone.current) {
      el.scrollTop = el.scrollHeight;
      initialScrollDone.current = true;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

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
    if (!text || loading) return;

    setInput('');

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: nextLocalId(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat/gateway', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Request failed');
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data: ChatResponse = await res.json();

      // Replace optimistic user message with confirmed DB ID so SSE deduplication works.
      // Without this, the SSE-delivered copy (real ID) won't match the temp ID and renders twice.
      if (data.userMessageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempUserMsg.id ? { ...m, id: data.userMessageId! } : m
          )
        );
      }

      const assistantMsg: ChatMessage = {
        id: data.messageId ?? nextLocalId(),
        role: 'assistant',
        content: data.reply,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('[ChatPanel] Send failed:', err);
      const errMsg: ChatMessage = {
        id: nextLocalId(),
        role: 'assistant',
        content: 'Failed to get a response. Please try again.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      // Refocus input after send
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ background: '#0a1a12' }}
      className="flex flex-col h-full min-h-0 rounded-lg border border-gray-800 overflow-hidden"
    >
      {/* Header — Navi status tile */}
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
      </div>

      {/* Message list */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
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
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm text-white ${
                  isUser ? 'rounded-br-sm' : 'rounded-bl-sm'
                }`}
                style={{
                  background: isUser ? '#ff3b6f' : '#142e1f',
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
              className="max-w-[75%] rounded-lg rounded-bl-sm px-3 py-2 text-sm text-gray-400"
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
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          suppressHydrationWarning
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Message Navi…"
          className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500 focus:ring-0 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40 transition-colors"
          style={{ background: '#ff3b6f' }}
          aria-label="Send message"
        >
          Send
        </button>
      </div>
    </div>
  );
}
