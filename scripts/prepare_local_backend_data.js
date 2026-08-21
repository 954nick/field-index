// -------------------- LOCAL BACKEND DATA PREPARATION --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLocalMappings } from "../backend/local_mapping_service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
    console.log(`Field Index local backend data preparation

Usage:
  node scripts/prepare_local_backend_data.js --save "C:\\...\\DYNASTY-SAVE"

Optional local asset sources:
  --portrait-root <folder>   Exported PlayerPortraits folder (auto-detected at assets/player_portraits when present)
  --recipe-root <folder>     Exported unique/generic HeadstartRecipe root (repeatable)
  --recipe-list <file>       Text/JSON list of HeadstartRecipe paths (repeatable)
  --replace-head-catalog     Rebuild the Head ID catalog instead of merging it
  --deep-verify              Decode duplicate Head IDs and hard-fail on head-layer conflicts
  --help                     Show this help

The raw asset folders remain local. Only lightweight JSON mappings are written under assets/mappings/.
`);
}

function parseArgs(argv) {
    const options = {
        save: null,
        portraitRoot: null,
        recipeRoots: [],
        recipeLists: [],
        replaceHeadCatalog: false,
        deepVerify: false,
        help: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => {
            const next = argv[index + 1];
            if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value`);
            index += 1;
            return next;
        };
        if (arg === "--save") options.save = value();
        else if (arg === "--portrait-root") options.portraitRoot = value();
        else if (arg === "--recipe-root") options.recipeRoots.push(value());
        else if (arg === "--recipe-list") options.recipeLists.push(value());
        else if (arg === "--replace-head-catalog") options.replaceHeadCatalog = true;
        else if (arg === "--deep-verify") options.deepVerify = true;
        else if (arg === "--help" || arg === "-h") options.help = true;
        else throw new Error(`Unknown option: ${arg}`);
    }
    return options;
}

async function prepareLocalBackendData(options = {}) {
    const save = options.save ? path.resolve(options.save) : null;
    const result = await prepareLocalMappings({
        savePath: save,
        portraitRoot: options.portraitRoot ?? null,
        recipeRoots: options.recipeRoots ?? [],
        recipeLists: options.recipeLists ?? [],
        replaceHeadCatalog: options.replaceHeadCatalog === true,
        deepVerify: options.deepVerify === true
    });

    const report = {
        format: "field_index_local_backend_data_report",
        version: 2,
        generatedAt: new Date().toISOString(),
        save,
        portraitIndex: result.portraitIndex,
        headCatalog: result.headCatalog
    };
    const reportPath = path.join(root, "data", "local_backend_data_report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Local backend data preparation complete: ${reportPath}`);
    return report;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        return;
    }
    await prepareLocalBackendData(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(`Local data preparation failed: ${error.message}`);
        process.exit(1);
    });
}

export { parseArgs, prepareLocalBackendData };
