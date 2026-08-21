// -------------------- GAME STORAGE POSTGRESQL IMPORT SQL --------------------

import {
    chunk,
    sqlBoolean,
    sqlInteger,
    sqlJson,
    sqlNumber,
    sqlText
} from "./sql.js";

function valuesBlock(rows, rowBuilder) {
    return rows.map(row => `(${rowBuilder(row).join(", ")})`).join(",\n        ");
}

function contextCte(model) {
    return `ctx AS (
        SELECT
            d.dynasty_id,
            import_season.season_id AS import_season_id,
            si.import_id
        FROM dynasties AS d
        JOIN seasons AS import_season
          ON import_season.dynasty_id = d.dynasty_id
         AND import_season.season_index = ${sqlInteger(model.metadata.currentSeasonIndex)}
        JOIN save_imports AS si
          ON si.season_id = import_season.season_id
         AND si.file_hash = ${sqlText(model.source.fileHash)}
        WHERE d.dynasty_key = ${sqlText(model.dynastyKey)}
    )`;
}

function gameKeyValues(game) {
    return [
        sqlInteger(game.seasonIndex),
        sqlText(game.weekType),
        sqlInteger(game.week),
        sqlInteger(game.gameNumber)
    ];
}

function buildGameRowsSql(model) {
    const games = model.gameStorage.games;
    if (games.length === 0) return "";

    const seasonPairs = [...new Map(
        games.map(game => [game.seasonIndex, game.seasonYearDisplay])
    ).entries()].map(([seasonIndex, seasonYear]) => ({ seasonIndex, seasonYear }));

    const seasonValues = valuesBlock(seasonPairs, season => [
        sqlInteger(season.seasonIndex),
        sqlInteger(season.seasonYear)
    ]);

    const values = valuesBlock(games, gameKeyValues);

    return `
-- -------------------- GAME SEASONS / LOGICAL GAMES --------------------

WITH
    ${contextCte(model)},
    data(season_index, season_year) AS (
        VALUES
        ${seasonValues}
    )
INSERT INTO seasons (dynasty_id, season_index, season_year)
SELECT
    ctx.dynasty_id,
    data.season_index,
    data.season_year
FROM data
CROSS JOIN ctx
ON CONFLICT (dynasty_id, season_index)
DO UPDATE SET season_year = EXCLUDED.season_year;

WITH
    ${contextCte(model)},
    data(season_index, week_type, week_number, game_number) AS (
        VALUES
        ${values}
    )
INSERT INTO games (
    season_id,
    week_type,
    week_number,
    game_number,
    first_seen_import_id,
    last_seen_import_id
)
SELECT
    s.season_id,
    data.week_type,
    data.week_number,
    data.game_number,
    ctx.import_id,
    ctx.import_id
FROM data
CROSS JOIN ctx
JOIN seasons AS s
  ON s.dynasty_id = ctx.dynasty_id
 AND s.season_index = data.season_index
ON CONFLICT (season_id, week_type, week_number, game_number)
DO UPDATE SET
    last_seen_import_id = EXCLUDED.last_seen_import_id;

-- Rebuilding one immutable save import should replace its derived game facts
-- rather than leave stale rows from an older parser implementation.
WITH ${contextCte(model)}
DELETE FROM game_import_snapshots AS target
USING ctx
WHERE target.import_id = ctx.import_id;
`;
}

