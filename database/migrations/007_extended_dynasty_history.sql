-- -------------------- FIELD INDEX EXTENDED DYNASTY HISTORY --------------------

BEGIN;

-- -------------------- TEAM VISUAL METADATA --------------------
-- CFB27 stores team presentation colors directly on Team. These are lightweight
-- metadata and are safe to keep in SQL; raw logos/helmets/jerseys remain local assets.

ALTER TABLE teams
ADD COLUMN primary_color_hex CHAR(7),
ADD COLUMN secondary_color_hex CHAR(7),
ADD COLUMN has_secondary_color BOOLEAN;


-- -------------------- PLAYER IDENTITY OBSERVATIONS --------------------
-- Keep source-level identity evidence for every import. This makes future
-- reconciliation safer without changing already-established player_id values.

CREATE TABLE player_identity_observations (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    player_id INTEGER NOT NULL
        REFERENCES players(player_id) ON DELETE CASCADE,

    source_player_row INTEGER NOT NULL,
    presentation_id INTEGER,
    birth_date_raw INTEGER,
    roster_fingerprint CHAR(64) NOT NULL,

    PRIMARY KEY (import_id, player_id)
);

CREATE INDEX player_identity_observations_source_row_idx
ON player_identity_observations(source_player_row);

CREATE INDEX player_identity_observations_fingerprint_idx
ON player_identity_observations(roster_fingerprint);


-- -------------------- RANKING SNAPSHOTS --------------------

CREATE TABLE ranking_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    poll_type TEXT NOT NULL
        CHECK (poll_type IN ('media', 'coaches', 'cfp')),

    rank INTEGER NOT NULL
        CHECK (rank BETWEEN 1 AND 25),

    team_id INTEGER
        REFERENCES teams(team_id),

    team_index INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    last_week_rank INTEGER,
    points_raw INTEGER,
    first_place_votes INTEGER,

    PRIMARY KEY (import_id, poll_type, rank),
    UNIQUE (import_id, poll_type, team_index)
);

CREATE INDEX ranking_snapshots_team_idx
ON ranking_snapshots(team_id, poll_type, season_id);

CREATE INDEX ranking_snapshots_season_poll_idx
ON ranking_snapshots(season_id, poll_type, rank);


-- -------------------- RECRUITING PROSPECTS --------------------
-- A recruit identity is scoped to one incoming class. CFB27 recruit rows are
-- stable inside that class but can be reused in later classes, so the canonical
-- key includes the class season index.

CREATE TABLE recruiting_prospects (
    recruit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    dynasty_id INTEGER NOT NULL
        REFERENCES dynasties(dynasty_id),

    identity_key TEXT NOT NULL,
    class_season_index INTEGER NOT NULL
        CHECK (class_season_index >= 0),
    class_season_year INTEGER NOT NULL
        CHECK (class_season_year >= 2026),
    source_recruit_row INTEGER NOT NULL,

    first_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),
    last_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (dynasty_id, identity_key),
    UNIQUE (dynasty_id, class_season_index, source_recruit_row)
);

CREATE INDEX recruiting_prospects_class_idx
ON recruiting_prospects(dynasty_id, class_season_index);


-- -------------------- RECRUITING PROSPECT SNAPSHOTS --------------------

