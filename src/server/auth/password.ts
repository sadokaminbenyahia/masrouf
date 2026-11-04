import 'server-only';
import bcrypt from 'bcryptjs';

const COST = 12;
/** Hash factice pour garder un temps de réponse constant quand l'utilisateur n'existe pas. */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Yq1d6qR1rQ4rlqb8O0QWQn0sYpZ8eK';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