function buildGameSnapshotSql(model) {
    const games = model.gameStorage.games;
    if (games.length === 0) return "";

    const values = valuesBlock(games, game => [
        ...gameKeyValues(game),
        sqlInteger(game.seasonGameRow),
        sqlText(game.gameStatus),
        sqlInteger(game.homeTeamIndex),
        sqlText(game.homeTeamName),
        sqlInteger(game.awayTeamIndex),
        sqlText(game.awayTeamName),
        sqlInteger(game.homeScore),
        sqlInteger(game.awayScore),
        sqlText(game.dayOfWeek),
        sqlInteger(game.gameDateMonth),
        sqlInteger(game.gameDateDay),
        sqlInteger(game.timeOfDay),
        sqlText(game.broadcastNetwork),
        sqlText(game.stadium),
        sqlBoolean(Boolean(game.isGameOfTheWeek)),
        sqlBoolean(Boolean(game.newYearsFlag)),
        sqlBoolean(Boolean(game.playerStatsAvailable)),
        sqlText(game.bowl?.name ?? null),
        sqlText(game.bowl?.assetName ?? null),
        sqlInteger(game.bowl?.presentationId ?? null),
        sqlInteger(game.bowl?.logoId ?? null),
        sqlBoolean(game.bowl?.isPlayoffBowl ?? null),
        sqlInteger(game.bowl?.playoffBracketSlot ?? null),
        sqlBoolean(game.bowl?.shouldPlayNewYears ?? null)
    ]);

    return `
-- -------------------- GAME SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        season_index,
        week_type,
        week_number,
        game_number,
        source_season_game_row,
        game_status,
        home_team_index,
        home_team_name,
        away_team_index,
        away_team_name,
        home_score,
        away_score,
        day_of_week,
        game_date_month,
        game_date_day,
        time_of_day_minutes,
        broadcast_network,
        stadium_reference,
        is_game_of_the_week,
        new_years_flag,
        player_stats_available,
        bowl_name,
        bowl_asset_name,
        bowl_presentation_id,
        bowl_logo_id,
        is_playoff_bowl,
        playoff_bracket_slot,
        should_play_new_years
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO game_import_snapshots (
    import_id,
    game_id,
    source_season_game_row,
    game_status,
    home_team_id,
    away_team_id,
    home_team_index,
    home_team_name,
    away_team_index,
    away_team_name,
    home_score,
    away_score,
    day_of_week,
    game_date_month,
    game_date_day,
    time_of_day_minutes,
    broadcast_network,
    stadium_reference,
    is_game_of_the_week,
    new_years_flag,
    player_stats_available,
    bowl_name,
    bowl_asset_name,
    bowl_presentation_id,
    bowl_logo_id,
    is_playoff_bowl,
    playoff_bracket_slot,
    should_play_new_years
)
SELECT
    ctx.import_id,
    g.game_id,
    data.source_season_game_row,
    data.game_status,
    home_team.team_id,
    away_team.team_id,
    data.home_team_index,
    data.home_team_name,
    data.away_team_index,
    data.away_team_name,
    data.home_score,
    data.away_score,
    data.day_of_week,
    data.game_date_month,
    data.game_date_day,
    data.time_of_day_minutes,
    data.broadcast_network,
    data.stadium_reference,
    data.is_game_of_the_week,
    data.new_years_flag,
    data.player_stats_available,
    data.bowl_name,
    data.bowl_asset_name,
    data.bowl_presentation_id,
    data.bowl_logo_id,
    data.is_playoff_bowl,
    data.playoff_bracket_slot,
    data.should_play_new_years
FROM data
CROSS JOIN ctx
JOIN seasons AS game_season
  ON game_season.dynasty_id = ctx.dynasty_id
 AND game_season.season_index = data.season_index
JOIN games AS g
  ON g.season_id = game_season.season_id
 AND g.week_type = data.week_type
 AND g.week_number = data.week_number
 AND g.game_number = data.game_number
LEFT JOIN teams AS home_team
  ON home_team.dynasty_id = ctx.dynasty_id
 AND home_team.game_team_index = data.home_team_index
LEFT JOIN teams AS away_team
  ON away_team.dynasty_id = ctx.dynasty_id
 AND away_team.game_team_index = data.away_team_index;
`;
}

function buildLineScoreSql(model) {
    const games = model.gameStorage.games.filter(game => game.lineScore);
    if (games.length === 0) return "";

    const values = valuesBlock(games, game => [
        ...gameKeyValues(game),
        sqlInteger(game.lineScore.home.q1),
        sqlInteger(game.lineScore.home.q2),
        sqlInteger(game.lineScore.home.q3),
        sqlInteger(game.lineScore.home.q4),
        sqlInteger(game.lineScore.home.overtime),
        sqlInteger(game.lineScore.home.total),
        sqlInteger(game.lineScore.away.q1),
        sqlInteger(game.lineScore.away.q2),
        sqlInteger(game.lineScore.away.q3),
        sqlInteger(game.lineScore.away.q4),
        sqlInteger(game.lineScore.away.overtime),
        sqlInteger(game.lineScore.away.total)
    ]);

    return `
-- -------------------- LINE SCORES --------------------

WITH
    ${contextCte(model)},
    data(
        season_index, week_type, week_number, game_number,
        home_q1, home_q2, home_q3, home_q4, home_overtime, home_total,
        away_q1, away_q2, away_q3, away_q4, away_overtime, away_total
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO game_line_scores (
    import_id, game_id,
    home_q1, home_q2, home_q3, home_q4, home_overtime, home_total,
    away_q1, away_q2, away_q3, away_q4, away_overtime, away_total
)
SELECT
    ctx.import_id,
    g.game_id,
    data.home_q1, data.home_q2, data.home_q3, data.home_q4,
    data.home_overtime, data.home_total,
    data.away_q1, data.away_q2, data.away_q3, data.away_q4,
    data.away_overtime, data.away_total
FROM data
CROSS JOIN ctx
JOIN seasons AS game_season
  ON game_season.dynasty_id = ctx.dynasty_id
 AND game_season.season_index = data.season_index
JOIN games AS g
  ON g.season_id = game_season.season_id
 AND g.week_type = data.week_type
 AND g.week_number = data.week_number
 AND g.game_number = data.game_number;
`;
}

