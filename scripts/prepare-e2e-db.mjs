/**
 * Prépare la base SQLite JETABLE des tests E2E (prisma/e2e.db) : supprime le fichier de test
 * précédent, recrée le schéma puis exécute le seed. Ne touche jamais à une autre base.
 */
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const prismaDir = fileURLToPath(new URL('../prisma/', import.meta.url));
for (const suffix of ['', '-journal', '-wal', '-shm'])
  rmSync(`${prismaDir}e2e.db${suffix}`, { force: true });

const env = { ...process.env, DATABASE_URL: 'file:./e2e.db' };
execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env });
execSync('npx prisma db seed', { stdio: 'inherit', env });
