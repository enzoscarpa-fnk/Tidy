# PRD — Application GED Mobile
**Version** : 1.0 — MVP
**Statut** : Prêt pour sprint planning
**Dernière mise à jour** : Février 2026

***

## 1. Contexte produit

Les freelances et micro-entrepreneurs génèrent et reçoivent en permanence des documents professionnels (contrats, factures, justificatifs, RIB) via des canaux disparates : email, WhatsApp, scans physiques, PDF tiers. Ces documents se retrouvent dans des silos non structurés — Drive, photos, email — sans logique commune.

Quand il faut produire un document précis face à un client, un comptable ou l'administration, le temps de recherche est non déterministe. Le problème n'est pas le stockage — c'est l'incertitude permanente sur la capacité à retrouver.

L'application adresse ce problème en trois gestes : scanner, retrouver, partager. Elle est mobile-first, offline-capable, et conçue pour des indépendants qui n'ont ni DSI, ni envie de gérer une arborescence de dossiers.

***

## 2. Objectif du MVP

Le MVP doit valider trois hypothèses dans cet ordre de priorité :

1. **Qualité produit** : l'OCR produit des résultats suffisamment précis sur des photos terrain réelles (seuil : ≥ 85% de précision) pour que la recherche full-text soit fiable
2. **Valeur perçue** : la recherche full-text produit un moment de démonstration convaincant dans les 5 premières minutes d'utilisation
3. **Monétisation** : des utilisateurs passent en tier Pro avant d'avoir atteint la limite de 30 documents du tier Free

***

## 3. Cible utilisateur

**Persona principal** : Freelance ou micro-entrepreneur, 25–45 ans, France / Belgique / Suisse francophone. Gère seul ses documents professionnels. Utilise déjà un smartphone comme outil de travail principal. N'a pas de système d'organisation documentaire en place.

**Critères d'inclusion** :
- Émet ou reçoit au moins 5 documents professionnels distincts par mois
- A déjà perdu du temps à chercher un document dont il avait besoin immédiatement
- Utilise son téléphone comme premier point d'accès à ses fichiers professionnels

**Hors cible pour le MVP** : PME, équipes, professions réglementées avec contraintes spécifiques (médecins, avocats), grand public.

***

## 4. Proposition de valeur

> **"Scanne. Retrouve en 10 secondes. Partage sans risque."**

Trois moments utilisateur. Trois verbes. Une promesse mesurable et démontrable dès l'onboarding.

***

## 5. User flows principaux

### Flow 1 — Capture par scan
```
Ouvrir l'app
→ Appuyer sur "Scanner"
→ Cadrer le document (détection automatique des bords)
→ Confirmer la capture
→ OCR s'exécute automatiquement en arrière-plan
→ Tag suggéré automatiquement (modifiable)
→ Document disponible dans la liste, indexé et consultable
```

### Flow 2 — Import depuis une app tierce
```
Recevoir un PDF dans Gmail / WhatsApp / Files
→ Appuyer sur "Partager" dans l'app source
→ Sélectionner l'application dans la share sheet iOS/Android
→ OCR s'exécute automatiquement
→ Tag suggéré (modifiable)
→ Document disponible dans la liste, indexé et consultable
```

### Flow 3 — Recherche d'un document
```
Ouvrir l'app
→ Appuyer sur le champ de recherche
→ Saisir un mot-clé (nom, contenu, date, tag)
→ Résultats affichés instantanément depuis l'index local
→ Appuyer sur un résultat → consulter le document
```

### Flow 4 — Partage par lien temporaire
```
Ouvrir un document
→ Appuyer sur "Partager"
→ Choisir la durée d'expiration (24h / 7j / 30j)
→ Lien généré
→ Copier / envoyer le lien
→ (optionnel) Révoquer le lien depuis la fiche document
```

