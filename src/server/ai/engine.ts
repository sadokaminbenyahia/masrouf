import 'server-only';
import type { AIEngine } from '@/domain/ai/engine';
import { createLocalAIEngine } from '@/domain/ai/local-engine';

/** Point d'injection unique du moteur IA (changer d'implémentation = changer cette ligne). */
export const aiEngine: AIEngine = createLocalAIEngine();
