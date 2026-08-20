// Import Dependencies 
import Franchise from "madden-franchise";
import { fileURLToPath } from "node:url";
import { TABLE_IDS } from "./table_ids.js"
import { ensureCoachTableSchema } from "./coach_schema_compat.js";
import {
    PLAYER_APPEARANCE_FIELDS,
    COACH_APPEARANCE_FIELDS,
    PLAYER_PHYSICAL_ABILITY_RANK_FIELDS,
    PLAYER_MENTAL_ABILITY_FIELDS,
    PLAYER_MENTAL_ABILITY_RANK_FIELDS,
    COACH_TALENT_TREE_NAMES,
    TEAM_GRADE_FIELDS,
    MY_SCHOOL_GRADE_FIELDS
} from "./editor.js";

// CFB27 Dynasty Configuration
const dynastyStartYear = 2026;

// Locate Custom Schema Directory
const schemaDirectory = fileURLToPath(
    new URL("./schemas/", import.meta.url)
);

// Receive Save-File Path 
const savePath = process.argv[2];

// Validate Save-File Path
if(!savePath) {
    console.error("No save-file path provided");
    process.exit(1);
}

// Load Dynasty Save
const franchise = await Franchise.create(savePath, {
    schemaDirectory: schemaDirectory
});
// Display Loaded Schema Metadata
console.log(franchise.schema.meta);

// Display Save Metadata
console.log(franchise.gameType);
console.log(franchise.gameYear);

// Validate Save Metadata 

if (franchise.gameType !== "college" || franchise.gameYear !== 27) { 
    console.error("Field Index requires a valid CFB27 Dynasty save");
    process.exit(1);
}
console.log("Dynasty save loaded successfully");

// Read Table Helper 
async function readTable(tableID) {
    const table = franchise.getTableByUniqueId(tableID);
    await table.readRecords();
    return table;
}

// Season Stats Helper
function getPlayerSeasonStats(player) {
    const seasonStatsReference = player.getReferenceDataByKey("SeasonStats");
    if (seasonStatsReference.tableId === 0) return [];
    const playerSeasonStats = seasonStatsTable.records[seasonStatsReference.rowNumber];
    const seasonStats = [];
    for (let i = 0; i < playerSeasonStats.arraySize; i++) {
        const fieldName = `SeasonStats${i}`;
        const statReference = playerSeasonStats.getReferenceDataByKey(fieldName);
        if (!statReference || statReference.tableId === 0) continue;
        const statRecord = franchise.getReferencedRecord(playerSeasonStats[fieldName]);
        if (!statRecord) continue;
        seasonStats.push({
            seasonYear: statRecord.SEAS_YEAR,
            teamIndex: statRecord.YEARBYYEARTEAMINDEX,
            statType: statRecord._parent.name,
            stats: statRecord
        });
    }
    return seasonStats;
}


// -------------------- Player Season Statistics --------------------
function getSeasonStatMeta(seasonStat) {
    return {
        seasonYear: seasonStat.seasonYear,
        seasonYearDisplay: dynastyStartYear + seasonStat.seasonYear,
        teamIndex: seasonStat.teamIndex,
        teamName: teamIndexToDisplayName.get(seasonStat.teamIndex) ?? "Unassigned",
        gamesPlayed: seasonStat.stats.GAMESPLAYED ?? 0,
        gamesStarted: seasonStat.stats.GAMESSTARTED ?? 0,
        downsPlayed: seasonStat.stats.DOWNSPLAYED ?? 0,
        gameRating: seasonStat.stats.GAMERATING ?? 0
    };
}

function isValidSeasonStat(seasonStat, statTypes) {
    return (
        seasonStat &&
        seasonStat.teamIndex !== 255 &&
        statTypes.includes(seasonStat.statType)
    );
}

function getSeasonPassingStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, [
                "SeasonOffensiveStats",
                "SeasonOffensiveKPReturnStats"
            ]) && seasonStat.stats.PASSATTEMPTS > 0
        )
        .map(seasonStat => {
            const attempts = seasonStat.stats.PASSATTEMPTS ?? 0;
            const completions = seasonStat.stats.PASSCOMPLETED ?? 0;
            const passingYards = seasonStat.stats.PASSYARDS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                completions,
                attempts,
                completionPercentage: attempts > 0 ? (completions / attempts) * 100 : 0,
                passingYards,
                yardsPerAttempt: attempts > 0 ? passingYards / attempts : 0,
                passingTDs: seasonStat.stats.PASSTDS ?? 0,
                interceptions: seasonStat.stats.PASSINTS ?? 0,
                sacks: seasonStat.stats.PASSSACKED ?? 0,
                longestPass: seasonStat.stats.PASSLONGEST ?? 0,
                fourthQuarterComebacks: seasonStat.stats["4QCOMEBACKS"] ?? 0
            };
        });
}

function getSeasonRushingStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, [
                "SeasonOffensiveStats",
                "SeasonOffensiveKPReturnStats"
            ]) && seasonStat.stats.RUSHATTEMPTS > 0
        )
        .map(seasonStat => {
            const rushingAttempts = seasonStat.stats.RUSHATTEMPTS ?? 0;
            const rushingYards = seasonStat.stats.RUSHYARDS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                rushingAttempts,
                rushingYards,
                yardsPerCarry: rushingAttempts > 0 ? rushingYards / rushingAttempts : 0,
                rushingTDs: seasonStat.stats.RUSHTDS ?? 0,
                longestRush: seasonStat.stats.RUSHLONGEST ?? 0,
                fumbles: seasonStat.stats.RUSHFUMBLES ?? 0,
                brokenTackles: seasonStat.stats.RUSHBROKENTACKLES ?? 0,
                yardsAfterFirstHit: seasonStat.stats.RUSHYARDSAFTER1STHIT ?? 0,
                twentyPlusYardRuns: seasonStat.stats.RUSH20YARDRUNS ?? 0
            };
        });
}

function getSeasonReceivingStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, [
                "SeasonOffensiveStats",
                "SeasonOffensiveKPReturnStats"
            ]) && seasonStat.stats.RECEIVECATCHES > 0
        )
        .map(seasonStat => {
            const receptions = seasonStat.stats.RECEIVECATCHES ?? 0;
            const receivingYards = seasonStat.stats.RECEIVEYARDS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                receptions,
                receivingYards,
                yardsPerReception: receptions > 0 ? receivingYards / receptions : 0,
                receivingTDs: seasonStat.stats.RECEIVETDS ?? 0,
                longestReception: seasonStat.stats.RECEIVELONGEST ?? 0,
                yardsAfterCatch: seasonStat.stats.RECEIVEYARDSAFTER ?? 0,
                drops: seasonStat.stats.RECEIVEDROPS ?? 0
            };
        });
}

function getSeasonDefensiveStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, [
                "SeasonDefensiveStats",
                "SeasonDefensiveKPReturnStats"
            ]) && (seasonStat.stats.GAMESPLAYED > 0 || seasonStat.stats.DOWNSPLAYED > 0)
        )
        .map(seasonStat => {
            const soloTackles = seasonStat.stats.DEFTACKLES ?? 0;
            const assistedTackles = seasonStat.stats.ASSDEFTACKLES ?? 0;
            const interceptions = seasonStat.stats.DSECINTS ?? 0;
            const interceptionYards = seasonStat.stats.DSECINTRETURNYARDS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                soloTackles,
                assistedTackles,
                totalTackles: soloTackles + assistedTackles,
                tacklesForLoss: seasonStat.stats.DEFTACKLESFORLOSS ?? 0,
                sacks:
                    (seasonStat.stats.DLINESACKS ?? 0) +
                    ((seasonStat.stats.DLINEHALFSACK ?? 0) * 0.5),
                interceptions,
                interceptionYards,
                interceptionAverage:
                    interceptions > 0 ? interceptionYards / interceptions : 0,
                longestInterception: seasonStat.stats.DSECINTLONGESTRETURN ?? 0,
                passDeflections: seasonStat.stats.DEFPASSDEFLECTIONS ?? 0,
                forcedFumbles: seasonStat.stats.DLINEFORCEDFUMBLES ?? 0,
                fumbleRecoveries: seasonStat.stats.DLINEFUMBLERECOVERIES ?? 0,
                fumbleRecoveryYards: seasonStat.stats.DLINEFUMBLERECOVERYYARDS ?? 0,
                blockedKicks: seasonStat.stats.DLINEBLOCKS ?? 0,
                safeties: seasonStat.stats.DLINESAFETIES ?? 0,
                defensiveTDs:
                    (seasonStat.stats.DSECINTTDS ?? 0) +
                    (seasonStat.stats.DLINEFUMBLETDS ?? 0),
                bigHits: seasonStat.stats.BIGHITS ?? 0,
                catchesAllowed: seasonStat.stats.CTHALLOWED ?? 0
            };
        });
}

function getSeasonOLineStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, ["SeasonOLineStats"]) &&
            (seasonStat.stats.GAMESPLAYED > 0 || seasonStat.stats.DOWNSPLAYED > 0)
        )
        .map(seasonStat => ({
            ...getSeasonStatMeta(seasonStat),
            pancakes: seasonStat.stats.OLINEPANCAKES ?? 0,
            sacksAllowed: seasonStat.stats.OLINESACKSALLOWED ?? 0
        }));
}

function getSeasonKickingStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, ["SeasonKickingStats"]) &&
            (
                seasonStat.stats.KICKFGATTEMPTS > 0 ||
                seasonStat.stats.KICKEPATTEMPTS > 0
            )
        )
        .map(seasonStat => {
            const fieldGoalsMade = seasonStat.stats.KICKFGMADE ?? 0;
            const fieldGoalsAttempted = seasonStat.stats.KICKFGATTEMPTS ?? 0;
            const extraPointsMade = seasonStat.stats.KICKEPMADE ?? 0;
            const extraPointsAttempted = seasonStat.stats.KICKEPATTEMPTS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                fieldGoalsMade,
                fieldGoalsAttempted,
                fieldGoalPercentage:
                    fieldGoalsAttempted > 0
                        ? (fieldGoalsMade / fieldGoalsAttempted) * 100
                        : 0,
                longestFieldGoal: seasonStat.stats.KICKFGLONGEST ?? 0,
                extraPointsMade,
                extraPointsAttempted,
                extraPointPercentage:
                    extraPointsAttempted > 0
                        ? (extraPointsMade / extraPointsAttempted) * 100
                        : 0,
                fieldGoalsBlocked: seasonStat.stats.KICKFGBLOCKED ?? 0,
                extraPointsBlocked: seasonStat.stats.KICKEPBLOCKED ?? 0,
                fieldGoalsMade29OrLess: seasonStat.stats.KICKFGMADE29ORLESS ?? 0,
                fieldGoalsMade30To39: seasonStat.stats.KICKFGMADE30TO39 ?? 0,
                fieldGoalsMade40To49: seasonStat.stats.KICKFGMADE40TO49 ?? 0,
                fieldGoalsMade50Plus: seasonStat.stats.KICKFGMADE50ORMORE ?? 0,
                fieldGoalAttempts29OrLess: seasonStat.stats.KICKFGATTEMPTS29ORLESS ?? 0,
                fieldGoalAttempts30To39: seasonStat.stats.KICKFGATTEMPTS30TO39 ?? 0,
                fieldGoalAttempts40To49: seasonStat.stats.KICKFGATTEMPTS40TO49 ?? 0,
                fieldGoalAttempts50Plus: seasonStat.stats.KICKFGATTEMPTS50ORMORE ?? 0,
                kickoffs: seasonStat.stats.KICKNUMKICKOFFS ?? 0,
                kickoffTouchbacks: seasonStat.stats.KICKTOUCHBACKS ?? 0,
                gameWinningFieldGoalsMade: seasonStat.stats.GAMEWINFGSMADE ?? 0,
                gameWinningFieldGoalAttempts: seasonStat.stats.GAMEWINFGATTEMPTS ?? 0
            };
        });
}

function getSeasonPuntingStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, ["SeasonKickingStats"]) &&
            seasonStat.stats.PUNTATTEMPTS > 0
        )
        .map(seasonStat => {
            const punts = seasonStat.stats.PUNTATTEMPTS ?? 0;
            const puntingYards = seasonStat.stats.PUNTYARDS ?? 0;
            const netPuntingYards = seasonStat.stats.PUNTNETYARDS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                punts,
                puntingYards,
                puntingAverage: punts > 0 ? puntingYards / punts : 0,
                netPuntingYards,
                netPuntingAverage: punts > 0 ? netPuntingYards / punts : 0,
                longestPunt: seasonStat.stats.PUNTLONGEST ?? 0,
                puntsInside20: seasonStat.stats.PUNTIN20 ?? 0,
                touchbacks: seasonStat.stats.PUNTTOUCHBACKS ?? 0,
                blockedPunts: seasonStat.stats.PUNTBLOCKED ?? 0
            };
        });
}

function getSeasonKickReturnStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, [
                "SeasonOffensiveKPReturnStats",
                "SeasonDefensiveKPReturnStats"
            ]) && seasonStat.stats.KRETATTEMPTS > 0
        )
        .map(seasonStat => {
            const attempts = seasonStat.stats.KRETATTEMPTS ?? 0;
            const yards = seasonStat.stats.KRETYARDS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                kickReturnAttempts: attempts,
                kickReturnYards: yards,
                kickReturnAverage: attempts > 0 ? yards / attempts : 0,
                kickReturnTDs: seasonStat.stats.KRETTDS ?? 0,
                longestKickReturn: seasonStat.stats.KRETLONGEST ?? 0
            };
        });
}

function getSeasonPuntReturnStats(seasonStats) {
    return seasonStats
        .filter(seasonStat =>
            isValidSeasonStat(seasonStat, [
                "SeasonOffensiveKPReturnStats",
                "SeasonDefensiveKPReturnStats"
            ]) && seasonStat.stats.PRETATTEMPTS > 0
        )
        .map(seasonStat => {
            const attempts = seasonStat.stats.PRETATTEMPTS ?? 0;
            const yards = seasonStat.stats.PRETYARDS ?? 0;

            return {
                ...getSeasonStatMeta(seasonStat),
                puntReturnAttempts: attempts,
                puntReturnYards: yards,
                puntReturnAverage: attempts > 0 ? yards / attempts : 0,
                puntReturnTDs: seasonStat.stats.PRETTDS ?? 0,
                longestPuntReturn: seasonStat.stats.PRETLONGEST ?? 0
            };
        });
}

// -------------------- Player Career Statistics --------------------
function getPlayerCareerStats(player) {
    const careerStatsReference = player.getReferenceDataByKey("CareerStats");

    if (!careerStatsReference || careerStatsReference.tableId === 0) {
        return null;
    }

    const statRecord = franchise.getReferencedRecord(player.CareerStats);
    if (!statRecord) return null;

    return {
        statType: statRecord._parent.name,
        stats: statRecord
    };
}

function careerStatMatches(careerStat, statTypes) {
    return careerStat && statTypes.includes(careerStat.statType);
}

function getCareerStatMeta(careerStat) {
    return {
        gamesPlayed: careerStat.stats.GAMESPLAYED ?? 0,
        gamesStarted: careerStat.stats.GAMESSTARTED ?? 0,
        downsPlayed: careerStat.stats.DOWNSPLAYED ?? 0,
        gameRating: careerStat.stats.GAMERATING ?? 0
    };
}

function getCareerPassingStats(careerStat) {
    if (
        !careerStatMatches(careerStat, [
            "CareerOffensiveStats",
            "CareerOffensiveKPReturnStats"
        ]) || careerStat.stats.PASSATTEMPTS <= 0
    ) {
        return null;
    }

    const attempts = careerStat.stats.PASSATTEMPTS ?? 0;
    const completions = careerStat.stats.PASSCOMPLETED ?? 0;
    const yards = careerStat.stats.PASSYARDS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        completions,
        attempts,
        completionPercentage: attempts > 0 ? (completions / attempts) * 100 : 0,
        passingYards: yards,
        yardsPerAttempt: attempts > 0 ? yards / attempts : 0,
        passingTDs: careerStat.stats.PASSTDS ?? 0,
        interceptions: careerStat.stats.PASSINTS ?? 0,
        sacks: careerStat.stats.PASSSACKED ?? 0,
        longestPass: careerStat.stats.PASSLONGEST ?? 0,
        fourthQuarterComebacks: careerStat.stats["4QCOMEBACKS"] ?? 0
    };
}

function getCareerRushingStats(careerStat) {
    if (
        !careerStatMatches(careerStat, [
            "CareerOffensiveStats",
            "CareerOffensiveKPReturnStats"
        ]) || careerStat.stats.RUSHATTEMPTS <= 0
    ) {
        return null;
    }

    const attempts = careerStat.stats.RUSHATTEMPTS ?? 0;
    const yards = careerStat.stats.RUSHYARDS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        rushingAttempts: attempts,
        rushingYards: yards,
        yardsPerCarry: attempts > 0 ? yards / attempts : 0,
        rushingTDs: careerStat.stats.RUSHTDS ?? 0,
        longestRush: careerStat.stats.RUSHLONGEST ?? 0,
        fumbles: careerStat.stats.RUSHFUMBLES ?? 0,
        brokenTackles: careerStat.stats.RUSHBROKENTACKLES ?? 0,
        yardsAfterFirstHit: careerStat.stats.RUSHYARDSAFTER1STHIT ?? 0,
        twentyPlusYardRuns: careerStat.stats.RUSH20YARDRUNS ?? 0
    };
}

