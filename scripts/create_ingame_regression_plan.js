// -------------------- IN-GAME REGRESSION PLAN GENERATOR --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "assets", "mappings", "head_catalog.json");

function loadCatalog() {
    if (!fs.existsSync(catalogPath)) return { heads: [], counts: {} };
    return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
}

function buildPlan() {
    const catalog = loadCatalog();
    const usable = (catalog.heads ?? []).filter(entry => entry.profile_complete && entry.portrait_id != null);
    const unique = usable.filter(entry => entry.head_type === "unique");
    const generic = usable.filter(entry => entry.head_type === "generic");

    return {
        format: "field_index_ingame_regression_plan",
        version: 2,
        generatedAt: new Date().toISOString(),
        purpose: "Final CFB27 verification gate after backend code completion and before UI/Power BI work",
        generatorCommand: "npm run ingame:generate -- <DYNASTY-SAVE>",
        catalogStatus: {
            autoBuildSupported: true,
            usableHeads: usable.length,
            uniqueProfilesAvailable: unique.length,
            genericProfilesAvailable: generic.length
        },
        tests: [
            { id: "PLYR", area: "Player editor", verifies: ["scalar rating edit", "writer/reopen"] },
            { id: "PCLS", area: "Player editor", verifies: ["class", "redshirt"] },
            { id: "BATCH", area: "Player editor", verifies: ["multiple player edits in one save", "staging"] },
            { id: "PSKILL", area: "Player abilities", verifies: ["skill points", "experience points"] },
            { id: "PABIL", area: "Player abilities", verifies: ["physical or mental ability rank/tier"] },
            { id: "PAPPR", area: "Player appearance", verifies: ["safe scalar appearance only", "Head ID/gear preserved"] },
            { id: "DEPTH", area: "Depth chart", verifies: ["reorder", "unrelated positions preserved"] },
            { id: "COACH", area: "Coach editor", verifies: ["coach points", "coach XP"] },
            { id: "CTREE", area: "Coach talents", verifies: ["tree unlock"] },
            { id: "CNODE", area: "Coach talents", verifies: ["individual node owned/unlock status"] },
            { id: "CAPPR", area: "Coach editor", verifies: ["safe scalar coach appearance"] },
            { id: "GRADE", area: "Team editor", verifies: ["program/My School grade"] },
            { id: "POLL", area: "Rankings editor", verifies: ["CFP Top 25 reorder"] },
            { id: "CFP", area: "Postseason editor", verifies: ["existing first-round seed swap", "TeamRank + CFP rank synchronization", "SeasonGame participant synchronization", "fixed BowlGame seed-marker preservation", "completed game protection", "arbitrary team injection blocked"] },
            { id: "G2U", area: "Head ID", verifies: ["generic to unique", "portrait", "gear preservation"] },
            { id: "U2G", area: "Head ID", verifies: ["unique to generic", "portrait", "gear preservation"] },
            { id: "G2G", area: "Head ID", verifies: ["generic to generic", "portrait", "gear preservation"] },
            { id: "U2U", area: "Head ID", verifies: ["unique to unique", "portrait", "gear preservation"] },
            { id: "HMULTI", area: "Head ID", verifies: ["multiple Head ID edits in one save"] },
            { id: "BACKUP", area: "Safety", automated: true, verifies: ["source overwrite backup byte-for-byte", "round-trip reopen"] }
        ],
        globalChecks: [
            "Generated saves use short DYNASTY-FI-* filenames",
            "Every generated save loads without hanging",
            "Every generated save can be re-saved by CFB27",
            "Only the reported mutation is visible",
            "Original source save remains unchanged"
        ]
    };
}

const plan = buildPlan();
const output = path.join(root, "data", "ingame_regression_plan.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(`In-game regression plan written: ${output}`);
console.log("The save generator auto-captures Head ID profiles from the supplied save by default.");

export { buildPlan };
