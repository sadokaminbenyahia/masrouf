'use client';
import { useTheme } from 'next-themes';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const theme: ToasterProps['theme'] =
    resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : 'system';
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      containerAriaLabel="Notifications"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-lg)',
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'font-sans shadow-overlay',
          actionButton: 'font-medium',
          closeButton: 'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