function getCareerReceivingStats(careerStat) {
    if (
        !careerStatMatches(careerStat, [
            "CareerOffensiveStats",
            "CareerOffensiveKPReturnStats"
        ]) || careerStat.stats.RECEIVECATCHES <= 0
    ) {
        return null;
    }

    const receptions = careerStat.stats.RECEIVECATCHES ?? 0;
    const yards = careerStat.stats.RECEIVEYARDS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        receptions,
        receivingYards: yards,
        yardsPerReception: receptions > 0 ? yards / receptions : 0,
        receivingTDs: careerStat.stats.RECEIVETDS ?? 0,
        longestReception: careerStat.stats.RECEIVELONGEST ?? 0,
        yardsAfterCatch: careerStat.stats.RECEIVEYARDSAFTER ?? 0,
        drops: careerStat.stats.RECEIVEDROPS ?? 0
    };
}

function getCareerDefensiveStats(careerStat) {
    if (
        !careerStatMatches(careerStat, [
            "CareerDefensiveStats",
            "CareerDefensiveKPReturnStats"
        ])
    ) {
        return null;
    }

    const soloTackles = careerStat.stats.DEFTACKLES ?? 0;
    const assistedTackles = careerStat.stats.ASSDEFTACKLES ?? 0;
    const interceptions = careerStat.stats.DSECINTS ?? 0;
    const interceptionYards = careerStat.stats.DSECINTRETURNYARDS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        soloTackles,
        assistedTackles,
        totalTackles: soloTackles + assistedTackles,
        tacklesForLoss: careerStat.stats.DEFTACKLESFORLOSS ?? 0,
        sacks:
            (careerStat.stats.DLINESACKS ?? 0) +
            ((careerStat.stats.DLINEHALFSACK ?? 0) * 0.5),
        interceptions,
        interceptionYards,
        interceptionAverage:
            interceptions > 0 ? interceptionYards / interceptions : 0,
        longestInterception: careerStat.stats.DSECINTLONGESTRETURN ?? 0,
        passDeflections: careerStat.stats.DEFPASSDEFLECTIONS ?? 0,
        forcedFumbles: careerStat.stats.DLINEFORCEDFUMBLES ?? 0,
        fumbleRecoveries: careerStat.stats.DLINEFUMBLERECOVERIES ?? 0,
        fumbleRecoveryYards: careerStat.stats.DLINEFUMBLERECOVERYYARDS ?? 0,
        blockedKicks: careerStat.stats.DLINEBLOCKS ?? 0,
        safeties: careerStat.stats.DLINESAFETIES ?? 0,
        defensiveTDs:
            (careerStat.stats.DSECINTTDS ?? 0) +
            (careerStat.stats.DLINEFUMBLETDS ?? 0),
        bigHits: careerStat.stats.BIGHITS ?? 0,
        catchesAllowed: careerStat.stats.CTHALLOWED ?? 0
    };
}

function getCareerOLineStats(careerStat) {
    if (!careerStatMatches(careerStat, ["CareerOLineStats"])) return null;

    return {
        ...getCareerStatMeta(careerStat),
        pancakes: careerStat.stats.OLINEPANCAKES ?? 0,
        sacksAllowed: careerStat.stats.OLINESACKSALLOWED ?? 0
    };
}

function getCareerKickingStats(careerStat) {
    if (
        !careerStatMatches(careerStat, ["CareerKickingStats"]) ||
        (
            careerStat.stats.KICKFGATTEMPTS <= 0 &&
            careerStat.stats.KICKEPATTEMPTS <= 0
        )
    ) {
        return null;
    }

    const made = careerStat.stats.KICKFGMADE ?? 0;
    const attempts = careerStat.stats.KICKFGATTEMPTS ?? 0;
    const xpMade = careerStat.stats.KICKEPMADE ?? 0;
    const xpAttempts = careerStat.stats.KICKEPATTEMPTS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        fieldGoalsMade: made,
        fieldGoalsAttempted: attempts,
        fieldGoalPercentage: attempts > 0 ? (made / attempts) * 100 : 0,
        longestFieldGoal: careerStat.stats.KICKFGLONGEST ?? 0,
        extraPointsMade: xpMade,
        extraPointsAttempted: xpAttempts,
        extraPointPercentage: xpAttempts > 0 ? (xpMade / xpAttempts) * 100 : 0,
        fieldGoalsBlocked: careerStat.stats.KICKFGBLOCKED ?? 0,
        extraPointsBlocked: careerStat.stats.KICKEPBLOCKED ?? 0,
        kickoffs: careerStat.stats.KICKNUMKICKOFFS ?? 0,
        kickoffTouchbacks: careerStat.stats.KICKTOUCHBACKS ?? 0,
        gameWinningFieldGoalsMade: careerStat.stats.GAMEWINFGSMADE ?? 0,
        gameWinningFieldGoalAttempts: careerStat.stats.GAMEWINFGATTEMPTS ?? 0
    };
}

function getCareerPuntingStats(careerStat) {
    if (
        !careerStatMatches(careerStat, ["CareerKickingStats"]) ||
        careerStat.stats.PUNTATTEMPTS <= 0
    ) {
        return null;
    }

    const punts = careerStat.stats.PUNTATTEMPTS ?? 0;
    const yards = careerStat.stats.PUNTYARDS ?? 0;
    const netYards = careerStat.stats.PUNTNETYARDS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        punts,
        puntingYards: yards,
        puntingAverage: punts > 0 ? yards / punts : 0,
        netPuntingYards: netYards,
        netPuntingAverage: punts > 0 ? netYards / punts : 0,
        longestPunt: careerStat.stats.PUNTLONGEST ?? 0,
        puntsInside20: careerStat.stats.PUNTIN20 ?? 0,
        touchbacks: careerStat.stats.PUNTTOUCHBACKS ?? 0,
        blockedPunts: careerStat.stats.PUNTBLOCKED ?? 0
    };
}

function getCareerKickReturnStats(careerStat) {
    if (
        !careerStatMatches(careerStat, [
            "CareerOffensiveKPReturnStats",
            "CareerDefensiveKPReturnStats"
        ]) || careerStat.stats.KRETATTEMPTS <= 0
    ) {
        return null;
    }

    const attempts = careerStat.stats.KRETATTEMPTS ?? 0;
    const yards = careerStat.stats.KRETYARDS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        kickReturnAttempts: attempts,
        kickReturnYards: yards,
        kickReturnAverage: attempts > 0 ? yards / attempts : 0,
        kickReturnTDs: careerStat.stats.KRETTDS ?? 0,
        longestKickReturn: careerStat.stats.KRETLONGEST ?? 0
    };
}

function getCareerPuntReturnStats(careerStat) {
    if (
        !careerStatMatches(careerStat, [
            "CareerOffensiveKPReturnStats",
            "CareerDefensiveKPReturnStats"
        ]) || careerStat.stats.PRETATTEMPTS <= 0
    ) {
        return null;
    }

    const attempts = careerStat.stats.PRETATTEMPTS ?? 0;
    const yards = careerStat.stats.PRETYARDS ?? 0;

    return {
        ...getCareerStatMeta(careerStat),
        puntReturnAttempts: attempts,
        puntReturnYards: yards,
        puntReturnAverage: attempts > 0 ? yards / attempts : 0,
        puntReturnTDs: careerStat.stats.PRETTDS ?? 0,
        longestPuntReturn: careerStat.stats.PRETLONGEST ?? 0
    };
}

// Game Stats Helper
function getPlayerGameStats(player) {
    const gameStatsReference = player.getReferenceDataByKey("GameStats");
    if (gameStatsReference.tableId === 0) return [];
    const playerGameStats = gameStatsTable.records[gameStatsReference.rowNumber];
    const gameStats = [];
    for (let i = 0; i < playerGameStats.arraySize; i++) {
        const fieldName = `GameStats${i}`
        const statReference = playerGameStats.getReferenceDataByKey(fieldName);
        if (!statReference || statReference.tableId === 0) continue;
        const statRecord = franchise.getReferencedRecord(playerGameStats[fieldName]);
        if (!statRecord) continue;
        const gameRecord = franchise.getReferencedRecord(statRecord.SeasonGame);
        if (!gameRecord) continue;
        const opposingTeamRecord = franchise.getReferencedRecord(statRecord.OpposingTeam);
        if (!opposingTeamRecord) continue;
        const homeTeamRecord = franchise.getReferencedRecord(gameRecord.HomeTeam);
        const awayTeamRecord = franchise.getReferencedRecord(gameRecord.AwayTeam);
        if (!homeTeamRecord || !awayTeamRecord) continue;
        const opponentIsHome = opposingTeamRecord.TeamIndex === homeTeamRecord.TeamIndex;
        const opponentIsAway = opposingTeamRecord.TeamIndex === awayTeamRecord.TeamIndex;
        if (!opponentIsHome && !opponentIsAway) continue;
        const playerTeamRecord = opponentIsHome ? awayTeamRecord : homeTeamRecord;
        if (gameRecord.SeasonWeek !== i) continue;
        gameStats.push({
            statType: statRecord._parent.name,
            seasonGameReference: statRecord.SeasonGame,
            seasonYear: gameRecord.SeasonYear,
            gameWeek: gameRecord.SeasonWeek,
            stats: statRecord,
            playerTeamIndex: playerTeamRecord.TeamIndex,
            playerTeamName: playerTeamRecord.DisplayName,
            opponentTeamIndex: opposingTeamRecord.TeamIndex,
            opponentTeamName: opposingTeamRecord.DisplayName
        });
    }
    return gameStats;
}

