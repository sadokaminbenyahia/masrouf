# Conception de l'IA locale (synthèse de la phase 0)

Ce document est une **référence d'algorithmes** pour les agents J et K. Pour les signatures, `src/domain/ai/types.ts` et `engine.ts` font foi.

## 0. Normalisation des libellés : `normalizeLabel` et `merchantKey`

Étapes appliquées dans l'ordre :

1. Mise en minuscules, NFD, suppression des diacritiques (`\p{M}`). Pour l'arabe : retirer le tashkeel, ramener أإآ à ا et ة à ه.
2. Suppression des préfixes bancaires : `paiement (cb|tpe|carte)`, `achat (cb|tpe)`, `retrait (dab|gab)`, `vir(ement)? (recu|emis|sepa)?`, `prlv|prelevement`, `fact(ure)?`, `cb`, `tpe`.
3. Suppression du bruit :
   - dates `\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b` ;
   - heures `\d{1,2}[:h]\d{2}` ;
   - cartes masquées `[x*]{2,}\d{2,4}` ;
   - références `\b\d{4,}\b` ;
   - formes juridiques `sarl|sa|suarl|ste|ets` ;
   - liste des villes tunisiennes (tunis, ariana, sfax, sousse, lac, marsa…) **pour merchantKey uniquement**.
4. Découpage sur `[^a-z0-9؀-ۿ]+`. On garde les tokens de 2 caractères ou plus, sauf les mots vides : le la les de du des d l et a au aux en pour chez sur un une par.
5. `merchantKey` = les deux premiers tokens restants. Exemple : « PAIEMENT CB CARREFOUR LA MARSA 12/03 » → « carrefour marsa » (ou « carrefour » si les villes sont retirées).

## 1. Catégorisation : naïf bayésien multinomial

**Features :**

- tokens et bigrammes du libellé ;
- trigrammes de caractères de `merchantKey`, avec un poids de 0,5 (tolère des fautes comme « carfour ») ;
- tranche de montant `amt:⌊log2(|m|/1000)⌋` ;
- sens : `dir:in` ou `dir:out`.

**Score :** `log P(c) + Σ n_t·log((N_tc+α)/(N_c+α|V|))`, avec α = 1, puis un softmax pour obtenir la confiance. Seules les catégories du **même sens** sont candidates : EXPENSE vers une catégorie EXPENSE, INCOME vers une catégorie INCOME.

**Cascade de décision :**

1. `merchantMap[merchantKey]` issu des corrections : confiance 0,98, source MERCHANT.
2. Le modèle, si p ≥ 0,6 **et** que l'écart avec la deuxième catégorie est ≥ 0,15 : source MODEL.
3. Les règles par mots-clés (`CATEGORY_KEYWORDS`, par nom de catégorie par défaut) : source RULE, confiance 0,7.
4. Sinon `null`.

**Démarrage à froid :** les mots-clés servent de pseudo-documents, avec un poids `max(0, 1 − n/200)`.

**Correction :** on retire les comptes de l'ancienne catégorie (si elle est connue), on ajoute ceux de la nouvelle avec un poids de 3, et on met à jour `merchantMap`. Le coût est en O(nombre de tokens), et l'opération est immuable.

**Persistance :** JSON dans `AiModel` (kind `categorizer`). On réentraîne si la version change ou si le JSON est invalide. On élague le vocabulaire au-delà de 20 000 tokens (fréquence < 2).

**Test :** jeu de référence d'au moins 150 libellés tunisiens étiquetés, en validation croisée. Cible : exactitude ≥ 0,85. Après une correction, la prédiction suivante doit changer.

## 2. Saisie en langage naturel

**Ordre d'extraction :** montant → date → type → compte → catégorie. Le texte restant devient le libellé (en majuscule initiale).

**Montant.** Regex : `(?<![\p{L}\d])(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,](\d{1,3}))?\s*(dt|tnd|dinars?|d|millimes?|mill?|m)?(?![\p{L}\d])`

- 3 décimales → directement en millimes (« 3,500 » = 3500) ;
- 1 ou 2 décimales → on complète à droite (« 3.5 » = 3500) ;
- unité millimes → l'entier tel quel ;
- entier sans unité → dinars.
- Attention à « le 1er » et « le 15 » : ce sont des dates, pas des montants. Si plusieurs nombres sont présents, prendre celui qui n'est pas consommé par la date.

**Dates.**

- aujourd'hui, hier, avant-hier, « il y a N jours » ;
- un jour de semaine (lundi…) → le plus récent passé, aujourd'hui exclu ;
- « le 1er », « le 15 » → dernière occurrence passée ou aujourd'hui ;
- « 12/03 », « 12 mars ».

