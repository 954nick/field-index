# Field Index Database

Field Index uses PostgreSQL for persistent dynasty history and analytics storage.
The CFB27 save remains the game source of truth. PostgreSQL does **not** write
back to the dynasty file; controlled save editing remains in `parser/editor.js`.

## Architecture

```text
CFB27 Dynasty Save
        |
        v
parser/index.js
        |
        v
clean Field Index data
        |
        v
database/import_save.js
        |
        v
PostgreSQL
```

Each imported save is a historical snapshot. Re-importing the exact same file
for the same dynasty season refreshes that import rather than duplicating it. A
later save from the same season becomes a new snapshot so weekly changes can be
analyzed.

## Why two season references exist on an import

CFB27 offseason saves can still report the completed season year while the roster
has already rolled forward. Field Index therefore stores:

- `season_id`: the save's current/official season.
- `roster_season_id`: the season that the roster/team snapshot belongs to.

The supplied lifecycle saves verified this distinction at National Signing Day.

## Migrations

Committed migrations are immutable. Once a migration is committed/applied, do
not edit it. Create the next numbered migration instead.

Current migrations:

- `001_initial_schema.sql` - dynasties, seasons, teams, save imports.
- `002_core_football_schema.sql` - dynasty import identity, conferences,
  dynasty-scoped teams, team seasons, import metadata, team snapshots.
- `003_people_storage.sql` - persistent players/coaches, season relationships,
  player/coach import snapshots.
- `004_analytics_friendly_snapshots.sql` - normalized player attributes/abilities,
  team grades, coach stats, and an ordinal grade lookup for SQL/Power BI.
- `005_game_storage.sql` - logical games, import snapshots, authoritative line
  scores, team box scores, player game stat lines/facts, and scoring events.
- `006_analytics_layer.sql` - curated analytics views, lifecycle-safe canonical
  import selection, career/history/transfer analysis, team/conference rankings,
  and Power BI-ready dimensions/facts.

Run migrations from the project root:

```powershell
node database/migrate.js
```

For the learning database that already had the manually created 001 tables,
`migrate.js` safely records 001 as an existing baseline and applies later
migrations. It refuses to baseline a partial/incorrect 001 schema.

## Local PostgreSQL configuration

Copy:

```text
database/.env.example
```

to:

```text
database/.env
```

Then set your PostgreSQL password. `database/.env` is ignored by Git.

```text
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_local_password
PGDATABASE=field_index
```

Field Index uses the PostgreSQL `psql` command-line tool that ships with the
Windows PostgreSQL installer.

## Import a dynasty save

From the project root:

```powershell
node database/import_save.js "C:\path\to\DYNASTY-SAVE" --dynasty-key gators-dynasty --dynasty-name "Gators Dynasty"
```

`--dynasty-key` is a stable Field Index identifier chosen once for a dynasty.
Use the same key every time that dynasty is imported. The visible dynasty name
can change without changing its identity.

Useful options:

```text
--dry-run             Parse/validate/build SQL without changing PostgreSQL.
--sql-out <path>      Save generated SQL for inspection.
--skip-migrations     Skip the automatic migration step.
```

The game/stat import can require more than Node's default heap on a full CFB27
save. The CLI automatically relaunches itself with a 4 GB Node heap when needed;
you do not need to add a special command-line flag.

A normal import automatically:

1. Validates CFB27 + schema 486.1.
2. Hashes the save with SHA-256.
3. Resolves the dynasty and save/roster seasons.
4. Upserts all 138 FBS team references and conferences.
5. Stores the team snapshot for that import.
6. Resolves persistent player identities and season membership.
7. Stores player ratings/abilities/appearance snapshots.
8. Resolves persistent coach identities and season/team roles.
9. Stores coach progression/contracts/stats/appearance snapshots.
10. Expands ratings, abilities, grades, and coach stats into long-form analytics facts.
11. Stores all schedule slots and one game snapshot per save import.
12. Stores authoritative quarter/OT line scores for completed games.
13. Stores home/away team box-score statistics.
14. Stores clean player game-stat category lines and expands them into long-form facts.
15. Stores scoring-summary events when CFB27 still exposes them at that lifecycle stage.
16. Commits the complete import as one PostgreSQL transaction.

If any part fails, the transaction rolls back rather than leaving a half-imported
snapshot.

## Game storage design

### Logical game vs. game snapshot

`games` identifies a schedule slot by dynasty season + week type + week + game
number. Participants are **not** permanently stored on the logical row because
an unplayed CFP/bowl slot can change participants between imports.

`game_import_snapshots` stores the matchup, status, score, date, broadcast,
stadium reference, bowl metadata, and player-stat availability for one save
import.

### FCS context

FCS opponents remain valid game context even though individual FCS player stats
are intentionally excluded. An FCS side can therefore have `team_id = NULL`
while its original `team_index` and display name are preserved.

### Scores and overtime

`SeasonGame` home/away scores and quarter/OT fields are authoritative.
`ScoringSummary` is stored only as event-list data and is never used to rebuild
the final score. CFB27 exposes the line-score OT value as an aggregate overtime
score, so Field Index stores it that way.

### Player game stats

`player_game_stat_lines` stores one clean JSONB category per player/game (passing,
rushing, receiving, defense, O-line, kicking, punting, returns, or fumbles).
`player_game_stats` expands each numeric metric into long-form facts for SQL and
Power BI, for example:

```text
player | game | passing | passingYards | 314
```

FCS individual player stats remain excluded by design.

## Lifecycle/history note

Later offseason stages can clear or roll player/stat data. Importing at useful
checkpoints preserves earlier snapshots rather than overwriting them. The
**Players Leaving** stage remains especially valuable for archiving complete
final-season player/game information before later offseason rollover.

## Identity rules

### Players

`PresentationId` is the preferred stable player identity. On the current live
save it is populated and unique for every FBS player. If it is unavailable or
ambiguous, Field Index uses a conservative bio fingerprint instead of
`playerRow`.

`playerRow` is never used as a persistent database identity.

### Coaches

Coach `PresentationId` is not universally populated/unique. Field Index uses it
when unique in the save. Otherwise it uses the raw Coach row, which was verified
stable across the supplied lifecycle saves. A bio fingerprint is the last
fallback.

## Analytics layer

Migration 006 creates two view schemas:

```text
analytics  curated football analysis
bi         flat Power BI-ready dimensions and facts
```

The analytics layer intentionally separates the newest schedule/roster snapshot
from the richest retained game-stat checkpoint. Later offseason saves can clear
some player/stat caches, so season player/team/scoring analytics select the
import with the greatest retained coverage instead of blindly using the last
file imported.

Main views include player games/seasons/careers, team offense/defense/rankings,
conference seasons, coach seasons/careers, transfer history, scoring events, and
import-by-import progression. See `../docs/analytics_layer.md` for the full map.

Example SQL is available in:

```text
database/queries/analytics_examples.sql
```

## Verify PostgreSQL

After migrations/imports:

```powershell
node database/verify.js
```

Verification covers schema/migration tracking, dynasty relationships, snapshot
counts, game/team/player relationships, stale-score protection, authoritative
line-score totals, FBS participant resolution, all analytics/BI views, canonical
row counts, history coverage, uniqueness, transfers, and BI fact parity.