CREATE TABLE recruiting_prospect_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    recruit_id BIGINT NOT NULL
        REFERENCES recruiting_prospects(recruit_id) ON DELETE CASCADE,

    source_player_row INTEGER,
    player_first_name TEXT,
    player_last_name TEXT,
    player_display_name TEXT NOT NULL,
    position TEXT,
    overall_rating INTEGER,
    star_rating INTEGER,
    hometown TEXT,
    home_state TEXT,
    height_inches INTEGER,
    weight_pounds INTEGER,
    roster_fingerprint CHAR(64) NOT NULL,

    recruit_stage TEXT,
    recruit_class TEXT,
    is_signed BOOLEAN NOT NULL DEFAULT FALSE,
    is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    is_high_school BOOLEAN NOT NULL DEFAULT FALSE,
    is_junior_college BOOLEAN NOT NULL DEFAULT FALSE,

    transfer_from_team_id INTEGER
        REFERENCES teams(team_id),
    transfer_from_team_index INTEGER,
    transfer_from_team_name TEXT,

    signed_team_id INTEGER
        REFERENCES teams(team_id),
    signed_team_index INTEGER,
    signed_team_name TEXT,
    destination_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    destination_resolution TEXT,
    destination_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,

    national_rank INTEGER,
    position_rank INTEGER,
    state_rank INTEGER,
    production_grade INTEGER,
    quality_modifier TEXT,
    total_scholarship_offers INTEGER,
    commit_score INTEGER,
    alternate_position_1 TEXT,
    alternate_position_2 TEXT,
    top_schools JSONB NOT NULL DEFAULT '[]'::jsonb,

    matched_player_id INTEGER
        REFERENCES players(player_id),
    match_strategy TEXT,

    PRIMARY KEY (import_id, recruit_id)
);

CREATE INDEX recruiting_prospect_snapshots_signed_team_idx
ON recruiting_prospect_snapshots(signed_team_id);

CREATE INDEX recruiting_prospect_snapshots_match_idx
ON recruiting_prospect_snapshots(matched_player_id)
WHERE matched_player_id IS NOT NULL;

CREATE INDEX recruiting_prospect_snapshots_fingerprint_idx
ON recruiting_prospect_snapshots(roster_fingerprint);


-- -------------------- RECRUITING BOARD SNAPSHOTS --------------------

CREATE TABLE recruiting_board_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    team_id INTEGER NOT NULL
        REFERENCES teams(team_id),

    recruiting_hours_processed INTEGER,
    recruiting_hours_total INTEGER,
    recruiting_hours_assigned INTEGER,

    PRIMARY KEY (import_id, team_id)
);


-- -------------------- RECRUITING TEAM INTEREST SNAPSHOTS --------------------

CREATE TABLE recruiting_team_interest_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    recruit_id BIGINT NOT NULL
        REFERENCES recruiting_prospects(recruit_id) ON DELETE CASCADE,

    team_id INTEGER NOT NULL
        REFERENCES teams(team_id),

    target_row INTEGER,
    target_type TEXT,
    scholarship_status TEXT,
    prospect_influence_total INTEGER,
    prospect_influence_delta INTEGER,
    prospect_influence_last_week INTEGER,
    hours_spent_current INTEGER,
    nil_expectation INTEGER,
    current_nil_offer INTEGER,
    committed_week_number INTEGER,
    send_the_house BOOLEAN,
    contact_friends_and_family BOOLEAN,
    contact_high_school_coaches BOOLEAN,
    search_social_media BOOLEAN,
    visit_recruits_school BOOLEAN,
    is_favorite BOOLEAN,
    sway_pitch TEXT,

    PRIMARY KEY (import_id, recruit_id, team_id)
);

CREATE INDEX recruiting_team_interest_team_idx
ON recruiting_team_interest_snapshots(team_id, import_id);


-- -------------------- DEPTH CHART SNAPSHOTS --------------------

CREATE TABLE depth_chart_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    roster_season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    team_id INTEGER NOT NULL
        REFERENCES teams(team_id),

    position_key TEXT NOT NULL,
    depth INTEGER NOT NULL
        CHECK (depth > 0),

    player_id INTEGER
        REFERENCES players(player_id),
    source_player_row INTEGER NOT NULL,
    player_display_name TEXT,
    player_position TEXT,
    jersey_number INTEGER,
    overall_rating INTEGER,

    PRIMARY KEY (import_id, team_id, position_key, depth)
);

CREATE INDEX depth_chart_snapshots_player_idx
ON depth_chart_snapshots(player_id);

CREATE INDEX depth_chart_snapshots_team_season_idx
ON depth_chart_snapshots(team_id, roster_season_id, position_key, depth);


