# UX Flow MVP — Gestionnaire Documentaire Intelligent

> Version : 1.1 · Public : Freelances & Indépendants · Base : Domain Blueprint v1.0 + Module Blueprint v1.1

***

## 1. Personas Synthétiques

### Persona A — Sophie, Freelance Administratif Débordée

**Contexte :**
Sophie est assistante indépendante, 38 ans. Elle gère les dossiers de 6 clients simultanément. Elle reçoit des dizaines de documents par semaine — factures, contrats, relevés — qu'elle classe manuellement dans des dossiers sur son bureau. Elle travaille depuis un Mac, parfois son iPad.

**Problèmes :**
- Passe trop de temps à nommer et classer ses fichiers
- Ne retrouve jamais un document rapidement lors d'un appel client
- A peur de perdre des informations importantes noyées dans un PDF
- Se méfie des outils "trop compliqués" qui lui font perdre le contrôle

**Attentes UX :**
- Uploader un fichier en 2 clics et ne plus y penser
- Retrouver n'importe quel document en tapant quelques mots
- Comprendre immédiatement ce que l'outil a détecté sans avoir à le configurer
- Pouvoir corriger une erreur facilement sans "casser" quelque chose

***

### Persona B — Marc, Freelance Créatif Peu Structuré

**Contexte :**
Marc est graphiste freelance, 29 ans. Il travaille en nomade. Il accumule des PDFs par email sans jamais les classer. Sa boîte mail est son système de classement. Il utilise principalement son téléphone et son laptop selon les contextes.

**Problèmes :**
- N'a aucune structure de classement → tout est dans "Documents" ou dans le téléchargement
- Oublie d'avoir reçu des documents importants
- Perd du temps au moment des déclarations ou de la facturation
- Abandonne les outils dès qu'il faut configurer quelque chose

**Attentes UX :**
- Zéro configuration initiale obligatoire
- L'outil fait le travail à sa place
- Interface épurée, sans tableaux de bord surchargés
- Feedback immédiat rassurant ("c'est bien enregistré")

***

## 2. User Journey Globale MVP

### Acte 1 — Première utilisation : créer son espace

Marc s'inscrit. L'interface lui propose immédiatement de nommer son espace de travail avec deux suggestions : "Pro" et "Perso". Il choisit "Pro" en un clic. Aucun formulaire de configuration, pas d'écran de bienvenue surchargé. Il est directement dans son espace vide, avec un seul message d'invitation à déposer son premier document.

### Acte 2 — Uploader son premier document

Marc glisse-dépose une facture PDF sur l'écran. La barre de progression avance — c'est le seul moment où l'upload est visible. Une fois l'envoi confirmé, il est automatiquement redirigé vers le Dashboard. Son document y apparaît immédiatement dans la liste avec le statut *"Analyse en cours…"* et une animation légère. Marc peut fermer l'onglet ou continuer à naviguer. Il n'est pas bloqué et ne reverra jamais l'étape d'envoi comme un état du document.

### Acte 3 — Revenir plus tard, voir le résultat

Sophie revient sur l'application dix minutes plus tard. Son document s'affiche maintenant avec une pastille verte *"Prêt"*. Elle voit d'un coup d'œil que l'outil a identifié : *Facture · Adobe Systems · 1 250 € · 12 janv. 2025*. Des tags ont été suggérés : `facture`, `logiciel`, `adobe`. Elle n'a rien eu à saisir.

### Acte 4 — Consulter et affiner

Sophie ouvre le document. Elle voit le contenu extrait, les informations clés mises en évidence dans la zone *"Détecté automatiquement"*. Un des tags suggérés ne lui convient pas — elle clique sur *"Ajouter ce tag à mes tags"* pour l'importer dans sa zone personnelle, puis le renomme. La détection originale reste intacte dans sa zone. En 5 secondes, son classement est personnalisé sans rien effacer.

### Acte 5 — Retrouver un document ultérieurement

Trois semaines plus tard, en pleine réunion, Marc a besoin de retrouver "la facture Adobe de janvier". Il tape "adobe facture" dans la barre de recherche. Le document apparaît immédiatement. Il n'a jamais eu à le classer.

