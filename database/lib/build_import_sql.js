// -------------------- FIELD INDEX POSTGRESQL IMPORT SQL --------------------

import {
    chunk,
    sqlBoolean,
    sqlInteger,
    sqlJson,
    sqlText,
    sqlTimestamp
} from "./sql.js";

import { buildGameImportSql } from "./build_game_import_sql.js";

function valuesBlock(rows, rowBuilder) {
    return rows.map(row => `(${rowBuilder(row).join(", ")})`).join(",\n        ");
}

function contextCte(model) {
    return `ctx AS (
        SELECT
            d.dynasty_id,
            import_season.season_id AS import_season_id,
            roster_season.season_id AS roster_season_id,
            si.import_id
        FROM dynasties AS d
        JOIN seasons AS import_season
          ON import_season.dynasty_id = d.dynasty_id
         AND import_season.season_index = ${sqlInteger(model.metadata.currentSeasonIndex)}
        JOIN save_imports AS si
          ON si.season_id = import_season.season_id
         AND si.file_hash = ${sqlText(model.source.fileHash)}
        JOIN seasons AS roster_season
          ON roster_season.season_id = si.roster_season_id
        WHERE d.dynasty_key = ${sqlText(model.dynastyKey)}
    )`;
}

function buildDynastySeasonImportSql(model) {
    return `
-- -------------------- DYNASTY / SEASON / IMPORT --------------------

SELECT pg_advisory_xact_lock(hashtext(${sqlText(`field-index:${model.dynastyKey}`)})::bigint);

DO $field_index$
DECLARE
    unkeyed_match_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM dynasties WHERE dynasty_key = ${sqlText(model.dynastyKey)}
    ) THEN
        SELECT COUNT(*) INTO unkeyed_match_count
        FROM dynasties
        WHERE dynasty_key IS NULL
          AND dynasty_name = ${sqlText(model.dynastyName)};

        IF unkeyed_match_count = 1 THEN
            UPDATE dynasties
            SET dynasty_key = ${sqlText(model.dynastyKey)}
            WHERE dynasty_key IS NULL
              AND dynasty_name = ${sqlText(model.dynastyName)};
        ELSIF unkeyed_match_count = 0 THEN
            INSERT INTO dynasties (dynasty_name, dynasty_key)
            VALUES (${sqlText(model.dynastyName)}, ${sqlText(model.dynastyKey)});
        ELSE
            RAISE EXCEPTION
                'More than one unkeyed dynasty named %. Assign a unique dynasty_key before importing.',
                ${sqlText(model.dynastyName)};
        END IF;
    END IF;
END
$field_index$;

UPDATE dynasties
SET dynasty_name = ${sqlText(model.dynastyName)}
WHERE dynasty_key = ${sqlText(model.dynastyKey)};

INSERT INTO seasons (dynasty_id, season_index, season_year)
SELECT
    dynasty_id,
    ${sqlInteger(model.metadata.currentSeasonIndex)},
    ${sqlInteger(model.metadata.currentSeasonYear)}
FROM dynasties
WHERE dynasty_key = ${sqlText(model.dynastyKey)}
ON CONFLICT (dynasty_id, season_index)
DO UPDATE SET season_year = EXCLUDED.season_year;

INSERT INTO seasons (dynasty_id, season_index, season_year)
SELECT
    dynasty_id,
    ${sqlInteger(model.metadata.rosterSeasonIndex)},
    ${sqlInteger(model.metadata.rosterSeasonYear)}
FROM dynasties
WHERE dynasty_key = ${sqlText(model.dynastyKey)}
ON CONFLICT (dynasty_id, season_index)
DO UPDATE SET season_year = EXCLUDED.season_year;

INSERT INTO save_imports (
    season_id,
    roster_season_id,
    week_number,
    week_type,
    offseason_stage,
    source_file_name,
    file_hash,
    file_size_bytes,
    source_modified_at,
    backend_schema_major,
    backend_schema_minor,
    game_year,
    parser_version,
    last_seen_at
)
SELECT
    s.season_id,
    roster_season.season_id,
    ${sqlInteger(model.metadata.currentWeek)},
    ${sqlText(model.metadata.currentWeekType)},
    ${sqlInteger(model.metadata.currentOffseasonStage)},
    ${sqlText(model.source.fileName)},
    ${sqlText(model.source.fileHash)},
    ${sqlInteger(model.source.fileSizeBytes)},
    ${sqlTimestamp(model.source.modifiedAt)},
    ${sqlInteger(model.metadata.schema.major)},
    ${sqlInteger(model.metadata.schema.minor)},
    ${sqlInteger(model.metadata.gameYear)},
    ${sqlText(model.source.parserVersion)},
    CURRENT_TIMESTAMP
FROM seasons AS s
JOIN dynasties AS d ON d.dynasty_id = s.dynasty_id
JOIN seasons AS roster_season
  ON roster_season.dynasty_id = d.dynasty_id
 AND roster_season.season_index = ${sqlInteger(model.metadata.rosterSeasonIndex)}
WHERE d.dynasty_key = ${sqlText(model.dynastyKey)}
  AND s.season_index = ${sqlInteger(model.metadata.currentSeasonIndex)}
ON CONFLICT (season_id, file_hash)
DO UPDATE SET
    roster_season_id = EXCLUDED.roster_season_id,
    week_number = EXCLUDED.week_number,
    week_type = EXCLUDED.week_type,
    offseason_stage = EXCLUDED.offseason_stage,
    source_file_name = EXCLUDED.source_file_name,
    file_size_bytes = EXCLUDED.file_size_bytes,
    source_modified_at = EXCLUDED.source_modified_at,
    backend_schema_major = EXCLUDED.backend_schema_major,
    backend_schema_minor = EXCLUDED.backend_schema_minor,
    game_year = EXCLUDED.game_year,
    parser_version = EXCLUDED.parser_version,
    last_seen_at = CURRENT_TIMESTAMP;
`;
}

