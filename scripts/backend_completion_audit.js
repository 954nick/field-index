// -------------------- FIELD INDEX BACKEND COMPLETION AUDIT --------------------

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];
const passes = [];

function pass(area, detail) { passes.push({ area, detail }); }
function warn(area, detail) { warnings.push({ area, detail }); }
function fail(area, detail) { failures.push({ area, detail }); }
function exists(relative) { return fs.existsSync(path.join(root, relative)); }
function readJson(relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }

// -------------------- REQUIRED SOURCE CONTRACT --------------------
const requiredFiles = [
    "parser/schemas/C27_486_1.gz",
    "parser/cfb27_safe_writer.js",
    "parser/coach_schema_compat.js",
    "parser/character_visuals.js",
    "parser/head_catalog.js",
    "parser/coach_talents.js",
    "backend/index.js",
    "backend/session.js",
    "backend/editing/edit_session.js",
    "backend/local_mapping_service.js",
    "database/migrations/006_analytics_layer.sql",
    "database/migrations/007_extended_dynasty_history.sql",
    "database/migrations/008_recruiting_class_rankings.sql",
    "database/migrations/009_coach_talent_history.sql",
    "assets/mappings/asset_manifest.json",
    "assets/mappings/head_catalog.json",
    "assets/mappings/coach_talent_catalog.json",
    "scripts/create_ingame_regression_saves.js",
    "scripts/prepare_local_backend_data.js"
];
for (const relative of requiredFiles) {
    if (exists(relative)) pass("required_file", relative);
    else fail("required_file", `${relative} missing`);
}

// -------------------- SCHEMA POLICY --------------------
const schemaDirectory = path.join(root, "parser", "schemas");
const schemas = fs.existsSync(schemaDirectory)
    ? fs.readdirSync(schemaDirectory).filter(name => name.toLowerCase().endsWith(".gz"))
    : [];
if (schemas.length === 1 && schemas[0] === "C27_486_1.gz") {
    const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(schemaDirectory, schemas[0]))).toString("utf8"));
    const meta = raw.meta ?? raw.metadata ?? {};
    if (Number(meta.major) === 486 && Number(meta.minor) === 1) pass("schema_policy", "single C27_486_1.gz / 486.1");
    else fail("schema_policy", `unexpected schema metadata ${JSON.stringify(meta)}`);
} else fail("schema_policy", `expected only C27_486_1.gz; found ${schemas.join(", ") || "none"}`);

// -------------------- MIGRATION CONTRACT --------------------
const migrationDirectory = path.join(root, "database", "migrations");
const migrations = fs.readdirSync(migrationDirectory).filter(name => /^\d{3}_.*\.sql$/.test(name)).sort();
const expectedMigrationNumbers = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
const actualMigrationNumbers = migrations.map(name => name.slice(0, 3));
if (JSON.stringify(actualMigrationNumbers) === JSON.stringify(expectedMigrationNumbers)) {
    pass("database_migrations", migrations.join(", "));
} else fail("database_migrations", `expected ${expectedMigrationNumbers.join(", ")}; found ${actualMigrationNumbers.join(", ")}`);

// -------------------- COACH TALENT MODEL --------------------
try {
    const catalog = readJson("assets/mappings/coach_talent_catalog.json");
    const treeCount = catalog.trees?.length ?? 0;
    const nodeCount = (catalog.trees ?? []).reduce((sum, tree) => sum + (tree.nodes?.length ?? 0), 0);
    if (treeCount === 13 && nodeCount === 429) pass("coach_talents", "13 trees / 429 authoritative TalentStatus slots");
    else fail("coach_talents", `expected 13 trees / 429 nodes; found ${treeCount} / ${nodeCount}`);
} catch (error) { fail("coach_talents", error.message); }

// -------------------- LOCAL-DATA DEPENDENCIES --------------------
try {
    const catalog = readJson("assets/mappings/head_catalog.json");
    const usable = catalog.counts?.usable ?? (catalog.heads ?? []).filter(head => head.profile_complete && head.portrait_id != null).length;
    if (usable > 0) pass("head_catalog_data", `${usable} usable profiles`);
    else warn("head_catalog_data", "0 usable profiles in repository snapshot; regression generator auto-captures profiles from the supplied local save");
} catch (error) { warn("head_catalog_data", error.message); }
if (exists("assets/mappings/player_portrait_index.json")) pass("portrait_index", "local lightweight index present");
else warn("portrait_index", "not committed; prepareLocalMappings can create it from the local portrait export when desired");

// -------------------- SOURCE PLACEHOLDER SCAN --------------------
const scanRoots = ["backend", "database", "parser", "scripts"];
const unresolved = [];
function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "__pycache__") continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (/\.(js|py|sql)$/i.test(entry.name)) {
            if (path.resolve(absolute) === path.resolve(import.meta.filename ?? fileURLToPath(import.meta.url))) continue;
            const text = fs.readFileSync(absolute, "utf8");
            if (/\bTODO\b|\bFIXME\b|NOT_IMPLEMENTED|throw new Error\(["'`]Not implemented/i.test(text)) {
                unresolved.push(path.relative(root, absolute));
            }
        }
    }
}
for (const relative of scanRoots) walk(path.join(root, relative));
if (unresolved.length === 0) pass("placeholder_scan", "no unresolved TODO/FIXME/not-implemented markers in production source");
else fail("placeholder_scan", unresolved.join(", "));

// -------------------- SANITIZATION POLICY --------------------
const gitignorePath = path.join(root, ".gitignore");
const gitignoreRules = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
    : [];
const envIgnoreRules = new Set([".env", "database/.env", "/database/.env", "**/.env"]);
if (exists("database/.env")) {
    if (gitignoreRules.some(rule => envIgnoreRules.has(rule))) {
        pass("sanitization", "database/.env is a permitted local developer secret and is ignored by Git");
    } else {
        fail("sanitization", "database/.env exists locally but is not covered by .gitignore");
    }
} else {
    pass("sanitization", "database/.env absent from this working tree");
}

const result = {
    format: "field_index_backend_completion_audit",
    version: 1,
    generatedAt: new Date().toISOString(),
    backendCodeComplete: failures.length === 0,
    passes,
    warnings,
    failures,
    externalVerificationOnly: [
        "CFB27 in-game regression suite"
    ],
    runtimeGeneratedAutomatically: [
        "PostgreSQL migrations and verification during import",
        "Head-profile catalog merge from the loaded local save",
        "Portrait index from assets/player_portraits when that local folder is present"
    ],
    intentionallyDeferred: [
        "final desktop UI",
        "actual Power BI dashboards",
        "final Windows installer/runtime bundle after UI integration"
    ]
};

const output = path.join(root, "data", "backend_completion_audit.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");

for (const item of passes) console.log(`PASS | ${item.area} | ${item.detail}`);
for (const item of warnings) console.log(`WARN | ${item.area} | ${item.detail}`);
for (const item of failures) console.log(`FAIL | ${item.area} | ${item.detail}`);
console.log(`\nBACKEND COMPLETION AUDIT ${failures.length === 0 ? "PASSED" : "FAILED"} | warnings=${warnings.length} failures=${failures.length}`);
console.log(`Report: ${output}`);
if (failures.length > 0) process.exit(1);