**Type :** INCOME si le texte contient salaire, prime, reçu, remboursement, vente, freelance, virement reçu, ou un « + » en tête.

**Compte :** espèces, cash, liquide → CASH ; carte, cb, visa → CARD ; banque, virement → BANK.

## 3. Anomalies

**Dépense inhabituelle.** Par catégorie, sur log(montant) des 6 derniers mois, z robuste `0,6745·(x − médiane)/MAD`. On signale si z > 3,5 et montant ≥ 20 DT.

- MAD = 0 ou n < 8 → repli IQR : `x > Q3 + 1,5·IQR` et x ≥ 2 × la médiane.
- n < 4 → on signale si x > 3 × la médiane globale des dépenses de l'utilisateur.
- On exclut les virements.

**Doublon suspect :** même `merchantKey`, même montant, |Δjours| ≤ 2, identifiants différents, transaction non récurrente.

**Hausse d'abonnement :** pour une série récurrente (`recurringId` ou série détectée), dernier montant > médiane des 3 précédents × 1,05 et écart ≥ 1 DT.

**Clés stables :**

- `anomaly:unusual:<txId>`
- `anomaly:duplicate:<idA>:<idB>`
- `anomaly:price:<merchantKey>:<YYYY-MM>`

## 4. Récurrences détectées

1. Grouper par `merchantKey`, puis par grappe de montants (±15 %).
2. Calculer la médiane des intervalles et la régularité `1 − MAD/médiane ≥ 0,7`.
3. Rattacher la période à 7 (WEEKLY), 30 ± 3 (MONTHLY), 91 (QUARTERLY), 365 (YEARLY). Un écart de 60 jours (STEG bimestriel) est classé MONTHLY ×2, ou ignoré.
4. Exiger au moins 3 occurrences et un coefficient de variation des montants < 0,15 (< 0,4 pour les factures).
5. `nextDate` = dernière date + période.

On exclut les séries déjà couvertes par une `RecurringRule` (même label normalisé ou `recurringId`).

## 5. Prévision du solde

**Fin de mois :** solde actuel + récurrences restantes du mois (déterministes) + r × jours restants.

- r = flux variable journalier en moyenne exponentielle sur 90 jours (demi-vie 30 jours), hors récurrences et hors virements.
- Intervalle à 80 % : `±1,28·σ_j·√j`.

**Trois mois suivants :**

1. Série mensuelle du flux variable net, régression linéaire sur 6 à 12 mois.
2. Saisonnalité multiplicative à partir de 13 mois.
3. Ajout des récurrences de chaque mois.
4. Intervalle `±1,28·σ_résidus·√h`, multiplié par √(6/n) si n < 6.

**Fiabilité :** moins de 30 jours d'historique → LOW (récurrences seules) ; 3 mois ou plus → MEDIUM ; 6 mois ou plus avec des résidus faibles → HIGH.

**`chart` :** soldes réels de fin de mois sur 6 mois, reconstitués à rebours depuis le solde actuel, puis le mois courant et 3 mois prévus.

## 6. Assistant : intentions, entités, outils

| Intention        | Exemples                                                          | Outils                                      |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| SPENDING_TOTAL   | « combien j'ai dépensé en resto ce mois ? »                       | sumTransactions + monthlyTotals (graphique) |
| INCOME_TOTAL     | « combien j'ai gagné depuis janvier ? »                           | sumTransactions(type INCOME)                |
| COMPARE_PERIODS  | « je dépense plus qu'en mars ? », « par rapport au mois dernier » | sumTransactions ×2                          |
| TOP_CATEGORIES   | « où part mon argent ce trimestre ? »                             | breakdownByCategory (camembert)             |
| TOP_MERCHANTS    | « mes plus gros commerçants »                                     | topMerchants                                |
| BIGGEST_EXPENSE  | « ma plus grosse dépense le mois dernier »                        | listTransactions(AMOUNT_DESC)               |
| AVERAGE_SPENDING | « combien je dépense en moyenne en courses ? »                    | monthlyTotals                               |
| BUDGET_STATUS    | « il me reste combien en budget loisirs ? »                       | budgetStatus                                |
| BALANCE          | « quel est mon solde ? »                                          | balances                                    |
| FORECAST         | « combien j'aurai à la fin du mois ? »                            | forecast                                    |
| CAN_AFFORD       | « je peux acheter un téléphone à 900 dinars ? »                   | forecast : low ≥ montant ?                  |
| SUBSCRIPTIONS    | « mes abonnements »                                               | recurring                                   |
| GOAL_PROGRESS    | « quand j'atteins mon objectif voyage ? »                         | goals                                       |
| SAVINGS_RATE     | « quel est mon taux d'épargne ? »                                 | monthlyTotals                               |