-- -------------------- POSTSEASON SNAPSHOTS --------------------

CREATE TABLE postseason_import_snapshots (
    import_id INTEGER PRIMARY KEY
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    cfp_complete BOOLEAN NOT NULL DEFAULT FALSE,

    national_champion_team_id INTEGER
        REFERENCES teams(team_id),
    national_champion_team_index INTEGER,
    national_champion_team_name TEXT,

    runner_up_team_id INTEGER
        REFERENCES teams(team_id),
    runner_up_team_index INTEGER,
    runner_up_team_name TEXT,

    heisman_player_id INTEGER
        REFERENCES players(player_id),
    heisman_player_name TEXT,
    heisman_team_id INTEGER
        REFERENCES teams(team_id),

    cfp_rounds JSONB NOT NULL DEFAULT '{}'::jsonb
);


-- -------------------- AWARD SNAPSHOTS --------------------

CREATE TABLE award_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    award_type TEXT NOT NULL,
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('player', 'coach')),
    award_ordinal INTEGER NOT NULL
        CHECK (award_ordinal > 0),

    source_award_row INTEGER,
    player_id INTEGER
        REFERENCES players(player_id),
    coach_id INTEGER
        REFERENCES coaches(coach_id),
    entity_display_name TEXT NOT NULL,
    team_id INTEGER
        REFERENCES teams(team_id),
    team_index INTEGER,
    team_name TEXT,
    position TEXT,
    award_score INTEGER,

    PRIMARY KEY (import_id, award_type, entity_type, award_ordinal)
);

CREATE INDEX award_snapshots_player_idx
ON award_snapshots(player_id);

CREATE INDEX award_snapshots_coach_idx
ON award_snapshots(coach_id);

CREATE INDEX award_snapshots_season_type_idx
ON award_snapshots(season_id, award_type);


-- -------------------- ANALYTICS VIEWS --------------------

CREATE VIEW analytics.ranking_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    si.import_id,
    si.week_type,
    si.week_number,
    si.offseason_stage,
    si.imported_at,
    rs.poll_type,
    rs.rank,
    rs.last_week_rank,
    rs.points_raw,
    rs.first_place_votes,
    rs.team_id,
    rs.team_index,
    rs.team_name
FROM ranking_snapshots AS rs
JOIN save_imports AS si ON si.import_id = rs.import_id
JOIN seasons AS s ON s.season_id = rs.season_id
JOIN dynasties AS d ON d.dynasty_id = s.dynasty_id;

CREATE VIEW analytics.recruiting_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    rp.recruit_id,
    rp.class_season_index,
    rp.class_season_year,
    rp.source_recruit_row,
    rps.import_id,
    si.week_type,
    si.week_number,
    si.offseason_stage,
    si.imported_at,
    rps.player_display_name,
    rps.position,
    rps.overall_rating,
    rps.star_rating,
    rps.recruit_stage,
    rps.recruit_class,
    rps.is_signed,
    rps.is_transfer,
    rps.transfer_from_team_id,
    rps.transfer_from_team_name,
    rps.signed_team_id,
    rps.signed_team_name,
    rps.destination_resolved,
    rps.destination_resolution,
    rps.national_rank,
    rps.position_rank,
    rps.state_rank,
    rps.total_scholarship_offers,
    rps.matched_player_id,
    rps.match_strategy
FROM recruiting_prospects AS rp
JOIN dynasties AS d ON d.dynasty_id = rp.dynasty_id
JOIN recruiting_prospect_snapshots AS rps ON rps.recruit_id = rp.recruit_id
JOIN save_imports AS si ON si.import_id = rps.import_id;