### Flow 5 — Consultation offline
```
Passer en mode avion ou zone sans réseau
→ Ouvrir l'app
→ Consulter la liste des documents
→ Ouvrir un document → affichage complet (fichier + texte OCR + métadonnées)
→ Rechercher dans l'index local → résultats disponibles
```

***

## 6. User stories

### Capture intelligente
- En tant que freelance, je veux scanner un document physique depuis mon téléphone, afin qu'il soit immédiatement disponible dans l'application sans étape manuelle supplémentaire.
- En tant que freelance, je veux importer un PDF reçu par email ou WhatsApp directement dans l'application, afin de centraliser tous mes documents au même endroit.
- En tant que freelance, je veux que le document soit automatiquement catégorisé après l'import, afin de ne pas avoir à l'organiser manuellement.

### Recherche full-text
- En tant que freelance, je veux rechercher un document par un mot présent dans son contenu, afin de le retrouver sans me souvenir de son nom ou de sa date.
- En tant que freelance, je veux filtrer mes documents par tag (Contrat, Facture, etc.), afin de naviguer rapidement dans ma bibliothèque sans taper de mots-clés.
- En tant que freelance, je veux que les résultats de recherche s'affichent instantanément, afin de ne pas attendre une réponse serveur pour un besoin urgent.

### Offline-first
- En tant que freelance, je veux accéder à tous mes documents sans connexion internet, afin de pouvoir les consulter depuis n'importe quel endroit y compris en déplacement.
- En tant que freelance, je veux que mes documents soient synchronisés automatiquement quand je retrouve du réseau, afin de ne jamais avoir à déclencher manuellement une sauvegarde.

### Partage sécurisé
- En tant que freelance, je veux générer un lien de partage temporaire vers un document, afin de l'envoyer à un client ou un comptable sans lui donner accès à toute ma bibliothèque.
- En tant que freelance, je veux pouvoir révoquer un lien de partage à tout moment, afin de contrôler qui peut accéder à mes documents après l'envoi.
- En tant que freelance, je veux que le destinataire puisse consulter le document sans créer de compte, afin de ne pas lui imposer de friction à la réception.

***

## 7. Functional requirements

### F1 — Capture intelligente

| ID | Exigence | Testable |
|---|---|---|
| F1.1 | L'application ouvre la caméra native depuis un bouton accessible en un tap depuis l'écran principal | ✅ |
| F1.2 | La détection automatique des bords du document est active par défaut lors du scan | ✅ |
| F1.3 | L'OCR est déclenché automatiquement après chaque capture ou import, sans action utilisateur | ✅ |
| F1.4 | Le texte extrait est indexé localement dans les 10 secondes suivant la capture | ✅ |
| F1.5 | L'application est accessible depuis la share sheet iOS et Android pour l'import de PDF et d'images | ✅ |
| F1.6 | Un tag est suggéré automatiquement après l'OCR, basé sur des règles de détection de mots-clés | ✅ |
| F1.7 | L'utilisateur peut modifier le tag suggéré avant ou après l'enregistrement | ✅ |
| F1.8 | Les formats supportés à l'import sont : PDF, JPG, PNG | ✅ |
| F1.9 | La taille maximale d'un fichier importé est de 50 Mo | ✅ |

### F2 — Recherche full-text

| ID | Exigence | Testable |
|---|---|---|
| F2.1 | La recherche s'effectue dans le contenu extrait par OCR, le nom du document, et la date de capture | ✅ |
| F2.2 | Les résultats s'affichent en moins de 1 seconde depuis l'index local, sans connexion réseau | ✅ |
| F2.3 | La recherche fonctionne à partir de 2 caractères saisis | ✅ |
| F2.4 | Les 8 tags prédéfinis sont : Contrat, Facture, Identité, Administratif, Bancaire, Fiscal, Reçu, Autre | ✅ |
| F2.5 | L'utilisateur peut filtrer la liste par tag via un sélecteur accessible depuis l'écran principal | ✅ |
| F2.6 | L'affichage des résultats indique le nom, la date de capture, et le tag de chaque document | ✅ |
| F2.7 | La recherche est insensible à la casse et aux accents | ✅ |

