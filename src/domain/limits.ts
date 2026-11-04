/**
 * Plafonds par utilisateur (défense contre l'épuisement des ressources). Au-delà, la création
 * est refusée avec un message clair, jamais tronquée silencieusement.
 */
export const USER_LIMITS = {
  accounts: 50,
  categories: 100,
  recurringRules: 200,
  goals: 100,
} as const;

/** Une échéance récurrente ne peut pas être reportée plus loin que ce nombre de jours dans le passé. */
export const MAX_RECURRING_BACKDATE_DAYS = 366;
