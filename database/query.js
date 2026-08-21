// -------------------- FIELD INDEX DATABASE READ API --------------------

import { runPsqlCommand } from "./lib/psql.js";
import { sqlInteger, sqlText } from "./lib/sql.js";

function parseJsonResult(text, fallback) {
    if (!text) return fallback;
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`PostgreSQL returned invalid JSON: ${error.message}`);
    }
}

function queryRows(sql, options = {}) {
    const wrapped = `
        SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json)::text
        FROM (
            ${sql}
        ) AS q;
    `;
    return parseJsonResult(runPsqlCommand(wrapped, options), []);
}

function queryOne(sql, options = {}) {
    const wrapped = `
        SELECT COALESCE(row_to_json(q), 'null'::json)::text
        FROM (
            ${sql}
            LIMIT 1
        ) AS q;
    `;
    return parseJsonResult(runPsqlCommand(wrapped, options), null);
}

function listDynasties(options = {}) {
    return queryRows(`
        SELECT
            d.dynasty_id,
            d.dynasty_key,
            d.dynasty_name,
            MIN(s.season_year) AS first_season_year,
            MAX(s.season_year) AS latest_season_year,
            COUNT(DISTINCT s.season_id)::integer AS season_count,
            MAX(si.imported_at) AS last_imported_at
        FROM dynasties AS d
        LEFT JOIN seasons AS s ON s.dynasty_id = d.dynasty_id
        LEFT JOIN save_imports AS si ON si.season_id = s.season_id
        GROUP BY d.dynasty_id, d.dynasty_key, d.dynasty_name
        ORDER BY d.dynasty_name, d.dynasty_id
    `, options);
}

function getDynastyHistory(dynastyKey, options = {}) {
    return queryRows(`
        SELECT
            s.season_id,
            s.season_index,
            s.season_year,
            COUNT(DISTINCT si.import_id)::integer AS import_count,
            MAX(si.imported_at) AS latest_imported_at,
            MAX(si.week_number) FILTER (WHERE si.week_type = 'RegularSeason') AS latest_regular_week,
            MAX(si.offseason_stage) FILTER (WHERE si.week_type = 'OffSeason') AS latest_offseason_stage
        FROM dynasties AS d
        JOIN seasons AS s ON s.dynasty_id = d.dynasty_id
        LEFT JOIN save_imports AS si ON si.season_id = s.season_id
        WHERE d.dynasty_key = ${sqlText(dynastyKey)}
        GROUP BY s.season_id, s.season_index, s.season_year
        ORDER BY s.season_index
    `, options);
}

function getRecentImports(dynastyKey, limit = 25, options = {}) {
    const safeLimit = Math.max(1, Math.min(250, Number(limit) || 25));
    return queryRows(`
        SELECT
            si.import_id,
            s.season_index,
            s.season_year,
            rs.season_index AS roster_season_index,
            rs.season_year AS roster_season_year,
            si.week_type,
            si.week_number,
            si.offseason_stage,
            si.source_file_name,
            si.file_hash,
            si.parser_version,
            si.imported_at,
            si.last_seen_at
        FROM dynasties AS d
        JOIN seasons AS s ON s.dynasty_id = d.dynasty_id
        JOIN save_imports AS si ON si.season_id = s.season_id
        LEFT JOIN seasons AS rs ON rs.season_id = si.roster_season_id
        WHERE d.dynasty_key = ${sqlText(dynastyKey)}
        ORDER BY si.imported_at DESC, si.import_id DESC
        LIMIT ${safeLimit}
    `, options);
}

function getPlayerCareer(playerId, options = {}) {
    return queryRows(`
        SELECT *
        FROM analytics.player_history
        WHERE player_id = ${sqlInteger(playerId)}
        ORDER BY season_index, imported_at
    `, options);
}

function getCoachHistory(coachId, options = {}) {
    return queryRows(`
        SELECT *
        FROM analytics.coach_history
        WHERE coach_id = ${sqlInteger(coachId)}
        ORDER BY season_index
    `, options);
}

function getCoachCareer(coachId, options = {}) {
    return queryOne(`
        SELECT *
        FROM analytics.coach_careers
        WHERE coach_id = ${sqlInteger(coachId)}
    `, options);
}

