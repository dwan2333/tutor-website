'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDocument, getCards, getDocumentStatus, isLoggedIn, Document, ContextCard } from '@/lib/api';
import StudyCard from '@/components/StudyCard';

const POLL_INTERVAL = 3000;

export default function StudyPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const router = useRouter();
  const docId = parseInt(documentId);

  const [doc, setDoc] = useState<Document | null>(null);
  const [cards, setCards] = useState<ContextCard[]>([]);
  const [status, setStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/login'); return; }
    init();
    return () => stopPolling();
  }, []);

  const init = async () => {
    try {
      const res = await getDocument(docId);
      setDoc(res.data);
      setStatus(res.data.status);

      if (res.data.status === 'done') {
        await loadCards();
      } else if (res.data.status === 'processing') {
        startPolling();
      } else if (res.data.status === 'failed') {
        setErrorMsg(res.data.error_message);
      }
    } catch {
      setErrorMsg('Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const loadCards = async () => {
    const res = await getCards(docId);
    setCards(res.data);
  };

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await getDocumentStatus(docId);
        setStatus(res.data.status);

        if (res.data.status === 'done') {
          stopPolling();
          await loadCards();
        } else if (res.data.status === 'failed') {
          stopPolling();
          setErrorMsg(res.data.error_message);
        }
      } catch {
        stopPolling();
      }
    }, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white line-clamp-1">
            {doc?.original_name ?? 'Study Session'}
          </h1>
          {doc && (
            <p className="text-gray-500 text-sm mt-1">
              Pages {doc.selected_start}–{doc.selected_end} · {doc.page_count} total
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Processing state */}
      {status === 'processing' && (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-white font-medium">Generating your study cards with AI...</p>
            <p className="text-gray-400 text-sm mt-1">This takes 1–3 minutes depending on page count</p>
          </div>
        </div>
      )}

      {/* Failed state */}
      {status === 'failed' && (
        <div className="max-w-md mx-auto text-center py-16">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-red-300 font-medium mb-2">Generation failed</p>
          {errorMsg && (
            <p className="text-gray-400 text-sm mb-6 bg-gray-900 border border-gray-800 rounded-lg p-3">
              {errorMsg}
            </p>
          )}
          <Link
            href={`/upload?retry=${docId}`}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Retry
          </Link>
        </div>
      )}

      {/* Cards */}
      {status === 'done' && cards.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          No cards were generated. The selected pages may not contain extractable text.
        </div>
      )}

      {status === 'done' && cards.length > 0 && (
        <div className="space-y-6">
          <p className="text-gray-400 text-sm">{cards.length} study cards generated</p>
          {cards.map((card) => (
            <StudyCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done:       'bg-green-900/50 text-green-300 border-green-700',
    processing: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    uploaded:   'bg-gray-700/50 text-gray-300 border-gray-600',
    failed:     'bg-red-900/50 text-red-300 border-red-700',
  };
  return (
    <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${styles[status] ?? styles.uploaded}`}>
      {status}
    </span>
  );
}