// Game Context Helper
function getGameContext(seasonGameReference) {
    if (!seasonGameReference) return null;
    const gameRecord = franchise.getReferencedRecord(seasonGameReference);
    if (!gameRecord) return null;
    const homeTeamRecord = franchise.getReferencedRecord(gameRecord.HomeTeam);
    const awayTeamRecord = franchise.getReferencedRecord(gameRecord.AwayTeam);
    const gameTimeMinutes = gameRecord.TimeOfDay;
    const gameTimeHours = Math.floor(gameTimeMinutes / 60);
    const gameTimeRemainingMinutes = gameTimeMinutes % 60;
    const gameTimePeriod = gameTimeHours >= 12 ? "PM" : "AM";
    const gameTimeDisplayHours = gameTimeHours % 12 || 12;
    const gameTimeDisplayMinutes = String(gameTimeRemainingMinutes).padStart(2, "0");
    const gameTimeDisplay = `${gameTimeDisplayHours}:${gameTimeDisplayMinutes} ${gameTimePeriod}`;
    const gameYear = dynastyStartYear + gameRecord.SeasonYear;
    const gameDateDisplay = `${gameRecord.GameDateMonth}/${gameRecord.GameDateDay}/${gameYear}`;
    const gameDatePretty = new Date(
        gameYear,
        gameRecord.GameDateMonth -1,
        gameRecord.GameDateDay
    ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
    if (!homeTeamRecord || !awayTeamRecord) return null;
    return {
        gameWeek: gameRecord.SeasonWeek,
        seasonYear: gameRecord.SeasonYear,
        homeTeamReference: gameRecord.HomeTeam,
        homeTeamIndex: homeTeamRecord.TeamIndex,
        homeTeamName: homeTeamRecord.DisplayName,
        awayTeamReference: gameRecord.AwayTeam,
        awayTeamIndex: awayTeamRecord.TeamIndex,
        awayTeamName: awayTeamRecord.DisplayName,
        homeScore: gameRecord.HomeScore,
        awayScore: gameRecord.AwayScore,
        gameStatus: gameRecord.GameStatus,
        stadium: gameRecord.Stadium,
        broadcastNetwork: gameRecord.BroadcastNetwork,
        gameDateDay: gameRecord.GameDateDay,
        gameDateMonth: gameRecord.GameDateMonth,
        timeOfDay: gameRecord.TimeOfDay,
        timeOfDayDisplay: gameTimeDisplay,
        gameDateDisplay: gameDateDisplay,
        gameDatePretty: gameDatePretty
    };
}

// Team Box Score Helper
function cleanTeamBoxScoreStats(teamStatsRecord, teamRecord) {
    if (!teamStatsRecord || !teamRecord) return null;

    const possessionTimeSeconds = teamStatsRecord.POSSESSIONTIME;
    const possessionTimeMinutes = Math.floor(possessionTimeSeconds / 60);
    const possessionTimeRemainingSeconds = String(possessionTimeSeconds % 60).padStart(2, "0");

    return {
        teamIndex: teamRecord.TeamIndex,
        teamName: teamRecord.DisplayName,
        firstDowns: teamStatsRecord.FIRSTDOWNS,
        totalYards: teamStatsRecord.TOTALYARDS,
        offensiveYards: teamStatsRecord.OFFYARDS,
        rushingYards: teamStatsRecord.OFFRUSHYARDS,
        rushingAttempts: teamStatsRecord.RUSHATTEMPTS,
        passingYards: teamStatsRecord.OFFPASSYARDS,
        completions: teamStatsRecord.PASSCOMPLETIONS,
        passingAttempts: teamStatsRecord.PASSATTEMPTS,
        passingTDs: teamStatsRecord.PASSTDS,
        rushingTDs: teamStatsRecord.RUSHTDS,
        interceptionsThrown: teamStatsRecord.PASSINTS,
        fumblesLost: teamStatsRecord.FUMBLESLOST,
        giveaways: teamStatsRecord.GIVEAWAYS,
        takeaways: teamStatsRecord.TAKEAWAYS,
        sacks: teamStatsRecord.SACKS,
        sacksAllowed: teamStatsRecord.SACKSALLOWED,
        thirdDownConversions: teamStatsRecord.THIRDDOWNCONV,
        thirdDownAttempts: teamStatsRecord.THIRDDOWNS,
        thirdDownPercentage: teamStatsRecord.THIRDDOWNS > 0
            ? (teamStatsRecord.THIRDDOWNCONV / teamStatsRecord.THIRDDOWNS) * 100
            : 0,
        fourthDownConversions: teamStatsRecord.FOURTHDOWNCONV,
        fourthDownAttempts: teamStatsRecord.FOURTHDOWNS,
        fourthDownPercentage: teamStatsRecord.FOURTHDOWNS > 0
            ? (teamStatsRecord.FOURTHDOWNCONV / teamStatsRecord.FOURTHDOWNS) * 100
            : 0,
        redZoneTrips: teamStatsRecord.OFFREDZONES,
        redZoneTDs: teamStatsRecord.OFFREDZONETDS,
        redZoneFieldGoals: teamStatsRecord.OFFREDZONEFGS,
        penalties: teamStatsRecord.PENALTIES,
        penaltyYards: teamStatsRecord.PENALTYYARDS,
        punts: teamStatsRecord.PUNTS,
        puntYards: teamStatsRecord.PUNTYARDS,
        possessionTimeSeconds: possessionTimeSeconds,
        possessionTimeDisplay: `${possessionTimeMinutes}:${possessionTimeRemainingSeconds}`,
        kickReturnYards: teamStatsRecord.KICKRETURNYARDS,
        puntReturnYards: teamStatsRecord.PUNTRETURNYARDS
    };
}

function getTeamBoxScoreStats(seasonGameReference) {
    const gameRecord = franchise.getReferencedRecord(seasonGameReference);
    if (!gameRecord) return null;

    const homeTeamRecord = franchise.getReferencedRecord(gameRecord.HomeTeam);
    const awayTeamRecord = franchise.getReferencedRecord(gameRecord.AwayTeam);
    const homeTeamStatsRecord = franchise.getReferencedRecord(gameRecord.HomeTeamStatCache);
    const awayTeamStatsRecord = franchise.getReferencedRecord(gameRecord.AwayTeamStatCache);

    if (!homeTeamRecord || !awayTeamRecord || !homeTeamStatsRecord || !awayTeamStatsRecord) {
        return null;
    }

    return {
        home: cleanTeamBoxScoreStats(homeTeamStatsRecord, homeTeamRecord),
        away: cleanTeamBoxScoreStats(awayTeamStatsRecord, awayTeamRecord)
    };
}

// Game Line Score Helper
function getGameLineScore(seasonGameReference) {
    const gameRecord = franchise.getReferencedRecord(seasonGameReference);
    if (!gameRecord) return null;

    return {
        home: {
            quarter1: gameRecord.HomeScoreQuarter1,
            quarter2: gameRecord.HomeScoreQuarter2,
            quarter3: gameRecord.HomeScoreQuarter3,
            quarter4: gameRecord.HomeScoreQuarter4,
            overtime: gameRecord.HomeScoreOT,
            total: gameRecord.HomeScore
        },
        away: {
            quarter1: gameRecord.AwayScoreQuarter1,
            quarter2: gameRecord.AwayScoreQuarter2,
            quarter3: gameRecord.AwayScoreQuarter3,
            quarter4: gameRecord.AwayScoreQuarter4,
            overtime: gameRecord.AwayScoreOT,
            total: gameRecord.AwayScore
        }
    };
}

// Scoring Summary Helper
function parseScoringSummaryArray(scoringSummaryArray) {
    if (!scoringSummaryArray) return [];

    const scoringSummary = [];

    for (let i = 0; i < scoringSummaryArray.arraySize; i++) {
        const summaryRecord = franchise.getReferencedRecord(
            scoringSummaryArray[`ScoringSummary${i}`]
        );

        if (!summaryRecord) continue;

        const homeScoreChange = summaryRecord.HomeCurrentScore - summaryRecord.HomePreviousScore;
        const awayScoreChange = summaryRecord.AwayCurrentScore - summaryRecord.AwayPreviousScore;

        // Some stored rows represent a failed conversion/end-of-period state with no score change.
        if (homeScoreChange === 0 && awayScoreChange === 0) continue;

        const scoringSide = homeScoreChange > awayScoreChange
            ? "home"
            : awayScoreChange > homeScoreChange
                ? "away"
                : null;

        const rawScoringPoints = Math.max(homeScoreChange, awayScoreChange, 0);
        const conversionPoints = rawScoringPoints === 6
            ? summaryRecord.Conversion === "FieldGoal"
                ? 1
                : summaryRecord.Conversion === "Touchdown"
                    ? 2
                    : 0
            : 0;

        const scoringType = rawScoringPoints === 6
            ? "Touchdown"
            : rawScoringPoints === 3
                ? "Field Goal"
                : "Other";

        const timeRemainingMinutes = Math.floor(summaryRecord.TimeStampInSec / 60);
        const timeRemainingSeconds = String(summaryRecord.TimeStampInSec % 60).padStart(2, "0");

        scoringSummary.push({
            quarter: summaryRecord.Quarter,
            quarterDisplay: summaryRecord.Quarter <= 4 ? `Q${summaryRecord.Quarter}` : "OT",
            timeRemainingSeconds: summaryRecord.TimeStampInSec,
            timeRemainingDisplay: `${timeRemainingMinutes}:${timeRemainingSeconds}`,
            scoringSide: scoringSide,
            scoringType: scoringType,
            rawScoringPoints: rawScoringPoints,
            conversionType: summaryRecord.Conversion,
            conversionPoints: conversionPoints,
            pointsScored: rawScoringPoints + conversionPoints,
            homePreviousScore: summaryRecord.HomePreviousScore,
            awayPreviousScore: summaryRecord.AwayPreviousScore,
            homeCurrentScore: summaryRecord.HomeCurrentScore,
            awayCurrentScore: summaryRecord.AwayCurrentScore,
            homeScoreAfterPlay: summaryRecord.HomeCurrentScore + (scoringSide === "home" ? conversionPoints : 0),
            awayScoreAfterPlay: summaryRecord.AwayCurrentScore + (scoringSide === "away" ? conversionPoints : 0),
            homePlayerSnapshotsReference: summaryRecord.HomePlayerSnapshots,
            awayPlayerSnapshotsReference: summaryRecord.AwayPlayerSnapshots
        });
    }

    return scoringSummary;
}

function getGameScoringSummary(seasonGameReference) {
    const gameRecord = franchise.getReferencedRecord(seasonGameReference);
    if (!gameRecord) return [];

    const scoringSummaryReference = gameRecord.getReferenceDataByKey("ScoringSummaries");
    if (!scoringSummaryReference || scoringSummaryReference.tableId === 0) return [];

    const scoringSummaryArray = franchise.getReferencedRecord(gameRecord.ScoringSummaries);
    if (!scoringSummaryArray) return [];

    const gameContext = getGameContext(seasonGameReference);
    const scoringSummary = parseScoringSummaryArray(scoringSummaryArray);

    return scoringSummary.map(scoringPlay => ({
        ...scoringPlay,
        scoringTeamIndex: scoringPlay.scoringSide === "home"
            ? gameContext?.homeTeamIndex
            : scoringPlay.scoringSide === "away"
                ? gameContext?.awayTeamIndex
                : null,
        scoringTeamName: scoringPlay.scoringSide === "home"
            ? gameContext?.homeTeamName
            : scoringPlay.scoringSide === "away"
                ? gameContext?.awayTeamName
                : null
    }));
}

// Game Box Score Helper
function getGameBoxScoreData(seasonGameReference) {
    const boxScorePlayers = [];
    const gameContext = getGameContext(seasonGameReference);
    if (!gameContext) return null;

    const teamBoxScoreStats = getTeamBoxScoreStats(seasonGameReference);
    const lineScore = getGameLineScore(seasonGameReference);
    const scoringSummary = getGameScoringSummary(seasonGameReference);
    for (const player of cleanPlayers) {
        const matchingGameStats = player.gameStats.filter(gameStat =>
            gameStat.seasonGameReference === seasonGameReference
        );
        if (matchingGameStats.length === 0) continue;
        boxScorePlayers.push({
            playerRow: player.playerRow,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            jerseyNumber: player.jerseyNumber,
            teamIndex: matchingGameStats[0].playerTeamIndex,
            teamName: matchingGameStats[0].playerTeamName,
            opponentTeamIndex: matchingGameStats[0].opponentTeamIndex,
            opponentTeamName: matchingGameStats[0].opponentTeamName,
            gameStats: matchingGameStats
        });
    }
    const homePlayers = boxScorePlayers.filter(
        player => player.teamIndex === gameContext.homeTeamIndex
    );
    const awayPlayers = boxScorePlayers.filter(
        player => player.teamIndex === gameContext.awayTeamIndex
    );
    const homeOffensivePlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveStats"));
    const awayOffensivePlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveStats"));
    const homeDefensivePlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameDefensiveStats" || gameStat.statType === "GameDefensiveKPReturnStats"));
    const awayDefensivePlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameDefensiveStats" || gameStat.statType === "GameDefensiveKPReturnStats"));
    const homeOLinePlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOLineStats"));
    const awayOLinePlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOLineStats"));
    const homeKickingPlayers = homePlayers.filter(player =>
    player.gameStats.some(gameStat =>
        gameStat.statType === "GameKickingStats" &&
        (
            gameStat.stats.KICKFGATTEMPTS > 0 ||
            gameStat.stats.KICKEPATTEMPTS > 0 
        )
    )
);

    const awayKickingPlayers = awayPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            gameStat.statType === "GameKickingStats" &&
            (
                gameStat.stats.KICKFGATTEMPTS > 0 ||
                gameStat.stats.KICKEPATTEMPTS > 0 
            )
        )
    );


    // Punting Players
    const homePuntingPlayers = homePlayers.filter(player =>
        player.gameStats.some(gameStat =>
            gameStat.statType === "GameKickingStats" &&
            gameStat.stats.PUNTATTEMPTS > 0
        )
    );

    const awayPuntingPlayers = awayPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            gameStat.statType === "GameKickingStats" &&
            gameStat.stats.PUNTATTEMPTS > 0
        )
    );

    // Return Players
    const homeReturnPlayers = homePlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
             gameStat.statType === "GameDefensiveKPReturnStats") &&
            (gameStat.stats.KRETATTEMPTS > 0 || gameStat.stats.PRETATTEMPTS > 0)
        )
    );

    const awayReturnPlayers = awayPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
             gameStat.statType === "GameDefensiveKPReturnStats") &&
            (gameStat.stats.KRETATTEMPTS > 0 || gameStat.stats.PRETATTEMPTS > 0)
        )
    );

    const homeKickReturnPlayers = homeReturnPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
             gameStat.statType === "GameDefensiveKPReturnStats") &&
            gameStat.stats.KRETATTEMPTS > 0
        )
    );

    const awayKickReturnPlayers = awayReturnPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
             gameStat.statType === "GameDefensiveKPReturnStats") &&
            gameStat.stats.KRETATTEMPTS > 0
        )
    );

    const homePuntReturnPlayers = homeReturnPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
             gameStat.statType === "GameDefensiveKPReturnStats") &&
            gameStat.stats.PRETATTEMPTS > 0
        )
    );

    const awayPuntReturnPlayers = awayReturnPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveKPReturnStats" ||
             gameStat.statType === "GameDefensiveKPReturnStats") &&
            gameStat.stats.PRETATTEMPTS > 0
        )
    );

    // Fumble Players
    const homeFumblePlayers = homePlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveStats" ||
             gameStat.statType === "GameOffensiveKPReturnStats") &&
            gameStat.stats.RUSHFUMBLES > 0
        )
    );

    const awayFumblePlayers = awayPlayers.filter(player =>
        player.gameStats.some(gameStat =>
            (gameStat.statType === "GameOffensiveStats" ||
             gameStat.statType === "GameOffensiveKPReturnStats") &&
            gameStat.stats.RUSHFUMBLES > 0
        )
    );
    const homeOffensiveReturnPlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveKPReturnStats"));
    const awayOffensiveReturnPlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveKPReturnStats"));
    const homePassingPlayers = homeOffensivePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveStats" && gameStat.stats.PASSATTEMPTS > 0));
    const awayPassingPlayers = awayOffensivePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveStats" && gameStat.stats.PASSATTEMPTS > 0));
    const homeRushingPlayers = homeOffensivePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveStats" && gameStat.stats.RUSHATTEMPTS > 0));
    const awayRushingPlayers = awayOffensivePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveStats" && gameStat.stats.RUSHATTEMPTS > 0));
    const homeReceivingPlayers = homePlayers.filter(player => player.gameStats.some(gameStat => (gameStat.statType === "GameOffensiveStats" || gameStat.statType === "GameOffensiveKPReturnStats") && gameStat.stats.RECEIVECATCHES > 0));
    const awayReceivingPlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => (gameStat.statType === "GameOffensiveStats" || gameStat.statType === "GameOffensiveKPReturnStats") && gameStat.stats.RECEIVECATCHES > 0));
    const homePassingStats = homePassingPlayers.map(player => {
        const passingStat = player.gameStats.find(gameStat => gameStat.statType === "GameOffensiveStats")
        return {
            playerRow: player.playerRow,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            completions: passingStat.stats.PASSCOMPLETED,
            attempts: passingStat.stats.PASSATTEMPTS,
            passingYards: passingStat.stats.PASSYARDS,
            passingTDs: passingStat.stats.PASSTDS,
            interceptions: passingStat.stats.PASSINTS,
            sacks: passingStat.stats.PASSSACKED,
            longestPass: passingStat.stats.PASSLONGEST

        }
    })
    const awayPassingStats = awayPassingPlayers.map(player => {
        const passingStat = player.gameStats.find(gameStat => gameStat.statType === "GameOffensiveStats")
        return {
            playerRow: player.playerRow,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            completions: passingStat.stats.PASSCOMPLETED,
            attempts: passingStat.stats.PASSATTEMPTS,
            passingYards: passingStat.stats.PASSYARDS,
            passingTDs: passingStat.stats.PASSTDS,
            interceptions: passingStat.stats.PASSINTS,
            sacks: passingStat.stats.PASSSACKED,
            longestPass: passingStat.stats.PASSLONGEST
        }
    })
    const homeRushingStats = homeRushingPlayers.map(player => {
        const rushingStat = player.gameStats.find(gameStat => gameStat.statType === "GameOffensiveStats")
        return{
            playerRow: player.playerRow,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            rushingAttempts: rushingStat.stats.RUSHATTEMPTS,
            rushingYards: rushingStat.stats.RUSHYARDS,
            rushingTDs: rushingStat.stats.RUSHTDS,
            longestRush: rushingStat.stats.RUSHLONGEST,
            fumbles: rushingStat.stats.RUSHFUMBLES,
            rushingBrokenTackles: rushingStat.stats.RUSHBROKENTACKLES,
        }
    })
const awayRushingStats = awayRushingPlayers.map(player => {
        const rushingStat = player.gameStats.find(gameStat => gameStat.statType === "GameOffensiveStats")
        return{
            playerRow: player.playerRow,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            rushingAttempts: rushingStat.stats.RUSHATTEMPTS,
            rushingYards: rushingStat.stats.RUSHYARDS,
            rushingTDs: rushingStat.stats.RUSHTDS,
            longestRush: rushingStat.stats.RUSHLONGEST,
            fumbles: rushingStat.stats.RUSHFUMBLES,
            rushingBrokenTackles: rushingStat.stats.RUSHBROKENTACKLES,
        }
    })
const homeReceivingStats = homeReceivingPlayers.map(player => {
        const receivingStats = player.gameStats.find(gameStat => (gameStat.statType === "GameOffensiveStats" || gameStat.statType === "GameOffensiveKPReturnStats") && gameStat.stats.RECEIVECATCHES > 0);
        return {
            playerRow: player.playerRow,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            receptions: receivingStats.stats.RECEIVECATCHES,
            receivingYards: receivingStats.stats.RECEIVEYARDS,
            receivingTDs: receivingStats.stats.RECEIVETDS,
            yardsAfterCatch: receivingStats.stats.RECEIVEYARDSAFTER,
            longestReception: receivingStats.stats.RECEIVELONGEST,
            drops: receivingStats.stats.RECEIVEDROPS,
    }
})
const awayReceivingStats = awayReceivingPlayers.map(player => {
        const receivingStats = player.gameStats.find(gameStat => (gameStat.statType === "GameOffensiveStats" || gameStat.statType === "GameOffensiveKPReturnStats") && gameStat.stats.RECEIVECATCHES > 0);
        return {
            playerRow: player.playerRow,
            firstName: player.firstName,
            lastName: player.lastName,
            position: player.position,
            receptions: receivingStats.stats.RECEIVECATCHES,
            receivingYards: receivingStats.stats.RECEIVEYARDS,
            receivingTDs: receivingStats.stats.RECEIVETDS,
            yardsAfterCatch: receivingStats.stats.RECEIVEYARDSAFTER,
            longestReception: receivingStats.stats.RECEIVELONGEST,
            drops: receivingStats.stats.RECEIVEDROPS,
    }
})
const homeDefensiveStats = homeDefensivePlayers.map(player => {
    const defensiveStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameDefensiveStats" ||
        gameStat.statType === "GameDefensiveKPReturnStats"
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        soloTackles: defensiveStat.stats.DEFTACKLES,
        assistedTackles: defensiveStat.stats.ASSDEFTACKLES,
        totalTackles: defensiveStat.stats.DEFTACKLES + defensiveStat.stats.ASSDEFTACKLES,
        tacklesForLoss: defensiveStat.stats.DEFTACKLESFORLOSS,
        sacks: defensiveStat.stats.DLINESACKS + (defensiveStat.stats.DLINEHALFSACK * 0.5),
        interceptions: defensiveStat.stats.DSECINTS,
        interceptionYards: defensiveStat.stats.DSECINTRETURNYARDS,
        longestInterception: defensiveStat.stats.DSECINTLONGESTRETURN,
        passDeflections: defensiveStat.stats.DEFPASSDEFLECTIONS,
        interceptionAverage: defensiveStat.stats.DSECINTS > 0 ? defensiveStat.stats.DSECINTRETURNYARDS / defensiveStat.stats.DSECINTS : 0,
        forcedFumbles: defensiveStat.stats.DLINEFORCEDFUMBLES,
        fumbleRecoveries: defensiveStat.stats.DLINEFUMBLERECOVERIES,
        fumbleRecoveryYards: defensiveStat.stats.DLINEFUMBLERECOVERYYARDS,
        blockedKicks: defensiveStat.stats.DLINEBLOCKS,
        safeties: defensiveStat.stats.DLINESAFETIES,
        defensiveTDs: defensiveStat.stats.DSECINTTDS + defensiveStat.stats.DLINEFUMBLETDS,
    }
})
const awayDefensiveStats = awayDefensivePlayers.map(player => {
    const defensiveStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameDefensiveStats" ||
        gameStat.statType === "GameDefensiveKPReturnStats"
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        soloTackles: defensiveStat.stats.DEFTACKLES,
        assistedTackles: defensiveStat.stats.ASSDEFTACKLES,
        totalTackles: defensiveStat.stats.DEFTACKLES + defensiveStat.stats.ASSDEFTACKLES,
        tacklesForLoss: defensiveStat.stats.DEFTACKLESFORLOSS,
        sacks: defensiveStat.stats.DLINESACKS + (defensiveStat.stats.DLINEHALFSACK * 0.5),
        interceptions: defensiveStat.stats.DSECINTS,
        interceptionYards: defensiveStat.stats.DSECINTRETURNYARDS,
        longestInterception: defensiveStat.stats.DSECINTLONGESTRETURN,
        passDeflections: defensiveStat.stats.DEFPASSDEFLECTIONS,
        interceptionAverage: defensiveStat.stats.DSECINTS > 0 ? defensiveStat.stats.DSECINTRETURNYARDS / defensiveStat.stats.DSECINTS : 0,
        forcedFumbles: defensiveStat.stats.DLINEFORCEDFUMBLES,
        fumbleRecoveries: defensiveStat.stats.DLINEFUMBLERECOVERIES,
        fumbleRecoveryYards: defensiveStat.stats.DLINEFUMBLERECOVERYYARDS,
        blockedKicks: defensiveStat.stats.DLINEBLOCKS,
        safeties: defensiveStat.stats.DLINESAFETIES,
        defensiveTDs: defensiveStat.stats.DSECINTTDS + defensiveStat.stats.DLINEFUMBLETDS,
    }
})
const homeOLineStats = homeOLinePlayers.map(player => {
    const oLineStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameOLineStats"
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        pancakes: oLineStat.stats.OLINEPANCAKES,
        sacksAllowed: oLineStat.stats.OLINESACKSALLOWED,
        downsPlayed: oLineStat.stats.DOWNSPLAYED,
        gamesStarted: oLineStat.stats.GAMESSTARTED,
    }
})
const awayOLineStats = awayOLinePlayers.map(player => {
    const oLineStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameOLineStats"
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        pancakes: oLineStat.stats.OLINEPANCAKES,
        sacksAllowed: oLineStat.stats.OLINESACKSALLOWED,
        downsPlayed: oLineStat.stats.DOWNSPLAYED,
        gamesStarted: oLineStat.stats.GAMESSTARTED,
    }
})
const homeKickingStats = homeKickingPlayers.map(player => {
    const kickingStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameKickingStats"
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        fieldGoalsMade: kickingStat.stats.KICKFGMADE,
        fieldGoalsAttempted: kickingStat.stats.KICKFGATTEMPTS,
        longestFieldGoal: kickingStat.stats.KICKFGLONGEST,
        extraPointsMade: kickingStat.stats.KICKEPMADE,
        extraPointsAttempted: kickingStat.stats.KICKEPATTEMPTS,
        gamesStarted: kickingStat.stats.GAMESSTARTED,
        downsPlayed: kickingStat.stats.DOWNSPLAYED
    };
})
const awayKickingStats = awayKickingPlayers.map(player => {
    const kickingStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameKickingStats"
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        fieldGoalsMade: kickingStat.stats.KICKFGMADE,
        fieldGoalsAttempted: kickingStat.stats.KICKFGATTEMPTS,
        longestFieldGoal: kickingStat.stats.KICKFGLONGEST,
        extraPointsMade: kickingStat.stats.KICKEPMADE,
        extraPointsAttempted: kickingStat.stats.KICKEPATTEMPTS,
        gamesStarted: kickingStat.stats.GAMESSTARTED,
        downsPlayed: kickingStat.stats.DOWNSPLAYED
    };
})


