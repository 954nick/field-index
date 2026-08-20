// -------------------- POSTGRESQL CLI BRIDGE --------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { getDatabaseConfig } from "./config.js";

function findOnPath(command) {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    const result = spawnSync(locator, [command], {
        encoding: "utf8",
        windowsHide: true
    });

    if (result.status !== 0 || !result.stdout) return null;
    return result.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null;
}

function findPsqlExecutable(config = getDatabaseConfig()) {
    if (config.psqlPath) {
        if (!fs.existsSync(config.psqlPath)) {
            throw new Error(`FIELD_INDEX_PSQL does not exist: ${config.psqlPath}`);
        }
        return config.psqlPath;
    }

    const onPath = findOnPath("psql");
    if (onPath) return onPath;

    if (process.platform === "win32") {
        const programFiles = process.env.ProgramFiles || "C:\\Program Files";
        for (const version of [18, 17, 16, 15, 14]) {
            const candidate = path.join(
                programFiles,
                "PostgreSQL",
                String(version),
                "bin",
                "psql.exe"
            );
            if (fs.existsSync(candidate)) return candidate;
        }
    }

    throw new Error(
        "Could not find psql. Install PostgreSQL Command Line Tools, add psql to PATH, " +
        "or set FIELD_INDEX_PSQL in database/.env"
    );
}

function getConnectionArgs(config = getDatabaseConfig()) {
    if (config.connectionString) {
        return [config.connectionString];
    }

    return [
        "-h", config.host,
        "-p", String(config.port),
        "-U", config.user,
        "-d", config.database
    ];
}

function getPsqlEnvironment(config = getDatabaseConfig()) {
    const env = { ...process.env };
    if (config.password) env.PGPASSWORD = config.password;
    return env;
}

function runPsqlFile(filePath, options = {}) {
    const config = options.config || getDatabaseConfig();
    const psql = findPsqlExecutable(config);
    const args = [
        ...getConnectionArgs(config),
        "-X",
        "-v", "ON_ERROR_STOP=1",
        "-f", filePath
    ];

    const result = spawnSync(psql, args, {
        env: getPsqlEnvironment(config),
        stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
        encoding: options.capture ? "utf8" : undefined,
        windowsHide: true
    });

    if (result.status !== 0) {
        const details = options.capture
            ? `\n${result.stderr || result.stdout || ""}`
            : "";
        throw new Error(`psql failed for ${filePath}${details}`);
    }

    return result.stdout ?? "";
}

function runPsqlCommand(sql, options = {}) {
    const config = options.config || getDatabaseConfig();
    const psql = findPsqlExecutable(config);
    const args = [
        ...getConnectionArgs(config),
        "-X",
        "-v", "ON_ERROR_STOP=1",
        "-qAt",
        "-c", sql
    ];

    try {
        return execFileSync(psql, args, {
            env: getPsqlEnvironment(config),
            encoding: "utf8",
            windowsHide: true
        }).trim();
    } catch (error) {
        const stderr = error?.stderr?.toString?.() || "";
        throw new Error(`psql command failed${stderr ? `: ${stderr.trim()}` : ""}`);
    }
}

export {
    findPsqlExecutable,
    getConnectionArgs,
    runPsqlCommand,
    runPsqlFile
};
