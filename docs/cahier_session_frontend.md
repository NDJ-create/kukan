# Kukan — cahier de la session frontend (document autonome, 2026-10-28, mis à jour le 2026-10-29)

Ce document est le **seul fichier à lire** pour une session Claude Code neuve, sans mémoire, qui travaille sur le
frontend de Kukan depuis Termux. Il reprend le cahier des charges du 13 octobre
(`docs/cahier_des_charges_frontend.md`), en corrige les parties périmées (état du moteur, API, tâches) et ajoute :
- le design visuel et l'UX ;
- les types de passage, dont la rotation et sa compression ;
- le test « déformer dans Kukan contre Krita » ;
- la sortie de derrière un contour (correction « sortir », § 4.14) ;
- la résolution des sorties : WebP animé sans perte, largeurs de rendu, GIF (§ 3.6) ;
- le principe « déclarer le minimum » : l'animateur déclare ce que le code ne peut pas deviner, avec un minimum
  de gestes ; le code propose, l'animateur confirme (§ 9.1, règle 9) ;
- l'ordre de travail, avec ce qu'il faut demander à l'utilisateur à chaque étape.

**Convention.** Ce document est écrit depuis le dépôt du **moteur** (`NDJ-create/kukan-inbetween`). Le dépôt du
**frontend** (`NDJ-create/kukan`, copie locale `~/betwixt-landing` sur Termux) n'a **pas été lu**. Tout ce qui le
concerne est marqué **[À VÉRIFIER — dépôt frontend]** : la session frontend le vérifie dans le code avant de s'y fier,
et corrige ce document si besoin.

**Chemins.** Les chemins en `~/…` (planches, archives, dessins) sont sur la **machine du moteur** (Droplet), pas sur
Termux, sauf `~/betwixt-landing`. Si un de ces fichiers est utile, demander à l'utilisateur de le copier ; les
chemins `docs/…` et `tools/…` sont dans le dépôt du moteur.

**Source de vérité en cas de conflit.** L'état du moteur au § 2.2 (2026-10-28) prime sur toute valeur datée des
sections reprises du 13 octobre (coûts, nombres de tests, « non déployé »).

## Plan
0. Règles de travail
1. Le produit et le vocabulaire
2. État réel : architecture, moteur, fiabilité, frontend existant
3. Design et UX : design visuel, projets, calculs, partage, éditeur, export, architecture du frontend
4. Méthodes de dessin et import (SVG, poses tracées, identifiants, Krita, règles de dessin, 16:9, décors)
5. Animation et types de passage (rythme, arcs, rotation, compression, traits cachés, B redessinée)
6. Moteur et API (formats, journal, contrat, calques, routes Next.js → Modal)
7. Supabase (tables, stockage, RLS, partage et organisations)
8. Plans, quotas, coûts GPU, accord en deux temps, marges, vitesse
9. Règles produit, décisions prises, choix en attente
10. Ce qui reste à faire : ordre de travail, tâches du moteur, test contre Krita, points ouverts
11. Données d'exemple, fichiers de parité, commandes

---

## 0. Règles de travail (obligatoires)
- **Langue** : répondre en français. L'utilisateur (Momo) travaille sur un téléphone Android (Termux). Explications
  courtes, une étape à la fois. Les résultats visuels sont montrés sur **une seule planche** (plusieurs images
  assemblées), pas image par image.
- **Rapports** : courts. À la fin de chaque rapport, rappeler les points ouverts (§ 10).
- **GPU** : jamais d'appel GPU (Modal) sans l'accord explicite de l'utilisateur. Toujours donner avant l'estimation
  de durée et de coût, et après le coût réel. Aucune relance automatique.
- **Déploiement** (`modal deploy`, déploiement du site) : seulement avec l'accord de l'utilisateur, **après** une
  suite de tests verte, avec arrêt au premier échec. Ne jamais déployer à travers un tube (`| tail`…) qui cacherait
  le code de sortie.
- **Supabase** : ne **rien créer** (tables, fonctions, buckets, politiques) sans l'accord de l'utilisateur. La
  conception est au § 7 ; elle se valide avant de se créer.
- **Secrets** : jamais de jeton, de clé ou de mot de passe dans un fichier suivi par Git (`.env.local` hors Git). Ne
  jamais afficher un secret dans un rapport. La clé de service Supabase et le jeton Modal restent **côté serveur**.
- **Comportement existant** : n'activer aucune option par défaut et ne changer aucun comportement visible sans
  l'avoir montré d'abord à l'utilisateur.
- **Mesure** : toujours comparer aux dessins d'origine de l'artiste, jamais à notre propre vectorisation. Le
  jugement final est **l'œil de l'artiste** : un gain que l'artiste ne voit pas est un échec, quel que soit le score.
- **Commits** : `git -c user.name="NDJ-create" -c user.email="saisrien2@gmail.com" commit`. Message terminé par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Ne jamais pousser** : l'utilisateur le fait.
- **Attentes** : toujours bornées (délai maximal donné), jamais de boucle d'attente sans fin.
- **Fichiers de l'utilisateur** : ne jamais modifier ses originaux (dessins, GIF validés) ; travailler sur des copies.
- **Termux** : pas de Python du moteur (numpy, Pillow, `~/kukan-pylib`) sur le téléphone. Le frontend se développe
  contre l'API déployée ou contre les données d'exemple du § 11.

## 1. Le produit et le vocabulaire
Kukan est un SaaS B2B d'**intervalles automatiques** (inbetweening) vectoriels pour l'animation 2D, donghua compris.
- L'artiste dessine des **poses clés** : images PNG, plus un SVG de la première pose.
- Kukan produit les **images intermédiaires**, en traits vectoriels éditables, rendus avec l'épaisseur et le ton du
  dessin d'origine.
- Le moteur d'IA est **LayerInbetween** (MarkMoHR, GPL-3.0). Il tourne sur un GPU Modal (A100). Tout le reste est
  calculé sur CPU par notre paquet Python `kukan` : préparation, corrections de fidélité, interpolation, rendu,
  exports, contrôles.

