# Brainstorming Stratégique — Application GED Mobile

> **Statut** : Prêt à servir de base pour un PRD MVP. Les hypothèses non validées sont signalées explicitement. Les décisions sont clarifiées.

***

## 1. Hypothèses à valider

Les éléments suivants restent à prouver par des interviews terrain et des spikes techniques avant d'être intégrés comme certitudes dans le PRD :

| Hypothèse | Statut | Action requise |
|---|---|---|
| Les freelances perdent du temps à retrouver leurs documents | **Non validée** | 15–20 interviews quali à conduire |
| Ils sont prêts à payer 8,99€/mois pour ce service | **Non validée** | Tester avec une landing page + waitlist payante |
| Le chiffrement local est un argument perçu comme valeur | **Non validée** | Peut être perçu comme complexité, pas comme bénéfice |
| Le mode offline est un différenciateur décisif | **Partiellement validée** — cas d'usage réels existent | Confirmer la fréquence réelle du besoin offline |
| Mistral OCR est suffisant sur des docs terrain (photo floue, mauvaise lumière) | **Non validée techniquement** | POC technique obligatoire avant tout |
| Nuxt + Capacitor tient la charge pour chiffrement + OCR mobile | **Non validée techniquement** | Spike technique à mener avant le MVP |

**Décision** : aucune de ces hypothèses ne doit apparaître comme certitude dans le PRD. Chacune doit être associée à un critère de validation explicite.

***

## 2. Positionnement

> Un outil mobile pour freelances et micro-entrepreneurs qui transforme n'importe quel document reçu ou scanné en information immédiatement retrouvable et partageable depuis leur téléphone.

**Ce que ça implique concrètement**

- Le verbe clé n'est plus "stocker" mais **"retrouver"** — c'est le bénéfice perçu
- La cible est délimitée : freelances et micro-entrepreneurs, pas les PME, pas le grand public
- "Partageable" signale le cas d'usage pro sans promettre une plateforme de collaboration

***

## 3. Proposition de valeur

> **"Scanne. Retrouve en 10 secondes. Partage sans risque."**

**Pourquoi cette formulation**

- Trois verbes d'action = trois moments utilisateur couverts par le MVP
- "10 secondes" est mesurable, démontrable, mémorable
- "Sans risque" adresse la peur du partage de documents sensibles par email ou WhatsApp, sans discours sécuritaire technique
- Elle est testable en landing page dès aujourd'hui, sans avoir codé une ligne

**Ce qu'elle exclut volontairement**

Elle ne mentionne pas l'IA, le chiffrement, l'offline — ces éléments sont des moyens, pas la promesse. Les mettre en avant crée de la complexité perçue, pas de la désirabilité.

***

## 4. Problème central

Un freelance reçoit et génère en permanence des documents professionnels : contrats, avenants, devis acceptés, factures, justificatifs fiscaux, RIB clients. Ces documents arrivent par des canaux disparates (email, WhatsApp, PDF envoyés par des tiers, scans physiques) et sont stockés sans structure dans des silos différents selon l'appareil ou l'application utilisée au moment de la réception.

**Le problème opérationnel concret** : quand il faut produire un document précis — face à un client, un comptable, ou l'administration — le temps de recherche est non déterministe. L'utilisateur ne sait pas où il a mis le document ni s'il l'a bien conservé dans sa version finale.

**Pourquoi ça justifie de payer** : ce n'est pas la fréquence (quelques fois par an) qui justifie le paiement, c'est l'**incertitude permanente** sur la capacité à retrouver. C'est le même mécanisme psychologique qui fait acheter une assurance — on paie pour supprimer une anxiété, pas pour un usage quotidien.

***

## 5. Scope MVP — 4 fonctionnalités

### Fonctionnalité 1 — Capture intelligente
- Scan via caméra avec détection automatique des bords du document
- Import PDF et images depuis le téléphone ou les apps tierces (share sheet iOS/Android)
- OCR automatique immédiat via Mistral OCR API
- Texte extrait indexé localement pour la recherche