function getCoachTalentHistory(dynastyKey, options = {}) {
    const coachClause = options.coachId == null ? "" : `AND cth.coach_id = ${sqlInteger(options.coachId)}`;
    const seasonClause = options.seasonIndex == null ? "" : `AND cth.season_index = ${sqlInteger(options.seasonIndex)}`;
    const treeClause = options.tree == null ? "" : `AND (LOWER(cth.tree_internal_name) = LOWER(${sqlText(options.tree)}) OR LOWER(cth.tree_display_name) = LOWER(${sqlText(options.tree)}))`;
    return queryRows(`
        SELECT cth.*
        FROM analytics.coach_talent_tree_history AS cth
        WHERE cth.dynasty_key = ${sqlText(dynastyKey)}
        ${coachClause}
        ${seasonClause}
        ${treeClause}
        ORDER BY cth.season_index, cth.import_id, cth.coach_name, cth.tree_index
    `, options);
}

function getCoachTalentNodeHistory(dynastyKey, options = {}) {
    const coachClause = options.coachId == null ? "" : `AND cnh.coach_id = ${sqlInteger(options.coachId)}`;
    const seasonClause = options.seasonIndex == null ? "" : `AND cnh.season_index = ${sqlInteger(options.seasonIndex)}`;
    const treeClause = options.tree == null ? "" : `AND (LOWER(cnh.tree_internal_name) = LOWER(${sqlText(options.tree)}) OR LOWER(cnh.tree_display_name) = LOWER(${sqlText(options.tree)}))`;
    const talentClause = options.talentIndex == null ? "" : `AND cnh.talent_index = ${sqlInteger(options.talentIndex)}`;
    const statusClause = options.status == null ? "" : `AND cnh.talent_status = ${sqlText(options.status)}`;
    const nameClause = options.abilityName == null ? "" : `AND LOWER(COALESCE(cnh.ability_name, '')) = LOWER(${sqlText(options.abilityName)})`;
    const latestSource = options.latestOnly === true
        ? "analytics.latest_coach_talent_nodes"
        : "analytics.coach_talent_node_history";
    return queryRows(`
        SELECT cnh.*
        FROM ${latestSource} AS cnh
        WHERE cnh.dynasty_key = ${sqlText(dynastyKey)}
        ${coachClause}
        ${seasonClause}
        ${treeClause}
        ${talentClause}
        ${statusClause}
        ${nameClause}
        ORDER BY cnh.season_index, cnh.import_id, cnh.coach_name, cnh.tree_index, cnh.talent_index
    `, options);
}

function getTeamHistory(dynastyKey, teamIndex, options = {}) {
    return queryRows(`
        SELECT th.*
        FROM analytics.team_history AS th
        WHERE th.dynasty_key = ${sqlText(dynastyKey)}
          AND th.game_team_index = ${sqlInteger(teamIndex)}
        ORDER BY th.season_index
    `, options);
}

function getTransfers(dynastyKey, options = {}) {
    const teamClause = options.teamIndex == null
        ? ""
        : `AND (
            pt.from_team_id IN (
                SELECT t.team_id
                FROM teams AS t
                JOIN dynasties AS td ON td.dynasty_id = t.dynasty_id
                WHERE td.dynasty_key = ${sqlText(dynastyKey)}
                  AND t.game_team_index = ${sqlInteger(options.teamIndex)}
            )
            OR pt.to_team_id IN (
                SELECT t.team_id
                FROM teams AS t
                JOIN dynasties AS td ON td.dynasty_id = t.dynasty_id
                WHERE td.dynasty_key = ${sqlText(dynastyKey)}
                  AND t.game_team_index = ${sqlInteger(options.teamIndex)}
            )
        )`;
    return queryRows(`
        SELECT pt.*
        FROM analytics.player_transfers AS pt
        WHERE pt.dynasty_key = ${sqlText(dynastyKey)}
        ${teamClause}
        ORDER BY pt.season_index, pt.player_name
    `, options);
}

