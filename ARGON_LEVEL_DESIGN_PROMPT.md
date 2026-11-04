# PROMPT OPÉRATIONNEL ARGON : LEVEL DESIGN CHIRURGICAL (JSON-AST)

> **Branche de travail obligatoire :** `feature/session-3-json-ast-map`  
> **Contrainte de ressource :** Quota résiduel critique (3%). **Zéro bavardage, zéro refactorisation inutile, exécution directe et chirurgicale.**  
> **Objectif unique :** Connecter et caler le **Level Design pur et dur** de la descente de 1 600m à partir de l'architecture déclarative **JSON-AST** déjà en place.

---

## 🎯 ÉTAT DU PROJET AU DÉMARRAGE
- **Git HEAD :** `358b632` sur `feature/session-3-json-ast-map`.
- **Palette :** Rocheuses Canadiennes calcaire/schiste/névés (en place).
- **Ergonomie :** Cuvette parabolique anti-recul + Rewind instantané `[R]` 38m amont à 25 km/h (en place).
- **Audio :** Roue libre VTT cliquetante, morsure crampons, uréthane skate (en place).
- **Écran Titre :** Stylisé avec sélecteur de véhicule et déblocage audio (en place).
- **JSON-AST existant :**
  - Schema & Compilateur : `src/world/courseAst.ts` (`BOREAL_COURSE_AST`, `COMPILED_BOREAL_COURSE`).
  - Données déclaratives : `src/world/course.boreal.json` (3 Actes, 4 Lignes : Verte, Bleue, Noire, Rivière).
  - Micro-landmarks 3D : `src/components/TriathlonCourse.tsx` (Passerelles North Shore, Timber Flume, Road Gap).

---

## 🛠️ MISSION DE LEVEL DESIGN (3 CHANTIERS PRÉCIS)

### Chantier 1 : Raccordement dynamique Terrain $\leftrightarrow$ AST (`src/world/terrainData.ts`)
1. Dans `terrainData.ts`, remplacer les anciens points en dur `ASPHALT_SPLINE_POINTS` et `DIRT_SPLINE_POINTS` par les courbes compilées issues de l'AST :
   - `asphaltCurve` $\leftarrow$ `COMPILED_BOREAL_COURSE.lines.get('LINE_GREEN').curve`
   - `dirtCurve` $\leftarrow$ `COMPILED_BOREAL_COURSE.lines.get('LINE_BLUE').curve`
   - `riverCurve` $\leftarrow$ `COMPILED_BOREAL_COURSE.lines.get('LINE_RIVER').curve`
2. Veiller à ce que l'échantillonnage rapide `initSplineSamples()` et les cuvettes paraboliques continuent de fonctionner sans surcoût CPU (0 allocation en `useFrame`).

### Chantier 2 : Calibrage Millimétré des 3 Lignes (`src/world/course.boreal.json`)
Ajuster les coordonnées et propriétés dans le JSON pour créer une progression rythmique inoubliable :
1. **Ligne Verte (Asphalte / Longboard) :**
   - Calibrer les rayons des épingles (`arcDegrees`, `radiusMeters`) pour permettre des powerslides continus sans perte de vitesse excessive.
   - Largeur de bande : 8.0m avec devers doux.
2. **Ligne Bleue (Singletrack / VTT Flow) :**
   - Calibrer les 6 kickers (`KICKER_Z_CENTERS`: `-615`, `-435`, `-210`, `15`, `235`, `385`) pour que la trajectoire parabolique du saut à 35 km/h atterrisse pile sur la pente descendante (le "sweet spot").
   - Intégrer la passerelle North Shore (`blue-boardwalk-1`, Z: `-250`) et la glissoire à bois (`blue-flume-1`, Z: `-25`) parfaitement dans la trajectoire du sentier.
3. **Ligne Noire (Free-ride / Rampage Crête) :**
   - Dessiner l'arête vertigineuse de $Z: -765$ à $-470$ (largeur 2.5m sur la crête calcaire).
   - Caler le **Road Gap Kicker** (`black-road-gap-1` à $Z: -585$) : le tremplin doit propulser le joueur au-dessus du lacet de la route verte situé 5m plus bas, avec une réception propre sur le talus opposé !

### Chantier 3 : Feedback de Surface "Wood Planks" (`src/world/terrainData.ts` & `src/audio/soundscape.ts`)
1. Identifier la zone de la passerelle North Shore ($Z \in [-270, -230]$, $X \in [-48, -40]$) comme surface `WOOD` (ou sous-type).
2. Déclencher un son de vibration et claquement de lattes de bois rapides (`tac-tac-tac`) sous les roues dans `soundscape.ts`.

---

## 🔒 RÈGLES STRICTES D'EXÉCUTION
- **ZÉRO allocation** dans les boucles `useFrame` (réutiliser les vecteurs scratches).
- **Vérification obligatoire :** Lancer `npm run build` (`tsc -b && vite build`) et vérifier que la compilation passe avec 0 erreur.
- **Commit propre :** Commiter avec un message conventionnel :
  `git commit -m "feat(level-design): dynamic AST terrain binding, calibrated 3-line flow, and North Shore wood audio"`
- **Push :** `git push origin feature/session-3-json-ast-map` (avec bypass sandbox si demandé pour le réseau).