### 1.1 Vocabulaire
| Terme | Sens |
|---|---|
| pose (clé) | dessin de l'artiste (A, B, …) ; une **pose intermédiaire** est une pose dessinée entre deux clés |
| passage | calcul entre deux poses voisines (A → B), par calque |
| image | une des images produites (17 par passage par défaut : 0 = A, 16 = B) |
| trait / chaîne | courbe de Bézier cubique avec un **identifiant stable** : `calque/tNNNN` (trait du moteur, dans l'ordre des groupes du moteur) ou `calque/a<empreinte>` (trait ajouté). Une chaîne a une position à chaque pose |
| état d'un trait à une pose | `normal`, `ne` (né par la pousse), `disparu`, `cache`, `edite`, `absent` |
| pousse | un trait présent seulement en B naît d'un point de A et grandit (fondu de forme) |
| disparition | un trait sans encre en B s'écrase et disparaît |
| bloc rigide | groupe de traits qui ne fait que se translater entre A et B : calculé exactement, sans le moteur |
| calque | zone découpée et animée à part (`reste` = tout le dessin quand il n'y a pas de découpage) |
| table lumineuse / pelure d'oignon | images voisines affichées en transparence (rouge avant, vert après) |
| planche de réparation | pose de l'artiste en gris, rendu par-dessus : noir = juste, rouge = en trop, orange = manquant |
| aperçu / reprise | travail arrêté après les contrôles (`apercu`), puis continué avec des corrections (`reprise_de`), sans GPU |
| rejeu | passage déjà calculé, retrouvé dans les archives par l'empreinte de ses entrées : 0 $ |

**Ajouts (2026-10-28)**
| Terme | Sens |
|---|---|
| poses tracées | l'artiste fournit un SVG **pour chaque pose** (pas seulement la première) ; préréglage `poses_tracees` (§ 4.4) |
| identifiant stable | `<calque>/s-<pose>-<NNN>` : identifiant d'un trait de l'artiste gardé sur toute la chaîne de poses (§ 4.5) ; c'est lui que l'éditeur montre et que les corrections visent |
| type de passage | choix de l'animateur pour chaque passage : `rotation`, `deplacement`, `deformation` ou rien (§ 5.2) |
| passage entier | passage refait depuis les SVG entiers de l'artiste (pas depuis la sortie du passage d'avant) |
| morceau / portion | partie d'un trait coupée temporairement dans un passage pour suivre la découpe de l'autre pose |
| scanner | `tools/scanner_gif.py` : note de défauts d'un rendu (plus bas = mieux ; défauts « forts » comptés à part). Indicatif : l'œil de l'artiste décide |
| méthode (c) | pose B obtenue en **déformant** la pose A (mêmes traits, mêmes identifiants) ; appariement par identifiant, 0 $ (§ 4.7) |
| compression | dans un passage « rotation », un élément qui disparaît (œil éloigné) se plaque sur ce qui le remplace (§ 5.3) |

## 2. État réel (2026-10-28)

### 2.1 Architecture
```
Navigateur (Next.js, onglets = projets)
   │  HTTPS (auth Supabase)                         ▲ Supabase Realtime (travaux, travail_evenements)
   ▼                                                │
Route handlers Next.js ──▶ Supabase (Postgres + Storage + Auth + Realtime) ◀── orchestrateur (à brancher : M10)
   │                                                                              ▲
   └──▶ Modal (application « kukan-inbetween ») ────────────────────────────────┘
          CPU : kukan_job (travail complet), kukan_verifier_svg, kukan_editer, kukan_aimant,
                kukan_rerender (À CRÉER : M11)
          GPU : predict_from_svg_debug, predict_genk_debug (V2-Large) ; application « kukan-depth-pro » :
                *_v2s (V2-Small) — appelés par kukan_job SEULEMENT
```
- Le frontend **n'appelle jamais Modal directement**. Il passe par les route handlers, qui vérifient l'utilisateur,
  son plan et ses quotas, puis appellent Modal avec un jeton gardé côté serveur.
- Aujourd'hui, **rien ne relie Modal à Supabase** : `kukan_job` renvoie un ZIP (octets) à l'appelant. Le branchement
  (avancement écrit dans Supabase, artefacts dans Storage, annulation) est la tâche M10 (§ 6.9).
- Lancer un travail aujourd'hui (Python, côté serveur) :
  `modal.Function.from_name("kukan-inbetween", "kukan_job").spawn(options, fichiers, plafonds)`, avec
  `fichiers = {nom: octets}` et des options qui renvoient à `inputs/<nom>`. Depuis Next.js : SDK JavaScript de Modal
  (tâche M9, jamais essayé, § 6.8).

### 2.2 Moteur : ce qui est déployé, ce qui ne l'est pas (source de vérité)
**Dépôt moteur** : `NDJ-create/kukan-inbetween`, branche de travail `inversion-pousse` (poussée par l'utilisateur
jusqu'à `c70770d`, 2026-10-29). Suite de tests : **347 passés, 5 sautés** (2026-10-29, ≈ 1 h 16).

**Déployé sur Modal** (dernier déploiement de `kukan-inbetween` : version 18 = commit `f318073`, 2026-10-16) :
| Fonction | Rôle | Remarques |
|---|---|---|
| `kukan_job(options, fichiers, plafonds, jusqu_a=None, accord=None)` | travail complet (CPU, 2 vCPU, 8 Go, 1 800 s) | accord GPU en deux temps (sans `accord` : estimation seule, statut `attente_accord_gpu`, 0 $) ; archive persistante (volume `kukan-archives` : un passage déjà calculé n'est jamais repayé) ; registre des dépenses `kukan-depenses` ; limites bornées (`options.borner_limites`) ; 2 travaux à la fois (`PARALLELE_TRAVAUX`) |
| `kukan_verifier_svg(svg, image, apercu=True)` | vérifier un SVG d'artiste (quelques s, 0 $) | renvoie aussi `couverture_trace` et l'alerte `SVG_TRACE_INCOMPLET` |
| `kukan_editer(doc_base, journal, renvoyer_document=False)` | rejouer et valider un journal d'édition | |
| `kukan_aimant(doc, pose, image, trait=None, bloc=None, portee=8)` | proposition de recalage sur l'encre | rien n'est enregistré |
| `predict_from_svg_debug`, `predict_genk_debug` | moteur GPU (A100 80 Go, 900 s, `retries=0`, 2 à la fois, 128 Go de mémoire) | appelés par `kukan_job` seulement |
| application `kukan-depth-pro` : `predict_from_svg_debug_v2s`, `predict_genk_debug_v2s` | moteur avec la profondeur V2-Small (production, licence Apache-2.0) | déployée le 2026-10-13, 2 à la fois |

**PAS déployé** : 42 commits depuis `f318073` (au 2026-10-29). Ils contiennent :
- passages entiers, blocs main + gobelet, appariement par la forme dans un bloc, rattachement des débris ;
- préréglage `poses_tracees` (§ 4.4), identifiant stable (§ 4.5), sécurité des entrées non fiables (§ 4.6) ;
- arcs à travers les poses, rythme continu (§ 5.1) ;
- appariement par identifiant, méthode (c) (§ 4.7) ;
- type de passage « rotation », alignement qui garde le cadrage en rotation, boucles fermées dans `relier`,
  disparitions de rotation (continuité + compression, § 5.3) ;
- outils : scanner de défauts, non-régression de la rotation ;
- sorties : WebP animé sans perte, `sorties.resolution`, `sorties.gif.largeur` (§ 3.6) ;
- correction « sortir » (élément qui sort de derrière un contour, § 4.14) et `inside_mask` calculé dans la boîte
  des traits (même masque, 33 s → < 1 s sur une toile de 1672 px).

**Conséquence pour le frontend tant que le redéploiement (étape E0, § 10.1) n'est pas fait** : Modal fait tourner le
code du 16 octobre. Aucune de ces fonctions n'est appelable depuis le site, l'identifiant stable n'existe pas dans
les documents renvoyés, et les entrées non fiables (SVG piégés, images géantes) ne sont pas filtrées : **pas de bêta
ouverte** avant E0.

**N'existe pas encore** (ni en local ni sur Modal) :
- `kukan_rerender` (re-rendu sur Modal après édition, M11) et le lien Modal ↔ Supabase (M10) ;
- l'appel depuis Next.js (M9) ;
- la détection de la méthode de dessin (événement `methode_dessin`, § 4.2) ;
- `annuler_correction_auto` (annuler une correction automatique pour un trait) ;
- la ligne guide (squash and stretch, § 3.8) ;
- la table de correspondance éditable entre poses (§ 4.9) et l'alerte de structure (contact nouveau entre deux
  éléments, trait réuni à un autre : points 21-22 du § 10.4).

**Coûts et plafonds (2026-10-28)**
- Estimation d'un passage GPU : **250 s + 0,1 s par segment**, marge **40 %** (`kukan/blocs.py`). Prix réel
  **0,000978 $/s** (GPU 0,000694 + mémoire 0,000284). Passage médian ≈ 270 s ≈ **0,26 $**.
- Plafonds du code Modal : `PLAFOND_JOUR_DOLLARS` = `PLAFOND_MOIS_DOLLARS` = **15 $** (valeur de test).
  Bornes de sécurité : 1 $ par appel, 5 $ par génération, 900 s par appel GPU (§ 8.1).
- Budget Modal de l'utilisateur : plafond total **25 $** ; usage ≈ **15,25 $** au 2026-10-27 (15,07 $ au tableau de
  bord le 2026-10-26, plus un appel de 0,18 $). Le registre `kukan-depenses` est **partiel** (il ne connaît que les
  appels passés par `kukan_job`).

**Qualité validée sur nos cas** (image d'arrivée contre la pose de l'artiste, retrouvé à 1 px) : § 2.3. Depuis le
13 octobre se sont ajoutés :
- le **jus** (5 poses tracées, main + gobelet, 4 passages) : rendu présentable, note du scanner 2 887 (0 défaut fort) ;
- la **rotation de tête dessinée à la main** (face → ≈ 22° → 45° → ≈ 22°, passages A → B, B → C, C → D) :
  présentable, défauts connus listés au § 5.3.

### 2.3 Qualité sur nos cas réels (état du 2026-10-13)

| Cas | Moteur seul | Avec la chaîne Kukan | Verdict | Cause des échecs |
|---|---|---|---|---|
| armure (bras qui s'écartent) | 93,1 % | 98,2 → 98,9 % (blocs rigides) | réussi | le moteur se trompait sur des parties immobiles (bottes jusqu'à 35 px) et confondait les doigts ; corrigé par le calcul exact |
| cyb (poings, manches) | — | 95,2 → 98,4 % | réussi | un trait qui traîne, pointes de cheveux émoussées par notre recalage (corrigés par options) |
| combat (B redessiné) | 84,1 % | 90,6-90,7 % | **limite** | pose B **redessinée librement** (bas de veste refait) : 22 % seulement de traits rigides ; mèches grises poussées |
| donghua : yeux, bouche | — | 97-98 % (≥ 95 % visé) | réussi | il a fallu recadrer et agrandir chaque œil (×5,12) |
| oreilles (M8, **images générées par IA**) | — | 97 / 99 % | réussi | contour de tête faux de 20 px (corrigé par le recalage par morceaux) |
| démo officielle 10 | — | 91,3 % | réussi de justesse | grand mouvement, trait épais |
| visage F1 → F2 (redessiné) | — | 77,7 → 87,2 % | **échec** | redessin libre (≈ 5 points), trait fin vectorisé trop petit (≈ 8,5 points), densité des traits |
| rotation de la tête 1 → 4 (**images générées par IA**) | — | 90-94 % | limite | rotation de 17-20° par passage ; traits redessinés différemment à chaque pose : score probablement pessimiste |
| rotation 4 → 5, profil → trois-quarts (**images générées par IA**) | — | 89 % ; GenK visage 84 % puis 72 % | **échec** | le moteur ne fait pas **naître** un visage absent de la pose de départ (règle produit) ; chiffres probablement pessimistes |

Bilan : **7 cas sur 11 au-dessus de 90 %**, tous de « mouvement modéré entre deux poses dessinées de la même façon ».
Les échecs viennent toujours de trois causes :
- pose B **redessinée** au lieu d'être déplacée ;
- **grande rotation** (au-delà de 20-25°) ;
- élément qui **apparaît** sans exister dans une pose clé.

Les échecs sont **signalés** (alerte < 90 %, carte de confiance, gabarit de pose manquante) : ce ne sont pas des
échecs silencieux.

**Réserve sur les rotations (2026-10-13)** : les poses de rotation des missions 8, 9 et 12 (`oreilles_ref` / `_mid` /
`_tar`, `rotation_1` à `rotation_4`, `rotation_4b`, `Remplacement5`, `pose_3b`) sont **toutes des images générées par
une IA** (confirmé par l'utilisateur). Leurs traits sont redessinés
différemment à chaque pose (épaules et cou des poses 1-4 : 81 à 95 % seulement à 1 px ; 3b : trait 30 % plus fin).
Les scores des missions 9 et 12, dont le visage de profil à 84 % et 72 %, mélangent donc la limite du moteur et le
redessin : ils sont **probablement pessimistes**. Ils ne fixent pas l'angle maximal du moteur. Restent valables quel
que soit le dessin : l'identité exacte des traits en GenK, et la règle « le moteur ne crée pas un élément absent de
la pose de départ ». **Les angles (17,5° qui marche, 35° qui confond les yeux, limite « 20-25° ») et tous les
pourcentages de ces missions sont à confirmer** sur une vraie rotation dessinée à la main, que l'utilisateur fournira
plus tard (méthode 2a).

### 2.4 Technique : appels, durées, délais, reprise (état du 2026-10-13, corrigé le 2026-10-28)
- **Appels réels** : 25 appels GPU depuis le 2026-10-05 (passages, revalidations, masques), **tous terminés sans
  erreur technique** (aucun dépassement de délai, aucun plantage relevé). Les erreurs des débuts (NaN, découpage en
  lots, division par zéro) sont corrigées dans l'image `nanfixv2`.
- **Durée d'un passage** (démarrage compris) : 175 à 534 s, médiane ≈ 270 s. La prévision de l'époque « 155 s + 0,299 s par
  segment » (remplacée le 2026-10-13 par 250 s + 0,1 s) s'est vérifiée (armure : prévu ≈ 312 s, mesuré 339 s ; test B : prévu ≈ 600 s avec l'ancienne formule, mesuré 383 s).
- **Démarrage à froid** : **jamais mesuré à part**. L'image est gardée par Modal (pas de re-téléchargement) ; les 155 s
  fixes comprennent démarrage, chargement des modèles (profondeur, SAM2, flot optique) et étapes fixes. À mesurer avec
  un journal horodaté par étape au prochain appel autorisé.
- **Plafonds du service** (2026-10-13), alignés sur le budget Modal de l'utilisateur (**10 $ au total**) :
  - registre `kukan-depenses` (Modal Dict) : chaque appel est engagé à son coût au pire, puis soldé à son coût réel,
    mémoire comprise ;
  - plafond mensuel **10 $** et journalier **10 $** (`PLAFOND_MOIS_DOLLARS`, `PLAFOND_JOUR_DOLLARS` dans
    `modal_app_v2.py`). Le registre démarre à 0 : il faut lui passer la dépense **déjà faite ce mois-ci**
    (`plafonds["depense_initiale_mois"]`), lue sur le tableau de bord Modal. Sinon, Modal peut couper un appel en
    cours en atteignant le budget (appel payé, résultat perdu) ;
  - plafond par génération : 2 $ (`cout_max_dollars`) ;
  - recommandé : un plafond journalier plus bas (3 $), pour qu'une erreur ne consomme pas tout le budget en un jour.
- **Délais** :
  - plafond de 900 s par appel GPU (`timeout`, soit 2,6 × le plus long passage mesuré) ;
  - le client attend 960 s puis annule l'appel ;
  - `kukan_job` (CPU) est plafonné à 1 800 s.
- **Reprise après erreur** :
  - **aucune relance automatique** (`retries=0`, choix de sécurité sur le coût) ;
  - en local, un passage déjà calculé est rejoué gratuitement (archive des ZIP) ;
  - **sur Modal** : volume `kukan-archives` (déployé et vérifié le 2026-10-13 : relance à 0 $) ; les archives des essais
    locaux récents (jus, rotation) n'y sont pas encore copiées (étape E0) ;
  - un travail en échec s'arrête avec un code stable (`MOTEUR_ECHEC`, `DELAI_DEPASSE`, `GPU_REQUIS`…).
- **Intégration de bout en bout** :
  - `kukan_job` sur Modal a été testé **une fois** (oreilles M8, 2026-10-05), avec un résultat **identique au bit
    près** au passage de référence : le moteur est déterministe avec la même image ;
  - les fonctions M1-M8 sont déployées depuis le 2026-10-13 (appels CPU réels vérifiés) ; le code d'après le
    2026-10-16 ne l'est pas (§ 2.2).

### 2.5 Inversion (traits cachés qui apparaissent)
- `inverse_debug` (fonction Modal) a fonctionné de bout en bout **une fois** (mission 1, pavillon d'oreille) :
  - image 0 inchangée ;
  - pavillon qui pousse ;
  - 0 pixel modifié hors de sa zone.
  C'est **1 réussite sur 1 essai**, ce qui ne permet pas d'annoncer un taux.
- Depuis la mission 4, la chaîne utilise la **pousse** (sans GPU, même résultat visuel) à la place de l'inversion.
- **Dans Kukan (`kukan_job`), l'inversion n'est pas branchée** : l'option `fidelite.apparition.methode = "inversion"`
  est acceptée mais **ne fait rien**. Les traits qui apparaissent ne sont alors pas ajoutés. **À corriger avant une
  démo** : refuser l'option avec un message clair, ou la brancher (un appel GPU de plus par passage).

### 2.6 Occlusion (ce qui passe devant / derrière)
- **Automatique** :
  - calques de mouvement du moteur (flot optique + masques SAM2, guidés par la profondeur) ;
  - disparition d'un trait qui n'a plus d'encre en B (il s'écrase) ;
  - découpage en calques des zones qui changent.
- **Indiqué par l'artiste** :
  - calque de **premier plan** (l'intérieur de ses formes fermées cache les autres calques, M8) ;
  - zones de calques ;
  - correction `ajouter` + `cache_par` (bouchons d'armure révélés par la translation, posés à la main).
- **Désactivé** : la résolution d'occlusion du moteur (`linearts_occ_resolve`), qui efface des détails (pupille).
- **Manque** :
  - détecter seul un élément caché en A et révélé par un déplacement ;
  - un élément qui passe derrière sans calque défini ;
  - l'auto-occlusion dans une rotation (nez qui sort du contour).
- **Prévu** : interface avec le composant « trait caché » (§ 5.4) et glissement derrière en vectoriel (§ 5.5).

### 2.7 Plusieurs passages en parallèle
**Essai réel du 2026-10-13** (autorisé, ≈ 0,5 $) : deux générations (armure, cyb) lancées ensemble par `kukan_job`,
profondeur V2-Large, archive Modal vide, accord en deux temps.
- **1er temps** (sans GPU) : les deux en parallèle, 61 s de CPU, statut `attente_accord_gpu`. Estimations :
  armure 0,16 $ (au plus 0,20 $), cyb 0,21 $ (0,26 $).
- **2e temps** (accord) : les deux passages GPU **se sont chevauchés ≈ 3 min 40 s**. Coût réel (mémoire comprise) :
  0,257 + 0,252 = **0,51 $**, au lieu de 0,37 $ estimés.
  - **La formule sous-estime les petits passages.** Armure (1 trait déformé) : 160 s estimés, **263 s mesurés**.
    Pour un si petit passage, la part fixe (démarrage du conteneur et chargement des modèles) approche 250 s, au
    lieu des 155 s de la formule. À corriger : part fixe ≈ 250 s, à mesurer sur plus d'appels (correction n° 5 du
    § 10.2).
  - armure : terminé.
  - cyb : échec **après** le GPU, à l'étape « corrections ». Une correction « remplacer » posée sur le résultat
    V2-Small ne s'applique pas au résultat V2-Large (nombre de segments différent). Les corrections par trait sont
    liées au passage qui les a vues naître.
- **Archive persistante vérifiée** : cyb relancé sans accord ni GPU → terminé en 84 s, passage repris du volume
  `kukan-archives`.
- **Chemin V2-Small vérifié** (`kukan-depth-pro` déployé) : les passages V2-Small déjà payés en local ont été copiés
  dans l'archive. armure et cyb, avec leurs réglages validés, ont tourné en parallèle sur Modal, **sans GPU**, et
  sont terminés.
  - armure : images **identiques au pixel près** au rendu validé ;
  - cyb : 24 à 250 pixels différents par image (écart de gris jusqu'à 68). Tout est identique jusqu'au document
    d'animation ; seul le **rendu** diffère. Les versions des bibliothèques sont les mêmes (numpy 2.5.3, Pillow 12.3.0,
    svg.path 7.1) : cause probable, des arrondis propres au processeur. Le rendu final se fait toujours sur Modal,
    donc de façon cohérente. Les références de non-régression des rendus doivent être produites au même endroit.
- **GenK V2-Small** (`predict_genk_debug_v2s`, écrite et déployée le 2026-10-13), essayée sur cyb A → B → A
  (B = pose intermédiaire ; 1er passage repris de l'archive, 2e en GenK) : **330 s, 0,323 $**.
  - Image 0 contre A : 99,8 % retrouvés ; image 16 contre B : 98,4 % ; image 32 contre A : 97,6 % (justes ≥ 99,1 %).
  - Identité des traits tenue : aucun trait ne bouge de plus de 20 px entre B et A ; retour à A à 2,3 px de médiane.
  - **Fausse alerte du contrôle de qualité** : 158 « sauts », dont 142 entre les images 16 et 17 (jonction des deux
    générations). L'animation rendue ne change à cet endroit que de 61 pixels (54 entre 15 et 16) : **aucun saut
    visible**. Le contrôle compare les sorties brutes du moteur de deux passages différents. **À corriger** : ne pas
    comparer à travers une pose.
- **Coût de l'essai groupé** (16:9 + GenK, en parallèle) : **0,709 $** pour un maximum autorisé de 0,8 $ (accords
  stricts de 0,39 $ et 0,408 $). armure s'est terminé à 4 s de sa limite.
  - **Accord strict** (2026-10-13) : son montant est une limite dure. L'appel est annulé côté client avant de la
    dépasser, et refusé d'emblée si l'accord ne couvre pas l'estimation.
  - Dépense du mois ≈ 7,2 + 0,51 + 0,71 ≈ **8,4 $** (plafond de test 15 $).

**Avant cet essai, jamais testé.** Aujourd'hui `max_containers=1` : un seul passage à la fois pour tout le service. Techniquement,
chaque passage tourne dans son propre conteneur (le moteur réécrit des fichiers de configuration globaux : un
conteneur par passage est obligatoire, et c'est déjà le cas). Le parallélisme est donc sûr sur le principe. Restent
à vérifier :
- la limite de GPU A100 simultanés du compte Modal ;
- le temps d'attente d'un GPU libre aux heures chargées ;
- le coût.
Les changements nécessaires sont au § 6.9, M12.

### 2.8 À fixer avant de montrer le produit à un studio
Les licences sont réglées (décision de l'utilisateur, 2026-10-13) : retirées de cette liste.
1. **Option « inversion »** : **refusée** avec un message clair tant qu'elle n'est pas branchée (fait, 2026-10-13).
2. **Archive persistante** des passages sur Modal (volume `kukan-archives`, jamais payer deux fois) et **accord GPU en
   deux temps** (`kukan_job` sans `accord` = estimation seule, statut `attente_accord_gpu` ; avec `accord` = appels
   dans la limite) : codés, **déployés et vérifiés** le 2026-10-13.
3. **Préréglage « Propre »** (`"prereglage": "propre"`) : blocs rigides, largeur « profil », profondeur V2-Small,
   contrôle de qualité (fait). Ce sont les options communes aux trois rendus validés ; le fichier d'options prime
   sur le préréglage.
4. **Application Modal de la profondeur V2-Small** (`kukan-depth-pro`, fonctions `*_v2s`) : **déployée** le
   2026-10-13 (2 à la fois).
5. **Démo sur des cas qui marchent**, et règles de dessin affichées (§ 4.10). Ne pas promettre :
   - les grandes rotations ;
   - les poses redessinées librement ;
   - les éléments qui naissent.
6. Essai réel de **deux générations en parallèle** : **fait** le 2026-10-13 (0,51 $) ; le démarrage à froid n'est
   toujours pas mesuré à part.
7. Réduire la mémoire réservée aux fonctions GPU (128 Go) après mesure.

### 2.9 Frontend existant — [À VÉRIFIER — dépôt frontend]
Ce que l'utilisateur a décrit (2026-10-27). **Rien de cela n'a été lu par la session moteur.**
| Élément | Décrit comme | À vérifier au début de la session |
|---|---|---|
| Dépôt | `NDJ-create/kukan`, copie locale `~/betwixt-landing` (Termux) | nom affiché du produit sur le site (« Kukan » ? « Betwixt » ?) ; branche de travail ; `README` |
| Cadre | Next.js | version, App Router ou Pages Router, TypeScript, gestionnaire de paquets, hébergement (Vercel ?) |
| Supabase | relié | client navigateur / serveur (`@supabase/ssr` ?), noms des variables d'environnement (sans lire leurs valeurs), migrations ou types générés présents ? |
| Comptes | connexion, déconnexion, inscription, réinitialisation du mot de passe, profil | nom et colonnes de la table des profils (le § 7 suppose `profiles(id, plan)`) |
| Plans, facturation | existent | prestataire de paiement (Stripe ?), table des plans, webhooks, noms des plans (Free, Indépendant, Studio, Entreprise ?) |
| Mini Krita | Fabric.js, page `/dashboard/draw` | version de Fabric (v6 attendue pour `createPathControls`), format du SVG écrit (§ 4.1 : `M` / `C`, `viewBox`, `id` par trait, groupes de calques) |
| Pages de génération | existent | **ce qu'elles appellent** : un ancien workflow Replicate a existé dans le dépôt moteur (secrets GitHub et modèle Replicate à nettoyer, point 7 du § 10.4). Elles ne doivent appeler ni Replicate ni Modal directement ; table « générations » existante ? |
| Design | charte du site | voir § 3.1 |
| Manquent (selon l'utilisateur) | projets, partage, travaux en parallèle, quotas, branchement à Modal | confirmer qu'aucun début n'existe |

**Inventaire à faire en premier** (sans rien modifier) :
1. `cat package.json` (dépendances : next, react, fabric, @supabase/*, stripe, zustand, tailwind…) ;
2. arborescence `app/` ou `pages/`, `components/`, `lib/` ;
3. `grep -rn "supabase.from(" ` (tables utilisées), `grep -rn "replicate\|modal" -i` (appels externes) ;
4. dossier `supabase/migrations` s'il existe ; sinon demander à l'utilisateur le schéma des tables (copie du tableau
   de bord Supabase, sans clés) ;
5. compte rendu court à l'utilisateur, puis correction des parties [À VÉRIFIER] de ce document.

## 3. Design et UX

### 3.1 Design visuel (2026-10-28 ; proposition, à valider par l'utilisateur)
**Existant — [À VÉRIFIER — dépôt frontend]** : la charte du site (couleurs, polices, logo, composants, Tailwind ou
autre, thème clair / sombre) n'est pas connue ici. **Règle : réutiliser la charte et les composants existants** pour
les pages de compte, de plans, de projets et de suivi. L'éditeur a des besoins propres (ci-dessous).

**Principes de l'éditeur**
1. **Le dessin d'abord.** La feuille est blanche au centre ; tout l'habillage autour est **gris neutre** (clair ou
   sombre selon le thème), sans couleur vive. Les couleurs sont **réservées à l'information** (tableau ci-dessous) :
   une couleur ne doit jamais être décorative près du dessin.
2. **Même codes partout** : la même couleur veut dire la même chose dans l'éditeur, la planche de réparation, la
   timeline et les exports de contrôle.
3. **Jamais la couleur seule** : chaque code a aussi une forme ou un texte (icône, trait pointillé, étiquette). Un
   **mode daltonien** remplace rouge / vert par orange / bleu.
4. **Coût et durée visibles avant chaque calcul GPU** (« ≈ 4 min · ≈ 0,26 $ · reste ce mois : 42 min »), jamais
   après coup.
5. **Messages en français simple**, sans jargon du moteur (pas de « chaîne », « [1comb] », « GenK ») : on dit
   « trait », « pose », « passage », « image ». Chaque alerte du moteur a une phrase pour l'artiste (catalogue
   `ALERTES`, champ `details.code_svg`) et un bouton qui montre la forme en cause.
6. **Tablette et stylet** : cibles tactiles ≥ 44 px, survol du stylet (aperçu de l'outil), pression en option,
   gestes 2 doigts (annuler) et 3 doigts (rétablir), panneaux repliables.

**Codes de couleur (décisions déjà prises ou proposées)**
| Information | Couleur | Forme en plus |
|---|---|---|
| pelure **avant** (table lumineuse) | rouge (orange en mode daltonien) | opacité décroissante ±1 à ±3 images |
| pelure **après** | vert (bleu en mode daltonien) | idem |
| pose de l'artiste sous le dessin | gris, opacité réglable | — |
| calque guide (« nouvelle pose depuis A », § 4.3) | bleu clair, verrouillé | cadenas ; jamais exporté |
| planche de réparation | noir = juste, rouge = en trop, orange = manquant | légende fixe |
| feux de qualité du SVG | vert / orange / rouge | texte « bon / à revoir / bloquant » |
| défaut du contrôle (timeline) | point rouge sur la case | infobulle avec le code |
| pose clé (timeline) | losange | — |
| bloc rigide | une couleur par bloc, pâle | contour pointillé |
| sélection | bleu de sélection (Fabric) | poignées |
| trait ajouté / effacé dans une pose déformée (§ 4.7) | vert / rouge | trait épais / trait barré |
| paire douteuse (identifiants) | orange | icône « ? » |
| élément en cours de calcul | gris + badge « calcul en cours » | lecture seule |

**Mise en page de l'éditeur (proposition)**
```
┌ onglets des projets ─────────────────────────── Calculs (2) · Rendu · Export · Partager ┐
│ outils │                                                        │ Calques                 │
│  V  A  │                 feuille (pose ou image)                │ Trait / bloc sélectionné│
│  B  E  │        + pelures + pose de l'artiste en gris           │ Défauts (liste)         │
│  Q  …  │                                                        │ Types de passage        │
├────────┴────────────────────────────────────────────────────────┴─────────────────────────┤
│ timeline : ◆ 1 2 3 … ◆ … (cases, losanges = poses, points rouges = défauts) ▶ ⏸ 12 i/s en 2 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Ordinateur + tablette graphique** d'abord, **iPad** ensuite ; **téléphone = consultation** (lecture des rendus,
  liste des calculs, commentaires), pas d'édition.
- Raccourcis d'Animate (`V` sélection, `A` nœuds, `B` crayon, `E` gomme, `Q` transformation), remappables.

**Écrans à concevoir (dans cet ordre)**
1. Tableau de bord des projets (vignette = première pose ou rendu, état du dernier calcul).
2. Création d'un projet, en assistant : poses (images) → SVG (vérification, feux) → calques → **type de chaque
   passage** (§ 5.2) → estimation (durée, coût, précision attendue) → accord GPU.
3. Éditeur (table lumineuse, timeline, outils du § 3.5).
4. Panneau « Calculs » (global, visible dans tous les onglets, § 3.3).
5. Export (§ 3.6), partage (§ 3.4), plans et quotas (réutiliser la page de facturation existante).
États à prévoir sur chaque écran : vide, chargement, erreur (code + phrase + que faire), quota atteint.

### 3.2 Projets en onglets
- Un onglet = un projet (URL propre `/projets/{id}`) ; état indépendant par onglet (image courante, outil, sélection,
  journal non enregistré).
- Projet = options + poses + SVG + document d'animation + journal d'éditions + références aux travaux.
- Sauvegarde du journal au fil de l'eau (proposé, choix 9 du § 9.3).

### 3.3 Calculs en parallèle, suivi d'avancement
- Un **calcul** = un travail Kukan (ligne `jobs`) : passage moteur, aperçu, reprise, re-rendu, export.
- Panneau « Calculs » global, visible dans tous les onglets : une ligne par travail, avec :
  - l'étape (`stage`) et sa barre de progression (`progress` 0-100) ;
  - le temps écoulé ;
  - le coût estimé (événement `estimation_gpu`) ;
  - le bouton **Annuler** ;
  - les alertes.
  Source : Supabase Realtime sur `jobs` et `job_events`.
- Pendant un calcul, l'artiste continue de retoucher **un autre élément**. L'élément en cours de calcul (passage /
  calque) est en lecture seule, avec un badge « calcul en cours ». Ses résultats arrivent par une nouvelle version du
  document, proposée à la fusion.
- Plafonds par plan (proposition, `docs/ARCHITECTURE_PRODUCTION.md` § 13.2) : Studio 2 travaux simultanés,
  Entreprise 10. Au-delà, le travail est mis en file (`en_file`).
- **Côté serveur** (corrigé le 2026-10-28) : les fonctions GPU ont `max_containers=2` depuis le 2026-10-13 (avant : 1), soit deux passages à la fois
  pour tout le service. C'est une tâche du moteur (§ 10.2).
- **Plusieurs générations en même temps : proposition** (rien n'est changé sans accord).
  - Une **génération** = un travail Kukan complet (toutes les étapes), qui contient un ou plusieurs **passages GPU**
    (un par couple de poses et par calque animé).
  - L'utilisateur peut en lancer plusieurs ; chacune a sa ligne dans le panneau « Calculs » (statut, étape,
    progression, coût).
  Valeurs **par défaut** (modifiables dans Supabase, § 8.1) :
  | Limite | Free | Indépendant | Studio | Entreprise | Où elle est vérifiée |
  |---|---|---|---|---|---|
  | générations par mois | 3 | illimité (quota GPU) | illimité | contrat | route Next.js (`travaux` du mois) |
  | générations en cours en même temps | 1 | 2 (dont 1 avec GPU) | 4 | 12 (contrat) | route Next.js ; au-delà : `en_file` |
  | passages GPU simultanés | 1 | 1 | 3 | 8 (contrat) | Modal : jeton pris avant chaque appel |
  | coupure d'un appel GPU (côté client) | **500 s** | 900 s | 900 s | 900 s | `Contexte.delai_gpu_s` (la fonction Modal reste à 900 s) |
  | plafond de coût par génération | 0,50 $ | 1 $ | 3 $ | contrat | `Contexte.cout_max_dollars`, vérifié **au pire** avant chaque appel |
  | GPU par mois | 15 min | 1 h | 4 h | contrat | `usage_gpu` + `Contexte.gpu_secondes_restantes` |
  | partage de projets | non | non | oui | oui | RLS (`partage_autorise`) |
  | plafond global du service | — | — | — | — | code Modal (§ 8.1) : `max_containers`, plafonds jour / mois |
  **Cohérence du plan Free avec nos mesures** (prix réel GPU + mémoire : 0,000978 $/s) :
  - passage médian 270 s ≈ 0,26 $ ; dessin de 524 segments (armure) : 312 s estimés ≈ 0,31 $ ; pire cas (900 s) :
    0,88 $ ;
  - **0,50 $ par génération n'est tenable que si l'appel est coupé à 500 s** (500 × 0,000978 = 0,49 $). Avec la règle
    actuelle (coupure à 2 fois la durée estimée avec marge), 0,50 $ ne laisserait passer que des dessins de moins de
    ≈ 100 segments. D'où la coupure à 500 s pour Free : un passage est accepté si sa durée estimée avec marge tient
    dans 500 s (≈ 830 segments au plus), sinon il est refusé **avant** le GPU (« dessin trop dense pour le plan
    Free ») ;
  - **15 min par mois ≈ 3 passages médians** (3 × 270 s = 810 s) : les 3 générations du mois tiennent **si chacune
    n'a qu'un passage** (2 poses, 1 calque, ≤ ≈ 500 segments). Une génération de 3 poses (2 passages) en consomme
    deux tiers. Le contrôle du quota doit se faire sur la durée **au pire de l'appel** (et non sur 900 s fixes) :
    sinon un utilisateur Free n'aurait droit qu'à 2 passages (correction n° 5 du § 10.2) ;
  - **coût mensuel maximal d'un utilisateur Free** : GPU 900 s × 0,000978 = 0,88 $, plus l'orchestrateur sur CPU
    (3 générations × 2 temps × ≈ 600 s × 0,000044 $/s ≈ 0,16 $) : **≈ 1,05 $ par mois** au plus ;
  - **100 utilisateurs Free qui épuisent tout leur quota : ≈ 105 $ par mois** (au pire). Avec des passages médians et
    sans relance, plutôt ≈ 80-90 $.
  - Coût d'un passage : 250 s + 0,1 s par segment, marge 40 % (formule du 2026-10-13 ; l'ancienne était 155 s + 0,299 s). **Attention** : nos estimations comptent le GPU seul
    (0,000694 $/s). Nos fonctions réservent aussi 128 Go de mémoire (≈ 0,000284 $/s), soit ≈ **0,00098 $/s ≈ 3,5 $/h**
    au total. Un passage médian (270 s) coûte donc ≈ **0,26 $** et non 0,19 $. Réduire la mémoire réservée (à mesurer)
    ramènerait vers 2,5 $/h.
  - Coût d'une génération ≈ nombre de passages × 0,26 $ (2 poses, 1 calque : ≈ 0,26 $ ; 5 poses, 2 calques :
    8 passages ≈ 2,1 $). Le parallélisme ne change pas ce total ; il augmente le débit de dépense (au pire
    3,5 $/h par passage simultané).
  - Le parallélisme ne change pas le coût d'un passage, mais chaque conteneur démarre à froid (≈ 60-90 s compris
    dans les 155 s).
  - Dans un travail : les calques d'un même passage sont indépendants (parallélisables) ; les générations GenK
    restent en série.
  - Un travail qui dépasserait son plafond au pire s'arrête **avant** l'appel, avec l'événement `estimation_gpu` et
    le statut `attente_accord_gpu`.

### 3.4 Partage (Studio et Entreprise seulement)
- Rôles : propriétaire, éditeur, commentateur, lecteur. Lien de lecture possible (rendu seulement).
- On partage les poses (images), les SVG, le document d'animation et le journal (qui a fait quoi).
- Éditions concurrentes :
  - journal en ajout seul, chaque opération porte son auteur ;
  - conflit (mêmes traits, mêmes images) → réponse 409, le client recharge et rejoue ses opérations ;
  - pour la première version : un seul éditeur actif par projet (verrou affiché), les autres en lecture.
- Plan gratuit ou sans partage : bouton visible mais grisé, avec la raison « réservé aux plans Studio et
  Entreprise ».

### 3.5 Éditeur : outils de base (priorité « indispensable »)
Recherche complète, gains et risques : `docs/propositions_editeur.md` (§ 1-4).

| Outil | Comportement attendu | Opération envoyée (§ 6.5) |
|---|---|---|
| **Table lumineuse** | pelures ±1 à ±3 images (rouge avant, vert après), pose de l'artiste en gris dessous, opacité réglable, **feuilleter** (touche maintenue) | — (affichage) |
| **Timeline** | images en cases, poses clés en losange, défauts du contrôle en points rouges, lecture / pause, défilement, sélection d'une plage, durée d'affichage (`affichage_ms`), « en 2 » | `timing` (à créer) |
| Sélection | clic = un trait ; `Maj+clic` = ajouter ; lasso (traits entiers) ; **double clic = bloc rigide entier** ; la sélection est montrée sur toutes les images | — |
| Annuler / rétablir | `Ctrl+Z` / `Ctrl+Maj+Z`, 2 doigts / 3 doigts sur tablette | — (pointeur du journal) |
| Déplacer | trait ou bloc, **à la pose** (toutes les images suivent, par défaut) ou à l'image (propagation aux voisines) ; flèches = 1 px, `Maj` = 10 px ; aimant à l'encre pour un bloc | `deplacer`, `deplacer_bloc`, `affine` |
| Nœuds de Bézier | déplacer nœuds et poignées, tirer la ligne pour la courber, ajouter / supprimer un nœud (à toutes les poses à la fois) | `remplacer`, `noeud_ajouter`, `noeud_supprimer` |
| Gomme | trait entier ou **portion** (masque non destructif) | `supprimer`, `masquer_portion` |
| Crayon | réutilise le mini Krita ; choix « apparaît à cette pose » / « suit ce bloc » / « caché derrière… » ; épaisseur reprise des voisins | `pousser`, `ajouter` (+ `cache_par`) |
| Déformer | maille 3 × 3 ou 4 × 4 sur la sélection | `maille` |
| **Déclarations** (règle 9 du § 9.1) | « sort de derrière » : un clic sur l'élément (pose d'arrivée), un clic sur le contour (pose de départ), position de départ proposée sur la pelure et réglable, « valider » ; « disparaît » ; « bloc » ; « type de passage » (normal / rotation). Le code propose quand il peut (ex. traits orphelins près d'un contour), l'animateur confirme d'un clic. Mesurer le temps passé à déclarer | `sortir`, `cacher`, `deplacer_bloc` (blocs : choix de traits, non codé, point 2) |
| Liste des défauts | `qualite.json` + carte de confiance ; clic = zoom sur le trait et l'image ; calque « réparation » superposé | — |
| Aperçu animé et rendu final | lecture à la vitesse réelle ; bouton « Rendu final » (serveur, sans GPU) | `POST /rendu` |

Raccourcis : ceux d'Animate (`V` sélection, `A` nœuds, `B` crayon, `E` gomme, `Q` transformation), tout remappable ;
préréglages Harmony et TVPaint plus tard (décision 11.6).

### 3.6 Export
- Choix du format :
  - **calques vectoriels** : un SVG par image, un groupe `<g>` par calque. Les groupes sont **à coder côté
    serveur** : aujourd'hui les SVG par image n'ont pas de groupes ;
  - **séquence PNG** : composée, et par calque avec transparence (sans perte : format de production) ;
  - **WebP animé** (2026-10-28, **validé par l'artiste le 2026-10-29** : « bon format, net ») : sans perte, à la
    taille native du dessin, transparence, durées au ms près ; c'est le format d'**aperçu dans le navigateur** ;
  - **GIF** : gardé pour la compatibilité et les contrôles (réduit à 627 px par défaut).
- Réglages :
  - **images par seconde** (`ips`, 24 par défaut) et « en 2 » (chaque image tenue 2 fois) ;
  - **boucle** : infinie ou N fois ;
  - **aller-retour** : la lecture repart en arrière sans répéter les images extrêmes ;
  - pause sur la première et la dernière image (en ms) ;
  - largeur.
- **Côté serveur (M7, fait)** :
  - `sorties.lecture = {"ips": null, "en_deux": null, "boucle": 0, "aller_retour": false, "pause_debut_ms": 0,
    "pause_fin_ms": 0}`, avec `ips` / `en_deux` null = ceux de l'animation, et `boucle` 0 = infinie, 1 = une seule
    lecture, N = N lectures ;
  - `sorties.svg_frames.groupes_calques` (désactivé par défaut) : un `<g id="calque-<id>">` par calque ;
  - `sorties.document_editeur` (imposé pour un travail de l'API) : `rendu/editeur/animation.json`,
    `mesures_rendu.json` (format « mesures_rendu 1 ») et `lecture.json` (`ordre`, `durees_ms`, `boucle`,
    `aller_retour`) ;
  - valeurs par défaut = sorties inchangées.
- **Résolution des sorties (2026-10-28, codé, NON déployé — E0)** :
  - `sorties.webp = {"actif": true, "sans_perte": true}` (actif par défaut) → `rendu/animation.webp`, même ordre et
    même boucle que le GIF ; durées au ms : 24 i/s en 2 = 83 / 84 / 83 ms (le GIF est limité au pas de 10 ms :
    80 / 90 ms). Plus petit que l'APNG (rotation C → D : 427 Ko contre 497 Ko).
  - `sorties.resolution` = `"source"` (défaut : taille du dessin d'entrée) ou une largeur entière de 16 à 8 192 px.
    Les PNG exportés et le WebP sont alors **retracés en vectoriel** dans `rendu/images_<L>px/` ; `rendu/images`
    reste à la taille native (contrôles, GIF). Les calques en pixels (fixes, décor) et les effets sont agrandis en
    pixels.
  - `sorties.gif.largeur` = 627 (défaut) ou une largeur de 16 à 8 192 px ou `"source"` (taille native, sans
    rééchantillonnage).
  - Ce qui abîme un GIF n'est **pas** la palette (en gris, 256 gris = aucune perte) : c'est la réduction à 627 px,
    les durées au pas de 10 ms, la transparence tout-ou-rien et la quantification des couleurs.
  - Limites connues :
    - au-delà de la taille d'entrée (essai 3 840 px), les bords des traits sont un peu bosselés et les bouts
      recollés font de petits pâtés plus visibles : **lissage des épaisseurs à décider** (≈ 0,5 séance, point 32) ;
    - la mémoire d'un rendu 3 840 px sur Modal est à vérifier avant de proposer cette largeur ;
    - MP4 et APNG : non codés ;
    - le SVG par image donne une épaisseur **moyenne** par trait, sans aplats ni calques en pixels : il diffère
      du PNG.
  - Interface proposée : menu « Format » (WebP par défaut, PNG, GIF, SVG), menu « Largeur » (« taille du dessin »
    par défaut, puis 1 920, 3 840 px avec la mention « plus lent »). L'aperçu animé du site affiche le WebP
    **[À VÉRIFIER — dépôt frontend : composant de lecture actuel (GIF ou canvas) ?]**.

### 3.7 Architecture du frontend (proposée)
- **Next.js** (App Router) : `app/(editeur)/projets/[id]/page.tsx` ; état par onglet (Zustand ou équivalent).
- **Dessin en couches** : Fabric.js redessine tout son canevas à chaque changement, donc il est réservé aux traits
  sélectionnés.
  1. fond : pose de l'artiste en gris, calque fixe ;
  2. pelures : canevas hors écran mis en cache ;
  3. traits non sélectionnés : canevas 2D, un `Path2D` par trait, contour à épaisseur variable ;
  4. **Fabric.js** : traits sélectionnés, poignées (`controlsUtils.createPathControls` de Fabric v6), maille, cadre ;
  5. annotations : défauts, couleurs des blocs.
- **`lib/kukan-geo/` (TypeScript)** : portage de la géométrie du moteur :
  - Bézier (évaluation, coupe de De Casteljau), échantillonnage à paramètres fixes ;
  - interpolation des chaînes, affine, maille bicubique, réajustement par moindres carrés ;
  - `rigid_fit` (Kabsch), simplification du crayon.
  Les **tests de parité** se font sur des fichiers de référence produits par le Python (à demander au moteur : M7).
- Web Worker pour recalculer les images ; Pointer Events (stylet, doigt, souris) ; gestes 2 / 3 doigts.
- Appareils : ordinateur + tablette graphique d'abord, iPad ensuite, téléphone en consultation (proposé, choix 5).

### 3.8 Plier et déformer « comme du caoutchouc » (squash and stretch) — analyse, rien de codé
**Ce que couvrent les outils prévus**
- **Maille** (`maille`, existe côté serveur) :
  - grille N × M (bicubique) posée sur la boîte de la sélection, à une image, propagée aux voisines ;
  - elle plie et écrase **toute une région**, avec les Bézier réajustées (même nombre de segments).
  - **Limites** :
    - la grille est droite (alignée sur les axes), pas sur le membre : plier un bras en diagonale est malaisé ;
    - aucune conservation du volume ;
    - tout ce qui est dans la boîte et sélectionné se déforme ;
    - la propagation suit un poids dans le temps, pas une courbe d'animation : un bras plié puis déplié n'a pas
      d'arc.
- **Tirer la ligne** (nœuds, I5) : remodèle **un seul trait**. Les deux contours d'un bras ne restent pas
  parallèles, et l'épaisseur du membre n'est pas tenue.

**Ce qui manque pour un vrai squash and stretch sur plusieurs traits**
1. **Une structure qui porte la déformation** : une **ligne guide** (colonne vertébrale du membre), tracée dans
   l'élément, ou un **squelette** (os articulés). Chaque point des traits sélectionnés est exprimé dans le repère du
   guide (abscisse le long du guide, distance signée), avec un poids qui décroît loin du guide. Plier ou étirer le
   guide emporte tous les traits ensemble : les deux contours restent cohérents.
2. **Conservation du volume** : étirer de `s` le long du guide → largeur × `1/√s` (squash → plus large). Le trait
   d'encre, lui, garde son épaisseur (règle du dessin animé).
3. **Animer la déformation, pas les points** : clés de la forme du guide (angles, longueur) aux poses et aux clés de
   trait, interpolées en arc. Interpoler les points en ligne droite raccourcit un bras qui se plie.
4. **Retard le long de la chaîne** (queue de cheval, follow-through) : chaque partie du guide suit la précédente avec
   un décalage d'images.
5. **Option automatique** : étirement proportionnel à la vitesse (le module `smear` calcule déjà les vitesses).

**Proposition, par ordre de valeur**
- **(a) Ligne guide** : le guide est une courbe de Bézier avec 2 à 4 poignées.
  - Elle couvre la courbure d'un bras ou d'une queue de cheval, et le squash and stretch d'une balle ou d'un corps.
  - Côté serveur : une opération `guide` du journal (sélection, guide avant / après, poids, conservation du volume,
    pose / image, portée) + fichiers de parité, ≈ 3-4 j. Côté frontend : ≈ 4-5 j.
  - Elle s'appuie sur la sélection de blocs (un bloc rigide = candidat naturel à un guide) et sur l'infrastructure
    de la maille (réajustement des Bézier).
- **(b) Animation du guide** : clés aux poses / clés de trait, arc, retard le long de la chaîne, ≈ 3 j. Elle
  dépend de l'option « clé de trait ».
- **(c) Squelette 2D** (os articulés, pondération des points, cinématique inverse), comme les « bone deformers »
  d'Harmony. C'est plus puissant pour les membres à articulations, mais l'interface est plus lourde : **plus tard**.
  La détection de rotation des blocs (limite connue du moteur) en fournirait les pivots.

**Place dans l'ordre de construction** : juste **après la maille** (fin de la liste du § 9.2, point 11.10). Elle
réutilise la sélection, le journal, les nœuds et la maille, et sert surtout l'animation **ajoutée** par l'artiste. La
correction des intervalles du moteur (la démo studio) n'en a pas besoin.

**Risques**
- Plis trop forts : les traits se recoupent ; limiter la courbure et la montrer en rouge.
- Fidélité : l'épaisseur mesurée reste celle du dessin, pas d'étirement du trait.
- Mobile : quelques centaines de points, calcul léger (Web Worker).

### 3.9 Générations en arrière-plan (conception, 2026-10-13)
**Parcours.** L'artiste lance une génération, ferme ou réduit l'aperçu, en lance une autre, retouche un détail
ailleurs, et il est averti quand une génération est prête.
1. **Copie figée au lancement** : la route copie les entrées dans `kukan-entrees/projets/{p}/travaux/{t}/` avec leur
   empreinte (`travaux.entrees` jsonb : fichier, empreinte). La génération ne lit **que** cette copie. Une pose
   redessinée pendant le calcul ne change rien au calcul en cours. Elle sera prise par la génération suivante, et
   l'écran l'indique : « résultat calculé sur les poses du 13/10 à 14 h 02 ».
2. **Résultat livré comme nouvelle version** : un travail terminé crée `documents (projet, version n + 1)`. Il ne
   remplace jamais ce que l'artiste édite.
   - Un bandeau propose « Nouvelle version prête : voir / comparer / adopter ».
   - « Adopter » ouvre la nouvelle version. Les retouches de l'ancienne peuvent être **réappliquées** : le journal est
     rejoué sur la nouvelle version, pour les opérations dont les traits existent encore (identifiants stables) ; les
     autres sont listées, non appliquées.
3. **File d'attente par plan** (`travaux.statut = en_file`, ordre de création) :
   | | Free | Indépendant | Studio | Entreprise |
   |---|---|---|---|---|
   | générations en cours | 1 | 2 | 4 | contrat |
   | en file au plus | 2 | 5 | 20 | contrat |
   Une génération en file démarre dès qu'une place se libère (fonction Supabase ou tâche de la route). Les
   estimations GPU en attente d'accord ne prennent pas de place.
4. **Notifications**
   - **Dans l'application** : panneau « Calculs » + message éphémère (Supabase Realtime sur `travaux`), dans tous
     les onglets ouverts.
   - **Push (application web installable, PWA)**, sur accord de l'artiste. Limites (sources ci-dessous) :
     - **iPhone et iPad** : seulement si l'application a été **ajoutée à l'écran d'accueil**, sous iOS 16.4 ou plus,
       avec permission demandée après un geste de l'utilisateur. Dans un onglet de Safari : pas de push ;
     - **Android** (Chrome) : fonctionne application fermée, avec un service worker. Pas de garantie si l'application
       n'a pas été ouverte depuis environ 2 semaines ;
     - **ordinateur** : le navigateur doit être lancé ;
     - dans tous les cas, livraison **non garantie**. D'où un repli : courriel facultatif « génération prête », et
       panneau « Calculs » à jour à la réouverture.
   - Côté serveur : table `abonnements_push` (utilisateur, point de livraison, clés), clés VAPID en variables
     d'environnement de Next.js. L'envoi se fait à la fin du travail (route ou fonction Supabase).
Sources : [Web push sur iOS (exigences)](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications),
[OneSignal, iOS](https://documentation.onesignal.com/docs/web-push-for-ios),
[web.dev, push navigateur fermé](https://web.dev/articles/push-notifications-faq),
[Adalo, notifications PWA](https://help.adalo.com/actions/notifications/troubleshooting-notifications/notifications-not-working-on-pwa).

### 3.10 Enchaînements de 4 à 6 poses (conception, 2026-10-13)
**Ce qui existe**
- Une génération accepte **plusieurs poses** : `kukan_job` enchaîne seul tous les passages (A → B → C…), un par
  couple de poses et par calque animé.
- **GenK** : identité exacte des traits d'un passage au suivant (pose marquée « intermédiaire »). Vérifiée en
  V2-Large (M12) et, depuis le 2026-10-13, en **V2-Small** (cyb A → B → A : 99,8 / 98,4 / 97,6 %).
- **Arcs** : trajectoires lissées à travers les poses (Catmull-Rom), possibles avec GenK (option `animation.arcs`).
- **Accord en deux temps** : le premier temps estime tous les passages. Ceux qui dépendent d'un passage pas encore
  calculé sont estimés de façon approchée.
- **Archive** : un passage déjà payé n'est jamais repayé (relance, retouche des réglages).

**Ce qu'il faut coder**, dans l'ordre :
1. **Courbe de timing globale** : aujourd'hui, chaque passage a sa courbe d'accélération (`smoothstep`), donc le
   mouvement **s'arrête à chaque pose**. À coder : une courbe sur toute la suite (vitesse continue aux poses de
   passage, arrêt seulement aux poses tenues). CPU, ≈ 1 séance (`mouvements_longs.md`).
2. **Avancement par passage** : événements `passage_debut` / `passage_fin`, progression = passages faits / prévus
   (M12, point 5). ≈ 0,5 séance.
3. **Calques en parallèle** : les calques d'un même couple de poses sont indépendants ; les générations GenK d'un
   calque restent **en série**. ≈ 1 séance (M12, point 3).
4. **Fausse alerte « sauts » aux poses** (vue sur GenK) : ne pas comparer à travers une pose. **FAIT le 2026-10-14** :
   temps global (passage + t) et aucune comparaison à travers une pose intermédiaire ; chaque image jugée sur les poses
   de SON passage (plus de « A » / « B » en dur) ; jonctions mesurées depuis la pose de départ de chaque passage. cyb
   A → B → A : sauts 158 → 6 (vrais : `t0050`, `t0002`, `t0056`) ; un seul passage (cyb, combat, armure) : résultats
   identiques. Limite : la sortie du moteur (exemptions, gel) n'est lue que pour le 1er passage (les passages GenK
   n'ont pas d'images d'interpolation) : sur les passages suivants, un bout prolongé par le moteur est signalé.
5. **Rotation autour d'un pivot** (blocs rigides en rotation : bras qui tourne, épée) : ajustement rigide avec angle,
   pivot aux articulations, interpolation de l'angle. CPU, ≈ 2-3 séances.

Le **lancement automatique en série** existe déjà (une génération = toute la suite).

**Coût et durée d'une suite de 5 poses** (4 passages, 1 calque animé ; ≈ 0,26-0,39 $ et ≈ 4-6 min de GPU par
passage, plus ≈ 1-2 min de CPU) :
| Mode | GPU | Durée totale | Coût | Identité |
|---|---|---|---|---|
| en série, GenK (recommandé) | 4 passages l'un après l'autre | ≈ 25-30 min | ≈ 1,0-1,6 $ | exacte, arcs possibles |
| en parallèle, sans GenK | 4 passages, 2 à la fois | ≈ 12-15 min | ≈ 1,0-1,6 $ | perdue à chaque pose (sauts possibles, pas d'arcs) |
| mixte | 1er passage seul, puis GenK en série | ≈ 25 min | idem | exacte |
| avec blocs rigides | passages entièrement rigides évités | − 1 à − 4 passages | ≈ 0 à 1,6 $ | exacte pour les blocs |
Plusieurs calques animés : le coût est multiplié par leur nombre ; la durée l'est aussi en série, pas en parallèle.

**Limites par plan** (poses maximales par génération, cohérentes avec le plafond de coût par génération) :
| | Free | Indépendant | Studio | Entreprise |
|---|---|---|---|---|
| poses par génération | **2** (1 passage ; 0,50 $ max) | 4 (3 passages ≈ 1 $) | 8 (7 passages ≈ 2,8 $) | contrat |
| calques animés | 1 | 3 | 12 | contrat |
Free ne peut donc pas faire de suite. Une suite de 5 poses demande le plan Indépendant avec 2 générations, ou le
plan Studio.

**Aperçu en direct d'une suite**
- Une timeline avec les poses en losanges. Chaque passage affiche son état (en file, en calcul avec sa barre, prêt,
  en échec) et sa durée restante estimée.
- **Livraison progressive** : chaque passage terminé et corrigé est jouable aussitôt. Les passages pas encore
  calculés sont figurés par la pose tenue (losange grisé).
- Un passage en échec n'efface pas les autres : il est marqué en rouge, avec « relancer ce passage » (les autres
  restent dans l'archive, 0 $).
- La courbe de timing globale est appliquée à la fin de la suite. Avant, l'aperçu utilise la courbe par passage, et
  le dit.

## 4. Méthodes de dessin et import

### 4.1 Import de SVG et mini Krita
- Import d'un fichier SVG ou dessin dans le mini Krita → `POST /api/svg/verifier` (0 $, quelques secondes). Le
  serveur renvoie :
  - le SVG normalisé et les traits (avec l'`id` d'origine) ;
  - les **feux de qualité** (vert / orange / rouge) ;
  - les alertes (code + phrase pour l'artiste + forme fautive) ;
  - la couverture sur l'image de la pose ;
  - un aperçu superposé.
- Rouge bloquant : XML invalide, 0 trait, proportions différentes de l'image, dessin qui ne tombe pas sur l'image.
  Orange : avertissement affiché, l'artiste peut continuer.
- Afficher les **règles de dessin** (§ 4.10) à côté de l'indicateur.
- **Pose B tracée** (`entrees.svg_arrivee`, M8, option désactivée) :
  - SVG de la deuxième pose avec **les mêmes traits** que celui de la première. L'appariement se fait par `id` de
    forme si les deux fichiers ont les mêmes ids, sinon par ordre.
  - Le premier passage est calculé **sans moteur** (0 $) : la correspondance est donnée.
  - Les segments sont égalisés par paire (coupe exacte).
  - Une paire douteuse est signalée (`SVG_ARRIVEE_ORDRE`), un nombre de traits différent bloque
    (`SVG_ARRIVEE_TRAITS`).
  - Le mini Krita peut produire ce fichier en dupliquant le dessin de A et en déplaçant ses traits : les ids sont
    gardés.
- Contrat de sortie du mini Krita (à vérifier sur un fichier réel, que l'utilisateur doit fournir) :
  - `viewBox` égal à la taille de l'image de la pose (même proportions) ;
  - pas de transformation, ou l'identité ;
  - un trait = un `<path>` à un seul `M`, en `M` / `C` absolus ;
  - `id` stable par trait ;
  - un groupe `<g id="calque-…">` par calque s'il y a des calques ;
  - pas de trait de construction presque blanc.

### 4.2 Deux méthodes de dessin : détection, conseil, précision estimée (décision 13, NON codé)
**Pourquoi** (mesures) : le moteur et nos corrections réussissent quand B est obtenue en **déplaçant** les traits de A,
et perdent en précision quand B est **redessinée** :
| Cas | Méthode | Part de traits rigides (blocs) | Image 16 contre B |
|---|---|---|---|
| armure | 1 (déplacée) | 96 % | 98,9 % |
| cyb | 1 (déplacée, manche déformée) | 67 % | 98,4 % |
| combat (B tracée à la main, bas de veste refait) | 2 (redessinée en partie) | 22 % | 90,7 % |
| faces F1 → F2 | 2 (redessinée) | — (non mesuré) | 87,2 % |
| combat, B redessinée par une IA | 2 | lignes centrales communes 37,5 % (contre 45,5 %) | non passé au GPU |
Ces valeurs viennent de **5 cas** : elles calibrent un conseil, pas une prédiction garantie.

**Détection** : automatique, sur CPU, **avant tout GPU**. Elle a lieu au premier temps de l'accord GPU, et aussi
dans « vérifier » quand la pose B est fournie. Trois mesures :
1. **part de traits rigides** : traits de A qui retombent sur l'encre de B après la translation de leur bloc
   (`kukan.blocs.detecter`, déjà codé) ;
2. **dérive des parties immobiles** : part de l'encre de A retrouvée à ≤ 1 px dans B, dans les zones qui ne bougent
   pas (redessin à 1-2 px près = 84 % sur les cheveux d'armure, contre 99 % pour une copie) ;
3. **lignes centrales communes** (`tools/comparer_poses_AB.py`).

Règle proposée, à calibrer sur nos 5 cas :
- **méthode 1** si traits rigides ≥ 60 % **ou** immobiles ≥ 95 % ;
- **méthode 2** si traits rigides < 35 % **et** immobiles < 90 % ;
- **mixte** entre les deux.

**Ce que voit l'artiste** (événement `methode_dessin` : `methode`, `part_rigide`, `immobiles`, `precision_estimee`
[min, max], `zones_redessinees` (rectangles), `conseil`) :
- toujours : « **Déplacez, ne redessinez pas ce qui ne bouge pas.** Copiez les parties fixes de A dans B ; déplacez
  les parties rigides (bras, lame) en bloc. » ;
- méthode 1 : « Pose B obtenue par déplacement : précision attendue 95-99 %. » ;
- mixte : « Une partie de B est redessinée (zones entourées) : précision attendue 90-97 %. » ;
- méthode 2 : avertissement honnête : « **Pose B redessinée** : le moteur doit deviner la correspondance des traits.
  Précision attendue **85-91 %**. Des traits peuvent apparaître en fondu ou se doubler. Pour un meilleur résultat,
  repartez d'une copie de A et déplacez. » Les zones redessinées sont entourées sur l'aperçu.
- La précision estimée est affichée **avec le coût**, au moment de la demande d'accord GPU. Les fonctions restent
  les mêmes pour tous les plans.

**Côté moteur** : ≈ 1-2 séances (mesures, règle calibrée sur nos 5 cas, événement, champ dans `verifier`, tests).

### 4.3 Méthode 2 scindée : 2a (redessin guidé) et 2b (sans guide) — mesures du 2026-10-13
| Méthode | Comment B est obtenue | Cas mesurés | Part de A identique dans B | B retrouvée à l'image 16 (1 / 2 / 3 px) | Traits qui dérivent |
|---|---|---|---|---|---|
| **1** | traits de A déplacés | — | — | 95-99 % (blocs rigides) | — |
| **2a** | B **redessinée à la main par-dessus un guide** (A dupliquée, parties posées au lasso) | armure, cyb | 67-74 % | **98,4-98,9** / 99,0-99,4 / 99,4-99,6 % | 0-4 % |
| (partiel) | B en partie redessinée (type de guide à confirmer) | combat | 52 % | 91,1 / 93,1 / 94,5 % | 20 % |
| **2b** | B **redessinée sans guide** | visages F1 → F2 (**images générées par une IA : cas pessimiste**) | 23 % | 86,5 / 92,7 / 95,5 % | 28 % |
Fourchettes à afficher avant le GPU : **2a ≈ 98-99 %**, **2b ≈ 85-92 % à 1 px** (93-96 % à 2-3 px). Les mêmes
fonctions pour tous les plans.

**Flux de l'éditeur « dupliquer A en calque guide, poser au lasso, redessiner par-dessus »** (proposition) :
1. **« Nouvelle pose depuis A »** : les traits de A sont copiés dans un **calque guide** : verrouillé, en couleur
   pâle (bleu clair), jamais exporté, avec leurs identifiants.
2. **Poser au lasso** : l'artiste sélectionne une partie du guide (bras, main, lame) et la déplace ou la tourne
   (transformation affine), comme une pose « au calque ». Les blocs ainsi posés ont une translation ou une rotation
   connue.
3. **Redessiner par-dessus** avec le crayon (mini Krita), dans le calque de la pose B.
   - Option « **garder ce trait du guide** » : le trait est copié tel quel dans B, **avec son identifiant**. Pour lui,
     identité exacte et zéro dérive : c'est la méthode 1.
   - Un trait redessiné reçoit un nouvel identifiant.
4. **Pendant le dessin** : indicateur « suit le guide » (part des nouveaux traits à ≤ 2 px du guide) et zones
   redessinées loin du guide entourées. Ce sont les fourchettes 2a / 2b ci-dessus, en direct.
5. **Envoi** : image de B (comme aujourd'hui) **et** SVG de B. Les traits gardés portent l'identifiant de A
   (`entrees.svg_arrivee`, appariement par identifiant).
   - **À ajouter côté moteur** : l'appariement **partiel**. Les identifiants communs sont appariés exactement, les
     autres traits sont traités normalement (moteur, pousse, disparition). Aujourd'hui, M8 exige les mêmes traits
     des deux côtés.

**Mise à jour (2026-10-28)** : l'appariement **partiel** demandé au point 5 ci-dessus existe maintenant sous la forme
de l'appariement par identifiant (§ 4.7) : les traits de même identifiant sont reliés exactement, les autres par la
forme. Il n'est pas encore déployé (§ 2.2).

### 4.4 Préréglage « poses tracées » (2026-10-23, codé, non déployé)
Pour une animation où l'artiste trace **un SVG par pose**. Option `"prereglage": "poses_tracees"`.
- **Ce que l'animateur donne** : les images des poses, `entrees.svg_depart` (SVG de la première pose) et
  `entrees.svg_poses.fichiers` (SVG des autres poses ; obligatoire, sinon erreur claire).
- **Ce qu'il déclare** (décision du 2026-10-23) : les blocs (`svg_poses.blocs`, ex. main + gobelet) et les traits
  cachés (correction `cacher`). Sans bloc déclaré, la stratégie de bloc ne fait rien.
- **Automatique** : réglage validé du jus v8.
  - Passages entiers sur tous les passages **sauf le premier** (`passages_entiers: "sauf_premier"`).
    - Le premier garde l'appariement GenK.
    - Mesuré sur le jus : avec A → B compris, la note A → B passe de 602 à 816 et le total de 3 079 à 3 287
      (0 défaut fort).
  - Blocs par similitude, avec confiance (seuil 12 px). Occlusion par le bloc.
  - Fondus qui se recouvrent (0,5). Appariement par forme dans le bloc. Débris (25 px).
  - GenK, poses du milieu « intermédiaire » par défaut (un rôle écrit dans le fichier est gardé).
  - Arcs à travers les poses sur l'identifiant stable (§ 5.1).
  - V2-Small, `garder_coins`, largeur « profil », contrôle de qualité. Découpage désactivé (un seul calque).
- **Seuils relatifs** (`svg_poses.echelle_seuils: "auto"`) : les seuils en px des passages entiers (écarts entre traits,
  longueurs de morceaux, déplacements, débris, seuil du bloc) sont multipliés par :
  - taille du dessin / taille du dessin de référence ;
  - la taille du dessin est la diagonale de la boîte des traits de l'artiste, médiane des poses ;
  - la référence est le jus (1 509,5 px), donc **jus = exactement 1**.
  Les tolérances de précision du trait (fermeture à 0,5 px, contacts) ne changent pas. Les entrées du moteur ne
  changent pas.
- **Non compris** :
  - les **blocs rigides** : jamais essayés avec les poses tracées ;
  - la compaction est à 0,5 px sur toutes les poses ; le jus validé la commence à C, et son fichier le précise.
- Le fichier d'options prime toujours sur le préréglage.

### 4.5 Identifiant stable des traits sur toute la chaîne (2026-10-23, codé, non déployé)
- Avec les passages entiers, une chaîne du document = un morceau d'un passage (`reste/CD-a041-2`) : son identifiant
  change à chaque passage. Chaque **trait de l'artiste** reçoit en plus un identifiant qui le suit de pose en pose :
  `<calque>/s-<pose>-<NNN>`, avec la pose où il apparaît et son numéro dans le SVG de cette pose (ex. `reste/s-C-041`).
- **Héritage** : à la pose suivante, le trait qui prolonge le mieux un trait d'avant garde son identifiant.
  - Règle : recouvrement par les morceaux reliés ≥ 50 % de la plus courte des deux longueurs, un héritier par trait,
    le plus grand recouvrement d'abord.
  - Les autres reçoivent un identifiant neuf. Ex. trait coupé en 4 : un héritier, 3 neufs.
  - Un identifiant est **unique à chaque pose**.
- **Gardé dans le document** (`animation.json`, donc aussi dans le document de l'éditeur) :
  - `traits` = {identifiant : {pose : numéro dans le SVG}} ;
  - `correspondances` = la **table de correspondance** de chaque passage, avec, pour chaque morceau : chaîne, numéros
    a / b, identifiants, longueurs, états ;
  - sur chaque chaîne : `trait` et `trait_pose`.
  - Base de la future table éditable (§ 4.9), qui n'est pas encore lue en entrée.
- **Corrections** acceptant l'identifiant stable :
  - `supprimer` : tous ses morceaux, à toutes les poses ;
  - `deplacer` : ses morceaux à cette pose ;
  - `cacher` : traits cachés et traits de devant.
  - `remplacer` demande l'identifiant d'une chaîne, car le nombre de segments est celui d'un seul morceau.
- Les identifiants des chaînes et le rendu ne changent pas. Les passages qui ne sont pas « entiers » gardent leurs
  chaînes `tNNNN` (déjà stables en GenK).

### 4.6 Entrées non fiables (2026-10-23, codé, non déployé)
- **SVG**
  - Au plus 10 Mo, 50 000 éléments et 64 niveaux d'imbrication.
  - Entités XML, DOCTYPE avec déclarations internes et références d'entité refusés : alerte rouge
    `SVG_XML_INTERDIT`, ou `SVG_TROP_GROS` pour la taille.
  - Le DOCTYPE public de Krita reste accepté.
  - Taille vérifiée avant la lecture du fichier.
- **Images**
  - Au plus 50 Mo, 8 192 px de côté et 40 millions de pixels.
  - Ces limites sont lues dans l'en-tête, **avant le décodage**. Pillow seul ne refuse qu'à 179 millions de pixels.
- **Travail client** (`Contexte.production`)
  - Chaque fichier nommé par les options est relatif au dossier du travail, sans `..` ni chemin absolu.
  - `kukan_job` n'accepte que des noms de fichiers simples, au plus 64 fichiers et 200 Mo.
  - `kukan_verifier_svg` et `kukan_aimant` vérifient la taille de l'image avant de la décoder.
- **En local** (essais), les chemins restent libres comme avant.
- **Non déployé** (accord requis).

### 4.7 Poses tracées en déformant la pose d'avant : appariement par identifiant (2026-10-24, codé, non déployé)
**Décision (2026-10-24).** La méthode (c) est une méthode d'entrée **en plus** : on trace sur un rough, et chaque
pose suivante est la pose d'avant **déformée**, avec les mêmes traits. Le mode « B redessinée de zéro » reste
accepté, avec les mêmes fonctions (décision du 13 octobre). Il reste le mode par défaut.

**Option** `entrees.svg_poses.appariement` : `"forme"` (par défaut, comme avant) ou `"identifiant"`.
Elle n'est pas dans le préréglage `poses_tracees`.

**Ce que fait `"identifiant"`.** Elle s'applique à tout passage dont les deux poses ont leur SVG (de 2 à N poses).
- **Paires.** Deux traits sont reliés s'ils ont le même `id` SVG et le même numéro de sous-tracé. Un id absent ou en
  double dans une pose n'est pas utilisé.
- **Morceaux.** Chaque paire devient un morceau **entier**.
  - Même nombre de segments : les segments sont reliés nœud pour nœud (la déformation de l'artiste).
  - Sinon : coupes exactes aux fractions de longueur, dans le sens de l'artiste.
- **Traits présents à une seule pose.** Ils sont reliés entre eux par la forme. Le champ de transport est le
  déplacement des paires, sans moteur.
  - Un trait effacé se résorbe là où les paires voisines l'emmènent.
  - Un trait ajouté pousse depuis l'endroit d'où elles viennent.
  - Il s'accroche au trait le plus proche s'il est à 20 px ou moins.
- **Aucun appel au moteur** pour ces passages (événement `moteur_evite`, 0 $). Le reste ne change pas :
  - identifiant stable (§ 4.5), avec `par_identifiant` dans la table des correspondances ;
  - arcs (§ 5.1), rendu et corrections de l'animateur.

**Contrôle avant de se fier aux identifiants.** Il est indispensable avec Krita.
- Krita écrit `shapeN` renuméroté à chaque enregistrement. Sur le jus, les 83 ids de A existent dans B à E, mais les
  traits de même id sont à **241 à 334 px** l'un de l'autre.
- **Paire douteuse.** On compare chaque point de la paire au point le plus proche de chaque paire voisine (à 80 px
  ou moins). Si son déplacement s'écarte de plus de 30 px de tous ses voisins (écart médian sur les points), la
  paire est douteuse.
- **Seuils du passage.** Plus de 30 % de paires douteuses, ou moins de 50 % de traits appariés : les ids sont
  ignorés pour ce passage.
  - Alerte `IDENTIFIANTS_INCOHERENTS`.
  - Le passage est apparié par la forme, avec le moteur, comme avant.
- Sous ces seuils, les paires douteuses sont **gardées** et signalées (`IDENTIFIANTS_DOUTEUX`, ids SVG).
- Réglages : `svg_poses.identifiants` = {`ecart_px`, `rayon_px`, `part_douteux_max`, `part_min`}. Les distances
  sont multipliées par l'échelle des seuils.

**Cas de test disponibles, et ce qu'ils ne couvrent pas**

| Cas | Ce qu'on a | Ce qu'il teste |
|---|---|---|
| cyb, armure | SVG de A seulement ; B = image (JPEG). Archives = passage du moteur A → B | **Rien** de l'appariement par id : aucun SVG de B. Ils servent à la non-régression (identiques) |
| combat | SVG de A ; B = image | Idem |
| jus | 5 SVG Krita tracés **séparément** (non déformés) | Le contrôle : les ids Krita sont rejetés sur les 4 passages (92-96 % douteuses) ; retour à la forme |
| `svg_arrivee` (13 oct.) | 4 traits synthétiques, 2 poses | Le premier appariement par id (2 poses, même nombre de traits) |
| Tests du 24 oct. | Traits synthétiques, 3 poses | Doigts écartés de 22 px qui bougent de 90 px puis tournent ; doigt redessiné avec plus de nœuds ; trait effacé, trait ajouté ; ids renumérotés |
| Cas dur synthétique | A du jus (83 vrais traits Krita) **déformé par programme** en B′ puis C′ | Main, gobelet et paille : −12° et (+70, −40) px, puis −15° et (+40, +30) px, avec une zone de 90 px autour qui s'étire. Bouche courbée de 12 px. Plus de nœuds sur 2 traits. 2 traits effacés, 2 ajoutés, 1 effacé en C′ |

**Ce qui n'est PAS couvert : le cas dur réel.** Aucun B n'a été obtenu par un artiste en **déformant** A avec de
grands changements (volume qui tourne, élément redessiné en gardant l'id, ids que Krita garde ou non après
duplication et déformation).
- La déformation du cas synthétique est une transformation **douce et rigide** par zone. Une vraie pose déformée
  à la main est plus irrégulière.
- Les chiffres ci-dessous valident le **mécanisme**, pas la qualité artistique.

**Résultats (0 $)**
- Cas dur synthétique, préréglage `poses_tracees` + `appariement: "identifiant"`, options minimales :
  - 0 appel au moteur ;
  - A → B′ : 81 paires par id sur 83, 2 traits effacés, 2 qui naissent ;
  - B′ → C′ : 82 paires, 1 trait effacé ;
  - poses rendues contre les dessins : 99,9 % retrouvé à 1 px aux trois poses ;
  - une paire douteuse (`shape55`) : un trait du bas de la main, étiré de 47 à 125 px par la déformation, plus que
    ses voisins. Fausse alarme, gardée ;
  - planche `~/planche_appariement_id.png`.
- Jus avec l'option : les ids sont rejetés partout, puis le travail retombe sur la forme et le moteur (rejeu de
  l'archive). Le rendu est **identique au pixel près** au préréglage validé (0 px sur 65 images).
- Non-régression : cyb identique ; armure 0 px par rapport au code d'avant.

**Limites**
- Si Krita renumérote à chaque enregistrement, la méthode (c) **ne marche pas avec des fichiers Krita** : le contrôle
  le détecte et retombe sur la forme. Il reste l'éditeur de Kukan (les traits y gardent leur id par construction)
  ou Inkscape. **À vérifier sur un vrai fichier** (essai décrit au § 4.8).
- Un trait étiré beaucoup plus que ses voisins est signalé à tort (avertissement seulement).
- Après un passage par id, un passage qui a besoin du moteur (GenK) part des traits de l'artiste. C'est codé, mais
  pas essayé au GPU.
- Frontend (non fait, ≈ 2-3 séances) :
  - rough en fond ;
  - « dupliquer la pose et déformer » (sélection, maille, outils du journal) ;
  - mise en évidence des traits ajoutés ou effacés.

### 4.8 Krita : noms des calques et identifiants, essai à faire sur un vrai fichier
Ce qu'on sait sur nos fichiers Krita (jus, cyb, combat) :
- un seul calque exporté, aucun `<g>`, aucun nom de calque ;
- `<path id="shapeN">` numérotés de 0 à N−1 dans chaque fichier.

Il reste deux questions :
1. Comment Krita écrit un **calque** ou un **groupe** dans le SVG (nom gardé ?).
2. Si les **identifiants survivent** à « dupliquer le calque puis déformer », et à « effacer un trait, en ajouter un ».

L'essai est à faire par l'utilisateur (protocole ci-dessous).

**Protocole de l'essai (point 10 du § 10.4, ≈ 10 min, à faire par l'utilisateur).** Dans un document neuf, un calque
vectoriel nommé `trace` avec 3 traits, puis enregistrer après chaque étape par **Calque > Import/Export > Enregistrer
le calque vectoriel en SVG** : (1) `t1_trace.svg` tel quel ; (2) grouper 2 des 3 traits (Ctrl+G), nommer le groupe
`main` → `t2_groupe.svg` ; (3) **Calque > Dupliquer le calque**, renommer la copie `trace_B`, y déplacer un trait et
modifier les nœuds d'un autre → `t3_copie_deformee.svg` ; (4) dans la copie, effacer le premier trait dessiné et en
dessiner un nouveau → `t4_suppr_ajout.svg` ; (5) le document entier en `.kra` → `test.kra`. Déposer le tout dans
`~/test_krita/`. On vérifie : nom du calque / groupe dans le SVG ou seulement dans le `.kra` ; mêmes `id` entre t1 et
t3 ; numérotation en t4 (renumérotation = méthode (c) inutilisable avec les SVG Krita, sauf lecture du `.kra`).

### 4.9 Appariement entre poses tracées : cas laissés à l'animateur (jus, 2026-10-23, rien de codé)
Les numéros sont ceux des sous-tracés des SVG de l'artiste (`jusC_vectoriser.svg`, `jusD_vectoriser.svg`).
- **Manche gauche (C → D) : cas pour la TABLE DE CORRESPONDANCE ÉDITABLE.**
  - Le trait C41 (197 px) est coupé en 4 morceaux dans D : vers D34 (46 px), D33 (90 px), D36 (21 px), et un
    morceau de 40 px sans arrivée.
  - Les parties nées de D33 et D36 poussent à 6-9 px des morceaux de C41 : pli doublé autour de l'image 41.
  - C44-2 (83 px) est un doublon de D40 : il rétrécit et glisse sur le contour C46 / D35.
  - Pas de correctif automatique. L'animateur doit pouvoir dire dans une table « C41 → D33 + D34 + D36 »
    (un trait vers plusieurs, plusieurs vers un). Le moteur applique alors cette correspondance au lieu de la sienne.
- **Lèvres (C → D) : piste ABANDONNÉE (décision de l'utilisateur, 2026-10-23).**
  - Défaut : C88 (25 px, ligne de bouche) est apparié par la forme à la partie gauche de D84 (lèvre inférieure) et
    glisse de 29 px. D83 (37 px, à 6 px de C88) naît à la place : le rapport de longueurs 1,48 > 1,4 l'excluait.
  - Essai sur banc séparé, rien dans le dépôt :
    - rapport de longueurs assoupli pour les petits traits, écart de longueur toléré de **15 px** ;
    - plus de poids au candidat le plus proche : **0,5** × distance des centres (au lieu de 0,1).
  - Résultat :
    - **correct** : C88 → D83, et la partie gauche de D84 pousse depuis C87 ;
    - **3 liaisons changent sur jus, 0 sur cyb et armure** (identiques au pixel près) ;
    - 10 px : aucun effet ; 20 px : identique à 15 px.
  - Mais la note du scanner monte de **+125** : C → D 972 → 1 097, A → D 2 349 → 2 474.
    - Cause : la boucle C85 (12 px) devient un point isolé aux images 41-43.
    - C85 disparaissait déjà (« longueur ») ; elle était seulement moins visible.
  - Condition pour la retenter :
    - (1) un second dessin de test avec de petits traits proches (le seuil ne doit pas être réglé sur le seul jus) ;
    - (2) un traitement de C85 (petite boucle qui disparaît), sans hausse de la note sur les deux dessins.

### 4.10 Règles de dessin (à afficher à l'artiste)
**Poses (images)**
1. Même toile, même cadrage, en PNG ; trait noir net sur fond blanc, sans cadre ; rien hors de la toile.
2. Fais B en **déplaçant** les traits de A. Ne redessine pas ce qui ne bouge pas : c'est **copié**, pas retracé (un
   pan redessiné donne des traits en fondu et des doublons).
3. Déplace par **blocs entiers** (poing + manche) : un bloc qui ne fait que se translater est calculé exactement.
4. Chaque trait de B existe dans A, et l'inverse. Un élément qui apparaît doit exister dans une pose clé dessinée :
   le moteur ne crée rien, la pousse ne fait qu'un fondu.
5. Trace dans A les détails que B montre (iris, dents, mèches).
6. Une mèche = **un seul trait continu**, pas des petits bouts.
7. Même épaisseur et même noir dans A et B.
8. Grand mouvement → pose intermédiaire. Rotation ≤ 20-25° par passage pour ce qui se déforme (angle **provisoire**,
   mesuré sur des images générées par IA ; à confirmer sur une rotation dessinée à la main). Un déplacement plus
   grand que l'écart entre éléments semblables (doigts : 5-8 px) les fait confondre, sauf s'ils forment un bloc rigide.
9. Place les poses aux changements de direction et aux extrêmes ; la vitesse est réglée par Kukan.

**SVG**
10. Un trait = un geste, qui continue à travers les croisements.
11. Pas de miettes : rien sous ≈ 15 px à l'échelle 1024.
12. Peu de points : 2 à 4 segments par trait, au moins ≈ 40 px par segment à l'échelle 1024.
13. 30 à 100 traits par calque animé.
14. Pas de remplissage, pas de cadre.

**Indicateur de qualité du SVG** (espace 1024) : comparé aux démos du moteur (min / médiane / max).
| Critère | Démos (min / médiane / max) | Vert | Orange | Rouge |
|---|---|---|---|---|
| traits | 7 / 35 / 90 | ≤ 90 | ≤ 180 | au-delà |
| fragments (< 15 px) | 0 / 0 / 15,6 % | ≤ 15,6 % | ≤ 31 % | au-delà |
| longueur médiane | 88 / 135 / 483 px | ≥ 88 | ≥ 44 | en dessous |
| px par segment | 37,5 / 58 / 153 | ≥ 37,5 | ≥ 19 | en dessous |
L'indicateur est **indicatif** : les seuils décrivent les démos qui marchent, ce ne sont pas des causes prouvées.

### 4.11 Dessins horizontaux (16:9, 1920 × 1080) : état et proposition (2026-10-13)
**Ce que fait le moteur** : il **exige** des images et un `viewBox` carrés (trois assertions dans
`preprocess_forward.py`). Une image non carrée le fait **planter** ; il ne produit jamais de résultat faux sans le
dire (`docs/resultats/carre_1024.md` § 5).

**Ce qui est déjà résolu dans Kukan**
- Étape « entrées » : toute pose non carrée est posée sur une **copie de travail carrée** (côté = plus grand côté,
  marges blanches, dessin centré : 1920 × 1080 → 1920 × 1920, 420 px de marge en haut et en bas), comme la mise au
  carré officielle (`kukan.entrees.carre`).
- Le SVG de l'artiste est décalé de la même façon : `viewBox` carré, traits + 420 px. C'est vérifié par un test (M5 :
  1920 × 1080 → décalage `[0, 420]`).
- Le moteur ne voit donc que du carré (cas validé), et **le dessin n'est jamais rogné**.

**Ce qui manque**
1. Le **décalage n'est pas gardé dans le document d'animation** : `taille` = côté du carré. À ajouter :
   `doc["toile"] = {"largeur": 1920, "hauteur": 1080, "decalage": [0, 420]}` (les traits restent en px de la copie
   carrée ; le frontend et les exports retirent le décalage).
2. Les **exports sont carrés** (bandes blanches). À ajouter : recadrage à la taille d'origine pour le GIF, les PNG et
   les SVG (`viewBox="0 0 1920 1080"`, traits − 420 px). Le frontend affiche la toile d'origine.
3. Un contrôle : **aucun trait prédit dans les bandes blanches** (avertissement si le moteur y pose de l'encre).

**Résolution utile.** Le moteur travaille à 1024 : 1920 → 1024 = **× 0,533**. Le dessin occupe 1024 × 576 px et un
trait de 2 px devient ≈ 1,07 px (contre ≈ 1,6 px pour nos poses carrées de 1254). Conséquences :
- la vectorisation perd des détails fins : option `vectorisation.ligne_centrale_x2` conseillée ;
- **les calques agrandis compensent** : un personnage découpé dans son calque (ex. 600 px de large) est agrandi à
  1024 (× 1,7) avant le moteur. Avec des calques par personnage (§ 4.13), la résolution utile revient au moins à
  celle du dessin ;
- le **rendu final** se fait en px réels (1920), à partir des épaisseurs mesurées sur le dessin d'origine : la
  sortie garde la finesse de l'artiste.

**Fait le 2026-10-13** :
- `doc["toile"]` contient la largeur, la hauteur, le décalage et la pose de référence. Les traits posés dans les
  marges sont signalés (`TRAITS_DANS_LES_BANDES`).
- Les exports sont **à la taille d'origine** : images, calques, GIF aux proportions, SVG avec `viewBox` et coordonnées
  d'origine.
- Tests : `tests/test_toile_horizontale.py`.

**Essai réel fait le 2026-10-13** (autorisé, groupé avec GenK V2-Small, maximum 0,8 $ ; script
`tools/essai_16x9_genk.py`, données `~/essai_16x9_genk/`, planche `~/planche_essai_16x9_genk.png`) :
- 1er temps sans GPU : 0,29 $ estimés (au plus 0,36 $). 2e temps : **394,8 s, 0,386 $** (V2-Small, mémoire comprise).
  La formule prévoyait 300 s : la marge est portée de 24 % à **40 %** (couvre les 8 passages mesurés).
- Critères fixés avant :
  1. **aucun point dans les bandes** (0 sur 2 016 points du `tar_pred` brut, 0 trait dans le document) : réussi ;
  2. **décalage** : meilleur recalage image 16 → B = (1, 0) px, vertical 0 : réussi ;
  3. **image 16 contre B ≥ 90 %** : **89,3 %** retrouvés (97,5 % justes) : **manqué de justesse** ;
  4. **comparaison au carré** : 89,3 % contre 93,1 % pour le même passage carré. C'est la perte de résolution
     attendue (× 0,53 au lieu de × 0,82).
- **Avec les blocs rigides** (le réglage du produit), rejoué depuis l'archive sans GPU : image 0 = 99,9 % de A,
  **image 16 = 98,6 %** de B (99,4 % justes). Le calcul exact des blocs ne dépend pas de la résolution du moteur.
- À l'œil : animation propre, à la bonne place, aucune encre dans les bandes.

**Essai initialement proposé** (gardé pour mémoire) :
- **Données** : armure, poses A et B réduites à 1080 de haut (× 0,861), centrées sur une toile 1920 × 1080 ; même
  SVG décalé. On connaît le résultat carré (moteur seul 93,1 % ; avec la chaîne 98,9 %).
- **Réglages** : un calque, blocs rigides **désactivés** (sinon le moteur serait presque évité et l'essai ne
  prouverait rien), profondeur V2-Small.
- **Premier temps, sans GPU** : contrôles CPU (SVG sur l'encre, rien dans les bandes) et estimation exacte.
- **Coût estimé** : ≈ 524 segments → 302 s ≈ **0,30 $** (au plus 0,37 $ avec la marge ; 0,88 $ au pire au délai
  de 900 s).
- **Critères fixés avant** :
  1. aucun point du `tar_pred` dans les bandes ;
  2. |décalage vertical moyen| < 1 px ;
  3. image 16 contre B, après recadrage : au moins 90 % retrouvés ;
  4. comparaison avec le passage carré d'armure.

### 4.12 Améliorer le 16:9 : pistes mesurées sans GPU (2026-10-13)
**Diagnostic.** Le moteur voit la toile carrée de 1920 réduite à 1024 (× 0,53) : les traits fins de B se perdent dès
la vectorisation de la cible. On mesure, sans GPU, le **score maximal atteignable** par piste : B vectorisée à la
résolution vue par le moteur, ramenée en px réels, part de l'encre de l'artiste retrouvée à 1 px. Résultats
(armure 16:9, `~/essai_16x9_genk/pistes_plafonds.json`) :
| Piste | Échelle vue par le moteur | Atteignable (retrouvé / juste) | Passages GPU | Coût | Risque | Mesurable sans GPU |
|---|---|---|---|---|---|---|
| P0 actuel : toute la toile | × 0,53 | **75,1 / 86,8 %** | 1 | ≈ 0,30 $ | — | oui (fait) |
| référence : même dessin en carré (1254) | × 0,82 | 86,9 / 97,0 % | 1 | ≈ 0,30 $ | — | oui |
| **P1 zone d'action** (traits qui diffèrent entre A et B + 32 px, mis au carré) | × 0,95 | **92,0 / 96,5 %** | 1 | ≈ 0,30 $ | la zone peut couvrir presque tout le personnage (ici oui) ; ce qui est hors zone doit être fixe | oui (fait) |
| P2 calque par personnage (cadre du personnage + 16 px) | × 0,98 | 91,9 / 96,3 % | 1 par personnage | ≈ 0,30 $ chacun | plusieurs personnages = plusieurs passages | oui (fait) |
| P3 toile carrée plus grande (moteur à 2048) | × 1,07 | non mesuré | 1 | ≈ × 3 (étapes par pixel), mémoire 20-40 Go | modèles appris à 512 px, délai de 900 s menacé (`carre_1024.md` § 7) | partiellement |
| P4 deux carrés de 1080 qui se chevauchent | × 0,95 | 93,3 / 96,0 % | 2 | ≈ 0,60 $ | coutures : un trait qui traverse les deux carrés reçoit deux prédictions à raccorder | oui (fait) |
| P5 vectorisation × 2 seule (toute la toile) | × 0,53 (cible à 2048) | 88,2 / 92,1 % | 1 | ≈ 0,30 $ | — | oui (fait) |
| **P1 + vectorisation × 2** | × 0,95 (cible à 2048) | **97,9 / 99,2 %** | 1 | ≈ 0,30 $ | idem P1 | oui (fait) |
| découpage automatique actuel (zones D1 agrandies + partie fixe exacte) | × 2,4 pour chaque bras | non mesuré (≥ P1 sur ces zones) | **3** (dont un « reste » de 3 segments) | ≈ 0,78 $ | coût ; le petit reste paie 250 s de démarrage pour rien | oui (fait : 2 zones + 1 reste) |

**Ce que font d'autres outils** (recherche du 2026-10-13) :
- les modèles d'intervalles et d'interpolation imposent une taille et **réduisent ou complètent** l'image. ToonCrafter
  travaille à 512 × 320 ; RIFE et FILM complètent l'image (padding) avant le calcul ;
- les méthodes pour grandes images **découpent en tuiles qui se chevauchent** et fondent les bords (MultiDiffusion,
  Tiled Diffusion) : c'est notre piste P4, avec ses coutures ;
- XVFI montre que les grands mouvements en très haute résolution demandent un calcul **multi-échelle**. On ne peut
  pas le changer dans le moteur, d'où l'intérêt de recadrer sur la zone utile ;
- AnimeInbet travaille sur un **graphe de traits** (sommets), donc sur une forme vectorielle, comme nous ;
- Harmony travaille sur une toile plus grande que le cadre caméra (champ 16:9, décor qui dépasse, panoramique). C'est
  le modèle « calques + caméra » du § 4.13 ;
- la super-résolution (Real-ESRGAN anime, APISR) agrandit une image matricielle. Chez nous, la perte est dans la
  **réduction** avant le moteur, pas dans la source : la vectorisation × 2 joue déjà ce rôle, sans inventer de détail.

**« GLLT » (Global-Local Layer Transformation), vérifié dans le dépôt LayerInbetween (cf96f08)** : c'est le nom que
l'article de LayerInbetween (SIGGRAPH 2026) donne à ses **deux premières étapes**, déjà utilisées à chaque passage ;
aucun fichier ne porte ce nom :
- `main1_global_transform.py` : « Global Layer Transformation (1/4) » ;
- `main2_local_transform.py` : « Local Layer Transformation (2/4) ».

Pour chaque groupe de traits, une fenêtre de **2 × sa taille** (64 px au minimum) est découpée dans l'image, puis
ramenée à **256 × 256** (`raster_size`, `configs/model_configs.py`). Le réseau prédit la transformation de cette
fenêtre : translation, échelle de 0,2 à 2, rotation, cisaillement. L'étape locale fait de même trait par trait.
- C'est un **zoom appris par groupe**, mais à l'intérieur d'une image **déjà réduite à 1024**. Il ne récupère pas un
  détail perdu avant le moteur. Un grand groupe (fenêtre de plus de 256 px) est même réduit encore.
- **Il ne règle donc pas notre problème de résolution.** Il confirme seulement que recadrer **avant** le moteur
  (zone d'action, P1) est la bonne approche : on fournit au moteur l'image de travail la plus fine possible.

**Recommandation** : **P1 + vectorisation × 2** : un seul calque animé sur la zone d'action, mis au carré et agrandi ;
le reste du dessin en partie fixe, calculée exactement ; la cible vectorisée à 2048. Score atteignable 97,9 % contre
75,1 %, pour le même coût (1 passage). À coder ensuite (après accord) :
1. le découpage choisit **une seule zone d'action** quand plusieurs petites zones coûteraient plusieurs passages ;
2. un calque animé de **moins de ≈ 20 segments** n'appelle pas le moteur (traité en rigide ou fixe) ;
3. la vectorisation × 2 activée pour les toiles non carrées.

Aujourd'hui, P1 se teste **sans code**, par les options : calque forcé
`{"id": "perso", "zone": {"type": "rectangle", "box": [422, 424, 1505, 1507]}}`, agrandissement automatique désactivé,
`vectorisation.ligne_centrale_x2`.

**Appel de confirmation FAIT le 2026-10-13** (accord : 0,40 $ au plus, critère ≥ 93 % de B retrouvé) :
- **Réglage** : un calque animé sur la zone d'action `[422, 424, 1505, 1507]`, agrandissement automatique désactivé ;
  partie fixe calculée exactement ; cible vectorisée à 2048 ; blocs rigides désactivés ; V2-Small.
- **Premier temps sans GPU** : 1 passage, 501 segments, 0,29 $ estimés (0,41 $ avec la marge). Second temps avec un
  **accord strict de 0,40 $** : **313,5 s, 0,307 $**.
- **Résultat** :
  | Mesure | Toute la toile (× 0,53) | Zone d'action + vectorisation × 2 |
  |---|---|---|
  | image 16 contre B (retrouvé / juste) | 89,3 / 97,5 % | **99,0 / 99,6 %** |
  | image 0 contre A | 99,9 / 99,7 % | 99,9 / 99,7 % |
  | décalage | (1, 0) px | **(0, 0) px** |
  | traits dans les bandes | 0 | 0 |
  **Critère rempli** (≥ 93 %). À l'œil, main et lame sont propres et conformes à B, alors qu'elles étaient déformées
  sur toute la toile (`~/planche_16x9_zone_action.png`).
- **Conséquence** : la piste P1 devient la méthode retenue pour les toiles non carrées. Il reste à l'automatiser
  (point 12 de l'ordre du § 10.2).

**Appel de confirmation proposé avant l'essai** (gardé pour mémoire) : armure 16:9, P1 + × 2, blocs
rigides désactivés (pour juger le moteur), V2-Small.
- Estimation : ≈ 300 s ≈ 0,29 $ ; accord strict 0,40 $.
- Critère fixé avant : image 16 contre B **≥ 93 %** retrouvés (contre 89,3 % aujourd'hui, et 93,1 % pour le carré),
  aucun trait dans les bandes, pas de décalage.

Sources :
- [ToonCrafter](https://huggingface.co/spaces/Doubiiu/tooncrafter/blob/0366b8bbad80289daa13d3cc0bfa8b20238777d4/README.md) ;
- [RIFE](https://arxiv.org/pdf/2011.06294) ;
- [Tiled Diffusion / MultiDiffusion](https://github.com/shiimizu/ComfyUI-TiledDiffusion) ;
- [XVFI](https://arxiv.org/pdf/2103.16206) ;
- [AnimeInbet](https://arxiv.org/html/2309.16643v1) ;
- [Harmony, champ 16:9](https://forums.toonboom.com/t/why-is-16-9-not-simple/5183) ;
- [Real-ESRGAN anime](https://mintlify.com/xinntao/Real-ESRGAN/models/anime-models), [APISR](https://openaccess.thecvf.com/content/CVPR2024/supplemental/Wang_APISR_Anime_Production_CVPR_2024_supplemental.pdf).

### 4.13 Décors (ville, paysage) : calques séparés (2026-10-13)
**Oui, les calques séparés sont la bonne méthode**, et ils existent déjà en partie.
- **Décor fixe** : calque « fichier » ou zone fixe (règle D4 du découpage). Il est copié en pixels **exactement**,
  sans GPU, et « garde sa place » (M17, M22 : décor et immeuble de la mission 11).
- **Un calque par personnage** animé : un passage du moteur par couple de poses et par calque. Il est agrandi si
  besoin (§ 4.11), et l'ordre des calques gère qui passe devant (calque de premier plan, M8).
- **Personnage ou objet rigide** dans son calque : blocs rigides (translation exacte, 0 $).

**Mouvement de caméra.** Aujourd'hui, l'étape d'alignement **annule** un mouvement de caméra entre les poses : elle
recale B sur A, le résultat est stabilisé. À ajouter :
- garder la transformation mesurée par l'alignement (échelle, translation) **par pose** ;
- la réappliquer, interpolée (et assouplie), au rendu : décalage du décor et des calques, comme une **translation de
  bloc** du calque entier. C'est sans GPU, et un zoom simple est possible ;
- une option « caméra fixe / caméra suivie » pour l'artiste.

**Import calque par calque**, par ordre de préférence :
1. **un fichier à plusieurs calques** : SVG avec un groupe nommé par calque (`<g id="calque-perso1">`,
   `<g inkscape:label="decor">`). Depuis M2, le lecteur garde le groupe de chaque trait ; reste à **créer les calques
   Kukan depuis ces groupes** (calques manuels, priorité de l'audit) ;
2. pour les images : **ORA / KRA** (Krita) ou **PSD** à calques : à coder (lecture des calques, alignement par calque) ;
3. en attendant : **un fichier par calque** (PNG avec transparence pour un décor, poses par calque).
   `entrees.svg_depart` n'accepte aujourd'hui qu'**un** SVG (traits répartis par calque selon leurs points) : un SVG
   par calque est à ajouter si l'on garde ce mode.

**Effet sur le coût et les limites**
- Décor fixe ou en translation (caméra) : **0 $** de GPU.
- Chaque calque animé : un passage par couple de poses (≈ 0,25-0,35 $). Exemple : 2 personnages, 3 poses →
  4 passages ≈ 1,1-1,4 $. Un calque entièrement rigide coûte 0 $.
- Les limites `max_calques` du plan comptent tous les calques. On peut ne compter que les calques **animés** : le
  décor ne coûte rien. Proposition : Free 1 animé + décor, Indépendant 3, Studio 12, Entreprise sur contrat.
- Le temps CPU augmente un peu (découpage, rendu par calque), sans effet notable sur le coût.

### 4.14 Ce que le 16:9 et la main cachée ont montré (2026-10-28 / 29)
- **Passage 16:9 A → B** (1 appel GPU, 0,232 $) : toile 1672 × 941 ; bras = bloc presque rigide ; réglage retenu
  « bloc » (passage entier + bloc « bras » déclaré). Le poing, dessiné seulement en B, poussait en fondu gris DEVANT la
  veste.
- **Test du poing** (0 $, copie en mémoire) : un élément qui sort de derrière un contour demande (1) de retirer le
  fondu automatique des orphelins, (2) que l'élément sorti CACHE ce qui est derrière lui (ligne intérieure de veste),
  (3) de régler le début de la sortie. Le « calque de premier plan » de la mission 8 ne suffit pas : tout est dans un
  seul calque, et sa variante « tout trait » rogne l'image 16 (manchette, ceinture) → seuls les traits qui ne touchent
  pas l'élément à la pose dessinée sont cachés.
- **Correction « sortir »** (point 34, codée le 2026-10-29, `kukan/sortie.py`, non déployée) : l'animateur clique
  l'élément (ses traits en B) et le contour (ses traits en A) ; le code trouve le porteur (voisins qui bougent :
  manchette), ferme la silhouette avec lui, propose la position de départ (copie réduite à 0,7, portée par le bras,
  glissée derrière le contour jusqu'à ce que rien ne dépasse avant le quart du passage), retire le fondu et cache les
  traits de derrière. 16:9 : poses identiques au rendu validé (image 16 : 0 px ; image 0 : les 62 px déjà vus au test
  du poing, plus proches de A), rien de visible jusqu'à l'image 4, 11 % à l'image 5, moitié vers l'image 7, entier à
  l'image 13, encre noire, ligne de veste derrière le poing. Planche `~/planche_test_16_9_poing_v2.png`.
- Interface (éditeur, à faire) : deux clics (élément, contour), la position de départ proposée affichée sur la pelure
  de A et réglable (déplacer / échelle), puis « valider ». Opération du journal : § 6.5.

## 5. Animation et types de passage

### 5.1 Rythme continu et arcs à travers les poses (2026-10-24, codé, non déployé)
- **Arcs** (`animation.arcs: true`, compris dans `poses_tracees`).
  - Avec les passages entiers, chaque morceau n'existe que dans son passage. Pour la courbe à travers les poses, sa
    position à la pose d'avant et à la pose d'après est prise dans le passage voisin : déplacement du point le plus
    proche (≤ 3 px) des morceaux voisins du **même trait de l'artiste** (identifiant stable, § 4.5).
  - Catmull-Rom centripète entre ses deux poses.
  - Sans voisin, ligne droite. Les traits qui naissent, disparaissent, en fondu ou cachés restent en ligne droite.
  - Les poses ne changent pas (images 0, 16, 32, 48, 64 du jus identiques au pixel).
  - Jus : note du scanner 3 079 → **2 887** (meilleure sur les 4 passages, 0 défaut fort).
- **Rythme continu** (`animation.timing.rythme: "continu"`, **désactivé**, hors du préréglage).
  - Le mouvement ne ralentit qu'aux poses clés et garde sa vitesse à travers les poses « intermédiaire ».
  - Courbe d'Hermite : passage du milieu linéaire, premier en accélération, dernier en décélération. Chaque pose
    reste sur son image.
  - Jus : note 3 079 → 3 878 (3 défauts forts) ; avec les arcs, 3 558 (2 forts).
  - Ce ne sont pas de nouveaux dessins : sans ralenti près des poses, les états du milieu (bouche B → C, doigts
    D → E) restent plus longtemps à l'écran. À reprendre quand ces états seront propres.
  - Planches `~/planche_rythme_arcs.png` et `~/planche_rythme_visage.png`.
- Limite : la vitesse **dans l'espace** peut encore changer à une pose si deux passages n'ont pas la même amplitude
  (même nombre d'images par passage).

### 5.2 Rotation de tête dessinée : type de passage « rotation » (2026-10-24)
Essai : `~/rotation_test/` (face → ≈ 22°). Pose A `rotation_1.svg`, pose B `111_ferme.svg` : copie de `111.svg`,
contour du visage refermé à la tempe gauche. Un appel GPU A→B (V2-Small, 150,6 s, ≈ 0,15 $), archivé dans
`~/rotation_passage/archive/` ; tout le reste a été rejoué à 0 $.

**Angle.** Selon l'indice mesuré, 18-28° (36° d'après l'écart des iris). C'est à la limite des 20-25° par passage.

**Ce que l'animateur choisit : le type de chaque passage** (`entrees.svg_poses.types_passages`,
ex. `{"A-B": "rotation"}`).
- **« rotation »** : une tête ou un objet qui tourne, avec une pose d'arrivée redessinée.
  - Le passage est refait depuis les SVG entiers de l'artiste, avec les seuils « toile ».
  - Résultat sur l'essai : note du scanner 829, aucun défaut fort. La bouche et l'œil éloigné restent propres.
- **« déplacement », « déformation » ou aucun type** : le réglage général, celui validé sur le jus.
  - Ne rien choisir ne change aucun travail existant.

**Corrections faites pendant l'essai** (valables pour tous les travaux) :
- **Boucles fermées** (`svg_poses._recaler_boucle`).
  - Défaut : le contour du visage partait de la tempe droite en A et de la tempe gauche en B. Les points
    traversaient le visage (372 px) et le contour se repliait en boule au milieu du mouvement.
  - Correction : le point de départ et le sens de la boucle de B sont recalés sur la prédiction du moteur, mais
    seulement s'ils sont nettement décalés.
  - Avec le préréglage, la note du scanner passe de 30 317 à 1 664.
- **Seuils « toile »** (`svg_poses.echelle_seuils: "auto"`) : côté de la toile / 1254 (la toile du jus).
  - Pourquoi : le moteur voit toujours la toile entière à 1024 px, donc son erreur suit la toile, pas la taille
    du dessin.
  - L'ancienne règle, diagonale des traits (`"dessin"`), donnait ×0,52 pour une petite tête : seuils trop
    stricts, contour et sourcils en fondu.
  - Pour le jus, l'échelle reste exactement 1,0.

**Défauts restants, et ce qu'on en sait :**
- **Ligne oreille-joue (images 6-10)** : elle apparaît tard.
  - Un morceau du contour de A (142 px, à côté de l'oreille) se résorbe.
  - Sur B, ses voisins sont collés : celui d'avant est étiré ×1,23, celui d'après glisse depuis la tempe. La
    portion libre en face est donc de 0 px.
  - La règle « continuité le long d'un trait » (portion libre de longueur comparable, 0,5 à 2 fois) ne s'applique
    jamais ici : elle n'a pas été ajoutée.
  - Il faudrait une règle de re-répartition le long du trait, qui reprend la longueur au voisin étiré. Non décidée.
- **Option 2** (zone « rotation » + calque visage) : non testée. Elle sera testée sur la pose à 45° (trois-quarts),
  quand l'animateur la fournira.
  - Condition : 1 appel GPU, plafond strict de 0,40 $, accord, résultat archivé.
  - À comparer à l'option 1 : tenue de la bouche, des yeux, de l'oreille et du contour, vitesse du passage, et ce
    que le calque visage change.
  - L'option 1 est le réglage provisoire en attendant.
- **Option 3** (corriger la bouche dans le chemin du préréglage) : correctif de fond, à faire plus tard pour rendre
  le type « rotation » inutile. Revalidation du jus obligatoire. Deux causes trouvées :
  - un morceau relié dans le mauvais sens (la ligne de la bouche) ;
  - la lèvre fermée de A posée sur un trait ouvert de B.
  - Même famille de défaut sur l'œil gauche : l'œil de A est posé en entier sur la paupière du haut, avec un
    morceau en double.
- **Cas non testés** : trois-quarts, profil, inclinaison, plusieurs poses à la suite, mèches qui se croisent.

### 5.3 Rotation : ce qui disparaît (continuité et compression, 2026-10-27, codé, non déployé)
**Cas réel** : rotation dessinée à la main C (≈ 45°) → D (≈ 22°), `~/rotation_test/`. L'œil et le sourcil éloignés
de C disparaissent derrière le profil ; D n'en garde qu'une bande (la marque de l'œil) et un crochet de sourcil.

**Option** `entrees.svg_poses.rotation_disparitions` (booléen, **vrai par défaut**, ne s'applique **qu'aux passages de
type « rotation »**). Calcul au rendu seulement (0 $, entrées du moteur inchangées), poses **exactes** (images 0 et
16 identiques au pixel aux dessins de l'artiste). Deux règles (`kukan/disparitions.py`) :
1. **Continuité** : un morceau qui disparaît et un morceau qui naît, collés au même voisin (même trait de l'artiste,
   bout commun), sont le même bout de contour découpé autrement : une chaîne reliée est montrée aux images du milieu,
   les morceaux d'origine aux poses. Effet sur C → D : menton continu (trou des images 3-10 supprimé).
2. **Compression** (règle par défaut depuis le 2026-10-27) : les morceaux d'un trait **majoritairement disparu**
   (≥ 50 % de sa longueur ; œil éloigné, sourcil) se **plaquent sur ce qui les remplace** à l'arrivée. Chaque point
   va au point le plus proche des morceaux reliés qui les touchent au départ (≤ 12 px), à leur position d'arrivée :
   l'œil de C se comprime sur la bande de l'œil de D, le sourcil sur son crochet. Un morceau plaqué sur un **autre**
   trait que le sien est raccourci à 30 % (le trait s'amincit au lieu de faire une masse). Mouvement continu jusqu'à
   l'image 16. **Un morceau sans remplaçant n'est pas modifié.** Un trait déjà réglé par l'animateur (cacher,
   supprimer…) n'est jamais touché.
   - Ancienne règle, gardée en réglage interne (`REGLAGES["disparition"] = "silhouette"`, pas une option de
     l'API) : rétrécissement vers la silhouette du dessin, fini à 65 % du passage ; l'œil disparaissait vers l'image
     10 et le profil restait vide.
- **Résultat C → D** : note du scanner 541 → 409, poses 0 / 0 px, jugé « meilleur à l'œil » par l'artiste. Rendu de
  référence : `~/rotation_CD3b.gif`.
- **Défauts connus, acceptés** (à ne pas promettre) : petit amas de l'œil éloigné sur la bande (images 8-12) ; mince
  double trait sur l'arête du nez (images 8-11 : un morceau du contour de la joue qui disparaît en glissant le long de
  l'arête) ; ligne de joue entre l'œil et le nez.
- **Option non intégrée, désactivée** : « partage du nez » (le morceau de joue prend une part du nez d'arrivée) :
  supprime le double trait mais replie le nez en crochet (images 6-11). Script hors dépôt.
- **Essais écartés** (pour ne pas les refaire) : cacher l'œil derrière un polygone « au-delà du profil » (sourcil en
  barres) ; refermer le contour de D pour l'appariement (bouche cassée) ; fin de disparition tardive à 87,5 %
  (mouvement arrêté à l'image 13) ; compression sans raccourcissement (œil en masse) ; raccourcir tous les morceaux
  (sourcil en miettes) ; projection sur tout le trait d'arrivée (cordes à travers le nez).
- **Frontend** : le type de passage se choisit **par passage** dans l'assistant et dans l'éditeur (liste :
  « déplacement / déformation », « rotation (tête ou objet qui tourne) », « aucun »). Expliquer en une phrase :
  « rotation : ce qui passe derrière se plaque sur le profil ; le reste est refait depuis vos dessins ». Le
  booléen `rotation_disparitions` n'a pas besoin d'être montré (vrai par défaut) ; le prévoir dans les réglages
  avancés.

### 5.4 Traits cachés : interface entre le moteur et le composant « trait caché » (validée, 2026-10-13)
Le composant « trait caché » du frontend est branché **à part** (décision de l'utilisateur). Le principe : le
**composant déclare**, le **moteur calcule et rend**. Le moteur reste la seule source des positions et de ce qui est
visible à chaque image, car il produit aussi le GIF, les PNG et les SVG. Le composant ne recalcule rien : il affiche
un aperçu approché à partir de ce que le moteur renvoie (même règle que l'éditeur, décision « aperçu approché + rendu
serveur »).

**Ce que le composant fournit** : une opération du journal (§ 6.5), à la pose, nouvelle (`cacher`) :
```json
{"op": "cacher",
 "traits": ["perso1/t0012", "perso1/t0013"],       // traits cachés (identifiants stables)
 "derriere": {"traits": ["perso1/t0004"]}           // forme qui cache : traits fermés de devant…
           | {"polygones": {"A": [[[x, y], ...]], "B": [...]}},   // …ou une forme dessinée par pose
 "sens": "passe_derriere" | "sort_de_derriere",     // visible -> caché, ou caché -> visible
 "pose_cachee": "B",                                // pose où le trait est entièrement caché
 "debut_image": 6,                                  // facultatif : première image où il commence à être coupé
 "position_cachee": "glisser" | "garder_moteur" | {"segments": [...]},   // voir § 5.5
 "compression": null | 0.4,                         // facultatif : aplatissement le long du contour
 "marge_px": 4}
```
- `derriere.traits` : forme fermée par ces traits, recalculée à chaque image à partir de leurs positions animées
  (elle suit le mouvement). `polygones` : forme dessinée par l'artiste à chaque pose, interpolée entre les poses.
- `debut_image` absent : la coupe commence dès que le trait touche la forme (calculée).
- `position_cachee` : `glisser` = calculée par le moteur (§ 5.5) ; `garder_moteur` = position prédite par le
  moteur, seulement masquée ; `segments` = position donnée par l'artiste (même nombre de segments).
- Validation : traits et formes connus ; forme fermée (sinon `OCCLUSION_FORME_OUVERTE`) ; un trait ne peut pas être
  caché par lui-même ; une seule opération `cacher` active par trait et par passage (la dernière remplace).
- **Le composant émet `cacher` ET « disparu »** (décision de l'utilisateur, 2026-10-14) : pour un trait qui passe
  derrière à la pose B et qu'une pose suivante montre de nouveau (A → B → C), le composant déclare `cacher` (glissement
  et coupe) et marque aussi le trait **« disparu » à B**, pour qu'il sorte de la référence GenK envoyée au moteur pour
  B → C (le moteur ne peut pas prédire un trait invisible). À C, l'encre qui ressort est rattachée à la même chaîne
  (G4, § 5.5 ; sinon `OCCLUSION_SANS_REAPPARITION`). Côté moteur, ce marquage « disparu » demandé avant le GPU n'est
  PAS encore lu : aujourd'hui le trait ne sort de la référence que si les corrections le jugent disparu (il faut les
  identifiants des traits au moment de l'appel du moteur) — à coder avec le branchement du composant.

**Ce que le moteur renvoie** (dans `animation.json`, § 6.2) :
- dans la chaîne : `occlusion: {derriere, sens, pose_cachee, source: "artiste" | "auto"}` ; `positions` à toutes les
  poses (y compris la position cachée calculée) ; `etats[pose_cachee] = "cache"` ;
- dans chaque image : `visible: {id: [[t0, t1], ...]}` = portions visibles du trait en **fractions de longueur**
  (même unité que `masquer_portion`), seulement pour les traits concernés (absent = entièrement visible) ;
  `formes_devant: {id_forme: [polygones]}` pour dessiner la forme dans l'aperçu ;
- des alertes : `OCCLUSION_FORME_OUVERTE`, `OCCLUSION_TRAIT_VISIBLE` (le trait dépasse encore de N px à la pose
  cachée), `OCCLUSION_SANS_REAPPARITION` (trait caché qui devrait ressortir mais n'est pas retrouvé, § 5.5).

**Qui fait quoi** (pour ne rien faire en double)

| Mécanisme | Qui le déclenche | Qui calcule | Le composant |
|---|---|---|---|
| **Disparition** (trait sans encre en B, rétrécit jusqu'à un point) | moteur, automatique | moteur | l'affiche (état `disparu`) et propose « cacher derrière… » : l'opération `cacher` remplace alors la disparition pour ce trait |
| **Pousse** (encre de B sans trait, pousse depuis un point) | moteur, automatique | moteur | l'affiche (état `ne`) et propose « sort de derrière… » : `cacher` avec `sens = sort_de_derriere` remplace la pousse (le trait poussé n'est pas dédoublé) |
| **`pousser`** (trait présent seulement à une pose, dessiné par l'artiste) | éditeur (outil de dessin), pas le composant | moteur | — ; s'il faut qu'il sorte de derrière une forme, le composant ajoute ensuite `cacher` sur ce trait |
| **`ajouter` + `cache_par`** (trait donné à chaque pose + masque) | reste l'opération « bas niveau » ; le composant l'émet seulement si l'artiste dessine le trait à **chaque** pose | moteur | sinon il émet `cacher` (positions calculées par le moteur) |
| **Calque de premier plan** (toutes les formes fermées d'un calque cachent les autres calques) | réglage du calque (§ 6.7), pas le composant | moteur | indique qu'un trait est **déjà** caché par un calque de premier plan, pour éviter une déclaration inutile ; les deux masques s'additionnent |

Règles :
- Le composant n'envoie que des **déclarations** ; il ne modifie jamais `positions` ni `visible`.
- Un trait déclaré par `cacher` est **exclu** de la disparition, du rognage et du retrait des doublons pour le passage
  concerné.
- L'aperçu du composant coupe les traits avec `visible` ; le rendu final et les exports viennent du moteur.

### 5.5 Glissement derrière dans Kukan (plan, 2026-10-13)
But : porter le « calque de devant » de la mission 8 dans Kukan, sur les traits vectoriels et sans GPU. Un trait qui
passe derrière une forme **continue de bouger** et est **coupé petit à petit**, au lieu de rétrécir (disparition) ou
de rester posé sur le contour (sortie brute du moteur).

**Existant réutilisable** : `occlusion.inside_mask` (intérieur des formes fermées) ; `occlusion.hidden_target`
(glissement **horizontal** seulement, contour supposé vertical, zone de l'oreille donnée à la main) ; masque
`cache_par` au rendu (`rendu._masque_devant`) ; état `cache` déjà prévu dans le schéma ; `smear.rigid_fit`
(mouvement rigide d'un ensemble de points).

**Étapes**
- **G1, position cachée générale** : la forme de devant à la pose cachée = intérieur des traits de devant. Le trait
  caché est d'abord **transporté** par le mouvement rigide de la forme de devant entre les deux poses, ou gardé à la
  position du moteur si elle est déjà derrière. Ensuite il **glisse** le long de la normale moyenne du contour, au
  point de contact, vers l'intérieur, jusqu'à être entièrement à `marge_px` derrière le contour. La compression le
  long de cette normale est facultative. Cela remplace le glissement horizontal.
- **G2, états** : `cache` à la pose cachée ; trait exclu de la disparition, du rognage et des doublons ; épaisseur et
  ton mesurés à la dernière pose où il est visible (`mesure_pose`).
- **G5 — FAIT le 2026-10-14** : opération `cacher` du journal (`journal.OPS_POSE`, `animation.corriger`) au format
  du § 5.4, avec : forme en traits ou en **polygones par pose** (interpolés entre les poses, rendu et export compris) ;
  `debut_image` convertie en position dans le passage (reste juste si le timing change ; pour `sort_de_derriere`,
  elle marque l'image après laquelle le trait n'est plus coupé) ; la dernière opération sur un
  trait l'emporte ; alertes `OCCLUSION_TRAIT_VISIBLE` (dans `valider` → `alertes`, et en événement dans un travail) et
  erreur `OCCLUSION_FORME_OUVERTE` (moins de 200 px d'intérieur) ; champs `visible` et `formes_devant` des images
  dans le document de l'éditeur (`rendu/editeur/animation.json`, `rendu.occlusion_document`). `kukan_editer`
  (validation du journal) ne calcule pas encore `visible` (il faut les mesures de rendu) : l'éditeur le lit dans le
  document rendu. Bouchons de l'armure (`tools/valide_cacher_bouchons.py`, `docs/resultats/cacher_bouchons_armure.json`,
  planche `~/planche_cacher_bouchons.png`) : `pousser` en B puis `cacher` « sort_de_derriere » contre la correction
  posée à la main → image 0 identique (0 px), **0 px différent hors des bouchons** sur toutes les images, image 16
  98,59 % des deux côtés ; sortie aux images 7-13 (main : 6-14) ; le bouchon de droite glisse de 68 px et sort un peu
  plus vite (69 → 128 px visibles entre les images 12 et 13). Avec la position cachée donnée, l'image diffère de la
  version manuelle seulement par son `contour_px` 5 (non exposé dans `cacher`).
- **G1 + G2 — FAITS le 2026-10-14** (`kukan/cacher.py`, `cacher(doc, declaration)`, sans GPU) : position cachée =
  transport rigide de la forme de devant + compression facultative + glissement le long de la normale moyenne au
  contact, jusqu'à `marge_px` derrière le contour ; état `cache`, `poses_cachees` (épaisseur et ton de la pose voisine
  visible, lus par `rendu.mesurer`), coupe au rendu et à l'export par `cache_par`. Oreilles M8 en rejeu (0 $,
  `tools/valide_cacher.py`, `docs/resultats/glissement_oreille_m8.json`, planche `~/planche_glissement_oreille.png`) :
  image 0 100 / 100 % mais **PAS identique au pixel près : 53 px différents** (vérifié le 2026-10-14 ; critère
  « image 0 inchangée » NON atteint ; cause : un trait `cache_par` est rendu À PART des autres traits puis superposé,
  sans le recollage avec ses voisins — 54 px même sans masque, le long de l'attache de l'oreille x 720-728 ; défaut
  déjà présent pour `ajouter` + `cache_par`). **CORRIGÉ le 2026-10-14** : le trait est rendu avec les autres traits du
  calque, puis seuls ses pixels sous le masque reprennent la valeur du calque sans lui → image 0 identique (0 px) ;
  bouchons d'armure : image 0 = sans bouchons (0 px), 98,59 % ; image 16 97,4 / 99,4 (défaut Kukan 97,2 / 99,5) ; oreille visible à l'image 16 150 → **0 px** ;
  encre de l'oreille hors de la vraie arrivée aux images 14-16 24-30 → **0 px** ; coupe progressive (436 px à
  l'image 0, 89 à l'image 10, 0 dès l'image 11) ; pas de double trait (vu en M8 vers l'image 12). La déclaration
  (opération `cacher` du journal) vient en G5.
- **G3 — FAIT le 2026-10-14 (export SVG)** : `rendu.portions_visibles` (fractions de longueur, mêmes règles que le PNG :
  premier plan, `cache_par`, gomme `masquer_portion`) + `rendu.couper_courbe` ; les SVG par image coupent les traits
  cachés (bouchons de l'armure : encre cachée dans les SVG 24-74 px → 0-5 px par image ; coupe sur la ligne centrale,
  jusqu'à ≈ 2 px du bord du PNG). Suite complète 238 passés, `kukan-inbetween` redéployé. Le champ `visible` du document
  reste à brancher avec G1-G2 / G5.
- **G3, coupe à chaque image, en vectoriel** : portions visibles en fractions de longueur (`visible`), à partir de
  la forme de devant de chaque image. Le rendu les utilise, et les **exports SVG coupent les traits**. Aujourd'hui
  l'export SVG par image ignore le masque du premier plan et `cache_par` (les traits cachés y restent visibles) :
  c'est corrigé au passage.
- **G4, « caché puis qui réapparaît »** (A visible → B caché → C visible) : la chaîne est **gardée** à B (état
  `cache`) au lieu d'être retirée. En GenK, elle sort de la référence envoyée au moteur, qui ne peut pas prédire un
  trait invisible. À C, l'encre non couverte est comparée à la forme de la chaîne ramenée par le mouvement de la
  forme de devant. Si elle correspond, elle est **rattachée à la même chaîne** (même identifiant), qui ressort de
  derrière (glissement inverse) au lieu de repousser depuis un point. Sinon, alerte `OCCLUSION_SANS_REAPPARITION`.
- **G5** : opération `cacher` dans le journal et sa validation (§ 5.4), documentation, tests.
- **G4 — CODÉ le 2026-10-14, critère « sans saut » NON atteint, non déployé** (`cacher.reapparition`, option
  `reapparition` active, `reapparition_tolerance_px` 4 ; `contour_px` exposé dans `cacher`). Chaîne qui continue après B
  (gardée dans la référence) : elle ressort d'elle-même (même identifiant). Chaîne arrêtée à B (disparue) : les traits
  poussés du passage B → C posés sur la forme ramenée (mouvement rigide de la forme de devant A → C) sont retirés et la
  chaîne est prolongée jusqu'à C ; sinon alerte `OCCLUSION_SANS_REAPPARITION`. Choix : le trait n'est PAS retiré de la
  référence GenK par `cacher` (il faudrait les identifiants au moment du moteur) ; il en sort seulement s'il est
  « disparu » après corrections. Mesure (`tools/valide_reapparition.py`, `docs/resultats/reapparition_oreille_m8.json`,
  planche `~/planche_reapparition_oreille.png`) : oreilles M8, A → B → A′, passage 2 = passage 1 inversé (moteur
  parfait) + corrections sur l'encre de A′, sans GPU. Deux variantes (oreille gardée / retirée de la référence) :
  même identifiant à A et A′ OUI ; 0 pousse de l'oreille OUI (variante retirée : `a7e20d3b5` rattaché, couverture
  100 %, décalage 0) ; image A′ 99,9 / 99,6 contre image 0 100 / 100 (−0,4 ≥ −0,5) OUI ; longueur visible qui décroît
  puis croît, mais **saut de 32 %** entre les images 11 et 12 (43,8 → 2 px ; ≤ 15 % demandé) → NON. Le saut vient du
  glissement derrière (G1, déjà dans l'étape 3) : la fin de l'oreille est presque parallèle au contour et passe
  derrière en une image ; à l'image 11 elle est déjà confondue avec le trait du contour (invisible à l'œil). Avec
  `contour_px` 2 : saut 28 %. Pistes : ralentir le glissement pendant la coupe (temps propre au trait caché), fondu du
  dernier croissant, ou mesure sur l'encre visible (à décider). **Piste 3 retenue par l'utilisateur, mesurée le 2026-10-14** (« sans saut » jugé sur l'ENCRE
  RÉELLEMENT VISIBLE : pixels < 160 qui partent quand on retire le trait, donc hors du trait du contour ; brut gardé) :
  oreille, plus grand saut **23 %** (190 → 89 → 0 px d'encre aux images 9-11, sur 436) → critère ≤ 15 % **toujours NON
  atteint** ; brut 32 %. Bouchons de l'armure, même mesure par bouchon (la mesure ne masque pas de vrais sauts) :
  `cacher`, bouchon de droite **80 %** (12 → 72 px entre les images 12 et 13 : il jaillit ; brut 62 %, et la longueur
  brute clignote 3,6 → 0 → 3,5 → 11,8 → 0 aux images 7-11) ; bouchon de gauche 53 % (brut 32 %) ; version posée à la main
  21 % et 24 % (brut 22 % et 33 %). Rien déployé.
- **Critères revus par l'utilisateur (2026-10-15)**, calés sur la version posée à la main : (1) saut d'encre visible
  ≤ 25 % entre deux images ; (2) aucune alternance (tolérances fixées avant la mesure : longueur brute monotone à
  0,5 px, encre visible monotone à max(3 px, 5 %)) ; jugement sur planche. Oreille (23 %) acceptée.
  **Corrections des bouchons** (G6, `kukan/cacher.py`, sans GPU) : (a) **masque plein** (`occlusion.inside_mask(...,
  traits_interieurs=True)`, utilisé par `cacher` et la coupe au rendu) : chaque trait intérieur de la forme de devant
  laissait une fente de 3 px hors du masque → le bouchon de droite glissait de 68 px pour trouver une zone assez large
  et réapparaissait dans les fentes (clignotement des images 7-11) ; (b) **porteur** (`porteur`, `porte_par` « auto »
  ou liste) : le trait caché suit le bloc qui le porte (traits voisins hors de la forme de devant : la poignée, 12 px)
  et ne glisse que du reste (6 et 10,5 px au lieu de 17 et 20) ; (c) **rythme** (`rythme` « auto » = « regulier » si
  porteur, sinon « timing ») : en régulier, la phase entièrement cachée passe en une image et la partie visible hors
  du trait du contour croît d'autant à chaque image (courbe `courbe_sortie` inversée, glissement qui compense le
  porteur sans le dépasser, arrivée douce sur la pose). Essais écartés : transport par la forme de devant LOCALE (aucun
  effet sur les bouchons, oreille 23,9 → 28,9 %) ; régulier pour l'oreille (35,6 %, la tête tourne). Le choix « auto »
  est fait APRÈS les mesures.
  **Mesures** (`docs/resultats/cacher_bouchons_armure.json`, `reapparition_oreille_m8.json`, `glissement_oreille_m8.json`,
  planche `~/planche_bouchons_oreille.png`) : bouchons `cacher` saut **22,6 % / 22,7 %** (main 21 / 24 ; avant 53 / 80),
  longueur brute monotone (plus de clignotement), image 0 identique, 0 px hors des bouchons, 98,59 % ; MAIS « aucune
  alternance » **NON atteint** sur le compte de pixels < 160 : 62 → 55 → 63 (image 14, gauche), 80 → 76 → 72 (droite).
  Preuve qu'il s'agit du bruit du seuil sur un trait fin : à l'image 14 le bouchon avance régulièrement (centre 465,19 →
  464,60 → 464,21) et sa masse d'encre reste 54,3 / 55,0 / 54,7 ; masse croissante à 5 % près pour les deux bouchons
  (hors critère). Oreille : saut 23,9 %, sans alternance, même identifiant, 0 pousse, A′ −0,4 → **tous critères
  atteints** ; M8 : image 0 identique (0 px), image 16 97,4 / 99,4, oreille visible à 16 : 0 px.
  **Décision de l'utilisateur (2026-10-15)** : l'alternance est jugée sur la MASSE d'encre visible (tolérance 5 %),
  le compte de pixels < 160 reste rapporté pour référence → **tous les critères atteints** (bouchons et oreille).

**Articulation**
- Avec le **calque de premier plan** : même masque au rendu ; le premier plan agit sur un calque entier, `cacher`
  sur des traits précis avec une position cachée calculée. Les deux s'additionnent.
- Avec la **disparition** : `cacher` la remplace pour les traits déclarés. Sans déclaration, rien ne change (option
  désactivée par défaut). Une proposition automatique est possible plus tard : trait « disparu » dont la position du
  moteur tombe sur ou dans une forme fermée voisine → « caché derrière ? » à valider dans le composant.

**Mesures** (critères fixés avant le code, contre les vraies images de l'artiste)
1. **Non-régression M8** (archive `~/oreilles_m8_passe1.zip`, rejeu, 0 $) : oreille visible à l'image 16 ≤ 5 px
   (script M8 : 1 px sur 378) ; image 16 contre la vraie arrivée ≥ 97 / 99 % ; image 0 inchangée ; plus aucune encre
   de l'oreille hors de la vraie arrivée à partir de l'image 14 (le trait parasite sur l'œil disparaît).
2. **Sortie de derrière** (bouchons de l'armure, rejeu, 0 $) : `cacher` en `sort_de_derriere` contre
   `ajouter` + `cache_par` posé à la main : image 0 identique, 0 pixel changé hors des bouchons, image 16 ≥ 98,6 %.
3. **Caché puis qui réapparaît** (jamais mesuré) : document A → B → A′ avec les poses des oreilles (A = 17,5°,
   B = 35°, A′ = A), sans GPU, le second passage étant le premier inversé. Critères : mêmes identifiants pour les
   traits de l'oreille en A et A′ ; longueur visible qui décroît puis croît sans saut (≤ 15 % de la longueur entre
   deux images) ; 0 trait de l'oreille né par la pousse ; image A′ contre la vraie pose ≥ score de l'image 0 − 0,5.
   Puis, **seulement avec accord**, un vrai passage B → A sur le GPU (≈ 0,2 $) pour vérifier le rattachement sur une
   vraie sortie du moteur.
4. Cas synthétiques (disque qui passe derrière un carré qui bouge, sortie, aller-retour) dans les tests, et une
   planche des images 4 / 8 / 12 / 16 à regarder.

**Temps** : G1 ≈ 1 j ; G2 ≈ 0,5 j ; G3 ≈ 1 j (avec l'export SVG) ; G4 ≈ 1-1,5 j ; G5 ≈ 0,5 j ; mesures et
planches ≈ 0,5-1 j. Total **≈ 4,5 à 5,5 jours**, sans GPU.

**Risques**
- **Forme ouverte** (contour de la tête ouvert vers le cou) : l'intérieur est mal calculé. En M8, il a fallu boucher
  les trous. Parade : alerte `OCCLUSION_FORME_OUVERTE`, ou forme donnée en polygone par le composant.
- **Forme de devant fausse** : en M8, le moteur plaçait le contour 20 px trop à l'intérieur, et le masque suivait ce
  faux contour (≈ 250 px d'oreille restaient visibles). Le recalage par morceaux doit passer **avant** (il existe).
- **Direction du glissement** : la normale moyenne est une approximation ; sur un contour très courbé ou en
  rotation, le trait peut glisser de travers. La compression imite mal une vraie rotation 3D.
- **Réapparition** : le rattachement peut se tromper d'élément s'il y a plusieurs éléments semblables proches
  (même limite que le moteur). La pousse peut aussi détecter l'encre qui ressort comme un nouveau trait (double) :
  le rattachement doit passer avant elle.
- **Trait coupé en plein milieu** : la partie visible d'un trait comprimé contre le contour se lit comme un double
  trait (vu en M8 vers l'image 12).
- **Coût de rendu** : une forme de devant par image et par déclaration (CPU seulement, quelques ms par image).

### 5.6 Mode « B redessinée » : causes et pistes (2026-10-13)


#### 5.6.1 Ce qui se perd vraiment
| Cas | Part de A identique dans B | Image 0 contre A | Image 16 contre B | Nature de l'encre manquante |
|---|---|---|---|---|
| armure (B déplacée) | 74 % | 99,9 % | 98,9 % | presque rien |
| **combat** (B redessinée en partie) | 52 % | **92,5 %** | 91,1 % | **la perte est déjà à l'image 0** : le SVG de A tracé à la main n'a ni les iris pleins ni les aplats (ombre du menton, pointes de cheveux, bouche) ; 25 % de l'encre manquante est dans des zones épaisses ou pleines. Le redessin de B ne coûte que ≈ 1,4 point |
| **visages F1 → F2** (redessinés de zéro, sans SVG d'artiste) | 23 % | 97,9 % | **86,5 %** | **dérive de 1 à 3 px** de traits fins et serrés (mèches, hachures, cils) : 87,2 % à 1 px, 93,0 % à 2 px, 96,1 % à 3 px ; 158 traits sur 559 dérivent ; sur la planche, trait rendu et trait de B courent côte à côte |
Planches : `~/planche_redessin_manques.png` (combat), `~/planche_redessin_manques_faces.png` (visages).

**Cause de la dérive des visages** : le moteur voit ce dessin à × 0,82. Un pixel du moteur vaut ≈ 1,2 px réel, donc
la dérive de 1-3 px est à la **limite de précision du moteur**, sur des traits que l'artiste a redessinés autrement :
plus d'appariement exact possible pour une partie des mèches et des hachures. La prédiction brute du moteur ne
retrouvait que 74,8 % de F2 ; la pousse en ajoutait 10,8 points (en fondu) (`diagnostic_x2_F12.json`).

#### 5.6.2 Essais faits sans GPU
| Essai | Résultat | Verdict |
|---|---|---|
| Réglages du recalage actuel : seuil `min_change_px` 3 → 0,5, portée 2 ou 3 px (combat) | 91,1 → 91,4 / 90,9 % | sans effet : la dérive touche des **portions** de traits |
| Recalage fin final : portions écartées de 1-4 px ramenées sur la ligne centrale de B, déplacement lissé, ambiguïtés refusées | combat 91,1 → 90,8 % ; visages 86,5 → **87,4 %** (justes 90,9 → 92,1 %) | gain faible |
| **Appariement sur les traits de B** : le moteur donne l'identité, la forme finale vient des traits de B (appariement exclusif) ; portions de B sans trait = naissances ; anciens traits recouverts = disparitions | visages : image 16 **94,1 %** (justes 95,1 %) ; mais **64 % des traits en fondu** (au lieu de 22,5 %) ; images 8-12 **fragmentées** (morceaux qui naissent d'un point) | pose finale bien meilleure, **intervalles moins bons** : rejeté tel quel |
| Même chose avec un **fondu sur place** (naissances et disparitions à leur place) | image 16 94,2 % ; **traits fantômes gris** dès l'image 0 (le ton mesuré sur A n'est pas nul), doubles traits au milieu | rejeté tel quel |
Planches : `~/planche_redessin_appariement.png`, `~/planche_redessin_fondu.png`.

#### 5.6.3 Recherche (ce que font les autres)
- **JoSTC** (Mo et al., SIGGRAPH / TOG 2024) : à partir du premier dessin vectoriel et des suivants en image, trace
  les suivants en vecteur avec une correspondance un à un des traits, pour CACANi. C'est le prédécesseur direct de
  LayerInbetween, qui le fait déjà : notre moteur « trace » B guidé par A. Rien à ajouter de ce côté.
- **LayerInbetween** (SIGGRAPH 2026) : le module GLLT aligne progressivement les traits par calques ; le moteur reste
  à 1024.
- **BetweenIT** (Disney, 2010) : intervalles « serrés » semi-automatiques, que l'artiste **guide, complète ou
  corrige** en peu de gestes. C'est le modèle des correspondances guidées par l'artiste.
- **FTP-SC** (2018) : correspondance de traits qui préserve la topologie. **Correspondance par zones fermées**
  (étiquetage des zones) : utile quand le dessin a des aplats ou des zones colorées.
- L'appariement « un à un » se formule comme une **affectation** (algorithme hongrois) ou un **transport optimal**.
  C'est ce que fait notre prototype de manière gloutonne.

#### 5.6.4 Pistes classées
| # | Piste | Gain attendu | Coût | Risque | Mesurable sans GPU |
|---|---|---|---|---|---|
| 1 | **Aplats (zones pleines) dans le rendu** : reprendre la méthode de M6 (zones noires accrochées aux traits, en fondu entre les poses), absente de la chaîne actuelle | combat : jusqu'à ≈ +2 points, iris et ombres visibles | ≈ 1 séance, CPU | faible (déjà validé en M6 sur les yeux) | **oui** |
| 2 | **Alerte « tracé de A incomplet »** avant le GPU : part de l'encre de A couverte par le SVG (combat : ≈ 92 %), conseil « tracez les iris et les aplats » | évite la perte de l'image 0 dès la source | ≈ 0,5 séance, CPU | aucun | **oui** |
| 3 | **Passe d'affinage du moteur** (génération GenK de B vers B) sur les 158 traits qui dérivent : le moteur est précis dans les **petits** déplacements (armure, cyb ≈ 99 %) | inconnu. Visé : visages ≥ 90 % à 1 px (86,5 aujourd'hui), sans plus de fondu | 1 passage ≈ **0,30 $** (526 segments ; 0,41 $ avec la marge, accord strict 0,40 $) | le moteur peut ne pas savoir corriger 1-2 px (sa propre précision ≈ 1 px moteur) | **non** : c'est l'appel de confirmation proposé |
| 4 | **Agrandissement par zones** (yeux, mèches ; « configuration minimale F2 » à 3 passages) | plafond F2 89,3 → 95,1 % ; moins de dérive (moteur plus précis) | ≈ 0,9 $ par passage de visage (3 appels) | coût | oui (plafond mesuré) |
| 5 | **Appariement sur les traits de B limité aux zones de hachures** (traits courts et serrés), où la correspondance un à un n'existe pas ; fondu à ton nul aux poses où le trait n'existe pas | une partie des 7,6 points du prototype, sans fragmenter les grands traits | ≈ 1-2 séances, CPU | fondu visible dans ces zones | **oui** |
| 6 | **Correspondances guidées par l'artiste** (épingle A ↔ B dans l'éditeur, comme BetweenIT ou les « hints » d'Harmony), opération `apparier` du journal | corrige les quelques erreurs visibles | ≈ 1-2 séances (moteur + éditeur) | trop lourd pour 158 traits : sert aux erreurs ponctuelles | non (dépend de l'artiste) |
| 7 | **B tracée en vecteur par l'artiste** (`svg_arrivee`) avec appariement souple | pose B exacte ; intervalles aussi bons que l'appariement | ≈ 1 séance (appariement souple) | redessin libre = mêmes limites que la piste 5 | oui |
| 8 | Conseil produit : **repartir d'une copie de A** (mini Krita « dupliquer et déplacer », pelure d'oignon) | évite le problème à la source (méthode 1 : 95-99 %) | — | dépend de l'artiste | — |

#### 5.6.5 Résultats du 2026-10-13 (pistes accordées)
- **Piste 3, passe d'affinage du moteur** (1 appel, accord strict 0,40 $) : **192,2 s, 0,188 $**.
  **Échec** sur les visages F1 → F2 :
  | Mesure | Avant | Après |
  |---|---|---|
  | image 16 contre F2 (retrouvé) | 86,5 % | **79,6 %** |
  | traits justes | 90,9 % | 91,1 % |
  | traits qui dérivent | 158 | 93 |
  | part de fondu | 22,5 % | 22,5 % |
  | traits invalides (NaN) renvoyés | — | 1 |
  À l'œil, des traits gris ondulés errent dans les mèches et l'iris se défait (`/root/affinage_faces/planche_affinage.png`).
  **Cas pessimiste** : F1 / F2 sont des **images générées par une IA**, redessinées de zéro. Rien n'est codé à partir
  de ce seul résultat. La piste 4 (agrandissement par zones) n'est pas lancée.
- **Piste 1, aplats** (codée, option `fidelite.rendu_fidele.aplats`, désactivée) :
  - combat : image 0 contre A de 92,5 à 93,1 %, image 16 de 91,1 à 91,7 % ;
  - cyb et armure inchangés.
  Gain modeste : l'essentiel de la perte de l'image 0 de combat vient des parties **épaisses** collées aux traits
  (49 % à 3-5 px du tracé), pas des aplats isolés.
  Fondu des aplats entre les poses en recouvrement : chaque aplat reste plein sur la moitié du passage de son côté,
  puis s'efface (sinon un iris présent aux deux poses devenait gris au milieu). Les images 0 et 16 ne changent pas ;
  les images du milieu sont à vérifier sur planche avant d'activer l'option (risque : double tache si l'artiste a
  déplacé l'aplat en redessinant B).
- **Piste 2, alerte « tracé de A incomplet »** (codée) : couverture de l'encre de A par le SVG < 95 % → alerte
  `SVG_TRACE_INCOMPLET` avec les zones à entourer.
  - Ne se déclenche pas : armure 100 %, cyb 100 %, combat 98,2 %.
  - Se déclenche : rotation, pose 1 (contour seul), 67,5 %.
- **Piste 5, hachures en fondu dans les zones de hachures** (codée, option `fidelite.hachures_fondu`, **désactivée**,
  validée sur planche sans GPU) :
  - visages F1 → F2 : 35 hachures de A effacées sur place, 49 de B apparues, 1 trait né remplacé ; image 0 intacte
    (97,9 %) ; image 16 86,5 → 86,4 % (aucun gain) ; encombrement du milieu 104,9 → 104,2 % ;
  - combat : 1 hachure en B, scores identiques ;
  - à l'œil : pas de fragmentation en points, mais un **amas gris dédoublé dans les cils** aux images 4 et 8 (les cils
    sont pris pour des hachures : courts, serrés, parallèles).
  L'option reste désactivée. **Piste ABANDONNÉE** (décision de l'utilisateur, 2026-10-13), comme la piste 4.
- **Budget de test** (registre, mémoire comprise) : ≈ 7,2 + 0,51 + 0,71 + 0,31 + 0,19 ≈ **8,9 $ sur 15 $**.

#### 5.6.6 Recommandation
1. **Sans GPU, d'abord** (après accord) : pistes 2 (alerte) et 1 (aplats), à fort effet sur combat et peu coûteuses.
   Ensuite la piste 5, avec mesure avant / après et planche des images 4 / 8 / 12.
2. **Un seul appel de confirmation** (après accord) : **piste 3**, visages F1 → F2, 158 traits, accord strict
   **0,40 $** (≈ 0,30 $ estimés).
   - Critères fixés avant :
     - image 16 contre F2 ≥ 90 % retrouvés à 1 px ;
     - part de fondu non augmentée ;
     - encombrement du milieu ≤ actuel + 3 points ;
     - planche des images 4 / 8 / 12 sans fragmentation.
   - Si le critère n'est pas atteint : l'affinage du moteur ne suffit pas, et la voie est la piste 4 (agrandissement
     par zones), plus chère.
3. Dans le produit, le mode « B redessinée » reste accepté pour tous les plans, avec l'avertissement honnête et la
   précision estimée du § 4.2, ici précisée : 85-91 % à 1 px, 93-96 % à 2-3 px.

Sources :
- [JoSTC](https://github.com/sysu-imsl/JoSTC) ;
- [LayerInbetween, article SIGGRAPH 2026](https://cislab.hkust-gz.edu.cn/media/documents/_SIGGRAPH_2026__LayerInbetween.pdf),
  [page du projet](https://cislab.hkust-gz.edu.cn/publications/layerinbetween-occlusion-aware-stroke-correspondence-and-inbetweening-with-automatic-layering/) ;
- [BetweenIT (Disney)](https://studios.disneyresearch.com/2010/05/03/betweenit-an-interactive-tool-for-tight-inbetweening/),
  [article Eurographics 2010](https://media.disneyanimation.com/uploads/production/publication_asset/120/asset/Whi10.pdf) ;
- [FTP-SC](https://dcgi.fel.cvut.cz/~sykorad/FTP-SC.html) ;
- [Stroke Correspondence by Labeling Closed Areas](https://astro.paperswithcode.com/paper/stroke-correspondence-by-labeling-closed) ;
- [Stroke Synthesis for Inbetweening of Rough Line Animations](https://diglib.eg.org/handle/10.2312/pg20201233) ;
- [AnimeInbet](https://arxiv.org/html/2309.16643v1).

## 6. Moteur et API
Exemples réels de tous les formats dans `docs/frontend/exemple_armure/` (§ 11.1). Coordonnées en **px réels** de la
toile carrée (`taille`, ex. 1254), origine en haut à gauche.

### 6.1 `options.json` (format « 1.0 »)
- Le frontend n'envoie **que des choix**. Tout champ absent prend sa valeur par défaut.
- Une clé inconnue est une **erreur** (`ENTREE_INVALIDE`, « option inconnue : … »).
- Les quotas et les chemins viennent du serveur.
- Valeurs par défaut complètes : `kukan/options.py` (`DEFAUTS`) du dépôt moteur. Exemple : `exemple_armure/options.json`.

Champs que le frontend expose :
```json
{
  "format_version": "1.0",
  "job": {"mode": "complet | apercu", "reprise_de": null, "corrections_artiste": []},
  "entrees": {"poses": [{"id": "A", "fichier": "inputs/A.png", "role": "cle"}, {"id": "B", "fichier": "inputs/B.png"}],
              "svg_depart": "inputs/A.svg", "svg_normaliser": true,
              "calques": [], "fixe": []},
  "preparation": {"alignement": {"zone": null, "manuel": []}},
  "fidelite": {"blocs_rigides": {"actif": false}, "rendu_fidele": {"largeur": "mesuree | profil"}},
  "animation": {"intermediaires_par_passage": 15, "timing": {"courbe": "smoothstep | lineaire"},
                "cadence": {"ips": 24, "en_deux": true}},
  "sorties": {"gif": {"actif": true, "largeur": 627}, "webp": {"actif": true, "sans_perte": true},
              "resolution": "source", "svg_frames": {"actif": true}, "png_sequence": {"actif": true}},
  "controle": {"seuil_alerte": 0.9, "qualite_auto": false}
}
```
**Dépendances.** Une option dont la dépendance manque est **grisée**, avec la raison au survol (exemple : « necessite
un SVG de depart »). Côté serveur, une telle option est ignorée et signalée par l'événement `option_ignoree`. Liste
complète : `DEPENDANCES` dans `kukan/options.py`.

### 6.2 Document d'animation `animation.json` (`format_edition` « 1.0 »)
C'est la **vérité** de l'éditeur.
```
format_edition "1.0"
taille         côté de la toile carrée (px)
poses          ["A", "B", ...]
ordre          calques de l'arrière vers l'avant
calques        [{id, type: "anime"|"fixe"|..., zone, poses, recadrage [x0,y0,x1,y1], agrandissement, premier_plan}]
chaines        [{id: "reste/t0001", portion: "p0", calque, origine: "moteur"|"ajoute",
                 positions: [par pose : [[p0,p1,p2,p3], ...] segments de Bézier cubiques en px | null],
                 etats: [par pose : "normal"|"ne"|"disparu"|"cache"|"edite"|"absent"],
                 passages: [[0,1], ...], mesure_pose?: i, cache_par?: {traits: [ids], contour_px},
                 occlusion?: {derriere, sens, pose_cachee, source}}]          (occlusion : à venir, § 5.4)
images         [{index, passage: [ia, ib], t (0..1), pose: "A"|null, traits: {id: segments},
                 visible?: {id: [[t0, t1], ...]}, formes_devant?: {...}}]      (images calculées ; visible : à venir, § 5.4)
blocs_rigides  [{id: "reste:A-B:b01", calque, passage: [0,1], translation: [dx, dy], traits: [ids]}]
timing         {intermediaires_par_passage, courbe, arcs, type, pauses_images, impact, ips, en_deux}
affichage_ms   [durée d'affichage de chaque image]
corrections_artiste  [opérations du § 6.5 déjà appliquées]
corrections    {"reste:0-1": {recales, longs, boucles, disparaissent, poussent, rigides, traits, ...}}
pousses_retires, genk, editions (journal rejoué)
```
Règles :
- Le **nombre de segments** d'une chaîne est le même à toutes les poses : l'interpolation est faite point de
  contrôle par point de contrôle.
- Les images intermédiaires sont recalculées à partir des positions aux poses (courbe `smoothstep` sur `t`).
  Référence : `kukan/animation.py` (`images`, `instants`). Le portage TypeScript doit redonner les mêmes courbes
  (tests de parité, § 3.7).

**Ajout (non déployé, § 2.2)** : `doc["traits"]` (identifiants stables `<calque>/s-<pose>-<NNN>`) et
`doc["correspondances"]` (table gardée entre poses, champ `par_identifiant` quand l'appariement par identifiant a
servi) ; champs de chaîne `montre` (`"milieu"` | `"poses"`), `disparition`, `compression`, `continuite` (rotation,
§ 5.3). L'éditeur affiche une chaîne `montre = "milieu"` seulement aux images du milieu, et son original aux poses.

### 6.3 Mesures de rendu (`mesures_rendu.json`)
Format provisoire, **à figer par M7**. Exemple : `exemple_armure/mesures_rendu.json`.
- Par chaîne : `W[i]` = mesure à la pose `i` (`null` si le trait est écrasé ou absent) = `[épaisseurs (8 points par
  segment), ton (0-1), décalages (si largeur « profil »)]`, et `L[i]` = longueur.
- Le rendu interpole épaisseurs, ton et décalages entre les poses. Un trait qui raccourcit (pousse, disparition)
  s'amincit en proportion de sa longueur (« pinceau qu'on lève »), **sauf les traits rigides**.
- Le rendu de référence est **côté serveur** (`kukan/rendu.py`, `rendu_trait.py`). Le navigateur montre un aperçu
  approché ; le bouton « Rendu final » fait foi.

### 6.4 Suivi d'un travail
- **`status.json` / ligne `jobs`** : `job_id`, `status`, `stage`, `progress` (0-100), `mode`, `artifacts`
  (`[{kind, path, …}]`), `appels_gpu`, alertes.
  - Statuts : `en_file`, `en_cours`, `a_valider` (aperçu fini), `termine`, `echec`, `annule`.
- **Étapes** (`stage`, avec leur poids dans `progress`) : `validation` 1, `entrees` 2, `nettoyage` 2, `alignement` 3,
  `decoupage` 3, `vectorisation` 4, `moteur` (GPU) 30, `fidelite` 12, `controles` 4 — fin de l'aperçu —
  `interpolation` 6, `occlusion_moteur` (GPU) 6, `premier_plan` 3, `effets` 3, `rendu` 15, `exports` 4, `depot` 2.
- **`events.jsonl` / table `job_events`** : une ligne par événement `{t, job_id, kind, stage, progress, …}`.

| Événement (`kind`) | Champs utiles | Ce que l'interface en fait |
|---|---|---|
| `job_debut` / `job_fin` | `mode` | début et fin du calcul |
| `etape_debut` / `etape_fin` | `nom`, `machine` (cpu / gpu), `duree_s` | barre d'avancement |
| `erreur` | `error_code`, `error_message`, `details` | arrêt, message à l'artiste |
| `alerte` | `message`, `niveau` | bandeau rouge |
| `avertissement` | `message`, `niveau` | bandeau orange |
| `option_ignoree` | option, raison | info |
| `svg_artiste` | `traits`, `qualite` (vert / orange / rouge), `feux`, `valeurs` | indicateur du SVG |
| `blocs_rigides` | `blocs`, `rigides`, `deformes`, `translations` | couleurs des blocs |
| `estimation_gpu` | `traits`, `segments`, `duree_s`, `duree_marge_s`, `cout`, `cout_marge` | **demande d'accord** avant le GPU |
| `moteur_evite` | — | « tout est calculé, aucun GPU » |
| `archive_complete` | `cout: 0` | passage déjà payé, réutilisé |
| `passage`, `corrections`, `qualite`, `pose_manquante`, `effets`, `artifact` | — | journal détaillé |

- **Codes d'erreur** (stables) : `ENTREE_INVALIDE`, `FORMAT_INCONNU`, `ALIGNEMENT_ECHEC`, `VECTORISATION_VIDE`,
  `MOTEUR_ECHEC`, `DELAI_DEPASSE`, `QUOTA`, `STOCKAGE`, `GPU_REQUIS` (passage jamais calculé : accord GPU
  nécessaire), `ANNULE`, `LICENCE`.
- **Erreurs et alertes SVG** (M4, fait) : une erreur SVG bloquante arrive en `ENTREE_INVALIDE` avec `error_message` =
  phrase pour l'artiste et `details = {code_svg, detail (technique), ids (formes en cause, attribut id d'origine)}`.
  Les alertes non bloquantes sont des événements `avertissement` / `alerte` avec `code`, `niveau`, `ids`, `message`.
  Catalogue complet (code → niveau, phrase) : `ALERTES` dans `kukan/svg_artiste.py`.
  | code | niveau | quand |
  |---|---|---|
  | `SVG_XML_INVALIDE` | rouge (bloquant) | fichier mal formé, racine qui n'est pas `<svg>` |
  | `SVG_UNITES` | rouge (bloquant) | ni `viewBox` ni taille absolue (largeur en %) |
  | `SVG_PROPORTIONS` | rouge (bloquant) | `viewBox` aux proportions différentes de l'image de la pose |
  | `SVG_VIDE` | rouge (bloquant) | 0 trait utilisable |
  | `SVG_COUVERTURE` | rouge (bloquant) | moins de 50 % des points du SVG sur l'encre de la pose (mauvais fichier, décalage) |
  | `SVG_REFUSE_MOTEUR` | rouge (bloquant) | le lecteur du moteur refuse le SVG converti |
  | `SVG_ARRIVEE_TRAITS` | rouge (bloquant) | SVG de la pose B sans les mêmes traits que celui de A |
  | `SVG_TRANSFORM_GROUPE` | rouge (non bloquant) | groupe transformé : appliqué, à vérifier sur l'aperçu |
  | `SVG_COUVERTURE_FAIBLE` | orange | 50-80 % des points sur l'encre |
  | `SVG_HORS_TOILE` | orange | traits qui sortent de la toile |
  | `SVG_TRAIT_BLANC` | orange | tracés presque blancs ignorés (fond d'autotrace) |
  | `SVG_FORME_REMPLIE` | orange | aplats : leur contour est pris comme trait |
  | `SVG_ELEMENT_IGNORE` | orange | texte, image intégrée, forme invisible, `<use>` cassé |
  | `SVG_CSS` | orange | règle de style CSS non comprise |
  | `SVG_ARRIVEE_ORDRE` | orange | paire A / B douteuse (ordre des traits différent ?) |
  | `SVG_CONVERTI` | info | constructions converties sans perte (L, Q, A, formes, transformations) |
- **Événements ajoutés le 2026-10-13** : `option_imposee` (`option`, `raison` : option activée par le serveur pour un
  travail de l'API, ex. `entrees.svg_normaliser`, `sorties.document_editeur`), `svg_artiste` (+ `sur_encre`),
  `svg_arrivee` (`traits`, `appariement` id / ordre, `douteux`), `moteur_evite` (aussi quand la pose B est tracée).
- **Contrôle de qualité** (`qualite.json`) : `{ok, nombre: {extremites, jonctions, sauts, gel}, defauts: {jonctions:
  [{trait, bout, contre, image, ecart, ecart_A}], …}}`.
- **Scores** (`scores.json`) : par passage, `depart` et `arrivee` = [juste %, retrouvé %, gris], `alertes`, `seuil`.

### 6.5 Opérations d'édition (journal)
- **Journal** (M7, fait, `kukan/journal.py`) : `{"operations": [...], "pointeur": n, "version": v}`. Seules les n
  premières opérations sont actives. Annuler recule le pointeur, rétablir l'avance, une nouvelle opération efface ce
  qui suit le pointeur. `version` augmente à chaque enregistrement ; un enregistrement fait sur une version dépassée
  est refusé (`Conflit` → 409).
- **Ordre de rejeu** (`journal.appliquer`), quel que soit l'ordre de saisie :
  1. les opérations **à la pose** ;
  2. puis les images, **recalculées** à partir des positions aux poses ;
  3. puis les opérations **à l'image** (propagées aux voisines).
  Sans opération à la pose, les images du document de base restent inchangées.
- Existantes (`kukan/animation.py`, `corriger`), appliquées **à une pose** : toutes les images suivent.
  ```
  {"op": "supprimer", "trait": id}
  {"op": "deplacer",  "trait": id, "pose": "B", "dx": 3, "dy": -2}
  {"op": "remplacer", "trait": id, "pose": "B", "segments": [[[x,y]x4], ...]}      (même nombre de segments)
  {"op": "pousser",   "calque": "reste", "pose": "B", "segments": [...]}          (trait présent seulement à partir de B)
  {"op": "ajouter",   "calque": "reste", "positions": {"A": [...], "B": [...]},
                      "mesure_pose": "B", "cache_par": {"traits": [ids], "contour_px": 5}}
  {"op": "sortir",    "element": [ids en B], "contour": [ids en A], "pose": "B",
                      "echelle": 0.7, "debut": 0.25, "marge_px": 3, "contour_px": 3, "fermer": true, "cache": "auto"}
                      (élément qui sort de derrière un contour, 2026-10-29, § 4.14 ; seuls element, contour, pose sont
                       obligatoires ; le rapport est dans doc["sorties"], les alertes SORTIE_* dans alertes_occlusion)
  ```
- Existantes (`kukan/edition.py`, `appliquer`), appliquées **à une image**, avec propagation :
  ```
  {"op": "affine", "image": k, "selection": {id: null | [indices des points]}, "params": {"dx", "dy", "rotation",
   "echelle": [sx, sy], "pivot": [x, y]}, "portee": N, "franchir_poses": false}
  {"op": "maille", "image": k, "selection": {...}, "params": {"boite": [x0,y0,x1,y1], "grille0": [[[x,y]]], "grille1": [...]},
   "portee": N}
  ```
  Propagation : poids `(1 + cos(π·|j−k| / (portee+1))) / 2`, dans le repère propre du trait ; arrêt aux poses de
  l'artiste.
- **Nouvelles (M7, faites)**, à la pose :
  ```
  {"op": "deplacer_bloc",   "bloc": "reste:A-B:b02", "pose": "B", "dx": 2, "dy": -3}   (tous les traits du bloc ; translation du bloc mise à jour)
  {"op": "noeud_ajouter",   "trait": id, "segment": i, "t": 0.5}    (coupe exacte, A TOUTES LES POSES : forme inchangée)
  {"op": "noeud_supprimer", "trait": id, "noeud": j}                (1 <= j <= nb segments - 1 ; fusion approchée, toutes les poses)
  {"op": "masquer_portion", "trait": id, "debut": 0.3, "fin": 0.6}  (gomme non destructive : fractions de longueur, à chaque image)
  {"op": "timing", "intermediaires_par_passage": 7, "courbe": "lineaire"|"smoothstep", "ips": 12, "en_deux": false,
   "pauses_images": {"debut": 0, "fin": 0}}                         (images et durées recalculées)
  ```
- **Pas encore fait** : `annuler_correction_auto` (annuler pour un trait une correction automatique : rognage, gel,
  pousse, recalage). Il demande une reprise du travail (options d'exception par identifiant), pas seulement le journal.
- **Aimant à l'encre** (`journal.aimant`, M7) : `{pose, trait | bloc, portee}` → `{proposition (opération deplacer /
  deplacer_bloc à montrer avant de l'ajouter au journal, ou null), dx, dy, part_avant, part_apres}`.

### 6.6 API de l'éditeur (contrat) — état corrigé au 2026-10-28
- Toutes les routes sont authentifiées (Supabase). Les réponses d'erreur sont `{error_code, error_message, details?}`.
- **Côté moteur** : `kukan_verifier_svg`, `kukan_editer` et `kukan_aimant` sont **déployées** depuis le 2026-10-13
  (appels CPU réels vérifiés ; version du 16 octobre, § 2.2) :
  - `kukan_verifier_svg(svg, image, apercu)` → `kukan.svg_artiste.verifier` ;
  - `kukan_editer(doc_base, journal, renvoyer_document)` → `kukan.journal.appliquer` ;
  - `kukan_aimant(doc, pose, image, trait, bloc, portee)` → `kukan.journal.aimant`.
- **Re-rendu** : `kukan.edition.rerendre(stockage, job_id, journal, dossier, sorties=)` existe en local seulement.
  Sur Modal, il faut `kukan_rerender` (M11, à créer), qui lit l'état d'un travail terminé dans Supabase Storage
  (`kukan-etats`). Tant qu'il n'existe pas, une édition ne peut pas être rendue côté serveur : l'éditeur n'a que
  son aperçu approché.
- **Appel depuis Next.js** (M9) : **essayé le 2026-10-30** sur l'aperçu Vercel, SDK JavaScript de Modal (`modal`
  0.11.1, `lib/modalServer.js`), v20 : HTTP 200 en 6,2 s, `ok: true` (dessin 16:9 de 1672 × 941, 76 traits). Le
  passage Python → JavaScript (dict, texte, octets) fonctionne. Un nombre réel entier (`1.0`) arrive comme `1`.
- Ligne de commande (dépôt moteur) : `python -m kukan verifier-svg dessin.svg pose.png --apercu apercu.png`.
- Réponse de `verifier` (vérifiée sur l'essai réel du 2026-10-30) :
  - en cas de succès : `{ok: true, svg_normalise, carre, decalage, sur_encre, couverture_trace, zones_non_tracees,
    qualite: {global, feux, valeurs, reperes_demos_min_med_max}, alertes: [{code, niveau, message, detail, ids}],
    traits: [{id_source, groupe, segments}], apercu_png (octets)}` ;
  - en cas d'échec : `{ok: false, erreur: {code, niveau, message, detail, ids}}`.
- Sens et types des champs :
  | Champ | Type | Sens |
  |---|---|---|
  | `svg_normalise` | texte | SVG carré (`viewBox` 0 0 `carre` `carre`), uniquement `M` / `C` ; **sans `id`** sur les `<path>` |
  | `carre` | entier (px) | côté de la copie carrée |
  | `decalage` | `[dx, dy]` (px) | position du dessin d'origine dans le carré (16:9 : bande verticale, ex. `[0, 365]`) |
  | `sur_encre`, `couverture_trace` | nombre de 0 à 1 | proportions (1 = 100 %) |
  | `zones_non_tracees` | liste | zones de l'encre que le SVG ne couvre pas (vide si tout est tracé) |
  | `qualite.feux` | `{critère: "vert" \| "orange" \| "rouge"}` | critères `traits`, `longueur_med`, `fragments_pct`, `px_par_segment_med` ; `global` = le pire |
  | `qualite.valeurs`, `qualite.reperes_demos_min_med_max` | nombres ; `[min, médiane, max]` | mesures du dessin et repères des démos validées. **Les feux sont indicatifs** : un rouge peut venir du dessin ou du format 16:9 ; il ne bloque pas |
  | `traits[i].id_source` | texte | `id` Krita d'origine (`shapeN`). Perdu dans `svg_normalise`, gardé ici, **dans le même ordre que les `<path>`**. Un `<path>` à plusieurs `M` donne plusieurs traits au **même** `id_source` |
  | `traits[i].groupe` | texte ou `null` | groupe `<g>` d'origine |
  | `traits[i].segments` | liste de `[[x, y] × 4]` | Bézier cubiques, en px du carré |
- **Identifiant stable** (§ 4.5, `<calque>/s-<pose>-<NNN>`) : n'existe que dans un **travail à plusieurs poses**
  (`kukan_job`), jamais dans la réponse de `verifier`.
- **Route Next.js `POST /api/svg/verifier`** (branche `claude/e1-verifier-svg`) :
  - entrée `multipart/form-data` : `svg` (fichier ou texte, ≤ 1,5 Mo), `image` (PNG ou JPEG reconnu à ses premiers
    octets, ≤ 2,5 Mo), `apercu` (`"0"` pour s'en passer) ; requête entière ≤ 4 Mo (limite Vercel : 4,5 Mo) ;
  - sortie : la réponse de `verifier`, sauf `apercu_png` remplacé par `apercu_png_base64` (texte ou `null`) ;
  - codes : 200 `ok: true` ; **422** `ok: false` (corps du moteur + `error_code` = `erreur.code`, `error_message` =
    `erreur.message`) ; 400 entrée invalide ; 401 non connecté ; 403 compte désactivé ; 413 trop gros ; 415 image
    qui n'est ni PNG ni JPEG (contrôlée avant le moteur, qui lève une exception sur un fichier qui n'est pas une
    image) ; 429 `TROP_D_APPELS` (10 par minute) ou `QUOTA_JOUR` (`plans.verify_svg_daily_limit`), avec
    `Retry-After` ; 502 erreur du moteur ; 503 `MODAL_NON_CONFIGURE` ou `QUOTA_INDISPONIBLE` (compteur ou plan
    introuvable : l'appel est refusé, jamais laissé passer) ; 504 délai (50 s) ;
  - quotas : `take_api_call` (Supabase, lot A), compteur commun à toutes les instances ; seules les requêtes valides
    qui partent vers le moteur sont comptées (pas les 400, 413, 415), y compris celles qui finissent en 422 ou 502.

| Route | Entrée | Sortie | Calcul |
|---|---|---|---|
| `POST /api/svg/verifier` | SVG (texte) + image de la pose (ou id) | réponse de `verifier` (ci-dessus) | Modal CPU `kukan_verifier_svg`, quelques s, 0 $ |
| `POST /api/projets/{id}/travaux` | `options.json` | `{job_id}` ; suivi par Realtime | Modal `kukan_job` ; GPU seulement après accord |
| `POST /api/travaux/{id}/accord_gpu` | `{estimation_id}` | `{ok}` | débloque un travail arrêté sur `estimation_gpu` |
| `POST /api/travaux/{id}/annuler` | — | `{ok}` | l'orchestrateur s'arrête entre deux étapes |
| `GET /api/projets/{id}/document?version=` | — | `animation.json` + `mesures_rendu.json` + `qualite.json` + `scores.json` + adresses signées (poses, calque fixe, rendus) | lecture |
| `POST /api/projets/{id}/journal` | `{version_base, action: "ajouter" \| "annuler" \| "retablir", operations?}` | `{version, pointeur}` ou **409** `{version_actuelle}` | validation par rejeu (`kukan_editer`) |
| `POST /api/projets/{id}/aimant` | `{pose, trait \| bloc, portee?}` | `{proposition, dx, dy, part_avant, part_apres}` | `kukan_aimant` |
| `POST /api/projets/{id}/rendu` | `{version, sorties: {gif, svg_frames: {groupes_calques}, png_sequence, lecture: {ips, en_deux, boucle, aller_retour, pause_debut_ms, pause_fin_ms}}}` | `{job_id}` → artefacts (SVG, PNG, GIF, `rendu/editeur/`) | Modal CPU (`rerendre`, à brancher sur le stockage), sans GPU |
| `POST /api/projets/{id}/partage` | `{email, role}` | `{ok}` | plan Studio / Entreprise seulement |

### 6.7 Modèle de calques dans l'API
Un **calque** est une partie du dessin traitée à part : elle est animée par le moteur, copiée telle quelle, ou en
fondu.

**Ce que le frontend envoie** (`options.entrees.calques`, liste ordonnée **de l'arrière vers l'avant**) :
```json
{"id": "perso1",                      // identifiant (lettres, chiffres, _ et -), unique
 "role": "anime" | "decor" | "fondu", // anime : moteur ; decor : copié exactement (0 $) ; fondu : hachures, ombres
 "source": {"zone": {"type": "polygone", "points": [[x, y], ...]}}   // une zone dessinée sur la pose de référence
        |  {"groupe_svg": "perso1"}   // les traits d'un groupe <g> du SVG de l'artiste (id ou inkscape:label)
        |  {"fichier": "inputs/decor.png"}  // une image à part (décor ; PNG avec transparence)
        |  "reste",                   // tout ce qui n'est dans aucun autre calque
 "premier_plan": false,               // ses formes fermées cachent les calques de derrière (M8)
 "agrandissement": "auto"}            // anime : zoom avant le moteur (résolution, § 4.11)
```

**Ce que le serveur renvoie** (`animation.json` → `calques`, et `decoupage.json`) :
- `id`, `type` (`anime`, `fixe`, `fichier`, `fondu`), `regle` (règle de découpage), `zone` / masque, `poses` (plage où
  il existe), `recadrage` [x0, y0, x1, y1] en px de la copie carrée, `agrandissement` (facteur), `premier_plan` ;
- `doc["ordre"]` : ordre d'empilement ; `doc["toile"]` : taille d'origine et décalage (§ 4.11).

Un trait appartient à **un seul** calque : son identifiant commence par l'id du calque (`perso1/t0003`).

**Règles**
- **Seuls les calques `anime` comptent dans les limites des plans** (décision du 2026-10-13). Un décor, une zone fixe
  ou un fondu ne coûtent pas de GPU. Le contrôle se fait :
  1. à la validation, sur les calques déclarés ;
  2. après le découpage automatique, qui peut ajouter des calques agrandis (règle D1), avec un message clair.
- **Coût** : un passage par couple de poses et par calque `anime`. Un calque `anime` entièrement rigide (blocs) ne
  coûte rien.
- Un calque `decor` peut recevoir plus tard une **caméra** (translation / zoom par pose, sans GPU).
- **Correspondance avec le code d'aujourd'hui** :
  - `zone` + `type` anime / fixe : existent (`entrees.calques`, `entrees.fixe`, découpage M18) ;
  - `fichier` : existe (calque fichier, M17 / M22) ;
  - `groupe_svg` et le champ `role` : **à ajouter** (petit travail : le lecteur SVG garde déjà le groupe de chaque
    trait depuis M2) ;
  - le décompte des seuls calques animés : **à coder** (aujourd'hui `max_calques` compte tous les calques déclarés).
- **FAIT le 2026-10-14 (étape 5)** : `options.normaliser_calques` traduit `role` + `source` vers le format interne
  (ancien format inchangé, rôle déduit ; idempotent) : anime + zone → calque forcé ; anime + « reste » ; fondu + zone →
  règle D6 ; décor + fichier → calque fichier ; **décor + zone → zone fixe** (copiée telle quelle) ; **anime +
  `groupe_svg`** → zone = enveloppe convexe des traits du groupe (pose A, et B si `svg_arrivee`) élargie de `marge_px`
  (48), traits du groupe envoyés EN PRIORITÉ à ce calque, erreur claire si le groupe est inconnu (liste des groupes).
  Limites : `calques_animes` seulement (`resoudre`), puis contrôle APRÈS le découpage automatique (zones agrandies
  comprises, erreur QUOTA explicite). Limites connues : `groupe_svg` seulement pour un calque animé ; sans
  `svg_arrivee`, la cible B du calque = l'encre de B dans la zone du groupe (elle peut contenir l'encre d'un autre
  groupe qui chevauche) ; un groupe qui se déplace de plus que la marge sort de sa zone en B.
  `tests/test_modele_calques.py`.

### 6.8 Routes Next.js → Modal
Appel recommandé : le **SDK JavaScript de Modal** (paquet npm `modal`, `Function.fromName(...).remote()` / `.spawn()`),
avec un jeton Modal en variable d'environnement côté serveur. À vérifier sur un premier appel : il faut que les
fonctions Python acceptent les arguments venus de JavaScript (dict, texte, octets). Repli : points d'entrée web Modal
protégés par jetons de proxy (`requires_proxy_auth=True`, en-têtes `Modal-Key` / `Modal-Secret`). L'un ou l'autre
reste à brancher côté moteur (tâche M9).

| Route Next.js | Contrôles dans la route | Appel Modal (application `kukan-inbetween`) | Ensuite |
|---|---|---|---|
| `POST /api/svg/verifier` | membre `editeur`+ | `kukan_verifier_svg.remote(svg, image, apercu)` | réponse directe (quelques s, ≈ 0,0002 $) |
| `POST /api/projets/{id}/travaux` | rôle ; `plan_limites` (travaux simultanés, poses, calques) ; plafond quotidien | `kukan_job.spawn(options, fichiers, plafonds, travail_id)` | ligne `travaux` créée (`en_file`), `modal_call_id` gardé ; avancement écrit par Modal |
| `POST /api/travaux/{id}/accord_gpu` | rôle ; estimation ≤ plafonds | `kukan_job.spawn(..., gpu_autorise=true, plafond = estimation avec marge)` (**M10**) | statut `en_cours` |
| `POST /api/travaux/{id}/annuler` | rôle `editeur`+ | aucun : `annulation_demandee = true`, lu par l'orchestrateur entre deux étapes (**M10**) ; `FunctionCall.cancel()` en dernier recours | statut `annule` |
| `GET /api/projets/{id}/document` | membre | aucun | adresses signées : `animation.json`, `mesures_rendu.json`, `lecture.json`, poses, `qualite.json`, `scores.json` |
| `POST /api/projets/{id}/journal` | verrou détenu ; rôle `editeur`+ | `kukan_editer.remote(doc_base, journal_propose)` | si `ok` : `enregistrer_journal(...)` (409 si conflit) |
| `POST /api/projets/{id}/aimant` | membre `editeur`+ | `kukan_aimant.remote(doc, pose, image_alignee, trait \| bloc)` | proposition renvoyée, rien n'est enregistré |
| `POST /api/projets/{id}/rendu` | rôle ; travaux simultanés | `kukan_rerender.spawn(projet, version, journal, sorties, travail_id)` (**M11**, à créer) | nouveau `travail` de type `rendu` (CPU, sans GPU) |
| `POST /api/projets/{id}/partage` | propriétaire ; `partage_autorise` | aucun | `projet_membres` / `invitations` |

### 6.9 Tâches du moteur pour brancher Supabase (après accord, sans GPU)
- **M9** : appel depuis Next.js (SDK JS ou points d'entrée web protégés), avec un test sur `kukan_verifier_svg`.
- **M10** : `kukan_job` relié à Supabase :
  - événements et avancement écrits dans `travaux` / `travail_evenements`, artefacts envoyés dans Storage ;
  - annulation lue dans `annulation_demandee` ;
  - deux temps pour le GPU : estimation puis accord ;
  - jeton `passages_gpu` pour la limite par plan ;
  - secret Modal `supabase-service` (URL + clé de service, à créer par l'utilisateur).
- **M11** : `kukan_rerender` sur Modal : état du travail lu dans `kukan-etats`, journal rejoué, sorties écrites dans
  `kukan-sorties`.
- **M12 : plusieurs générations en même temps** (accord : coût). Ce qu'il faut changer :
  1. **Modal** : `max_containers` des fonctions GPU de 2 à 8 (plafond global) et de `kukan_job` (CPU) de 2 à ≈ 20.
     Vérifier la limite de GPU simultanés du compte Modal (tableau de bord, offre du compte).
  2. **Jetons GPU par utilisateur / plan** : table ou fonction Supabase `passages_gpu` (compteur atomique). Avant
     chaque appel GPU, `kukan_job` prend un jeton, ou attend avec l'événement `attente_gpu` ; il le rend en fin
     d'appel, même en cas d'erreur.
  3. **Dans une génération** :
     - les calques d'un même passage et les passages indépendants partent ensemble (`spawn`, puis `get`) ;
     - les générations GenK restent en série ;
     - aujourd'hui, `engine_pass` attend chaque appel l'un après l'autre.
  4. **Plafond de coût « au pire »** : la somme des estimations avec marge des appels **en cours** + du nouveau
     appel doit rester sous le plafond de la génération et sous le reste du mois.
  5. **Avancement par passage** : événements `passage_debut` / `passage_fin` (calque, poses, durée, coût), et
     progression de l'étape « moteur » = passages finis / passages prévus.
  6. **Isolation des erreurs** : un passage en échec n'arrête pas les autres passages de la génération, mais la
     génération finit en `echec` partiel avec la liste des passages à relancer (sans repayer ceux qui ont réussi).
  7. **Archive persistante des passages** (Storage ou volume Modal) : aujourd'hui `kukan_job` part d'une archive
     **vide** (`archives=[]`). Une relance repaie donc tout. Avec l'archive, un passage déjà calculé n'est jamais
     repayé (empreinte des entrées).
  8. Mesurer la mémoire réellement utilisée par un passage, et réduire la réservation de 128 Go (coût −30 %).

## 7. Supabase : conception des projets (rien n'est créé ; à valider puis à créer)
**Existant** (ne pas toucher) : `auth.users`, profils, plans, générations. Les noms ci-dessous supposent une table
`profiles(id = auth.users.id, plan)` ; les adapter au schéma réel. Toutes les tables sont dans `public`, avec RLS
activé. Les écritures faites par Modal ou par les routes passent par la **clé de service**, uniquement côté serveur
(variable d'environnement de Next.js et secret Modal), jamais dans le navigateur ni dans Git.

**[À VÉRIFIER — dépôt frontend]** : noms réels des tables existantes (profils, plans, générations, facturation) ;
adapter les noms ci-dessous avant toute création, et montrer le SQL à l'utilisateur avant de l'exécuter.

### 7.1 Tables
| Table | Colonnes principales | Rôle |
|---|---|---|
| `plan_limites` | `plan` (pk), `travaux_simultanes`, `passages_gpu_simultanes`, `cout_max_travail`, `secondes_gpu_mois`, `partage` (bool), `max_poses`, `max_calques`, `conservation_jours` | limites par plan (§ 3.3), lues par les routes et transmises à Modal (`plafonds`) |
| `projets` | `id` uuid pk, `proprietaire` → auth.users, `titre`, `taille_toile`, `cree_le`, `modifie_le`, `archive` | un projet = poses + SVG + document + journal + travaux |
| `projet_membres` | `projet_id`, `user_id`, `role` (`proprietaire` \| `editeur` \| `lecteur`), `invite_par`, `cree_le` ; pk (`projet_id`, `user_id`) | droits ; une ligne `proprietaire` créée avec le projet |
| `invitations` | `id`, `projet_id`, `email`, `role` (`editeur` \| `lecteur`), `jeton_hash`, `expire_le`, `acceptee_le` | partage avec une personne pas encore inscrite |
| `fichiers` | `id`, `projet_id`, `type` (`pose` \| `svg_depart` \| `svg_arrivee` \| `calque_fixe`…), `pose_id`, `chemin` (Storage), `octets`, `empreinte`, `cree_par`, `cree_le` | entrées de l'artiste |
| `travaux` | `id` uuid, `projet_id`, `cree_par`, `type` (`apercu` \| `complet` \| `reprise` \| `rendu`), `options` jsonb, `statut` (`en_file` \| `en_cours` \| `attente_accord_gpu` \| `a_valider` \| `termine` \| `echec` \| `annule`), `etape`, `progression` (0-100), `estimation` jsonb, `cout_estime`, `cout_reel`, `secondes_gpu`, `modal_call_id`, `annulation_demandee` bool, `erreur_code`, `erreur_message`, `erreur_details` jsonb, `cree_le`, `debut_le`, `fin_le` | travaux en parallèle et leur avancement |
| `travail_evenements` | `id` bigserial, `travail_id`, `t`, `kind`, `etape`, `progression`, `donnees` jsonb | journal du travail (= `events.jsonl`), lu en temps réel |
| `artefacts` | `id`, `travail_id`, `projet_id`, `kind` (`gif`, `png_sequence`, `svg`, `document_editeur`, `planche_reparation`…), `chemin`, `calque`, `octets`, `cree_le` | sorties |
| `documents` | `projet_id`, `version` (int), `travail_source`, `chemin` (animation.json), `mesures` (chemin), `cree_le` ; pk (`projet_id`, `version`) | document d'animation de base, une version par travail terminé |
| `journaux` | `projet_id`, `document_version`, `operations` jsonb, `pointeur` int, `version` int, `modifie_par`, `modifie_le` ; pk (`projet_id`, `document_version`) | état courant du journal d'édition (`kukan/journal.py`) |
| `journal_actions` | `id` bigserial, `projet_id`, `document_version`, `version`, `action` (`ajouter` \| `annuler` \| `retablir`), `operations` jsonb, `auteur`, `cree_le` | historique (qui a fait quoi), en ajout seul |
| `verrous_edition` | `projet_id`, `document_version`, `user_id`, `expire_le` ; pk (`projet_id`, `document_version`) | **un seul éditeur à la fois par travail** (document) ; renouvelé toutes les 30 s, expire à 90 s |
| `usage_gpu` | `user_id`, `mois`, `secondes`, `cout` ; pk (`user_id`, `mois`) | quotas mensuels (mis à jour à la fin de chaque appel) |

### 7.2 Stockage (buckets privés)
- `kukan-entrees` : `projets/{projet_id}/entrees/{fichier}` (poses, SVG).
- `kukan-sorties` : `projets/{projet_id}/travaux/{travail_id}/…` (rendus, GIF, SVG, PNG, `editeur/`).
- `kukan-etats` : `projets/{projet_id}/travaux/{travail_id}/etat/…` (état d'un travail terminé pour le re-rendu sans
  GPU ; durée de conservation = `plan_limites.conservation_jours`).
- Le navigateur ne lit qu'avec des **adresses signées** (durée courte) fournies par les routes, après contrôle du
  rôle. L'envoi des poses se fait par une adresse d'envoi signée.

### 7.3 Règles RLS
Fonctions d'aide (`security definer`, `stable`) :
- `role_projet(p uuid) → text` : rôle de `auth.uid()` dans le projet, ou null ;
- `partage_autorise(p uuid) → bool` : plan du **propriétaire** dans `plan_limites.partage` (Studio, Entreprise).

| Table | lecture | écriture |
|---|---|---|
| `projets` | `role_projet(id) is not null` | création : `proprietaire = auth.uid()` ; modification : rôle `proprietaire` ou `editeur` (titre…) ; suppression / archivage : `proprietaire` |
| `projet_membres` | membre du projet | ajout / changement / retrait : `role_projet = 'proprietaire'` **et** `partage_autorise(projet_id)` ; jamais sur la ligne du propriétaire |
| `invitations` | propriétaire | propriétaire **et** `partage_autorise` ; acceptation par une fonction (`accepter_invitation(jeton)`) |
| `fichiers` | membre | `editeur` ou `proprietaire` |
| `travaux` | membre | **aucune écriture directe** : création par la route (clé de service) après contrôle des quotas ; mise à jour par Modal (clé de service) ; annulation par la fonction `demander_annulation(travail)` (rôle `editeur`+) |
| `travail_evenements`, `artefacts`, `documents` | membre | clé de service seulement |
| `journaux`, `journal_actions` | membre | fonction `enregistrer_journal(projet, document_version, version_base, action, operations)` : rôle `editeur`+, verrou détenu, version égale à `version_base` (sinon erreur « conflit » → 409), écriture de l'état et de l'action dans la même transaction |
| `verrous_edition` | membre | fonctions `prendre_verrou` / `renouveler_verrou` / `liberer_verrou` (rôle `editeur`+) |
| `plan_limites` | tous les connectés | personne (administration) |
| `usage_gpu` | l'utilisateur lui-même | clé de service |
| Storage | `role_projet(split_part(name, '/', 2)::uuid) is not null` | entrées : `editeur`+ ; sorties et états : clé de service |

Temps réel : publier `travaux` et `travail_evenements` (Supabase Realtime respecte RLS). Le panneau « Calculs »
s'abonne aux travaux des projets ouverts.

**Test obligatoire avant la mise en ligne** : deux comptes de test (un Free, un Studio) ; vérifier que chacun ne lit
ni n'écrit les projets, fichiers, travaux et sorties de l'autre (y compris par adresse signée devinée), et que le
partage est refusé au compte Free.

### 7.4 Partage, organisations, contrats sur mesure (conception, rien de créé)
**(1) Partage de projet = accès, sans transfert de quota.**
- `projet_membres` donne **l'accès** au projet : voir (`lecteur`) ou éditer (`editeur`). Il ne donne pas de quota.
- Une génération lancée par un collaborateur est **facturée à son propre quota** :
  - `travaux.facture_a = auth.uid()` ;
  - `usage_gpu` est incrémenté pour lui ;
  - la route vérifie **ses** limites (plan, générations du mois, GPU).
- Le propriétaire peut **réserver le lancement GPU à lui seul** : colonne `projets.gpu_reserve_proprietaire` (bool,
  faux par défaut). La route refuse `POST …/travaux` et `…/accord_gpu` à un autre que le propriétaire quand elle est
  vraie. Les retouches sans GPU (journal, rendu) restent permises aux éditeurs.
- Le partage reste réservé aux plans Studio et Entreprise (`partage_autorise` du propriétaire).

**(2) Organisation : pas prévue au § 7 tel qu'écrit** (il n'y avait que des membres de projet et un quota par
utilisateur). Modèle proposé :
| Table | Colonnes | Rôle |
|---|---|---|
| `organisations` | `id`, `nom`, `plan` (→ `plans`), `proprietaire`, `sieges_max`, `cree_le` | une entreprise ou un studio |
| `organisation_membres` | `organisation_id`, `user_id`, `role` (`proprietaire` \| `editeur` \| `lecteur`), `limite_gpu_s_mois` (null = pas de limite propre), `actif`, `cree_le` | 10 ou 100 membres |
| `organisation_invitations` | comme `invitations`, au niveau de l'organisation | arrivée des membres |
| `usage_gpu_organisation` | `organisation_id`, `mois`, `secondes`, `cout` | **pool** de quota GPU partagé |
| `projets` | + `organisation_id` (null = projet personnel) | un projet d'organisation est visible par ses membres selon leur rôle |

Accès : `role_projet(p)` = le plus élevé entre le rôle de membre du projet et le rôle dans l'organisation du projet.

Quota d'une génération lancée dans un projet d'organisation :
- elle est décomptée du **pool de l'organisation** (`usage_gpu_organisation`) ;
- elle est aussi décomptée de l'usage du membre, si une `limite_gpu_s_mois` lui est fixée ;
- refus si le pool **ou** la limite du membre est atteint.

Les jetons de passages simultanés sont pris au niveau de l'organisation.

**Effet sur le coût** : le coût GPU ne dépend que de l'usage. Le pool plafonne la dépense de l'organisation :
coût maximal mensuel ≈ heures du pool × 3,5 $/h (ex. 40 h → 140 $). Le nombre de membres ne change rien au coût
GPU ; il change le coût de stockage (projets) et de support.

**Sièges** : facturer par **siège actif** de rôle `editeur` ou `proprietaire`. Les `lecteur` sont gratuits ou peu
chers (ils ne lancent rien) ; `sieges_max` est vérifié à l'invitation. Le prix d'un siège doit couvrir sa part du
pool (ex. pool 40 h pour 10 sièges = 14 $ de GPU par siège au pire) plus le stockage et le support. Décision de prix à
prendre par l'utilisateur.

**(3) Contrat sur mesure.**
- **Surcharge par organisation dans Supabase** : table `organisation_limites` (mêmes colonnes que `plan_limites`,
  toutes facultatives). Limite effective = `coalesce(surcharge, limite du plan)`, modifiable par un administrateur
  seulement.
- **Relever les maximums fixes de Modal pour elle seule.** Les maximums actuels (`PARALLELE_*`,
  `PLAFOND_JOUR / MOIS_DOLLARS`, coût maximal par appel / génération) valent pour **tout le service**. Pour une seule
  organisation :
  1. une table de sécurité **dans le code** Modal, `SECURITE_PAR_ORGANISATION = {organisation_id: {…}}` : la
     relever est une modification revue et déployée, indépendante de Supabase ;
  2. des fonctions GPU **dédiées** (même code, `max_containers` propre, ex. `predict_from_svg_debug_v2s_<org>`),
     choisies par `kukan_job` selon l'organisation. Le plafond global des autres ne bouge pas ;
  3. un registre de dépenses **par organisation** (clé d'organisation dans `kukan-depenses`), en plus du plafond du
     service ;
  4. le budget Modal est celui de **tout le compte**. Pour un gros contrat, mieux vaut un **environnement ou un
     compte Modal dédié** au client : coûts isolés, refacturés, et aucun risque que ce client épuise le budget des
     autres.
- **Comparaison avec un conteneur Docker livré chez le client** (sur ses propres GPU) :
  | | Modal (cloud, contrat sur mesure) | Docker chez le client |
  |---|---|---|
  | coût GPU pour nous | oui (refacturé) | **aucun** quota Modal consommé |
  | limites | quotas Supabase + maximums Modal | licence : sièges, durée ; pas de quota GPU |
  | matériel | A100 80 Go fournis par Modal | le client doit avoir des GPU adaptés. Testé seulement sur A100 80 Go ; 24 Go non vérifié ; ≈ 128 Go de mémoire réservés aujourd'hui |
  | données | passent par notre cloud | restent chez le client (argument fort pour un studio) |
  | mises à jour, support | immédiates, centralisées | livraisons d'images, support à distance, versions multiples |
  | obligations | — | distribution du moteur : GPL-3.0 (sources de la partie GPL), autorisation des poids (§ 13.6 de l'architecture) |
  | archive des passages | volume Modal | locale (rejeu gratuit, mode local § 13.3) |
- **« 2 générations simultanées » est un maximum TEMPORAIRE de test** (`PARALLELE_TRAVAUX = PARALLELE_GPU = 2`,
  plafonds de 10 $ = budget Modal actuel). Pour le relever :
  1. brancher les jetons de passages GPU par utilisateur ou organisation (M12, point 2), pour qu'un plan ne prive
     pas les autres ;
  2. relever le budget du compte Modal et vérifier sa limite de GPU simultanés ;
  3. changer les constantes dans le code, faire relire, déployer (≈ 2 s, sans GPU).
  Valeurs visées : 8 GPU pour tout le service (§ 3.3) ; davantage par fonctions dédiées pour un contrat.

## 8. Plans, quotas, coûts GPU

### 8.1 Limites par plan et tarifs : données Supabase, plafond de sécurité dans Modal
Les limites et les tarifs ne sont **pas dans le code** : ils sont lus dans Supabase par les routes Next.js, puis
transmis au moteur à chaque travail.
| Table | Colonnes | Remarques |
|---|---|---|
| `plans` (existante) | + `limites` → une ligne de `plan_limites` | ne pas changer le sens des colonnes existantes |
| `plan_limites` | `plan` (pk, → `plans`), `generations_mois`, `generations_simultanees`, `passages_gpu_simultanes`, `delai_appel_gpu_s`, `cout_max_generation`, `secondes_gpu_mois`, `partage` (bool), `max_poses`, `max_calques`, `max_intermediaires`, `conservation_jours`, `modifie_par`, `modifie_le` | valeurs du § 3.3 au départ |
| `tarifs` | `id`, `actif` (une seule ligne active), `prix_gpu_s` (0,000694), `prix_memoire_gpu_s` (0,000284), `prix_cpu_coeur_s` (0,0000131), `prix_memoire_cpu_gio_s` (0,00000222), `estimation_fixe_s` (250), `estimation_par_segment_s` (0,1), `marge` (0,40), `facteur_coupure` (2), `modifie_par`, `modifie_le` | tarifs Modal et formule d'estimation |
| `limites_service` | `id`, `plafond_jour_dollars`, `plafond_mois_dollars`, `budget_modal_dollars`, `modifie_par`, `modifie_le` | plafonds de tout le service (≤ plafond de sécurité Modal) |
| `administrateurs` | `user_id` (pk) | qui peut modifier la configuration |
| `config_historique` | `id`, `table_nom`, `ligne` jsonb (avant / après), `auteur`, `cree_le` | rempli par un déclencheur à chaque modification |

**RLS** :
- lecture de `plan_limites` et `tarifs` par tout utilisateur connecté (pour afficher les quotas et les coûts) ;
- `limites_service` en lecture pour les administrateurs seulement ;
- **écriture des trois tables uniquement si `est_admin()`** (`exists (select 1 from administrateurs where user_id =
  auth.uid())`) ;
- `administrateurs` modifiable seulement avec la clé de service (console Supabase).

**Transmission au moteur** : la route lit le plan de l'utilisateur, `plan_limites`, `tarifs` et `limites_service`
(cache d'une minute). Elle transmet ensuite à `kukan_job(options, fichiers, plafonds, accord=)` :
- `plafonds = {max_appels_gpu, cout_max_dollars, gpu_secondes_restantes (quota − usage du mois), delai_gpu_s,
  prix_gpu_s, prix_memoire_s, estimation (fixe, par segment, marge, facteur de coupure), plafond_jour_dollars,
  plafond_mois_dollars, depense_initiale_mois}`.

**Plafond de sécurité dans le code Modal**, indépendant de Supabase (`modal_app_v2.py`). `kukan_job` **borne**
toute valeur reçue : `valeur = min(valeur reçue, plafond de sécurité)`. Ainsi une erreur de saisie dans Supabase,
ou une route compromise, ne peut pas dépasser :
- `SECURITE_COUT_APPEL` = 1 $ ;
- `SECURITE_COUT_GENERATION` = 5 $ ;
- `PLAFOND_JOUR_DOLLARS` / `PLAFOND_MOIS_DOLLARS` = budget Modal (aujourd'hui 10 $) ;
- `max_containers` (2 aujourd'hui) ;
- le timeout des fonctions GPU (900 s).

Le registre `kukan-depenses` reste dans Modal : il compte ce qui est réellement engagé, quoi que dise Supabase.

**FAIT le 2026-10-14 (étape 6, côté moteur ; rien créé dans Supabase, non déployé)** : `options.borner_limites`
(appelé par `kukan_job`) — clés connues seulement (une clé inconnue, ex. `production` ou `moteur`, est REFUSÉE : avant,
`plafonds` pouvait écraser `production`) ; valeurs numériques ≥ 0 ; bornes dans le sens qui protège : `cout_max_dollars`
≤ 5 $, `cout_appel_max` ≤ 1 $ (nouveau : un passage estimé au-delà est refusé, l'appel est coupé à ce montant),
`max_appels_gpu` ≤ 20, `delai_gpu_s` ≤ 900, prix ≥ tarif réel, plafonds jour / mois ≤ budget du code, `max_poses` /
`max_calques` / `max_intermediaires` ≤ 20 / 12 / 48 ; `estimation` {fixe_s, par_segment_s, marge} ≥ valeurs du code
(250 s, 0,1 s, 40 %), `facteur_coupure` entre 1,2 et 2 ; `depense_initiale_mois` jamais sous la valeur du code.
Chaque borne appliquée = événement `limite_bornee`. Formule d'estimation en paramètres (`Contexte.estimation`) ;
coupure par plan : un `delai_gpu_s` plus court que la fonction (ex. Free 500 s) annule l'appel côté client à ce délai
(`moteur.attente_appel`) ; quota contrôlé au pire de CET appel (avant : toujours 900 s). `tests/test_limites_supabase.py`.

### 8.2 Marge brute par plan (2026-10-13, prix provisoires, rien d'engagé)
**Hypothèses** (tarifs publics du 2026-10-13) :
- **GPU** : A100 + 128 Go réservés = 0,000978 $/s ; passage moyen 300 s ≈ **0,29 $** (mesures : 263 à 395 s) ;
- **CPU** (orchestrateur, 2 cœurs, 8 Gio) : 0,000044 $/s, 2 temps × ≈ 450 s par génération ≈ 0,04 $, plus ≈ 0,10 $/mois
  d'appels de l'éditeur ;
- **Supabase Pro** 25 $/mois (stockage de fichiers 0,021 $/Go-mois, sortie 0,09 $/Go au-delà des quotas : comptés
  comme facturés, par prudence) ; **Vercel Pro** 20 $/membre/mois. Frais fixes 45 $/mois, répartis sur les payants ;
- **Stripe** : 2,9 % + 0,30 $ par paiement mensuel ;
- **5 comptes Free par payant**, à la charge des payants ;
- non compté : l'abonnement Modal du compte, le support, le stockage des archives Modal.

**Usage** :
| Plan | Usage typique | Usage maximal |
|---|---|---|
| Free | 2 générations (2 passages), 0,82 $/mois | 3 générations, 15 min de GPU : **1,20 $/mois** |
| Indépendant | 5 générations, 5 passages, 2 Go stockés, 3 Go sortis | 1 h de GPU (12 passages), 5 Go / 10 Go |
| Studio (par siège) | 12 générations, 16 passages, 10 Go / 15 Go | 4 h de GPU (48 passages), 30 Go / 40 Go |

**Marge brute** (prix − Stripe − coûts variables − part des comptes Free − part des frais fixes), pour 100 payants
(1 000 payants : + 0,4 point environ) :
| Plan | Prix / mois | Typique | Maximal |
|---|---|---|---|
| Indépendant | 9 $ | 20 % | **−35 %** |
| Indépendant | 15 $ | 51 % | 18 % |
| Indépendant | 19 $ | 61 % | 35 % |
| Indépendant | **29 $** | **73 %** | **56 %** |
| Studio / siège | 39 $ | 67 % | 29 % |
| Studio / siège | **49 $** | **73 %** | **43 %** |
| Studio / siège | 79 $ | 82 % | 63 % |
| Studio / siège | 99 $ | 85 % | 70 % |

**Ce qui pèse le plus** :
1. les **comptes Free** : ≈ 4 à 6 $ par payant, avec 5 Free par payant ;
2. le **GPU** des payants ;
3. Stripe, sur les petits prix (0,30 $ fixes).

Supabase et Vercel deviennent négligeables au-delà d'environ 100 payants.

**Marge cible proposée** : **≥ 70 % à l'usage typique et ≥ 40 % à l'usage maximal** (repère courant d'un SaaS qui
paie du GPU). Il faut donc **Indépendant ≈ 29 $** et **Studio ≥ 49 $ par siège**. Pour garder Indépendant à 19 $ :
- baisser le quota GPU à 30 min ;
- ou limiter le coût du Free : 1 génération par mois, ou Free sans GPU (brouillon sur CPU seulement, § 8.3) ;
- ou facturer à l'année (Stripe payé une fois).

La réduction de la mémoire réservée (128 Go, ≈ −30 % du coût GPU) relève toutes les marges.

#### 8.2.1 Références de marché
| Outil | Prix | Remarque |
|---|---|---|
| Toon Boom Harmony Essentials | 31 $/mois (259 $/an) ; boutique officielle relevée le 2026-10-13 : 30 $/mois, 252 $/an | logiciel d'animation de studio |
| Toon Boom Harmony Advanced | 79 $/mois (606 $/an) ; relevé : 77 $/mois, 588 $/an | |
| Toon Boom Harmony Premium | 143 $/mois (1 161 $/an) ; relevé : 139 $/mois, 1 128 $/an | |
| Moho Debut / Pro | 59,99 $ et 399,99 $ (achat unique) | |
| Adobe Animate | ≈ 22,99 $/mois | en maintenance (aucune nouvelle fonction) |
| Clip Studio Paint EX | ≈ 277 $ | dessin et animation |
| Cartoon Animator | ≈ 79 $ | marionnettes 2D |
| TVPaint | prix non public | |
| Runway (vidéo générée par crédits) | 12 à 76 $/mois (Standard 12 $, Pro 28 $, Unlimited 76 $) | génère de la vidéo, pas des traits éditables |
| Kling (vidéo générée par crédits) | 7 à 180 $/mois (relevé : Standard 10 $, Pro 37 $, Premier 92 $, Ultra 180 $) | idem |

#### 8.2.2 Grille « forfait de base + packs de GPU »
- Une heure de GPU coûte ≈ **3,5 $** (A100 + mémoire réservée).
- À 70 % de marge, son prix minimal est ≈ **11,7 $** avant frais de paiement, et ≈ **14,1 $** avec Stripe (2,9 % +
  0,30 $) pour un pack d'une heure. Les gros packs amortissent les 0,30 $ fixes :
  | Pack | Prix minimal à 70 % | Par heure | Prix proposé |
  |---|---|---|---|
  | 1 h | 14,10 $ | 14,10 $ | **15 $** |
  | 5 h | 66,05 $ | 13,21 $ | **65 $** |
  | 10 h | 131,00 $ | 13,10 $ | **125 $** (≈ 68 %) |
- Une heure de GPU ≈ 12 passages ≈ **180 intervalles**, soit 0,08 $ par intervalle pour l'utilisateur.

#### 8.2.3 Valeur du produit, fondée sur des chiffres
**(a) Temps gagné sur nos cas réels** (un passage = 15 intervalles ; main : 20 à 40 dessins par jour de 8 h, soit
12 à 24 min par dessin) :
| Cas | À la main | Kukan : calcul | Kukan : retouches (estimées) | Total Kukan | Gain |
|---|---|---|---|---|---|
| armure (98,9 %) | 3 à 6 h | ≈ 10 min | ≈ 20 min (2 bouchons de poignée) | ≈ 30 min | **≈ 85 à 92 %** |
| cyb (98,4 %) | 3 à 6 h | ≈ 8 min | ≈ 15 min | ≈ 25 min | ≈ 86 à 93 % |
| combat (90,7 %, B redessinée) | 3 à 6 h | ≈ 10 min | ≈ 60 à 90 min | ≈ 1,5 h | ≈ 50 à 75 % |
| donghua (yeux + bouche, ≥ 95 %) | 3 à 6 h | ≈ 15 min (3 passages) | ≈ 20 à 30 min | ≈ 45 min | ≈ 75 à 88 % |
Les retouches sont **estimées** (nombre et nature des corrections faites sur ces cas), pas chronométrées avec un
animateur.

**(b) Coût d'un intervalle à la main** (sources ci-dessous) :
| Contexte | Rémunération | Par intervalle |
|---|---|---|
| Japon, douga (à la pièce) | ≈ 200 ¥ par dessin | **≈ 1,3 $** |
| France, salarié (convention IDCC 2412, minima 1 766 à 2 650 € bruts/mois aux niveaux I à III, coût employeur ≈ × 1,45) | ≈ 120 à 180 €/jour | **≈ 3 à 9 €** |
| États-Unis, Animation Guild (assistant ≈ 46 $/h en 2021-24, + augmentations) | ≈ 370-400 $/jour | **≈ 10 à 20 $** |
| Indépendant (30 à 100 $/h) | 240 à 800 $/jour | ≈ 6 à 40 $ |
| plateformes à bas prix | 2 à 3 $ par dessin | 2 à 3 $ |

**(c) Coût d'un intervalle avec Kukan** (suite de 5 poses = 4 passages = 60 intervalles, 1 calque animé) :
- calcul : 4 × 0,30 $ (GPU, mémoire comprise) + ≈ 0,20 $ (CPU) ≈ **1,4 $**, soit **≈ 0,02 $ par intervalle** ;
- retouches : environ 15 % des intervalles retouchés, 5 min chacun, soit ≈ 45 min d'artiste. Cela fait ≈ 14 € en
  France, ≈ 37 $ aux États-Unis, soit ≈ 0,25 à 0,65 $ par intervalle ;
- abonnement : part négligeable (un siège Studio à 59 $ pour plusieurs centaines d'intervalles par mois ≈ 0,1 à
  0,2 $ par intervalle) ;
- **total ≈ 0,3 à 0,8 $ par intervalle**, contre 1,3 à 20 $ à la main : **5 à 50 fois moins cher** selon la région.
  Le gain est faible au Japon, où le dessin est très peu payé, mais le temps gagné reste le même.

**(d) Ce que Kukan apporte que les outils actuels ne donnent pas**
- Le **trait reste vectoriel**, avec un identifiant par trait, modifiable dans l'éditeur. Runway et Kling produisent
  de la vidéo ; Harmony et Animate font des interpolations de formes sans comprendre le dessin.
- **Calcul exact des parties rigides**, sans GPU : rien n'est deviné quand une partie ne fait que se déplacer.
- **Contrôle honnête** : score contre le dessin de l'artiste, alertes, carte de confiance. Un échec est signalé,
  jamais caché.
- **Export en calques** : PNG par calque avec transparence, SVG par image (par calque en option), document d'animation
  éditable. Le travail se poursuit dans Harmony ou After Effects.
- **Fidélité au trait de l'artiste** : épaisseur et ton mesurés sur ses dessins.

**(e) Recommandation de prix**
| Plan | Prix | Inclus | Marge brute typique / maximale |
|---|---|---|---|
| Free | 0 $ | 3 générations/mois, 2 poses, 15 min de GPU | — (coût ≤ 1,20 $/mois) |
| **Indépendant** | **29 $/mois** (290 $/an) | 1 h de GPU (≈ 180 intervalles), packs à 15 $/h | 73 / 56 % |
| **Studio** | **59 $/siège/mois** (590 $/an) | 2 h de GPU par siège, en commun ; partage, organisations ; packs à 13 $/h | 79 / 65 % |
| Entreprise | sur contrat | réserve de GPU, limites propres, option Docker chez le client | — |

**Pourquoi ces prix**
- Un siège Studio à 59 $ coûte moins qu'**une demi-journée** d'intervalliste en France (≈ 120-180 €/jour), et
  moins qu'**une heure** aux États-Unis. Kukan en fait gagner plusieurs par passage.
- On reste sous Harmony Advanced (77-79 $/mois), au-dessus d'Animate (23 $).
- Les marges atteignent la cible du § 8.2 (≥ 70 % typique, ≥ 40 % maximal).
- Par rapport au 49 $ / 4 h étudié plus haut : moins d'heures incluses, et les packs paient le gros usage.

**Limites de l'analyse**
- Retouches estimées, non chronométrées.
- La productivité à la main varie beaucoup avec la complexité du dessin.
- Nos cas sont des passages simples, sans couleur ni effets.
- Les minima français ne précisent pas le niveau exact d'un intervalliste.
- Conversions de devises approximatives.
- Coût GPU susceptible de baisser (mémoire réservée), rapport Free / payants supposé à 5.
- Aucun studio interrogé (consigne).

Sources :
- [Toon Boom, boutique](https://shop.toonboom.com/en/products/harmony) ; [Runway](https://costbench.com/software/ai-video-generators/runway) ;
  [Kling](https://www.cloudzero.com/blog/kling-ai-pricing/) ;
- [douga à 200 ¥ (Anime Corner)](https://animecorner.me/animator-ken-arto-on-pay-toxic-fans-and-supporting-animators/),
  [premier salaire d'un animateur (Automaton, 2024)](https://automaton-media.com/en/news/20240307-28205/) ;
- [minima IDCC 2412](https://advizexperts.fr/convention-collective/convention-collective-production-films-animation-idcc-2412/),
  [SNTPCT, films d'animation](https://sntpct.fr/wp-content/uploads/2020/07/SNTPCT_Films_Animation_Salaires_minima_garantis_au_1er_juillet_2024.pdf) ;
- [Animation Guild, salaires 2021-24](https://animationguild.org/wp-content/uploads/2022/10/2021-24-Local-839-WAGES-v02.pdf),
  [Animation Guild, augmentations](https://greenslate.com/blog/the-animation-guild-local-839-increases-and-changes) ;
- [tarifs indépendants (Pixune)](https://pixune.com/blog/how-much-does-2d-animation-cost/) ;
- productivité : [Arab News](https://www.arabnews.jp/en/arts-culture/article_57865/).

### 8.3 Vitesse : plus rapide qu'à la main (2026-10-13, analyse)
**Repère main** : un intervalliste produit **20 à 40 intervalles par jour** (≈ 12 à 24 min par dessin ; sources
ci-dessous). Un passage de 15 intervalles représente donc 0,4 à 0,75 jour ; une suite de 5 poses (60 intervalles),
**1,5 à 3 jours**. Kukan aujourd'hui : ≈ 6-7 min par passage, ≈ 25-30 min pour la suite, plus les retouches. C'est
déjà 10 à 50 fois plus rapide, mais **l'attente du premier résultat (≈ 6 min) est trop longue** pour un usage
interactif.

**Les ≈ 250 s fixes d'un passage.** Ils ne sont **pas mesurés étape par étape** : le journal ne date pas les étapes,
et les fichiers du ZIP portent tous l'heure de sa fabrication. Estimation à partir de nos mesures :
| Poste | Estimation | Indice |
|---|---|---|
| démarrage du conteneur (image en cache chez Modal) | 5-30 s | « ≈ 5 s de démarrage » mesuré le 2026-10-06 |
| interpolation du moteur et préparation de l'inversion, **inutiles pour nous** (nous interpolons nous-mêmes) | ≈ 40 s | un appel d'interpolation seule : 42-46 s, démarrage compris |
| ≈ 9 processus Python successifs (flot optique, prétraitement, profondeur, calques SAM2, 4 réseaux, combinaison), qui rechargent chacun torch et leurs poids | ≈ 50-120 s | `conda run` à chaque étape (`run_forward.sh`) |
| calcul proprement dit (flot, SAM2, réseaux, regroupement des courbes) | ≈ 80-150 s | croît avec le nombre de traits |
**Première action, gratuite** : horodater chaque étape dans le journal, puis mesurer au prochain appel autorisé.

**Pistes**
| Piste | Gain attendu | Coût / effort | Risque |
|---|---|---|---|
| **A. Ne plus lancer l'interpolation du moteur** (ni la préparation de l'inversion). Le contrôle de qualité lit ses images 0 et 16 : il lira le `[1comb]` à la place | **−40 s** par passage | ≈ 0,5 séance | aucun sur la qualité (nos images ne viennent pas de là) |
| **B. Brouillon immédiat sur CPU** : blocs rigides exacts + traits déformés en interpolation simple, affiché en ≈ 1-2 min, remplacé par la version affinée au retour du GPU (nouvelle version, § 3.9) | premier résultat **≈ 1-2 min** au lieu de 6-7 | ≈ 1 séance (le calcul sans moteur existe déjà) | brouillon moins juste sur les parties déformées, à présenter comme tel |
| C. Une seule session Python qui charge les modèles une fois | −50 à −100 s | 2-3 séances : modifier les scripts du moteur (GPL) | revalider au bit près |
| D. Instantané mémoire Modal (CPU ; GPU en alpha). Modal annonce des démarrages 3 à 10 fois plus rapides | −20 à −60 s, **seulement avec C** | ≈ 0,5 séance après C | fonction alpha pour le GPU |
| E. Conteneur gardé actif entre deux passages d'une suite (`scaledown_window`) | −5 à −30 s par passage sans C ; davantage avec C | **3,5 $/h d'attente** (0,06 $/min). Une fenêtre de 2 min ≈ 0,12 $ par passage ; toujours actif = 84 $/jour (exclu) | coût d'attente à plafonner |
| F. Image plus légère | faible (image déjà en cache) | — | — |
| G. Modèles plus légers (SAM2 plus petit, flot optique plus léger ; profondeur V2-Small déjà faite) | −10 à −40 s | revalidation GPU | qualité, comme pour la profondeur |
| H. Suites : toute la suite en brouillon en parallèle (CPU + génération 0), puis l'affinage GenK en série dans **un même conteneur** | brouillon de la suite en ≈ 2-3 min ; affinage − (n − 1) démarrages | ≈ 1 séance | l'identité exacte des traits déformés impose la série, mais elle ne concerne pas les traits rigides |

**Objectifs réalistes**
| Horizon | Premier résultat visible | Passage affiné | Suite de 5 poses |
|---|---|---|---|
| aujourd'hui | ≈ 6-7 min | ≈ 6-7 min | ≈ 25-30 min |
| court terme (A + B + H, sans toucher au moteur) | **≈ 1-2 min** (brouillon) | ≈ 4-5 min | brouillon en ≈ 3 min ; affinée en ≈ 18-20 min |
| moyen terme (+ C + D + E) | ≈ 1 min | ≈ 1,5-2,5 min | ≈ 8-12 min |
| à la main | — | 0,4-0,75 jour | 1,5-3 jours |

**Ordre proposé** : A et l'horodatage, puis B, puis H, puis C + D (mesures et accord GPU pour la revalidation).

Sources :
- [Modal, instantanés mémoire](https://modal.com/docs/guide/memory-snapshots), [instantanés GPU](https://modal.com/docs/examples/gpu_snapshot),
  [mise à l'échelle et conteneurs gardés actifs](https://modal.com/docs/guide/scale) ;
- productivité d'un intervalliste : [Arab News, 2024](https://www.arabnews.jp/en/arts-culture/article_57865/),
  [Clip Studio, bases de l'intervalle](https://tips.clip-studio.com/en-us/articles/954) ;
- tarifs : [Supabase](https://makerkit.dev/blog/saas/supabase-pricing), [Vercel](https://schematichq.com/blog/vercel-pricing),
  [Modal (CPU, mémoire)](https://flexprice.io/pricing-index/modal).

## 9. Règles produit, décisions, choix en attente

### 9.1 Règles produit (à respecter dans l'interface et dans les textes du site)
1. **Ce qui apparaît doit exister dans une pose dessinée.** Le moteur interpole entre des éléments présents ; il ne
   crée pas un visage, une main ou un objet absent de toutes les poses clés (la pousse ne fait qu'un fondu).
2. **Les poses de l'artiste sont exactes** : l'image 0 et la dernière image d'un passage sont ses dessins. Une
   correction automatique ne modifie jamais une pose clé.
3. **Rien de payant sans accord** : estimation (durée, coût, précision attendue) puis accord explicite pour chaque
   calcul GPU ; jamais de relance automatique ; un passage déjà payé n'est jamais repayé (archive).
4. **Mesurer contre le dessin de l'artiste**, montrer le résultat à l'œil ; le score est un indicateur, pas un
   verdict.
5. **Ne pas promettre** : grandes rotations sans pose intermédiaire (au-delà de ≈ 20-25° par passage), poses
   redessinées librement, éléments qui naissent. Les défauts connus sont signalés (alerte, carte de confiance),
   jamais cachés.
6. **Toute correction automatique reste annulable** et toute sortie reste éditable (traits identifiés).
7. **Mêmes fonctions pour tous les plans** : seuls les quotas (générations, GPU, parallélisme) et le partage
   changent.
8. **Les choix de l'animateur priment** : un trait réglé par l'animateur (cacher, supprimer, déplacer…) n'est jamais
   retouché par une règle automatique.
9. **Déclarer le minimum** (principe de la bêta, 2026-10-29) : l'animateur déclare ce que le code ne peut pas
   deviner (élément qui sort d'un contour, élément qui disparaît, bloc, type de passage) avec un minimum de gestes
   (un clic sur l'élément, un clic sur le contour). Le code propose quand il peut, l'animateur confirme d'un clic.
   À mesurer avec les premiers animateurs : le temps passé à déclarer, et lesquelles de ces déclarations sont
   réellement utiles.

### 9.2 Décisions prises (avec la date)
1. **Frontend** : Next.js + Fabric.js (imposé). Il est **indépendant de la machine de développement du moteur**
   (Droplet, supprimé plus tard) et sera développé sur Termux, dans une session neuve.
2. **Ordre** : le moteur d'abord (import SVG, convertisseur, API de l'éditeur : § 10.2), puis le frontend (2026-10-13).
3. **Import SVG** (2026-10-13) :
   - **normalisation imposée** à tout travail créé par l'API (`entrees.svg_normaliser`) ;
   - **formes remplies signalées** à l'artiste ;
   - **`entrees.svg_arrivee`** (pose B tracée en SVG, identité des traits donnée) **au plan maintenant, en option**.
4. **Mini Krita** : un outil de dessin existe déjà dans le frontend et écrit des SVG en `M` / `C`. **Ne pas le
   refaire**. Son tracé au stylet devient le **crayon** de l'éditeur. Ses SVG passent par la vérification du
   serveur (§ 6.6, `POST /api/svg/verifier`) comme un fichier importé.
5. **Travail en parallèle** : l'utilisateur lance **plusieurs calculs en même temps**. Chacun a son suivi
   d'avancement, et on **continue de retoucher** un autre élément pendant ce temps. **Plusieurs projets ouverts à la
   fois, en onglets**.
6. **Partage de projets entre utilisateurs**, réservé aux plans **Studio** et **Entreprise**. On partage : images,
   SVG, état de l'animation (document + journal d'éditions).
7. **Table lumineuse et timeline** font partie des **outils de base** (pas « plus tard »).
8. **Export** au choix : **calques vectoriels** (SVG), **séquence PNG** (composée et par calque, avec transparence)
   ou **GIF**. Réglage de la **vitesse** (images par seconde), de la **boucle** et de l'**aller-retour**.
9. **GPU** : jamais lancé par l'éditeur seul. Une pose redessinée affiche l'estimation de durée et de coût, puis
   attend l'accord explicite.
10. **Mesure** : la référence est toujours le dessin de l'artiste (règle permanente).
11. **Éditeur** (réponses de l'utilisateur, 2026-10-13) :
    1. retouche **à la pose** par défaut ; à l'image (avec propagation) ou clé de trait **en option** ;
    2. gomme = **masque d'une portion** (`masquer_portion`, le trait garde son identité) ;
    3. **aperçu approché** dans le navigateur, **rendu final par le serveur** ;
    4. **Fabric.js limité à la sélection**. Il est déjà présent dans le frontend (mini Krita, page
       `/dashboard/draw`) : **réutiliser l'existant** ;
    5. **ordinateur + tablette graphique** d'abord, **iPad** ensuite, **téléphone en consultation** ;
    6. raccourcis **d'Animate** ; préréglages Harmony et TVPaint plus tard ;
    7. épaisseur du crayon **reprise sur les traits voisins** ; pression du stylet en option ;
    8. **aimant à l'encre actif par défaut**, avec une touche pour le couper (proposé : `Alt` maintenu) ;
    9. **un seul éditeur à la fois par travail**, mais **plusieurs travaux en parallèle** ;
    10. ordre de construction : **table lumineuse** (+ timeline) → **sélection** → **annuler / rétablir** →
        **déplacer** → **défauts** → **aperçu et rendu** (+ export PNG / GIF avec vitesse) → **nœuds de Bézier** →
        **gomme** → **crayon** → **maille** → **ligne guide (courbure, squash and stretch)** (§ 3.8, à confirmer).
    **Entrent dans le plan** : timeline, export PNG / GIF avec vitesse, travaux en parallèle, partage Studio /
    Entreprise.
12. **Supabase** : les comptes existent déjà (inscription, connexion, profils, plans, générations). **Manquent les
    projets**. Next.js sert aussi de backend : ses routes API appellent Modal. **Ne rien créer dans Supabase sans
    accord** ; la conception est au § 7.
13. **Deux méthodes de dessin acceptées, pour tous les plans, avec les mêmes fonctions** (2026-10-13) :
    méthode 1 « B déplacée » (on déplace les traits de A) et méthode 2 « B redessinée ». La méthode est **détectée
    automatiquement** ; l'artiste reçoit un conseil clair, et pour la méthode 2 un avertissement honnête avec une
    précision estimée **avant** le GPU (§ 4.2). **Seuls les quotas** (générations, GPU, parallélisme) et le **partage**
    changent selon le plan.
14. **Plans** : Free, Indépendant, Studio, Entreprise. Limites et tarifs unitaires = **données dans Supabase**,
    modifiables par un administrateur seulement, sans toucher au code. Un **plafond de sécurité** reste dans le code
    Modal, indépendant de Supabase (§ 8.1).
15. **Traits cachés** (2026-10-13) : le composant « trait caché » du frontend est branché **à part**. Il déclare
    (quel trait, derrière quelle forme, à partir de quelle image) ; le moteur calcule les positions et les portions
    visibles, et fait le rendu et les exports. Interface au § 5.4, glissement derrière au § 5.5.
16. **Déclarer le minimum** (2026-10-29) : principe de la bêta (§ 9.1, règle 9). Élément qui sort d'un contour =
    correction `sortir` (deux clics, § 4.14).
17. **WebP animé sans perte** validé par l'artiste comme format d'aperçu (2026-10-29) ; le lissage des épaisseurs
    au-delà de la taille du dessin reste à décider (§ 3.6).

### 9.3 Choix encore en attente (à demander à l'utilisateur)
Les 10 choix de l'éditeur sont tranchés (§ 9.2, point 11). Restent :
1. Valeurs des quotas par plan (Studio / Entreprise) et prix (proposition au § 3.3).
2. Ce que voit un lecteur externe au projet (poses sources ou seulement les rendus).
3. Valeurs d'export par défaut (ips, boucle, aller-retour).
4. Le mot « inversion » employé par l'utilisateur pour un calcul : vérifier s'il désigne un **calcul d'intervalles**
   (un travail) ou l'**inversion** du moteur (calcul des traits qui apparaissent, un appel GPU de plus).
5. Ligne guide / squash and stretch (§ 3.8) : place dans l'ordre et accord pour la coder.
6. Schéma exact des tables existantes (profils, plans, générations) : la conception du § 7 suppose
   `profiles.plan` ; l'adapter aux noms réels du projet Supabase.
7. Charte graphique de l'éditeur et mode daltonien (§ 3.1) : à valider.
8. Seuil de décision du test contre Krita (§ 10.3) : à valider avant le test.
9. Largeurs d'export proposées (taille du dessin, 1 920, 3 840 px) et lissage des épaisseurs à 3 840 px (§ 3.6).

## 10. Ce qui reste à faire

### 10.1 Ordre de travail proposé (2026-10-27, validé dans son principe par l'utilisateur le 2026-10-28)
Avant tout : les **GIF de démonstration** (dessin 16:9, mains dans les poches), faits côté moteur ; leurs leçons iront
au § 4.14. Une « séance » = une session de travail de quelques heures.

| Étape | Contenu | Débloque | Séances | Besoin de l'utilisateur | Risque | Critère d'acceptation |
|---|---|---|---|---|---|---|
| **E0** | **Redéploiement** de `modal_app_v2.py` (côté moteur) | tout ce qui est codé depuis le 16/10 (§ 2.2) ; bêta possible | 0,5 | accord de déploiement | faible (CPU) ; un format d'archive incompatible ferait repayer le GPU | suite complète verte juste avant ; appels CPU de contrôle (`genk_check`, `kukan_verifier_svg` sur le SVG du jus A, `kukan_editer` sur `parite/journal.json`, `kukan_aimant`, `kukan_job` sans accord = estimation seule, 0 $) ; archives locales (jus, rotation A → B, B → C, C → D, C → D2, cyb, armure) copiées dans le volume `kukan-archives`, puis un travail rejoué sur Modal à 0 $ et identique au pixel au rendu local |
| **E1** | Appel Next.js → Modal (M9) | toute la suite | 0,5-1 | jeton Modal en variable d'environnement serveur (jamais dans Git) | arguments JS → Python (dict, octets) | `POST /api/svg/verifier` renvoie les feux et l'aperçu d'un vrai SVG |
| **E2** | Supabase : projets, fichiers, travaux, stockage, RLS (§ 7) | projets, envoi des poses | 1-2 | accès Supabase ; validation du schéma et du SQL avant création | RLS mal faite = fuite entre clients | test à deux comptes du § 7.3 |
| **E3** | `kukan_job` relié à Supabase (M10) + `kukan_rerender` (M11), côté moteur | génération depuis le site, re-rendu après édition | 2-3 | secret Modal `supabase-service` (créé par l'utilisateur) ; accord de déploiement | écritures concurrentes, reprise après erreur | un travail lancé depuis le site : avancement en temps réel, accord GPU en deux temps, artefacts dans Storage, annulation |
| **E4** | Pages projets, panneau « Calculs », quotas par plan (§ 3.2-3.3, § 8.1) | usage réel par plan | 2 | valeurs des quotas (§ 9.3) | quota contourné | quota refusé avant le GPU ; Free coupé à 500 s |
| **E5** | Éditeur : table lumineuse, timeline, sélection, annuler, déplacer, nœuds, défauts, aperçu (§ 3.5) | retouche des intervalles | 3-4 | retours de l'artiste sur une démo | performance sur tablette | parité TypeScript (§ 11.1) ; journal validé par `kukan_editer` ; 60 images/s en lecture sur ordinateur |
| **E6** | « Dupliquer la pose et déformer » (§ 10.3) | méthode (c), test contre Krita | 2-3 | essai Krita (§ 4.8) ; 3 dessins de test | traits coupés ou dupliqués par erreur | identifiants gardés à 100 % ; passage à 0 $ |
| **E7** | Travaux en parallèle (M12) et partage (§ 3.4, § 7.4) | Studio / Entreprise | 2 | accord sur le coût (plusieurs GPU à la fois) | dépense qui monte vite | jetons GPU par plan ; plafond « au pire » respecté |

### 10.2 Tâches du moteur (dépôt `kukan-inbetween`) — état corrigé au 2026-10-28
| # | Tâche | État |
|---|---|---|
| M1-M8 | Normalisation imposée, lecteur SVG complet, contrôles précoces, catalogue d'alertes, `verifier`, tests d'import, journal unifié + aimant + exports, `svg_arrivee` | **faits** (2026-10-13) et **déployés** (2026-10-13 / 16) |
| — | Fusion `fiabilite-modal` (inversion refusée, préréglage « propre », archive persistante, accord en deux temps, registre des dépenses) | **fait et déployé** (2026-10-13) |
| — | Essai de deux générations en parallèle | **fait** (2026-10-13, 0,51 $, passages chevauchés ≈ 3 min 40) |
| — | Limites reçues de Supabase, bornées (`borner_limites`, coupure par plan, quota au pire de l'appel) | **fait** (2026-10-14) et **déployé** |
| — | Modèle de calques (`role`, `source`, `groupe_svg`, seuls les calques animés comptent) | **fait** (2026-10-14) et **déployé** |
| — | Traits cachés (`cacher`, réapparition, export SVG qui coupe les traits cachés) | **fait** (2026-10-14/15) et **déployé** |
| — | 16:9 (toile, exports recadrés, bandes contrôlées) ; essai réel (zone d'action + vectorisation ×2 : 99,0 %) | **fait** ; automatiser la zone d'action : **non fait** |
| — | Poses tracées, identifiant stable, sécurité, arcs, appariement par identifiant, rotation (§ 2.2) | **faits, NON déployés** (E0) |
| M9 | Appel depuis Next.js | **non fait** (E1) |
| M10 | `kukan_job` relié à Supabase | **non fait** (E3) |
| M11 | `kukan_rerender` sur Modal | **non fait** (E3) |
| M12 | Plusieurs générations en même temps (jetons GPU, `max_containers` de 2 à 8, plafond au pire) | **non fait** (E7) |
| — | Détection de la méthode de dessin (§ 4.2) | **non fait** (1-2 séances) |
| — | Mémoire réellement utilisée par un passage, puis réservation réduite (≈ −30 % de coût) | **non fait** (1 appel GPU, accord) |
| — | Générations en arrière-plan : copie figée, nouvelle version (§ 3.9) | **non fait** (≈ 0,5 côté moteur) |
| — | Enchaînements : timing global, avancement par passage, pivot (§ 3.10) | arcs et rythme continu **faits** (non déployés) ; le reste **non fait** |
| M13 | Ligne guide (§ 3.8) | **en attente de l'accord** |
| — | WebP animé, `sorties.resolution`, `sorties.gif.largeur` (§ 3.6) | **faits** (2026-10-28), **NON déployés** (E0) ; lissage des épaisseurs à 3 840 px **à décider** |
| — | Correction « sortir » (élément qui sort de derrière un contour, § 4.14) | **faite** (2026-10-29), **NON déployée** (E0) ; interface dans l'éditeur **non faite** (E5) |
| — | `annuler_correction_auto` | **non fait** |
| — | Import ORA / KRA / PSD, caméra (§ 4.13) | après le premier branchement du frontend |

### 10.3 Test : « déformer A pour fabriquer B » dans Kukan, contre Krita (à faire, rien de codé)
**Question** : la table lumineuse et les outils de déformation de Kukan donnent-ils de meilleurs intervalles que des
poses préparées dans Krita ?

**Ce qui existe**
- Moteur : journal d'édition (`deplacer`, `deplacer_bloc`, `remplacer`, `noeud_ajouter` = coupe exacte à toutes les
  poses, `noeud_supprimer`, `masquer_portion`, `timing`), `affine` et `maille` avec propagation, aimant, identifiant
  stable, arcs, `svg_arrivee`, appariement par identifiant (0 $, sans moteur) avec contrôle des identifiants
  douteux (§ 4.7).
- Frontend : le mini Krita en Fabric.js (crayon) **[À VÉRIFIER — dépôt frontend]**. Rien d'autre de l'éditeur.

**Ce qui manque (chemin minimal, étape E6, 2-3 séances)**
1. Ouvrir la pose A (SVG normalisé par `verifier`, qui renvoie chaque trait avec son `id_source`).
2. **« Dupliquer la pose »** : B = copie de A, **mêmes identifiants**.
3. Outils sur B : sélection (trait, lasso, bloc), déplacer / tourner / mettre à l'échelle (`affine`), maille 3 × 3,
   nœuds (déplacer un nœud ou une poignée ; ajouter un nœud = coupe exacte qui garde l'identifiant).
4. **Interdits** dans ce mode : couper un trait en deux, dupliquer un trait. Ajouter un trait (crayon) ou en effacer
   un est **explicite** et montré (vert / rouge, § 3.1).
5. Pelure de A sous B (table lumineuse), pose de l'artiste (image) en gris si elle existe.
6. Envoi de A et B en SVG avec `entrees.svg_poses.appariement: "identifiant"` → passage à **0 $** (moteur évité)
   → rendu → GIF.

**Protocole**
- **Avant** : l'essai Krita du § 4.8 (Krita garde-t-il les `id` après « dupliquer puis déformer » ?).
- **Dessins** (3 cas, fournis par l'utilisateur) :
  - T1 : bras qui plie ou main qui entre dans la poche (déformation douce + partie cachée) ;
  - T2 : tête qui tourne d'environ 22° (volume) ;
  - T3 : cyb, de la garde au coup (déplacement de blocs + manche qui se déforme).
- Pour chaque cas, l'artiste trace A une fois, puis fabrique B **deux fois** :
  - **K** : dans Krita (dupliquer le calque, outils de transformation, déformation, cage, liquéfier), export SVG ;
  - **U** : dans l'éditeur Kukan (étapes 1-6 ci-dessus).
  L'ordre K / U alterne d'un cas à l'autre (pour ne pas avantager la deuxième fois).
- Calcul : U par identifiant (0 $). K par identifiant si Krita garde les `id`, sinon par la forme avec le moteur
  (≈ 0,26 $ par passage, **accord GPU**).

**Critères** (mesurés sur les deux versions)
| Critère | Mesure | Attendu pour U |
|---|---|---|
| temps de l'artiste | minutes pour fabriquer B (chronomètre) | ≤ 1,2 × le temps K |
| identité | part des traits de A appariés par identifiant | ≥ 95 % |
| propreté | part de l'encre en morceaux < 25 px ; traits en fondu (nés + disparus) | ≤ K |
| défauts | note du scanner et défauts forts (`tools/scanner_gif.py`) | ≤ K, 0 fort |
| poses | images 0 et 16 contre les dessins de l'artiste, retrouvé à 1 px | ≥ 99 % |
| coût | GPU par passage | 0 $ |
| **œil de l'artiste** | planche à l'aveugle : les deux GIF côte à côte, ordre tiré au sort, l'artiste choisit | **décide** |
- **Seuil proposé** (à valider avant le test, § 9.3) : Kukan est « meilleur » si l'artiste préfère U sur au moins
  2 cas sur 3, sans critère technique pire que K.
- Référence de temps facultative : les mêmes intervalles faits **à la main** dans Krita (temps seulement).

### 10.4 Points ouverts du projet qui touchent le frontend (« Reste à faire » du moteur, 2026-10-29)
| # | Point | État |
|---|---|---|
| 1 | Redéploiement de `modal_app_v2.py` | E0 |
| 2 | Déclaration des blocs par choix de traits en A (aujourd'hui : une boîte par pose) | non codé (≈ 0,5-1 séance) ; l'éditeur en sera l'interface |
| 5 | Options `passages_blocs`, `apparier_forme`, `debris_px`, préréglage `poses_tracees` en production | validées sur le jus seul ; tests sur d'autres dessins |
| 7 | Image Docker à nettoyer ; secrets GitHub et modèle Replicate | non fait (accord) |
| 8 | Commits non poussés | l'utilisateur pousse lui-même |
| 10-12 | Essai Krita ; cas dur réel de l'appariement par identifiant ; frontend de la méthode (c) | § 4.8, § 10.3 |
| 14, 16 | Rotation : option 2 (zone + calque visage) à 45°, cas non testés (trois-quarts, profil, inclinaison) | dessins de l'utilisateur |
| 18 | Supabase + M9-M12 | E1-E3, E7 |
| 20 | Bouche du jus : table de correspondance (C88 → D83) à décider | sera une fonction de l'éditeur (§ 4.9) |
| 21-22 | Alerte de structure (contact nouveau entre deux éléments, trait réuni à un autre en B → C) | non codée ; à afficher dans la liste des défauts |
| 26 | Rotation C → D : défauts connus acceptés | § 5.3 |
| 27 | Budget GPU | § 2.2 |
| 28 | GIF de démonstration (16:9, mains dans les poches) | 16:9 A → B fait, poing qui sort de la poche fait (§ 4.14) ; pose C et mains dans les poches à faire |
| 32 | Résolution des sorties | WebP validé ; lissage des épaisseurs à 3 840 px à décider ; non déployé (§ 3.6) |
| 33 | Réglage 16:9 (recadrer le moteur sur le personnage, seuils sur le carré envoyé, pré-déplacement du premier passage) | non codé, accord |
| 34 | Apparition de derrière un contour (`sortir`) | fait côté moteur, non déployé ; jugement à l'œil du WebP ; interface de l'éditeur à faire |
| 35 | Bras qui passe devant un visage | non codé ; un SVG par calque et par pose (Krita n'écrit pas les calques dans le SVG), visage complet sous le bras |

## 11. Données d'exemple, fichiers de parité, commandes

### 11.1 Données d'exemple et fichiers de parité
`docs/frontend/parite/*.json` : entrées et sorties exactes du Python (Bézier, timing, images, journal, lecture, gomme,
`rigid_fit`), que le portage TypeScript doit redonner à 1e-6 px près (maille : 1e-3). Voir `parite/LISEZMOI.md`.

Cas « armure » : 120 traits, bras qui s'écartent de 11-13 px. Rendu automatique avec blocs rigides, sans GPU
(rejeu) ; 17 images.
| Fichier | Contenu |
|---|---|
| `pose_A.png`, `pose_B.png` | poses de l'artiste alignées (1254 × 1254) |
| `svg_artiste_krita.svg` | SVG d'origine exporté de Krita (un `<path>` par forme, `translate`, `M C L Z`, `width` en pt) |
| `svg_artiste_normalise.svg`, `svg_artiste.json` | SVG normalisé (`M` / `C`, `viewBox` carré) et rapport : qualité, alertes |
| `options.json` | options du travail (chemins remplacés par `<home>` / `<travail>`) |
| `animation.json` | document d'animation complet (122 chaînes, 10 blocs rigides, 2 corrections « ajouter ») |
| `mesures_rendu.json` | épaisseurs, ton et décalages par chaîne et par pose (format provisoire) |
| `status.json`, `events.jsonl` | suivi du travail |
| `qualite.json`, `scores.json`, `reparation_A-B.png`, `confiance_A-B.png` | contrôles |
| `rendu/000.svg`, `008.svg`, `016.svg`, `rendu/000.png`, `008.png`, `016.png`, `rendu/animation.gif` | sorties |

### 11.2 Commandes utiles
**Dépôt moteur** (`NDJ-create/kukan-inbetween`, branche `inversion-pousse`). Elles demandent Python 3, numpy,
Pillow, svg.path et `~/kukan-pylib` ; ce n'est pas le cas de Termux.
- Tests : `PYTHONPATH=~/kukan-pylib:. ~/venv/bin/python -m pytest tests -q` (environ 1 h 15 ; 347 passés et 5 sautés le 2026-10-29).
- Vérifier un SVG : `python -m kukan verifier-svg dessin.svg pose.png --apercu apercu.png`.
- Régénérer les fichiers de parité : `PYTHONPATH=~/kukan-pylib:. python tools/fixtures_parite.py docs/frontend/parite`.
- Lancer un travail en local : `python -m kukan run options.json --workdir dossier_travail` ; vérifier des options :
  `python -m kukan check options.json`.
- Rejeu sans GPU : `run_job(options, dossier, ctx=Contexte(archives=[dossiers des ZIP]))` (`kukan.options.Contexte`). Calculs lourds sous
  `systemd-run --scope -q -p MemoryMax=3G -p MemorySwapMax=0`.
- Modal (CLI dans `~/venv/bin/modal`) :
  - déployer : `modal deploy modal_app_v2.py` (accord requis) ;
  - appel GPU : **accord requis**.

**Frontend** : Next.js (à créer ou existant dans son dépôt) ; `npm run dev` ; variables d'environnement Supabase dans
`.env.local` (jamais dans Git).
