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
console.log("Dynasty save loaded successfully.");