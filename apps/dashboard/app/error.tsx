'use client';

import { useEffect } from 'react';

import { reportError } from '@/lib/errors';

/** A view crashed: tell the team and offer a retry instead of a blank page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { kind: 'render' });
  }, [error]);
  return (
    <main className="crash">
      <p>Something went wrong on this page. The team has been told.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