function getRankingHistory(dynastyKey, options = {}) {
    const pollClause = options.poll ? `AND rh.poll_type = ${sqlText(options.poll)}` : "";
    const teamClause = options.teamIndex == null ? "" : `AND rh.team_index = ${sqlInteger(options.teamIndex)}`;
    const seasonClause = options.seasonIndex == null ? "" : `AND rh.season_index = ${sqlInteger(options.seasonIndex)}`;
    return queryRows(`
        SELECT rh.*
        FROM analytics.ranking_history AS rh
        WHERE rh.dynasty_key = ${sqlText(dynastyKey)}
        ${pollClause}
        ${teamClause}
        ${seasonClause}
        ORDER BY rh.season_index, rh.import_id, rh.poll_type, rh.rank
    `, options);
}

function getRecruitingHistory(dynastyKey, options = {}) {
    const classClause = options.classSeasonYear == null
        ? ""
        : `AND rh.class_season_year = ${sqlInteger(options.classSeasonYear)}`;
    const teamClause = options.teamIndex == null
        ? ""
        : `AND signed_team.game_team_index = ${sqlInteger(options.teamIndex)}`;
    const signedClause = options.signed == null ? "" : `AND rh.is_signed = ${options.signed ? "TRUE" : "FALSE"}`;
    const transferClause = options.transfersOnly ? "AND rh.is_transfer = TRUE" : "";
    return queryRows(`
        SELECT
            rh.*,
            rrm.matched_player_id AS resolved_player_id,
            rrm.match_strategy AS resolved_match_strategy,
            rrm.candidate_count AS resolved_match_candidate_count
        FROM analytics.recruiting_history AS rh
        LEFT JOIN teams AS signed_team ON signed_team.team_id = rh.signed_team_id
        LEFT JOIN analytics.recruiting_roster_matches AS rrm ON rrm.recruit_id = rh.recruit_id
        WHERE rh.dynasty_key = ${sqlText(dynastyKey)}
        ${classClause}
        ${teamClause}
        ${signedClause}
        ${transferClause}
        ORDER BY rh.class_season_year, rh.national_rank NULLS LAST, rh.player_display_name
    `, options);
}

function getRecruitingClasses(dynastyKey, options = {}) {
    const yearClause = options.classSeasonYear == null
        ? ""
        : `AND rc.class_season_year = ${sqlInteger(options.classSeasonYear)}`;
    return queryRows(`
        SELECT rc.*
        FROM analytics.recruiting_classes AS rc
        WHERE rc.dynasty_key = ${sqlText(dynastyKey)}
        ${yearClause}
        ORDER BY rc.class_season_year, rc.signed_count DESC, rc.average_star_rating DESC NULLS LAST
    `, options);
}

function getRecruitingClassRankingHistory(dynastyKey, options = {}) {
    const yearClause = options.classSeasonYear == null
        ? ""
        : `AND rcrh.class_season_year = ${sqlInteger(options.classSeasonYear)}`;
    const teamClause = options.teamIndex == null
        ? ""
        : `AND rcrh.team_index = ${sqlInteger(options.teamIndex)}`;
    const latestClause = options.latestOnly === true
        ? "analytics.latest_recruiting_class_rankings"
        : "analytics.recruiting_class_ranking_history";
    return queryRows(`
        SELECT rcrh.*
        FROM ${latestClause} AS rcrh
        WHERE rcrh.dynasty_key = ${sqlText(dynastyKey)}
        ${yearClause}
        ${teamClause}
        ORDER BY rcrh.class_season_year, rcrh.imported_at, rcrh.rank, rcrh.team_name
    `, options);
}

function getDepthChartHistory(dynastyKey, options = {}) {
    const teamClause = options.teamIndex == null ? "" : `AND dch.team_index = ${sqlInteger(options.teamIndex)}`;
    const seasonClause = options.seasonIndex == null ? "" : `AND dch.season_index = ${sqlInteger(options.seasonIndex)}`;
    const positionClause = options.position ? `AND dch.position_key = ${sqlText(String(options.position).toUpperCase())}` : "";
    return queryRows(`
        SELECT dch.*
        FROM analytics.depth_chart_history AS dch
        WHERE dch.dynasty_key = ${sqlText(dynastyKey)}
        ${teamClause}
        ${seasonClause}
        ${positionClause}
        ORDER BY dch.season_index, dch.import_id, dch.team_index, dch.position_key, dch.depth
    `, options);
}

function getPostseasonHistory(dynastyKey, options = {}) {
    return queryRows(`
        SELECT *
        FROM analytics.postseason_history
        WHERE dynasty_key = ${sqlText(dynastyKey)}
        ORDER BY season_index, import_id
    `, options);
}