// Punting Box Score Stats
const homePuntingStats = homePuntingPlayers.map(player => {
    const puntingStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameKickingStats" &&
        gameStat.stats.PUNTATTEMPTS > 0
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        punts: puntingStat.stats.PUNTATTEMPTS,
        puntingYards: puntingStat.stats.PUNTYARDS,
        puntingAverage: puntingStat.stats.PUNTYARDS / puntingStat.stats.PUNTATTEMPTS,
        netPuntingYards: puntingStat.stats.PUNTNETYARDS,
        netPuntingAverage: puntingStat.stats.PUNTNETYARDS / puntingStat.stats.PUNTATTEMPTS,
        longestPunt: puntingStat.stats.PUNTLONGEST,
        puntsInside20: puntingStat.stats.PUNTIN20,
        touchbacks: puntingStat.stats.PUNTTOUCHBACKS,
        blockedPunts: puntingStat.stats.PUNTBLOCKED
    };
})

const awayPuntingStats = awayPuntingPlayers.map(player => {
    const puntingStat = player.gameStats.find(gameStat =>
        gameStat.statType === "GameKickingStats" &&
        gameStat.stats.PUNTATTEMPTS > 0
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        punts: puntingStat.stats.PUNTATTEMPTS,
        puntingYards: puntingStat.stats.PUNTYARDS,
        puntingAverage: puntingStat.stats.PUNTYARDS / puntingStat.stats.PUNTATTEMPTS,
        netPuntingYards: puntingStat.stats.PUNTNETYARDS,
        netPuntingAverage: puntingStat.stats.PUNTNETYARDS / puntingStat.stats.PUNTATTEMPTS,
        longestPunt: puntingStat.stats.PUNTLONGEST,
        puntsInside20: puntingStat.stats.PUNTIN20,
        touchbacks: puntingStat.stats.PUNTTOUCHBACKS,
        blockedPunts: puntingStat.stats.PUNTBLOCKED
    };
})

// Kick Return Box Score Stats
const homeKickReturnStats = homeKickReturnPlayers.map(player => {
    const kickReturnStat = player.gameStats.find(gameStat =>
        (gameStat.statType === "GameOffensiveKPReturnStats" ||
         gameStat.statType === "GameDefensiveKPReturnStats") &&
        gameStat.stats.KRETATTEMPTS > 0
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        kickReturns: kickReturnStat.stats.KRETATTEMPTS,
        kickReturnYards: kickReturnStat.stats.KRETYARDS,
        kickReturnAverage: kickReturnStat.stats.KRETYARDS / kickReturnStat.stats.KRETATTEMPTS,
        longestKickReturn: kickReturnStat.stats.KRETLONGEST,
        kickReturnTDs: kickReturnStat.stats.KRETTDS
    };
})

const awayKickReturnStats = awayKickReturnPlayers.map(player => {
    const kickReturnStat = player.gameStats.find(gameStat =>
        (gameStat.statType === "GameOffensiveKPReturnStats" ||
         gameStat.statType === "GameDefensiveKPReturnStats") &&
        gameStat.stats.KRETATTEMPTS > 0
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        kickReturns: kickReturnStat.stats.KRETATTEMPTS,
        kickReturnYards: kickReturnStat.stats.KRETYARDS,
        kickReturnAverage: kickReturnStat.stats.KRETYARDS / kickReturnStat.stats.KRETATTEMPTS,
        longestKickReturn: kickReturnStat.stats.KRETLONGEST,
        kickReturnTDs: kickReturnStat.stats.KRETTDS
    };
})

// Punt Return Box Score Stats
const homePuntReturnStats = homePuntReturnPlayers.map(player => {
    const puntReturnStat = player.gameStats.find(gameStat =>
        (gameStat.statType === "GameOffensiveKPReturnStats" ||
         gameStat.statType === "GameDefensiveKPReturnStats") &&
        gameStat.stats.PRETATTEMPTS > 0
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        puntReturns: puntReturnStat.stats.PRETATTEMPTS,
        puntReturnYards: puntReturnStat.stats.PRETYARDS,
        puntReturnAverage: puntReturnStat.stats.PRETYARDS / puntReturnStat.stats.PRETATTEMPTS,
        longestPuntReturn: puntReturnStat.stats.PRETLONGEST,
        puntReturnTDs: puntReturnStat.stats.PRETTDS
    };
})

const awayPuntReturnStats = awayPuntReturnPlayers.map(player => {
    const puntReturnStat = player.gameStats.find(gameStat =>
        (gameStat.statType === "GameOffensiveKPReturnStats" ||
         gameStat.statType === "GameDefensiveKPReturnStats") &&
        gameStat.stats.PRETATTEMPTS > 0
    );

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        puntReturns: puntReturnStat.stats.PRETATTEMPTS,
        puntReturnYards: puntReturnStat.stats.PRETYARDS,
        puntReturnAverage: puntReturnStat.stats.PRETYARDS / puntReturnStat.stats.PRETATTEMPTS,
        longestPuntReturn: puntReturnStat.stats.PRETLONGEST,
        puntReturnTDs: puntReturnStat.stats.PRETTDS
    };
})

// Fumble Box Score Stats
const homeFumbleStats = homeFumblePlayers.map(player => {
    const fumbles = player.gameStats
        .filter(gameStat =>
            (gameStat.statType === "GameOffensiveStats" ||
             gameStat.statType === "GameOffensiveKPReturnStats") &&
            gameStat.stats.RUSHFUMBLES > 0
        )
        .reduce((total, gameStat) => total + gameStat.stats.RUSHFUMBLES, 0);

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        fumbles: fumbles
    };
})

const awayFumbleStats = awayFumblePlayers.map(player => {
    const fumbles = player.gameStats
        .filter(gameStat =>
            (gameStat.statType === "GameOffensiveStats" ||
             gameStat.statType === "GameOffensiveKPReturnStats") &&
            gameStat.stats.RUSHFUMBLES > 0
        )
        .reduce((total, gameStat) => total + gameStat.stats.RUSHFUMBLES, 0);

    return {
        playerRow: player.playerRow,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        fumbles: fumbles
    };
})

const boxScoreData = {
    gameContext: gameContext,
    lineScore: lineScore,
    teamBoxScoreStats: teamBoxScoreStats,
    scoringSummary: scoringSummary,
    playerStatsAvailable: boxScorePlayers.length > 0,
    players: boxScorePlayers,

    // Home Players
    homePlayers: homePlayers,
    homeOffensivePlayers: homeOffensivePlayers,
    homePassingPlayers: homePassingPlayers,
    homeRushingPlayers: homeRushingPlayers,
    homeReceivingPlayers: homeReceivingPlayers,

    // Away Players
    awayPlayers: awayPlayers,
    awayOffensivePlayers: awayOffensivePlayers,
    awayPassingPlayers: awayPassingPlayers,
    awayRushingPlayers: awayRushingPlayers,
    awayReceivingPlayers: awayReceivingPlayers,

    // Offensive Box Score Stats
    homePassingStats: homePassingStats,
    awayPassingStats: awayPassingStats,
    homeRushingStats: homeRushingStats,
    awayRushingStats: awayRushingStats,
    homeReceivingStats: homeReceivingStats,
    awayReceivingStats: awayReceivingStats,

    // Defensive Box Score Stats
    homeDefensiveStats: homeDefensiveStats,
    awayDefensiveStats: awayDefensiveStats,

    // Defensive Players
    homeDefensivePlayers: homeDefensivePlayers,
    awayDefensivePlayers: awayDefensivePlayers,

    // O-Line Players
    homeOLinePlayers: homeOLinePlayers,
    awayOLinePlayers: awayOLinePlayers,

    // O-Line Box Score Stats
    homeOLineStats: homeOLineStats,
    awayOLineStats: awayOLineStats,

    // Kicking Players
    homeKickingPlayers: homeKickingPlayers,
    awayKickingPlayers: awayKickingPlayers,

    // Kicking Box Score Stats
    homeKickingStats: homeKickingStats,
    awayKickingStats: awayKickingStats,

    // Punting Players
    homePuntingPlayers: homePuntingPlayers,
    awayPuntingPlayers: awayPuntingPlayers,

    // Punting Box Score Stats
    homePuntingStats: homePuntingStats,
    awayPuntingStats: awayPuntingStats,

    // Return Players
    homeReturnPlayers: homeReturnPlayers,
    awayReturnPlayers: awayReturnPlayers,
    homeKickReturnPlayers: homeKickReturnPlayers,
    awayKickReturnPlayers: awayKickReturnPlayers,
    homePuntReturnPlayers: homePuntReturnPlayers,
    awayPuntReturnPlayers: awayPuntReturnPlayers,

    // Return Box Score Stats
    homeKickReturnStats: homeKickReturnStats,
    awayKickReturnStats: awayKickReturnStats,
    homePuntReturnStats: homePuntReturnStats,
    awayPuntReturnStats: awayPuntReturnStats,

    // Fumble Players
    homeFumblePlayers: homeFumblePlayers,
    awayFumblePlayers: awayFumblePlayers,

    // Fumble Box Score Stats
    homeFumbleStats: homeFumbleStats,
    awayFumbleStats: awayFumbleStats,

    // Offensive Return Players
    homeOffensiveReturnPlayers: homeOffensiveReturnPlayers,
    awayOffensiveReturnPlayers: awayOffensiveReturnPlayers,

};

return boxScoreData;
}


// -------------------- Team and Dynasty Data --------------------
function isZeroReference(reference) {
    return !reference || /^0+$/.test(String(reference));
}

async function resolveReferenceRecord(ownerRecord, fieldName) {
    if (!ownerRecord || !fieldName) return null;

    const referenceData = ownerRecord.getReferenceDataByKey(fieldName);
    if (!referenceData || referenceData.tableId === 0) return null;

    const table = franchise.getTableById(referenceData.tableId);
    if (!table) return null;

    if (!table.recordsRead) {
        await table.readRecords();
    }

    return table.records[referenceData.rowNumber] ?? null;
}

async function resolveArrayRecords(arrayRecord) {
    if (!arrayRecord || !arrayRecord._offsetTable) return [];

    const records = [];
    const fields = Number.isInteger(arrayRecord.arraySize)
        ? arrayRecord._offsetTable.slice(0, arrayRecord.arraySize)
        : arrayRecord._offsetTable;

    for (const field of fields) {
        const record = await resolveReferenceRecord(arrayRecord, field.name);
        if (record && !record.isEmpty) records.push(record);
    }

    return records;
}

function getPositionDisplay(position) {
    if (position === "ROLB") return "WILL";
    if (position === "LOLB") return "SAM";
    return position;
}

function getScalarAppearanceSnapshot(record, fields) {
    if (!record) return null;
    const appearance = {};
    for (const fieldName of fields) {
        if (!record.getFieldByKey(fieldName)) continue;
        if (fieldName === "Weight" && record._parent?.name === "Player") {
            appearance.weight = (record.Weight ?? 0) + 160;
        } else if (fieldName === "Height" && record._parent?.name === "Player") {
            appearance.heightInches = record.Height ?? 0;
        } else {
            appearance[fieldName] = record[fieldName];
        }
    }
    appearance.characterVisualsReference = record.CharacterVisuals ?? null;
    return appearance;
}

function getPlayerAttributeSnapshot(record) {
    if (!record) return {};
    return Object.fromEntries(
        record._offsetTable
            .filter(field => field.name === "OverallRating" || field.name.endsWith("Rating"))
            .map(field => [field.name, record[field.name]])
    );
}

function getPlayerAbilitySnapshot(record) {
    if (!record) return null;
    return {
        skillPoints: record.SkillPoints ?? 0,
        experiencePoints: record.ExperiencePoints ?? 0,
        developmentTrait: record.TraitDevelopment ?? null,
        physical: PLAYER_PHYSICAL_ABILITY_RANK_FIELDS
            .filter(fieldName => Boolean(record.getFieldByKey(fieldName)))
            .map((fieldName, index) => ({
                slot: index + 1,
                field: fieldName,
                rank: record[fieldName]
            })),
        mental: PLAYER_MENTAL_ABILITY_FIELDS.map((abilityField, index) => {
            const rankField = PLAYER_MENTAL_ABILITY_RANK_FIELDS[index];
            if (!record.getFieldByKey(abilityField) || !record.getFieldByKey(rankField)) return null;
            return {
                slot: index + 1,
                ability: record[abilityField],
                rank: record[rankField]
            };
        }).filter(Boolean)
    };
}

async function getCoachTalentTreeSnapshot(coachRecord) {
    if (!coachRecord) return null;
    const activeTree = await resolveReferenceRecord(coachRecord, "ActiveTalentTree");
    const list = activeTree
        ? await resolveReferenceRecord(activeTree, "TalentSubTreeStatusList")
        : null;
    const trees = [];

    for (let treeIndex = 0; treeIndex < COACH_TALENT_TREE_NAMES.length; treeIndex++) {
        const fieldName = `TalentSubTreeStatus${treeIndex}`;
        const subTree = list ? await resolveReferenceRecord(list, fieldName) : null;
        if (!subTree) {
            trees.push({
                treeIndex,
                treeName: COACH_TALENT_TREE_NAMES[treeIndex],
                available: false,
                unlocked: false,
                coachPointsSpent: null,
                talents: []
            });
            continue;
        }

        const talents = Array.from({ length: 33 }, (_, talentIndex) => ({
            talentIndex,
            status: subTree[`TalentStatus${talentIndex}`]
        }));
        const rootStatus = talents[0]?.status ?? "Locked";
        const state = rootStatus === "Owned"
            ? "Unlocked"
            : rootStatus === "Purchasable"
                ? "Purchasable"
                : "Locked";
        trees.push({
            treeIndex,
            treeName: COACH_TALENT_TREE_NAMES[treeIndex],
            available: true,
            state,
            rootStatus,
            unlocked: state === "Unlocked",
            purchasable: state === "Purchasable",
            locked: state === "Locked",
            coachPointsSpent: subTree.CoachPointsSpent ?? 0,
            ownedCount: talents.filter(talent => talent.status === "Owned").length,
            purchasableCount: talents.filter(talent => talent.status === "Purchasable").length,
            notOwnedCount: talents.filter(talent => talent.status === "NotOwned").length,
            lockedCount: talents.filter(talent => talent.status === "Locked").length,
            talents
        });
    }

    return {
        coachPoints: coachRecord.CoachPoints ?? 0,
        experiencePoints: coachRecord.ExperiencePoints ?? 0,
        dominantArchetype: coachRecord.DominantArchetype ?? null,
        trees
    };
}

async function getCoachTalentTreeSummary(coachRecord) {
    if (!coachRecord) return null;
    const activeTree = await resolveReferenceRecord(coachRecord, "ActiveTalentTree");
    const list = activeTree
        ? await resolveReferenceRecord(activeTree, "TalentSubTreeStatusList")
        : null;
    const trees = [];

    for (let treeIndex = 0; treeIndex < COACH_TALENT_TREE_NAMES.length; treeIndex++) {
        const fieldName = `TalentSubTreeStatus${treeIndex}`;
        const subTree = list ? await resolveReferenceRecord(list, fieldName) : null;
        if (!subTree) {
            trees.push({
                treeIndex,
                treeName: COACH_TALENT_TREE_NAMES[treeIndex],
                available: false,
                state: "Unavailable",
                unlocked: false
            });
            continue;
        }

        const rootStatus = subTree.TalentStatus0 ?? "Locked";
        const state = rootStatus === "Owned"
            ? "Unlocked"
            : rootStatus === "Purchasable"
                ? "Purchasable"
                : "Locked";
        trees.push({
            treeIndex,
            treeName: COACH_TALENT_TREE_NAMES[treeIndex],
            available: true,
            state,
            rootStatus,
            unlocked: state === "Unlocked",
            coachPointsSpent: subTree.CoachPointsSpent ?? 0
        });
    }

    return trees;
}

