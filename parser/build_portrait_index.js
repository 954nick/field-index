// -------------------- PLAYER PORTRAIT INDEXER --------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PARSER_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_PATH = path.resolve(
    PARSER_DIRECTORY,
    "..",
    "assets",
    "mappings",
    "player_portrait_index.json"
);
const SUPPORTED_EXTENSIONS = new Set([".dds", ".png", ".webp", ".jpg", ".jpeg"]);

function usage() {
    console.log(`Field Index player portrait indexer

Usage:
  node build_portrait_index.js "C:\\path\\to\\exported\\player_portraits"

Options:
  --output <path>   Output JSON path. Default: assets/mappings/player_portrait_index.json
  --help            Show this help.
`);
}

function parseArgs(argv) {
    const options = { root: null, output: DEFAULT_OUTPUT_PATH, help: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg === "--output") {
            const value = argv[index + 1];
            if (!value) throw new Error("--output requires a path");
            options.output = value;
            index += 1;
        } else if (!options.root) options.root = arg;
        else throw new Error(`Unknown option: ${arg}`);
    }
    return options;
}

function walkFiles(rootPath) {
    const files = [];
    const stack = [rootPath];
    while (stack.length > 0) {
        const current = stack.pop();
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const name of fs.readdirSync(current)) stack.push(path.join(current, name));
        } else if (stat.isFile()) files.push(current);
    }
    return files;
}

function portraitIdFromFilename(filename) {
    const base = path.basename(filename, path.extname(filename));
    const nilpp = base.match(/nilpp[_-]?(\d+)/i);
    if (nilpp) return Number(nilpp[1]);

    const exactNumeric = base.match(/^(\d+)$/);
    if (exactNumeric) return Number(exactNumeric[1]);

    const trailingNumeric = base.match(/(?:^|[_-])(\d{1,8})$/);
    if (trailingNumeric) return Number(trailingNumeric[1]);
    return null;
}

function normalizeRelativePath(rootPath, filePath) {
    return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function buildIndex(rootPath) {
    const byId = new Map();
    let supportedFiles = 0;
    let unmatchedFiles = 0;

    for (const filePath of walkFiles(rootPath)) {
        const extension = path.extname(filePath).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(extension)) continue;
        supportedFiles += 1;

        const portraitId = portraitIdFromFilename(filePath);
        if (!Number.isSafeInteger(portraitId) || portraitId < 0) {
            unmatchedFiles += 1;
            continue;
        }

        const relativePath = normalizeRelativePath(rootPath, filePath);
        const candidates = byId.get(portraitId) ?? [];
        candidates.push(relativePath);
        byId.set(portraitId, candidates);
    }

    const portraits = [...byId.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([portraitId, candidates]) => ({
            portrait_id: portraitId,
            asset_path: candidates.length === 1 ? candidates[0] : null,
            ambiguous: candidates.length > 1,
            candidates
        }));

    return {
        format: "field_index_player_portrait_index",
        version: 1,
        generated_at: new Date().toISOString(),
        source_root_name: path.basename(rootPath),
        filename_prefix: "nilpp",
        counts: {
            supported_files: supportedFiles,
            mapped_ids: portraits.length,
            ambiguous_ids: portraits.filter(entry => entry.ambiguous).length,
            unmatched_files: unmatchedFiles
        },
        portraits
    };
}

function writePortraitIndex(rootPath, outputPath = DEFAULT_OUTPUT_PATH) {
    const resolvedRoot = path.resolve(rootPath);
    if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
        throw new Error(`Portrait folder does not exist: ${resolvedRoot}`);
    }
    const resolvedOutput = path.resolve(outputPath);
    const index = buildIndex(resolvedRoot);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    return { outputPath: resolvedOutput, index };
}

// -------------------- MAIN --------------------
function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        return;
    }
    if (!options.root) {
        usage();
        throw new Error("Provide the exported player portrait folder");
    }

    const written = writePortraitIndex(options.root, options.output);
    console.log(`Portrait index written: ${written.outputPath}`);
    console.log(JSON.stringify(written.index.counts, null, 2));
}

const directExecution = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (directExecution) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

export {
    DEFAULT_OUTPUT_PATH,
    buildIndex as buildPortraitIndex,
    portraitIdFromFilename,
    writePortraitIndex
};