CREATE VIEW analytics.recruiting_roster_matches AS
WITH candidate_matches AS (
    SELECT
        rp.recruit_id,
        pio.player_id,
        COUNT(*) AS evidence_count,
        MIN(roster_season.season_index) AS first_matching_roster_season_index
    FROM recruiting_prospects AS rp
    JOIN recruiting_prospect_snapshots AS rps
      ON rps.recruit_id = rp.recruit_id
    JOIN player_identity_observations AS pio
      ON pio.roster_fingerprint = rps.roster_fingerprint
    JOIN players AS p
      ON p.player_id = pio.player_id
     AND p.dynasty_id = rp.dynasty_id
    JOIN save_imports AS si
      ON si.import_id = pio.import_id
    JOIN seasons AS roster_season
      ON roster_season.season_id = si.roster_season_id
    WHERE roster_season.season_index >= rp.class_season_index
    GROUP BY rp.recruit_id, pio.player_id
),
resolved AS (
    SELECT
        recruit_id,
        COUNT(*) AS candidate_count,
        CASE WHEN COUNT(*) = 1 THEN MIN(player_id) ELSE NULL END AS matched_player_id,
        MIN(first_matching_roster_season_index) AS first_matching_roster_season_index
    FROM candidate_matches
    GROUP BY recruit_id
)
SELECT
    rp.dynasty_id,
    rp.recruit_id,
    rp.class_season_index,
    rp.class_season_year,
    COALESCE(direct_match.matched_player_id, resolved.matched_player_id) AS matched_player_id,
    CASE
        WHEN direct_match.matched_player_id IS NOT NULL THEN 'source_player_row_same_import'
        WHEN resolved.candidate_count = 1 THEN 'unique_roster_fingerprint'
        WHEN resolved.candidate_count > 1 THEN 'ambiguous_roster_fingerprint'
        ELSE NULL
    END AS match_strategy,
    COALESCE(resolved.candidate_count, 0) AS candidate_count,
    resolved.first_matching_roster_season_index
FROM recruiting_prospects AS rp
LEFT JOIN LATERAL (
    SELECT rps.matched_player_id
    FROM recruiting_prospect_snapshots AS rps
    WHERE rps.recruit_id = rp.recruit_id
      AND rps.matched_player_id IS NOT NULL
    ORDER BY rps.import_id DESC
    LIMIT 1
) AS direct_match ON TRUE
LEFT JOIN resolved ON resolved.recruit_id = rp.recruit_id;

CREATE VIEW analytics.recruiting_classes AS
SELECT
    dynasty_id,
    dynasty_key,
    dynasty_name,
    class_season_index,
    class_season_year,
    signed_team_id AS team_id,
    signed_team_name AS team_name,
    COUNT(*) FILTER (WHERE is_signed AND signed_team_id IS NOT NULL) AS signed_count,
    COUNT(*) FILTER (WHERE is_signed AND is_transfer AND signed_team_id IS NOT NULL) AS transfer_count,
    COUNT(*) FILTER (WHERE is_signed AND NOT is_transfer AND signed_team_id IS NOT NULL) AS non_transfer_count,
    AVG(star_rating::numeric) FILTER (WHERE is_signed AND signed_team_id IS NOT NULL) AS average_star_rating,
    AVG(national_rank::numeric) FILTER (WHERE is_signed AND signed_team_id IS NOT NULL AND national_rank > 0) AS average_national_rank
FROM analytics.recruiting_history
WHERE signed_team_id IS NOT NULL
GROUP BY
    dynasty_id,
    dynasty_key,
    dynasty_name,
    class_season_index,
    class_season_year,
    signed_team_id,
    signed_team_name;

CREATE VIEW analytics.depth_chart_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    rs.season_index,
    rs.season_year,
    dcs.import_id,
    si.week_type,
    si.week_number,
    si.offseason_stage,
    dcs.team_id,
    t.game_team_index AS team_index,
    t.school_name AS team_name,
    dcs.position_key,
    dcs.depth,
    dcs.player_id,
    dcs.source_player_row,
    dcs.player_display_name,
    dcs.player_position,
    dcs.jersey_number,
    dcs.overall_rating
