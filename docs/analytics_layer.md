# Field Index Analytics Layer

Migration `006_analytics_layer.sql` turns the normalized PostgreSQL storage
layer into a reporting layer for Field Index and future Power BI work.

## Separation of responsibilities

Field Index now has three database layers:

```text
public     raw/persistent imported data
analytics  curated canonical views and calculated football metrics
bi         flat dimensions/facts intended for BI tools
```

No analytics view writes to the dynasty save or mutates imported history.

## Lifecycle-safe import selection

CFB27 can clear some historical stat caches during later offseason stages, so
"latest import" is not always the best source for every type of analysis.
Migration 006 handles that intentionally:

- `analytics.latest_game_imports` selects the latest schedule/result snapshot
  for each season.
- `analytics.latest_roster_imports` selects the latest import whose roster
  belongs to each season.
- `analytics.best_team_game_imports` selects the import with the most retained
  team box-score rows for each season.
- `analytics.best_player_game_imports` selects the import with the most retained
  player game-stat lines for each season.
- `analytics.best_scoring_imports` selects the import with the most retained
  scoring-summary events for each season.

This lets a National Signing Day save provide the newest roster context without
silently replacing a richer Players Leaving checkpoint for completed-season
player stats.

## Main analytics views

### Games

- `analytics.games` — one canonical schedule/result row per logical game.
- `analytics.team_games` — one team-side row per completed game with opponent,
  result, scoring, offense, defense-allowed context, turnovers, red zone,
  downs, possession, and line-score fields.
- `analytics.player_games` — one player/game row with wide passing, rushing,
  receiving, defense, O-line, kicking, punting, return, and fumble metrics.
- `analytics.scoring_events` — scoring-summary event history from the richest
  retained season import.

### Season analytics

- `analytics.player_seasons` — latest roster identity plus aggregated game
  production for every tracked player-season, including players with zero
  recorded box-score production.
- `analytics.team_offense_seasons` — scoring, yardage, efficiency, turnover,
  conversion, red-zone, sack-allowed, and possession metrics.
- `analytics.team_defense_seasons` — scoring/yards allowed, opponent efficiency,
  takeaways, sacks, conversions, and red-zone defense.
- `analytics.team_rankings` — game poll rank plus calculated national ranks for
  ratings, scoring offense/defense, total/rush/pass offense/defense, and
  turnover margin.
- `analytics.conference_seasons` — conference-level records, ratings, offense,
  defense, ranked-team counts, and comparative ranks.
- `analytics.coach_seasons` — coach progression/contract context plus normalized
  season and career accomplishments.

## Career and historical analysis

- `analytics.player_careers` aggregates tracked player production across seasons.
- `analytics.coach_careers` exposes the newest career snapshot per persistent coach.
- `analytics.team_history` adds year-over-year rating, wins, and conference changes.
- `analytics.player_history` adds year-over-year overall/team context.
- `analytics.coach_history` adds year-over-year team, level, and prestige changes.
- `analytics.player_transfers` identifies explicit transfers and team changes
  observed across tracked seasons.

Field Index also exposes every imported checkpoint rather than only one row per
season:

- `analytics.team_snapshot_history`
- `analytics.player_snapshot_history`
- `analytics.coach_snapshot_history`

These make weekly progression, ranking movement, development, position changes,
job changes, and other import-to-import trends queryable.

## Long-form latest-season views

The normalized fact tables remain available through curated latest-roster views:

- `analytics.player_attributes`
- `analytics.player_abilities`
- `analytics.team_grades`
- `analytics.coach_stats`

They preserve filterable long-form data instead of forcing reports to parse JSON.

## Power BI schema

The `bi` schema provides six dimensions:

- `bi.dim_dynasty`
- `bi.dim_season`
- `bi.dim_team`
- `bi.dim_conference`
- `bi.dim_player`
- `bi.dim_coach`

It also provides fact views for games, team/player/coach seasons, player game
stats, attributes, abilities, grades, coach stats, scoring events, transfers,
careers, conference seasons, and import-to-import progression.

These views already choose canonical imports and flatten calculations, so a BI
model does not need to parse JSON or decide which save checkpoint to use.

## Example queries

See:

```text
database/queries/analytics_examples.sql
```

It includes examples for team rankings, passing/rushing/receiving/defensive
leaders, team and player game logs, conferences, coaches, transfers, and
historical progression.

## Verification

After migration 006, run:

```powershell
node database/verify.js
```

The verifier checks raw database integrity plus analytics/BI schemas, all views,
canonical row counts, history coverage, key uniqueness, transfer consistency,
and BI fact parity.
