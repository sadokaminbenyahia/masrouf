'use client';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SHORTCUTS_HELP_EVENT, onUiEvent } from '@/lib/events';
import { useHotkey } from '@/lib/hooks/use-hotkey';
import { Kbd } from './kbd';
import { NAV_ITEMS } from './nav-items';
import { useIsApplePlatform } from './use-platform';

/** Aide des raccourcis : `?` (Maj + ? selon la disposition) ou SHORTCUTS_HELP_EVENT. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const isApple = useIsApplePlatform();
  useHotkey('shift+?', () => setOpen((o) => !o));
  useEffect(() => onUiEvent(SHORTCUTS_HELP_EVENT, () => setOpen(true)), []);

  const general: { keys: string[]; label: string }[] = [
    { keys: ['N'], label: 'Ajouter une transaction' },
    { keys: [isApple ? '⌘' : 'Ctrl', 'K'], label: 'Ouvrir la palette de commandes' },
    { keys: ['?'], label: 'Afficher cette aide' },
    { keys: ['Échap'], label: 'Fermer une fenêtre' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>
            Les raccourcis sont inactifs pendant la saisie dans un champ.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          <section aria-labelledby="raccourcis-general">
            <h3 id="raccourcis-general" className="mb-2 text-sm font-semibold">
              Général
            </h3>
            <dl className="flex flex-col gap-2">
              {general.map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="raccourcis-navigation">
            <h3 id="raccourcis-navigation" className="mb-2 text-sm font-semibold">
              Aller à… <span className="font-normal text-muted-foreground">(G puis)</span>
            </h3>
            <dl className="flex flex-col gap-2">
              {NAV_ITEMS.map((item) => (
                <div key={item.href} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    <Kbd>G</Kbd>
                    <Kbd>{item.shortcut.toUpperCase()}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