function teamStatRows(model) {
    const rows = [];
    for (const game of model.gameStorage.games) {
        for (const side of ["home", "away"]) {
            const stats = game.teamBoxScoreStats?.[side];
            if (!stats) continue;
            rows.push({ game, side, stats });
        }
    }
    return rows;
}

function buildTeamGameStatsSql(model) {
    const rows = teamStatRows(model);
    if (rows.length === 0) return "";

    const values = valuesBlock(rows, ({ game, side, stats }) => [
        ...gameKeyValues(game),
        sqlText(side),
        sqlInteger(stats.teamIndex),
        sqlText(stats.teamName),
        sqlInteger(stats.firstDowns),
        sqlInteger(stats.totalYards),
        sqlInteger(stats.offensiveYards),
        sqlInteger(stats.rushingYards),
        sqlInteger(stats.rushingAttempts),
        sqlInteger(stats.passingYards),
        sqlInteger(stats.completions),
        sqlInteger(stats.passingAttempts),
        sqlInteger(stats.passingTDs),
        sqlInteger(stats.rushingTDs),
        sqlInteger(stats.interceptionsThrown),
        sqlInteger(stats.fumblesLost),
        sqlInteger(stats.giveaways),
        sqlInteger(stats.takeaways),
        sqlNumber(stats.sacks),
        sqlNumber(stats.sacksAllowed),
        sqlInteger(stats.thirdDownConversions),
        sqlInteger(stats.thirdDownAttempts),
        sqlNumber(stats.thirdDownPercentage),
        sqlInteger(stats.fourthDownConversions),
        sqlInteger(stats.fourthDownAttempts),
        sqlNumber(stats.fourthDownPercentage),
        sqlInteger(stats.redZoneTrips),
        sqlInteger(stats.redZoneTDs),
        sqlInteger(stats.redZoneFieldGoals),
        sqlInteger(stats.penalties),
        sqlInteger(stats.penaltyYards),
        sqlInteger(stats.punts),
        sqlInteger(stats.puntYards),
        sqlInteger(stats.possessionTimeSeconds),
        sqlInteger(stats.kickReturnYards),
        sqlInteger(stats.puntReturnYards)
    ]);

    return `
-- -------------------- TEAM BOX-SCORE STATS --------------------

WITH
    ${contextCte(model)},
    data(
        season_index, week_type, week_number, game_number,
        side, team_index, team_name,
        first_downs, total_yards, offensive_yards,
        rushing_yards, rushing_attempts,
        passing_yards, completions, passing_attempts,
        passing_tds, rushing_tds, interceptions_thrown,
        fumbles_lost, giveaways, takeaways,
        sacks, sacks_allowed,
        third_down_conversions, third_down_attempts, third_down_percentage,
        fourth_down_conversions, fourth_down_attempts, fourth_down_percentage,
        red_zone_trips, red_zone_tds, red_zone_field_goals,
        penalties, penalty_yards, punts, punt_yards,
        possession_time_seconds, kick_return_yards, punt_return_yards
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO team_game_stats (
    import_id, game_id, side, team_id, team_index, team_name,
    first_downs, total_yards, offensive_yards,
    rushing_yards, rushing_attempts,
    passing_yards, completions, passing_attempts,
    passing_tds, rushing_tds, interceptions_thrown,
    fumbles_lost, giveaways, takeaways,
    sacks, sacks_allowed,
    third_down_conversions, third_down_attempts, third_down_percentage,
    fourth_down_conversions, fourth_down_attempts, fourth_down_percentage,
    red_zone_trips, red_zone_tds, red_zone_field_goals,
    penalties, penalty_yards, punts, punt_yards,
    possession_time_seconds, kick_return_yards, punt_return_yards
)
SELECT
    ctx.import_id,
    g.game_id,
    data.side,
    team.team_id,
    data.team_index,
    data.team_name,
    data.first_downs, data.total_yards, data.offensive_yards,
    data.rushing_yards, data.rushing_attempts,
    data.passing_yards, data.completions, data.passing_attempts,
    data.passing_tds, data.rushing_tds, data.interceptions_thrown,
    data.fumbles_lost, data.giveaways, data.takeaways,
    data.sacks, data.sacks_allowed,
    data.third_down_conversions, data.third_down_attempts, data.third_down_percentage,
    data.fourth_down_conversions, data.fourth_down_attempts, data.fourth_down_percentage,
    data.red_zone_trips, data.red_zone_tds, data.red_zone_field_goals,
    data.penalties, data.penalty_yards, data.punts, data.punt_yards,
    data.possession_time_seconds, data.kick_return_yards, data.punt_return_yards
FROM data
CROSS JOIN ctx
JOIN seasons AS game_season
  ON game_season.dynasty_id = ctx.dynasty_id
 AND game_season.season_index = data.season_index
JOIN games AS g
  ON g.season_id = game_season.season_id
 AND g.week_type = data.week_type
 AND g.week_number = data.week_number
 AND g.game_number = data.game_number
LEFT JOIN teams AS team
  ON team.dynasty_id = ctx.dynasty_id
 AND team.game_team_index = data.team_index;
`;
}

