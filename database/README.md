# Field Index Database

Field Index uses PostgreSQL for persistent, multi-dynasty, multi-season history
and analytics storage. The CFB27 save remains the game source of truth.
PostgreSQL never writes directly back to a dynasty file; controlled edits flow
through the parser/backend safe-writer path.

## Architecture

```text
CFB27 Dynasty Save
        |
        v
parser/index.js
        |
        v
clean current-save model
        |
        v
database/import_save.js
        |
        +---- identity resolution
        +---- snapshot preparation
        +---- normalized game/history facts
        |
        v
PostgreSQL public schema
        |
        +---- analytics schema
        +---- bi schema
```

Each meaningful imported save is a historical checkpoint. A later save from the
same season becomes another snapshot so weekly/offseason changes can be queried.
A **complete identical import** (same dynasty, official season and file hash) is
skipped rather than duplicated. `--force-reimport` exists for deliberate
backfills/reprocessing.

## Official Season vs. Roster Season

CFB27 offseason saves can still report the completed season while the roster has
already rolled into the next year. Field Index therefore stores both:

- `season_id` — official/current season represented by the save.
- `roster_season_id` — season to which roster/team relationships belong.

This keeps National Signing Day and late-offseason roster changes out of the
wrong historical season.

## Dynasty Identity

`--dynasty-key` is the persistent Field Index identity of one dynasty. Use the
same key for every checkpoint and season of that dynasty, even if the display
name changes.

Example:

```text
gators-dynasty
```

A second dynasty must use a different key. All persistent teams, players,
coaches, seasons, games, recruiting history, rankings, and snapshots are scoped
through dynasty identity so raw CFB27 indices are never assumed to be globally
unique across unrelated dynasties.

## Migrations

Committed/applied migrations are immutable. Never edit an old migration to add a
new feature; create the next numbered migration.

Current migrations:

- `001_initial_schema.sql` — dynasties, seasons, teams, save imports.
- `002_core_football_schema.sql` — dynasty-scoped teams, conferences, team
  seasons, import metadata, team snapshots.
- `003_people_storage.sql` — persistent players/coaches, season relationships,
  player/coach import snapshots.
- `004_analytics_friendly_snapshots.sql` — normalized player attributes,
  abilities, team grades, coach stats, grade lookup.
- `005_game_storage.sql` — logical games, game snapshots, line scores, team box
  scores, player stat lines/facts, scoring-summary events.
- `006_analytics_layer.sql` — canonical lifecycle-safe analytics views, careers,
  transfers, rankings/KPIs, and BI-ready dimensions/facts.
- `007_extended_dynasty_history.sql` — team colors, player identity evidence,
  poll history, recruiting history/classes/roster matching, depth-chart history,
  postseason/championship history, awards, and additional BI-ready history facts.
- `008_recruiting_class_rankings.sql` — EA recruiting-class rank/conference-rank snapshots plus analytics/BI history views.
- `009_coach_talent_history.sql` — all coach ability-tree/node snapshots plus live named ability metadata and analytics/BI history views.

From the project root:

```powershell
npm run db:migrate
```

or directly:

```powershell
node database/migrate.js
```

For the original learning database that already had the manually created 001
schema, `migrate.js` can record 001 as an existing baseline when the schema is
complete. It refuses to baseline a partial/incorrect 001 schema.

## Local PostgreSQL Configuration

Copy:

```text
database/.env.example
```

to:

```text
database/.env
```

Then set the local PostgreSQL connection. `database/.env` is ignored by Git.

```text
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_local_password
PGDATABASE=field_index
```

The current development tools call the PostgreSQL `psql` executable supplied by
the Windows PostgreSQL installer.

## Import a Dynasty Save

From the project root:

```powershell
npm run db:import -- "C:\path\to\DYNASTY-SAVE" --dynasty-key gators-dynasty --dynasty-name "Gators Dynasty"
```

Equivalent direct command:

```powershell
node database/import_save.js "C:\path\to\DYNASTY-SAVE" --dynasty-key gators-dynasty --dynasty-name "Gators Dynasty"
```

Useful options:

```text
--dry-run             Parse/validate/build SQL without changing PostgreSQL.
--sql-out <path>      Save generated SQL for inspection.
--skip-migrations     Skip the automatic migration step.
--force-reimport      Reprocess an otherwise complete identical import.
--skip-verify          Diagnostic only: skip automatic post-import database verification.
```

The full game/stat import can require more than Node's default heap. The CLI
relaunches itself with a 4 GB Node heap when required.

## Import Pipeline

A normal import:

1. validates the FBCHUNKS save, Dynasty game type, game year 27, and schema 486.1
2. hashes the source with SHA-256 and resolves the stable dynasty
3. resolves official `season_id` and independent `roster_season_id`
4. skips a previously completed identical import unless `--force-reimport` is used
5. upserts dynasty-scoped team/conference references and team colors
6. stores team-season and import snapshot metadata
7. resolves persistent player identities and records source identity observations
8. stores player roster, ratings, abilities, appearance, and development snapshots
9. resolves persistent coach identities/roles and stores coach snapshots/stats
10. stores schedule slots, game snapshots, authoritative line scores, box scores,
    player stat lines/facts, and scoring-summary events
11. stores media/coaches/CFP ranking snapshots
12. stores recruiting prospects, team interest/board state, commitment/signing
    state, recruiting classes, and conservative recruit→roster matching evidence
