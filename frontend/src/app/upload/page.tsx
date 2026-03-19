'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  uploadDocument,
  updatePages,
  generateCards,
  getDocument,
  getThumbnailUrl,
  isLoggedIn,
  Document,
} from '@/lib/api';
import axios from 'axios';

type Step = 'select' | 'pages' | 'generating';

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retryId = searchParams.get('retry');

  const [step, setStep] = useState<Step>('select');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.push('/login'); return; }
    if (retryId) loadExistingDoc(parseInt(retryId));
  }, []);

  const loadExistingDoc = async (id: number) => {
    try {
      const res = await getDocument(id);
      const existing = res.data;
      setDoc(existing);
      setStartPage(existing.selected_start ?? 1);
      setEndPage(existing.selected_end ?? existing.page_count);
      setStep('pages');
    } catch {
      setError('Could not load document');
    }
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') {
      setFile(dropped);
      setError('');
    } else {
      setError('Only PDF files are accepted');
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) { setFile(selected); setError(''); }
  };

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const res = await uploadDocument(file);
      const uploaded = res.data;
      setDoc(uploaded);
      setStartPage(1);
      setEndPage(uploaded.page_count);
      setStep('pages');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || 'Upload failed');
      } else {
        setError('Upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  // ── Generate ───────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!doc) return;
    setError('');
    try {
      await updatePages(doc.id, startPage, endPage);
      await generateCards(doc.id);
      router.push(`/study/${doc.id}`);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || 'Failed to start generation');
      } else {
        setError('Failed to start generation');
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Upload PDF</h1>
      <p className="text-gray-400 text-sm mb-8">
        Upload a PDF book or document and select the pages you want to study.
      </p>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Step 1 — File select */}
      {step === 'select' && (
        <div className="space-y-4">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-12 text-center transition-colors
              ${dragging
                ? 'border-indigo-500 bg-indigo-900/20'
                : 'border-gray-700 hover:border-gray-500 bg-gray-900/50'
              }`}
          >
            <div className="text-4xl mb-3">📄</div>
            {file ? (
              <>
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-gray-400 text-sm mt-1">
                  {(file.size / 1024 / 1024).toFixed(2)} MB — click to change
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-300 font-medium">Drag & drop your PDF here</p>
                <p className="text-gray-500 text-sm mt-1">or click to browse</p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={onFileChange}
            className="hidden"
          />

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Uploading...
              </span>
            ) : (
              'Upload PDF'
            )}
          </button>
        </div>
      )}

      {/* Step 2 — Page selection */}
      {step === 'pages' && doc && (
        <div className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-white font-medium">{doc.original_name}</p>
            <p className="text-gray-400 text-sm mt-1">{doc.page_count} pages total</p>
          </div>

          {/* Thumbnail preview strip */}
          <ThumbnailStrip
            docId={doc.id}
            pageCount={doc.page_count}
            startPage={startPage}
            endPage={endPage}
          />

          {/* Range inputs */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-medium">Select page range</h2>
              <button
                onClick={() => { setStartPage(1); setEndPage(doc.page_count); }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Select all
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Start page</label>
                <input
                  type="number"
                  min={1}
                  max={endPage}
                  value={startPage}
                  onChange={(e) => setStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <span className="text-gray-500 mt-5">→</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">End page</label>
                <input
                  type="number"
                  min={startPage}
                  max={doc.page_count}
                  value={endPage}
                  onChange={(e) => setEndPage(Math.min(doc.page_count, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <p className="text-gray-500 text-xs">
              {endPage - startPage + 1} pages selected →{' '}
              ~{Math.ceil((endPage - startPage + 1) / 3)} study cards will be generated
            </p>
          </div>

          <button
            onClick={handleGenerate}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            Generate Study Cards with AI
          </button>
        </div>
      )}
    </div>
  );
}

// ── Thumbnail strip ────────────────────────────────────────────────────────

function ThumbnailStrip({
  docId, pageCount, startPage, endPage,
}: {
  docId: number; pageCount: number; startPage: number; endPage: number;
}) {
  const MAX_THUMBS = 8;
  const pages: number[] = [];

  if (pageCount <= MAX_THUMBS) {
    for (let i = 1; i <= pageCount; i++) pages.push(i);
  } else {
    const step = Math.floor(pageCount / MAX_THUMBS);
    for (let i = 1; i <= pageCount; i += step) {
      if (pages.length < MAX_THUMBS) pages.push(i);
    }
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {pages.map((p) => {
        const selected = p >= startPage && p <= endPage;
        return (
          <div key={p} className="shrink-0 text-center">
            <div
              className={`w-16 h-20 rounded overflow-hidden border-2 transition-colors
                ${selected ? 'border-indigo-500' : 'border-gray-700 opacity-40'}`}
            >
              <img
                src={getThumbnailUrl(docId, p)}
                alt={`Page ${p}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{p}</p>
          </div>
        );
      })}
    </div>
  );
}
