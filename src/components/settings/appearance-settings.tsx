'use client';
import { useSyncExternalStore } from 'react';
import { LaptopIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';
import { SettingsSection } from './settings-section';

const THEMES = [
  { value: 'light', label: 'Clair', icon: SunIcon },
  { value: 'dark', label: 'Sombre', icon: MoonIcon },
  { value: 'system', label: 'Système', icon: LaptopIcon },
] as const;

const noop = () => () => {};

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { discreet, setDiscreet } = useDiscreetMode();
  // Le thème n'est connu qu'après l'hydratation (stockage local de next-themes).
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const current = mounted ? (theme ?? 'system') : undefined;

  return (
    <SettingsSection
      id="apparence"
      title="Apparence"
      description="Choisissez le thème et masquez les montants lorsque vous êtes en public."
    >
      <div className="grid gap-6">
        <fieldset>
          <legend className="mb-3 text-sm font-medium">Thème</legend>
          <RadioGroup
            value={current}
            onValueChange={setTheme}
            className="grid grid-cols-3 gap-2 sm:max-w-md"
          >
            {THEMES.map(({ value, label, icon: Icon }) => {
              const id = `theme-${value}`;
              const active = current === value;
              return (
                <Label
                  key={value}
                  htmlFor={id}
                  className={cn(
                    'has-[:focus-visible]:ring-ring/50 flex cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-[3px]',
                    active ? 'border-primary bg-brand-tint text-primary' : 'hover:bg-accent',
                  )}
                >
                  <RadioGroupItem id={id} value={value} className="sr-only" />
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </Label>
              );
            })}
          </RadioGroup>
        </fieldset>

        <div className="flex items-start justify-between gap-4 sm:max-w-md">
          <div>
            <Label htmlFor="mode-discret">Mode discret</Label>
            <p id="mode-discret-aide" className="text-muted-foreground mt-1 text-sm">
              Remplace les montants par « ••• ». Également accessible depuis la barre du haut.
            </p>
          </div>
          <Switch
            id="mode-discret"
            checked={discreet}
            onCheckedChange={setDiscreet}
            aria-describedby="mode-discret-aide"
          />
        </div>
      </div>
    </SettingsSection>
  );
}