***

## 3. Écrans Principaux

### 3.1 Dashboard Workspace

**Objectif :** Vue d'ensemble de l'espace de travail. Point d'entrée de toutes les actions, y compris le suivi de l'analyse en cours.

**Éléments visibles :**
- Nom du Workspace (cliquable pour renommer)
- Liste des documents avec : titre, type détecté, date, statut visuel, tags
- Les documents en cours d'analyse sont visibles dans la liste avec leur indicateur d'état animé — le Dashboard est le seul lieu de suivi du traitement
- Barre de recherche persistante en haut
- Bouton d'upload proéminent ("Ajouter un document")
- Sélecteur de Workspace si plusieurs espaces existent

**Actions possibles :**
- Uploader un document
- Ouvrir un document
- Changer de Workspace
- Lancer une recherche
- Créer un nouveau Workspace
- Actualiser la liste (bouton discret, complément du polling silencieux)

**État vide :**
> *"Votre espace est prêt. Déposez votre premier document ici ou cliquez sur "Ajouter"."*
> Illustration minimaliste, CTA unique.

**État loading (liste qui charge) :**
Squelettes de lignes animées, discrets. Pas de spinner global.

**État erreur (impossible de charger la liste) :**
> *"Impossible de charger vos documents. Vérifiez votre connexion et réessayez."*
> Bouton "Réessayer".

> **Note de conception :** Le Dashboard est le hub de suivi asynchrone. Il n'existe pas d'écran dédié à l'attente du traitement. Un document en cours d'analyse est visible dans la liste principale du Dashboard, exactement comme un document prêt — seul son statut visuel diffère.

***

### 3.2 Upload Flow

**Objectif :** Permettre l'ajout d'un document avec un minimum de friction. La progression de l'envoi est une expérience frontend transitoire — elle ne crée pas d'état documentaire visible.

**Éléments visibles :**
- Zone de dépôt glisser-déposer (large, centrale)
- Bouton "Parcourir mes fichiers" en fallback
- Formats acceptés indiqués simplement : *"PDF ou image (JPG, PNG)"*
- Limite de taille affichée discrètement

**Actions possibles :**
- Déposer un fichier
- Parcourir les fichiers locaux

**État loading (upload en cours) :**
Barre de progression linéaire avec message : *"Envoi en cours…"*
Le fichier est identifiable (nom + icône).

> ⚠️ **Règle critique :** Pendant la progression de l'envoi, le document n'existe pas encore dans le système et n'est pas visible dans le Dashboard. La barre de progression appartient exclusivement à l'interface d'upload. Ce n'est pas un état du document — c'est un état de l'interface.

**État success :**
Message immédiat : *"Document reçu ! Analyse en cours."*
Redirection automatique vers le Dashboard où le document apparaît pour la première fois dans la liste, avec statut *"Analyse en cours…"*. C'est l'apparition dans la liste qui confirme la réception — pas la barre de progression.

**État erreur (format non supporté) :**
> *"Ce format n'est pas encore supporté. Veuillez utiliser un PDF ou une image."*

**État erreur (fichier trop lourd) :**
> *"Ce fichier est trop volumineux. La taille maximale est de X Mo."*

**État erreur (échec réseau) :**
> *"L'envoi a échoué. Vérifiez votre connexion et réessayez."*
> Bouton "Réessayer" conservant le fichier sélectionné.

***

### 3.3 Document Detail View

**Objectif :** Consultation et édition d'un document enrichi.

**Éléments visibles :**
- Miniature / aperçu du document
- Titre (éditable en clic direct — inline edit)
- **Section "Ce que nous avons détecté"** — fond légèrement coloré, icône discrète, **lecture seule** :
    - Type de document : *Facture*
    - Informations clés extraites : date, montant, fournisseur
    - Tags suggérés (pastilles avec icône IA discrète)
    - Lien contextuel par tag : *"Ajouter à mes tags"*