13. stores depth-chart snapshots for historical progression
14. stores postseason/CFP/champion/runner-up/Heisman state and postseason games
15. stores available player/coach award snapshots
16. stores recruiting-class ranking snapshots and complete coach talent-tree/node history
17. expands normalized analytical facts and commits the entire import as one PostgreSQL transaction
18. runs full database verification and fails the import command if verification does not pass

If any part of SQL execution fails, PostgreSQL rolls back the transaction rather
than leaving a half-imported checkpoint.

## Duplicate Import Protection

Field Index intentionally distinguishes two cases:

- **same dynasty + season + identical complete file hash** → skip as duplicate
- **different file/checkpoint in the same season** → import as a new historical snapshot

Older imports created before migration 007 may be processed once again so the new
extended history tables can be backfilled. `--force-reimport` is also available
when a deliberate rebuild is required.

## Identity Rules

### Players

1. unique positive CFB27 `PresentationId` when available
2. conservative bio/fingerprint fallback
3. `player_identity_observations` retains import-level evidence including source
   row, presentation ID, birth-date value, and roster fingerprint

`playerRow` is never the persistent database identity.

### Coaches

1. unique positive PresentationId when available
2. stable Coach source row fallback
3. bio fingerprint final fallback

### Recruits

A recruit identity is scoped to one incoming class season and source recruit row.
Recruit→roster matching never guesses across ambiguous candidates:

1. use direct same-import player evidence when CFB27 supplies it
2. otherwise resolve only a **unique** compatible roster fingerprint in an equal
   or later class season
3. keep ambiguous/unresolved matches explicitly unresolved

That makes recruiting history safe to improve later without corrupting identity.

## Game Storage

### Logical game vs. snapshot

`games` represents a stable dynasty-season schedule slot. Participants are not
permanently attached to that logical row because unplayed CFP/bowl slots can
change between saves.

`game_import_snapshots` stores matchup, status, score, date, broadcast, stadium,
bowl metadata, and stat availability for one import.

### Scores and overtime

`SeasonGame` home/away totals and quarter/OT fields are authoritative.
`ScoringSummary` is event-list data only and is never used to reconstruct a final
score. CFB27 exposes the line-score OT value as aggregate overtime scoring, and
Field Index stores it that way.

### FCS context

FCS opponents remain valid game context even though individual FCS player stats
are intentionally excluded. The original team index/name is retained even when
there is no persistent FBS `team_id`.

### Player game facts

`player_game_stat_lines` stores clean category JSON for passing/rushing/receiving,
defense, O-line, kicking, punting, returns, and fumbles. `player_game_stats`
expands numeric metrics into long-form facts for SQL/BI filtering.

## Extended Historical Storage — Migration 007

Migration 007 adds import-by-import evidence for data that previously existed
only in the current parsed save:

- `player_identity_observations`
- `ranking_snapshots`
- `recruiting_prospects`
- `recruiting_prospect_snapshots`
- `recruiting_board_snapshots`
- `recruiting_team_interest_snapshots`
- `depth_chart_snapshots`
- `postseason_import_snapshots`
- `award_snapshots`

It also stores save-backed team presentation colors directly on persistent teams.

## Analytics Layer

`public` contains persistent normalized data. Read-only views are split into:

```text
analytics   curated football/history analysis
bi          flat dashboard-ready dimensions/facts
```

Migration 006 provides the core game/season/career/transfer analytics and
lifecycle-safe import selectors. Migration 007 adds:

- `analytics.ranking_history`
- `analytics.recruiting_history`
- `analytics.recruiting_roster_matches`
- `analytics.recruiting_classes`
- `analytics.depth_chart_history`
- `analytics.postseason_history`
- `analytics.postseason_games`
- `analytics.championship_history`
- `analytics.award_history`

and BI-ready history facts for rankings, recruiting, recruiting classes/roster
matches, depth charts, postseason, postseason games, championships, and awards.
Migration 008 adds recruiting class-ranking history. Migration 009 adds coach talent-tree/node history, including game-facing names, descriptions, costs, branches, position groups, effects, durations and prerequisites where the live save exposes them.

Actual Power BI dashboards are intentionally not part of this backend milestone.

## Lifecycle-Safe Analytics

Later offseason saves can clear historical stat caches, so "latest import" is
not always the richest source for completed-season stats. Migration 006 retains
separate selectors for newest schedule/roster context and richest team/player/
scoring checkpoints. A later roster rollover therefore does not silently erase
historical production already archived from an earlier save.

The **Players Leaving** stage remains a useful checkpoint for preserving complete
final-season player/game data before later offseason cleanup.

## Read/History API

`database/query.js` exposes application-facing query helpers including:

- dynasties and dynasty summaries/history
- recent imports
- player career and coach career/history
- team history and transfers
- ranking history
- recruiting history/classes and class-ranking history
- coach talent tree/node history
- depth-chart history
- postseason games/history and championship history
- award history
- canonical games

The future UI should use the backend facade in `backend/services/database_history_service.js`
rather than constructing ad-hoc SQL.

## Example SQL

See:

```text
database/queries/analytics_examples.sql
```

Examples cover game/season leaders plus ranking movement, recruiting classes,
recruit→roster matching, depth-chart history, postseason/championship history,
and awards.

## Verify PostgreSQL

After migrations and imports:

```powershell
npm run db:verify
```

or:

```powershell
node database/verify.js
```

The verifier checks migrations/raw relationships plus analytics/BI schemas,
canonical row counts, history coverage, uniqueness, transfer consistency, player
identity observations, ranking validity, recruiting link consistency, depth-chart
resolution, postseason snapshot coverage, award links, and BI fact parity.