function buildPlayerGameStatBatchSql(model, rows, batchNumber) {
    if (rows.length === 0) return "";

    const gameByReference = new Map(
        model.gameStorage.games.map(game => [game.seasonGameReference, game])
    );

    const values = valuesBlock(rows, row => {
        const game = gameByReference.get(row.seasonGameReference);
        if (!game) {
            throw new Error(`Player game stat references unknown game ${row.seasonGameReference}`);
        }
        return [
            ...gameKeyValues(game),
            sqlText(row.identityKey),
            sqlText(row.side),
            sqlInteger(row.teamIndex),
            sqlText(row.teamName),
            sqlInteger(row.opponentTeamIndex),
            sqlText(row.opponentTeamName),
            sqlText(row.statCategory),
            sqlJson(row.stats)
        ];
    });

    return `
-- -------------------- PLAYER GAME STAT LINES BATCH ${batchNumber} --------------------

WITH
    ${contextCte(model)},
    data(
        season_index, week_type, week_number, game_number,
        identity_key, side, team_index, team_name,
        opponent_team_index, opponent_team_name,
        stat_category, stats
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO player_game_stat_lines (
    import_id,
    game_id,
    player_id,
    team_id,
    side,
    team_index,
    team_name,
    opponent_team_index,
    opponent_team_name,
    stat_category,
    stats
)
SELECT
    ctx.import_id,
    g.game_id,
    p.player_id,
    team.team_id,
    data.side,
    data.team_index,
    data.team_name,
    data.opponent_team_index,
    data.opponent_team_name,
    data.stat_category,
    data.stats
FROM data
CROSS JOIN ctx
JOIN seasons AS game_season
  ON game_season.dynasty_id = ctx.dynasty_id
 AND game_season.season_index = data.season_index
JOIN games AS g
  ON g.season_id = game_season.season_id
 AND g.week_type = data.week_type
 AND g.week_number = data.week_number
 AND g.game_number = data.game_number
JOIN players AS p
  ON p.dynasty_id = ctx.dynasty_id
 AND p.identity_key = data.identity_key
LEFT JOIN teams AS team
  ON team.dynasty_id = ctx.dynasty_id
 AND team.game_team_index = data.team_index;
`;
}

function scoringRows(model) {
    const rows = [];
    for (const game of model.gameStorage.games) {
        (game.scoringSummary ?? []).forEach((event, index) => {
            rows.push({ game, event, eventOrdinal: index + 1 });
        });
    }
    return rows;
}

