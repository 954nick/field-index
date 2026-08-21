// -------------------- FIELD INDEX DATABASE VERIFICATION --------------------

import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseConfig } from "./lib/config.js";
import { runPsqlCommand } from "./lib/psql.js";

const expectedMigrations = ["001", "002", "003", "004", "005", "006"];

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
    "coach_stat_snapshots",
    "games",
    "game_import_snapshots",
    "game_line_scores",
    "team_game_stats",
    "player_game_stat_lines",
    "player_game_stats",
    "scoring_summary_events"
];

const requiredAnalyticsViews = [
    "import_context",
    "latest_game_imports",
    "latest_roster_imports",
    "best_team_game_imports",
    "best_player_game_imports",
    "best_scoring_imports",
    "team_season_snapshots",
    "player_season_snapshots",
    "coach_season_snapshots",
    "player_attributes",
    "player_abilities",
    "team_grades",
    "coach_stats",
    "team_snapshot_history",
    "player_snapshot_history",
    "coach_snapshot_history",
    "games",
    "team_games",
    "player_games",
    "player_seasons",
    "team_offense_seasons",
    "team_defense_seasons",
    "team_rankings",
    "conference_seasons",
    "coach_seasons",
    "player_history",
    "player_transfers",
    "player_careers",
    "team_history",
    "coach_history",
    "coach_careers",
    "scoring_events"
];

const requiredBiViews = [
    "dim_dynasty",
    "dim_season",
    "dim_team",
    "dim_conference",
    "dim_player",
    "dim_coach",
    "fact_game",
    "fact_team_game",
    "fact_player_game",
    "fact_team_season",
    "fact_player_season",
    "fact_coach_season",
    "fact_player_attribute",
    "fact_player_ability",
    "fact_team_grade",
    "fact_coach_stat",
    "fact_scoring_event",
    "fact_player_transfer",
    "fact_player_career",
    "fact_coach_career",
    "fact_conference_season",
    "fact_team_progression",
    "fact_player_progression",
    "fact_coach_progression"
];

function scalar(sql, config) {
    return runPsqlCommand(sql, { config });
}

function integer(sql, config) {
    const value = Number(scalar(sql, config));
    return Number.isFinite(value) ? value : 0;
}

function namesFromCsv(value) {
    return value.split(",").filter(Boolean);
}

function quotedList(values) {
    return values.map(value => `'${value}'`).join(", ");
}

