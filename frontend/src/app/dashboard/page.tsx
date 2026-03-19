'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDocuments, deleteDocument, isLoggedIn, Document } from '@/lib/api';
import axios from 'axios';

const STATUS_STYLES: Record<string, string> = {
  done:       'bg-green-900/50 text-green-300 border-green-700',
  processing: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  uploaded:   'bg-gray-700/50 text-gray-300 border-gray-600',
  failed:     'bg-red-900/50 text-red-300 border-red-700',
};

export default function DashboardPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await getDocuments();
      setDocuments(res.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        router.push('/login');
      } else {
        setError('Failed to load documents');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this document and all its cards?')) return;
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      alert('Failed to delete document');
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Documents</h1>
          <p className="text-gray-400 text-sm mt-1">Upload a PDF to generate AI study cards</p>
        </div>
        <Link
          href="/upload"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          + Upload PDF
        </Link>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-gray-700 rounded-xl">
          <p className="text-gray-500 text-lg mb-4">No documents yet</p>
          <Link
            href="/upload"
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Upload your first PDF
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-white font-medium text-sm leading-snug line-clamp-2">
                  {doc.original_name}
                </p>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[doc.status] ?? STATUS_STYLES.uploaded}`}
                >
                  {doc.status}
                </span>
              </div>

              <p className="text-gray-500 text-xs">{doc.page_count} pages</p>

              {doc.status === 'failed' && doc.error_message && (
                <p className="text-red-400 text-xs bg-red-900/20 rounded p-2 border border-red-800">
                  {doc.error_message}
                </p>
              )}

              <p className="text-gray-600 text-xs">
                {new Date(doc.created_at).toLocaleDateString()}
              </p>

              <div className="flex gap-2 mt-auto pt-2 border-t border-gray-800">
                {doc.status === 'done' && (
                  <Link
                    href={`/study/${doc.id}`}
                    className="flex-1 text-center py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                  >
                    Study
                  </Link>
                )}
                {(doc.status === 'uploaded' || doc.status === 'failed') && (
                  <Link
                    href={`/upload?retry=${doc.id}`}
                    className="flex-1 text-center py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium transition-colors"
                  >
                    {doc.status === 'failed' ? 'Retry' : 'Configure'}
                  </Link>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-300 text-xs transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
