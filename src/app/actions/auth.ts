'use server';
// Propriétaire : agent F (validation + délégation ; la logique est dans auth.service)
import { AuthError, CredentialsSignin } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSchema, registerSchema } from '@/lib/schemas/auth';
import { zodFieldErrors } from '@/lib/schemas/common';
import { signIn, signOut } from '@/server/auth/config';
import { authLimiter } from '@/server/security/rate-limit';
import { registerUser } from '@/server/services/auth.service';

export interface AuthFormState {
  /** Message global (affiché en tête du formulaire) */
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Valeurs à réafficher (jamais le mot de passe) */
  values?: { email?: string; name?: string };
}

const LOGIN_FAILED = 'Adresse e-mail ou mot de passe incorrect.';
const RATE_LIMITED = 'Trop de tentatives. Patientez une minute avant de réessayer.';
const GENERIC_FAILURE = 'La connexion a échoué. Réessayez dans un instant.';

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v : '';
}

/** N'accepte qu'un chemin interne (« /… », jamais « //… » ni une URL absolue). */
function safeCallbackUrl(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/tableau-de-bord';
  }
  if (raw.startsWith('/connexion') || raw.startsWith('/inscription') || raw.startsWith('/api/')) {
    return '/tableau-de-bord';
  }
  return raw;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

/** Connexion par identifiants. Renvoie un état d'erreur, ou redirige en cas de succès. */
async function credentialsSignIn(email: string, password: string): Promise<string | null> {
  try {
    const url: unknown = await signIn('credentials', { email, password, redirect: false });
    // Selon la version d'Auth.js, l'échec peut aussi être signalé par l'URL de retour.
    if (typeof url === 'string' && /[?&]error=/.test(url)) {
      return /[?&]code=rate_limited/.test(url) ? RATE_LIMITED : LOGIN_FAILED;
    }
    return null;
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      return e.code === 'rate_limited' ? RATE_LIMITED : LOGIN_FAILED;
    }
    if (e instanceof AuthError) {
      console.error('[auth] échec de connexion', e.type);
      return GENERIC_FAILURE;
    }
    throw e;
  }
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, 'email');
  const parsed = loginSchema.safeParse({ email, password: field(formData, 'password') });
  if (!parsed.success) {
    return { fieldErrors: zodFieldErrors(parsed.error), values: { email } };
  }
  const failure = await credentialsSignIn(parsed.data.email, parsed.data.password);
  if (failure) return { error: failure, values: { email } };
  redirect(safeCallbackUrl(field(formData, 'callbackUrl')));
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = field(formData, 'name');
  const email = field(formData, 'email');
  const values = { name, email };

  const ip = await clientIp();
  if (!authLimiter.check(`register:ip:${ip}`).allowed) {
    return { error: RATE_LIMITED, values };
  }

  const parsed = registerSchema.safeParse({ name, email, password: field(formData, 'password') });
  if (!parsed.success) {
    return { fieldErrors: zodFieldErrors(parsed.error), values };
  }

  const created = await registerUser(parsed.data);
  if (!created.ok) {
    if (created.error.code === 'CONFLICT') return { error: created.error.message, values };
    return { error: 'Impossible de créer ce compte pour le moment. Réessayez plus tard.', values };
  }

  const failure = await credentialsSignIn(parsed.data.email, parsed.data.password);
  if (failure) {
    // Le compte existe : on invite à se connecter manuellement.
    redirect('/connexion');
  }
  redirect('/tableau-de-bord');
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/connexion' });
}
