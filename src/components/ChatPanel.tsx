'use client';

/**
 * ChatPanel — Real-time chat UI for ArchonHQ Mission Control
 *
 * - Fetches message history on mount via GET /api/chat/history
 * - Sends messages via POST /api/chat
 * - Dark-themed, matching the dashboard palette
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
  error?: boolean;
}

let localIdCounter = -1;
function nextLocalId(): number {
  return localIdCounter--;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // ── Connect to SSE stream for real-time updates ────────────────────────────
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource('/api/chat/stream');

      eventSource.onmessage = (event) => {
        try {
          const msg: ChatMessage = JSON.parse(event.data);
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        } catch (err) {
          console.error('[ChatPanel] Failed to parse SSE message:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('[ChatPanel] SSE error:', err);
        eventSource?.close();
      };
    } catch (err) {
      console.error('[ChatPanel] Failed to connect to SSE stream:', err);
    }

    return () => {
      eventSource?.close();
    };
  }, []);

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Request failed');
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data: ChatResponse = await res.json();

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
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <span className="text-sm font-semibold text-white">AI Assistant</span>
        <span className="ml-auto text-xs text-gray-500">gpt-4o-mini · AiPipe</span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Message your AI assistant…"
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