- **Section "Vos informations"** — fond blanc neutre, entièrement éditable :
    - Tags personnels (pastilles d'une couleur distincte, sans icône IA)
    - Notes libres
- Texte extrait (collapsible — *"Voir le contenu complet"*)
- Bouton "Modifier"
- Date d'upload, type de fichier, taille (discrets, en bas)

> **Règle de cohérence UX :** Les deux sections ne se mélangent jamais. Ce que l'outil a détecté et ce que l'utilisateur a saisi occupent toujours des zones visuellement séparées. Les données détectées automatiquement ne sont jamais directement écrasables — elles sont consultables en permanence, y compris après une correction manuelle.

**Actions possibles :**
- Modifier le titre (inline)
- Importer un tag suggéré dans ses tags personnels
- Ajouter / supprimer des tags personnels
- Ajouter une note
- Télécharger le fichier original
- Archiver le document
- Retour au Dashboard

***

### 3.4 Search Results View

**Objectif :** Retrouver un document rapidement.

**Éléments visibles :**
- Barre de recherche avec la requête en cours
- Filtres visibles : Type de document, Tags, Workspace
- Nombre de résultats : *"3 documents trouvés"*
- Liste de résultats : titre, type, extrait de contexte avec le terme recherché mis en surbrillance, date

**États vides :**
> *"Aucun document ne correspond à votre recherche."*
> Suggestions : *"Essayez avec moins de mots, ou vérifiez l'orthographe."*

**État erreur :**
> *"La recherche est temporairement indisponible. Réessayez dans quelques instants."*

***

### 3.5 Édition des Métadonnées

**Objectif :** Permettre la correction et la personnalisation sans surcharger l'interface, tout en préservant les données détectées automatiquement.

**Éléments visibles :**
- Formulaire simple : Titre, Notes, Tags personnels
- **Section "Détections automatiques"** — distincte visuellement, affichée en lecture seule dans le formulaire
    - Type détecté (avec lien *"Ce n'est pas le bon type ?"* pour surcharger sans écraser)
    - Entités extraites (date, montant, fournisseur) — consultables, non modifiables directement
- **Section "Vos informations"** — entièrement éditable
    - Tags personnels
    - Notes libres
    - Override de classification si déclenché
- Bouton "Enregistrer"
- Bouton "Annuler"

> **Règle fondamentale :** Toute correction manuelle de l'utilisateur crée une surcharge (`userOverride`) qui s'affiche en priorité. La détection originale reste conservée et consultable. Il n'y a pas de suppression de la donnée IA — seulement une préférence déclarée par l'utilisateur.

**Actions possibles :**
- Modifier le titre
- Ajouter / retirer des tags personnels
- Écrire ou modifier une note
- Corriger la classification (via sélecteur dédié, pas sur le champ IA)
- Enregistrer ou annuler

**État success (après sauvegarde) :**
Message toast discret : *"Modifications enregistrées."*

***

### 3.6 État FAILED + Retry

**Objectif :** Informer sans alarmer, donner le contrôle à l'utilisateur.

**Éléments visibles :**
- Icône d'alerte douce (pas de rouge agressif)
- Message : *"L'analyse de ce document n'a pas pu se terminer."*
- Explication courte : *"Cela peut arriver avec certains types de fichiers. Vous pouvez relancer l'analyse."*
- Bouton principal : "Relancer l'analyse"
- Lien secondaire : "Ignorer et conserver le document tel quel"
- Métadonnées partielles éventuellement disponibles (si extraction partielle avant échec)

**Comportement post-retry :**
Le document repasse en état *"Analyse en cours…"* dans le Dashboard. Si le retry échoue à nouveau, même message avec option supplémentaire : *"Besoin d'aide ? Contactez le support."*

***

## 4. États Document Visibles par l'Utilisateur

| Statut technique | Label utilisateur | Message contextuel | Actions disponibles | Blocages |
|---|---|---|---|---|
| `UPLOADED` | *Document reçu* | *"Votre document a été reçu et va être analysé."* | Retour au Dashboard | Pas de contenu accessible |
| `PROCESSING` | *Analyse en cours…* | *"Nous lisons votre document. Cela prend moins d'une minute."* | Retour au Dashboard, Actualiser | Pas de contenu accessible |
| `PARTIALLY_ENRICHED` | *Analyse en cours…* | Identique à PROCESSING — état intermédiaire masqué | Retour au Dashboard | Accès partiel masqué |
| `CLASSIFIED_ONLY` | *Prêt* | Traité comme `ENRICHED` visuellement | Toutes | Aucun |
| `ENRICHED` | *Prêt* | Document complet et consultable | Toutes | Aucun |
| `FAILED` | *Analyse incomplète* | *"L'analyse n'a pas pu se terminer. Relancez ou ignorez."* | Retry, Ignorer, Supprimer | Pas de contenu enrichi |
| `PENDING_RETRY` | *Nouvelle analyse en cours…* | Identique à PROCESSING | Retour au Dashboard | Pas de contenu accessible |
| `ARCHIVED` | *Archivé* | Document hors circulation active | Désarchiver, Supprimer | N'apparaît plus dans la liste principale |

> **Principe de masquage des états intermédiaires :** Les états `PARTIALLY_ENRICHED` et `CLASSIFIED_ONLY` sont consolidés visuellement. L'utilisateur ne voit jamais plus de trois états fonctionnels : *Analyse en cours*, *Prêt*, *Problème*. `ENRICHED` est l'unique état métier final positif — il se traduit par *"Prêt"* dans l'interface.

> **Règle sur la progression d'upload :** La progression de l'envoi (barre de chargement) est un état purement frontend. Elle n'est pas un statut documentaire. Un document n'apparaît dans la liste du Dashboard qu'une fois le stockage confirmé, correspondant à l'état `UPLOADED`. L'utilisateur ne voit jamais un document "en cours d'envoi" dans sa liste de documents.

***

## 5. Gestion de l'Asynchronisme (UX Critique)

### Le défi fondamental

L'utilisateur uploade un fichier et s'attend à un résultat immédiat. Le traitement prend entre 10 secondes et 2 minutes. La frustration naît du silence — pas nécessairement de l'attente.

### Stratégie UX en 4 temps

**Temps 1 — Accusé de réception immédiat (0 seconde)**
Dès que le fichier est envoyé et le stockage confirmé, afficher :
> *"Document reçu ! Nous l'analysons pour vous."*

L'utilisateur est redirigé vers le Dashboard. Son document y apparaît immédiatement dans la liste. L'anxiété disparaît parce que l'objet est visible et identifiable.

**Temps 2 — Présence rassurante dans la liste (continu)**
Dans le Dashboard, le document en cours d'analyse est affiché dans la liste principale — pas dans une file d'attente séparée, pas dans un onglet "en traitement". Il occupe la même place qu'un document prêt, avec une animation légère (pulsation douce sur la pastille de statut). L'utilisateur voit son document "exister" même s'il n'est pas encore prêt.

**Temps 3 — Polling silencieux (toutes les 5 secondes si Dashboard ouvert)**
Si l'utilisateur reste sur le Dashboard, la liste interroge silencieusement l'état des documents en cours. Quand un document passe à `ENRICHED`, sa pastille passe au vert avec une micro-animation discrète. Pas de rechargement de page, pas d'interruption de navigation.

**Temps 4 — Retour différé géré (si l'utilisateur revient plus tard)**
Si l'utilisateur ferme l'onglet et revient 10 minutes plus tard, ses documents `ENRICHED` s'affichent directement avec leur contenu enrichi au chargement du Dashboard. Aucun message alarmant type "votre session a expiré". Simple continuité.

### Ce qu'on évite absolument

- Aucun écran d'attente dédié entre l'upload et le Dashboard
- Aucun spinner global bloquant la page
- Aucun message "Veuillez patienter…" sans indication de durée
- Aucune notification push ou email en MVP (génère de la pression)
- Aucun écran de chargement entre le Dashboard et la liste

### Gestion du refresh manuel

Pour les utilisateurs qui veulent "s'assurer que ça avance" : un bouton discret *"Actualiser"* est disponible directement sur le Dashboard, à proximité de la liste. Pas de pull-to-refresh intrusif. Le polling automatique reste la voie principale — le bouton est une sécurité émotionnelle, pas le mécanisme central.

***

## 6. Recherche & Découverte

### Barre de recherche

- Persistante dans le header sur toutes les vues
- Placeholder : *"Rechercher un document, un montant, un fournisseur…"*
- Recherche déclenchée à la soumission (touche Entrée ou icône loupe) — pas de recherche live en MVP pour éviter la surcharge
- Scope par défaut : le Workspace actif

### Filtres

Disponibles sur la vue Résultats, sous la barre de recherche, sous forme de chips cliquables :
- **Type** : Facture · Contrat · Reçu · Autre
- **Tags** : liste des tags utilisés dans le Workspace
- **Date** : Ce mois · Les 3 derniers mois · Cette année

Filtres cumulables. Réinitialisation en un clic ("Effacer les filtres").

### Suggestions

En MVP : pas de suggestion d'autocomplétion (complexité inutile). À la place, afficher sous la barre de recherche vide les filtres rapides les plus utilisés : *"Voir toutes mes factures"*, *"Documents récents"*.

### Résultats

- Chaque résultat affiche : titre, type détecté, extrait avec le terme surligné, date
- Clic sur un résultat → Document Detail View
- Tri par défaut : pertinence, puis date décroissante

### Aucun résultat

> *"Aucun document ne correspond à « [requête] »."*
> Proposer : *"Essayez avec des mots différents"* + lien *"Voir tous mes documents"*

### Recherche avec Workspace vide

> *"Vous n'avez encore aucun document dans cet espace."*
> CTA : *"Ajouter votre premier document"*

***

## 7. Édition Manuelle & Override Intelligence

### Principe structurant : deux couches, jamais fusionnées

Le produit maintient en permanence deux couches de données distinctes sur chaque document :

- **Couche détection** : ce que le système a identifié automatiquement — immuable du point de vue de l'utilisateur, jamais écrasable directement
- **Couche utilisateur** : ce que l'utilisateur a saisi ou corrigé — prioritaire à l'affichage, mais sans effacer la couche sous-jacente

Ces deux couches coexistent. L'utilisateur peut toujours consulter ce que l'outil a détecté, même après l'avoir surchargé. Cette architecture de donnée se traduit par une architecture visuelle simple et constante dans toute l'interface.

### Distinction visuelle IA vs Humain

La règle visuelle est simple et constante : **deux zones, deux couleurs**.

- **Zone "Détecté automatiquement"** — fond légèrement coloré, icône discrète (ex : petite étoile ou baguette) — **lecture seule dans tous les contextes**. L'utilisateur ne peut pas modifier directement un champ de cette zone.
- **Zone "Vos informations"** — fond blanc neutre, pas d'icône spéciale — entièrement éditable, toujours vide par défaut jusqu'à action de l'utilisateur.

L'utilisateur comprend intuitivement : *ce que j'ai mis moi* vs *ce que l'outil a trouvé*. Cette distinction est maintenue dans la Document Detail View, dans l'écran d'édition, et dans les résultats de recherche.

### Modifier les tags

Dans la zone "Vos informations" :
- Chips de tags personnels avec croix pour supprimer
- Champ texte inline pour ajouter un tag : `+ Ajouter un tag`
- Validation à la touche Entrée ou virgule
- Pas de limite affichée, pas de validation complexe

Les `suggestedTags` de la zone "Détecté automatiquement" sont accompagnés d'un lien contextuel : *"Ajouter à mes tags"*. Ce clic copie le tag dans la zone "Vos informations" — il ne déplace pas le tag suggéré, il le duplique. Les deux coexistent. Le tag IA reste visible dans sa zone d'origine.

> **Règle absolue :** Supprimer un tag de la zone "Vos informations" ne supprime jamais le tag suggéré correspondant dans la zone "Détecté automatiquement". Les deux zones sont indépendantes.

### Corriger une classification

Dans la zone "Détecté automatiquement", le type de document (*Facture*, *Contrat*, etc.) est accompagné d'un lien discret : *"Ce n'est pas le bon type ?"*. Clic → menu déroulant avec les types disponibles. La sélection crée un `userOverride` dans les données — c'est le type choisi par l'utilisateur qui s'affiche en priorité dans toute l'interface.

La détection originale reste visible en dessous dans la zone IA, en gris : *"Détecté comme : Reçu"*. L'utilisateur voit ce que l'outil avait trouvé, et ce qu'il a décidé de corriger. La traçabilité est intacte.

> **Ce que cela garantit côté produit :** La donnée IA n'est jamais détruite. Elle reste exploitable pour des analyses futures, des corrections de modèle, ou un retour en arrière éventuel. L'override est une préférence déclarée, pas une réécriture.

### Éviter la confusion IA vs humain

- Ne jamais écrire *"L'IA pense que…"* → trop technique et instable dans la perception
- Écrire simplement *"Détecté automatiquement"* vs *"Vos informations"*
- Si le score de confiance est faible, afficher discrètement : *"Détection incertaine — vérifiez"* (sans exposer le score brut)
- Les informations de la zone utilisateur ont toujours le dessus visuellement — elles apparaissent en premier, plus grandes, plus contrastées

***

## 8. Gestion des Erreurs

### Principe directeur

**Toute erreur doit répondre à trois questions implicites de l'utilisateur :**
1. *Qu'est-ce qui s'est passé ?* → Message clair, non technique
2. *Est-ce ma faute ?* → Toujours déresponsabiliser l'utilisateur
3. *Que puis-je faire ?* → Action évidente proposée

***

### Upload échoue (réseau, timeout)

> *"Votre document n'a pas pu être envoyé. Cela arrive parfois avec une connexion instable."*
> **Action :** Bouton "Réessayer l'envoi" — conserve le fichier sélectionné, pas besoin de le re-sélectionner.

***

### Format non supporté

> *"Ce type de fichier n'est pas encore supporté. Utilisez un PDF ou une image (JPG, PNG)."*
> Pas de bouton de retry — le problème est côté utilisateur. Ton informatif, pas alarmant.

***

### OCR échoue (image illisible)

Le document atteint l'état `FAILED`. L'utilisateur voit le document dans le Dashboard avec le label *"Analyse incomplète"*.
> *"Nous n'avons pas pu lire le contenu de ce document. L'image est peut-être trop floue ou de faible qualité."*
> **Actions :** "Relancer l'analyse" · "Ajouter les informations manuellement" · "Ignorer"

***

### Classification échoue

Le document atteint l'état `ENRICHED` mais sans type détecté — c'est un cas partiel, pas un échec total. Pas de statut `FAILED`.
> Afficher simplement dans la zone "Détecté automatiquement" : *"Type non détecté"* avec lien *"Choisir un type"* → redirige vers l'édition.
> Pas de message d'erreur agressif. Le reste des informations extraites reste affiché normalement.

***

### Document bloqué en FAILED

> *"L'analyse de ce document n'a pas pu se terminer. Cela peut arriver avec certains fichiers complexes."*
> **Actions :**
> - Bouton principal : *"Relancer l'analyse"*
> - Lien secondaire : *"Conserver sans analyse"* (le document reste accessible, sans métadonnées enrichies)

Après deux échecs consécutifs :
> *"L'analyse ne parvient pas à s'effectuer sur ce document. Vous pouvez le conserver et y ajouter vos informations manuellement."*

***

### Retry

- Le bouton "Relancer l'analyse" fait basculer le document en `PENDING_RETRY`, affiché comme *"Nouvelle analyse en cours…"* dans le Dashboard
- Feedback immédiat : *"Nouvelle analyse lancée."* (toast)
- Le polling sur le Dashboard prend le relais — aucun écran d'attente dédié
- Si le retry réussit : le document passe à `ENRICHED`, label *"Prêt"*, transition visuelle douce dans la liste
- Si le retry échoue à nouveau : même message d'erreur + option support

***

## 9. Principes UX Fondamentaux du Produit

### 5 Règles Non Négociables

**Règle 1 — Jamais de page blanche sans invitation.**
Tout état vide contient un message humain et une action suggérée. L'utilisateur ne se retrouve jamais face au vide sans savoir quoi faire.

**Règle 2 — L'upload ne bloque jamais l'utilisateur.**
Dès que le fichier est reçu et confirmé, l'utilisateur est redirigé vers le Dashboard. Le traitement est asynchrone et invisible. Il peut partir, revenir, naviguer. L'application travaille pour lui en arrière-plan. Il n'existe pas d'écran d'attente dédié.

**Règle 3 — Aucun jargon technique ne passe la frontière UI.**
Les mots `OCR`, `MIME`, `ENRICHED`, `processing status`, `confidence score`, `entity extraction` n'apparaissent jamais dans l'interface. Chaque concept technique a son équivalent humain validé.

**Règle 4 — Les erreurs sont des incidents, pas des fautes.**
Le ton est toujours du côté de l'utilisateur. L'outil s'excuse, propose une solution, ne juge pas. Aucun message d'erreur en rouge agressif sans action associée.

**Règle 5 — La distinction IA / utilisateur est toujours visible et la donnée IA n'est jamais détruite.**
Ce que l'outil a détecté et ce que l'utilisateur a saisi ne se mélangent jamais dans la même zone visuelle. Les corrections de l'utilisateur surchargent les détections sans les effacer. L'utilisateur garde le sentiment de contrôle, le système garde la traçabilité.

***

### Ton Émotionnel du Produit

Le produit se comporte comme **un assistant discret et compétent** — jamais intrusif, jamais bavard, jamais condescendant.

- **Rassurant** : chaque action reçoit un accusé de réception
- **Sobre** : pas d'enthousiasme excessif (*"Super ! Votre document est prêt 🎉"* → à proscrire)
- **Direct** : les messages vont à l'essentiel, sans métaphores
- **Humble** : quand l'IA se trompe, le produit le reconnaît sans drama

***

### Frictions Volontairement Éliminées

- ✗ Pas d'écran d'onboarding obligatoire avec 5 étapes
- ✗ Pas de confirmation d'email avant de pouvoir uploader
- ✗ Pas de formulaire de métadonnées obligatoire à l'upload
- ✗ Pas de modal de confirmation pour les actions réversibles (archivage)
- ✗ Pas de tutorial interactif imposé à la première connexion
- ✗ Pas d'écran d'attente bloquant entre l'upload et le retour au Dashboard

***

### Complexités Volontairement Masquées

- Les états intermédiaires `PARTIALLY_ENRICHED` et `CLASSIFIED_ONLY` → tous affichés *"Analyse en cours"* ou *"Prêt"* selon leur avancement réel
- `ENRICHED` est l'état métier final positif — il ne s'appelle jamais "ENRICHED" dans l'interface, seulement *"Prêt"*
- La progression d'envoi (upload progress) → état frontend uniquement, jamais exposé comme statut documentaire
- Le score de confiance brut → traduit en *"Détection incertaine"* uniquement si inférieur à un seuil
- La méthode d'extraction (`NATIVE_PDF` vs `OCR`) → jamais exposée, sauf dans un éventuel panneau "Détails techniques" optionnel en V2
- La distinction `suggestedTags` vs `userTags` en base → traduite en deux zones visuelles simples, sans terminologie
- Les `ProcessingEvent` internes → jamais visibles. Un lien *"Voir l'historique"* pourrait apparaître en V2 pour les utilisateurs avancés
- L'architecture de polling → silencieuse et transparente, jamais évoquée dans l'interface

***

> **Ce UX Flow constitue la référence produit pour l'API Contract et le développement frontend. Les états documentaires exposés par l'API doivent correspondre aux états visibles définis dans ce document. `ENRICHED`, `FAILED` et `ARCHIVED` sont les seuls états métier finaux reconnus. `READY` est une formulation UX autorisée, jamais un statut API. Toute déviation côté backend qui casse un état UX défini ici devra faire l'objet d'une décision produit explicite.**