### F3 — Offline-first avec sync cloud

| ID | Exigence | Testable |
|---|---|---|
| F3.1 | Tous les documents, leur texte OCR et leurs métadonnées sont consultables sans connexion réseau | ✅ |
| F3.2 | Le fichier source (PDF ou image) est stocké localement sur le device | ✅ |
| F3.3 | Le stockage local est chiffré avec AES-256 via un plugin natif Capacitor (pas en JS pur) | ✅ |
| F3.4 | L'index de recherche local est maintenu dans une base SQLite embarquée | ✅ |
| F3.5 | La sync cloud se déclenche automatiquement en arrière-plan dès qu'une connexion est disponible | ✅ |
| F3.6 | En cas de conflit, la version la plus récente (horodatage) est conservée — stratégie last write wins | ✅ |
| F3.7 | L'état de sync de chaque document est visible par l'utilisateur (synchronisé / en attente / erreur) | ✅ |
| F3.8 | La perte de connexion en cours de sync ne provoque pas de corruption des données locales | ✅ |

### F4 — Partage sécurisé minimaliste

| ID | Exigence                                                                                               | Testable |
|---|--------------------------------------------------------------------------------------------------------|---|
| F4.1 | L'utilisateur peut générer un lien de partage depuis la fiche de n'importe quel document               | ✅ |
| F4.2 | Les durées d'expiration disponibles sont : 24 heures, 7 jours, 30 jours                                | ✅ |
| F4.3 | Le lien donne accès au fichier en lecture seule, téléchargement autorisé, aucune modification possible | ✅ |
| F4.4 | Le destinataire accède au document sans créer de compte                                                | ✅ |
| F4.5 | L'émetteur peut révoquer le lien manuellement à tout moment depuis la fiche document                   | ✅ |
| F4.6 | Un lien expiré retourne une page d'erreur explicite côté destinataire                                  | ✅ |
| F4.7 | Un seul lien actif par document à la fois — générer un nouveau lien invalide le précédent              | ✅ |

***

## 8. Non-functional requirements

### Performance
- NFR1 : le résultat de recherche s'affiche en < 1 seconde sur l'index local (mesuré sur un device Android mid-range)
- NFR2 : l'OCR d'un document d'une page est complété en < 5 secondes après la capture (API response incluse)
- NFR3 : l'application se charge en < 2 secondes à froid sur iOS 16+ et Android 11+

### Sécurité
- NFR4 : le chiffrement local est AES-256, implémenté via plugin natif Capacitor — pas en JavaScript WebView
- NFR5 : les données transmises vers le cloud transitent uniquement via HTTPS/TLS 1.2+
- NFR6 : les liens de partage sont générés avec un token aléatoire d'au moins 32 caractères non devinables
- NFR7 : aucune donnée utilisateur n'est transmise à des tiers hors Mistral OCR API (pour le traitement OCR uniquement)

### Offline
- NFR8 : toutes les fonctionnalités de lecture et de recherche sont disponibles sans connexion réseau
- NFR9 : la perte de réseau en cours d'utilisation ne produit aucun crash ni message d'erreur bloquant
- NFR10 : la sync reprend automatiquement sans intervention utilisateur au retour de la connexion

### Fiabilité
- NFR11 : aucune perte de données lors d'une interruption de sync (fermeture forcée, perte réseau)
- NFR12 : les sauvegardes cloud sont cohérentes — un document visible dans l'app est récupérable depuis le cloud

### Compatibilité
- NFR13 : iOS 16 minimum, Android 11 minimum
- NFR14 : testé sur au moins un device Android d'entrée de gamme (RAM ≤ 3 Go) avant release

***

## 9. Hypothèses à valider

Ces hypothèses ne sont pas des certitudes. Chacune doit être validée avant ou pendant la phase MVP :

