# Auditoría — AoE CCG (opencards) — Referencia para revisión con Opus

> Estado: CCG Age of Empires integrado y desplegado. El objetivo de esta auditoría
> es (1) revisar el diseño con Opus, (2) identificar mejoras para la web,
> (3) anotar deuda técnica conocida antes de "poner la web bien".

## Contexto (cómo llegamos aquí)

- Repo: `pilshub/opencards` (monorepo TS determinista).
- Motor `@opencards/core` — no se debe tocar sin decisión explícita (invariantes de determinismo).
- Juego nuevo: `games/aoe-ccg/` (22 cartas, 2 facciones, Wonder, 2 mazos, 5 tutoriales, 12 tests / 100% cobertura).
- Integración web: botón "Jugar AoE CCG ⚔️" en Play tab (`startAoeGame` en `packages/app/src/App.tsx`).
- Ember Foundry (`games/ember-foundry`) es el juego de referencia ya integrado por completo.

## 1. El age-gate: DEUDA TÉCNICA / DECISIÓN DE DISEÑO

### Lo que el diseño de Opus pedía (aprobado)

Un sistema de Eras Feudal(1)→Castle(2)→Imperial(3): las cartas de edad alta se
juegan solo cuando el jugador ha "avanzado de era", con tácticas Advance que
suben el nivel.

### Lo que se pudo hacer (adaptación honesta)

El motor `@opencards/core` NO soporta gate duro de legalidad por nivel/contador
de jugador:

- `EngineCondition` solo lee `base|energy|damage|units|handSize|counter` de
  **unidades** (`subject: source|controller|opponent` NO expone counter de jugador).
- `CardSpec` no tiene campo de "era mínima" y `getLegalCommands()` genera
  `playCard` para todas las cartas (valida solo energía/límites).
- Tocar `packages/core` está protegido (determinismo) y no se hizo sin aprobación.

Por eso la progresión de Era se proyectó en la **economía**: las tácticas
`advance-castle-age` (3, +2 energía +1 draw) y `advance-imperial-age` (5, +3
energía +2 draw) dan rampa, y las cartas caras caen a late-game por la curva
de coste (energía 1→12). La **Wonder** sí usa un contador real (sobre la propia
unidad, `subject:'source'`), así que su wincon alternativo funciona de verdad.

### Decisión pendiente (consultar con Opus)

- ¿Aceptamos era-as-economía (simple, sin tocar core) o añadimos era gate real?
  Si se quiere gate duro, hay dos vías:
  a) **En el juego (sin tocar core)**: mezclar en el decklist solo cartas de la
  era alcanzable, o representar la era con un contador en una unidad "Era
  token" persistente y evaluarlo con `subject:controller metric:counter`
  (si el motor soporta counter de jugador — VERIFICAR; si solo lee de
  unidades, el token debe ser una unidad permanente).
  b) **En core (decisión mayor)**: añadir un predicado de legalidad por era a
  `EngineCondition`/`getLegalCommands`. Implica re-auditar determinismo,
  replay hashes y los otros juegos. Opus determinó en el pasado que esa
  clase de cambios al motor determinista requiere auditoría con tests
  adversariales y verificación de hash de semilla.

## 2. La integración web es RÚSTICA (mejora pendiente)

Actualmente `startAoeGame()` solo llama a `createAoeCcgSetup` y lo pasa al
renderer genérico de Foundry. No está "de verdad" integrada:

- **Format**: `loadFormat()` y el `FormatEditor` siguen el formato Foundry.
  La UI muestra `Format: Ember Duel: Foundry Set` aunque estés jugando AOE.
- **Card pool / arte**: `BUILTIN_DEFINITIONS` solo tiene las cartas Foundry y
  las `CardDefinition` de AOE no están; `Card.tsx` y `art-manifest.ts` no
  conocen el arte AOE (caen a genérico).
- **Deck editor**: no construye el mazo AOE; el render usa el decklist Foundry.
- **Tutoriales**: los 5 `AOE_TUTORIALS` existen en `aoe-ccg` pero la app solo
  muestra `FOUNDRY_TUTORIALS`.

Para "poner la web bien" (y que AOE sea un ciudadano de primera), conviene:

- Un concepto de **formato/juego con varias reglasets** (Foundry + AoE) que
  propague `activeFormat`/nombre/facciones/cartas/art por toda la app.
- Mapear `CardDefinition` / arte para AOE (o reusar el pipeline de schema).
- Un selector de juego/facción antes de "Nueva partida".
- Botón/tutoriales de AOE.
- Render del formato correcto en el command bar.
  Relación de componentes a tocar: `App.tsx`, `FormatEditor.tsx`, `Card.tsx`,
  `DeckEditor.tsx`, `art-manifest.ts`, `index.test.ts` + E2E que prueben start
  de AOE.

## 3. El "10/10 del motor" — estado tras esta sesión

Ya cerrado y publicado:

- Layout móvil arreglado (header nav `flex-wrap`) + `.gitattributes` (fin de
  ruido CRLF en Windows) + `core.autocrlf=input`.
- `verify:mvp` verde completo: typecheck, lint, format, tests, cobertura,
  replay 200/200, hidden-info 2/2, balance 400, builds, E2E 13/13.
- Juego AOE: 12 tests / 100% cobertura; partidas simuladas completas.

Faltaría para "bien del todo" (según criterio de Opus / AGENTS):

- Opus audita el diseño y el age-gate.
- Validador de balance (400 partidas) extendido a AOE con las constraints del
  diseño (TTK, win-rate 45-55%, Wonder 4-10%).
- Release/tag v1.0.0 y build de escritorio (hoy solo web).

## 4. Cómo auditar el determinismo (regla Opus en CLAUDE.md)

En cualquier cambio que toque el motor hay que:

1. Correr la misma semilla dos veces y comparar un hash del estado final.
2. Verificar invariantes (aquí: suma de hmm damage, counters de Wonder).
   Los tests de `aoe-ccg` ya cubren determinismo de winner por seed; para cambios
   de core hay que ampliar a hash de estado.

## 5. Pendientes / siguiente acción

- [ ] Abrir URL pública y **verificar HTTP 200** + que el botón AOE aparece y
      arranca una partida en el navegador.
- [ ] Auditar con Opus (cuando recupere cupo): diseño, age-gate, balance,
      revisión del diff de la integración.
- [ ] Decidir el alcance de "poner la web bien" (formato multi-juego, arte,
      deck editor, tutoriales AOE).
- [ ] Extender el validador de balance a AOE.
- [ ] (Opcional) Release/tag y build de escritorio.

## Datos de referencia rápidos

- Repo local: `C:\Users\PORTO\agentic-hq\opencards-web`
- Paquete juego: `games/aoe-ccg/`
- App: `packages/app/` · Build web: `npm run build:web --workspace=@opencards/app`
- Dev local: `npm run dev --workspace=@opencards/app -- --host 0.0.0.0 --port 5180`
- URL prod (Vercel): https://opencards-web-psi.vercel.app
- Gate completo: `npm run verify:mvp` (raíz)
- Rama: `main` · Últimos commits: `9728dcf` (aoe-ccg), `7b2f1eb` (web integración)
- Despliegue Vercel hecho con `vercel --prod --yes` (proyecto `pilshub`, vercel.json ya presente)
