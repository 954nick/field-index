# Field Index Backend Architecture

## Scope

This document describes the backend/data architecture that sits between a CFB27
Dynasty save and the future desktop UI. The UI must not know CFB27 table IDs,
FBCHUNKS offsets, CharacterVisuals encoding, PostgreSQL table layout, or writer
compression details.

## Data flow

```text
CFB27 save
  -> parser/index.js
     -> validated clean current-save model
        -> backend/ services (read APIs)
        -> database/import_save.js (persistent history)
           -> PostgreSQL raw snapshot tables
           -> analytics views
           -> bi flat views (dashboard source only; dashboards are later)

Edit request
  -> backend/editing/EditSession
     -> parser/editor.js whitelist + business validation
     -> staged mutation log
     -> safe writer
        -> EA compression-profile gate
        -> preserve FBCHUNKS slot and tail
        -> short DYNASTY-FI-* output name
        -> parser reopen/verification
```

## Boundaries

### `parser/`

Owns game-format knowledge:

- exactly one schema: `schemas/C27_486_1.gz`
- Coach schema compatibility clone that removes only `LeagueJobMotivation`
- CFB27 table/reference extraction
- current-save transforms
- CharacterVisuals head-layer encoding
- safe save mutation
- EA-compatible classic-zlib writer gate

No UI code belongs here.

### `backend/`

Owns application-facing services:

- players
- Head IDs
- teams
- coaches
- schedules/games/box scores
- depth charts
- recruiting
- rankings/postseason
- current-save analytics
- asset mappings
- staged editing
- persistent-history query facade

This is the primary API boundary the future desktop UI should consume.

### `database/`

Owns persistent multi-dynasty/multi-season history:

- migrations
- import orchestration
- entity identity
- snapshots
- normalized game facts
- recruiting/ranking/depth/postseason history
- SQL analytics views
- BI-ready views
- duplicate import protection

The database never writes directly to a CFB27 save.

### `assets/mappings/`

Owns lightweight, repository-safe mapping data. Multi-GB raw game exports remain
local/ignored.

## Identity strategy

### Dynasty

A user-visible name is not identity. Every imported dynasty receives a stable
`dynasty_key`, reused for every save and season of that dynasty.

### Player

1. Unique positive CFB27 `PresentationId` when available.
2. Conservative bio fingerprint fallback.
3. `player_identity_observations` retains source row, presentation ID, birth-date
   evidence and a roster fingerprint per import for later reconciliation.

Raw `playerRow` is never the persistent database identity.

### Coach

1. Unique positive PresentationId when available.
2. Stable Coach source row fallback (verified across observed lifecycle saves).
3. Bio fingerprint as final fallback.

### Recruit

Recruit identity is scoped to the incoming class season + source recruit row.
A separate roster-match view links recruits to later roster players using direct
same-import evidence first, then a unique roster fingerprint. Ambiguous matches
are preserved as ambiguous rather than guessed.

## Season model

`save_imports` has both:

- `season_id`: official/current season reported by the save
- `roster_season_id`: season to which roster/team relationships belong

This prevents National Signing Day/late-offseason roster rollover from being
written into the wrong historical season.

## Editing transaction model

`EditSession` is an application-level staging transaction:

1. open untouched source
2. validate/stage operations
3. rollback the in-memory editor on a failed stage
4. allow `undoLast()` / `reset()`
5. commit only after all desired changes are staged
6. automatically generate a short output filename unless overwriting the source
7. require a backup before source overwrite
8. safe-write and reopen for verification

The production API blocks arbitrary player/coach `rawFields` unless an explicit
unsafe development option is enabled.

## Head ID safety model

A numeric Head ID is resolved through `assets/mappings/head_catalog.json`.
Production writes require a complete catalog profile containing the required
player fields, portrait, skin tone and Head-layer state. Unknown, ambiguous,
incomplete, or missing-portrait profiles fail closed.

Only required head identity state is changed. Base and PlayerOnField loadouts are
preserved so equipment/body/tattoos do not get copied from another player.

## Release boundary

Development currently uses Node.js + the compatible classic-zlib helper runtime.
The final Windows release must bundle the compatible compression runtime and all
required application runtimes so end users do not need Git, Python, npm, or BAT
files. That packaging step should happen only after the in-game regression matrix
passes on the finished backend.
