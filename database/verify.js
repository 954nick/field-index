// -------------------- FIELD INDEX DATABASE VERIFICATION --------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseConfig } from "./lib/config.js";
import { runPsqlCommand } from "./lib/psql.js";

const expectedMigrations = ["001", "002", "003", "004"];
const requiredTables = [
    "schema_migrations",
    "dynasties",
    "seasons",
    "save_imports",
    "teams",
    "conferences",
    "team_seasons",
    "team_import_snapshots",
    "players",
    "player_seasons",
    "player_import_snapshots",
    "coaches",
    "coach_seasons",
    "coach_import_snapshots",
    "grade_scale",
    "team_grade_snapshots",
    "player_attribute_snapshots",
    "player_ability_snapshots",
    "coach_stat_snapshots"
];

function scalar(sql, config) {
    return runPsqlCommand(sql, { config });
}

function integer(sql, config) {
    const value = Number(scalar(sql, config));
    return Number.isFinite(value) ? value : 0;
}

function verifyDatabase(options = {}) {
    const config = options.config || getDatabaseConfig();
    const checks = [];

    function check(name, passed, details = "") {
        checks.push({ name, passed, details });
        const prefix = passed ? "PASS" : "FAIL";
        console.log(`${prefix.padEnd(4)} | ${name}${details ? ` | ${details}` : ""}`);
    }

    const existingTables = scalar(`
        SELECT string_agg(table_name, ',' ORDER BY table_name)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (${requiredTables.map(name => `'${name}'`).join(", ")});
    `, config).split(",").filter(Boolean);

    const missingTables = requiredTables.filter(name => !existingTables.includes(name));
    check(
        "Pre-game schema tables",
        missingTables.length === 0,
        missingTables.length === 0 ? `${requiredTables.length}/${requiredTables.length}` : `missing=${missingTables.join(",")}`
    );

    if (missingTables.includes("schema_migrations")) {
        return { passed: false, checks };
    }

    const migrationVersions = scalar(`
        SELECT string_agg(version, ',' ORDER BY version)
        FROM schema_migrations;
    `, config).split(",").filter(Boolean);

    const missingMigrations = expectedMigrations.filter(version => !migrationVersions.includes(version));
    check(
        "Migrations 001-004 tracked",
        missingMigrations.length === 0,
        missingMigrations.length === 0 ? migrationVersions.join(",") : `missing=${missingMigrations.join(",")}`
    );

    if (missingTables.length > 0) {
        return { passed: false, checks };
    }

    const orphanSeasonCount = integer(`
        SELECT COUNT(*)
        FROM seasons AS s
        LEFT JOIN dynasties AS d ON d.dynasty_id = s.dynasty_id
        WHERE d.dynasty_id IS NULL;
    `, config);
    check("Season foreign keys", orphanSeasonCount === 0, `orphans=${orphanSeasonCount}`);

    const crossDynastyTeamSeasonCount = integer(`
        SELECT COUNT(*)
        FROM team_seasons AS ts
        JOIN seasons AS s ON s.season_id = ts.season_id
        JOIN teams AS t ON t.team_id = ts.team_id
        WHERE s.dynasty_id <> t.dynasty_id;
    `, config);
    check(
        "Team-season dynasty consistency",
        crossDynastyTeamSeasonCount === 0,
        `mismatches=${crossDynastyTeamSeasonCount}`
    );

    const crossDynastyPlayerSeasonCount = integer(`
        SELECT COUNT(*)
        FROM player_seasons AS ps
        JOIN seasons AS s ON s.season_id = ps.season_id
        JOIN players AS p ON p.player_id = ps.player_id
        WHERE s.dynasty_id <> p.dynasty_id;
    `, config);
    check(
        "Player-season dynasty consistency",
        crossDynastyPlayerSeasonCount === 0,
        `mismatches=${crossDynastyPlayerSeasonCount}`
    );

    const crossDynastyCoachSeasonCount = integer(`
        SELECT COUNT(*)
        FROM coach_seasons AS cs
        JOIN seasons AS s ON s.season_id = cs.season_id
        JOIN coaches AS c ON c.coach_id = cs.coach_id
        WHERE s.dynasty_id <> c.dynasty_id;
    `, config);
    check(
        "Coach-season dynasty consistency",
        crossDynastyCoachSeasonCount === 0,
        `mismatches=${crossDynastyCoachSeasonCount}`
    );

    const gameTableCount = integer(`
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('games', 'game_import_snapshots', 'team_game_stats', 'player_game_stats');
    `, config);
    check("Game storage not started", gameTableCount === 0, `game_tables=${gameTableCount}`);

    const importCount = integer("SELECT COUNT(*) FROM save_imports;", config);
    if (importCount === 0) {
        console.log("INFO | No save has been imported yet; schema verification only");
    } else {
        const latest = scalar(`
            SELECT
                si.import_id || '|' || d.dynasty_name || '|' ||
                import_season.season_year || '|' || roster_season.season_year || '|' ||
                COALESCE(si.week_type, '') || '|' || COALESCE(si.week_number::text, '')
            FROM save_imports AS si
            JOIN seasons AS import_season ON import_season.season_id = si.season_id
            JOIN seasons AS roster_season ON roster_season.season_id = si.roster_season_id
            JOIN dynasties AS d ON d.dynasty_id = import_season.dynasty_id
            ORDER BY si.last_seen_at DESC, si.import_id DESC
            LIMIT 1;
        `, config);

        const [importId, dynastyName, saveYear, rosterYear, weekType, weekNumber] = latest.split("|");
        console.log(
            `INFO | Latest import ${importId}: ${dynastyName}, save season ${saveYear}, ` +
            `roster season ${rosterYear}, ${weekType || "Unknown"} week ${weekNumber || "?"}`
        );

        const teamSnapshots = integer(
            `SELECT COUNT(*) FROM team_import_snapshots WHERE import_id = ${Number(importId)};`,
            config
        );
        const playerSnapshots = integer(
            `SELECT COUNT(*) FROM player_import_snapshots WHERE import_id = ${Number(importId)};`,
            config
        );
        const coachSnapshots = integer(
            `SELECT COUNT(*) FROM coach_import_snapshots WHERE import_id = ${Number(importId)};`,
            config
        );

        check("Latest import team snapshots", teamSnapshots > 0, `rows=${teamSnapshots}`);
        check("Latest import player snapshots", playerSnapshots > 0, `rows=${playerSnapshots}`);
        check("Latest import coach snapshots", coachSnapshots > 0, `rows=${coachSnapshots}`);

        const playerAttributes = integer(
            `SELECT COUNT(*) FROM player_attribute_snapshots WHERE import_id = ${Number(importId)};`,
            config
        );
        const playerAbilities = integer(
            `SELECT COUNT(*) FROM player_ability_snapshots WHERE import_id = ${Number(importId)};`,
            config
        );
        const teamGrades = integer(
            `SELECT COUNT(*) FROM team_grade_snapshots WHERE import_id = ${Number(importId)};`,
            config
        );
        const coachStats = integer(
            `SELECT COUNT(*) FROM coach_stat_snapshots WHERE import_id = ${Number(importId)};`,
            config
        );

        check("Latest import normalized player attributes", playerAttributes > 0, `rows=${playerAttributes}`);
        check("Latest import normalized player abilities", playerAbilities > 0, `rows=${playerAbilities}`);
        check("Latest import normalized team grades", teamGrades > 0, `rows=${teamGrades}`);
        check("Latest import normalized coach stats", coachStats > 0, `rows=${coachStats}`);
    }

    const passed = checks.every(item => item.passed);
    console.log(`\n${passed ? "DATABASE VERIFICATION PASSED" : "DATABASE VERIFICATION FAILED"}`);
    return { passed, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = verifyDatabase();
        if (!result.passed) process.exit(1);
    } catch (error) {
        console.error(`Database verification failed: ${error.message}`);
        process.exit(1);
    }
}

export { verifyDatabase };