function getRawPlayerSummary(playerRecord) {
    if (!playerRecord || playerRecord.isEmpty) return null;

    const heightInches = playerRecord.Height ?? 0;
    const heightFeet = Math.floor(heightInches / 12);
    const remainingInches = heightInches % 12;

    return {
        playerRow: playerRecord.index,
        firstName: playerRecord.FirstName,
        lastName: playerRecord.LastName,
        displayName: `${playerRecord.FirstName} ${playerRecord.LastName}`.trim(),
        position: playerRecord.Position,
        positionDisplay: getPositionDisplay(playerRecord.Position),
        overallRating: playerRecord.OverallRating,
        jerseyNumber: playerRecord.JerseyNum,
        classYear: playerRecord.SchoolYear,
        redshirtStatus: playerRecord.RedshirtStatus,
        teamIndex: playerRecord.TeamIndex,
        teamName:
            playerRecord.TeamIndex === 255
                ? "Unassigned"
                : teamIndexToDisplayName.get(playerRecord.TeamIndex) ?? "Unassigned",
        previousTeamIndex:
            playerRecord.PrevTeamIndex !== 255
                ? playerRecord.PrevTeamIndex
                : null,
        previousTeamName:
            playerRecord.PrevTeamIndex !== 255
                ? teamIndexToDisplayName.get(playerRecord.PrevTeamIndex) ?? null
                : null,
        consecutiveYearsWithTeam: playerRecord.PLYR_CONSECYEARSWITHTEAM ?? 0,
        hometown: playerRecord.PLYR_HOME_TOWN,
        homeState: playerRecord.PLYR_HOME_STATE,
        hometownDisplay:
            playerRecord.PLYR_HOME_TOWN && playerRecord.PLYR_HOME_STATE
                ? `${playerRecord.PLYR_HOME_TOWN}, ${playerRecord.PLYR_HOME_STATE}`
                : playerRecord.PLYR_HOME_TOWN || playerRecord.PLYR_HOME_STATE || "",
        heightInches,
        heightDisplay: heightInches > 0 ? `${heightFeet}'${remainingInches}` : "",
        weight: (playerRecord.Weight ?? 0) + 160,
        prospectStarRating: playerRecord.ProspectStarRating ?? null,
        developmentTrait: playerRecord.TraitDevelopment ?? null,
        appearance: getScalarAppearanceSnapshot(
            playerRecord,
            PLAYER_APPEARANCE_FIELDS
        )
    };
}

function getTeamGradeSnapshot(teamRecord) {
    const programPointGrades = Object.fromEntries(
        Object.entries(TEAM_GRADE_FIELDS).map(([key, fieldName]) => [
            key,
            teamRecord[fieldName]
        ])
    );

    const mySchoolRecord = franchise.getReferencedRecord(teamRecord.MySchoolTrackingTable);
    const mySchoolGrades = {};
    const playingStyleGrades = {};

    if (mySchoolRecord) {
        for (const fieldName of MY_SCHOOL_GRADE_FIELDS) {
            if (mySchoolRecord.getFieldByKey(fieldName)) {
                mySchoolGrades[fieldName] = mySchoolRecord[fieldName];
            }
        }

        const playingStyleRecord = franchise.getReferencedRecord(
            mySchoolRecord.PlayingStyleGradeByPlayerTypeTable
        );
        if (playingStyleRecord) {
            for (const field of playingStyleRecord._offsetTable) {
                if (field.type === "LetterGrade") {
                    playingStyleGrades[field.name] = playingStyleRecord[field.name];
                }
            }
        }
    }

    return {
        // Legacy alias retained for current consumers.
        grades: programPointGrades,
        programPointGrades,
        mySchoolGrades,
        playingStyleGrades
    };
}

function getTeamSummary(teamRecord) {
    if (!teamRecord || teamRecord.isEmpty) return null;

    const gradeSnapshot = getTeamGradeSnapshot(teamRecord);

    return {
        teamRow: teamRecord.index,
        teamIndex: teamRecord.TeamIndex,
        teamName: teamRecord.DisplayName,
        nickName: teamRecord.NickName,
        assetName: teamRecord.AssetName || null,
        isTeamBuilder: Boolean(teamRecord.IsTeamBuilder),
        abbreviation:
            teamRecord.ShortName ||
            teamRecord.TEAM_PREFIX_NAME ||
            teamRecord.DisplayName,
        prestige: teamRecord.TeamPrestige,
        overallRating: teamRecord.TEAM_RATINGOVR,
        offensiveRating: teamRecord.TEAM_RATINGOFF,
        defensiveRating: teamRecord.TEAM_RATINGDEF,
        grades: gradeSnapshot.grades,
        programPointGrades: gradeSnapshot.programPointGrades,
        mySchoolGrades: gradeSnapshot.mySchoolGrades,
        playingStyleGrades: gradeSnapshot.playingStyleGrades,
        teamRank: teamRecord.TeamRank,
        conferenceStanding: teamRecord.CurSeasonConfStanding,
        wins: (teamRecord.ConfWin ?? 0) + (teamRecord.NonConfWin ?? 0),
        losses: (teamRecord.ConfLoss ?? 0) + (teamRecord.NonConfLoss ?? 0),
        conferenceWins: teamRecord.ConfWin ?? 0,
        conferenceLosses: teamRecord.ConfLoss ?? 0,
        nonConferenceWins: teamRecord.NonConfWin ?? 0,
        nonConferenceLosses: teamRecord.NonConfLoss ?? 0,
        playoffStatus: teamRecord.PlayoffStatus,
        playoffRoundReached: teamRecord.PlayoffRoundReached
    };
}

function buildRankingsData() {
    const teams = teamTable.records.filter(
        record => !record.isEmpty && record.TeamIndex !== 255
    );

    const buildPoll = (rankField, lastWeekField, pointsField, firstPlaceField) =>
        teams
            .filter(team => team[rankField] > 0 && team[rankField] <= 25)
            .sort((a, b) => a[rankField] - b[rankField])
            .map(team => ({
                rank: team[rankField],
                lastWeekRank: team[lastWeekField] ?? 255,
                pointsRaw: team[pointsField] ?? 0,
                firstPlaceVotes: team[firstPlaceField] ?? 0,
                teamIndex: team.TeamIndex,
                teamName: team.DisplayName,
                record: {
                    conferenceWins: team.ConfWin ?? 0,
                    conferenceLosses: team.ConfLoss ?? 0,
                    nonConferenceWins: team.NonConfWin ?? 0,
                    nonConferenceLosses: team.NonConfLoss ?? 0
                }
            }));

    const mediaPoll = buildPoll(
        "MediaPoll_CurrentRank",
        "MediaPoll_LastWeeksRank",
        "MediaPoll_CurrentPoints",
        "MediaPoll_FirstPlaceVotes"
    );

    return {
        mediaPoll,
        apPoll: mediaPoll,
        coachesPoll: buildPoll(
            "CoachesPoll_CurrentRank",
            "CoachesPoll_LastWeeksRank",
            "CoachesPoll_CurrentPoints",
            "CoachesPoll_FirstPlaceVotes"
        ),
        cfpPoll: buildPoll(
            "CFPPoll_CurrentRank",
            "CFPPoll_LastWeeksRank",
            "CFPPoll_CurrentPoints",
            "CFPPoll_FirstPlaceVotes"
        )
    };
}

function cleanTeamStatsRecord(teamRecord, statRecord, yearsAgo, currentSeasonIndex) {
    if (!statRecord) return null;

    const games =
        (statRecord.WINS ?? 0) +
        (statRecord.LOSSES ?? 0) +
        (statRecord.TIES ?? 0);

    return {
        teamIndex: teamRecord.TeamIndex,
        teamName: teamRecord.DisplayName,
        yearsAgo,
        seasonIndex: currentSeasonIndex - yearsAgo,
        seasonYearDisplay: dynastyStartYear + currentSeasonIndex - yearsAgo,
        wins: statRecord.WINS ?? 0,
        losses: statRecord.LOSSES ?? 0,
        ties: statRecord.TIES ?? 0,
        games,
        firstDowns: statRecord.FIRSTDOWNS ?? 0,
        totalYards: statRecord.TOTALYARDS ?? 0,
        offensiveYards: statRecord.OFFYARDS ?? 0,
        rushingYards: statRecord.OFFRUSHYARDS ?? 0,
        passingYards: statRecord.OFFPASSYARDS ?? 0,
        defensiveRushingYardsAllowed: statRecord.DEFRUSHYARDS ?? 0,
        defensivePassingYardsAllowed: statRecord.DEFPASSYARDS ?? 0,
        rushingAttempts: statRecord.RUSHATTEMPTS ?? 0,
        passAttempts: statRecord.PASSATTEMPTS ?? 0,
        passCompletions: statRecord.PASSCOMPLETIONS ?? 0,
        rushingTDs: statRecord.RUSHTDS ?? 0,
        passingTDs: statRecord.PASSTDS ?? 0,
        interceptionsThrown: statRecord.PASSINTS ?? 0,
        defensiveInterceptions: statRecord.DEFINTS ?? 0,
        sacks: statRecord.SACKS ?? 0,
        sacksAllowed: statRecord.SACKSALLOWED ?? 0,
        fumblesLost: statRecord.FUMBLESLOST ?? 0,
        fumbleRecoveries: statRecord.FUMBLEREC ?? 0,
        giveaways: statRecord.GIVEAWAYS ?? 0,
        takeaways: statRecord.TAKEAWAYS ?? 0,
        thirdDownConversions: statRecord.THIRDDOWNCONV ?? 0,
        thirdDownAttempts: statRecord.THIRDDOWNS ?? 0,
        fourthDownConversions: statRecord.FOURTHDOWNCONV ?? 0,
        fourthDownAttempts: statRecord.FOURTHDOWNS ?? 0,
        penalties: statRecord.PENALTIES ?? 0,
        penaltyYards: statRecord.PENALTYYARDS ?? 0,
        punts: statRecord.PUNTS ?? 0,
        puntYards: statRecord.PUNTYARDS ?? 0,
        kickReturnYards: statRecord.KICKRETURNYARDS ?? 0,
        puntReturnYards: statRecord.PUNTRETURNYARDS ?? 0,
        bowlsMade: statRecord.BOWLSMADE ?? 0,
        bowlsWon: statRecord.BOWLSWON ?? 0,
        cfpAppearances: statRecord.CFPSMADE ?? 0,
        cfpWins: statRecord.CFPSWON ?? 0,
        conferenceChampionshipAppearances: statRecord.CONFCHAMPSMADE ?? 0,
        conferenceChampionshipsWon: statRecord.CONFCHAMPSWON ?? 0,
        nationalChampionshipAppearances: statRecord.NATCHAMPSMADE ?? 0,
        nationalChampionshipsWon: statRecord.NATCHAMPSWON ?? 0
    };
}

async function buildTeamSeasonStatsData(currentSeasonIndex) {
    const output = [];

    for (const teamRecord of teamTable.records) {
        if (teamRecord.isEmpty || teamRecord.TeamIndex === 255) continue;

        const statsArray = await resolveReferenceRecord(teamRecord, "TeamSeasonStats");
        if (!statsArray) continue;

        const statsRecords = await resolveArrayRecords(statsArray);

        statsRecords.forEach((statRecord, index) => {
            const cleanRecord = cleanTeamStatsRecord(
                teamRecord,
                statRecord,
                index,
                currentSeasonIndex
            );
            if (cleanRecord) output.push(cleanRecord);
        });
    }

    return output;
}

function getGameLineScoreFromRecord(gameRecord) {
    return {
        home: {
            q1: gameRecord.HomeScoreQuarter1 ?? 0,
            q2: gameRecord.HomeScoreQuarter2 ?? 0,
            q3: gameRecord.HomeScoreQuarter3 ?? 0,
            q4: gameRecord.HomeScoreQuarter4 ?? 0,
            overtime: gameRecord.HomeScoreOT ?? 0,
            total: gameRecord.HomeScore ?? 0
        },
        away: {
            q1: gameRecord.AwayScoreQuarter1 ?? 0,
            q2: gameRecord.AwayScoreQuarter2 ?? 0,
            q3: gameRecord.AwayScoreQuarter3 ?? 0,
            q4: gameRecord.AwayScoreQuarter4 ?? 0,
            overtime: gameRecord.AwayScoreOT ?? 0,
            total: gameRecord.AwayScore ?? 0
        }
    };
}

async function buildScheduleData() {
    const games = [];

    for (const gameRecord of seasonGameTable.records) {
        if (gameRecord.isEmpty) continue;

        const homeTeam = franchise.getReferencedRecord(gameRecord.HomeTeam);
        const awayTeam = franchise.getReferencedRecord(gameRecord.AwayTeam);
        if (!homeTeam || !awayTeam) continue;

        let bowl = null;
        if (!isZeroReference(gameRecord.BowlGame)) {
            const bowlRecord = franchise.getReferencedRecord(gameRecord.BowlGame);
            if (bowlRecord) {
                bowl = {
                    bowlRow: bowlRecord.index,
                    name: bowlRecord.Name,
                    assetName: bowlRecord.AssetName,
                    presentationId: bowlRecord.PresentationId,
                    logoId: bowlRecord.BowlLogoId,
                    isPlayoffBowl: bowlRecord.IsPlayoffBowl,
                    playoffBracketSlot: bowlRecord.PlayoffBracketSlot,
                    shouldPlayNewYears: bowlRecord.ShouldPlayNewYears
                };
            }
        }

        const isFinal = ["HomeWon", "AwayWon", "Tie"].includes(
            gameRecord.GameStatus
        );

        games.push({
            seasonGameRow: gameRecord.index,
            seasonGameReference:
                seasonGameTable.getBinaryReferenceToRecord(gameRecord.index),
            seasonIndex: gameRecord.SeasonYear,
            seasonYearDisplay: dynastyStartYear + gameRecord.SeasonYear,
            week: gameRecord.SeasonWeek,
            weekType: gameRecord.SeasonWeekType,
            gameNumber: gameRecord.SeasonGameNum,
            gameStatus: gameRecord.GameStatus,
            homeTeamIndex: homeTeam.TeamIndex,
            homeTeamName: homeTeam.DisplayName,
            awayTeamIndex: awayTeam.TeamIndex,
            awayTeamName: awayTeam.DisplayName,
            homeScore: isFinal ? gameRecord.HomeScore : null,
            awayScore: isFinal ? gameRecord.AwayScore : null,
            lineScore: isFinal ? getGameLineScoreFromRecord(gameRecord) : null,
            dayOfWeek: gameRecord.DayOfWeek,
            gameDateMonth: gameRecord.GameDateMonth,
            gameDateDay: gameRecord.GameDateDay,
            timeOfDay: gameRecord.TimeOfDay,
            broadcastNetwork: gameRecord.BroadcastNetwork,
            stadium: gameRecord.Stadium,
            isGameOfTheWeek: gameRecord.IsGameOfTheWeek,
            newYearsFlag: gameRecord.NewYearsFlag,
            bowl
        });
    }

    return games.sort(
        (a, b) =>
            a.seasonIndex - b.seasonIndex ||
            a.week - b.week ||
            a.gameNumber - b.gameNumber
    );
}

async function buildTeamHistoryData() {
    const programs = [];
    const seasons = [];

    for (const teamRecord of teamTable.records) {
        if (teamRecord.isEmpty || teamRecord.TeamIndex === 255) continue;

        const historicalRecord = await resolveReferenceRecord(
            teamRecord,
            "TeamHistoricalData"
        );

        if (historicalRecord) {
            programs.push({
                teamIndex: teamRecord.TeamIndex,
                teamName: teamRecord.DisplayName,
                wins: historicalRecord.Wins ?? 0,
                losses: historicalRecord.Losses ?? 0,
                ties: historicalRecord.Ties ?? 0,
                homeWins: historicalRecord.HomeWins ?? 0,
                homeLosses: historicalRecord.HomeLosses ?? 0,
                longestHomeWinStreak: historicalRecord.LongestHomeWinStreak ?? 0,
                currentHomeWinStreak: historicalRecord.CurrentHomeWinStreak ?? 0,
                rivalryWins: historicalRecord.RivalryWins ?? 0,
                rivalryLosses: historicalRecord.RivalryLosses ?? 0,
                bowlsMade: historicalRecord.BowlsMade ?? 0,
                bowlsWon: historicalRecord.BowlsWon ?? 0,
                newYearsSixMade: historicalRecord.NY6BowlsMade ?? 0,
                newYearsSixWon: historicalRecord.NY6BowlsWon ?? 0,
                cfpAppearances: historicalRecord.CFPSMade ?? 0,
                cfpWins: historicalRecord.CFPSWon ?? 0,
                conferenceChampionshipAppearances:
                    historicalRecord.ConferenceChampionshipsMade ?? 0,
                conferenceChampionshipsWon:
                    historicalRecord.ConferenceChampionshipsWon ?? 0,
                nationalChampionshipAppearances:
                    historicalRecord.NationalChampionshipsMade ?? 0,
                nationalChampionshipsWon:
                    historicalRecord.NationalChampionshipsWon ?? 0,
                heismanWinners: historicalRecord.HeismanWinners ?? 0,
                playersDrafted: historicalRecord.PlayersDrafted ?? 0,
                allAmericans: historicalRecord.AllAmericans1stAnd2nd ?? 0,
                weeksRankedTop25: historicalRecord.WeeksRankedTop25InMediaPoll ?? 0
            });
        }

        const historyArray = await resolveReferenceRecord(teamRecord, "TeamSeriesHistory");
        if (!historyArray) continue;

        const historyRecords = await resolveArrayRecords(historyArray);

        for (const historyRecord of historyRecords) {
            seasons.push({
                teamIndex: teamRecord.TeamIndex,
                teamName: teamRecord.DisplayName,
                year: historyRecord.Year,
                coachName: historyRecord.CoachName,
                conferenceName: historyRecord.ConferenceName,
                wins: historyRecord.Wins ?? 0,
                losses: historyRecord.Losses ?? 0,
                ties: historyRecord.Ties ?? 0,
                conferenceWins: historyRecord.ConferenceWins ?? 0,
                conferenceLosses: historyRecord.ConferenceLosses ?? 0,
                conferenceTies: historyRecord.ConferenceTies ?? 0,
                finalMediaRank: historyRecord.FinalMediaRank,
                finalConferenceStanding: historyRecord.FinalConferenceStanding,
                firstRoundCfpResult: historyRecord.FirstRoundCFPBowlGameResult,
                quarterFinalResult: historyRecord.QuarterFinalsBowlGameResult,
                semiFinalResult: historyRecord.SemiFinalsBowlGameResult,
                nationalChampionshipResult: historyRecord.NationalBowlGameResult
            });
        }
    }

    return { programs, seasons };
}

