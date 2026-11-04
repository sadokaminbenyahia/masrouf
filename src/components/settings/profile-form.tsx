'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Loader2Icon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { updateProfileAction } from '@/app/actions/user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionError, errorMessage, queryKeys, unwrap } from '@/lib/query';
import { toastError, toastSuccess } from '@/lib/toast';
import { SettingsSection } from './settings-section';

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== name && value.trim() !== '';

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        unwrap(await updateProfileAction({ name: value.trim() }));
        setError(null);
        await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
        toastSuccess('Profil mis à jour.');
        router.refresh();
      } catch (err) {
        const msg = err instanceof ActionError ? err.fieldErrors?.name?.[0] : undefined;
        setError(msg ?? errorMessage(err));
        if (!msg) toastError(errorMessage(err));
      }
    });
  };

  return (
    <SettingsSection id="profil" title="Profil" description="Votre prénom apparaît dans l'application.">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:max-w-md">
        <div className="grid gap-2">
          <Label htmlFor="profil-prenom">Prénom</Label>
          <Input
            id="profil-prenom"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="given-name"
            maxLength={60}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'profil-prenom-erreur' : undefined}
          />
          {error && (
            <p id="profil-prenom-erreur" className="text-xs text-expense">
              {error}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="profil-email">Adresse e-mail</Label>
          <Input id="profil-email" value={email} readOnly disabled />
        </div>
        <div>
          <Button type="submit" disabled={!dirty || pending}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            Enregistrer
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