FROM depth_chart_snapshots AS dcs
JOIN save_imports AS si ON si.import_id = dcs.import_id
JOIN seasons AS rs ON rs.season_id = dcs.roster_season_id
JOIN dynasties AS d ON d.dynasty_id = rs.dynasty_id
JOIN teams AS t ON t.team_id = dcs.team_id;

CREATE VIEW analytics.postseason_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    pis.import_id,
    si.imported_at,
    pis.cfp_complete,
    pis.national_champion_team_id,
    pis.national_champion_team_index,
    pis.national_champion_team_name,
    pis.runner_up_team_id,
    pis.runner_up_team_index,
    pis.runner_up_team_name,
    pis.heisman_player_id,
    pis.heisman_player_name,
    pis.heisman_team_id,
    pis.cfp_rounds
FROM postseason_import_snapshots AS pis
JOIN save_imports AS si ON si.import_id = pis.import_id
JOIN seasons AS s ON s.season_id = pis.season_id
JOIN dynasties AS d ON d.dynasty_id = s.dynasty_id;

CREATE VIEW analytics.postseason_games AS
SELECT
    g.*,
    CASE
        WHEN g.week_type = 'NationalChampionship' THEN 'national_championship'
        WHEN g.is_playoff_bowl THEN 'playoff'
        WHEN g.bowl_name IS NOT NULL THEN 'bowl'
        WHEN g.week_type IN ('BowlSeason1', 'BowlSeason2', 'BowlSeason3') THEN 'postseason'
        ELSE 'other'
    END AS postseason_game_type
FROM analytics.games AS g
WHERE g.week_type IN ('BowlSeason1', 'BowlSeason2', 'BowlSeason3', 'NationalChampionship')
   OR g.is_playoff_bowl
   OR g.bowl_name IS NOT NULL;

CREATE VIEW analytics.championship_history AS
SELECT
    ph.dynasty_id,
    ph.dynasty_key,
    ph.dynasty_name,
    ph.season_id,
    ph.season_index,
    ph.season_year,
    ph.import_id,
    ph.cfp_complete,
    ph.national_champion_team_id,
    ph.national_champion_team_index,
    ph.national_champion_team_name,
    ph.runner_up_team_id,
    ph.runner_up_team_index,
    ph.runner_up_team_name
FROM analytics.postseason_history AS ph
WHERE ph.national_champion_team_id IS NOT NULL
   OR ph.national_champion_team_index IS NOT NULL;

CREATE VIEW analytics.award_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    a.import_id,
    a.award_type,
    a.entity_type,
    a.award_ordinal,
    a.player_id,
    a.coach_id,
    a.entity_display_name,
    a.team_id,
    a.team_index,
    a.team_name,
    a.position,
    a.award_score
FROM award_snapshots AS a
JOIN seasons AS s ON s.season_id = a.season_id
JOIN dynasties AS d ON d.dynasty_id = s.dynasty_id;


-- -------------------- BI-READY EXTENDED VIEWS --------------------

CREATE VIEW bi.fact_ranking_snapshot AS
SELECT * FROM analytics.ranking_history;

CREATE VIEW bi.fact_recruiting_prospect AS
SELECT * FROM analytics.recruiting_history;

CREATE VIEW bi.fact_recruiting_class AS
SELECT * FROM analytics.recruiting_classes;

CREATE VIEW bi.fact_recruiting_roster_match AS
SELECT * FROM analytics.recruiting_roster_matches;

CREATE VIEW bi.fact_depth_chart AS
SELECT * FROM analytics.depth_chart_history;

CREATE VIEW bi.fact_postseason AS
SELECT * FROM analytics.postseason_history;

CREATE VIEW bi.fact_postseason_game AS
SELECT * FROM analytics.postseason_games;

CREATE VIEW bi.fact_championship AS
SELECT * FROM analytics.championship_history;

CREATE VIEW bi.fact_award AS
SELECT * FROM analytics.award_history;

COMMIT;
