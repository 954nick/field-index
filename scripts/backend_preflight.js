// -------------------- FIELD INDEX BACKEND PREFLIGHT --------------------
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findPsqlExecutable } from "../database/lib/psql.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = path.join(root, "parser", "schemas");
const requiredSchema = path.join(schemaDirectory, "C27_486_1.gz");
const mappingDirectory = path.join(root, "assets", "mappings");

const results = [];
function result(name, status, detail) {
    results.push({ name, status, detail });
    console.log(`${status.padEnd(4)} | ${name}${detail ? ` | ${detail}` : ""}`);
}
function pass(name, detail = "") { result(name, "PASS", detail); }
function warn(name, detail = "") { result(name, "WARN", detail); }
function fail(name, detail = "") { result(name, "FAIL", detail); }

// -------------------- NODE / PROJECT --------------------
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 20) pass("Node runtime", process.version);
else fail("Node runtime", `${process.version}; Node 20+ required for development`);

// -------------------- SINGLE CFB27 SCHEMA --------------------
if (!fs.existsSync(requiredSchema)) {
    fail("CFB27 schema", "parser/schemas/C27_486_1.gz is missing");
} else {
    try {
        const parsed = JSON.parse(zlib.gunzipSync(fs.readFileSync(requiredSchema)).toString("utf8"));
        const meta = parsed.meta ?? parsed.metadata ?? {};
        const correct = Number(meta.major) === 486 && Number(meta.minor) === 1;
        if (correct) pass("CFB27 schema", "486.1");
        else fail("CFB27 schema", `unexpected metadata ${JSON.stringify(meta)}`);
    } catch (error) {
        fail("CFB27 schema", error.message);
    }
}
const gzFiles = fs.existsSync(schemaDirectory)
    ? fs.readdirSync(schemaDirectory).filter(name => name.toLowerCase().endsWith(".gz"))
    : [];
if (gzFiles.length === 1 && gzFiles[0] === "C27_486_1.gz") pass("Schema policy", "single canonical schema only");
else fail("Schema policy", `found: ${gzFiles.join(", ") || "none"}`);

// -------------------- LIGHTWEIGHT MAPPINGS --------------------
const assetManifest = path.join(mappingDirectory, "asset_manifest.json");
if (fs.existsSync(assetManifest)) {
    const manifest = JSON.parse(fs.readFileSync(assetManifest, "utf8"));
    pass("Asset manifest", `${manifest.assets?.length ?? manifest.total_assets ?? 0} entries`);
} else warn("Asset manifest", "assets/mappings/asset_manifest.json missing");

const headCatalogPath = path.join(mappingDirectory, "head_catalog.json");
if (fs.existsSync(headCatalogPath)) {
    const catalog = JSON.parse(fs.readFileSync(headCatalogPath, "utf8"));
    const total = catalog.counts?.total ?? catalog.heads?.length ?? 0;
    const usable = catalog.counts?.usable ?? (catalog.heads ?? []).filter(entry => entry.profile_complete && entry.portrait_id != null).length;
    if (usable > 0) pass("Head ID catalog", `${total} heads, ${usable} usable`);
    else warn("Head ID catalog", `${total} heads, 0 usable; build locally from real save/Frosty data before Head ID game tests`);
} else warn("Head ID catalog", "not built yet");

const portraitIndexPath = path.join(mappingDirectory, "player_portrait_index.json");
if (fs.existsSync(portraitIndexPath)) {
    const index = JSON.parse(fs.readFileSync(portraitIndexPath, "utf8"));
    pass("Portrait index", `${index.counts?.mapped_ids ?? index.portraits?.length ?? 0} mapped portrait IDs`);
} else warn("Portrait index", "optional local index not built yet");

// -------------------- CLASSIC ZLIB WRITER RUNTIME --------------------
const pythonCandidates = process.platform === "win32"
    ? [[process.env.FIELD_INDEX_PYTHON || "py", ["-3"]], ["python", []]]
    : [[process.env.FIELD_INDEX_PYTHON || "python3", []], ["python", []]];
let zlibProbe = null;
for (const [command, prefix] of pythonCandidates) {
    const probe = spawnSync(command, [...prefix, path.join(root, "parser", "classic_zlib_compress.py"), "--probe"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) {
        zlibProbe = probe.stdout.trim();
        break;
    }
}
if (zlibProbe) pass("Classic zlib runtime", zlibProbe);
else warn("Classic zlib runtime", "development writer runtime not found; set FIELD_INDEX_ZLIB_DLL or install/use compatible classic zlib")

// -------------------- POSTGRESQL DEVELOPMENT RUNTIME --------------------
try {
    const psqlPath = findPsqlExecutable();
    const psql = spawnSync(psqlPath, ["--version"], { encoding: "utf8", windowsHide: true });
    if (!psql.error && psql.status === 0) pass("PostgreSQL client", `${psql.stdout.trim()} | ${psqlPath}`);
    else warn("PostgreSQL client", `psql was resolved at ${psqlPath}, but the version probe failed`);
} catch (error) {
    warn("PostgreSQL client", error.message);
}

// -------------------- RELEASE BOUNDARY --------------------
warn(
    "Windows release runtime",
    "not yet self-contained; final release must bundle Node/Python-free writer runtime after in-game regression passes"
);

const failures = results.filter(item => item.status === "FAIL");
console.log(`\n${failures.length === 0 ? "BACKEND PREFLIGHT PASSED" : "BACKEND PREFLIGHT FAILED"} | warnings=${results.filter(item => item.status === "WARN").length}`);
if (failures.length > 0) process.exit(1);
