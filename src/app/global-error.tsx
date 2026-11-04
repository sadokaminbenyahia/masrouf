'use client';
import { useEffect } from 'react';

/** Dernier recours : remplace le layout racine (styles inline, aucune dépendance). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global] erreur fatale', error);
  }, [error]);
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
          background: '#FAFAF7',
          color: '#1A1D21',
          padding: 16,
        }}
      >
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Masrouf a rencontré un problème</h1>
          <p style={{ color: '#5B6470', margin: '0 0 24px', lineHeight: 1.5 }}>
            Vos données sont intactes. Rechargez l&apos;application pour continuer.
          </p>
          {error.digest && (
            <p style={{ color: '#5B6470', fontSize: 12, margin: '0 0 16px' }}>
              Référence : <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#1F5FAD',
              color: '#FFFFFF',
              border: 0,
              borderRadius: 10,
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
