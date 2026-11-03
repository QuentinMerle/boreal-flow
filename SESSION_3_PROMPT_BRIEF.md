# Session 3 Kick-off : "Boreal Flow — Architecture JSON-AST & La Montagne comme Personnage Principal"

> **Branche de travail :** `feature/session-2-diorama-gameplay` (ou `feature/session-3-json-ast-map`)  
> **Dépôt GitHub :** https://github.com/QuentinMerle/boreal-flow  
> **Stack :** Three.js + R3F + TypeScript + Zustand + Web Audio API (60–120 FPS, 0 allocation dans `useFrame`)  
> **Modèle recommandé pour démarrer :** **Gemini 4 Argon (High)** (pour le schéma de données AST, la topologie de graphe 3D et le raccordement de terrain $O(1)$).

---

## 💡 L'Intuition Clé du Playtest (Le Test des 7 ans)
> *"La map, c'est vraiment le personnage principal."*

Dans *Lonely Mountains: Downhill*, *A Short Hike* et *Journey*, le joueur n'est qu'un avatar explorateur : **la Montagne est le véritable protagoniste**. Elle a son tempérament, ses colères (crêtes vertigineuses battues par le vent), ses refuges (canopée feutrée, bivouac au coin du feu) et son tempo musical. 

La Session 3 a pour mission de transformer cette grosse descente brute en un grand voyage physique sculpté **"aux petits oignons"**, soutenu par un design sonore viscéral.

---

## 1. Architecture Déclarative : Le Format JSON-AST (`course.boreal.json`)
Remplacer les splines codées en dur dans TypeScript par un parseur et générateur procédural d'arbre de piste (`courseAst.ts`) :
- **Sections & Biomes :** Découpage du tracé en nœuds typés portant physique, pente, largeur, cambrure et profil de cuvette (*funneling*).
- **Le Système à 3 Lignes (Forks Dynamiques) :**
  - `LINE_GREEN (La Ligne Touriste)` : Route large (5 m), dévers doux, 0 risque de chute, sensation de vitesse fluide mais chrono plus lent.
  - `LINE_BLUE (Le Singletrack Flow)` : Sentier de terre battue et d'aiguilles de pin, virages relevés en bermes naturelles, branches basses, powerslides requis.
  - `LINE_BLACK (La Ligne Fantôme / Gap Jumps)` : Crêtes rocheuses effilées (2 m de large avec le vide), tremplins naturels ("gap jumps") qui coupent par-dessus les lacets pour pulvériser le record au chrono.
- **Landmarks Signatures & Micro-Environnements :**
  - *Le Timber Flume :* Ancienne glissoire à bois en demi-rondins de bûcherons utilisable comme un halfpipe en VTT/skate.
  - *Le Pont Suspendu Brisé :* Passerelle en lattes au-dessus d'une gorge nécessitant un saut au bon moment.
  - *L'Arche de Roche :* Tunnel naturel avec réverbération acoustique caverneuse.

---

## 2. Le Voyage en 3 Actes (1 600m / Dénivelé 335m)
1. **Acte I : Les Crêtes du Diable (Sommet, 335m -> 220m) :**
   - Grès ocre *Red Bull Rampage* désertique, vent qui hurle, crêtes vertigineuses, gaps au-dessus des ravines. Zéro arbre.
2. **Acte II : Le Labyrinthe Boréal (220m -> 80m) :**
   - Forêt dense d'épinettes géantes, lumière tamisée et ombres mouchetées au sol (effet de vitesse stroboscopique), passerelles en lattes de bois North Shore (`tac-tac`) au-dessus des ruisseaux et troncs à franchir en bunny-hop.
3. **Acte III : Les Rapides du Canyon & Lac Miroir (80m -> 0m) :**
   - Vallée ouverte en herbe dorée texturée, grandes courbes rapides sur asphalte (70–90 km/h) longeant les gorges turquoise, avec bifurcations vers les rapides en kayak pour terminer au bivouac du lac (face au feu de camp).

---

## 3. Ergonomie & Flow "Zéro Frustration"
- **Profil de Piste en Cuvette (Bobsleigh Funneling) :**
  Les accotements du sentier remontent légèrement pour que la gravité et la physique ramènent toujours naturellement le vélo ou la planche vers l'avant et l'aval, éliminant tout blocage en montée ou tête-à-queue involontaire.
- **Touche de Restart / Checkpoint Instantané `[R]` :**
  Une pression sur `[R]` (ou Gamepad `Back`) replace instantanément le joueur 40 m en amont sur le tracé officiel, déjà lancé à 25 km/h, sans aucun écran de chargement.

---

## 4. Design Sonore Viscéral des Véhicules (Web Audio API)
- **VTT (Mountain Bike) :**
  - Cliquetis métallique rapide de la roue libre en roue libre (*freehub ratchet buzz* `clic-clic-clic-clic`).
  - Morsure agressive des crampons sur la terre sèche et les graviers (*knobby tire bite*).
  - Claquement sec de la chaîne sur les secousses et bosses (*chain slap*).
  - Pchitt de compression de la fourche hydraulique sur les réceptions de saut.
- **Longboard :**
  - Ronronnement velouté et feutré des roues 70mm sur l'asphalte lisse.
  - Racle sourd du bois et de l'uréthane en virage appuyé (*carve friction*).
  - Pop net du deck lors des ollies.
- **Canoë :**
  - Clapotis d'étrave fendant l'eau calme et gouttes qui retombent de la pale en fin de course.

---

## Instructions pour l'Assistant
Commence par concevoir le schéma TypeScript de l'AST dans `src/world/courseAst.ts`, puis implémente le moteur de parsing et d'injection de rubans procéduraux dans le monde Three.js.
