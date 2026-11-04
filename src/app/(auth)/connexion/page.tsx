import type { Metadata } from 'next';
import { safeInternalPath } from '@/lib/safe-redirect';
import { LoginForm } from '../_components/login-form';

export const metadata: Metadata = { title: 'Connexion' };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = safeInternalPath(params.callbackUrl);
  return (
    <LoginForm callbackUrl={callbackUrl} showDemo={process.env.MASROUF_DEMO_MODE === 'true'} />
  );
}
