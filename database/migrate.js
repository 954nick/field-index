// -------------------- FIELD INDEX DATABASE MIGRATIONS --------------------

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseConfig } from "./lib/config.js";
import { runPsqlCommand, runPsqlFile } from "./lib/psql.js";
import { sqlText } from "./lib/sql.js";

const databaseDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(databaseDirectory, "migrations");

function migrationChecksum(filePath) {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
}

function listMigrations() {
    return fs.readdirSync(migrationsDirectory)
        .filter(name => /^\d{3}_.+\.sql$/.test(name))
        .sort()
        .map(name => ({
            version: name.slice(0, 3),
            name,
            path: path.join(migrationsDirectory, name)
        }));
}

function ensureMigrationTable(config) {
    runPsqlCommand(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            migration_name TEXT NOT NULL,
            checksum CHAR(64) NOT NULL,
            apply_method TEXT NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `, { config });
}

function getAppliedMigration(version, config) {
    const result = runPsqlCommand(`
        SELECT checksum || '|' || apply_method
        FROM schema_migrations
        WHERE version = ${sqlText(version)};
    `, { config });

    if (!result) return null;
    const [checksum, applyMethod] = result.split("|");
    return { checksum, applyMethod };
}

function canBaselineInitialMigration(config) {
    const tableCount = Number(runPsqlCommand(`
        SELECT COUNT(*)
        FROM (VALUES
            ('dynasties'),
            ('teams'),
            ('seasons'),
            ('save_imports')
        ) AS expected(table_name)
        WHERE to_regclass('public.' || table_name) IS NOT NULL;
    `, { config }));

    if (tableCount === 0) return false;
    if (tableCount !== 4) {
        throw new Error(
            "The database contains only part of the initial Field Index schema. " +
            "Refusing to baseline an incomplete database."
        );
    }

    const valid = runPsqlCommand(`
        SELECT CASE WHEN
            EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'seasons'
                  AND column_name = 'dynasty_id'
            )
            AND EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'seasons'
                  AND column_name = 'season_index'
            )
            AND EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'save_imports'
                  AND column_name = 'file_hash'
            )
        THEN '1' ELSE '0' END;
    `, { config });

    if (valid !== "1") {
        throw new Error(
            "The existing initial tables do not match Field Index's committed 001 schema. " +
            "Fix the schema before continuing."
        );
    }

    return true;
}

function recordMigration(migration, checksum, applyMethod, config) {
    runPsqlCommand(`
        INSERT INTO schema_migrations (
            version,
            migration_name,
            checksum,
            apply_method
        ) VALUES (
            ${sqlText(migration.version)},
            ${sqlText(migration.name)},
            ${sqlText(checksum)},
            ${sqlText(applyMethod)}
        );
    `, { config });
}

function runMigrations(options = {}) {
    const config = options.config || getDatabaseConfig();
    const quiet = options.quiet === true;
    ensureMigrationTable(config);

    const migrations = listMigrations();
    const results = [];

    for (const migration of migrations) {
        const checksum = migrationChecksum(migration.path);
        const applied = getAppliedMigration(migration.version, config);

        if (applied) {
            if (applied.checksum !== checksum) {
                throw new Error(
                    `Committed migration ${migration.name} changed after it was applied. ` +
                    "Create a new migration instead of editing an old one."
                );
            }
            results.push({ ...migration, status: "already-applied", applyMethod: applied.applyMethod });
            continue;
        }

        if (migration.version === "001" && canBaselineInitialMigration(config)) {
            recordMigration(migration, checksum, "baseline-existing", config);
            results.push({ ...migration, status: "baselined", applyMethod: "baseline-existing" });
            if (!quiet) console.log(`BASELINE | ${migration.name}`);
            continue;
        }

        if (!quiet) console.log(`APPLY    | ${migration.name}`);
        runPsqlFile(migration.path, { config });
        recordMigration(migration, checksum, "executed", config);
        results.push({ ...migration, status: "applied", applyMethod: "executed" });
    }

    if (!quiet) {
        console.log(`Database migrations complete (${results.length} tracked)`);
    }

    return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        runMigrations();
    } catch (error) {
        console.error(`Database migration failed: ${error.message}`);
        process.exit(1);
    }
}

export {
    listMigrations,
    runMigrations
};
