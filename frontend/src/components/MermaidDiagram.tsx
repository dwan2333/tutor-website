'use client';

import { useEffect, useRef, useState } from 'react';

let idCounter = 0;

export default function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !ref.current) return;
    setError(null);
    const id = `mermaid-${++idCounter}`;

    import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
      });
      m.default
        .render(id, code)
        .then(({ svg }) => {
          if (ref.current) ref.current.innerHTML = svg;
        })
        .catch(() => {
          setError('Diagram rendering failed — try regenerating.');
        });
    });
  }, [code]);

  if (error) return null; // let MermaidErrorBoundary handle the UI

  return (
    <div
      ref={ref}
      className="overflow-auto bg-gray-950 rounded-lg p-3 min-h-[80px] [&_svg]:max-w-full"
    />
  );
}