function buildTeamSql(model) {
    const teamValues = valuesBlock(model.teams, team => [
        sqlInteger(team.teamIndex),
        sqlText(team.teamName),
        sqlText(team.nickName),
        sqlText(team.abbreviation),
        sqlText(team.assetName),
        sqlBoolean(team.isTeamBuilder)
    ]);

    const conferenceValues = valuesBlock(model.conferences, conference => [
        sqlText(conference.conferenceEnum),
        sqlText(conference.name),
        sqlText(conference.assetName),
        sqlText(conference.styleName)
    ]);

    const teamSeasonValues = valuesBlock(model.teams, team => {
        const conference = model.conferenceByTeamIndex.get(team.teamIndex);
        return [
            sqlInteger(team.teamIndex),
            sqlText(conference?.conferenceEnum ?? null)
        ];
    });

    const teamSnapshotValues = valuesBlock(model.teams, team => [
        sqlInteger(team.teamIndex),
        sqlInteger(team.prestige),
        sqlInteger(team.overallRating),
        sqlInteger(team.offensiveRating),
        sqlInteger(team.defensiveRating),
        sqlInteger(team.teamRank),
        sqlInteger(team.conferenceStanding),
        sqlInteger(team.wins),
        sqlInteger(team.losses),
        sqlInteger(team.conferenceWins),
        sqlInteger(team.conferenceLosses),
        sqlInteger(team.nonConferenceWins),
        sqlInteger(team.nonConferenceLosses),
        sqlText(team.playoffStatus),
        sqlText(team.playoffRoundReached),
        sqlJson(team.programPointGrades ?? {}),
        sqlJson(team.mySchoolGrades ?? {}),
        sqlJson(team.playingStyleGrades ?? {})
    ]);

    return `
-- -------------------- TEAMS / CONFERENCES / TEAM SEASONS --------------------

WITH
    ${contextCte(model)},
    data(
        game_team_index,
        school_name,
        nickname,
        abbreviation,
        asset_name,
        is_team_builder
    ) AS (
        VALUES
        ${teamValues}
    )
INSERT INTO teams (
    dynasty_id,
    game_team_index,
    school_name,
    nickname,
    abbreviation,
    asset_name,
    is_team_builder
)
SELECT
    ctx.dynasty_id,
    data.game_team_index,
    data.school_name,
    data.nickname,
    data.abbreviation,
    data.asset_name,
    data.is_team_builder
FROM data
CROSS JOIN ctx
ON CONFLICT (dynasty_id, game_team_index)
DO UPDATE SET
    school_name = EXCLUDED.school_name,
    nickname = EXCLUDED.nickname,
    abbreviation = EXCLUDED.abbreviation,
    asset_name = EXCLUDED.asset_name,
    is_team_builder = EXCLUDED.is_team_builder;

INSERT INTO conferences (game_conference_enum, conference_name, asset_name, style_name)
VALUES
        ${conferenceValues}
ON CONFLICT (game_conference_enum)
DO UPDATE SET
    conference_name = EXCLUDED.conference_name,
    asset_name = EXCLUDED.asset_name,
    style_name = EXCLUDED.style_name;

WITH
    ${contextCte(model)},
    data(game_team_index, game_conference_enum) AS (
        VALUES
        ${teamSeasonValues}
    )
INSERT INTO team_seasons (season_id, team_id, conference_id)
SELECT
    ctx.roster_season_id,
    t.team_id,
    c.conference_id
FROM data
CROSS JOIN ctx
JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.game_team_index
LEFT JOIN conferences AS c
  ON c.game_conference_enum = data.game_conference_enum
ON CONFLICT (season_id, team_id)
DO UPDATE SET conference_id = EXCLUDED.conference_id;

WITH
    ${contextCte(model)},
    data(
        game_team_index,
        prestige,
        overall_rating,
        offensive_rating,
        defensive_rating,
        team_rank,
        conference_standing,
        wins,
        losses,
        conference_wins,
        conference_losses,
        nonconference_wins,
        nonconference_losses,
        playoff_status,
        playoff_round_reached,
        program_point_grades,
        my_school_grades,
        playing_style_grades
    ) AS (
        VALUES
        ${teamSnapshotValues}
    )
INSERT INTO team_import_snapshots (
    import_id,
    team_season_id,
    prestige,
    overall_rating,
    offensive_rating,
    defensive_rating,
    team_rank,
    conference_standing,
    wins,
    losses,
    conference_wins,
    conference_losses,
    nonconference_wins,
    nonconference_losses,
    playoff_status,
    playoff_round_reached,
    program_point_grades,
    my_school_grades,
    playing_style_grades
)
SELECT
    ctx.import_id,
    ts.team_season_id,
    data.prestige,
    data.overall_rating,
    data.offensive_rating,
    data.defensive_rating,
    data.team_rank,
    data.conference_standing,
    data.wins,
    data.losses,
    data.conference_wins,
    data.conference_losses,
    data.nonconference_wins,
    data.nonconference_losses,
    data.playoff_status,
    data.playoff_round_reached,
    data.program_point_grades,
    data.my_school_grades,
    data.playing_style_grades
FROM data
CROSS JOIN ctx
JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.game_team_index
JOIN team_seasons AS ts
  ON ts.season_id = ctx.roster_season_id
 AND ts.team_id = t.team_id
ON CONFLICT (import_id, team_season_id)
DO UPDATE SET
    prestige = EXCLUDED.prestige,
    overall_rating = EXCLUDED.overall_rating,
    offensive_rating = EXCLUDED.offensive_rating,
    defensive_rating = EXCLUDED.defensive_rating,
    team_rank = EXCLUDED.team_rank,
    conference_standing = EXCLUDED.conference_standing,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    conference_wins = EXCLUDED.conference_wins,
    conference_losses = EXCLUDED.conference_losses,
    nonconference_wins = EXCLUDED.nonconference_wins,
    nonconference_losses = EXCLUDED.nonconference_losses,
    playoff_status = EXCLUDED.playoff_status,
    playoff_round_reached = EXCLUDED.playoff_round_reached,
    program_point_grades = EXCLUDED.program_point_grades,
    my_school_grades = EXCLUDED.my_school_grades,
    playing_style_grades = EXCLUDED.playing_style_grades;
`;
}

