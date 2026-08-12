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

// Game Box Score Helper
function getGameBoxScoreData(seasonGameReference) {
    const boxScorePlayers = [];
    const gameContext = getGameContext(seasonGameReference);
    if (!gameContext) return null;
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
    const homeDefensivePlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameDefensiveStats"));
    const awayDefensivePlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameDefensiveStats"));
    const homeOLinePlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOLineStats"));
    const awayOLinePlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOLineStats"));
    const homeKickingPlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameKickingStats"));
    const awayKickingPlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameKickingStats"));
    const homeOffensiveReturnPlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveKPReturnStats"));
    const awayOffensiveReturnPlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameOffensiveKPReturnStats"));
    const homeDefensiveReturnPlayers = homePlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameDefensiveKPReturnStats"));
    const awayDefensiveReturnPlayers = awayPlayers.filter(player => player.gameStats.some(gameStat => gameStat.statType === "GameDefensiveKPReturnStats"));
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

const boxScoreData = {
    gameContext: gameContext,
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

    // Defensive Players
    homeDefensivePlayers: homeDefensivePlayers,
    awayDefensivePlayers: awayDefensivePlayers,

    // O-Line Players
    homeOLinePlayers: homeOLinePlayers,
    awayOLinePlayers: awayOLinePlayers,

    // Kicking Players
    homeKickingPlayers: homeKickingPlayers,
    awayKickingPlayers: awayKickingPlayers,

    // Offensive Return Players
    homeOffensiveReturnPlayers: homeOffensiveReturnPlayers,
    awayOffensiveReturnPlayers: awayOffensiveReturnPlayers,

    // Defensive Return Players
    homeDefensiveReturnPlayers: homeDefensiveReturnPlayers,
    awayDefensiveReturnPlayers: awayDefensiveReturnPlayers,
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

