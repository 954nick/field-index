// Import Dependencies 
import Franchise from "madden-franchise";
import { fileURLToPath } from "node:url";
import { TABLE_IDS } from "./table_ids.js"

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
function getPlayerSeasonStats(player){
    const seasonStatsReference = player.getReferenceDataByKey("SeasonStats")
    if (seasonStatsReference.tableId === 0) return [];
    const playerSeasonStats = seasonStatsTable.records[seasonStatsReference.rowNumber];
    const seasonStats = [];
    for (let i = 0; i < playerSeasonStats.arraySize; i++) {
        const fieldName = `SeasonStats${i}`;
        const statReference = playerSeasonStats.getReferenceDataByKey(fieldName);
        if (!statReference || statReference.tableID === 0) continue;
        const statRecord = franchise.getReferencedRecord(playerSeasonStats[fieldName]);
        if (!statRecord) continue;
        const statData = {};
        for (const field of statRecord._offsetTable) {
            statData[field.name] = statRecord[field.name];
        }
        seasonStats.push({
            seasonYear: statRecord.SEAS_YEAR,
            teamIndex: statRecord.YEARBYYEARTEAMINDEX,
            statType: statRecord._parent.name,
            stats: statData
        });
    }
return seasonStats;
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
        const statData = {};
        for (const field of statRecord._offsetTable) {
            statData[field.name] = statRecord[field.name];
        }
        gameStats.push({
            statType: statRecord._parent.name,
            seasonGameReference: statRecord.SeasonGame,
            gameContext: getGameContext(statRecord.SeasonGame),
            stats: statData,
            playerTeamIndex: playerTeamRecord.TeamIndex,
            playerTeamName: playerTeamRecord.DisplayName,
            opponentTeamIndex: opposingTeamRecord.TeamIndex,
            opponentTeamName: opposingTeamRecord.DisplayName,

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

// Read Player Table
const playerTable = await readTable(TABLE_IDS.Player);
const activePlayers = playerTable.records.filter(record => !record.isEmpty);

// Read Team Table
const teamTable = await readTable(TABLE_IDS.Team);

// Read Season Stats
const seasonStatsTable = await readTable(TABLE_IDS.SeasonStats);
const seasonOffensiveStatsTable = await readTable(TABLE_IDS.SeasonOffensiveStats);
const seasonDefensiveStatsTable = await readTable(TABLE_IDS.SeasonDefensiveStats);
const seasonOLineStatsTable = await readTable(TABLE_IDS.SeasonOLineStats);
const seasonKickingStatsTable = await readTable(TABLE_IDS.SeasonKickingStats);
const seasonOffensiveKPReturnStatsTable = await readTable(TABLE_IDS.SeasonOffensiveKPReturnStats);
const seasonDefensiveKPReturnStatsTable = await readTable(TABLE_IDS.SeasonDefensiveKPReturnStats);
const teamStatsTable = await readTable(TABLE_IDS.TeamStats);

// Read Game Stats
const gameStatsTable = await readTable(TABLE_IDS.GameStats);
const gameOffensiveStatsTable = await readTable(TABLE_IDS.GameOffensiveStats);
const gameDefensiveStatsTable = await readTable(TABLE_IDS.GameDefensiveStats);
const gameOLineStatsTable = await readTable(TABLE_IDS.GameOLineStats);
const gameKickingStatsTable = await readTable(TABLE_IDS.GameKickingStats);
const gameOffensiveKPReturnStatsTable = await readTable(TABLE_IDS.GameOffensiveKPReturnStats);
const gameDefensiveKPReturnStatsTable = await readTable(TABLE_IDS.GameDefensiveKPReturnStats);
const seasonGameTable = await readTable(TABLE_IDS.SeasonGame);

// Read Scoring Summary Tables
const scoringSummaryArrayTable = await readTable(TABLE_IDS.ScoringSummaryArray);
const scoringSummaryTable = await readTable(TABLE_IDS.ScoringSummary);

// Create Team Name Lookup
const teamIndexToDisplayName = new Map();
for (const teamRecord of teamTable.records) {
    teamIndexToDisplayName.set(
        teamRecord.TeamIndex,
        teamRecord.DisplayName
    );
}

// Transform Player Records into Clean Data
const cleanPlayers = activePlayers.map(record => {
    const heightInches = record.Height;
    const remainingInches = heightInches % 12;
    const heightFeet = Math.floor(record.Height / 12);
    const hasPreviousRedshirt = record.RedshirtStatus === "Previous"; 

    return {
        playerRow: record.index,
        firstName: record.FirstName, 
        lastName: record.LastName,
        hometown: record.PLYR_HOME_TOWN,
        homeState: record.PLYR_HOME_STATE,
        hometownDisplay: `${record.PLYR_HOME_TOWN}, ${record.PLYR_HOME_STATE}`,
        overallRating: record.OverallRating,
        jerseyNumber: record.JerseyNum,
        classYear: record.SchoolYear,
        redshirtStatus: record.RedshirtStatus,
        classYearDisplay: hasPreviousRedshirt ? `RS ${record.SchoolYear}` : record.SchoolYear,
        position: record.Position,
        teamIndex: record.TeamIndex,
        teamName: teamIndexToDisplayName.get(record.TeamIndex) ?? "Unassigned",
        seasonStats: getPlayerSeasonStats(record),
        gameStats: getPlayerGameStats(record),
        heightInches: heightInches,
        heightDisplay: `${heightFeet}'${remainingInches}`,
        weight: record.Weight + 160
    };
});