| Hypothèse | Statut | Critère de validation |
|---|---|---|
| Les freelances perdent du temps à retrouver leurs documents | Non validée | 15 interviews : ≥ 10/15 confirment le problème comme récurrent |
| Ils sont prêts à payer 8,99€/mois | Non validée | Landing page : ≥ 5% de conversion sur une waitlist payante |
| Le chiffrement local est perçu comme une valeur | Non validée | Interviews : testé comme argument — pas mis en avant si réponse neutre |
| Le mode offline est un différenciateur décisif | Partiellement validée | Usage tracking post-lancement : ≥ 20% des sessions sans réseau actif |
| Mistral OCR est suffisant sur des photos terrain | Non validée techniquement | Spike : ≥ 85% de précision sur un corpus de 50 photos terrain |
| Nuxt + Capacitor tient la charge pour chiffrement + OCR | Non validée techniquement | Spike : chiffrement d'un fichier de 10 Mo en < 3 secondes sur Android mid-range |

***

## 10. KPIs de succès MVP

| KPI | Cible | Délai |
|---|---|---|
| Utilisateurs actifs (≥ 1 document capturé) | 500 | J+60 post-lancement |
| Taux de conversion Free → Pro | ≥ 5% | J+90 post-lancement |
| Note App Store / Google Play | ≥ 4,2 | Après 50 avis |
| Incidents de perte de données | 0 | Permanent |
| Taux de complétion onboarding (jusqu'au 1er document indexé) | ≥ 70% | Mesuré en continu |

***

## 11. Hors scope explicite

Ces fonctionnalités ne seront pas développées pour le MVP. La discussion n'est pas à rouvrir avant validation des KPIs V1 :

| Feature | Raison |
|---|---|
| Résumé de documents | Coût API élevé, usage marginal non validé |
| Traduction | Use case secondaire non validé |
| Tags via LLM | Tags prédéfinis suffisants, LLM ajoute coût et latence |
| Achat in-app de stockage | Infrastructure billing complexe pour un gain non validé |
| Collaboration / espace partagé | Feature B2B, hors cible MVP |
| Signature électronique | Périmètre réglementaire différent (eIDAS) |
| Notifications d'expiration de contrats | Dépendant de la fiabilité OCR, non validée |
| Version web | Mobile-first assumé et non négociable pour le MVP |

***

## 12. Critères d'acceptation globaux du MVP

Le MVP est considéré comme livrable et prêt au lancement uniquement si **tous** les critères suivants sont satisfaits :

- [ ] **CA1** — Un utilisateur peut capturer un document physique par scan et le retrouver via une recherche dans son contenu en moins de 10 secondes, sans connexion internet
- [ ] **CA2** — Un utilisateur peut importer un PDF depuis une app tierce (Gmail, WhatsApp, Files) via la share sheet iOS et Android, et le document est indexé dans les 10 secondes
- [ ] **CA3** — La recherche full-text retourne des résultats en moins de 1 seconde depuis l'index local sur un device Android ≤ 3 Go de RAM
- [ ] **CA4** — Un utilisateur peut générer, envoyer et révoquer un lien de partage à durée limitée — le destinataire accède au document sans compte
- [ ] **CA5** — Tous les documents restent consultables et recherchables en mode avion
- [ ] **CA6** — Aucun document n'est perdu ou corrompu lors d'une interruption de sync (testé sur 100 cycles de sync partielle)
- [ ] **CA7** — Le chiffrement local est actif et vérifié via plugin natif — aucune donnée en clair dans le stockage local
- [ ] **CA8** — L'application est fonctionnelle sur iOS 16+ et Android 11+, testée sur au moins un device Android d'entrée de gamme
- [ ] **CA9** — Le tier Free est limité à 30 documents — le passage au tier Pro débloque les documents illimités et le backup cloud
- [ ] **CA10** — Le taux de précision OCR sur le corpus de test terrain est ≥ 85% avant publication