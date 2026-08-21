// -------------------- EXTENDED DYNASTY HISTORY IMPORT SQL --------------------

import {
    sqlBoolean,
    sqlInteger,
    sqlJson,
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

function emptySection(label) {
    return `\n-- -------------------- ${label} --------------------\n-- No rows in this import.\n`;
}

function buildIdentityObservationSql(model) {
    const rows = model.extendedHistory?.identityObservations ?? [];
    if (rows.length === 0) return emptySection("PLAYER IDENTITY OBSERVATIONS");

    const values = valuesBlock(rows, row => [
        sqlText(row.playerIdentityKey),
        sqlInteger(row.sourcePlayerRow),
        sqlInteger(row.presentationId),
        sqlInteger(row.birthDateRaw),
        sqlText(row.rosterFingerprint)
    ]);

    return `
-- -------------------- PLAYER IDENTITY OBSERVATIONS --------------------

WITH
    ${contextCte(model)},
    data(identity_key, source_player_row, presentation_id, birth_date_raw, roster_fingerprint) AS (
        VALUES
        ${values}
    )
INSERT INTO player_identity_observations (
    import_id,
    player_id,
    source_player_row,
    presentation_id,
    birth_date_raw,
    roster_fingerprint
)
SELECT
    ctx.import_id,
    p.player_id,
    data.source_player_row,
    data.presentation_id,
    data.birth_date_raw,
    data.roster_fingerprint
FROM data
CROSS JOIN ctx
JOIN players AS p
  ON p.dynasty_id = ctx.dynasty_id
 AND p.identity_key = data.identity_key
ON CONFLICT (import_id, player_id)
DO UPDATE SET
    source_player_row = EXCLUDED.source_player_row,
    presentation_id = EXCLUDED.presentation_id,
    birth_date_raw = EXCLUDED.birth_date_raw,
    roster_fingerprint = EXCLUDED.roster_fingerprint;
`;
}

function buildRankingSql(model) {
    const rows = model.extendedHistory?.rankings ?? [];
    if (rows.length === 0) return emptySection("RANKING SNAPSHOTS");

    const values = valuesBlock(rows, row => [
        sqlText(row.pollType),
        sqlInteger(row.rank),
        sqlInteger(row.lastWeekRank),
        sqlInteger(row.pointsRaw),
        sqlInteger(row.firstPlaceVotes),
        sqlInteger(row.teamIndex),
        sqlText(row.teamName)
    ]);

    return `
-- -------------------- RANKING SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        poll_type,
        rank,
        last_week_rank,
        points_raw,
        first_place_votes,
        team_index,
        team_name
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO ranking_snapshots (
    import_id,
    season_id,
    poll_type,
    rank,
    team_id,
    team_index,
    team_name,
    last_week_rank,
    points_raw,
    first_place_votes
)
SELECT
    ctx.import_id,
    ctx.import_season_id,
    data.poll_type,
    data.rank,
    t.team_id,
    data.team_index,
    data.team_name,
    data.last_week_rank,
    data.points_raw,
    data.first_place_votes
FROM data
CROSS JOIN ctx
LEFT JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.team_index
ON CONFLICT (import_id, poll_type, rank)
DO UPDATE SET
    team_id = EXCLUDED.team_id,
    team_index = EXCLUDED.team_index,
    team_name = EXCLUDED.team_name,
    last_week_rank = EXCLUDED.last_week_rank,
    points_raw = EXCLUDED.points_raw,
    first_place_votes = EXCLUDED.first_place_votes;
`;
}

function buildRecruitingSql(model) {
    const recruiting = model.extendedHistory?.recruiting ?? {};
    const prospects = recruiting.prospects ?? [];
    const boards = recruiting.boards ?? [];
    const interests = recruiting.interests ?? [];
    const sections = [];

    if (prospects.length > 0) {
        const identityValues = valuesBlock(prospects, prospect => [
            sqlText(prospect.identityKey),
            sqlInteger(prospect.classSeasonIndex),
            sqlInteger(prospect.classSeasonYear),
            sqlInteger(prospect.recruitRow)
        ]);

        sections.push(`
-- -------------------- RECRUITING PROSPECT IDENTITIES --------------------

WITH
    ${contextCte(model)},
    data(identity_key, class_season_index, class_season_year, source_recruit_row) AS (
        VALUES
        ${identityValues}
    )
INSERT INTO recruiting_prospects (
    dynasty_id,
    identity_key,
    class_season_index,
    class_season_year,
    source_recruit_row,
    first_seen_import_id,
    last_seen_import_id
)
SELECT
    ctx.dynasty_id,
    data.identity_key,
    data.class_season_index,
    data.class_season_year,
    data.source_recruit_row,
    ctx.import_id,
    ctx.import_id
FROM data
CROSS JOIN ctx
ON CONFLICT (dynasty_id, identity_key)
DO UPDATE SET
    class_season_index = EXCLUDED.class_season_index,
    class_season_year = EXCLUDED.class_season_year,
    source_recruit_row = EXCLUDED.source_recruit_row,
    last_seen_import_id = EXCLUDED.last_seen_import_id,
    updated_at = CURRENT_TIMESTAMP;
`);

        const snapshotValues = valuesBlock(prospects, prospect => [
            sqlText(prospect.identityKey),
            sqlInteger(prospect.sourcePlayerRow),
            sqlText(prospect.player?.firstName),
            sqlText(prospect.player?.lastName),
            sqlText(prospect.player?.displayName ?? "Unknown Recruit"),
            sqlText(prospect.player?.position),
            sqlInteger(prospect.player?.overallRating),
            sqlInteger(prospect.player?.prospectStarRating),
            sqlText(prospect.player?.hometown),
            sqlText(prospect.player?.homeState),
            sqlInteger(prospect.player?.heightInches),
            sqlInteger(prospect.player?.weight),
            sqlText(prospect.rosterFingerprint),
            sqlText(prospect.recruitStage),
            sqlText(prospect.recruitClass),
            sqlBoolean(prospect.isSigned),
            sqlBoolean(prospect.isTransfer),
            sqlBoolean(prospect.isHighSchool),
            sqlBoolean(prospect.isJuniorCollege),
            sqlInteger(prospect.transferFromTeamIndex),
            sqlText(prospect.transferFromTeamName),
            sqlInteger(prospect.signedTeamIndex),
            sqlText(prospect.signedTeamName),
            sqlBoolean(prospect.destinationResolved),
            sqlText(prospect.destinationResolution),
            sqlJson(prospect.destinationCandidates ?? []),
            sqlInteger(prospect.nationalRank),
            sqlInteger(prospect.positionRank),
            sqlInteger(prospect.stateRank),
            sqlInteger(prospect.productionGrade),
            sqlText(prospect.qualityModifier),
            sqlInteger(prospect.totalScholarshipOffers),
            sqlInteger(prospect.commitScore),
            sqlText(prospect.alternatePosition1),
            sqlText(prospect.alternatePosition2),
            sqlJson(prospect.topSchools ?? []),
            sqlText(prospect.matchedPlayerIdentityKey),
            sqlText(prospect.matchStrategy)
        ]);

        sections.push(`
-- -------------------- RECRUITING PROSPECT SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        identity_key,
        source_player_row,
        player_first_name,
        player_last_name,
        player_display_name,
        position,
        overall_rating,
        star_rating,
        hometown,
        home_state,
        height_inches,
        weight_pounds,
        roster_fingerprint,
        recruit_stage,
        recruit_class,
        is_signed,
        is_transfer,
        is_high_school,
        is_junior_college,
        transfer_from_team_index,
        transfer_from_team_name,
        signed_team_index,
        signed_team_name,
        destination_resolved,
        destination_resolution,
        destination_candidates,
        national_rank,
        position_rank,
        state_rank,
        production_grade,
        quality_modifier,
        total_scholarship_offers,
        commit_score,
        alternate_position_1,
        alternate_position_2,
        top_schools,
        matched_player_identity_key,
        match_strategy
    ) AS (
        VALUES
        ${snapshotValues}
    )
INSERT INTO recruiting_prospect_snapshots (
    import_id,
    recruit_id,
    source_player_row,
    player_first_name,
    player_last_name,
    player_display_name,
    position,
    overall_rating,
    star_rating,
    hometown,
    home_state,
    height_inches,
    weight_pounds,
    roster_fingerprint,
    recruit_stage,
    recruit_class,
    is_signed,
    is_transfer,
    is_high_school,
    is_junior_college,
    transfer_from_team_id,
    transfer_from_team_index,
    transfer_from_team_name,
    signed_team_id,
    signed_team_index,
    signed_team_name,
    destination_resolved,
    destination_resolution,
    destination_candidates,
    national_rank,
    position_rank,
    state_rank,
    production_grade,
    quality_modifier,
    total_scholarship_offers,
    commit_score,
    alternate_position_1,
    alternate_position_2,
    top_schools,
    matched_player_id,
    match_strategy
)
SELECT
    ctx.import_id,
    rp.recruit_id,
    data.source_player_row,
    data.player_first_name,
    data.player_last_name,
    data.player_display_name,
    data.position,
    data.overall_rating,
    data.star_rating,
    data.hometown,
    data.home_state,
    data.height_inches,
    data.weight_pounds,
    data.roster_fingerprint,
    data.recruit_stage,
    data.recruit_class,
    data.is_signed,
    data.is_transfer,
    data.is_high_school,
    data.is_junior_college,
    from_team.team_id,
    data.transfer_from_team_index,
    data.transfer_from_team_name,
    signed_team.team_id,
    data.signed_team_index,
    data.signed_team_name,
    data.destination_resolved,
    data.destination_resolution,
    data.destination_candidates::jsonb,
    data.national_rank,
    data.position_rank,
    data.state_rank,
    data.production_grade,
    data.quality_modifier,
    data.total_scholarship_offers,
    data.commit_score,
    data.alternate_position_1,
    data.alternate_position_2,
    data.top_schools::jsonb,
    matched_player.player_id,
    data.match_strategy
FROM data
CROSS JOIN ctx
JOIN recruiting_prospects AS rp
  ON rp.dynasty_id = ctx.dynasty_id
 AND rp.identity_key = data.identity_key
LEFT JOIN teams AS from_team
  ON from_team.dynasty_id = ctx.dynasty_id
 AND from_team.game_team_index = data.transfer_from_team_index
LEFT JOIN teams AS signed_team
  ON signed_team.dynasty_id = ctx.dynasty_id
 AND signed_team.game_team_index = data.signed_team_index
LEFT JOIN players AS matched_player
  ON matched_player.dynasty_id = ctx.dynasty_id
 AND matched_player.identity_key = data.matched_player_identity_key
ON CONFLICT (import_id, recruit_id)
DO UPDATE SET
    source_player_row = EXCLUDED.source_player_row,
    player_first_name = EXCLUDED.player_first_name,
    player_last_name = EXCLUDED.player_last_name,
    player_display_name = EXCLUDED.player_display_name,
    position = EXCLUDED.position,
    overall_rating = EXCLUDED.overall_rating,
    star_rating = EXCLUDED.star_rating,
    hometown = EXCLUDED.hometown,
    home_state = EXCLUDED.home_state,
    height_inches = EXCLUDED.height_inches,
    weight_pounds = EXCLUDED.weight_pounds,
    roster_fingerprint = EXCLUDED.roster_fingerprint,
    recruit_stage = EXCLUDED.recruit_stage,
    recruit_class = EXCLUDED.recruit_class,
    is_signed = EXCLUDED.is_signed,
    is_transfer = EXCLUDED.is_transfer,
    is_high_school = EXCLUDED.is_high_school,
    is_junior_college = EXCLUDED.is_junior_college,
    transfer_from_team_id = EXCLUDED.transfer_from_team_id,
    transfer_from_team_index = EXCLUDED.transfer_from_team_index,
    transfer_from_team_name = EXCLUDED.transfer_from_team_name,
    signed_team_id = EXCLUDED.signed_team_id,
    signed_team_index = EXCLUDED.signed_team_index,
    signed_team_name = EXCLUDED.signed_team_name,
    destination_resolved = EXCLUDED.destination_resolved,
    destination_resolution = EXCLUDED.destination_resolution,
    destination_candidates = EXCLUDED.destination_candidates,
    national_rank = EXCLUDED.national_rank,
    position_rank = EXCLUDED.position_rank,
    state_rank = EXCLUDED.state_rank,
    production_grade = EXCLUDED.production_grade,
    quality_modifier = EXCLUDED.quality_modifier,
    total_scholarship_offers = EXCLUDED.total_scholarship_offers,
    commit_score = EXCLUDED.commit_score,
    alternate_position_1 = EXCLUDED.alternate_position_1,
    alternate_position_2 = EXCLUDED.alternate_position_2,
    top_schools = EXCLUDED.top_schools,
    matched_player_id = COALESCE(EXCLUDED.matched_player_id, recruiting_prospect_snapshots.matched_player_id),
    match_strategy = COALESCE(EXCLUDED.match_strategy, recruiting_prospect_snapshots.match_strategy);
`);
    } else {
        sections.push(emptySection("RECRUITING PROSPECTS"));
    }

    if (boards.length > 0) {
        const boardValues = valuesBlock(boards, board => [
            sqlInteger(board.teamIndex),
            sqlInteger(board.recruitingHoursProcessed),
            sqlInteger(board.recruitingHoursTotal),
            sqlInteger(board.recruitingHoursAssigned)
        ]);
        sections.push(`
-- -------------------- RECRUITING BOARD SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(team_index, hours_processed, hours_total, hours_assigned) AS (
        VALUES
        ${boardValues}
    )
INSERT INTO recruiting_board_snapshots (
    import_id,
    team_id,
    recruiting_hours_processed,
    recruiting_hours_total,
    recruiting_hours_assigned
)
SELECT
    ctx.import_id,
    t.team_id,
    data.hours_processed,
    data.hours_total,
    data.hours_assigned
FROM data
CROSS JOIN ctx
JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.team_index
ON CONFLICT (import_id, team_id)
DO UPDATE SET
    recruiting_hours_processed = EXCLUDED.recruiting_hours_processed,
    recruiting_hours_total = EXCLUDED.recruiting_hours_total,
    recruiting_hours_assigned = EXCLUDED.recruiting_hours_assigned;
`);
    }

    if (interests.length > 0) {
        const interestValues = valuesBlock(interests, interest => [
            sqlText(interest.prospectIdentityKey),
            sqlInteger(interest.teamIndex),
            sqlInteger(interest.targetRow),
            sqlText(interest.targetType),
            sqlText(interest.scholarshipStatus),
            sqlInteger(interest.prospectInfluenceTotal),
            sqlInteger(interest.prospectInfluenceDelta),
            sqlInteger(interest.prospectInfluenceLastWeek),
            sqlInteger(interest.hoursSpentCurrent),
            sqlInteger(interest.nilExpectation),
            sqlInteger(interest.currentNilOffer),
            sqlInteger(interest.committedWeekNumber),
            sqlBoolean(interest.sendTheHouse),
            sqlBoolean(interest.contactFriendsAndFamily),
            sqlBoolean(interest.contactHighSchoolCoaches),
            sqlBoolean(interest.searchSocialMedia),
            sqlBoolean(interest.visitRecruitsSchool),
            sqlBoolean(interest.isFavorite),
            sqlText(interest.swayPitch)
        ]);
        sections.push(`
-- -------------------- RECRUITING TEAM INTEREST SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        prospect_identity_key,
        team_index,
        target_row,
        target_type,
        scholarship_status,
        influence_total,
        influence_delta,
        influence_last_week,
        hours_spent_current,
        nil_expectation,
        current_nil_offer,
        committed_week_number,
        send_the_house,
        contact_friends_and_family,
        contact_high_school_coaches,
        search_social_media,
        visit_recruits_school,
        is_favorite,
        sway_pitch
    ) AS (
        VALUES
        ${interestValues}
    )
INSERT INTO recruiting_team_interest_snapshots (
    import_id,
    recruit_id,
    team_id,
    target_row,
    target_type,
    scholarship_status,
    prospect_influence_total,
    prospect_influence_delta,
    prospect_influence_last_week,
    hours_spent_current,
    nil_expectation,
    current_nil_offer,
    committed_week_number,
    send_the_house,
    contact_friends_and_family,
    contact_high_school_coaches,
    search_social_media,
    visit_recruits_school,
    is_favorite,
    sway_pitch
)
SELECT
    ctx.import_id,
    rp.recruit_id,
    t.team_id,
    data.target_row,
    data.target_type,
    data.scholarship_status,
    data.influence_total,
    data.influence_delta,
    data.influence_last_week,
    data.hours_spent_current,
    data.nil_expectation,
    data.current_nil_offer,
    data.committed_week_number,
    data.send_the_house,
    data.contact_friends_and_family,
    data.contact_high_school_coaches,
    data.search_social_media,
    data.visit_recruits_school,
    data.is_favorite,
    data.sway_pitch
FROM data
CROSS JOIN ctx
JOIN recruiting_prospects AS rp
  ON rp.dynasty_id = ctx.dynasty_id
 AND rp.identity_key = data.prospect_identity_key
JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.team_index
ON CONFLICT (import_id, recruit_id, team_id)
DO UPDATE SET
    target_row = EXCLUDED.target_row,
    target_type = EXCLUDED.target_type,
    scholarship_status = EXCLUDED.scholarship_status,
    prospect_influence_total = EXCLUDED.prospect_influence_total,
    prospect_influence_delta = EXCLUDED.prospect_influence_delta,
    prospect_influence_last_week = EXCLUDED.prospect_influence_last_week,
    hours_spent_current = EXCLUDED.hours_spent_current,
    nil_expectation = EXCLUDED.nil_expectation,
    current_nil_offer = EXCLUDED.current_nil_offer,
    committed_week_number = EXCLUDED.committed_week_number,
    send_the_house = EXCLUDED.send_the_house,
    contact_friends_and_family = EXCLUDED.contact_friends_and_family,
    contact_high_school_coaches = EXCLUDED.contact_high_school_coaches,
    search_social_media = EXCLUDED.search_social_media,
    visit_recruits_school = EXCLUDED.visit_recruits_school,
    is_favorite = EXCLUDED.is_favorite,
    sway_pitch = EXCLUDED.sway_pitch;
`);
    }

    return sections.join("\n");
}

function buildDepthChartSql(model) {
    const rows = model.extendedHistory?.depthCharts ?? [];
    if (rows.length === 0) return emptySection("DEPTH CHART SNAPSHOTS");

    const values = valuesBlock(rows, row => [
        sqlInteger(row.teamIndex),
        sqlText(row.positionKey),
        sqlInteger(row.depth),
        sqlInteger(row.playerRow),
        sqlText(row.playerIdentityKey),
        sqlText(row.displayName),
        sqlText(row.position),
        sqlInteger(row.jerseyNumber),
        sqlInteger(row.overallRating)
    ]);

    return `
-- -------------------- DEPTH CHART SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        team_index,
        position_key,
        depth,
        source_player_row,
        player_identity_key,
        player_display_name,
        player_position,
        jersey_number,
        overall_rating
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO depth_chart_snapshots (
    import_id,
    roster_season_id,
    team_id,
    position_key,
    depth,
    player_id,
    source_player_row,
    player_display_name,
    player_position,
    jersey_number,
    overall_rating
)
SELECT
    ctx.import_id,
    ctx.roster_season_id,
    t.team_id,
    data.position_key,
    data.depth,
    p.player_id,
    data.source_player_row,
    data.player_display_name,
    data.player_position,
    data.jersey_number,
    data.overall_rating
FROM data
CROSS JOIN ctx
JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.team_index
LEFT JOIN players AS p
  ON p.dynasty_id = ctx.dynasty_id
 AND p.identity_key = data.player_identity_key
ON CONFLICT (import_id, team_id, position_key, depth)
DO UPDATE SET
    player_id = EXCLUDED.player_id,
    source_player_row = EXCLUDED.source_player_row,
    player_display_name = EXCLUDED.player_display_name,
    player_position = EXCLUDED.player_position,
    jersey_number = EXCLUDED.jersey_number,
    overall_rating = EXCLUDED.overall_rating;
`;
}

function buildPostseasonSql(model) {
    const postseason = model.extendedHistory?.postseason ?? null;
    if (!postseason) return emptySection("POSTSEASON SNAPSHOT");

    return `
-- -------------------- POSTSEASON SNAPSHOT --------------------

WITH ${contextCte(model)}
INSERT INTO postseason_import_snapshots (
    import_id,
    season_id,
    cfp_complete,
    national_champion_team_id,
    national_champion_team_index,
    national_champion_team_name,
    runner_up_team_id,
    runner_up_team_index,
    runner_up_team_name,
    heisman_player_id,
    heisman_player_name,
    heisman_team_id,
    cfp_rounds
)
SELECT
    ctx.import_id,
    ctx.import_season_id,
    ${sqlBoolean(postseason.cfpComplete)},
    champion.team_id,
    ${sqlInteger(postseason.nationalChampion?.teamIndex)},
    ${sqlText(postseason.nationalChampion?.teamName)},
    runner_up.team_id,
    ${sqlInteger(postseason.runnerUp?.teamIndex)},
    ${sqlText(postseason.runnerUp?.teamName)},
    heisman_player.player_id,
    ${sqlText(postseason.heisman?.playerName)},
    heisman_team.team_id,
    ${sqlJson(postseason.cfpRounds ?? {})}::jsonb
FROM ctx
LEFT JOIN teams AS champion
  ON champion.dynasty_id = ctx.dynasty_id
 AND champion.game_team_index = ${sqlInteger(postseason.nationalChampion?.teamIndex)}
LEFT JOIN teams AS runner_up
  ON runner_up.dynasty_id = ctx.dynasty_id
 AND runner_up.game_team_index = ${sqlInteger(postseason.runnerUp?.teamIndex)}
LEFT JOIN players AS heisman_player
  ON heisman_player.dynasty_id = ctx.dynasty_id
 AND heisman_player.identity_key = ${sqlText(postseason.heisman?.playerIdentityKey)}
LEFT JOIN teams AS heisman_team
  ON heisman_team.dynasty_id = ctx.dynasty_id
 AND heisman_team.game_team_index = ${sqlInteger(postseason.heisman?.teamIndex)}
ON CONFLICT (import_id)
DO UPDATE SET
    cfp_complete = EXCLUDED.cfp_complete,
    national_champion_team_id = EXCLUDED.national_champion_team_id,
    national_champion_team_index = EXCLUDED.national_champion_team_index,
    national_champion_team_name = EXCLUDED.national_champion_team_name,
    runner_up_team_id = EXCLUDED.runner_up_team_id,
    runner_up_team_index = EXCLUDED.runner_up_team_index,
    runner_up_team_name = EXCLUDED.runner_up_team_name,
    heisman_player_id = EXCLUDED.heisman_player_id,
    heisman_player_name = EXCLUDED.heisman_player_name,
    heisman_team_id = EXCLUDED.heisman_team_id,
    cfp_rounds = EXCLUDED.cfp_rounds;
`;
}

function buildAwardSql(model) {
    const rows = model.extendedHistory?.awards ?? [];
    if (rows.length === 0) return emptySection("AWARD SNAPSHOTS");

    const values = valuesBlock(rows, row => [
        sqlText(row.awardType),
        sqlText(row.entityType),
        sqlInteger(row.ordinal),
        sqlInteger(row.sourceAwardRow),
        sqlText(row.playerIdentityKey),
        sqlText(row.coachIdentityKey),
        sqlText(row.displayName),
        sqlInteger(row.teamIndex),
        sqlText(row.teamName),
        sqlText(row.position),
        sqlInteger(row.awardScore)
    ]);

    return `
-- -------------------- AWARD SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        award_type,
        entity_type,
        award_ordinal,
        source_award_row,
        player_identity_key,
        coach_identity_key,
        entity_display_name,
        team_index,
        team_name,
        position,
        award_score
    ) AS (
        VALUES
        ${values}
    )
INSERT INTO award_snapshots (
    import_id,
    season_id,
    award_type,
    entity_type,
    award_ordinal,
    source_award_row,
    player_id,
    coach_id,
    entity_display_name,
    team_id,
    team_index,
    team_name,
    position,
    award_score
)
SELECT
    ctx.import_id,
    ctx.import_season_id,
    data.award_type,
    data.entity_type,
    data.award_ordinal,
    data.source_award_row,
    p.player_id,
    c.coach_id,
    data.entity_display_name,
    t.team_id,
    data.team_index,
    data.team_name,
    data.position,
    data.award_score
FROM data
CROSS JOIN ctx
LEFT JOIN players AS p
  ON p.dynasty_id = ctx.dynasty_id
 AND p.identity_key = data.player_identity_key
LEFT JOIN coaches AS c
  ON c.dynasty_id = ctx.dynasty_id
 AND c.identity_key = data.coach_identity_key
LEFT JOIN teams AS t
  ON t.dynasty_id = ctx.dynasty_id
 AND t.game_team_index = data.team_index
ON CONFLICT (import_id, award_type, entity_type, award_ordinal)
DO UPDATE SET
    source_award_row = EXCLUDED.source_award_row,
    player_id = EXCLUDED.player_id,
    coach_id = EXCLUDED.coach_id,
    entity_display_name = EXCLUDED.entity_display_name,
    team_id = EXCLUDED.team_id,
    team_index = EXCLUDED.team_index,
    team_name = EXCLUDED.team_name,
    position = EXCLUDED.position,
    award_score = EXCLUDED.award_score;
`;
}


function buildCoachTalentSql(model) {
    const coachTalents = model.extendedHistory?.coachTalents ?? {};
    const trees = coachTalents.trees ?? [];
    const nodes = coachTalents.nodes ?? [];
    const sections = [];

    if (trees.length > 0) {
        const treeValues = valuesBlock(trees, row => [
            sqlText(row.coachIdentityKey),
            sqlInteger(row.treeIndex),
            sqlText(row.treeInternalName),
            sqlText(row.treeDisplayName),
            sqlText(row.treeDescription),
            sqlBoolean(row.available),
            sqlText(row.state),
            sqlText(row.rootStatus),
            sqlInteger(row.coachPointsSpent),
            sqlInteger(row.ownedCount),
            sqlInteger(row.purchasableCount),
            sqlInteger(row.notOwnedCount),
            sqlInteger(row.lockedCount)
        ]);

        sections.push(`
-- -------------------- COACH TALENT TREE SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        coach_identity_key,
        tree_index,
        tree_internal_name,
        tree_display_name,
        tree_description,
        available,
        tree_state,
        root_status,
        coach_points_spent,
        owned_count,
        purchasable_count,
        not_owned_count,
        locked_count
    ) AS (
        VALUES
        ${treeValues}
    )
INSERT INTO coach_talent_tree_snapshots (
    import_id,
    coach_season_id,
    tree_index,
    tree_internal_name,
    tree_display_name,
    tree_description,
    available,
    tree_state,
    root_status,
    coach_points_spent,
    owned_count,
    purchasable_count,
    not_owned_count,
    locked_count
)
SELECT
    ctx.import_id,
    cs.coach_season_id,
    data.tree_index,
    data.tree_internal_name,
    data.tree_display_name,
    data.tree_description,
    data.available,
    data.tree_state,
    data.root_status,
    data.coach_points_spent,
    data.owned_count,
    data.purchasable_count,
    data.not_owned_count,
    data.locked_count
FROM data
CROSS JOIN ctx
JOIN coaches AS c
  ON c.dynasty_id = ctx.dynasty_id
 AND c.identity_key = data.coach_identity_key
JOIN coach_seasons AS cs
  ON cs.season_id = ctx.roster_season_id
 AND cs.coach_id = c.coach_id
ON CONFLICT (import_id, coach_season_id, tree_index)
DO UPDATE SET
    tree_internal_name = EXCLUDED.tree_internal_name,
    tree_display_name = EXCLUDED.tree_display_name,
    tree_description = EXCLUDED.tree_description,
    available = EXCLUDED.available,
    tree_state = EXCLUDED.tree_state,
    root_status = EXCLUDED.root_status,
    coach_points_spent = EXCLUDED.coach_points_spent,
    owned_count = EXCLUDED.owned_count,
    purchasable_count = EXCLUDED.purchasable_count,
    not_owned_count = EXCLUDED.not_owned_count,
    locked_count = EXCLUDED.locked_count;
`);
    } else {
        sections.push(emptySection("COACH TALENT TREES"));
    }

    if (nodes.length > 0) {
        const nodeValues = valuesBlock(nodes, row => [
            sqlText(row.coachIdentityKey),
            sqlInteger(row.treeIndex),
            sqlText(row.treeInternalName),
            sqlText(row.treeDisplayName),
            sqlInteger(row.talentIndex),
            sqlText(row.canonicalKey),
            sqlText(row.status),
            sqlText(row.abilityName),
            sqlText(row.abilityDescription),
            sqlInteger(row.staffPointCost),
            sqlBoolean(row.isArchetypeNode),
            sqlText(row.progressLabel),
            sqlText(row.branchTitle),
            sqlText(row.branchSubtitle),
            sqlText(row.positionGroup),
            sqlText(row.effect),
            sqlText(row.duration),
            sqlJson(row.prerequisite)
        ]);

        sections.push(`
-- -------------------- COACH TALENT NODE SNAPSHOTS --------------------

WITH
    ${contextCte(model)},
    data(
        coach_identity_key,
        tree_index,
        tree_internal_name,
        tree_display_name,
        talent_index,
        canonical_key,
        talent_status,
        ability_name,
        ability_description,
        staff_point_cost,
        is_archetype_node,
        progress_label,
        branch_title,
        branch_subtitle,
        position_group,
        effect,
        duration,
        prerequisite_json
    ) AS (
        VALUES
        ${nodeValues}
    )
INSERT INTO coach_talent_node_snapshots (
    import_id,
    coach_season_id,
    tree_index,
    tree_internal_name,
    tree_display_name,
    talent_index,
    canonical_key,
    talent_status,
    ability_name,
    ability_description,
    staff_point_cost,
    is_archetype_node,
    progress_label,
    branch_title,
    branch_subtitle,
    position_group,
    effect,
    duration,
    prerequisite_json
)
SELECT
    ctx.import_id,
    cs.coach_season_id,
    data.tree_index,
    data.tree_internal_name,
    data.tree_display_name,
    data.talent_index,
    data.canonical_key,
    data.talent_status,
    data.ability_name,
    data.ability_description,
    data.staff_point_cost,
    data.is_archetype_node,
    data.progress_label,
    data.branch_title,
    data.branch_subtitle,
    data.position_group,
    data.effect,
    data.duration,
    data.prerequisite_json::jsonb
FROM data
CROSS JOIN ctx
JOIN coaches AS c
  ON c.dynasty_id = ctx.dynasty_id
 AND c.identity_key = data.coach_identity_key
JOIN coach_seasons AS cs
  ON cs.season_id = ctx.roster_season_id
 AND cs.coach_id = c.coach_id
ON CONFLICT (import_id, coach_season_id, tree_index, talent_index)
DO UPDATE SET
    tree_internal_name = EXCLUDED.tree_internal_name,
    tree_display_name = EXCLUDED.tree_display_name,
    canonical_key = EXCLUDED.canonical_key,
    talent_status = EXCLUDED.talent_status,
    ability_name = EXCLUDED.ability_name,
    ability_description = EXCLUDED.ability_description,
    staff_point_cost = EXCLUDED.staff_point_cost,
    is_archetype_node = EXCLUDED.is_archetype_node,
    progress_label = EXCLUDED.progress_label,
    branch_title = EXCLUDED.branch_title,
    branch_subtitle = EXCLUDED.branch_subtitle,
    position_group = EXCLUDED.position_group,
    effect = EXCLUDED.effect,
    duration = EXCLUDED.duration,
    prerequisite_json = EXCLUDED.prerequisite_json;
`);
    } else {
        sections.push(emptySection("COACH TALENT NODES"));
    }

    return sections.join("\n");
}

function buildExtendedImportSql(model) {
    return [
        buildIdentityObservationSql(model),
        buildRankingSql(model),
        buildRecruitingSql(model),
        buildDepthChartSql(model),
        buildPostseasonSql(model),
        buildAwardSql(model),
        buildCoachTalentSql(model)
    ].join("\n");
}

export {
    buildAwardSql,
    buildCoachTalentSql,
    buildDepthChartSql,
    buildExtendedImportSql,
    buildIdentityObservationSql,
    buildPostseasonSql,
    buildRankingSql,
    buildRecruitingSql
};