**Détection :** mots déclencheurs pondérés et normalisés (sans accents), plus des regex. Seuil minimal ; en dessous, `understood: false` avec des suggestions.

**Périodes** (résolues en intervalle **inclusif** à partir de `today`) :

- cette semaine ; ce mois ; le mois dernier ; ce trimestre ; le trimestre dernier ;
- « en mars » : l'année courante si ≤ le mois courant, sinon l'année précédente ;
- « depuis janvier » ; « les N derniers mois » ; cette année ; l'an dernier ; hier ; aujourd'hui ; « entre le X et le Y » ;
- sans période : ce mois.

**Catégorie :** correspondance floue (trigrammes, Jaccard ≥ 0,5) entre les noms de catégories et le texte, avec des synonymes (resto → Restaurants, bouffe ou supermarché → Courses, essence → Carburant, internet ou téléphone → Télécom, électricité, eau, steg ou sonede → Factures, sorties → Loisirs).

## 7. Résumé mensuel

**Faits calculés :** total, écart avec le mois précédent et avec la moyenne sur 3 mois, top 3 des catégories, plus forte hausse, taux d'épargne, budgets dépassés, objectifs.

**Rédaction :** les faits sont classés par intérêt (`|Δ%|·montant`), on en garde 4 ou 5. Chaque type de fait dispose de 3 à 5 gabarits ; le choix se fait par `hash(seed+mois+typeDeFait) % k`.

**Recommandations :** 3, de types distincts, triées par gain estimé (millimes par mois). Les candidates :

- catégorie au-dessus de son budget ;
- catégorie en hausse de plus de 30 % ;
- petites dépenses fréquentes (cafés) : fréquence × montant moyen ;
- abonnement en hausse ;
- taux d'épargne inférieur à 10 % ;
- objectif en retard.

## 8. Simulateur « et si »

1. Épargne mensuelle S = médiane sur les 3 derniers mois (complets si possible) de (revenus − dépenses).
2. S' = S + Σ arrondi(percent/100 × moyenne mensuelle de la catégorie) + épargne supplémentaire.
3. Nombre de mois = ⌈(cible − épargné)/S'⌉. Si S' ≤ 0, l'objectif n'est jamais atteint (date null).
4. `timeline` : cumul mois par mois (12 mois au moins, ou jusqu'à atteinte, plafonné à 120).
5. `message` : phrase française, par exemple « En réduisant Restaurants de 20 %, vous atteignez « Voyage à Djerba » en mars 2027, 2 mois plus tôt. »

## 9. Score de santé (0-100)

Chaque sous-score est linéaire par morceaux et borné entre 0 et 100. Si une donnée manque, on écarte le sous-score et on renormalise les poids.

| Sous-score                                                   | Poids | Barème                             |
| ------------------------------------------------------------ | ----- | ---------------------------------- |
| Taux d'épargne                                               | 25 %  | 0 % → 0 ; 20 % ou plus → 100       |
| Fonds d'urgence (solde / dépenses mensuelles moyennes)       | 20 %  | 0 → 0 ; 3 mois → 60 ; 6 mois → 100 |
| Charges fixes / revenu                                       | 15 %  | ≤ 35 % → 100 ; ≥ 70 % → 0          |
| Respect des budgets                                          | 15 %  | part des budgets non dépassés      |
| Stabilité (coefficient de variation des dépenses mensuelles) | 10 %  | ≤ 0,1 → 100 ; ≥ 0,5 → 0            |
| Tendance sur 3 mois                                          | 10 %  | dépenses en baisse → 100           |
| Progression des objectifs                                    | 5 %   | —                                  |

**Note :** EXCELLENT ≥ 80, BON ≥ 60, MOYEN ≥ 40, sinon FRAGILE. `topAdvice` = le sous-score dont la hausse rapporterait le plus de points pondérés.

## 10. Pièges

- **Dates :** pas de `new Date('YYYY-MM-DD')` ; utiliser `src/domain/dates.ts`. `today` est un paramètre.
- **Montants :** calculs statistiques en flottant, puis **un seul** `Math.round` en sortie. Tous les montants renvoyés sont des entiers sûrs.
- **Données exclues :** les virements et les catégories SAVINGS ne comptent pas dans les statistiques de dépenses courantes.
- **Performance :** moins de 50 ms pour 10 000 transactions ; O(n log n) au maximum.
