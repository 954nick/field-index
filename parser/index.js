// Import Dependencies 
import Franchise from "madden-franchise";
import { fileURLToPath } from "node:url";

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

// Read Player Table
const playerTable = franchise.getTableByName("Player");
await playerTable.readRecords();
const activePlayers = playerTable.records.filter(record => !record.isEmpty);

// Read Team Table
const teamTable = franchise.getTableByUniqueId(3359508968);
await teamTable.readRecords();

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
console.log(cleanPlayers[6]);

