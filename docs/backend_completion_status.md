# Backend Completion Status — v0.7.0

Field Index v0.7.0 is the current backend checkpoint. CFP atomic first-round editing and Stadium Atmosphere grade authority are now productionized and game-verified. The redshirt consistency warning is also implemented as a non-blocking advisory for `Ineligible` with <=4 current-season games. The remaining backend work before calling the release fully polished is:

1. final cleanup/performance/release verification,
2. confirm mapping/catalog startup paths never rebuild unnecessarily,
3. eventually package a self-contained Windows runtime after UI integration.

Coach archetype/tree display context is now explicit: the raw `Coach.DominantArchetype` resolves through a separate `archetypeContext`, while every talent tree keeps its own stable internal/display identity. This prevents the base `Motivator` tree from being mislabeled as the distinct advanced `Master Motivator` tree.

Other My School/program grade categories remain explicit/raw unless individually game-verified; Field Index does not silently assume that every ProgramPoints field controls its visible grade.

Final desktop UI and actual Power BI dashboards remain intentionally deferred until those backend items are closed.

The UI should consume `backend/` services and should not need to understand CFB27 table IDs, references, CharacterVisuals, compression, SQL import internals, or asset-index construction.

## Completed backend domains

| Area | Status | Backend result |
|---|---|---|
| CFB27 parser | Complete | One canonical `C27_486_1.gz` schema; Coach compatibility is in-memory only |
| Safe save writer | Complete | EA-compatible compression-profile gate, fixed FBCHUNKS slot/tail preservation, parser reopen check, short names, backups |
| Player service/editor | Complete | names, jersey, position, ratings, height, weight, class/redshirt, non-blocking redshirt consistency warnings, development, XP/skill points, physical/mental abilities, batch staging/undo |
| Head ID | Complete | catalog API, unique/generic IDs, collision/unknown/missing-portrait safety, gear-preserving CharacterVisuals mutation |
| Depth chart | Complete | read, reorder, move, validation, staged write |
| Coach service/editor | Complete | coach fields, appearance scalars, points, XP, all 13 trees, tree states, 33 node statuses/tree, live named ability metadata, costs/branches/prerequisites, and separate dominant-archetype vs tree display context |
| Team service/editor | Stadium Atmosphere productionized; broader grade authority still incremental | team metadata, conference/assets, schedule, recruiting and KPIs are complete; game verification proved `MySchoolTrackingTable.StadiumAtmosphereGrade` is the visible Stadium Atmosphere authority, while raw ProgramPoints fields remain exposed separately |
| Recruiting | Complete | prospects, boards, commitments, signing classes, transfer portal, class rankings, class summaries, persistent history and roster matching |
| Transfers/careers | Complete | player movement, cross-season observations, transfers, player/coach careers, team/coach/player history |
| Games/box scores | Complete | schedules, game detail, line scores, team/player stats, scoring events, historical storage |
| Rankings | Complete | media/coaches/CFP current data, editing, persistent history |
| Postseason | Complete and game-verified | CFP read/history complete; first-round editing is an atomic existing-team seed-slot permutation with seed/rank + SeasonGame synchronization; arbitrary injection and completed-game mutation are blocked |
| Awards | Complete | current data, persistent player/coach award history |
| Assets/mappings | Complete backend | asset manifest service, team/coach/award/bowl/playoff helpers, local portrait indexer, local head-catalog builder |
| Multi-dynasty | Complete | dynasty keys scope teams/people/seasons/history |
| Multi-season | Complete | separate save/roster seasons, repeated imports, historical snapshots, season rollover architecture |
| Duplicate imports | Complete | SHA-256 duplicate detection with explicit force-reimport option |
| PostgreSQL | Complete | migrations 001-009; imports automatically migrate and verify by default |
| Analytics/BI backend | Complete | analytics + `bi` views, including recruiting rankings and coach talent history; no `.pbix` is built |
| Service integration | Complete | UI-facing `FieldIndexBackendSession`, `EditSession`, backend contract/release gate |
| Automated validation | Complete | source checks, unit/regression tests, completion audit, release gate, comprehensive in-game save generator |
| Documentation | Complete | architecture, API, ERD, Head ID, analytics, regression and release-readiness docs |

## Runtime-generated local data

These are **not unfinished backend coding tasks**. Field Index creates/updates them from the user's local data when needed:

- `assets/mappings/head_catalog.json` from the loaded real save and optional Frosty recipe sources,
- `assets/mappings/player_portrait_index.json` from `assets/player_portraits/` when that local raw folder exists,
- database migrations 007-009 and verification during `importDynasty()`.

Raw multi-GB game assets and dynasty saves stay local and are not committed/distributed.

## Product exclusions, not incomplete work

- No equipment editor. CFB27 already edits equipment and Field Index intentionally preserves it.
- Completed CFP game participant mutation is blocked to avoid unsafe historical edits.
- Arbitrary CFP team injection/removal is blocked because it has not been game-verified; production editing only permutes the existing first-round field.

## Automated checkpoint

The user's merged CFP + Stadium Atmosphere tree passed **79/79** automated tests (58 backend/root + 21 parser) with zero failures. This redshirt patch adds five backend/root tests covering the <=4-game warning boundary, non-blocking behavior, duplicated season-stat handling, and PlayerService exposure/filtering. The reconstructed development tree passes source checks and all local tests; on the user's current 21-parser-test tree the expected total after this patch is **84/84**. Live-save verification against `DYNASTY-GATORSDYNASTYREAL` also confirms David Johnson is `Eligible` with 2 games played and that previewing/staging `Ineligible` produces the structured warning without blocking the edit.

## Remaining work

The known CFP, Stadium Atmosphere authority, redshirt-consistency, and coach archetype/tree display-context items are closed. Remaining backend work is cleanup/performance/startup behavior and final release verification. Final UI, Power BI report construction, and Windows runtime packaging remain intentionally deferred.
