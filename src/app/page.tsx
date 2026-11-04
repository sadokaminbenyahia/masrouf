import { redirect } from 'next/navigation';
import { getCurrentUserId } from '@/server/auth/session';

export default async function Home() {
  const userId = await getCurrentUserId();
  redirect(userId ? '/tableau-de-bord' : '/connexion');
}