function buildPlayerBatchSql(model, players, batchNumber) {
    const entityValues = valuesBlock(players, player => [
        sqlText(player.identityKey),
        sqlText(player.identityStrategy),
        sqlInteger(player.identity?.presentationId),
        sqlText(player.identity?.assetName),
        sqlInteger(player.identity?.birthDateRaw),
        sqlText(player.firstName),
        sqlText(player.lastName),
        sqlText(player.hometown),
        sqlText(player.homeState)
    ]);

    const seasonValues = valuesBlock(players, player => [
        sqlText(player.identityKey),
        sqlInteger(player.teamIndex),
        sqlInteger(player.previousTeamIndex)
    ]);

    const snapshotValues = valuesBlock(players, player => [
        sqlText(player.identityKey),
        sqlInteger(player.teamIndex),
        sqlText(player.firstName),
        sqlText(player.lastName),
        sqlText(player.hometown),
        sqlText(player.homeState),
        sqlInteger(player.jerseyNumber),
        sqlText(player.position),
        sqlText(player.classYear),
        sqlText(player.redshirtStatus),
        sqlInteger(player.overallRating),
        sqlInteger(player.heightInches),
        sqlInteger(player.weight),
        sqlInteger(player.consecutiveYearsWithTeam),
        sqlBoolean(player.isTransfer),
        sqlBoolean(player.isCurrentSeasonTransfer),
        sqlInteger(player.abilities?.skillPoints),
        sqlInteger(player.abilities?.experiencePoints),
        sqlText(player.abilities?.developmentTrait),
        sqlJson(player.attributes ?? {}),
        sqlJson(player.abilities ?? {}),
        sqlJson(player.appearance ?? {})
    ]);

    return `
-- -------------------- PLAYER BATCH ${batchNumber} --------------------

WITH
    ${contextCte(model)},
    data(
        identity_key,
        identity_strategy,
        presentation_id,
        asset_name,
        birth_date_raw,
        first_name,
        last_name,
        hometown,
        home_state
    ) AS (
        VALUES
        ${entityValues}
    )
INSERT INTO players (
    dynasty_id,
    identity_key,
    identity_strategy,
    presentation_id,
    asset_name,
    birth_date_raw,
    first_name,
    last_name,
    hometown,
    home_state,
    first_seen_import_id,
    last_seen_import_id,
    updated_at
)
SELECT
    ctx.dynasty_id,
    data.identity_key,
    data.identity_strategy,
    data.presentation_id,
    data.asset_name,
    data.birth_date_raw,
    data.first_name,
    data.last_name,
    data.hometown,
    data.home_state,
    ctx.import_id,
    ctx.import_id,
    CURRENT_TIMESTAMP
FROM data
CROSS JOIN ctx
ON CONFLICT (dynasty_id, identity_key)
DO UPDATE SET
    identity_strategy = EXCLUDED.identity_strategy,
    presentation_id = COALESCE(EXCLUDED.presentation_id, players.presentation_id),
    asset_name = COALESCE(EXCLUDED.asset_name, players.asset_name),
    birth_date_raw = COALESCE(EXCLUDED.birth_date_raw, players.birth_date_raw),
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    hometown = EXCLUDED.hometown,
    home_state = EXCLUDED.home_state,
    last_seen_import_id = EXCLUDED.last_seen_import_id,
    updated_at = CURRENT_TIMESTAMP;

WITH
    ${contextCte(model)},
    data(identity_key, game_team_index, previous_team_index) AS (
        VALUES
        ${seasonValues}
    )
INSERT INTO player_seasons (
    season_id,
    player_id,
    team_season_id,
    previous_team_id,
    first_seen_import_id,
    last_seen_import_id
)
SELECT
    ctx.roster_season_id,
    p.player_id,
    ts.team_season_id,
    previous_team.team_id,
    ctx.import_id,
    ctx.import_id
FROM data
CROSS JOIN ctx
JOIN players AS p
  ON p.dynasty_id = ctx.dynasty_id
 AND p.identity_key = data.identity_key
JOIN teams AS current_team
  ON current_team.dynasty_id = ctx.dynasty_id
 AND current_team.game_team_index = data.game_team_index
JOIN team_seasons AS ts
  ON ts.season_id = ctx.roster_season_id
 AND ts.team_id = current_team.team_id
LEFT JOIN teams AS previous_team
  ON previous_team.dynasty_id = ctx.dynasty_id
 AND previous_team.game_team_index = data.previous_team_index
ON CONFLICT (season_id, player_id)
DO UPDATE SET
    team_season_id = EXCLUDED.team_season_id,
    previous_team_id = EXCLUDED.previous_team_id,
    last_seen_import_id = EXCLUDED.last_seen_import_id;

WITH
    ${contextCte(model)},
    data(
        identity_key,
        game_team_index,
        first_name,
        last_name,
        hometown,
        home_state,
        jersey_number,
        position,
        class_year,
        redshirt_status,
        overall_rating,
        height_inches,
        weight_pounds,
        consecutive_years_with_team,
        is_transfer,
        is_current_season_transfer,
        skill_points,
        experience_points,
        development_trait,
        attributes,
        abilities,
        appearance
    ) AS (
        VALUES
        ${snapshotValues}
    )
INSERT INTO player_import_snapshots (
    import_id,
    player_season_id,
    team_season_id,
    first_name,
    last_name,
    hometown,
    home_state,
    jersey_number,
    position,
    class_year,
    redshirt_status,
    overall_rating,
    height_inches,
    weight_pounds,
    consecutive_years_with_team,
    is_transfer,
    is_current_season_transfer,
    skill_points,
    experience_points,
    development_trait,
    attributes,
    abilities,
    appearance
)
SELECT
    ctx.import_id,
    ps.player_season_id,
    ts.team_season_id,
    data.first_name,
    data.last_name,
    data.hometown,
    data.home_state,
    data.jersey_number,
    data.position,
    data.class_year,
    data.redshirt_status,
    data.overall_rating,
    data.height_inches,
    data.weight_pounds,
    data.consecutive_years_with_team,
    data.is_transfer,
    data.is_current_season_transfer,
    data.skill_points,
    data.experience_points,
    data.development_trait,
    data.attributes,
    data.abilities,
    data.appearance
FROM data
CROSS JOIN ctx
JOIN players AS p
  ON p.dynasty_id = ctx.dynasty_id
 AND p.identity_key = data.identity_key
JOIN player_seasons AS ps
  ON ps.season_id = ctx.roster_season_id
 AND ps.player_id = p.player_id
JOIN teams AS current_team
  ON current_team.dynasty_id = ctx.dynasty_id
 AND current_team.game_team_index = data.game_team_index
JOIN team_seasons AS ts
  ON ts.season_id = ctx.roster_season_id
 AND ts.team_id = current_team.team_id
ON CONFLICT (import_id, player_season_id)
DO UPDATE SET
    team_season_id = EXCLUDED.team_season_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    hometown = EXCLUDED.hometown,
    home_state = EXCLUDED.home_state,
    jersey_number = EXCLUDED.jersey_number,
    position = EXCLUDED.position,
    class_year = EXCLUDED.class_year,
    redshirt_status = EXCLUDED.redshirt_status,
    overall_rating = EXCLUDED.overall_rating,
    height_inches = EXCLUDED.height_inches,
    weight_pounds = EXCLUDED.weight_pounds,
    consecutive_years_with_team = EXCLUDED.consecutive_years_with_team,
    is_transfer = EXCLUDED.is_transfer,
    is_current_season_transfer = EXCLUDED.is_current_season_transfer,
    skill_points = EXCLUDED.skill_points,
    experience_points = EXCLUDED.experience_points,
    development_trait = EXCLUDED.development_trait,
    attributes = EXCLUDED.attributes,
    abilities = EXCLUDED.abilities,
    appearance = EXCLUDED.appearance;
`;
}

