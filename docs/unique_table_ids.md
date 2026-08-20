# Field Index — Unique Table IDs

Runtime source of truth: `parser/table_ids.js`.

This document is a human-readable reference for the current Field Index v0.3.3 table mapping. If this file and `parser/table_ids.js` ever disagree, update this document to match the runtime mapping rather than changing IDs by guesswork.

## Core tables

- Player: `1612938518`
- Team: `3359508968`
- SeasonInfo: `3123991521`

## Season statistics

- SeasonStats: `143029489`
- SeasonOffensiveStats: `3519623764`
- SeasonDefensiveStats: `314624969`
- SeasonOLineStats: `1611777990`
- SeasonKickingStats: `2742414559`
- SeasonOffensiveKPReturnStats: `4010933771`
- SeasonDefensiveKPReturnStats: `923704924`
- TeamStats: `1731088851`
- TeamStatsArray: `3913185413`

## Game-by-game statistics

- GameStats: `17059743`
- GameOffensiveStats: `3937354187`
- GameDefensiveStats: `698792022`
- GameOLineStats: `2067273102`
- GameKickingStats: `589639074`
- GameOffensiveKPReturnStats: `3388716768`
- GameDefensiveKPReturnStats: `300209847`
- SeasonGame: `4049338978`
- BowlGame: `902037496`

## Scoring summary

- ScoringSummaryArray: `2163562825`
- ScoringSummary: `3993278100`

## Career statistics

- CareerOffensiveStats: `1181574195`
- CareerDefensiveStats: `2237963694`
- CareerOLineStats: `694886857`
- CareerKickingStats: `2471741740`
- CareerOffensiveKPReturnStats: `2742909435`
- CareerDefensiveKPReturnStats: `2070026668`

## Coaching

- Coach: `1860529246`
- SeasonCoachStats: `564984853`
- CareerCoachStats: `1758861850`
- ActiveTalentTree: `1386036480`
- TalentSubTreeStatusArray: `1474184911`
- TalentSubTreeStatus: `1725084110`

> Coach note: Field Index still uses the supplied `C27_486_1.gz` schema only. The live-save 137/138-member Coach compatibility case is handled by `parser/coach_schema_compat.js`; do not replace the schema or invent alternate mappings.

## Recruiting

- Recruit: `1873209313`
- RecruitingBoard: `220276943`
- RecruitTarget: `59043175`
- UserRecruitTarget: `3987156317`
- RecruitTargetArray: `2412159097`
- ProspectTargetSchool: `3789266353`
- ProspectTargetSchoolArray: `2332540366`
- SchoolOffer: `3367540198`

## Depth chart

- DepthChart: `302004547`

## Player movement / end of season

- LeavingPlayer: `1418279587`
- PlayersLeavingEndOfSeason: `143524766`
- TransferCandidatesArray: `3884115435`
- EarlyDraftArray: `2506734136`

## Awards

- PlayerAward: `657983086`
- CoachAward: `3027881868`
- HeismanAwardRankings: `3024007701`
- HeismanAwardRankingArray: `973981510`
- Awards: `2840269106`

## Program / historical team data

- Conference: `3820706130`
- TeamHistoricalSeriesYear: `2273478024`
- TeamHistoricalSeriesYearArray: `360793959`
- MySchoolTrackingTable: `349376083`

## CFP / bowl data

- PlayoffBowlsInfo: `1087131465`
- PlayoffBowlsInfoArray: `1265438808`
