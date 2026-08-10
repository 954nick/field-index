// Import Dependencies 
import Franchise from "madden-franchise";

// Recieve Save-File Path 
const savePath = process.argv[2];

// Validate Save-File Path
if(!savePath) {
    console.error("No save-file path provided");
    process.exit(1);
}

// Load Dynasty Save
const franchise = await Franchise.create(savePath);

// Display Save Metadata
console.log(franchise.gameType);
console.log(franchise.gameYear);

// Validate Save Metadata 

if (franchise.gameType !== "college" || franchise.gameYear !== 27) { 
    console.error("Field Index requires a valid CFB27 Dynasty save");
    process.exit(1);
}
console.log("Dynasty save loaded successfully");
