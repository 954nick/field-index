// -------------------- DATABASE CONFIGURATION --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseDirectory = path.dirname(fileURLToPath(new URL("../migrate.js", import.meta.url)));

function parseEnvLine(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return null;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return null;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        value = value.slice(1, -1);
    }

    return { key, value };
}

function loadDatabaseEnv() {
    const envPath = path.join(databaseDirectory, ".env");
    if (!fs.existsSync(envPath)) return envPath;

    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        if (process.env[parsed.key] === undefined) {
            process.env[parsed.key] = parsed.value;
        }
    }

    return envPath;
}

function getDatabaseConfig() {
    const envPath = loadDatabaseEnv();

    return {
        envPath,
        connectionString:
            process.env.FIELD_INDEX_DATABASE_URL ||
            process.env.DATABASE_URL ||
            null,
        host: process.env.PGHOST || "localhost",
        port: process.env.PGPORT || "5432",
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || null,
        database: process.env.PGDATABASE || "field_index",
        psqlPath: process.env.FIELD_INDEX_PSQL || null
    };
}

export {
    databaseDirectory,
    getDatabaseConfig,
    loadDatabaseEnv
};
