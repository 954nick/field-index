// -------------------- MEMORY-ISOLATED HEAD ID REGRESSION SUITE --------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openFieldIndexEditor } from "../parser/editor.js";
import { chooseAvailableSafeOutputPath } from "../backend/lib/save_names.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plannerPath = path.join(root, "parser", "head_regression_plan.js");
const verifierPath = path.join(root, "parser", "verify_cfb27_save.js");
const headCatalogPath = path.join(root, "assets", "mappings", "head_catalog.json");
const defaultReportPath = path.join(root, "data", "ingame_regression_heads.json");
const HEAD_LABELS = ["G2U", "U2G", "G2G", "U2U", "HMULTI"];

function parseArgs(argv) {
    const options = {
        source: null,
        outputDirectory: null,
        reportPath: defaultReportPath,
        workerCase: false,
        planPath: null,
        caseReportPath: null,
        label: null,
        genericPlayerName: null,
        uniquePlayerName: null,
        g2gPlayerName: null,
        u2uPlayerName: null,
        help: false
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = () => {
            const next = argv[++index];
            if (!next) throw new Error(`${arg} requires a value`);
            return next;
        };
        if (arg === "--output-dir") options.outputDirectory = value();
        else if (arg === "--report-path") options.reportPath = value();
        else if (arg === "--worker-case") options.workerCase = true;
        else if (arg === "--plan-path") options.planPath = value();
        else if (arg === "--case-report-path") options.caseReportPath = value();
        else if (arg === "--label") options.label = value().toUpperCase();
        else if (arg === "--generic-player") options.genericPlayerName = value();
        else if (arg === "--unique-player") options.uniquePlayerName = value();
        else if (arg === "--g2g-player") options.g2gPlayerName = value();
        else if (arg === "--u2u-player") options.u2uPlayerName = value();
        else if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
        else if (!options.source) options.source = arg;
        else throw new Error(`Unexpected argument: ${arg}`);
    }
    return options;
}

function usage() {
    console.log(`Field Index Head ID regression suite\n\nUsage:\n  node scripts/create_head_regression_suite.js "C:\\\\...\\\\DYNASTY-SAVE"\n\nOptions:\n  --output-dir <folder>\n  --report-path <file>\n`);
}

function spawnScript(scriptPath, args) {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: root,
        stdio: "inherit",
        windowsHide: false
    });
    if (result.status !== 0) {
        throw new Error(`${path.basename(scriptPath)} failed with exit code ${result.status ?? "unknown"}`);
    }
}

async function runCase(sourcePath, outputDirectory, planPath, label, caseReportPath) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    if (!HEAD_LABELS.includes(label)) throw new Error(`Unknown Head regression label: ${label}`);

    const operations = [];
    if (label === "HMULTI") {
        if (!plan.genericSource || !plan.uniqueSource || !plan.destinations.G2U || !plan.destinations.U2G) {
            throw new Error("HMULTI requires both cross-type source/destination pairs");
        }
        operations.push(
            { source: plan.genericSource, destination: plan.destinations.G2U },
            { source: plan.uniqueSource, destination: plan.destinations.U2G }
        );
    } else {
        const source = label.startsWith("G") ? plan.genericSource : plan.uniqueSource;
        const destination = plan.destinations[label];
        if (!source || !destination) throw new Error(`No safe source/destination pair for ${label}`);
        operations.push({ source, destination });
    }

    const editor = await openFieldIndexEditor(sourcePath);
    const changes = [];
    for (const operation of operations) {
        changes.push({
            target: operation.source.displayName,
            playerRow: operation.source.playerRow,
            from: operation.source.canonicalKey,
            to: operation.destination.canonicalKey,
            destinationDisplayHint: operation.destination.displayHint,
            result: await editor.setPlayerHeadId(operation.source.playerRow, operation.destination.canonicalKey)
        });
    }

    const outputPath = chooseAvailableSafeOutputPath(sourcePath, {
        directory: outputDirectory,
        purpose: label
    });

    // Verification is isolated into a separate process after this editor worker
    // exits so a real dynasty edit never needs two full franchise objects alive.
    const commit = await editor.commit({ outputPath, verify: false });
    const report = {
        label,
        status: "created",
        outputPath,
        changes: label === "HMULTI" ? changes : changes[0],
        writer: commit,
        verification: null
    };
    fs.writeFileSync(caseReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`CREATED ${label}: ${outputPath}`);
}

