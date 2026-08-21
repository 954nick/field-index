# Field Index Backend API — v0.7.0

## Public entry point

```js
import { loadDynasty, importDynasty, editDynasty } from "./backend/index.js";
```

## Load a dynasty

```js
const dynasty = await loadDynasty(savePath);
```

### Player API

```js
dynasty.getPlayers({ teamIndex });
dynasty.getPlayer(playerRow);
dynasty.getPlayerSeasonStats(playerRow);
dynasty.getPlayerCareerStats(playerRow);
dynasty.getPlayerLeaders();
dynasty.getPlayerMovement();

dynasty.getPlayerHeadId(playerRow);
dynasty.getPlayerHeadProfile(playerRow);
dynasty.listHeadIds({ usableOnly: true });
dynasty.getHeadById(201504);
```

### Coach API

```js
dynasty.getCoaches({ teamIndex, role: "head", archetype: "recruit" });
dynasty.getCoach(coachRow);
dynasty.getCoachSummary(coachRow);
dynasty.getCoachStaff(teamIndex);
dynasty.getCoachTalentCatalog();          // live named CFB27 definitions
dynasty.getCoachTalentTree(coachRow);
dynasty.getCoachArchetypeContext(coachRow); // separate Coach.DominantArchetype context from individual tree identity
dynasty.getCoachAbilities(coachRow);
dynasty.getCoachOwnedAbilities(coachRow);
dynasty.getCoachPurchasableAbilities(coachRow);
dynasty.getCoachUnlockedTrees(coachRow);
```

Coach archetype context is intentionally separate from talent-tree identity. For example, the base tree remains `Motivator` even when the coach/screen context is `Master Motivator`; the advanced `MasterMotivator` tree is a distinct tree identity. `getCoachArchetypeContext()` resolves the raw `Coach.DominantArchetype` to its own tree index/display label without renaming neighboring/base trees. Unknown future archetypes are preserved raw rather than guessed.

The live talent catalog resolves game-facing names/descriptions, staff-point costs, branch labels and prerequisites to the authoritative `TalentStatus0..32` save fields. `Tactician` maps to the internal `Schemer` tree without exposing that implementation detail to the UI.

### Team, schedule and game API

```js
dynasty.getTeams();
dynasty.getTeam(teamIndex);
dynasty.getTeamSchedule(teamIndex);
dynasty.getTeamRecruiting(teamIndex);
dynasty.getTeamKpis(teamIndex);

dynasty.getSchedule();
dynasty.getGame(gameIdentifier);
dynasty.getBoxScore(gameIdentifier);
dynasty.getDepthChart(teamIndex);
dynasty.getDepthChartPosition(teamIndex, "QB");
```

### Recruiting / rankings / postseason

```js
dynasty.getRecruiting();
dynasty.getRecruitingBoard(teamIndex);
dynasty.getSigningClass(teamIndex);
dynasty.getRecruitingClassRankings();
dynasty.getRecruitingClassSummary(teamIndex);
dynasty.getTransferPortal();

dynasty.getRankings("cfp");
dynasty.getCfp();
dynasty.getPostseason();
dynasty.getAwards();
```

### Assets and mappings

```js
dynasty.getAssetSummary();
dynasty.getTeamAssets(teamIndex);
dynasty.getCoachAssets(coachRow);
dynasty.getAwardAssets(award);
dynasty.getBowlAssets(bowl);
dynasty.getConferenceChampionshipAssets(conference);
dynasty.getPlayoffAsset(stage);

await dynasty.prepareMappings();
dynasty.getHeadCatalogSummary();
dynasty.getPortraitIndexSummary();
```

`prepareMappings()` automatically merges head profiles from the current save. If no portrait index exists and local `assets/player_portraits/` is present, it auto-discovers that folder and builds the lightweight portrait index.

## Production edit session

```js
const edit = await dynasty.createEditSession();
```

### Redshirt consistency warnings

CFB27 allows the raw `RedshirtStatus` enum to be forced even when the normal game logic would not produce that state. Field Index therefore treats the known `Ineligible` + four-or-fewer-games case as a **warning, not a blocked edit**.

Read/session API:

```js
const consistency = session.getPlayerRedshirtConsistency(playerRow);
```

Editor/staged API can preview a proposed status before saving:

```js
const consistency = await edit.getPlayerRedshirtConsistency(playerRow, "Ineligible");
```

The result includes `gamesPlayed`, `gameLimit` (4), `isConsistent`, and a structured `warning` when applicable. When a staged player edit sets `redshirtStatus: "Ineligible"` with <=4 current-season games, the edit is still allowed but the warning is attached to the pending operation and exposed through `getPendingWarnings()`. Current-season games played is taken from the maximum duplicated `GAMESPLAYED` value across the player's current-season stat categories rather than summing duplicate category rows.

### Player editing

```js
await edit.editPlayer(playerRow, {
  firstName: "Example",
  jerseyNumber: 2,
  position: "QB",
  overallRating: 91,
  heightInches: 74,
  weight: 225,
  classYear: "Junior",
  redshirtStatus: "Redshirt",
  ratings: { SpeedRating: 94 }
});

await edit.editPlayerAbilities(playerRow, {
  skillPoints: 10,
  experiencePoints: 1250,
  physical: { 1: "Gold" },
  mental: { 1: { ability: "ExampleAbility", rank: "Silver" } }
});

await edit.setPlayerHeadId(playerRow, 201504);
await edit.editPlayers([{ playerRow, changes: { jerseyNumber: 1 } }]);
```