function buildCoachBatchSql(model, coaches, batchNumber) {
    const entityValues = valuesBlock(coaches, coach => [
        sqlText(coach.identityKey),
        sqlText(coach.identityStrategy),
        sqlInteger(coach.identity?.presentationId),
        sqlInteger(coach.coachRow),
        sqlText(coach.identity?.assetName),
        sqlText(coach.firstName),
        sqlText(coach.lastName),
        sqlText(coach.identity?.homeTown),
        sqlText(coach.identity?.homeState),
        sqlInteger(coach.identity?.almaMater)
    ]);

    const seasonValues = valuesBlock(coaches, coach => [
        sqlText(coach.identityKey),
        sqlInteger(coach.teamIndex === 255 ? null : coach.teamIndex),
        sqlText(coach.role)
    ]);

    const snapshotValues = valuesBlock(coaches, coach => [
        sqlText(coach.identityKey),
        sqlInteger(coach.teamIndex === 255 ? null : coach.teamIndex),
        sqlText(coach.role),
        sqlText(coach.position),
        sqlText(coach.firstName),
        sqlText(coach.lastName),
        sqlInteger(coach.age),
        sqlInteger(coach.yearsCoaching),
        sqlInteger(coach.seasonsWithTeam),
        sqlInteger(coach.level),
        sqlText(coach.coachPrestige),
        sqlInteger(coach.coachPrestigeScore),
        sqlInteger(coach.coachPoints),
        sqlInteger(coach.experiencePoints),
        sqlText(coach.specialty),
        sqlText(coach.dominantArchetype),
        sqlInteger(coach.almaMater),
        sqlText(coach.contractStatus),
        sqlInteger(coach.contractYearsRemaining),
        sqlText(coach.jobSecurityStatus),
        sqlInteger(coach.jobSecurityPercentage),
        sqlBoolean(coach.isUserControlled),
        sqlJson(coach.appearance ?? {}),
        sqlJson(coach.seasonStats),
        sqlJson(coach.careerStats)
    ]);

    return `
-- -------------------- COACH BATCH ${batchNumber} --------------------

WITH
    ${contextCte(model)},
    data(
        identity_key,
        identity_strategy,
        presentation_id,
        source_coach_row,
        asset_name,
        first_name,
        last_name,
        home_town,
        home_state,
        alma_mater
    ) AS (
        VALUES
        ${entityValues}
    )
INSERT INTO coaches (
    dynasty_id,
    identity_key,
    identity_strategy,
    presentation_id,
    source_coach_row,
    asset_name,
    first_name,
    last_name,
    home_town,
    home_state,
    alma_mater,
    first_seen_import_id,
    last_seen_import_id,
    updated_at
)
SELECT
    ctx.dynasty_id,
    data.identity_key,
    data.identity_strategy,
    data.presentation_id,
    data.source_coach_row,
    data.asset_name,
    data.first_name,
    data.last_name,
    data.home_town,
    data.home_state,
    data.alma_mater,
    ctx.import_id,
    ctx.import_id,
    CURRENT_TIMESTAMP
FROM data
CROSS JOIN ctx
ON CONFLICT (dynasty_id, identity_key)
DO UPDATE SET
    identity_strategy = EXCLUDED.identity_strategy,
    presentation_id = COALESCE(EXCLUDED.presentation_id, coaches.presentation_id),
    source_coach_row = EXCLUDED.source_coach_row,
    asset_name = COALESCE(EXCLUDED.asset_name, coaches.asset_name),
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    home_town = EXCLUDED.home_town,
    home_state = EXCLUDED.home_state,
    alma_mater = EXCLUDED.alma_mater,
    last_seen_import_id = EXCLUDED.last_seen_import_id,
    updated_at = CURRENT_TIMESTAMP;

WITH
    ${contextCte(model)},
    data(identity_key, game_team_index, role) AS (
        VALUES
        ${seasonValues}
    )
INSERT INTO coach_seasons (
    season_id,
    coach_id,
    team_season_id,
    role,
    first_seen_import_id,
    last_seen_import_id
)
SELECT
    ctx.roster_season_id,
    c.coach_id,
    ts.team_season_id,
    data.role,
    ctx.import_id,
    ctx.import_id
FROM data
CROSS JOIN ctx
JOIN coaches AS c
  ON c.dynasty_id = ctx.dynasty_id
 AND c.identity_key = data.identity_key
LEFT JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.game_team_index
LEFT JOIN team_seasons AS ts
  ON ts.season_id = ctx.roster_season_id
 AND ts.team_id = t.team_id
ON CONFLICT (season_id, coach_id)
DO UPDATE SET
    team_season_id = EXCLUDED.team_season_id,
    role = EXCLUDED.role,
    last_seen_import_id = EXCLUDED.last_seen_import_id;

WITH
    ${contextCte(model)},
    data(
        identity_key,
        game_team_index,
        role,
        position,
        first_name,
        last_name,
        age,
        years_coaching,
        seasons_with_team,
        level,
        coach_prestige,
        coach_prestige_score,
        coach_points,
        experience_points,
        specialty,
        dominant_archetype,
        alma_mater,
        contract_status,
        contract_years_remaining,
        job_security_status,
        job_security_percentage,
        is_user_controlled,
        appearance,
        season_stats,
        career_stats
    ) AS (
        VALUES
        ${snapshotValues}
    )
INSERT INTO coach_import_snapshots (
    import_id,
    coach_season_id,
    team_season_id,
    role,
    position,
    first_name,
    last_name,
    age,
    years_coaching,
    seasons_with_team,
    level,
    coach_prestige,
    coach_prestige_score,
    coach_points,
    experience_points,
    specialty,
    dominant_archetype,
    alma_mater,
    contract_status,
    contract_years_remaining,
    job_security_status,
    job_security_percentage,
    is_user_controlled,
    appearance,
    season_stats,
    career_stats
)
SELECT
    ctx.import_id,
    cs.coach_season_id,
    ts.team_season_id,
    data.role,
    data.position,
    data.first_name,
    data.last_name,
    data.age,
    data.years_coaching,
    data.seasons_with_team,
    data.level,
    data.coach_prestige,
    data.coach_prestige_score,
    data.coach_points,
    data.experience_points,
    data.specialty,
    data.dominant_archetype,
    data.alma_mater,
    data.contract_status,
    data.contract_years_remaining,
    data.job_security_status,
    data.job_security_percentage,
    data.is_user_controlled,
    data.appearance,
    data.season_stats,
    data.career_stats
FROM data
CROSS JOIN ctx
JOIN coaches AS c
  ON c.dynasty_id = ctx.dynasty_id
 AND c.identity_key = data.identity_key
JOIN coach_seasons AS cs
  ON cs.season_id = ctx.roster_season_id
 AND cs.coach_id = c.coach_id
LEFT JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.game_team_index
LEFT JOIN team_seasons AS ts
  ON ts.season_id = ctx.roster_season_id
 AND ts.team_id = t.team_id
ON CONFLICT (import_id, coach_season_id)
DO UPDATE SET
    team_season_id = EXCLUDED.team_season_id,
    role = EXCLUDED.role,
    position = EXCLUDED.position,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    age = EXCLUDED.age,
    years_coaching = EXCLUDED.years_coaching,
    seasons_with_team = EXCLUDED.seasons_with_team,
    level = EXCLUDED.level,
    coach_prestige = EXCLUDED.coach_prestige,
    coach_prestige_score = EXCLUDED.coach_prestige_score,
    coach_points = EXCLUDED.coach_points,
    experience_points = EXCLUDED.experience_points,
    specialty = EXCLUDED.specialty,
    dominant_archetype = EXCLUDED.dominant_archetype,
    alma_mater = EXCLUDED.alma_mater,
    contract_status = EXCLUDED.contract_status,
    contract_years_remaining = EXCLUDED.contract_years_remaining,
    job_security_status = EXCLUDED.job_security_status,
    job_security_percentage = EXCLUDED.job_security_percentage,
    is_user_controlled = EXCLUDED.is_user_controlled,
    appearance = EXCLUDED.appearance,
    season_stats = EXCLUDED.season_stats,
    career_stats = EXCLUDED.career_stats;
`;
}

