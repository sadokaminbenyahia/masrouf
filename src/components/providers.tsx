'use client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DiscreetModeProvider } from '@/lib/hooks/use-discreet-mode';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { ActionError } from '@/lib/query';

const NON_RETRYABLE = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'CONFLICT']);

function makeQueryClient(navigate: (href: string) => void): QueryClient {
  // Session expirée : retour à la connexion (les données ne sont plus accessibles).
  const redirectIfUnauthorized = (error: unknown) => {
    if (error instanceof ActionError && error.code === 'UNAUTHORIZED') {
      const here = window.location.pathname;
      if (here !== '/connexion') navigate(`/connexion?callbackUrl=${encodeURIComponent(here)}`);
    }
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: redirectIfUnauthorized }),
    mutationCache: new MutationCache({ onError: redirectIfUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ActionError && NON_RETRYABLE.has(error.code)) && failureCount < 1,
      },
      mutations: { retry: 0 },
    },
  });
}

function useServiceWorker(): void {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e: unknown) => {
        console.warn('[sw] enregistrement impossible', e);
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
}

export function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  const router = useRouter();
  const [queryClient] = useState(() => makeQueryClient((href) => router.replace(href)));
  const isDesktop = useMediaQuery('(min-width: 768px)');
  useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        nonce={nonce}
      >
        <TooltipProvider>
          <DiscreetModeProvider>
            {children}
            <Toaster
              richColors
              closeButton
              position={isDesktop ? 'bottom-right' : 'bottom-center'}
              offset={isDesktop ? { bottom: 96, right: 24 } : { bottom: 88, left: 16, right: 16 }}
              mobileOffset={{ bottom: 88, left: 16, right: 16 }}
            />
          </DiscreetModeProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