async function orchestrate(sourcePath, outputDirectory, reportPath, fixtureOptions = {}) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "field-index-head-regression-"));
    const planPath = path.join(tempRoot, "plan.json");
    const outputs = [];
    const skipped = [];
    try {
        const plannerArgs = [sourcePath, headCatalogPath, planPath];
        if (fixtureOptions.genericPlayerName) plannerArgs.push("--generic-player", fixtureOptions.genericPlayerName);
        if (fixtureOptions.uniquePlayerName) plannerArgs.push("--unique-player", fixtureOptions.uniquePlayerName);
        if (fixtureOptions.g2gPlayerName) plannerArgs.push("--g2g-player", fixtureOptions.g2gPlayerName);
        if (fixtureOptions.u2uPlayerName) plannerArgs.push("--u2u-player", fixtureOptions.u2uPlayerName);
        spawnScript(plannerPath, plannerArgs);
        const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));

        for (const label of HEAD_LABELS) {
            const caseReportPath = path.join(tempRoot, `${label}.json`);
            const verificationPath = path.join(tempRoot, `${label}.verification.json`);
            try {
                spawnScript(fileURLToPath(import.meta.url), [
                    sourcePath,
                    "--worker-case",
                    "--plan-path", planPath,
                    "--label", label,
                    "--output-dir", outputDirectory,
                    "--case-report-path", caseReportPath
                ]);
                const result = JSON.parse(fs.readFileSync(caseReportPath, "utf8"));
                spawnScript(verifierPath, [result.outputPath, verificationPath]);
                result.verification = JSON.parse(fs.readFileSync(verificationPath, "utf8"));
                fs.writeFileSync(caseReportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
                outputs.push(result);
            } catch (error) {
                skipped.push({ label, reason: error.message });
                console.warn(`SKIPPED ${label}: ${error.message}`);
            }
        }

        const headChecks = [
            "3D head matches destination Head ID",
            "Portrait matches destination Head ID",
            "Helmet/facemask/sleeves/gloves/shoes/towel remain target player's original gear",
            "Body/build/height/weight/tattoos remain target player's original values",
            "Save loads normally and can be re-saved"
        ];
        const report = {
            format: "field_index_ingame_regression_report",
            version: 3,
            generatedAt: new Date().toISOString(),
            sourcePath,
            sourceWasModified: false,
            outputDirectory,
            memoryIsolatedHeadWorkers: true,
            counts: { generatedSaves: outputs.length, skippedTests: skipped.length },
            headTargets: {
                genericPlayer: plan.genericSource,
                uniquePlayer: plan.uniqueSource,
                destinations: plan.destinations,
                counts: plan.catalogCounts
            },
            automatedBackupRegression: { status: "skipped", reason: "Head-only phase" },
            outputs,
            skipped,
            expectations: outputs.map(output => ({ label: output.label, checks: headChecks })),
            finalGlobalChecks: [
                "Every generated filename is short and begins DYNASTY-FI-",
                "Every generated save loads without hanging",
                "Every generated save can be re-saved by CFB27",
                "Only Head/portrait/required skin-tone state changes; gear/body/tattoos remain the target player's own"
            ]
        };
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        console.log(`\nHead regression suite ready: generated=${outputs.length} skipped=${skipped.length}`);
        console.log(`Report: ${reportPath}`);
        console.log("Original source save was not overwritten.");
        return report;
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
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

    if (options.workerCase) {
        if (!options.planPath || !options.label || !options.caseReportPath) {
            throw new Error("--worker-case requires --plan-path, --label and --case-report-path");
        }
        await runCase(
            sourcePath,
            path.resolve(options.outputDirectory ?? path.dirname(sourcePath)),
            path.resolve(options.planPath),
            options.label,
            path.resolve(options.caseReportPath)
        );
        return;
    }

    await orchestrate(
        sourcePath,
        path.resolve(options.outputDirectory ?? path.dirname(sourcePath)),
        path.resolve(options.reportPath),
        {
            genericPlayerName: options.genericPlayerName,
            uniquePlayerName: options.uniquePlayerName,
            g2gPlayerName: options.g2gPlayerName,
            u2uPlayerName: options.u2uPlayerName
        }
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(`Head regression suite failed: ${error.message}`);
        process.exit(1);
    });
}

export { orchestrate, parseArgs };