function buildAnalyticsNormalizationSql(model) {
    return `
-- -------------------- ANALYTICS-FRIENDLY SNAPSHOT TABLES --------------------

WITH ${contextCte(model)}
DELETE FROM team_grade_snapshots AS target
USING ctx
WHERE target.import_id = ctx.import_id;

WITH
    ${contextCte(model)},
    grade_data AS (
        SELECT
            tis.import_id,
            tis.team_season_id,
            'program'::text AS grade_group,
            entry.key AS grade_name,
            entry.value AS grade_value
        FROM team_import_snapshots AS tis
        JOIN ctx ON ctx.import_id = tis.import_id
        CROSS JOIN LATERAL jsonb_each_text(tis.program_point_grades) AS entry

        UNION ALL

        SELECT
            tis.import_id,
            tis.team_season_id,
            'my_school'::text,
            entry.key,
            entry.value
        FROM team_import_snapshots AS tis
        JOIN ctx ON ctx.import_id = tis.import_id
        CROSS JOIN LATERAL jsonb_each_text(tis.my_school_grades) AS entry

        UNION ALL

        SELECT
            tis.import_id,
            tis.team_season_id,
            'playing_style'::text,
            entry.key,
            entry.value
        FROM team_import_snapshots AS tis
        JOIN ctx ON ctx.import_id = tis.import_id
        CROSS JOIN LATERAL jsonb_each_text(tis.playing_style_grades) AS entry
    )
INSERT INTO team_grade_snapshots (
    import_id,
    team_season_id,
    grade_group,
    grade_name,
    grade_value,
    grade_rank
)
SELECT
    grade_data.import_id,
    grade_data.team_season_id,
    grade_data.grade_group,
    grade_data.grade_name,
    grade_data.grade_value,
    grade_scale.ordinal_rank
FROM grade_data
LEFT JOIN grade_scale
  ON grade_scale.grade_value = grade_data.grade_value;

WITH ${contextCte(model)}
DELETE FROM player_attribute_snapshots AS target
USING ctx
WHERE target.import_id = ctx.import_id;

WITH
    ${contextCte(model)},
    attribute_data AS (
        SELECT
            pis.import_id,
            pis.player_season_id,
            entry.key AS attribute_name,
            entry.value AS attribute_value_text
        FROM player_import_snapshots AS pis
        JOIN ctx ON ctx.import_id = pis.import_id
        CROSS JOIN LATERAL jsonb_each_text(pis.attributes) AS entry
    )
INSERT INTO player_attribute_snapshots (
    import_id,
    player_season_id,
    attribute_name,
    attribute_value_text,
    attribute_value_numeric
)
SELECT
    attribute_data.import_id,
    attribute_data.player_season_id,
    attribute_data.attribute_name,
    attribute_data.attribute_value_text,
    CASE
        WHEN attribute_data.attribute_value_text ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN attribute_data.attribute_value_text::numeric
        ELSE NULL
    END
FROM attribute_data;

WITH ${contextCte(model)}
DELETE FROM player_ability_snapshots AS target
USING ctx
WHERE target.import_id = ctx.import_id;

WITH
    ${contextCte(model)},
    ability_data AS (
        SELECT
            pis.import_id,
            pis.player_season_id,
            'physical'::text AS ability_group,
            (item ->> 'slot')::integer AS slot,
            COALESCE(item ->> 'ability', item ->> 'field', 'Unknown') AS ability_name,
            item ->> 'rank' AS ability_rank
        FROM player_import_snapshots AS pis
        JOIN ctx ON ctx.import_id = pis.import_id
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(pis.abilities -> 'physical', '[]'::jsonb)
        ) AS item

        UNION ALL

        SELECT
            pis.import_id,
            pis.player_season_id,
            'mental'::text,
            (item ->> 'slot')::integer,
            COALESCE(item ->> 'ability', item ->> 'field', 'Unknown'),
            item ->> 'rank'
        FROM player_import_snapshots AS pis
        JOIN ctx ON ctx.import_id = pis.import_id
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(pis.abilities -> 'mental', '[]'::jsonb)
        ) AS item
    )
INSERT INTO player_ability_snapshots (
    import_id,
    player_season_id,
    ability_group,
    slot,
    ability_name,
    ability_rank
)
SELECT
    import_id,
    player_season_id,
    ability_group,
    slot,
    ability_name,
    ability_rank
FROM ability_data;

WITH ${contextCte(model)}
DELETE FROM coach_stat_snapshots AS target
USING ctx
WHERE target.import_id = ctx.import_id;

WITH
    ${contextCte(model)},
    stat_data AS (
        SELECT
            cis.import_id,
            cis.coach_season_id,
            'season'::text AS stat_scope,
            entry.key AS stat_name,
            entry.value AS stat_value_text
        FROM coach_import_snapshots AS cis
        JOIN ctx ON ctx.import_id = cis.import_id
        CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(cis.season_stats, '{}'::jsonb)
        ) AS entry

        UNION ALL

        SELECT
            cis.import_id,
            cis.coach_season_id,
            'career'::text,
            entry.key,
            entry.value
        FROM coach_import_snapshots AS cis
        JOIN ctx ON ctx.import_id = cis.import_id
        CROSS JOIN LATERAL jsonb_each_text(
            COALESCE(cis.career_stats, '{}'::jsonb)
        ) AS entry
    )
INSERT INTO coach_stat_snapshots (
    import_id,
    coach_season_id,
    stat_scope,
    stat_name,
    stat_value
)
SELECT
    import_id,
    coach_season_id,
    stat_scope,
    stat_name,
    stat_value_text::numeric
FROM stat_data
WHERE stat_value_text ~ '^-?[0-9]+([.][0-9]+)?$';
`;
}

function buildFieldIndexImportSql(model, options = {}) {
    const playerBatchSize = options.playerBatchSize ?? 500;
    const coachBatchSize = options.coachBatchSize ?? 250;

    const sections = [
        "-- -------------------- FIELD INDEX DATABASE IMPORT --------------------\n",
        "\\set ON_ERROR_STOP on\n",
        "BEGIN;\n",
        buildDynastySeasonImportSql(model),
        buildTeamSql(model)
    ];

    chunk(model.players, playerBatchSize).forEach((players, index) => {
        sections.push(buildPlayerBatchSql(model, players, index + 1));
    });

    chunk(model.coaches, coachBatchSize).forEach((coaches, index) => {
        sections.push(buildCoachBatchSql(model, coaches, index + 1));
    });

    sections.push(buildAnalyticsNormalizationSql(model));
    sections.push(buildGameImportSql(model, options));
    sections.push("\nCOMMIT;\n");
    return sections.join("\n");
}

// Backward-compatible alias for code that imported the pre-game name.
const buildPregameImportSql = buildFieldIndexImportSql;

export {
    buildFieldIndexImportSql,
    buildPregameImportSql
};