async function buildDepthChartData() {
    const depthCharts = [];

    for (const teamRecord of teamTable.records) {
        if (teamRecord.isEmpty || teamRecord.TeamIndex === 255) continue;

        const depthChartRecord = await resolveReferenceRecord(teamRecord, "DepthChart");
        if (!depthChartRecord) continue;

        const positions = {};

        for (const field of depthChartRecord._offsetTable) {
            if (field.name === "LockedEntries") continue;

            const playerArray = await resolveReferenceRecord(
                depthChartRecord,
                field.name
            );
            if (!playerArray) continue;

            const playerRecords = await resolveArrayRecords(playerArray);
            const players = playerRecords
                .filter(player => player.TeamIndex === teamRecord.TeamIndex)
                .map((player, index) => ({
                    depth: index + 1,
                    ...getRawPlayerSummary(player)
                }));

            if (players.length > 0) positions[field.name] = players;
        }

        depthCharts.push({
            teamIndex: teamRecord.TeamIndex,
            teamName: teamRecord.DisplayName,
            positions
        });
    }

    return depthCharts;
}

async function buildCoachData(teamRecord, coachRecord, role) {
    if (
        !coachRecord ||
        coachRecord.isEmpty ||
        !coachRecord.FirstName ||
        !coachRecord.LastName ||
        coachRecord.Position === "NumCollegeCoaches"
    ) {
        return null;
    }

    const seasonStats = await resolveReferenceRecord(coachRecord, "SeasonStats");
    const careerStats = await resolveReferenceRecord(coachRecord, "CareerStats");

    return {
        coachRow: coachRecord.index,
        role,
        firstName: coachRecord.FirstName,
        lastName: coachRecord.LastName,
        displayName: `${coachRecord.FirstName} ${coachRecord.LastName}`,
        identity: {
            presentationId:
                Number.isInteger(coachRecord.PresentationId) && coachRecord.PresentationId > 0
                    ? coachRecord.PresentationId
                    : null,
            assetName: coachRecord.AssetName || null,
            homeTown: coachRecord.HomeTown ?? null,
            homeState: coachRecord.HomeState ?? null,
            almaMater: coachRecord.AlmaMater ?? null
        },
        position: coachRecord.Position,
        teamIndex: teamRecord.TeamIndex,
        teamName: teamRecord.DisplayName,
        age: coachRecord.Age,
        yearsCoaching: coachRecord.YearsCoaching,
        seasonsWithTeam: coachRecord.SeasonsWithTeam,
        level: coachRecord.Level,
        coachPrestige: coachRecord.CoachPrestige,
        coachPrestigeScore: coachRecord.CoachPrestigeScore,
        coachPoints: coachRecord.CoachPoints ?? 0,
        experiencePoints: coachRecord.ExperiencePoints ?? 0,
        specialty: coachRecord.COACH_SPECIALTY,
        dominantArchetype: coachRecord.DominantArchetype,
        almaMater: coachRecord.AlmaMater,
        contractStatus: coachRecord.ContractStatus,
        contractYearsRemaining: coachRecord.ContractYearsRemaining,
        jobSecurityStatus: coachRecord.CurrentJobSecurityStatus,
        jobSecurityPercentage: coachRecord.CurrentJobSecurityPercentage,
        isUserControlled: coachRecord.IsUserControlled,
        appearance: getScalarAppearanceSnapshot(
            coachRecord,
            COACH_APPEARANCE_FIELDS
        ),
        seasonStats: seasonStats
            ? {
                wins: seasonStats.Wins ?? 0,
                losses: seasonStats.Losses ?? 0
            }
            : null,
        careerStats: careerStats
            ? {
                wins: careerStats.Wins ?? 0,
                losses: careerStats.Losses ?? 0,
                winsAtCurrentSchool: careerStats.WinsAtCurrentSchool ?? 0,
                lossesAtCurrentSchool: careerStats.LossesAtCurrentSchool ?? 0,
                playoffWins: careerStats.PlayoffWins ?? 0,
                playoffLosses: careerStats.PlayoffLosses ?? 0,
                bowlWins: careerStats.BowlWins ?? 0,
                bowlLosses: careerStats.BowlLosses ?? 0,
                conferenceChampionshipWins: careerStats.ConfChampWins ?? 0,
                conferenceChampionshipLosses: careerStats.ConfChampLosses ?? 0,
                nationalChampionshipWins: careerStats.NCWins ?? 0,
                nationalChampionshipLosses: careerStats.NCLosses ?? 0,
                top25Wins: careerStats.Top25Wins ?? 0,
                top25Losses: careerStats.Top25Losses ?? 0,
                rivalryWins: careerStats.RivalWins ?? 0,
                rivalryLosses: careerStats.RivalLosses ?? 0,
                draftPicks: careerStats.DraftPicks ?? 0,
                firstRoundDraftPicks: careerStats.FirstRoundDraftPicks ?? 0,
                timesFired: careerStats.TimesFired ?? 0,
                playersMaxProgressed: careerStats.PlayersMaxProgressed ?? 0,
                prestigeIncreases: careerStats.NumPrestigeIncreases ?? 0,
                top5RecruitingClasses: careerStats.Top5RecruitClasses ?? 0,
                rivalryWinStreak: careerStats.RivalWinStreak ?? 0,
                conferenceChampionshipWinStreak:
                    careerStats.ConfChampWinStreak ?? 0,
                recentNationalChampionshipYearOffset:
                    careerStats.RecentYearNCWon ?? null
            }
            : null
    };
}

function buildAllCoachData() {
    const coachRecords = coachTable.records.filter(coachRecord =>
        !coachRecord.isEmpty &&
        coachRecord.FirstName &&
        coachRecord.LastName &&
        coachRecord.Position !== "NumCollegeCoaches"
    );

    return coachRecords.map(coachRecord => ({
            coachRow: coachRecord.index,
            firstName: coachRecord.FirstName,
            lastName: coachRecord.LastName,
            displayName: `${coachRecord.FirstName} ${coachRecord.LastName}`.trim(),
            identity: {
                presentationId:
                    Number.isInteger(coachRecord.PresentationId) && coachRecord.PresentationId > 0
                        ? coachRecord.PresentationId
                        : null,
                assetName: coachRecord.AssetName || null,
                homeTown: coachRecord.HomeTown ?? null,
                homeState: coachRecord.HomeState ?? null,
                almaMater: coachRecord.AlmaMater ?? null
            },
            position: coachRecord.Position,
            teamIndex: coachRecord.TeamIndex,
            teamName:
                coachRecord.TeamIndex === 255
                    ? "Unassigned"
                    : teamIndexToDisplayName.get(coachRecord.TeamIndex) ?? "Unknown",
            age: coachRecord.Age,
            yearsCoaching: coachRecord.YearsCoaching,
            seasonsWithTeam: coachRecord.SeasonsWithTeam,
            level: coachRecord.Level,
            coachPrestige: coachRecord.CoachPrestige,
            coachPrestigeScore: coachRecord.CoachPrestigeScore,
            coachPoints: coachRecord.CoachPoints ?? 0,
            experiencePoints: coachRecord.ExperiencePoints ?? 0,
            specialty: coachRecord.COACH_SPECIALTY,
            dominantArchetype: coachRecord.DominantArchetype,
            almaMater: coachRecord.AlmaMater,
            contractStatus: coachRecord.ContractStatus,
            contractYearsRemaining: coachRecord.ContractYearsRemaining,
            jobSecurityStatus: coachRecord.CurrentJobSecurityStatus,
            jobSecurityPercentage: coachRecord.CurrentJobSecurityPercentage,
            isUserControlled: coachRecord.IsUserControlled,
            appearance: getScalarAppearanceSnapshot(
                coachRecord,
                COACH_APPEARANCE_FIELDS
            )
        }));
}

async function buildCoachingData() {
    const staff = [];
    const roleFields = [
        ["HeadCoach", "Head Coach"],
        ["OffensiveCoordinator", "Offensive Coordinator"],
        ["DefensiveCoordinator", "Defensive Coordinator"],
        ["SpecialTeamsCoach", "Special Teams Coach"]
    ];

    for (const teamRecord of teamTable.records) {
        if (teamRecord.isEmpty || teamRecord.TeamIndex === 255) continue;

        const coaches = [];

        for (const [fieldName, role] of roleFields) {
            const coachRecord = await resolveReferenceRecord(teamRecord, fieldName);
            const cleanCoach = await buildCoachData(teamRecord, coachRecord, role);
            if (cleanCoach) coaches.push(cleanCoach);
        }

        staff.push({
            teamIndex: teamRecord.TeamIndex,
            teamName: teamRecord.DisplayName,
            coaches
        });
    }

    return staff;
}

async function buildRecruitData(recruitRecord) {
    const playerRecord = await resolveReferenceRecord(recruitRecord, "Player");
    if (!playerRecord) return null;

    const topSchoolsArray = await resolveReferenceRecord(
        recruitRecord,
        "TopSchoolsList"
    );

    const topSchools = [];
    if (topSchoolsArray) {
        const schoolRecords = await resolveArrayRecords(topSchoolsArray);
        for (const schoolRecord of schoolRecords) {
            topSchools.push({
                teamIndex: schoolRecord.TeamId,
                teamName:
                    teamIndexToDisplayName.get(schoolRecord.TeamId) ?? "Unknown",
                influence: schoolRecord.TeamInfluence ?? 0
            });
        }
    }

    return {
        recruitRow: recruitRecord.index,
        player: getRawPlayerSummary(playerRecord),
        recruitStage: recruitRecord.RecruitStage,
        recruitClass: recruitRecord.Class,
        isSigned: recruitRecord.RecruitStage === "Signed",
        isTransfer: String(recruitRecord.Class ?? "").startsWith("Transfer_"),
        isHighSchool: recruitRecord.Class === "HighSchool",
        isJuniorCollege: String(recruitRecord.Class ?? "").startsWith("JuniorCollege_"),
        transferFromTeamIndex:
            String(recruitRecord.Class ?? "").startsWith("Transfer_")
                ? (playerRecord.PrevTeamIndex !== 255 ? playerRecord.PrevTeamIndex : null)
                : null,
        transferFromTeamName:
            String(recruitRecord.Class ?? "").startsWith("Transfer_") &&
            playerRecord.PrevTeamIndex !== 255
                ? teamIndexToDisplayName.get(playerRecord.PrevTeamIndex) ?? null
                : null,
        nationalRank: recruitRecord.NationalRank,
        positionRank: recruitRecord.PositionRank,
        stateRank: recruitRecord.StateRank,
        productionGrade: recruitRecord.ProductionGrade,
        qualityModifier: recruitRecord.QualityModifier,
        totalScholarshipOffers: recruitRecord.TotalScholarshipOffers,
        commitScore: recruitRecord.CommitScore,
        alternatePosition1: recruitRecord.AlternatePosition1,
        alternatePosition2: recruitRecord.AlternatePosition2,
        topSchools
    };
}

async function buildRecruitingData() {
    const recruits = [];
    const recruitByRow = new Map();

    for (const recruitRecord of recruitTable.records) {
        if (recruitRecord.isEmpty) continue;

        const recruit = await buildRecruitData(recruitRecord);
        if (!recruit) continue;

        recruits.push(recruit);
        recruitByRow.set(recruitRecord.index, recruit);
    }

    const boards = [];
    const offers = [];
    const targetCandidatesByRecruitRow = new Map();

    for (const teamRecord of teamTable.records) {
        if (teamRecord.isEmpty || teamRecord.TeamIndex === 255) continue;

        const boardRecord = await resolveReferenceRecord(teamRecord, "RecruitingBoard");
        if (!boardRecord) continue;

        const targetArray = await resolveReferenceRecord(boardRecord, "Recruits");
        const targets = [];

        if (targetArray) {
            const targetRecords = await resolveArrayRecords(targetArray);

            for (const targetRecord of targetRecords) {
                const recruitRecord = await resolveReferenceRecord(targetRecord, "Recruit");
                if (!recruitRecord) continue;

                const recruit =
                    recruitByRow.get(recruitRecord.index) ??
                    await buildRecruitData(recruitRecord);

                const target = {
                    targetRow: targetRecord.index,
                    targetType: targetRecord._parent.name,
                    recruitRow: recruitRecord.index,
                    recruit,
                    scholarshipStatus: targetRecord.ScholarshipStatus,
                    prospectInfluenceTotal: targetRecord.ProspectInfluenceTotal ?? 0,
                    prospectInfluenceDelta: targetRecord.ProspectInfluenceDelta ?? 0,
                    prospectInfluenceLastWeek:
                        targetRecord.ProspectInfluenceTotalLastWeek ?? 0,
                    hoursSpentCurrent: targetRecord.ProspectHoursSpentCurrent ?? 0,
                    nilExpectation: targetRecord.NILExpectation ?? 0,
                    currentNilOffer: targetRecord.CurrentNILOffer ?? 0,
                    committedWeekNumber: targetRecord.CommittedWeekNumber ?? 0,
                    sendTheHouse: targetRecord.SendTheHouse ?? false,
                    contactFriendsAndFamily:
                        targetRecord.ContactFriendsAndFamily ?? false,
                    contactHighSchoolCoaches:
                        targetRecord.ContactHighSchoolCoaches ?? false,
                    searchSocialMedia: targetRecord.SearchSocialMedia ?? false,
                    visitRecruitsSchool: targetRecord.VisitRecruitsSchool ?? false,
                    isFavorite: targetRecord.IsFavorite ?? false,
                    swayPitch: targetRecord.SwayPitch
                };

                targets.push(target);

                if (!targetCandidatesByRecruitRow.has(recruitRecord.index)) {
                    targetCandidatesByRecruitRow.set(recruitRecord.index, []);
                }

                targetCandidatesByRecruitRow.get(recruitRecord.index).push({
                    teamIndex: teamRecord.TeamIndex,
                    teamName: teamRecord.DisplayName,
                    scholarshipStatus: target.scholarshipStatus,
                    influence: target.prospectInfluenceTotal,
                    committedWeekNumber: target.committedWeekNumber
                });

                if (targetRecord.ScholarshipStatus === "Offered") {
                    offers.push({
                        teamIndex: teamRecord.TeamIndex,
                        teamName: teamRecord.DisplayName,
                        recruitRow: recruitRecord.index,
                        player: recruit?.player ?? null,
                        scholarshipStatus: targetRecord.ScholarshipStatus,
                        nilOffer: targetRecord.CurrentNILOffer ?? 0,
                        influence: targetRecord.ProspectInfluenceTotal ?? 0
                    });
                }
            }
        }

        boards.push({
            teamIndex: teamRecord.TeamIndex,
            teamName: teamRecord.DisplayName,
            recruitingHoursProcessed: boardRecord.RecruitingHoursProcessed ?? 0,
            recruitingHoursTotal: boardRecord.RecruitingHoursTotal ?? 0,
            recruitingHoursAssigned: boardRecord.RecruitingHoursAssigned ?? 0,
            targets
        });
    }

    // At signing stages, the Player table can still leave incoming players
    // unassigned. Resolve a signed destination from the recruiting-board data.
    // A unique highest-influence offered school is considered resolved. If the
    // highest influence is tied, the recruit's first Top Schools entry may break
    // the tie; otherwise the destination remains explicitly unresolved.
    for (const recruit of recruits) {
        const allCandidates = targetCandidatesByRecruitRow.get(recruit.recruitRow) ?? [];
        const offeredCandidates = allCandidates.filter(
            candidate => candidate.scholarshipStatus === "Offered"
        );
        const candidates = offeredCandidates.length > 0
            ? offeredCandidates
            : allCandidates;

        recruit.destinationResolved = false;
        recruit.destinationResolution = null;
        recruit.signedTeamIndex = null;
        recruit.signedTeamName = null;
        recruit.destinationCandidates = [];

        if (!recruit.isSigned || candidates.length === 0) continue;

        const maxInfluence = Math.max(
            ...candidates.map(candidate => candidate.influence ?? 0)
        );
        const leaders = candidates.filter(
            candidate => (candidate.influence ?? 0) === maxInfluence
        );

        let winner = null;
        let resolution = null;

        if (leaders.length === 1) {
            winner = leaders[0];
            resolution = offeredCandidates.length > 0
                ? "highest_offered_influence"
                : "highest_board_influence";
        } else {
            const topSchoolIndex = recruit.topSchools?.[0]?.teamIndex;
            const topSchoolLeader = leaders.find(
                candidate => candidate.teamIndex === topSchoolIndex
            );

            if (topSchoolLeader) {
                winner = topSchoolLeader;
                resolution = "top_school_tiebreak";
            }
        }

        recruit.destinationCandidates = leaders.map(candidate => ({
            teamIndex: candidate.teamIndex,
            teamName: candidate.teamName,
            influence: candidate.influence,
            scholarshipStatus: candidate.scholarshipStatus
        }));

        if (winner) {
            recruit.destinationResolved = true;
            recruit.destinationResolution = resolution;
            recruit.signedTeamIndex = winner.teamIndex;
            recruit.signedTeamName = winner.teamName;
        } else {
            recruit.destinationResolution = "ambiguous_highest_influence";
        }
    }

    const signedRecruits = recruits.filter(recruit => recruit.isSigned);
    const signedTransfers = signedRecruits.filter(recruit => recruit.isTransfer);
    const signedHighSchool = signedRecruits.filter(recruit => recruit.isHighSchool);
    const signedJuniorCollege = signedRecruits.filter(
        recruit => recruit.isJuniorCollege
    );
    const unresolvedSignedRecruits = signedRecruits.filter(
        recruit => !recruit.destinationResolved
    );
    const unresolvedSignedTransfers = signedTransfers.filter(
        recruit => !recruit.destinationResolved
    );

    const signingClassesByTeam = {};
    for (const recruit of signedRecruits) {
        if (!recruit.destinationResolved || recruit.signedTeamIndex == null) continue;
        const key = String(recruit.signedTeamIndex);
        if (!signingClassesByTeam[key]) signingClassesByTeam[key] = [];
        signingClassesByTeam[key].push(recruit);
    }

    return {
        recruits,
        boards,
        offers,
        signedRecruits,
        signedTransfers,
        signedHighSchool,
        signedJuniorCollege,
        unresolvedSignedRecruits,
        unresolvedSignedTransfers,
        signingClassesByTeam
    };
}

