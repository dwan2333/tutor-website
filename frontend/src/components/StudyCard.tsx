'use client';

import { useEffect, useRef, useState } from 'react';
import { ContextCard, ChatMessage, getChatMessages, generateDiagram, getToken } from '@/lib/api';
import MermaidDiagram from './MermaidDiagram';
import MermaidErrorBoundary from './MermaidErrorBoundary';

type DiagramType = 'concept_map' | 'flowchart' | 'sequence';

const DIAGRAM_LABELS: Record<DiagramType, string> = {
  concept_map: 'Concept Map',
  flowchart: 'Flowchart',
  sequence: 'Sequence',
};

export default function StudyCard({ card }: { card: ContextCard }) {
  const [diagramType, setDiagramType] = useState<DiagramType | null>(null);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [diagramError, setDiagramError] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    loadMessages();
    return () => wsRef.current?.close();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer]);

  const loadMessages = async () => {
    try {
      const res = await getChatMessages(card.id);
      setMessages(res.data);
    } catch {
      // non-critical
    }
  };

  // ── Diagram ──────────────────────────────────────────────────────────────

  const handleDiagram = async (type: DiagramType) => {
    if (diagramType === type && mermaidCode) return; // already loaded
    setDiagramType(type);
    setMermaidCode(null);
    setDiagramError('');
    setDiagramLoading(true);
    try {
      const res = await generateDiagram(card.id, type);
      setMermaidCode(res.data.mermaid_code);
    } catch {
      setDiagramError('Failed to generate diagram. Try again.');
    } finally {
      setDiagramLoading(false);
    }
  };

  const handleRegenerate = () => {
    if (diagramType) {
      setMermaidCode(null);
      handleDiagram(diagramType);
    }
  };

  // ── Chat (WebSocket) ──────────────────────────────────────────────────────

  const sendMessage = () => {
    const text = input.trim();
    if (!text || chatLoading) return;

    const token = getToken();
    if (!token) return;

    setInput('');
    setChatLoading(true);
    setStreamBuffer('');

    // Optimistically add user message
    const userMsg: ChatMessage = {
      id: Date.now(),
      card_id: card.id,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const ws = new WebSocket(
      `ws://localhost:8000/ws/cards/${card.id}/chat?token=${encodeURIComponent(token)}`
    );
    wsRef.current = ws;

    let accumulated = '';

    ws.onopen = () => ws.send(JSON.stringify({ message: text }));

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.done) {
          // Stream complete — commit to messages list
          const assistantMsg: ChatMessage = {
            id: Date.now() + 1,
            card_id: card.id,
            role: 'assistant',
            content: accumulated,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setStreamBuffer('');
          setChatLoading(false);
          ws.close();
        } else if (parsed.error) {
          setStreamBuffer('');
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              card_id: card.id,
              role: 'assistant',
              content: `Error: ${parsed.error}`,
              created_at: new Date().toISOString(),
            },
          ]);
          setChatLoading(false);
          ws.close();
        }
      } catch {
        // Plain text token
        accumulated += event.data;
        setStreamBuffer(accumulated);
      }
    };

    ws.onerror = () => {
      setChatLoading(false);
      setStreamBuffer('');
      ws.close();
    };
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-white font-semibold">{card.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">
              Pages {card.page_range_start}–{card.page_range_end}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-300 border border-indigo-800">
              {card.model_used}
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-5 py-4 border-b border-gray-800">
        <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{card.summary}</p>
      </div>

      {/* Diagram section */}
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500 font-medium">Diagram</span>
          <div className="flex gap-1">
            {(Object.keys(DIAGRAM_LABELS) as DiagramType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleDiagram(type)}
                disabled={diagramLoading}
                className={`text-xs px-3 py-1 rounded-full border transition-colors
                  ${diagramType === type
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                  } disabled:opacity-50`}
              >
                {DIAGRAM_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {diagramLoading && (
          <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Generating diagram...
          </div>
        )}

        {diagramError && (
          <p className="text-red-400 text-sm">{diagramError}</p>
        )}

        {mermaidCode && !diagramLoading && (
          <MermaidErrorBoundary onRegenerate={handleRegenerate}>
            <MermaidDiagram code={mermaidCode} />
          </MermaidErrorBoundary>
        )}
      </div>

      {/* Chat section */}
      <div className="px-5 py-4">
        <button
          onClick={() => setChatOpen((o) => !o)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-3"
        >
          <span>{chatOpen ? '▾' : '▸'}</span>
          <span className="font-medium">Ask a question</span>
          {messages.length > 0 && (
            <span className="text-xs text-gray-600">({messages.length} messages)</span>
          )}
        </button>

        {chatOpen && (
          <div className="space-y-3">
            {/* Message history */}
            {messages.length > 0 && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap
                        ${msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                        }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Streaming buffer */}
                {streamBuffer && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] px-3 py-2 rounded-xl rounded-bl-sm text-sm bg-gray-800 text-gray-200 whitespace-pre-wrap">
                      {streamBuffer}
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-indigo-400 animate-pulse rounded-sm align-middle" />
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={chatLoading}
                placeholder="Ask about this concept..."
                className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 transition-colors"
              />
              <button
                onClick={sendMessage}
                disabled={chatLoading || !input.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm transition-colors"
              >
                {chatLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  'Send'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