**Critère de validation technique** : taux de précision OCR ≥ 85% sur des photos terrain (lumière imparfaite, légère distorsion) — à valider avant de le promettre dans le marketing.

### Fonctionnalité 2 — Recherche full-text
- Recherche dans le contenu extrait par OCR
- Recherche par nom de document, date de capture, et tags simples (maximum 8 catégories prédéfinies : Contrat, Facture, Identité, Administratif, Bancaire, Fiscal, Autre)
- Résultats instantanés depuis l'index local — pas de round-trip serveur pour la recherche

**Note** : les tags sont *suggérés automatiquement* par règles simples (détection de mots-clés dans le texte OCR), pas par LLM. Cela réduit la complexité, le coût, et la latence. Le LLM pour le tagging est une feature V2.

### Fonctionnalité 3 — Offline-first avec sync cloud
- Stockage local chiffré (AES-256 côté device avant tout envoi)
- Consultation complète sans connexion : document, texte OCR, métadonnées
- Index de recherche local (SQLite ou équivalent)
- Sync cloud en arrière-plan (AWS S3 via NestJS) dès que la connexion est disponible
- **Résolution de conflits** : stratégie "last write wins" avec horodatage — simple et assumé, pas de merge complexe pour le MVP

**Note sur la stack** : Nuxt + Capacitor est acceptable pour le MVP à condition que le chiffrement soit implémenté nativement via un plugin Capacitor (ex : `@capacitor/filesystem` + `capacitor-secure-storage-plugin`) et non en JavaScript pur côté WebView — risque de performance identifié, à traiter dès la phase de spike technique.

### Fonctionnalité 4 — Partage sécurisé minimaliste
- Génération d'un lien temporaire par document
- Durée d'expiration paramétrable (24h, 7 jours, 30 jours)
- Accès en lecture seule pour le destinataire, sans création de compte requise
- Lien révocable manuellement par l'émetteur
- Aucune fonctionnalité de collaboration, d'annotation, ou de signature dans cette version

***

## 6. Vision, MVP V1 et hors scope

