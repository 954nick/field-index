// -------------------- MEMORY-SAFE CFB27 REGRESSION SUITE ORCHESTRATOR --------------------

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = path.join(root, "scripts", "create_ingame_regression_saves.js");
const headCatalogPath = path.join(root, "assets", "mappings", "head_catalog.json");
const dataDirectory = path.join(root, "data");

const PLAYER_LABELS = ["PLYR", "PCLS", "BATCH", "PSKILL", "PABIL", "PAPPR", "DEPTH"];
const PROGRAM_LABELS = ["COACH", "CTREE", "CNODE", "CAPPR", "GRADE", "POLL", "CFP"];
const HEAD_LABELS = ["G2U", "U2G", "G2G", "U2U", "HMULTI"];

function usage() {
    console.log(`Field Index memory-safe in-game regression suite\n\nUsage:\n  node scripts/create_ingame_regression_suite.js "C:\\\\...\\\\DYNASTY-SAVE"\n\nOptions:\n  --output-dir <folder>\n  --no-head-auto-build\n  --skip-head-tests\n  --skip-cfp-test\n  --help\n`);
}

function parseArgs(argv) {
    const options = {
        source: null,
        outputDirectory: null,
        noHeadAutoBuild: false,
        skipHeadTests: false,
        skipCfpTest: false,
        help: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg === "--output-dir") {
            const value = argv[++index];
            if (!value) throw new Error("--output-dir requires a path");
            options.outputDirectory = value;
        } else if (arg === "--no-head-auto-build") options.noHeadAutoBuild = true;
        else if (arg === "--skip-head-tests") options.skipHeadTests = true;
        else if (arg === "--skip-cfp-test") options.skipCfpTest = true;
        else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
        else if (!options.source) options.source = arg;
        else throw new Error(`Unexpected argument: ${arg}`);
    }
    return options;
}

function cachedHeadCatalogIsUsable() {
    try {
        const payload = JSON.parse(fs.readFileSync(headCatalogPath, "utf8"));
        const heads = Array.isArray(payload.heads) ? payload.heads : [];
        const usable = heads.filter(entry => entry.profile_complete === true && entry.portrait_id !== null);
        const usableUnique = usable.filter(entry => entry.head_type === "unique").length;
        const usableGeneric = usable.filter(entry => entry.head_type === "generic").length;
        return usableUnique >= 2 && usableGeneric >= 2;
    } catch {
        return false;
    }
}

function runPhase(name, source, options = {}) {
    const reportPath = path.join(dataDirectory, `ingame_regression_${name}.json`);
    const args = [workerPath, source, "--report-path", reportPath];
    if (options.outputDirectory) args.push("--output-dir", options.outputDirectory);
    if (options.onlyLabels?.length) args.push("--only-labels", options.onlyLabels.join(","));
    if (options.skipHeadTests) args.push("--skip-head-tests");
    if (options.skipCfpTest) args.push("--skip-cfp-test");
    if (options.noHeadAutoBuild) args.push("--no-head-auto-build");
    if (options.skipBackupTest) args.push("--skip-backup-test");
    if (options.backupOnly) args.push("--backup-only");

    console.log(`\n-------------------- ${name.toUpperCase()} PHASE --------------------`);
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        stdio: "inherit",
        windowsHide: false
    });
    if (result.status !== 0) {
        throw new Error(`${name} regression phase failed with exit code ${result.status ?? "unknown"}`);
    }
    return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

function mergeReports(reports, sourcePath, outputDirectory) {
    const outputs = reports.flatMap(report => report.outputs ?? []);
    const skipped = reports.flatMap(report => report.skipped ?? []);
    const expectations = reports.flatMap(report => report.expectations ?? []);
    const headReport = reports.find(report => report.headTargets);
    const backupReport = reports.find(report => report.automatedBackupRegression?.status !== "skipped");
    const preparation = reports.map(report => report.localPreparation).filter(Boolean);

    return {
        format: "field_index_ingame_regression_report",
        version: 3,
        generatedAt: new Date().toISOString(),
        sourcePath,
        sourceWasModified: false,
        outputDirectory,
        memorySafePhases: true,
        localPreparation: preparation,
        counts: {
            generatedSaves: outputs.length,
            skippedTests: skipped.length
        },
        headTargets: headReport?.headTargets ?? null,
        automatedBackupRegression: backupReport?.automatedBackupRegression ?? { status: "skipped" },
        outputs,
        skipped,
        expectations,
        finalGlobalChecks: [
            "Every generated filename is short and begins DYNASTY-FI-",
            "Every generated save loads without hanging",
            "Every generated save can be re-saved by CFB27",
            "Only the explicitly reported edit is visible for each test",
            "Keep the untouched source save as the comparison baseline"
        ]
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help || !options.source) {
        usage();
        if (!options.help) process.exitCode = 1;
        return;
    }

    const sourcePath = path.resolve(options.source);
    if (!fs.existsSync(sourcePath)) throw new Error(`Save not found: ${sourcePath}`);
    const outputDirectory = path.resolve(options.outputDirectory ?? path.dirname(sourcePath));
    fs.mkdirSync(dataDirectory, { recursive: true });

    const programLabels = options.skipCfpTest ? PROGRAM_LABELS.filter(label => label !== "CFP") : PROGRAM_LABELS;
    const reports = [];
    reports.push(runPhase("players", sourcePath, {
        outputDirectory,
        onlyLabels: PLAYER_LABELS,
        skipHeadTests: true,
        skipCfpTest: true,
        skipBackupTest: true,
        noHeadAutoBuild: true
    }));
    reports.push(runPhase("program", sourcePath, {
        outputDirectory,
        onlyLabels: programLabels,
        skipHeadTests: true,
        skipCfpTest: options.skipCfpTest,
        skipBackupTest: true,
        noHeadAutoBuild: true
    }));

    if (!options.skipHeadTests) {
        const useCache = options.noHeadAutoBuild || cachedHeadCatalogIsUsable();
        if (useCache) console.log("\nUsing cached Head ID catalog; full Head scan is not repeated.");
        reports.push(runPhase("heads", sourcePath, {
            outputDirectory,
            onlyLabels: HEAD_LABELS,
            skipBackupTest: true,
            noHeadAutoBuild: useCache
        }));
    }

    reports.push(runPhase("backup", sourcePath, {
        outputDirectory,
        backupOnly: true,
        noHeadAutoBuild: true
    }));

    const merged = mergeReports(reports, sourcePath, outputDirectory);
    const finalReportPath = path.join(dataDirectory, "ingame_regression_report.json");
    fs.writeFileSync(finalReportPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

    console.log(`\nREGRESSION SUITE READY | generated=${merged.counts.generatedSaves} skipped=${merged.counts.skippedTests}`);
    console.log(`Automated backup regression: ${merged.automatedBackupRegression.status}`);
    console.log(`Report: ${finalReportPath}`);
    console.log("Original source save was not overwritten.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(`Regression suite failed: ${error.message}`);
        process.exit(1);
    });
}

export { cachedHeadCatalogIsUsable, mergeReports, parseArgs };