function getPostseasonGames(dynastyKey, options = {}) {
    const seasonClause = options.seasonIndex == null ? "" : `AND pg.season_index = ${sqlInteger(options.seasonIndex)}`;
    const typeClause = options.type ? `AND pg.postseason_game_type = ${sqlText(options.type)}` : "";
    return queryRows(`
        SELECT pg.*
        FROM analytics.postseason_games AS pg
        WHERE pg.dynasty_key = ${sqlText(dynastyKey)}
        ${seasonClause}
        ${typeClause}
        ORDER BY pg.season_index, pg.week_type, pg.week_number, pg.source_season_game_row
    `, options);
}

function getChampionshipHistory(dynastyKey, options = {}) {
    return queryRows(`
        SELECT *
        FROM analytics.championship_history
        WHERE dynasty_key = ${sqlText(dynastyKey)}
        ORDER BY season_index, import_id
    `, options);
}

function getAwardHistory(dynastyKey, options = {}) {
    const awardClause = options.awardType ? `AND ah.award_type = ${sqlText(options.awardType)}` : "";
    const entityClause = options.entityType ? `AND ah.entity_type = ${sqlText(options.entityType)}` : "";
    return queryRows(`
        SELECT ah.*
        FROM analytics.award_history AS ah
        WHERE ah.dynasty_key = ${sqlText(dynastyKey)}
        ${awardClause}
        ${entityClause}
        ORDER BY ah.season_index, ah.award_type, ah.award_ordinal
    `, options);
}

function getGames(dynastyKey, options = {}) {
    const seasonClause = options.seasonIndex == null ? "" : `AND g.season_index = ${sqlInteger(options.seasonIndex)}`;
    const teamClause = options.teamIndex == null ? "" : `AND (g.home_team_index = ${sqlInteger(options.teamIndex)} OR g.away_team_index = ${sqlInteger(options.teamIndex)})`;
    return queryRows(`
        SELECT g.*
        FROM analytics.games AS g
        WHERE g.dynasty_key = ${sqlText(dynastyKey)}
        ${seasonClause}
        ${teamClause}
        ORDER BY g.season_index, g.week_type, g.week_number, g.source_season_game_row
    `, options);
}

function getDynastySummary(dynastyKey, options = {}) {
    return queryOne(`
        SELECT
            d.dynasty_id,
            d.dynasty_key,
            d.dynasty_name,
            (SELECT COUNT(*)::integer FROM seasons AS s WHERE s.dynasty_id = d.dynasty_id) AS seasons,
            (SELECT COUNT(*)::integer FROM players AS p WHERE p.dynasty_id = d.dynasty_id) AS players_seen,
            (SELECT COUNT(*)::integer FROM coaches AS c WHERE c.dynasty_id = d.dynasty_id) AS coaches_seen,
            (
                SELECT COUNT(*)::integer
                FROM games AS g
                JOIN seasons AS s ON s.season_id = g.season_id
                WHERE s.dynasty_id = d.dynasty_id
            ) AS games_stored,
            (SELECT COUNT(*)::integer FROM recruiting_prospects AS rp WHERE rp.dynasty_id = d.dynasty_id) AS recruits_seen,
            (
                SELECT MAX(si.imported_at)
                FROM save_imports AS si
                JOIN seasons AS s ON s.season_id = si.season_id
                WHERE s.dynasty_id = d.dynasty_id
            ) AS last_imported_at
        FROM dynasties AS d
        WHERE d.dynasty_key = ${sqlText(dynastyKey)}
    `, options);
}

export {
    getAwardHistory,
    getChampionshipHistory,
    getCoachCareer,
    getCoachHistory,
    getCoachTalentHistory,
    getCoachTalentNodeHistory,
    getDepthChartHistory,
    getDynastyHistory,
    getDynastySummary,
    getGames,
    getPlayerCareer,
    getPostseasonGames,
    getPostseasonHistory,
    getRankingHistory,
    getRecentImports,
    getRecruitingClasses,
    getRecruitingClassRankingHistory,
    getRecruitingHistory,
    getTeamHistory,
    getTransfers,
    listDynasties,
    queryOne,
    queryRows
};