function verifyDatabase(options = {}) {
    const config = options.config || getDatabaseConfig();
    const checks = [];

    function check(name, passed, details = "") {
        checks.push({ name, passed, details });
        const prefix = passed ? "PASS" : "FAIL";
        console.log(`${prefix.padEnd(4)} | ${name}${details ? ` | ${details}` : ""}`);
    }

    // -------------------- RAW SCHEMA --------------------

    const existingTables = namesFromCsv(scalar(`
        SELECT COALESCE(string_agg(table_name, ',' ORDER BY table_name), '')
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (${quotedList(requiredTables)});
    `, config));

    const missingTables = requiredTables.filter(name => !existingTables.includes(name));
    check(
        "Field Index schema tables",
        missingTables.length === 0,
        missingTables.length === 0
            ? `${requiredTables.length}/${requiredTables.length}`
            : `missing=${missingTables.join(",")}`
    );

    if (missingTables.includes("schema_migrations")) {
        return { passed: false, checks };
    }

    const migrationVersions = namesFromCsv(scalar(`
        SELECT COALESCE(string_agg(version, ',' ORDER BY version), '')
        FROM schema_migrations;
    `, config));

    const missingMigrations = expectedMigrations.filter(
        version => !migrationVersions.includes(version)
    );
    check(
        "Migrations 001-006 tracked",
        missingMigrations.length === 0,
        missingMigrations.length === 0
            ? migrationVersions.join(",")
            : `missing=${missingMigrations.join(",")}`
    );

    if (missingTables.length > 0 || missingMigrations.length > 0) {
        return { passed: false, checks };
    }

    // -------------------- ANALYTICS SCHEMAS / VIEWS --------------------

    const analyticsSchemas = namesFromCsv(scalar(`
        SELECT COALESCE(string_agg(schema_name, ',' ORDER BY schema_name), '')
        FROM information_schema.schemata
        WHERE schema_name IN ('analytics', 'bi');
    `, config));

    check(
        "Analytics schemas",
        analyticsSchemas.includes("analytics") && analyticsSchemas.includes("bi"),
        analyticsSchemas.length > 0 ? analyticsSchemas.join(",") : "missing"
    );

    const analyticsViews = namesFromCsv(scalar(`
        SELECT COALESCE(string_agg(table_name, ',' ORDER BY table_name), '')
        FROM information_schema.views
        WHERE table_schema = 'analytics';
    `, config));
    const missingAnalyticsViews = requiredAnalyticsViews.filter(
        name => !analyticsViews.includes(name)
    );
    check(
        "Analytics views",
        missingAnalyticsViews.length === 0,
        missingAnalyticsViews.length === 0
            ? `${requiredAnalyticsViews.length}/${requiredAnalyticsViews.length}`
            : `missing=${missingAnalyticsViews.join(",")}`
    );

    const biViews = namesFromCsv(scalar(`
        SELECT COALESCE(string_agg(table_name, ',' ORDER BY table_name), '')
        FROM information_schema.views
        WHERE table_schema = 'bi';
    `, config));
    const missingBiViews = requiredBiViews.filter(name => !biViews.includes(name));
    check(
        "Power BI views",
        missingBiViews.length === 0,
        missingBiViews.length === 0
            ? `${requiredBiViews.length}/${requiredBiViews.length}`
            : `missing=${missingBiViews.join(",")}`
    );

    if (missingAnalyticsViews.length > 0 || missingBiViews.length > 0) {
        return { passed: false, checks };
    }

    // -------------------- RELATIONSHIP INTEGRITY --------------------

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

    const gameSeasonMismatchCount = integer(`
        SELECT COUNT(*)
        FROM games AS g
        JOIN seasons AS s ON s.season_id = g.season_id
        JOIN save_imports AS first_import ON first_import.import_id = g.first_seen_import_id
        JOIN seasons AS import_season ON import_season.season_id = first_import.season_id
        WHERE s.dynasty_id <> import_season.dynasty_id;
    `, config);
    check(
        "Game dynasty consistency",
        gameSeasonMismatchCount === 0,
        `mismatches=${gameSeasonMismatchCount}`
    );

    const playerGameDynastyMismatchCount = integer(`
        SELECT COUNT(*)
        FROM player_game_stat_lines AS pgs
        JOIN games AS g ON g.game_id = pgs.game_id
        JOIN seasons AS game_season ON game_season.season_id = g.season_id
        JOIN players AS p ON p.player_id = pgs.player_id
        WHERE game_season.dynasty_id <> p.dynasty_id;
    `, config);
    check(
        "Player-game dynasty consistency",
        playerGameDynastyMismatchCount === 0,
        `mismatches=${playerGameDynastyMismatchCount}`
    );

    // -------------------- RAW IMPORT VERIFICATION --------------------

    const importCount = integer("SELECT COUNT(*) FROM save_imports;", config);
    if (importCount === 0) {
        console.log("INFO | No save has been imported yet; schema/view verification only");
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

        const numericImportId = Number(importId);
        const teamSnapshots = integer(
            `SELECT COUNT(*) FROM team_import_snapshots WHERE import_id = ${numericImportId};`,
            config
        );
        const playerSnapshots = integer(
            `SELECT COUNT(*) FROM player_import_snapshots WHERE import_id = ${numericImportId};`,
            config
        );
        const coachSnapshots = integer(
            `SELECT COUNT(*) FROM coach_import_snapshots WHERE import_id = ${numericImportId};`,
            config
        );

        check("Latest import team snapshots", teamSnapshots > 0, `rows=${teamSnapshots}`);
        check("Latest import player snapshots", playerSnapshots > 0, `rows=${playerSnapshots}`);
        check("Latest import coach snapshots", coachSnapshots > 0, `rows=${coachSnapshots}`);

        const playerAttributes = integer(
            `SELECT COUNT(*) FROM player_attribute_snapshots WHERE import_id = ${numericImportId};`,
            config
        );
        const playerAbilities = integer(
            `SELECT COUNT(*) FROM player_ability_snapshots WHERE import_id = ${numericImportId};`,
            config
        );
        const teamGrades = integer(
            `SELECT COUNT(*) FROM team_grade_snapshots WHERE import_id = ${numericImportId};`,
            config
        );
        const coachStats = integer(
            `SELECT COUNT(*) FROM coach_stat_snapshots WHERE import_id = ${numericImportId};`,
            config
        );

        check("Latest import normalized player attributes", playerAttributes > 0, `rows=${playerAttributes}`);
        check("Latest import normalized player abilities", playerAbilities > 0, `rows=${playerAbilities}`);
        check("Latest import normalized team grades", teamGrades > 0, `rows=${teamGrades}`);
        check("Latest import normalized coach stats", coachStats > 0, `rows=${coachStats}`);

        const gameSnapshots = integer(
            `SELECT COUNT(*) FROM game_import_snapshots WHERE import_id = ${numericImportId};`,
            config
        );
        const finalGames = integer(`
            SELECT COUNT(*)
            FROM game_import_snapshots
            WHERE import_id = ${numericImportId}
              AND game_status IN ('HomeWon', 'AwayWon', 'Tie');
        `, config);
        const unplayedGames = integer(`
            SELECT COUNT(*)
            FROM game_import_snapshots
            WHERE import_id = ${numericImportId}
              AND game_status NOT IN ('HomeWon', 'AwayWon', 'Tie');
        `, config);
        const lineScores = integer(
            `SELECT COUNT(*) FROM game_line_scores WHERE import_id = ${numericImportId};`,
            config
        );
        const teamGameStats = integer(
            `SELECT COUNT(*) FROM team_game_stats WHERE import_id = ${numericImportId};`,
            config
        );
        const playerGameLines = integer(
            `SELECT COUNT(*) FROM player_game_stat_lines WHERE import_id = ${numericImportId};`,
            config
        );
        const playerGameFacts = integer(
            `SELECT COUNT(*) FROM player_game_stats WHERE import_id = ${numericImportId};`,
            config
        );
        const scoringEvents = integer(
            `SELECT COUNT(*) FROM scoring_summary_events WHERE import_id = ${numericImportId};`,
            config
        );

        check("Latest import game snapshots", gameSnapshots > 0, `rows=${gameSnapshots}`);
        check(
            "Latest import line scores",
            finalGames === lineScores,
            `final_games=${finalGames} rows=${lineScores}`
        );
        check(
            "Latest import team box scores",
            teamGameStats === finalGames * 2,
            `expected=${finalGames * 2} rows=${teamGameStats}`
        );
        check("Latest import player game stat lines", playerGameLines > 0, `rows=${playerGameLines}`);
        check("Latest import normalized player game stats", playerGameFacts > 0, `rows=${playerGameFacts}`);
        console.log(`INFO | Latest import scoring summary events | rows=${scoringEvents}`);

        const unplayedScoreLeaks = integer(`
            SELECT COUNT(*)
            FROM game_import_snapshots
            WHERE import_id = ${numericImportId}
              AND game_status NOT IN ('HomeWon', 'AwayWon', 'Tie')
              AND (home_score IS NOT NULL OR away_score IS NOT NULL);
        `, config);
        check(
            "Unplayed games hide stale scores",
            unplayedScoreLeaks === 0,
            `leaks=${unplayedScoreLeaks} unplayed=${unplayedGames}`
        );

        const finalScoreMissing = integer(`
            SELECT COUNT(*)
            FROM game_import_snapshots
            WHERE import_id = ${numericImportId}
              AND game_status IN ('HomeWon', 'AwayWon', 'Tie')
              AND (home_score IS NULL OR away_score IS NULL);
        `, config);
        check("Final games expose scores", finalScoreMissing === 0, `missing=${finalScoreMissing}`);

        const lineScoreMismatches = integer(`
            SELECT COUNT(*)
            FROM game_line_scores AS gls
            JOIN game_import_snapshots AS gis
              ON gis.import_id = gls.import_id
             AND gis.game_id = gls.game_id
            WHERE gls.import_id = ${numericImportId}
              AND (
                    gls.home_total <> gis.home_score
                 OR gls.away_total <> gis.away_score
              );
        `, config);
        check(
            "Line-score totals match authoritative scores",
            lineScoreMismatches === 0,
            `mismatches=${lineScoreMismatches}`
        );

        const unresolvedFbsParticipants = integer(`
            SELECT COUNT(*)
            FROM game_import_snapshots
            WHERE import_id = ${numericImportId}
              AND (
                    (home_team_index <> 255 AND home_team_id IS NULL)
                 OR (away_team_index <> 255 AND away_team_id IS NULL)
              );
        `, config);
        check(
            "FBS game participants resolve to teams",
            unresolvedFbsParticipants === 0,
            `unresolved=${unresolvedFbsParticipants}`
        );

        // -------------------- ANALYTICS VIEW VERIFICATION --------------------

        const analyticsGames = integer("SELECT COUNT(*) FROM analytics.games;", config);
        const canonicalGameExpected = integer(`
            SELECT COUNT(*)
            FROM games AS g
            JOIN analytics.latest_game_imports AS lgi
              ON lgi.season_id = g.season_id
            JOIN game_import_snapshots AS gis
              ON gis.import_id = lgi.import_id
             AND gis.game_id = g.game_id;
        `, config);
        check(
            "Analytics canonical games",
            analyticsGames === canonicalGameExpected && analyticsGames > 0,
            `rows=${analyticsGames}`
        );

        const analyticsTeamGames = integer("SELECT COUNT(*) FROM analytics.team_games;", config);
        const canonicalTeamGameExpected = integer(`
            SELECT COALESCE(SUM(team_game_rows), 0)
            FROM analytics.best_team_game_imports;
        `, config);
        check(
            "Analytics team games",
            analyticsTeamGames === canonicalTeamGameExpected && analyticsTeamGames > 0,
            `rows=${analyticsTeamGames}`
        );

        const analyticsPlayerGames = integer("SELECT COUNT(*) FROM analytics.player_games;", config);
        const canonicalPlayerGameExpected = integer(`
            SELECT COUNT(*)
            FROM (
                SELECT DISTINCT
                    pgsl.import_id,
                    pgsl.game_id,
                    pgsl.player_id
                FROM player_game_stat_lines AS pgsl
                JOIN games AS g
                  ON g.game_id = pgsl.game_id
                JOIN analytics.best_player_game_imports AS bpgi
                  ON bpgi.import_id = pgsl.import_id
                 AND bpgi.season_id = g.season_id
            ) AS player_games;
        `, config);
        check(
            "Analytics player games",
            analyticsPlayerGames === canonicalPlayerGameExpected && analyticsPlayerGames > 0,
            `rows=${analyticsPlayerGames}`
        );

        const playerSeasonSnapshots = integer(
            "SELECT COUNT(*) FROM analytics.player_season_snapshots;",
            config
        );
        const analyticsPlayerSeasons = integer(
            "SELECT COUNT(*) FROM analytics.player_seasons;",
            config
        );
        check(
            "Analytics player seasons",
            analyticsPlayerSeasons === playerSeasonSnapshots && analyticsPlayerSeasons > 0,
            `rows=${analyticsPlayerSeasons}`
        );

        const teamSeasonSnapshots = integer(
            "SELECT COUNT(*) FROM analytics.team_season_snapshots;",
            config
        );
        const analyticsTeamRankings = integer(
            "SELECT COUNT(*) FROM analytics.team_rankings;",
            config
        );
        check(
            "Analytics team rankings",
            analyticsTeamRankings === teamSeasonSnapshots && analyticsTeamRankings > 0,
            `rows=${analyticsTeamRankings}`
        );

        const coachSeasonSnapshots = integer(
            "SELECT COUNT(*) FROM analytics.coach_season_snapshots;",
            config
        );
        const analyticsCoachSeasons = integer(
            "SELECT COUNT(*) FROM analytics.coach_seasons;",
            config
        );
        check(
            "Analytics coach seasons",
            analyticsCoachSeasons === coachSeasonSnapshots && analyticsCoachSeasons > 0,
            `rows=${analyticsCoachSeasons}`
        );

        const analyticsConferenceSeasons = integer(
            "SELECT COUNT(*) FROM analytics.conference_seasons;",
            config
        );
        check(
            "Analytics conference seasons",
            analyticsConferenceSeasons > 0,
            `rows=${analyticsConferenceSeasons}`
        );

        const rawTeamHistory = integer("SELECT COUNT(*) FROM team_import_snapshots;", config);
        const analyticsTeamHistory = integer("SELECT COUNT(*) FROM analytics.team_snapshot_history;", config);
        check(
            "Team snapshot history coverage",
            analyticsTeamHistory === rawTeamHistory,
            `raw=${rawTeamHistory} analytics=${analyticsTeamHistory}`
        );

        const rawPlayerHistory = integer("SELECT COUNT(*) FROM player_import_snapshots;", config);
        const analyticsPlayerHistory = integer("SELECT COUNT(*) FROM analytics.player_snapshot_history;", config);
        check(
            "Player snapshot history coverage",
            analyticsPlayerHistory === rawPlayerHistory,
            `raw=${rawPlayerHistory} analytics=${analyticsPlayerHistory}`
        );

        const rawCoachHistory = integer("SELECT COUNT(*) FROM coach_import_snapshots;", config);
        const analyticsCoachHistory = integer("SELECT COUNT(*) FROM analytics.coach_snapshot_history;", config);
        check(
            "Coach snapshot history coverage",
            analyticsCoachHistory === rawCoachHistory,
            `raw=${rawCoachHistory} analytics=${analyticsCoachHistory}`
        );

        const duplicateAnalyticsGames = integer(`
            SELECT COUNT(*)
            FROM (
                SELECT game_id
                FROM analytics.games
                GROUP BY game_id
                HAVING COUNT(*) > 1
            ) AS duplicates;
        `, config);
        check("Analytics game uniqueness", duplicateAnalyticsGames === 0, `duplicates=${duplicateAnalyticsGames}`);

        const duplicateTeamGames = integer(`
            SELECT COUNT(*)
            FROM (
                SELECT import_id, game_id, home_away
                FROM analytics.team_games
                GROUP BY import_id, game_id, home_away
                HAVING COUNT(*) > 1
            ) AS duplicates;
        `, config);
        check("Analytics team-game uniqueness", duplicateTeamGames === 0, `duplicates=${duplicateTeamGames}`);

        const duplicatePlayerGames = integer(`
            SELECT COUNT(*)
            FROM (
                SELECT import_id, game_id, player_id
                FROM analytics.player_games
                GROUP BY import_id, game_id, player_id
                HAVING COUNT(*) > 1
            ) AS duplicates;
        `, config);
        check("Analytics player-game uniqueness", duplicatePlayerGames === 0, `duplicates=${duplicatePlayerGames}`);

        const duplicatePlayerSeasons = integer(`
            SELECT COUNT(*)
            FROM (
                SELECT season_id, player_id
                FROM analytics.player_seasons
                GROUP BY season_id, player_id
                HAVING COUNT(*) > 1
            ) AS duplicates;
        `, config);
        check("Analytics player-season uniqueness", duplicatePlayerSeasons === 0, `duplicates=${duplicatePlayerSeasons}`);

        const invalidTransferRows = integer(`
            SELECT COUNT(*)
            FROM analytics.player_transfers
            WHERE from_team_id IS NOT NULL
              AND from_team_id = to_team_id;
        `, config);
        check("Transfer history team changes", invalidTransferRows === 0, `invalid=${invalidTransferRows}`);

        const transferRows = integer("SELECT COUNT(*) FROM analytics.player_transfers;", config);
        const playerCareerRows = integer("SELECT COUNT(*) FROM analytics.player_careers;", config);
        const coachCareerRows = integer("SELECT COUNT(*) FROM analytics.coach_careers;", config);
        console.log(`INFO | Analytics transfers | rows=${transferRows}`);
        console.log(`INFO | Analytics player careers | rows=${playerCareerRows}`);
        console.log(`INFO | Analytics coach careers | rows=${coachCareerRows}`);

        const biGameRows = integer("SELECT COUNT(*) FROM bi.fact_game;", config);
        const biTeamSeasonRows = integer("SELECT COUNT(*) FROM bi.fact_team_season;", config);
        const biPlayerSeasonRows = integer("SELECT COUNT(*) FROM bi.fact_player_season;", config);
        const biCoachSeasonRows = integer("SELECT COUNT(*) FROM bi.fact_coach_season;", config);
        check("Power BI game fact", biGameRows === analyticsGames, `rows=${biGameRows}`);
        check("Power BI team-season fact", biTeamSeasonRows === analyticsTeamRankings, `rows=${biTeamSeasonRows}`);
        check("Power BI player-season fact", biPlayerSeasonRows === analyticsPlayerSeasons, `rows=${biPlayerSeasonRows}`);
        check("Power BI coach-season fact", biCoachSeasonRows === analyticsCoachSeasons, `rows=${biCoachSeasonRows}`);
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
