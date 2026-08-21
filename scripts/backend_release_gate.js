// -------------------- BACKEND COMPLETION RELEASE GATE --------------------

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { BACKEND_DOMAINS, INTENTIONALLY_OUT_OF_SCOPE, PRODUCT_EXCLUSIONS } from "../backend/backend_contract.js";
import * as publicBackend from "../backend/index.js";
import { FieldIndexBackendSession } from "../backend/session.js";
import { EditSession } from "../backend/editing/edit_session.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const passes = [];

function check(condition, label, detail = "") {
    (condition ? passes : failures).push({ label, detail });
    console.log(`${condition ? "PASS" : "FAIL"} | ${label}${detail ? ` | ${detail}` : ""}`);
}

function hasMethod(prototype, name) {
    return typeof prototype?.[name] === "function";
}

for (const method of ["loadDynasty", "importDynasty", "editDynasty"]) {
    check(typeof publicBackend[method] === "function", "public backend API", method);
}

for (const [domain, definition] of Object.entries(BACKEND_DOMAINS)) {
    check(definition.status === "implemented", `${domain} contract status`);
    for (const method of definition.session ?? []) {
        check(hasMethod(FieldIndexBackendSession.prototype, method), `${domain} session API`, method);
    }
    for (const method of definition.editor ?? []) {
        check(hasMethod(EditSession.prototype, method), `${domain} edit API`, method);
    }
}

const requiredFiles = [
    "parser/schemas/C27_486_1.gz",
    "parser/coach_schema_compat.js",
    "parser/cfb27_safe_writer.js",
    "parser/coach_talents.js",
    "parser/head_catalog.js",
    "parser/build_head_catalog.js",
    "parser/build_portrait_index.js",
    "backend/services/mapping_service.js",
    "database/migrations/007_extended_dynasty_history.sql",
    "database/migrations/008_recruiting_class_rankings.sql",
    "database/migrations/009_coach_talent_history.sql",
    "assets/mappings/coach_talent_catalog.json",
    "scripts/backend_completion_audit.js",
    "docs/backend_api.md",
    "docs/backend_architecture.md",
    "docs/ingame_regression.md",
    "docs/windows_release_readiness.md"
];
for (const relative of requiredFiles) {
    check(fs.existsSync(path.join(root, relative)), "required backend file", relative);
}

const schemaDirectory = path.join(root, "parser", "schemas");
const schemaFiles = fs.readdirSync(schemaDirectory).filter(name => name.toLowerCase().endsWith(".gz"));
check(schemaFiles.length === 1 && schemaFiles[0] === "C27_486_1.gz", "single-schema policy", schemaFiles.join(", "));
try {
    const schema = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(schemaDirectory, "C27_486_1.gz")), "utf8"));
    check(Number(schema.meta?.major) === 486 && Number(schema.meta?.minor) === 1 && Number(schema.meta?.gameYear) === 27,
        "schema metadata", JSON.stringify(schema.meta));
    const coach = schema.schemas?.find(item => item.name === "Coach");
    const coachNames = new Set((coach?.attributes ?? []).map(item => item.name));
    check(coachNames.has("LeagueJobMotivation"), "canonical schema remains unmodified", "compatibility is in-memory only");
    const talentSubTree = schema.schemas?.find(item => item.name === "TalentSubTree");
    check(Boolean(talentSubTree), "coach talent definition schema", "TalentSubTree");
} catch (error) {
    check(false, "schema parse", error.message);
}

const localEnvPath = path.join(root, "database", ".env");
const gitignorePath = path.join(root, ".gitignore");
const gitignoreRules = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
    : [];
const envIgnoreRules = new Set([".env", "database/.env", "/database/.env", "**/.env"]);
const databaseEnvIgnored = gitignoreRules.some(rule => envIgnoreRules.has(rule));
const localEnvExists = fs.existsSync(localEnvPath);
check(
    !localEnvExists || databaseEnvIgnored,
    "secret exclusion policy",
    localEnvExists
        ? "database/.env exists locally and is ignored by Git; distributable packages must continue excluding it"
        : "database/.env absent from this working tree"
);
check(fs.existsSync(path.join(root, "database", ".env.example")), "database env template", "database/.env.example");

const migrationNames = fs.readdirSync(path.join(root, "database", "migrations"))
    .filter(name => /^\d{3}_.*\.sql$/.test(name))
    .sort();
check(
    migrationNames.map(name => name.slice(0, 3)).join(",") === "001,002,003,004,005,006,007,008,009",
    "migration sequence",
    migrationNames.join(", ")
);

const importSource = fs.readFileSync(path.join(root, "database", "import_save.js"), "utf8");
check(importSource.includes("verifyDatabase"), "automatic database verification after import");
check(importSource.includes("runMigrations"), "automatic database migrations before import");

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
check(Boolean(packageJson.scripts?.check), "source check script");
check(Boolean(packageJson.scripts?.test), "automated test script");
check(Boolean(packageJson.scripts?.preflight), "preflight script");
check(Boolean(packageJson.scripts?.["release:gate"]), "release gate script");
check(Boolean(packageJson.scripts?.["mapping:prepare"]), "mapping preparation script");
check(Boolean(packageJson.scripts?.["backend:audit"]), "backend completion audit script");
check(Boolean(packageJson.scripts?.["ingame:generate"]), "in-game regression generator");

console.log(`\nPRODUCT EXCLUSIONS (intentional, not incomplete):`);
for (const item of PRODUCT_EXCLUSIONS) console.log(`- ${item}`);
console.log(`\nINTENTIONALLY OUT OF BACKEND RELEASE GATE:`);
for (const item of INTENTIONALLY_OUT_OF_SCOPE) console.log(`- ${item}`);
console.log(`\nBACKEND RELEASE GATE ${failures.length ? "FAILED" : "PASSED"} | pass=${passes.length} fail=${failures.length}`);
if (failures.length) process.exit(1);