All values are validated against the live schema plus Field Index business rules. Arbitrary raw fields are disabled in production.

### Coach editing

```js
await edit.setCoachPoints(coachRow, 50);
await edit.setCoachExperiencePoints(coachRow, 12000);
await edit.editCoach(coachRow, { firstName: "Nick", level: 30 });

await edit.unlockCoachTalentTree(coachRow, "Recruiter");
await edit.makeCoachTalentTreePurchasable(coachRow, "Program Builder");
await edit.setCoachTalentTreePointsSpent(coachRow, "Recruiter", 20);

// Named game-facing ability when the live catalog supplies it:
await edit.unlockCoachTalent(coachRow, "Recruiter", "Strong Start");

// Numeric node remains supported as the authoritative fallback:
await edit.setCoachTalentNodeStatus(coachRow, "Recruiter", 7, "Owned");
```

### Depth chart/team/ranking/postseason editing

```js
await edit.updateDepthChart(teamIndex, "QB", orderedPlayerRows);
await edit.moveDepthChartPlayer(teamIndex, "WR", playerRow, 2);
// Flat Stadium Atmosphere editing targets the game-verified My School authority:
await edit.editTeamGrades(teamIndex, { stadiumAtmosphere: "Aplus" });

// Explicit raw groups remain available when Field Index needs the underlying values:
await edit.editTeamGrades(teamIndex, {
  programPoints: { budget: "A" },
  mySchool: { AcademicPrestigeGrade: "Aplus" }
});
await edit.editPollTop25("cfp", orderedTeamIndexes);

// Game-verified production CFP primitive: permute the eight teams already
// occupying first-round seeds 5-12. TeamRank is the playoff seed. CFP poll
// rank is separate data and is permuted consistently with the moved teams.
// Linked SeasonGame participant references move atomically with the seed slots.
edit.getCfpFirstRoundSeedAssignments();
await edit.swapCfpFirstRoundTeams(teamIndexA, teamIndexB);
await edit.editCfpFirstRoundSeedAssignments({
  5: teamAt5, 6: teamAt6, 7: teamAt7, 8: teamAt8,
  9: teamAt9, 10: teamAt10, 11: teamAt11, 12: teamAt12
});

// Backward-compatible matchup API. It now routes through the same atomic
// permutation model instead of injecting arbitrary teams.
await edit.editCfpGameParticipants(seasonGameRow, { homeTeamIndex, awayTeamIndex });
```

Stadium Atmosphere authority is game-verified in CFB27: the visible Recruiting > My School grade is controlled by `MySchoolTrackingTable.StadiumAtmosphereGrade`. `Team.ProgramPointsStadiumAtmosphereGrade` is retained as raw program-point data but is not treated as the visible grade authority. The flat `{ stadiumAtmosphere: ... }` edit alias therefore writes the My School field.

CFP editing is intentionally constrained to the mechanic proven in CFB27: an unplayed, complete first round whose existing eight participants are rearranged among fixed seed slots 5-12. `TeamRank` is the playoff seed authority; `CFPPoll_CurrentRank` is separate ranking data and may differ from the playoff seed for automatic qualifiers (the real verified save has Boise State at playoff seed 12 while ranked 16th in the CFP poll). When teams are permuted, Field Index moves the destination slot's CFP-rank state consistently with the team movement, synchronizes `SeasonGame` participants, and validates/preserves the first-round `BowlGame` zero-based slot markers (`Conference1Rank` / `Conference2Rank`, where seeds 5-12 are stored as 4-11). Arbitrary team injection/removal and completed-game participant mutation are blocked.

### Staging, undo, save safety

```js
edit.getPendingChanges();
await edit.undoLast();
await edit.reset();
const result = await edit.saveDynasty();
```

The writer generates a short safe `DYNASTY-FI-*` output by default. Source overwrite requires backup behavior; the safe writer refuses to write if the compression profile does not reproduce the untouched EA stream or if the rebuilt database exceeds the original slot.

## Persistent import

```js
await importDynasty(savePath, {
  dynastyName: "Gators Dynasty",
  dynastyKey: "gators-dynasty"
});
```

By default `importDynasty()`:

1. applies any unapplied committed migrations (001-009),
2. detects completed duplicate SHA-256 imports,
3. imports the current/history facts,
4. runs full database verification,
5. fails the operation if verification fails.

Use the same `dynastyKey` for all seasons/saves belonging to one dynasty.

## Persistent history

```js
dynasty.getDynastyHistory(key);
dynasty.getPlayerCareer(playerId);
dynasty.getCoachHistory(coachId);
dynasty.getCoachCareer(coachId);
dynasty.getCoachTalentHistory(key, { coachId });
dynasty.getCoachTalentNodeHistory(key, { coachId, tree: "Recruiter", latestOnly: true });
dynasty.getTeamHistory(key, teamIndex);
dynasty.getTransferHistory(key);
dynasty.getRankingHistory(key);
dynasty.getRecruitingHistory(key);
dynasty.getRecruitingClasses(key);
dynasty.getRecruitingClassRankingHistory(key, { latestOnly: true });
dynasty.getDepthChartHistory(key);
dynasty.getPostseasonHistory(key);
dynasty.getPostseasonGames(key);
dynasty.getChampionshipHistory(key);
dynasty.getAwardHistory(key);
dynasty.getStoredGames(key);
```
