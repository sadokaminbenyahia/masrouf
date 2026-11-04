'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { CircleAlertIcon, Loader2Icon } from 'lucide-react';
import { registerAction, type AuthFormState } from '@/app/actions/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError } from './field';
import { PasswordInput } from './password-input';

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(registerAction, {});
  const fe = state.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Créer un compte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deux minutes pour démarrer. Vos catégories et comptes de base sont créés pour vous.
        </p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <Field id="name" label="Prénom">
          <Input
            id="name"
            name="name"
            autoComplete="given-name"
            required
            defaultValue={state.values?.name ?? ''}
            aria-invalid={fe.name ? true : undefined}
            aria-describedby={fe.name ? 'name-erreur' : undefined}
          />
          <FieldError id="name-erreur" messages={fe.name} />
        </Field>
        <Field id="email" label="Adresse e-mail">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={state.values?.email ?? ''}
            aria-invalid={fe.email ? true : undefined}
            aria-describedby={fe.email ? 'email-erreur' : undefined}
            placeholder="vous@exemple.tn"
          />
          <FieldError id="email-erreur" messages={fe.email} />
        </Field>
        <Field id="password" label="Mot de passe">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            aria-invalid={fe.password ? true : undefined}
            aria-describedby={fe.password ? 'password-aide password-erreur' : 'password-aide'}
          />
          <p id="password-aide" className="text-xs text-muted-foreground">
            8 caractères minimum, avec au moins une lettre et un chiffre.
          </p>
          <FieldError id="password-erreur" messages={fe.password} />
        </Field>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Créer mon compte
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Déjà inscrit ?{' '}
        <Link href="/connexion" className="font-medium text-primary underline-offset-4 hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
