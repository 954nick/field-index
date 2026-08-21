// -------------------- FIELD INDEX SAVE IMPORT --------------------

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import v8 from "node:v8";
import { buildFieldIndexImportSql } from "./lib/build_import_sql.js";
import { preparePregameImport } from "./lib/prepare_import.js";
import { runPsqlCommand, runPsqlFile } from "./lib/psql.js";
import { sqlInteger, sqlText } from "./lib/sql.js";
import { runMigrations } from "./migrate.js";
import { verifyDatabase } from "./verify.js";

const databaseDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.dirname(databaseDirectory);

function ensureImportHeapForCli() {
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const targetBytes = 3.5 * 1024 * 1024 * 1024;

    if (heapLimit >= targetBytes || process.env.FIELD_INDEX_IMPORT_HEAP === "1") {
        return;
    }

    const result = spawnSync(
        process.execPath,
        ["--max-old-space-size=4096", ...process.argv.slice(1)],
        {
            stdio: "inherit",
            env: {
                ...process.env,
                FIELD_INDEX_IMPORT_HEAP: "1"
            }
        }
    );

    process.exit(result.status ?? 1);
}

function parseArguments(argv) {
    const args = argv.slice(2);
    const savePath = args.find(argument => !argument.startsWith("--"));
    const options = {
        savePath,
        dynastyKey: null,
        dynastyName: null,
        dryRun: false,
        sqlOut: null,
        skipMigrations: false,
        forceReimport: false,
        skipVerify: false
    };

    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === savePath) continue;

        if (argument === "--dynasty-key") {
            options.dynastyKey = args[++index];
        } else if (argument === "--dynasty-name") {
            options.dynastyName = args[++index];
        } else if (argument === "--dry-run") {
            options.dryRun = true;
        } else if (argument === "--sql-out") {
            options.sqlOut = args[++index];
        } else if (argument === "--skip-migrations") {
            options.skipMigrations = true;
        } else if (argument === "--force-reimport") {
            options.forceReimport = true;
        } else if (argument === "--skip-verify") {
            options.skipVerify = true;
        } else if (argument.startsWith("--")) {
            throw new Error(`Unknown option: ${argument}`);
        }
    }

    if (!options.savePath) {
        throw new Error(
            "Usage: node database/import_save.js <save-path> " +
            "--dynasty-key <key> --dynasty-name <name> [--dry-run]"
        );
    }
    if (!options.dynastyKey) throw new Error("--dynasty-key is required");
    if (!options.dynastyName) throw new Error("--dynasty-name is required");
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(options.dynastyKey)) {
        throw new Error(
            "--dynasty-key must be 2-64 letters, numbers, underscores, or hyphens"
        );
    }

    return options;
}

function sha256File(filePath) {
    const hash = crypto.createHash("sha256");
    const buffer = fs.readFileSync(filePath);
    hash.update(buffer);
    return hash.digest("hex");
}

