'use client';
import Link from 'next/link';
import { useActionState, useRef } from 'react';
import { CircleAlertIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { loginAction, type AuthFormState } from '@/app/actions/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError } from './field';
import { PasswordInput } from './password-input';

const DEMO = { email: 'demo@masrouf.tn', password: 'Demo1234!' };

export function LoginForm({ callbackUrl, showDemo }: { callbackUrl: string; showDemo: boolean }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(loginAction, {});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fe = state.fieldErrors ?? {};

  const fillDemo = () => {
    if (emailRef.current) emailRef.current.value = DEMO.email;
    if (passwordRef.current) {
      passwordRef.current.value = DEMO.password;
      passwordRef.current.focus();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Heureux de vous revoir. Connectez-vous pour retrouver vos comptes.
        </p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Field id="email" label="Adresse e-mail">
          <Input
            ref={emailRef}
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
            ref={passwordRef}
            id="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={fe.password ? true : undefined}
            aria-describedby={fe.password ? 'password-erreur' : undefined}
          />
          <FieldError id="password-erreur" messages={fe.password} />
        </Field>
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Se connecter
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Pas encore de compte ?{' '}
        <Link
          href="/inscription"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Créer un compte
        </Link>
      </p>

      {showDemo ? (
        <aside
          aria-labelledby="demo-titre"
          className="border-primary/30 bg-brand-tint/60 rounded-xl border border-dashed p-4 text-sm"
        >
          <p id="demo-titre" className="text-foreground flex items-center gap-2 font-medium">
            <SparklesIcon className="text-primary size-4" aria-hidden="true" />
            Compte de démo
          </p>
          <p className="text-muted-foreground mt-1">
            Compte de démo : <span className="text-foreground font-medium">demo@masrouf.tn</span> /{' '}
            <span className="text-foreground font-medium">Demo1234!</span>
          </p>
          <Button type="button" variant="link" className="mt-1 h-auto px-0 py-1" onClick={fillDemo}>
            Utiliser le compte de démo
          </Button>
        </aside>
      ) : null}
    </div>
  );
}