async function buildCurrentAwardRankings() {
    const rootRecord = awardsTable.records.find(record => !record.isEmpty);
    if (!rootRecord) return {};

    const rankings = {};

    for (const field of rootRecord._offsetTable) {
        if (!field.name.endsWith("RankingArray")) continue;

        const rankingArray = await resolveReferenceRecord(rootRecord, field.name);
        if (!rankingArray) continue;

        const entityRecords = await resolveArrayRecords(rankingArray);
        const entries = [];

        for (let index = 0; index < entityRecords.length; index++) {
            const entity = entityRecords[index];
            const entityType = entity._parent?.name;

            if (entityType === "Player") {
                if (entity.TeamIndex === 255) continue;
                entries.push({
                    rank: index + 1,
                    entityType: "Player",
                    player: getRawPlayerSummary(entity)
                });
                continue;
            }

            if (entityType === "Coach") {
                if (entity.TeamIndex === 255) continue;
                entries.push({
                    rank: index + 1,
                    entityType: "Coach",
                    coach: {
                        coachRow: entity.index,
                        firstName: entity.FirstName,
                        lastName: entity.LastName,
                        displayName: `${entity.FirstName} ${entity.LastName}`.trim(),
                        position: entity.Position,
                        teamIndex: entity.TeamIndex,
                        teamName:
                            teamIndexToDisplayName.get(entity.TeamIndex) ??
                            "Unassigned"
                    }
                });
            }
        }

        rankings[field.name] = entries;
    }

    return rankings;
}

async function buildAwardsData() {
    const playerAwards = [];

    for (const awardRecord of playerAwardTable.records) {
        if (awardRecord.isEmpty) continue;

        const player = await resolveReferenceRecord(awardRecord, "Player");
        const team = await resolveReferenceRecord(awardRecord, "Team");
        const conference = await resolveReferenceRecord(awardRecord, "Conference");

        if (!player || !team || team.TeamIndex === 255) continue;

        playerAwards.push({
            awardRow: awardRecord.index,
            awardType: awardRecord.AwardType,
            awardScore: awardRecord.AwardScore,
            period: awardRecord.Period,
            periodIndex: awardRecord.PeriodIndex,
            position: awardRecord.Position,
            player: getRawPlayerSummary(player),
            teamIndex: team.TeamIndex,
            teamName: team.DisplayName,
            conferenceName: conference?.Name ?? null
        });
    }

    const coachAwards = [];

    for (const awardRecord of coachAwardTable.records) {
        if (awardRecord.isEmpty) continue;

        const coach = await resolveReferenceRecord(awardRecord, "Coach");
        const team = await resolveReferenceRecord(awardRecord, "Team");
        if (!coach || !team || team.TeamIndex === 255) continue;

        coachAwards.push({
            awardRow: awardRecord.index,
            awardType: awardRecord.AwardType,
            period: awardRecord.Period,
            periodIndex: awardRecord.PeriodIndex,
            coachRow: coach.index,
            coachName: `${coach.FirstName} ${coach.LastName}`,
            teamIndex: team.TeamIndex,
            teamName: team.DisplayName
        });
    }

    const heisman = [];

    for (const rankingRecord of heismanAwardRankingsTable.records) {
        if (rankingRecord.isEmpty) continue;

        const player = await resolveReferenceRecord(rankingRecord, "Player");
        const team = await resolveReferenceRecord(rankingRecord, "Team");
        if (!player || !team || team.TeamIndex === 255) continue;

        heisman.push({
            rankingRow: rankingRecord.index,
            rank: (rankingRecord.CurrentRank ?? 0) + 1,
            lastWeekRank: (rankingRecord.LastWeekRank ?? 0) + 1,
            currentRankIndex: rankingRecord.CurrentRank ?? 0,
            lastWeekRankIndex: rankingRecord.LastWeekRank ?? 0,
            player: getRawPlayerSummary(player),
            teamIndex: team.TeamIndex,
            teamName: team.DisplayName
        });
    }

    const currentSeasonPlayerAwards = playerAwards.filter(
        award => award.period === "Season" && award.periodIndex === currentSeasonIndex
    );
    const currentSeasonCoachAwards = coachAwards.filter(
        award => award.period === "Season" && award.periodIndex === currentSeasonIndex
    );
    const heismanWinner = currentSeasonPlayerAwards.find(
        award => award.awardType === "HEISMAN"
    ) ?? null;
    const currentSeasonPlayerAwardsByType = {};
    for (const award of currentSeasonPlayerAwards) {
        if (!currentSeasonPlayerAwardsByType[award.awardType]) {
            currentSeasonPlayerAwardsByType[award.awardType] = [];
        }
        currentSeasonPlayerAwardsByType[award.awardType].push(award);
    }
    const currentSeasonCoachAwardsByType = {};
    for (const award of currentSeasonCoachAwards) {
        if (!currentSeasonCoachAwardsByType[award.awardType]) {
            currentSeasonCoachAwardsByType[award.awardType] = [];
        }
        currentSeasonCoachAwardsByType[award.awardType].push(award);
    }

    return {
        playerAwards,
        coachAwards,
        heisman: heisman.sort((a, b) => a.rank - b.rank),
        currentRankings: await buildCurrentAwardRankings(),
        currentSeasonPlayerAwards,
        currentSeasonPlayerAwardsByType,
        currentSeasonCoachAwards,
        currentSeasonCoachAwardsByType,
        heismanWinner
    };
}

async function cleanLeavingPlayer(leavingRecord) {
    if (!leavingRecord || leavingRecord.isEmpty) return null;

    const player = await resolveReferenceRecord(leavingRecord, "Player");
    if (!player || player.TeamIndex === 255) return null;

    return {
        leavingRow: leavingRecord.index,
        player: getRawPlayerSummary(player),
        leaveStatus: leavingRecord.LeaveStatus,
        leaveType: leavingRecord.LeaveType,
        projectedRound: leavingRecord.ProjectRound,
        draftClassPosition: leavingRecord.DraftClassPosition,
        persuadeAttempts: leavingRecord.PersuadeAttempts ?? 0
    };
}

async function buildPlayerMovementData() {
    const leavingPlayers = [];

    for (const leavingRecord of leavingPlayerTable.records) {
        if (leavingRecord.isEmpty) continue;
        const cleanRecord = await cleanLeavingPlayer(leavingRecord);
        if (cleanRecord) leavingPlayers.push(cleanRecord);
    }

    const transferCandidates = [];
    const earlyDraft = [];
    const rootRecord = playersLeavingEndOfSeasonTable.records.find(
        record => !record.isEmpty
    );

    if (rootRecord) {
        const transferArray = await resolveReferenceRecord(
            rootRecord,
            "TransferCandidates"
        );
        const earlyDraftArray = await resolveReferenceRecord(rootRecord, "EarlyDraft");

        for (const record of await resolveArrayRecords(transferArray)) {
            const cleanRecord = await cleanLeavingPlayer(record);
            if (cleanRecord) transferCandidates.push(cleanRecord);
        }

        for (const record of await resolveArrayRecords(earlyDraftArray)) {
            const cleanRecord = await cleanLeavingPlayer(record);
            if (cleanRecord) earlyDraft.push(cleanRecord);
        }
    }

    return { leavingPlayers, transferCandidates, earlyDraft };
}


function cleanTransferRecord(playerRecord) {
    if (!playerRecord || playerRecord.isEmpty) return null;

    const currentTeamIndex = playerRecord.TeamIndex;
    const previousTeamIndex = playerRecord.PrevTeamIndex;

    if (
        currentTeamIndex === 255 ||
        previousTeamIndex === 255 ||
        currentTeamIndex === previousTeamIndex
    ) {
        return null;
    }

    const currentTeam = teamIndexToRecord.get(currentTeamIndex);
    const previousTeam = teamIndexToRecord.get(previousTeamIndex);

    if (!currentTeam || !previousTeam) return null;

    const yearsWithCurrentTeam = playerRecord.PLYR_CONSECYEARSWITHTEAM ?? 0;
    const transferSeasonIndex = Math.max(
        0,
        currentSeasonIndex - yearsWithCurrentTeam
    );

    return {
        player: getRawPlayerSummary(playerRecord),
        previousTeamIndex,
        previousTeamName: previousTeam.DisplayName,
        currentTeamIndex,
        currentTeamName: currentTeam.DisplayName,
        yearsWithCurrentTeam,
        transferSeasonIndex,
        transferSeasonYear: dynastyStartYear + transferSeasonIndex,
        isCurrentSeasonTransfer: yearsWithCurrentTeam === 0
    };
}

function buildTransferData(recruiting) {
    const knownTransfers = activePlayers
        .map(cleanTransferRecord)
        .filter(Boolean)
        .sort((a, b) => {
            if (b.transferSeasonYear !== a.transferSeasonYear) {
                return b.transferSeasonYear - a.transferSeasonYear;
            }

            return a.player.displayName.localeCompare(b.player.displayName);
        });

    const currentSeasonTransfers = knownTransfers.filter(
        transfer => transfer.isCurrentSeasonTransfer
    );

    const incomingByTeam = {};
    const outgoingByTeam = {};

    for (const transfer of currentSeasonTransfers) {
        const incomingKey = String(transfer.currentTeamIndex);
        const outgoingKey = String(transfer.previousTeamIndex);

        if (!incomingByTeam[incomingKey]) incomingByTeam[incomingKey] = [];
        if (!outgoingByTeam[outgoingKey]) outgoingByTeam[outgoingKey] = [];

        incomingByTeam[incomingKey].push(transfer);
        outgoingByTeam[outgoingKey].push(transfer);
    }

    // Portal recruiting data becomes the authoritative source for the next
    // transfer class before those players are fully assigned in the Player table.
    const portalCandidates = recruiting.recruits.filter(
        recruit => recruit.isTransfer
    );
    const signedPortalTransfers = recruiting.signedTransfers;
    const unsignedPortalTransfers = portalCandidates.filter(
        recruit => !recruit.isSigned
    );
    const portalIncomingByTeam = {};
    const portalOutgoingByTeam = {};

    for (const recruit of signedPortalTransfers) {
        if (recruit.destinationResolved && recruit.signedTeamIndex != null) {
            const destinationKey = String(recruit.signedTeamIndex);
            if (!portalIncomingByTeam[destinationKey]) {
                portalIncomingByTeam[destinationKey] = [];
            }
            portalIncomingByTeam[destinationKey].push(recruit);
        }

        if (recruit.transferFromTeamIndex != null) {
            const sourceKey = String(recruit.transferFromTeamIndex);
            if (!portalOutgoingByTeam[sourceKey]) {
                portalOutgoingByTeam[sourceKey] = [];
            }
            portalOutgoingByTeam[sourceKey].push(recruit);
        }
    }

    return {
        knownTransfers,
        currentSeasonTransfers,
        incomingByTeam,
        outgoingByTeam,
        portal: {
            candidates: portalCandidates,
            signedTransfers: signedPortalTransfers,
            unsignedTransfers: unsignedPortalTransfers,
            unresolvedSignedTransfers: recruiting.unresolvedSignedTransfers,
            incomingByTeam: portalIncomingByTeam,
            outgoingByTeam: portalOutgoingByTeam
        }
    };
}

async function buildConferenceData() {
    const conferences = [];

    for (const conferenceRecord of conferenceTable.records) {
        if (conferenceRecord.isEmpty) continue;

        const teamSlots = await resolveReferenceRecord(conferenceRecord, "TeamSlots");
        const conferenceTeams = [];

        for (const teamRecord of await resolveArrayRecords(teamSlots)) {
            if (teamRecord.TeamIndex === 255) continue;
            const team = getTeamSummary(teamRecord);
            if (team) conferenceTeams.push(team);
        }

        if (!conferenceRecord.Name && conferenceTeams.length === 0) continue;

        conferences.push({
            conferenceRow: conferenceRecord.index,
            name: conferenceRecord.Name,
            conferenceEnum: conferenceRecord.ConferenceEnum,
            assetName: conferenceRecord.AssetName,
            styleName: conferenceRecord.StyleName,
            championshipGameName: conferenceRecord.ConfChampGameName,
            championshipGameType: conferenceRecord.ChampionshipGameType,
            championshipDay: conferenceRecord.ChampionshipDay,
            championshipGameTime: conferenceRecord.ChampionshipGameTime,
            conferenceStartWeek: conferenceRecord.ConferenceStartWeek,
            conferenceGames: conferenceRecord.NumConferenceGames,
            protectedOpponents: conferenceRecord.NumProtectedOpponents,
            protectedOpponentsEnabled:
                conferenceRecord.IsProtectedOpponentsEnabled,
            teams: conferenceTeams
        });
    }

    return conferences;
}

function buildPlayoffBowlSites() {
    return playoffBowlsInfoTable.records
        .filter(record => !record.isEmpty)
        .map(record => ({
            bowlRow: record.index,
            name: record.Name,
            assetName: record.AssetName,
            presentationId: record.PresentationId,
            bowlLogoId: record.BowlLogoId,
            collegePlayoffBowlSite: record.CollegePlayOffBowlSite
        }));
}

function getCompletedGameWinner(game) {
    if (!game || !["HomeWon", "AwayWon", "Tie"].includes(game.gameStatus)) {
        return null;
    }

    if (game.gameStatus === "Tie") return null;

    const homeWon = game.gameStatus === "HomeWon";
    return {
        winner: {
            teamIndex: homeWon ? game.homeTeamIndex : game.awayTeamIndex,
            teamName: homeWon ? game.homeTeamName : game.awayTeamName,
            score: homeWon ? game.homeScore : game.awayScore
        },
        loser: {
            teamIndex: homeWon ? game.awayTeamIndex : game.homeTeamIndex,
            teamName: homeWon ? game.awayTeamName : game.homeTeamName,
            score: homeWon ? game.awayScore : game.homeScore
        }
    };
}

function buildCfpData(rankings, schedule) {
    const currentTop12 = rankings.cfpPoll.slice(0, 12);
    const playoffGames = schedule
        .filter(game => game.bowl?.isPlayoffBowl)
        .sort((a, b) =>
            (a.bowl?.playoffBracketSlot ?? 0) -
            (b.bowl?.playoffBracketSlot ?? 0)
        );

    const firstRound = playoffGames.filter(
        game => (game.bowl?.playoffBracketSlot ?? -1) >= 0 &&
            (game.bowl?.playoffBracketSlot ?? -1) <= 3
    );
    const quarterfinals = playoffGames.filter(
        game => (game.bowl?.playoffBracketSlot ?? -1) >= 4 &&
            (game.bowl?.playoffBracketSlot ?? -1) <= 7
    );
    const semifinals = playoffGames.filter(
        game => (game.bowl?.playoffBracketSlot ?? -1) >= 8 &&
            (game.bowl?.playoffBracketSlot ?? -1) <= 9
    );
    const nationalChampionship = playoffGames.find(
        game => game.bowl?.playoffBracketSlot === 10
    ) ?? null;
    const championshipResult = getCompletedGameWinner(nationalChampionship);

    return {
        currentTop12,
        playoffGames,
        rounds: {
            firstRound,
            quarterfinals,
            semifinals,
            nationalChampionship
        },
        isComplete: Boolean(championshipResult),
        nationalChampion: championshipResult?.winner ?? null,
        runnerUp: championshipResult?.loser ?? null,
        playoffBowlSites: buildPlayoffBowlSites(),
        teamStatuses: teamTable.records
            .filter(record => !record.isEmpty && record.TeamIndex !== 255)
            .map(record => ({
                teamIndex: record.TeamIndex,
                teamName: record.DisplayName,
                cfpRank: record.CFPPoll_CurrentRank,
                playoffStatus: record.PlayoffStatus,
                playoffRoundReached: record.PlayoffRoundReached,
                lastSeasonPlayoffRoundReached:
                    record.LastSeasonPlayoffRoundReached
            }))
    };
}

