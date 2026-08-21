# Field Index Analytics Layer

Migrations `006_analytics_layer.sql` and `007_extended_dynasty_history.sql` turn
the normalized PostgreSQL store into the reporting backend for Field Index and
future Power BI dashboards.

## Separation of Responsibilities

Field Index has three database layers:

```text
public     persistent normalized imports/snapshots
analytics  curated canonical football/history views
bi         flat dimensions/facts intended for BI consumers
```

These are read-only analytical layers. They do not write to a dynasty save or
mutate imported history.

## Lifecycle-Safe Import Selection

CFB27 can clear historical stat caches during later offseason stages, so the
newest imported file is not always the richest source for every analysis.
Migration 006 deliberately separates selectors:

- `analytics.latest_game_imports` — newest schedule/result context per season
- `analytics.latest_roster_imports` — newest roster context per roster season
- `analytics.best_team_game_imports` — checkpoint with greatest team box-score coverage
- `analytics.best_player_game_imports` — checkpoint with greatest player stat-line coverage
- `analytics.best_scoring_imports` — checkpoint with greatest scoring-event coverage

A National Signing Day save can therefore supply the newest roster without
silently replacing a richer completed-season game-stat checkpoint.

## Core Game Views

- `analytics.games` — one canonical row per logical schedule slot
- `analytics.team_games` — one completed-game side per team with opponent,
  result, scoring, offense, defense-allowed context, turnovers, red zone, downs,
  possession, and line score
- `analytics.player_games` — one player/game row with passing, rushing,
  receiving, defense, O-line, kicking, punting, return, and fumble metrics
- `analytics.scoring_events` — scoring-summary history from the richest retained
  season checkpoint

## Season Analytics

- `analytics.player_seasons` — roster identity plus aggregated production,
  including tracked players with zero box-score production
- `analytics.team_offense_seasons` — scoring, yardage, efficiency, turnovers,
  conversions, red-zone, sacks allowed, possession
- `analytics.team_defense_seasons` — scoring/yards allowed, opponent efficiency,
  takeaways, sacks, conversions, red-zone defense
- `analytics.team_rankings` — in-game poll rank plus calculated national rankings
  for ratings, offense/defense, and turnover margin
- `analytics.conference_seasons` — conference records, ratings, offense, defense,
  ranked-team counts, and comparative ranks
- `analytics.coach_seasons` — progression/contract context plus normalized season
  and career accomplishments

## Careers, Transfers, and Progression

- `analytics.player_careers`
- `analytics.coach_careers`
- `analytics.team_history`
- `analytics.player_history`
- `analytics.coach_history`
- `analytics.player_transfers`

Import-by-import progression remains queryable through:

- `analytics.team_snapshot_history`
- `analytics.player_snapshot_history`
- `analytics.coach_snapshot_history`

These support weekly ratings changes, player development, position/team changes,
coach job changes, and other checkpoint-to-checkpoint movement.

## Ranking History — Migration 007

`analytics.ranking_history` stores each imported Media, Coaches, and CFP poll
observation with rank, prior rank, points, first-place votes, team identity, and
import timing. It can answer both current-rank and movement-over-time questions.

## Recruiting Analytics — Migration 007

- `analytics.recruiting_history` — import-by-import prospect status, rankings,
  offers, destination state, class context, and roster-match evidence
- `analytics.recruiting_roster_matches` — recruit-to-persistent-player links with
  explicit match strategy
- `analytics.recruiting_classes` — team/class rollups suitable for recruiting
  class comparisons

Roster matching is intentionally conservative: direct evidence wins; otherwise
a fingerprint must resolve uniquely. Ambiguous candidates stay unresolved.

## Depth-Chart History — Migration 007

`analytics.depth_chart_history` exposes each imported depth slot with team,
position key, depth, roster season, player identity when resolved, jersey,
position, and overall. This allows depth-chart movement and starter history to
be analyzed across checkpoints.

## Postseason and Championship History — Migration 007

- `analytics.postseason_history` — per-import CFP completion, champion,
  runner-up, Heisman, and stored CFP-round state
- `analytics.postseason_games` — canonical postseason/playoff/bowl games
- `analytics.championship_history` — season-level championship summary

Postseason game classification uses stored CFB27 week/bowl metadata rather than
assuming one hard-coded week number.

## Award History — Migration 007

`analytics.award_history` stores available player and coach award observations by
season/import, with persistent entity/team links when resolvable.

## Long-Form Latest-Roster Views

Normalized fact tables remain available through curated views:

- `analytics.player_attributes`
- `analytics.player_abilities`
- `analytics.team_grades`
- `analytics.coach_stats`

They keep filterable metrics in long form instead of forcing a consumer to parse
JSON.

## BI Schema

The existing dimension layer includes:

- `bi.dim_dynasty`
- `bi.dim_season`
- `bi.dim_team`
- `bi.dim_conference`
- `bi.dim_player`
- `bi.dim_coach`

Core facts from migration 006 cover games, team/player/coach seasons, player game
stats, attributes, abilities, grades, coach stats, scoring events, transfers,
careers, conferences, and progression.

Migration 007 adds BI-ready facts for:

- `bi.fact_ranking_snapshot`
- `bi.fact_recruiting_prospect`
- `bi.fact_recruiting_class`
- `bi.fact_recruiting_roster_match`
- `bi.fact_depth_chart`
- `bi.fact_postseason`
- `bi.fact_postseason_game`
- `bi.fact_championship`
- `bi.fact_award`

The database is therefore prepared for eventual dashboard work without requiring
the Power BI model to parse JSON, rediscover entity identity, or decide which
lifecycle checkpoint is canonical. **Actual Power BI dashboards are still
intentionally deferred.**

## Example Queries

See:

```text
database/queries/analytics_examples.sql
```

Examples cover team/player/coach performance, transfer/development history,
ranking movement, recruiting classes and roster matches, depth charts,
postseason/championships, and awards.

## Verification

After migration 007 and at least one real save import:

```powershell
npm run db:verify
```

The verifier checks raw relationships plus analytics/BI schemas, canonical row
counts, history coverage, uniqueness, transfer consistency, identity evidence,
ranking validity, recruiting links, depth-chart resolution, postseason coverage,
award links, and BI fact parity.
