# PROMPT OPÉRATIONNEL ARGON : LEVEL DESIGN CHIRURGICAL & DÉNIVELÉ EN MARCHES

> **Branche de travail obligatoire :** `feature/session-3-json-ast-map`  
> **Contrainte de ressource :** Quota résiduel critique (3%). **Zéro bavardage, zéro refactorisation inutile, exécution directe et chirurgicale.**  
> **Objectif unique :** Raccorder le **JSON-AST** et sculpter le **dénivelé en marches de respiration** (plat/vallonné $\to$ descente $\to$ plat/vallonné $\to$ descente) pour transformer la grosse descente continue en un chef-d'œuvre de rythme et de flow.

---

## 🎯 ÉTAT DU PROJET AU DÉMARRAGE
- **Git HEAD :** sur `feature/session-3-json-ast-map`.
- **Palette :** Rocheuses Canadiennes calcaire/schiste/névés (en place).
- **Ergonomie :** Cuvette parabolique anti-recul + Rewind instantané `[R]` 38m amont à 25 km/h (en place).
- **Audio :** Roue libre VTT cliquetante, morsure crampons, uréthane skate, réceptions (en place).
- **Écran Titre :** Stylisé avec sélecteur de véhicule et déblocage audio (en place).
- **JSON-AST existant :**
  - Schema & Compilateur : `src/world/courseAst.ts` (`BOREAL_COURSE_AST`, `COMPILED_BOREAL_COURSE`).
  - Données déclaratives : `src/world/course.boreal.json` (3 Actes, 4 Lignes : Verte, Bleue, Noire, Rivière).
  - Micro-landmarks 3D : `src/components/TriathlonCourse.tsx` (Passerelles North Shore, Timber Flume, Road Gap).

---

## 🛠️ MISSION DE LEVEL DESIGN (4 CHANTIERS PRÉCIS)

### Chantier 1 : Profil de Dénivelé en Marches & Paliers de Respiration (`src/world/terrainData.ts`)
Actuellement, `computeSmoothSlopeElevation(z)` applique une pente monotone continue $335 \times (1 - t)^{1.52}$.
**Le joueur a besoin de respirer !** Remplacer cette pente continue par un profil en **3 marches géologiques** :
1. **Drop 1 (Sommet Alpin) :** Chute raide de $335\text{m} \to 255\text{m}$ ($Z: -765 \to -630$). Vitesse pure.
2. **Palier 1 (Col Alpin Vallonné) :** Plateau doux en faux-plat descendant à 2–4% avec de légers rollers ($Z: -630 \to -490$, $Y \approx 255\text{m} \to 235\text{m}$). On respire, on carve tranquille, on admire la vue.
3. **Drop 2 (Goulotte Forestière) :** Chute rapide à travers les épinettes de $235\text{m} \to 135\text{m}$ ($Z: -490 \to -280$).
4. **Palier 2 (Marais & Passerelles North Shore) :** Plateau boisé vallonné ($Z: -280 \to -130$, $Y \approx 135\text{m} \to 115\text{m}$) avec les pontons de bois, racines et virages à plat.
5. **Drop 3 (Plongeon du Canyon) :** Couloir rocheux plongeant le long des rapides de $115\text{m} \to 25\text{m}$ ($Z: -130 \to 180$).
6. **Palier 3 (Delta & Plage du Lac Miroir) :** Glisse douce finale $25\text{m} \to 0\text{m}$ ($Z: 180 \to 485$) menant au feu de camp et au ponton.
> **Règle d'or :** Sur les paliers, maintenir **toujours une légère pente descendante continue (2 à 4% de pente)** ou des creux de pumping pour que le joueur conserve sa vitesse sans être stoppé net.

### Chantier 2 : Raccordement dynamique Terrain $\leftrightarrow$ AST (`src/world/terrainData.ts`)
Remplacer les anciens points en dur `ASPHALT_SPLINE_POINTS`, `DIRT_SPLINE_POINTS`, `RIVER_SPLINE_POINTS` par les courbes de l'AST compilé :
- `asphaltCurve` $\leftarrow$ `COMPILED_BOREAL_COURSE.lines.get('LINE_GREEN').curve`
- `dirtCurve` $\leftarrow$ `COMPILED_BOREAL_COURSE.lines.get('LINE_BLUE').curve`
- `riverCurve` $\leftarrow$ `COMPILED_BOREAL_COURSE.lines.get('LINE_RIVER').curve`
Conserver l'échantillonnage rapide et la cuvette parabolique bobsleigh (0 allocation dans `useFrame`).

### Chantier 3 : Calibrage Millimétré des 3 Lignes (`src/world/course.boreal.json`)
Ajuster les nœuds dans le JSON pour correspondre aux nouveaux paliers :
1. **Ligne Verte (Asphalte / Longboard) :** 12 épingles bien rythmées (slides faciles sur les drops, carving relax sur les paliers).
2. **Ligne Bleue (Singletrack / VTT Flow) :** Caler les 6 kickers (`KICKER_Z_CENTERS`: `-615`, `-435`, `-210`, `15`, `235`, `385`) pour que la trajectoire parabolique du saut à 35 km/h atterrisse pile sur la pente de réception. Placer la passerelle North Shore sur le Palier 2 ($Z \approx -250$).
3. **Ligne Noire (Free-ride / Rampage) :** Arête en crête vertigineuse et Road Gap ($Z: -585$) survolant l'épingle de la route verte avec 12m de vol plané.

### Chantier 4 : Audio Feedback "Lattes de Bois" (`src/world/terrainData.ts` & `src/audio/soundscape.ts`)
Détecter la passerelle North Shore ($Z \in [-270, -230]$, $X \in [-48, -40]$) comme surface boisée et déclencher un claquement rythmé Web Audio de lattes de bois (`tac-tac-tac`) sous les roues.

---

## 🔒 RÈGLES STRICTES D'EXÉCUTION
- **ZÉRO allocation** dans les boucles `useFrame`.
- **Vérification obligatoire :** Lancer `npm run build` (`tsc -b && vite build`) et vérifier que la compilation passe à 100%.
- **Commit & Push :**
  `git commit -m "feat(level-design): terraced stepped elevation profile, dynamic AST binding, and North Shore audio"`
  `git push origin feature/session-3-json-ast-map`