### Vision long terme (18–36 mois)
Devenir l'outil de référence pour la gestion documentaire des indépendants en Europe francophone, avec une couche d'intelligence (résumés, alertes d'expiration sur les contrats, intégrations comptables) qui transforme le stockage passif en mémoire professionnelle active.

### MVP V1 — Scope validé
1. Capture intelligente (scan + import + OCR)
2. Recherche full-text (contenu + tags prédéfinis)
3. Offline-first (stockage local chiffré + sync cloud)
4. Partage sécurisé par lien temporaire

C'est tout. Quatre fonctionnalités. Pas une de plus.

### Hors scope explicite

| Feature | Raison d'exclusion |
|---|---|
| Résumé de documents | Coût API élevé, usage marginal non validé |
| Traduction | Use case secondaire, complexité produit sans valider le core |
| Tags IA via LLM | Tags prédéfinis suffisants pour MVP, LLM ajoute coût + latence |
| Achat in-app de stockage | Infrastructure billing complexe, quota fixe suffisant au lancement |
| Collaboration / espace partagé | Change le modèle de support et la surface de sécurité — feature B2B |
| Signature électronique | Marché différent, réglementation eIDAS, out of scope |
| Notifications d'expiration contrats | Nécessite que l'OCR soit fiable en premier |
| Version web | Mobile-first assumé — la version web dilue le focus |

***

## 7. Les 3 risques critiques

**Risque 1 — Qualité OCR terrain (produit, probabilité haute)**

L'OCR est la fonctionnalité centrale. Si la qualité est insuffisante sur des photos prises en conditions réelles (contraste faible, légère rotation, fond non uniforme), la recherche full-text devient inutile et la promesse produit s'effondre. La dépendance à Mistral OCR API est double : qualité et coût. Si le coût par appel API dépasse la marge sur l'abonnement à volumétrie réelle, le modèle économique est non viable.

**Mitigation** : spike technique immédiat avec 50 photos terrain représentatives avant toute décision de développement. Définir un seuil de précision minimum acceptable (85%) et un coût API maximum acceptable par utilisateur actif.

**Risque 2 — Absence de différenciateur perçu (marché, probabilité haute)**

Le problème n'est pas que la solution soit mauvaise — c'est que l'utilisateur cible a déjà un workaround "acceptable" (un dossier Google Drive nommé "Docs importants", un album photo sur iPhone). La douleur est réelle mais la solution existante est "assez bonne" la plupart du temps. Sans un moment de démonstration choc lors de l'onboarding, le taux de conversion du gratuit au payant restera marginal.

**Mitigation** : l'onboarding doit produire le moment "retrouve un document en 10 secondes" dans les 5 premières minutes d'utilisation. C'est une contrainte de design non négociable, pas une option.

**Risque 3 — Complexité sous-estimée de l'offline-first (technique, probabilité moyenne-haute)**

L'offline-first avec chiffrement local sur une architecture Nuxt + Capacitor est non trivial. Les points de friction connus : performance du chiffrement sur des fichiers volumineux en WebView, gestion de la cohérence de l'index local en cas de sync partielle, comportement sur des devices Android mid-range. Ce n'est pas bloquant, mais c'est le type de problème qui double le temps de développement estimé.

**Mitigation** : implémenter le chiffrement via un plugin natif Capacitor (pas en JS pur), fixer une taille maximale de fichier supportée pour le MVP (ex : 50 Mo), et prévoir un sprint de test sur des devices Android d'entrée de gamme avant le lancement.

***

## 8. Résumé stratégique — Base pour le PRD

**Ce que vous construisez**
Une application mobile iOS et Android qui permet à un freelance de capturer, retrouver et partager ses documents professionnels en moins de 10 secondes, depuis son téléphone.

**Pour qui**
Freelances et micro-entrepreneurs gérant régulièrement des contrats, factures, et justificatifs administratifs. En priorité : France, Belgique, Suisse francophone — marché de 4–5 millions de travailleurs indépendants.

**Pourquoi maintenant**
L'OCR mobile de qualité est désormais accessible via API à coût marginal (Mistral OCR). Les solutions généralistes de stockage et de scan proposent de l'OCR et de la recherche plein texte, mais elles ne sont pas conçues pour un usage mobile centré sur la restitution rapide de documents critiques sous pression. Elles privilégient le stockage généraliste plutôt que la centralisation structurée et orientée "moment critique" des documents professionnels d'un freelance.

**Ce que le MVP doit prouver**
1. La qualité OCR est suffisante sur des photos terrain réelles
2. La recherche full-text produit un moment WOW lors de l'onboarding
3. Des utilisateurs signent pour un abonnement mensuel avant d'avoir épuisé le quota gratuit

**Modèle économique**
- Tier Free : quota de 30 documents, fonctionnalités complètes, sans limite de temps
- Tier Pro : 8,99€/mois, documents illimités, historique de partage, backup cloud garanti
- Pas de vente de stockage — la valeur vendue est l'intelligence et la tranquillité d'esprit

**Critères de succès du MVP**
- 500 utilisateurs actifs dans les 60 jours post-lancement
- Taux de conversion Free → Pro ≥ 5% à 90 jours
- Note App Store ≥ 4,2 après 50 avis
- Aucun incident de perte de données utilisateur

**Prochaines étapes concrètes avant de coder**
1. Spike technique OCR (2 jours) — tester Mistral OCR sur 50 documents réels
2. Spike technique Capacitor + chiffrement natif (2 jours) — valider la performance sur Android mid-range
3. 15 interviews freelances (2 semaines) — valider le problème et le consentement à payer
4. Landing page avec waitlist payante (1 semaine) — tester la proposition de valeur avant le développement