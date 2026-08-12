// Import Dependencies 
import Franchise from "madden-franchise";
import { fileURLToPath } from "node:url";
import { TABLE_IDS } from "./table_ids.js"

// Locate Custom Schema Directory
const schemaDirectory = fileURLToPath(
    new URL("./schemas/", import.meta.url)
);

// Recieve Save-File Path 
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

const testPlayer = activePlayers.find(player =>
    player.getReferenceDataByKey("SeasonStats").tableId !== 0
);

const testSeasonStats = getPlayerSeasonStats(testPlayer);
console.log(testSeasonStats);

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
        heightInches: heightInches,
        heightDisplay: `${heightFeet}'${remainingInches}`,
        weight: record.Weight + 160
        
};
});
console.log(cleanPlayers[23]);