function buildPostseasonData(schedule, cfp, awards, rankings) {
    const currentSeasonGames = schedule.filter(
        game => game.seasonIndex === currentSeasonIndex
    );
    const conferenceChampionshipGames = currentSeasonGames.filter(
        game => game.week === 15 && !game.bowl
    );
    const bowlGames = currentSeasonGames.filter(game => Boolean(game.bowl));
    const nonPlayoffBowlGames = bowlGames.filter(
        game => !game.bowl?.isPlayoffBowl
    );

    return {
        conferenceChampionshipGames,
        bowlGames,
        nonPlayoffBowlGames,
        cfpGames: cfp.playoffGames,
        cfpRounds: cfp.rounds,
        nationalChampion: cfp.nationalChampion,
        nationalRunnerUp: cfp.runnerUp,
        cfpComplete: cfp.isComplete,
        currentSeasonPlayerAwards: awards.currentSeasonPlayerAwards,
        currentSeasonCoachAwards: awards.currentSeasonCoachAwards,
        heismanWinner: awards.heismanWinner,
        finalPollSnapshot: {
            mediaPoll: rankings.mediaPoll,
            coachesPoll: rankings.coachesPoll,
            cfpPoll: rankings.cfpPoll
        }
    };
}

// -------------------- Read Dynasty Tables --------------------
// Core Tables
const playerTable = await readTable(TABLE_IDS.Player);
const activePlayers = playerTable.records.filter(record => !record.isEmpty);
const teamTable = await readTable(TABLE_IDS.Team);
const seasonInfoTable = await readTable(TABLE_IDS.SeasonInfo);

// Season Statistics
const seasonStatsTable = await readTable(TABLE_IDS.SeasonStats);
const seasonOffensiveStatsTable = await readTable(TABLE_IDS.SeasonOffensiveStats);
const seasonDefensiveStatsTable = await readTable(TABLE_IDS.SeasonDefensiveStats);
const seasonOLineStatsTable = await readTable(TABLE_IDS.SeasonOLineStats);
const seasonKickingStatsTable = await readTable(TABLE_IDS.SeasonKickingStats);
const seasonOffensiveKPReturnStatsTable = await readTable(
    TABLE_IDS.SeasonOffensiveKPReturnStats
);
const seasonDefensiveKPReturnStatsTable = await readTable(
    TABLE_IDS.SeasonDefensiveKPReturnStats
);
const teamStatsTable = await readTable(TABLE_IDS.TeamStats);
const teamStatsArrayTable = await readTable(TABLE_IDS.TeamStatsArray);

// Game-by-Game Statistics
const gameStatsTable = await readTable(TABLE_IDS.GameStats);
const gameOffensiveStatsTable = await readTable(TABLE_IDS.GameOffensiveStats);
const gameDefensiveStatsTable = await readTable(TABLE_IDS.GameDefensiveStats);
const gameOLineStatsTable = await readTable(TABLE_IDS.GameOLineStats);
const gameKickingStatsTable = await readTable(TABLE_IDS.GameKickingStats);
const gameOffensiveKPReturnStatsTable = await readTable(
    TABLE_IDS.GameOffensiveKPReturnStats
);
const gameDefensiveKPReturnStatsTable = await readTable(
    TABLE_IDS.GameDefensiveKPReturnStats
);
const seasonGameTable = await readTable(TABLE_IDS.SeasonGame);
const bowlGameTable = await readTable(TABLE_IDS.BowlGame);

// Scoring Summaries
const scoringSummaryArrayTable = await readTable(TABLE_IDS.ScoringSummaryArray);
const scoringSummaryTable = await readTable(TABLE_IDS.ScoringSummary);

// Career Statistics
const careerOffensiveStatsTable = await readTable(TABLE_IDS.CareerOffensiveStats);
const careerDefensiveStatsTable = await readTable(TABLE_IDS.CareerDefensiveStats);
const careerOLineStatsTable = await readTable(TABLE_IDS.CareerOLineStats);
const careerKickingStatsTable = await readTable(TABLE_IDS.CareerKickingStats);
const careerOffensiveKPReturnStatsTable = await readTable(
    TABLE_IDS.CareerOffensiveKPReturnStats
);
const careerDefensiveKPReturnStatsTable = await readTable(
    TABLE_IDS.CareerDefensiveKPReturnStats
);

// Coaching
const rawCoachTable = franchise.getTableByUniqueId(TABLE_IDS.Coach);
const coachSchemaCompatibility = ensureCoachTableSchema(franchise, rawCoachTable);
const coachTable = await readTable(TABLE_IDS.Coach);
const seasonCoachStatsTable = await readTable(TABLE_IDS.SeasonCoachStats);
const careerCoachStatsTable = await readTable(TABLE_IDS.CareerCoachStats);

// Recruiting
const recruitTable = await readTable(TABLE_IDS.Recruit);
const recruitingBoardTable = await readTable(TABLE_IDS.RecruitingBoard);
const recruitTargetTable = await readTable(TABLE_IDS.RecruitTarget);
const userRecruitTargetTable = await readTable(TABLE_IDS.UserRecruitTarget);
const prospectTargetSchoolTable = await readTable(TABLE_IDS.ProspectTargetSchool);
const schoolOfferTable = await readTable(TABLE_IDS.SchoolOffer);

// Depth Charts
const depthChartTable = await readTable(TABLE_IDS.DepthChart);

// Player Movement
const leavingPlayerTable = await readTable(TABLE_IDS.LeavingPlayer);
const playersLeavingEndOfSeasonTable = await readTable(
    TABLE_IDS.PlayersLeavingEndOfSeason
);

// Awards
const playerAwardTable = await readTable(TABLE_IDS.PlayerAward);
const coachAwardTable = await readTable(TABLE_IDS.CoachAward);
const heismanAwardRankingsTable = await readTable(TABLE_IDS.HeismanAwardRankings);
const awardsTable = await readTable(TABLE_IDS.Awards);

// Program and Historical Team Data
const conferenceTable = await readTable(TABLE_IDS.Conference);
const teamHistoricalSeriesYearTable = await readTable(
    TABLE_IDS.TeamHistoricalSeriesYear
);
const mySchoolTrackingTable = await readTable(TABLE_IDS.MySchoolTrackingTable);

// My School Playing Style grades use a referenced PlayerTypeGradeTable.
const sampleMySchoolTrackingRecord = mySchoolTrackingTable.records.find(record => !record.isEmpty);
const playingStyleGradeReference = sampleMySchoolTrackingRecord?.getReferenceDataByKey(
    "PlayingStyleGradeByPlayerTypeTable"
);
if (playingStyleGradeReference?.tableId) {
    const playingStyleGradeTable = franchise.getTableById(playingStyleGradeReference.tableId);
    if (playingStyleGradeTable && !playingStyleGradeTable.recordsRead) {
        await playingStyleGradeTable.readRecords();
    }
}

// CFP / Bowl Data
const playoffBowlsInfoTable = await readTable(TABLE_IDS.PlayoffBowlsInfo);
const playoffBowlsInfoArrayTable = await readTable(TABLE_IDS.PlayoffBowlsInfoArray);

// -------------------- Team Lookups --------------------
const teamIndexToDisplayName = new Map();
const teamIndexToRecord = new Map();

for (const teamRecord of teamTable.records) {
    if (teamRecord.isEmpty || teamRecord.TeamIndex === 255) continue;

    teamIndexToDisplayName.set(teamRecord.TeamIndex, teamRecord.DisplayName);
    teamIndexToRecord.set(teamRecord.TeamIndex, teamRecord);
}

// -------------------- Current Dynasty Context --------------------
const storedSeasonGames = seasonGameTable.records.filter(record => !record.isEmpty);
const seasonInfoRecord = seasonInfoTable.records.find(record => !record.isEmpty) ?? null;
const scheduleSeasonIndex = storedSeasonGames.length > 0
    ? Math.max(...storedSeasonGames.map(record => record.SeasonYear ?? 0))
    : 0;
const currentSeasonYear = Number.isInteger(seasonInfoRecord?.CurrentSeasonYear)
    ? seasonInfoRecord.CurrentSeasonYear
    : dynastyStartYear + scheduleSeasonIndex;
const currentSeasonIndex = currentSeasonYear - dynastyStartYear;
const currentWeek = seasonInfoRecord?.CurrentWeek ?? null;
const currentWeekType = seasonInfoRecord?.CurrentWeekType ?? null;
const currentOffseasonStage = seasonInfoRecord?.CurrentOffseasonStage ?? null;

// Lifecycle checkpoint verification showed that by offseason stage 7
// (National Signing Day), new freshmen/transfers are already on the next
// season's rosters even though SeasonInfo.CurrentSeasonYear still reflects
// the season that just ended. Keep the save/import season separate from the
// effective roster season so historical player/team relationships are not
// assigned to the wrong year.
const rosterRolledToNextSeason =
    currentWeekType === "OffSeason" &&
    Number.isInteger(currentOffseasonStage) &&
    currentOffseasonStage >= 7;
const rosterSeasonIndex = currentSeasonIndex + (rosterRolledToNextSeason ? 1 : 0);
const rosterSeasonYear = dynastyStartYear + rosterSeasonIndex;

// -------------------- Transform Player Records into Clean Data --------------------
// TeamIndex 255 is shared by FCS placeholders and non-roster player records.
// Field Index intentionally excludes those records from normal FBS player/stat output.
const cleanPlayers = activePlayers
    .filter(record => record.TeamIndex !== 255)
    .map(record => {
        const heightInches = record.Height;
        const remainingInches = heightInches % 12;
        const heightFeet = Math.floor(record.Height / 12);
        const hasPreviousRedshirt = record.RedshirtStatus === "Previous";
        const seasonStats = getPlayerSeasonStats(record);
        const careerStats = getPlayerCareerStats(record);

        return {
            playerRow: record.index,
            firstName: record.FirstName,
            lastName: record.LastName,
            displayName: `${record.FirstName} ${record.LastName}`.trim(),
            hometown: record.PLYR_HOME_TOWN,
            homeState: record.PLYR_HOME_STATE,
            hometownDisplay:
                record.PLYR_HOME_TOWN && record.PLYR_HOME_STATE
                    ? `${record.PLYR_HOME_TOWN}, ${record.PLYR_HOME_STATE}`
                    : record.PLYR_HOME_TOWN || record.PLYR_HOME_STATE || "",
            identity: {
                presentationId:
                    Number.isInteger(record.PresentationId) && record.PresentationId > 0
                        ? record.PresentationId
                        : null,
                assetName: record.PLYR_ASSETNAME || null,
                birthDateRaw: record.PLYR_BIRTHDATE ?? null
            },
            overallRating: record.OverallRating,
            jerseyNumber: record.JerseyNum,
            classYear: record.SchoolYear,
            redshirtStatus: record.RedshirtStatus,
            classYearDisplay:
                hasPreviousRedshirt ? `RS ${record.SchoolYear}` : record.SchoolYear,
            position: record.Position,
            positionDisplay: getPositionDisplay(record.Position),
            teamIndex: record.TeamIndex,
            teamName: teamIndexToDisplayName.get(record.TeamIndex) ?? "Unassigned",
            previousTeamIndex:
                record.PrevTeamIndex !== 255 && record.PrevTeamIndex !== record.TeamIndex
                    ? record.PrevTeamIndex
                    : null,
            previousTeamName:
                record.PrevTeamIndex !== 255 && record.PrevTeamIndex !== record.TeamIndex
                    ? teamIndexToDisplayName.get(record.PrevTeamIndex) ?? null
                    : null,
            consecutiveYearsWithTeam: record.PLYR_CONSECYEARSWITHTEAM ?? 0,
            isTransfer:
                record.PrevTeamIndex !== 255 &&
                record.PrevTeamIndex !== record.TeamIndex &&
                teamIndexToRecord.has(record.PrevTeamIndex),
            isCurrentSeasonTransfer:
                record.PrevTeamIndex !== 255 &&
                record.PrevTeamIndex !== record.TeamIndex &&
                teamIndexToRecord.has(record.PrevTeamIndex) &&
                (record.PLYR_CONSECYEARSWITHTEAM ?? 0) === 0,
            seasonPassingStats: getSeasonPassingStats(seasonStats),
            seasonRushingStats: getSeasonRushingStats(seasonStats),
            seasonReceivingStats: getSeasonReceivingStats(seasonStats),
            seasonDefensiveStats: getSeasonDefensiveStats(seasonStats),
            seasonOLineStats: getSeasonOLineStats(seasonStats),
            seasonKickingStats: getSeasonKickingStats(seasonStats),
            seasonPuntingStats: getSeasonPuntingStats(seasonStats),
            seasonKickReturnStats: getSeasonKickReturnStats(seasonStats),
            seasonPuntReturnStats: getSeasonPuntReturnStats(seasonStats),
            careerPassingStats: getCareerPassingStats(careerStats),
            careerRushingStats: getCareerRushingStats(careerStats),
            careerReceivingStats: getCareerReceivingStats(careerStats),
            careerDefensiveStats: getCareerDefensiveStats(careerStats),
            careerOLineStats: getCareerOLineStats(careerStats),
            careerKickingStats: getCareerKickingStats(careerStats),
            careerPuntingStats: getCareerPuntingStats(careerStats),
            careerKickReturnStats: getCareerKickReturnStats(careerStats),
            careerPuntReturnStats: getCareerPuntReturnStats(careerStats),
            gameStats: getPlayerGameStats(record),
            heightInches,
            heightDisplay: `${heightFeet}'${remainingInches}`,
            weight: record.Weight + 160,
            attributes: getPlayerAttributeSnapshot(record),
            abilities: getPlayerAbilitySnapshot(record),
            appearance: getScalarAppearanceSnapshot(
                record,
                PLAYER_APPEARANCE_FIELDS
            )
        };
    });

// Public player data excludes internal raw game-stat record references.
const players = cleanPlayers.map(({ gameStats, ...player }) => player);

// -------------------- Build Team and Dynasty Data --------------------
const teams = teamTable.records
    .filter(record => !record.isEmpty && record.TeamIndex !== 255)
    .map(getTeamSummary)
    .filter(Boolean);

const rankings = buildRankingsData();
const teamSeasonStats = await buildTeamSeasonStatsData(currentSeasonIndex);
const schedule = await buildScheduleData();
const playerLinkedGameReferences = new Set(
    cleanPlayers.flatMap(player =>
        player.gameStats.map(gameStat => gameStat.seasonGameReference)
    )
);
for (const game of schedule) {
    game.playerStatsAvailable = playerLinkedGameReferences.has(
        game.seasonGameReference
    );
}
const teamHistory = await buildTeamHistoryData();
const depthCharts = await buildDepthChartData();
const coaches = buildAllCoachData();
const coaching = await buildCoachingData();
const conferences = await buildConferenceData();
const recruiting = await buildRecruitingData();
const awards = await buildAwardsData();
const playerMovement = await buildPlayerMovementData();
const transfers = buildTransferData(recruiting);
const cfp = buildCfpData(rankings, schedule);
const postseason = buildPostseasonData(schedule, cfp, awards, rankings);

// -------------------- Field Index Data Model --------------------
const fieldIndexData = {
    metadata: {
        schema: franchise.schema.meta,
        gameType: franchise.gameType,
        gameYear: franchise.gameYear,
        dynastyStartYear,
        currentSeasonIndex,
        currentSeasonYear,
        currentWeek,
        currentWeekType,
        currentOffseasonStage,
        rosterSeasonIndex,
        rosterSeasonYear,
        rosterRolledToNextSeason,
        storedSeasonGameCount: schedule.length,
        fcsPlayerStatsExcluded: true,
        coachSchemaCompatibility
    },
    players,
    teams,
    rankings,
    teamSeasonStats,
    schedule,
    teamHistory,
    depthCharts,
    coaches,
    coaching,
    conferences,
    recruiting,
    awards,
    playerMovement,
    transfers,
    cfp,
    postseason,
    editingCapabilities: {
        playerScalarEditing: true,
        playerAttributesEditing: true,
        playerClassYearEditing: true,
        playerSkillPointsEditing: true,
        playerPhysicalAbilityTierEditing: true,
        playerMentalAbilityTypeAndTierEditing: true,
        coachScalarEditing: true,
        coachPointsEditing: true,
        coachTalentTreeEditing: true,
        coachTalentNodeStatusEditing: true,
        playerScalarAppearanceEditing: true,
        coachScalarAppearanceEditing: true,
        equipmentEditing: false,
        teamGradesEditing: true,
        mySchoolGradesEditing: true,
        playingStyleGradesEditing: true,
        top25Editing: true,
        cfpUnplayedGameParticipantEditing: true
    },
    availability: {
        hasCompleteCfp: cfp.isComplete,
        hasPlayerLeavingData:
            playerMovement.leavingPlayers.length > 0 ||
            playerMovement.transferCandidates.length > 0 ||
            playerMovement.earlyDraft.length > 0,
        hasSignedTransferData: recruiting.signedTransfers.length > 0,
        unresolvedSignedRecruitDestinations:
            recruiting.unresolvedSignedRecruits.length,
        unresolvedSignedTransferDestinations:
            recruiting.unresolvedSignedTransfers.length,
        historicalPlayerRosterStable: players.length >= 10000,
        completedCurrentSeasonGamesMissingPlayerStats: schedule.filter(game =>
            game.seasonIndex === currentSeasonIndex &&
            ["HomeWon", "AwayWon", "Tie"].includes(game.gameStatus) &&
            !game.playerStatsAvailable
        ).length
    }
};

export {
    fieldIndexData,
    cleanPlayers,
    getGameBoxScoreData,
    getGameContext,
    getGameScoringSummary,
    getTeamBoxScoreStats,
    getGameLineScore
};
