import type { Metadata } from 'next';
import { LoginForm } from '../_components/login-form';

export const metadata: Metadata = { title: 'Connexion' };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.callbackUrl;
  const callbackUrl =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')
      ? raw
      : '/tableau-de-bord';
  return <LoginForm callbackUrl={callbackUrl} />;
}