function buildScoringSummarySql(model) {
    const rows = scoringRows(model);
    if (rows.length === 0) return "";

    const values = valuesBlock(rows, ({ game, event, eventOrdinal }) => [
        ...gameKeyValues(game),
        sqlInteger(eventOrdinal),
        sqlInteger(event.quarter),
        sqlText(event.quarterDisplay),
        sqlInteger(event.timeRemainingSeconds),
        sqlText(event.scoringSide),
        sqlInteger(event.scoringTeamIndex),
        sqlText(event.scoringTeamName),
        sqlText(event.scoringType),
        sqlInteger(event.rawScoringPoints),
        sqlText(event.conversionType),
        sqlInteger(event.conversionPoints),
        sqlInteger(event.pointsScored),
        sqlInteger(event.homePreviousScore),
        sqlInteger(event.awayPreviousScore),
        sqlInteger(event.homeCurrentScore),
        sqlInteger(event.awayCurrentScore),
        sqlInteger(event.homeScoreAfterPlay),
        sqlInteger(event.awayScoreAfterPlay),
        sqlText(event.homePlayerSnapshotsReference),
        sqlText(event.awayPlayerSnapshotsReference)
    ]);

    return `
-- -------------------- SCORING SUMMARY EVENTS --------------------

WITH
    ${contextCte(model)},
    data(
        season_index, week_type, week_number, game_number,
        event_ordinal, quarter, quarter_display, time_remaining_seconds,
        scoring_side, scoring_team_index, scoring_team_name,
        scoring_type, raw_scoring_points, conversion_type,
        conversion_points, points_scored,
        home_previous_score, away_previous_score,
        home_current_score, away_current_score,
        home_score_after_play, away_score_after_play,
        home_player_snapshots_reference, away_player_snapshots_reference
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO scoring_summary_events (
    import_id, game_id, event_ordinal,
    quarter, quarter_display, time_remaining_seconds,
    scoring_side, scoring_team_id, scoring_team_index, scoring_team_name,
    scoring_type, raw_scoring_points, conversion_type,
    conversion_points, points_scored,
    home_previous_score, away_previous_score,
    home_current_score, away_current_score,
    home_score_after_play, away_score_after_play,
    home_player_snapshots_reference, away_player_snapshots_reference
)
SELECT
    ctx.import_id,
    g.game_id,
    data.event_ordinal,
    data.quarter,
    data.quarter_display,
    data.time_remaining_seconds,
    data.scoring_side,
    scoring_team.team_id,
    data.scoring_team_index,
    data.scoring_team_name,
    data.scoring_type,
    data.raw_scoring_points,
    data.conversion_type,
    data.conversion_points,
    data.points_scored,
    data.home_previous_score,
    data.away_previous_score,
    data.home_current_score,
    data.away_current_score,
    data.home_score_after_play,
    data.away_score_after_play,
    data.home_player_snapshots_reference,
    data.away_player_snapshots_reference
FROM data
CROSS JOIN ctx
JOIN seasons AS game_season
  ON game_season.dynasty_id = ctx.dynasty_id
 AND game_season.season_index = data.season_index
JOIN games AS g
  ON g.season_id = game_season.season_id
 AND g.week_type = data.week_type
 AND g.week_number = data.week_number
 AND g.game_number = data.game_number
LEFT JOIN teams AS scoring_team
  ON scoring_team.dynasty_id = ctx.dynasty_id
 AND scoring_team.game_team_index = data.scoring_team_index;
`;
}

function buildPlayerGameNormalizationSql(model) {
    return `
-- -------------------- NORMALIZE PLAYER GAME STATS --------------------

WITH ${contextCte(model)}
DELETE FROM player_game_stats AS target
USING ctx
WHERE target.import_id = ctx.import_id;

WITH
    ${contextCte(model)},
    stat_data AS (
        SELECT
            lines.import_id,
            lines.game_id,
            lines.player_id,
            lines.stat_category,
            entry.key AS stat_name,
            entry.value AS stat_value_text
        FROM player_game_stat_lines AS lines
        JOIN ctx ON ctx.import_id = lines.import_id
        CROSS JOIN LATERAL jsonb_each_text(lines.stats) AS entry
    )
INSERT INTO player_game_stats (
    import_id,
    game_id,
    player_id,
    stat_category,
    stat_name,
    stat_value
)
SELECT
    import_id,
    game_id,
    player_id,
    stat_category,
    stat_name,
    stat_value_text::numeric
FROM stat_data
WHERE stat_value_text ~ '^-?[0-9]+([.][0-9]+)?$';
`;
}

function buildGameImportSql(model, options = {}) {
    const playerGameBatchSize = options.playerGameBatchSize ?? 2500;

    const sections = [
        buildGameRowsSql(model),
        buildGameSnapshotSql(model),
        buildLineScoreSql(model),
        buildTeamGameStatsSql(model)
    ];

    chunk(model.gameStorage.playerStatLines, playerGameBatchSize).forEach(
        (rows, index) => {
            sections.push(buildPlayerGameStatBatchSql(model, rows, index + 1));
        }
    );

    sections.push(buildScoringSummarySql(model));
    sections.push(buildPlayerGameNormalizationSql(model));

    return sections.filter(Boolean).join("\n");
}

export {
    buildGameImportSql
};
