import type { Metadata } from 'next';
import { RegisterForm } from '../_components/register-form';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function InscriptionPage() {
  return <RegisterForm />;
}
