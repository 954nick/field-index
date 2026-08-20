# Field Index PostgreSQL ERD — Pre-Game Storage

This ERD documents the database through the point immediately before game
storage is introduced.

```mermaid
erDiagram
    DYNASTIES ||--o{ SEASONS : contains
    DYNASTIES ||--o{ TEAMS : owns
    DYNASTIES ||--o{ PLAYERS : owns
    DYNASTIES ||--o{ COACHES : owns

    SEASONS ||--o{ SAVE_IMPORTS : official_season
    SEASONS ||--o{ SAVE_IMPORTS : roster_season

    SEASONS ||--o{ TEAM_SEASONS : contains
    TEAMS ||--o{ TEAM_SEASONS : appears_in
    CONFERENCES ||--o{ TEAM_SEASONS : membership

    SAVE_IMPORTS ||--o{ TEAM_IMPORT_SNAPSHOTS : captures
    TEAM_SEASONS ||--o{ TEAM_IMPORT_SNAPSHOTS : snapshot_of
    TEAM_IMPORT_SNAPSHOTS ||--o{ TEAM_GRADE_SNAPSHOTS : expands_to

    SEASONS ||--o{ PLAYER_SEASONS : contains
    PLAYERS ||--o{ PLAYER_SEASONS : appears_in
    TEAM_SEASONS ||--o{ PLAYER_SEASONS : rostered_on
    SAVE_IMPORTS ||--o{ PLAYER_IMPORT_SNAPSHOTS : captures
    PLAYER_SEASONS ||--o{ PLAYER_IMPORT_SNAPSHOTS : snapshot_of
    PLAYER_IMPORT_SNAPSHOTS ||--o{ PLAYER_ATTRIBUTE_SNAPSHOTS : expands_to
    PLAYER_IMPORT_SNAPSHOTS ||--o{ PLAYER_ABILITY_SNAPSHOTS : expands_to

    SEASONS ||--o{ COACH_SEASONS : contains
    COACHES ||--o{ COACH_SEASONS : appears_in
    TEAM_SEASONS ||--o{ COACH_SEASONS : employed_by
    SAVE_IMPORTS ||--o{ COACH_IMPORT_SNAPSHOTS : captures
    COACH_SEASONS ||--o{ COACH_IMPORT_SNAPSHOTS : snapshot_of
    COACH_IMPORT_SNAPSHOTS ||--o{ COACH_STAT_SNAPSHOTS : expands_to
```

## Entity vs. snapshot

Field Index separates relatively stable identity from values that can change
week to week.

Example:

```text
players
  Nicholas Example (persistent identity)
       |
       +-- player_seasons (2028 roster relationship)
                 |
                 +-- Week 1 import snapshot
                 +-- Week 8 import snapshot
                 +-- postseason import snapshot
```

This prevents an import in Week 10 from erasing what the player's overall,
team, abilities, or appearance looked like in Week 1.

## Multi-dynasty isolation

`teams`, `players`, and `coaches` are scoped to `dynasty_id`. This is deliberate:
custom/Team Builder data can make a raw game index mean different things in two
different dynasties. Field Index does not assume every dynasty shares identical
program/entity state.

## Next ERD expansion

The next migration begins game storage and will connect games to dynasty seasons,
teams, and later player/team game-stat facts. It is intentionally not included
in this pre-game schema.