function readParserVersion() {
    const packagePath = path.join(projectDirectory, "parser", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return packageJson.version ?? "unknown";
}

async function buildModel(options) {
    const savePath = path.resolve(options.savePath);
    if (!fs.existsSync(savePath)) {
        throw new Error(`Save file not found: ${savePath}`);
    }

    const stat = fs.statSync(savePath);
    const source = {
        fileName: path.basename(savePath),
        fileHash: sha256File(savePath),
        fileSizeBytes: stat.size,
        modifiedAt: stat.mtime,
        parserVersion: readParserVersion()
    };

    // parser/index.js reads the save path from process.argv[2].
    process.argv[2] = savePath;
    const parserUrl = pathToFileURL(path.join(projectDirectory, "parser", "index.js")).href;
    const parserModule = await import(`${parserUrl}?import=${Date.now()}`);
    const {
        fieldIndexData,
        cleanPlayers,
        getTeamBoxScoreStats,
        getGameScoringSummary
    } = parserModule;

    return preparePregameImport(
        fieldIndexData,
        source,
        {
            dynastyKey: options.dynastyKey,
            dynastyName: options.dynastyName
        },
        {
            cleanPlayers,
            getTeamBoxScoreStats,
            getGameScoringSummary
        }
    );
}

function findCompletedDuplicateImport(model) {
    const result = runPsqlCommand(`
        SELECT si.import_id
        FROM dynasties AS d
        JOIN seasons AS s
          ON s.dynasty_id = d.dynasty_id
         AND s.season_index = ${sqlInteger(model.metadata.currentSeasonIndex)}
        JOIN save_imports AS si
          ON si.season_id = s.season_id
         AND si.file_hash = ${sqlText(model.source.fileHash)}
        WHERE d.dynasty_key = ${sqlText(model.dynastyKey)}
          AND EXISTS (
              SELECT 1
              FROM player_identity_observations AS pio
              WHERE pio.import_id = si.import_id
          )
        LIMIT 1;
    `);
    const importId = Number(result);
    return Number.isInteger(importId) && importId > 0 ? importId : null;
}

function printSummary(model, options) {
    console.log("\n-------------------- FIELD INDEX DATABASE IMPORT --------------------");
    console.log(`Dynasty: ${model.dynastyName} (${model.dynastyKey})`);
    console.log(
        `Save season: ${model.metadata.currentSeasonYear} ` +
        `(index ${model.metadata.currentSeasonIndex})`
    );
    console.log(
        `Roster season: ${model.metadata.rosterSeasonYear} ` +
        `(index ${model.metadata.rosterSeasonIndex})`
    );
    console.log(
        `Stage: ${model.metadata.currentWeekType ?? "Unknown"} ` +
        `week ${model.metadata.currentWeek ?? "?"}` +
        (model.metadata.currentWeekType === "OffSeason"
            ? ` / offseason stage ${model.metadata.currentOffseasonStage ?? "?"}`
            : "")
    );
    console.log(`Teams: ${model.summary.teams}`);
    console.log(`Conferences: ${model.summary.conferences}`);
    console.log(`Players: ${model.summary.players}`);
    console.log(`Coaches: ${model.summary.coaches}`);
    console.log(
        `Player identities: ${model.summary.playerPresentationIdentities} presentation / ` +
        `${model.summary.playerBioFallbackIdentities} fallback`
    );
    console.log(
        `Coach identities: ${model.summary.coachPresentationIdentities} presentation / ` +
        `${model.summary.coachRowIdentities} coach-row / ` +
        `${model.summary.coachBioFallbackIdentities} bio fallback`
    );
    console.log(`Save SHA-256: ${model.source.fileHash}`);
    console.log(`Games: ${model.summary.games} (${model.summary.completedGames} final / ${model.summary.unplayedGames} unplayed)`);
    console.log(`Games with player stats: ${model.summary.gamesWithPlayerStats}`);
    console.log(`Team box-score rows: ${model.summary.teamBoxScoreRows}`);
    console.log(`Player game stat lines: ${model.summary.playerGameStatLines}`);
    console.log(`Normalized player game facts: ${model.summary.playerGameStatFacts}`);
    console.log(`Scoring events: ${model.summary.scoringEvents}`);
    console.log(`Ranking snapshots: ${model.summary.rankingSnapshots}`);
    console.log(`Recruiting prospects: ${model.summary.recruitingProspects}`);
    console.log(`Recruiting board targets: ${model.summary.recruitingBoardTargets}`);
    console.log(`Recruiting class-ranked teams: ${model.summary.recruitingClassRankedTeams}`);
    console.log(`Depth-chart slots: ${model.summary.depthChartSlots}`);
    console.log(`Award snapshots: ${model.summary.awardSnapshots}`);
    console.log(`Coach talent trees: ${model.summary.coachTalentTrees}`);
    console.log(`Coach talent nodes: ${model.summary.coachTalentNodes}`);
    if (options.dryRun) console.log("Mode: DRY RUN (PostgreSQL was not modified)");
}

async function importSave(options) {
    if (!options.dryRun && !options.skipMigrations) {
        runMigrations();
    }

    const model = await buildModel(options);

    printSummary(model, options);

    if (!options.dryRun && !options.forceReimport) {
        const duplicateImportId = findCompletedDuplicateImport(model);
        if (duplicateImportId) {
            console.log(`Duplicate import skipped: import_id=${duplicateImportId} already contains complete extended snapshots`);
            const verification = options.skipVerify ? null : verifyDatabase();
            if (verification && !verification.passed) {
                throw new Error("Database verification failed after duplicate-import detection");
            }
            return {
                model,
                sql: null,
                executed: false,
                duplicate: true,
                importId: duplicateImportId,
                verification
            };
        }
    }

    const sql = buildFieldIndexImportSql(model);

    if (options.sqlOut) {
        const sqlOut = path.resolve(options.sqlOut);
        fs.mkdirSync(path.dirname(sqlOut), { recursive: true });
        fs.writeFileSync(sqlOut, sql, "utf8");
        console.log(`Generated SQL: ${sqlOut}`);
    }

    if (options.dryRun) {
        return { model, sql, executed: false };
    }

    const temporarySqlPath = path.join(
        os.tmpdir(),
        `field-index-import-${model.source.fileHash.slice(0, 12)}-${process.pid}.sql`
    );

    fs.writeFileSync(temporarySqlPath, sql, "utf8");
    try {
        runPsqlFile(temporarySqlPath);
    } finally {
        fs.rmSync(temporarySqlPath, { force: true });
    }

    console.log("Field Index data including game storage imported successfully");
    const verification = options.skipVerify ? null : verifyDatabase();
    if (verification && !verification.passed) {
        throw new Error("Database verification failed after import");
    }
    return { model, sql, executed: true, verification };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    ensureImportHeapForCli();
    try {
        const options = parseArguments(process.argv);
        await importSave(options);
    } catch (error) {
        console.error(`Database import failed: ${error.message}`);
        process.exit(1);
    }
}

export {
    buildModel,
    importSave,
    parseArguments
};
