'use server';
// Propriétaire : agent F (validation + délégation ; la logique est dans auth.service)
import { AuthError, CredentialsSignin } from 'next-auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSchema, registerSchema } from '@/lib/schemas/auth';
import { zodFieldErrors } from '@/lib/schemas/common';
import { signIn, signOut } from '@/server/auth/config';
import { safeInternalPath } from '@/lib/safe-redirect';
import { getCurrentUserId, revokeAllSessions } from '@/server/auth/session';
import { clientIpFromHeaders } from '@/server/security/client-ip';
import { authLimiter, registerGlobalLimiter } from '@/server/security/rate-limit';
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

async function clientIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
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
  redirect(safeInternalPath(field(formData, 'callbackUrl')));
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = field(formData, 'name');
  const email = field(formData, 'email');
  const values = { name, email };

  const ip = await clientIp();
  const ipAllowed = ip === 'direct' || authLimiter.check(`register:ip:${ip}`).allowed;
  if (!ipAllowed || !registerGlobalLimiter.check('register:global').allowed) {
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

/**
 * Déconnexion : supprime le cookie de session SANS redirection serveur. Le client doit
 * ensuite faire un rechargement complet (`window.location.assign('/connexion')`) pour vider
 * tout cache en mémoire (TanStack Query) avant qu'un autre utilisateur ne se connecte.
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
}

/** Révoque toutes les sessions (tous appareils) puis déconnecte (même contrat que logoutAction). */
export async function logoutEverywhereAction(): Promise<void> {
  const userId = await getCurrentUserId();
  if (userId) await revokeAllSessions(userId);
  await signOut({ redirect: false });
}
