-- -------------------- FIELD INDEX ANALYTICS LAYER --------------------

BEGIN;

-- -------------------- ANALYTICS SCHEMAS --------------------
-- Raw imported tables remain in public. Curated analysis views live in
-- analytics, while Power BI-friendly dimensions/facts live in bi.

CREATE SCHEMA analytics;
CREATE SCHEMA bi;


-- -------------------- ANALYTICS PERFORMANCE INDEXES --------------------

CREATE INDEX save_imports_game_season_latest_idx
ON save_imports(season_id, source_modified_at DESC, import_id DESC);

CREATE INDEX save_imports_roster_season_latest_idx
ON save_imports(roster_season_id, source_modified_at DESC, import_id DESC);

CREATE INDEX team_game_stats_import_team_idx
ON team_game_stats(import_id, team_id);

CREATE INDEX player_game_stat_lines_import_player_idx
ON player_game_stat_lines(import_id, player_id);

CREATE INDEX player_game_stats_import_player_idx
ON player_game_stats(import_id, player_id);

CREATE INDEX player_game_stats_import_metric_idx
ON player_game_stats(import_id, stat_category, stat_name);


-- -------------------- IMPORT CONTEXT --------------------

CREATE VIEW analytics.import_context AS
SELECT
    si.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    game_season.season_id AS game_season_id,
    game_season.season_index AS game_season_index,
    game_season.season_year AS game_season_year,
    roster_season.season_id AS roster_season_id,
    roster_season.season_index AS roster_season_index,
    roster_season.season_year AS roster_season_year,
    si.week_type,
    si.week_number,
    si.offseason_stage,
    si.source_file_name,
    si.file_hash,
    si.file_size_bytes,
    si.source_modified_at,
    si.imported_at,
    si.last_seen_at,
    si.parser_version,
    si.backend_schema_major,
    si.backend_schema_minor,
    si.game_year
FROM save_imports AS si
JOIN seasons AS game_season
  ON game_season.season_id = si.season_id
JOIN seasons AS roster_season
  ON roster_season.season_id = si.roster_season_id
JOIN dynasties AS d
  ON d.dynasty_id = game_season.dynasty_id;


-- -------------------- CANONICAL IMPORT SELECTION --------------------
-- Schedule/results should reflect the latest save for the season. Roster
-- analytics use the latest import whose roster belongs to that season.
-- Game-stat domains intentionally choose the import with the most retained
-- rows because later CFB27 offseason stages can clear historical stat caches.

CREATE VIEW analytics.latest_game_imports AS
SELECT DISTINCT ON (si.season_id)
    si.import_id,
    si.season_id,
    s.dynasty_id,
    s.season_index,
    s.season_year,
    si.source_modified_at,
    si.imported_at
FROM save_imports AS si
JOIN seasons AS s
  ON s.season_id = si.season_id
ORDER BY
    si.season_id,
    si.source_modified_at DESC NULLS LAST,
    si.imported_at DESC,
    si.import_id DESC;

CREATE VIEW analytics.latest_roster_imports AS
SELECT DISTINCT ON (si.roster_season_id)
    si.import_id,
    si.roster_season_id AS season_id,
    s.dynasty_id,
    s.season_index,
    s.season_year,
    si.source_modified_at,
    si.imported_at
FROM save_imports AS si
JOIN seasons AS s
  ON s.season_id = si.roster_season_id
ORDER BY
    si.roster_season_id,
    si.source_modified_at DESC NULLS LAST,
    si.imported_at DESC,
    si.import_id DESC;

CREATE VIEW analytics.best_team_game_imports AS
WITH import_counts AS (
    SELECT
        si.import_id,
        si.season_id,
        s.dynasty_id,
        s.season_index,
        s.season_year,
        COUNT(tgs.game_id) AS team_game_rows,
        si.source_modified_at,
        si.imported_at
    FROM save_imports AS si
    JOIN seasons AS s
      ON s.season_id = si.season_id
    LEFT JOIN team_game_stats AS tgs
      ON tgs.import_id = si.import_id
    GROUP BY
        si.import_id,
        si.season_id,
        s.dynasty_id,
        s.season_index,
        s.season_year,
        si.source_modified_at,
        si.imported_at
)
SELECT DISTINCT ON (season_id)
    import_id,
    season_id,
    dynasty_id,
    season_index,
    season_year,
    team_game_rows,
    source_modified_at,
    imported_at
FROM import_counts
ORDER BY
    season_id,
    team_game_rows DESC,
    source_modified_at DESC NULLS LAST,
    imported_at DESC,
    import_id DESC;

CREATE VIEW analytics.best_player_game_imports AS
WITH import_counts AS (
    SELECT
        si.import_id,
        si.season_id,
        s.dynasty_id,
        s.season_index,
        s.season_year,
        COUNT(pgsl.game_id) AS player_stat_lines,
        si.source_modified_at,
        si.imported_at
    FROM save_imports AS si
    JOIN seasons AS s
      ON s.season_id = si.season_id
    LEFT JOIN player_game_stat_lines AS pgsl
      ON pgsl.import_id = si.import_id
    GROUP BY
        si.import_id,
        si.season_id,
        s.dynasty_id,
        s.season_index,
        s.season_year,
        si.source_modified_at,
        si.imported_at
)
SELECT DISTINCT ON (season_id)
    import_id,
    season_id,
    dynasty_id,
    season_index,
    season_year,
    player_stat_lines,
    source_modified_at,
    imported_at
FROM import_counts
ORDER BY
    season_id,
    player_stat_lines DESC,
    source_modified_at DESC NULLS LAST,
    imported_at DESC,
    import_id DESC;

CREATE VIEW analytics.best_scoring_imports AS
WITH import_counts AS (
    SELECT
        si.import_id,
        si.season_id,
        s.dynasty_id,
        s.season_index,
        s.season_year,
        COUNT(sse.game_id) AS scoring_events,
        si.source_modified_at,
        si.imported_at
    FROM save_imports AS si
    JOIN seasons AS s
      ON s.season_id = si.season_id
    LEFT JOIN scoring_summary_events AS sse
      ON sse.import_id = si.import_id
    GROUP BY
        si.import_id,
        si.season_id,
        s.dynasty_id,
        s.season_index,
        s.season_year,
        si.source_modified_at,
        si.imported_at
)
SELECT DISTINCT ON (season_id)
    import_id,
    season_id,
    dynasty_id,
    season_index,
    season_year,
    scoring_events,
    source_modified_at,
    imported_at
FROM import_counts
ORDER BY
    season_id,
    scoring_events DESC,
    source_modified_at DESC NULLS LAST,
    imported_at DESC,
    import_id DESC;


-- -------------------- LATEST ROSTER / ENTITY SNAPSHOTS --------------------

CREATE VIEW analytics.team_season_snapshots AS
SELECT
    lri.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    ts.team_season_id,
    t.team_id,
    t.game_team_index,
    t.school_name,
    t.nickname,
    t.abbreviation,
    t.is_team_builder,
    c.conference_id,
    c.game_conference_enum,
    c.conference_name,
    tis.prestige,
    tis.overall_rating,
    tis.offensive_rating,
    tis.defensive_rating,
    tis.team_rank,
    tis.conference_standing,
    tis.wins,
    tis.losses,
    tis.conference_wins,
    tis.conference_losses,
    tis.nonconference_wins,
    tis.nonconference_losses,
    tis.playoff_status,
    tis.playoff_round_reached
FROM analytics.latest_roster_imports AS lri
JOIN seasons AS s
  ON s.season_id = lri.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN team_import_snapshots AS tis
  ON tis.import_id = lri.import_id
JOIN team_seasons AS ts
  ON ts.team_season_id = tis.team_season_id
 AND ts.season_id = s.season_id
JOIN teams AS t
  ON t.team_id = ts.team_id
LEFT JOIN conferences AS c
  ON c.conference_id = ts.conference_id;

CREATE VIEW analytics.player_season_snapshots AS
SELECT
    lri.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    ps.player_season_id,
    p.player_id,
    p.identity_key,
    p.identity_strategy,
    p.presentation_id,
    p.first_name,
    p.last_name,
    CONCAT_WS(' ', p.first_name, p.last_name) AS player_name,
    p.hometown,
    p.home_state,
    pis.jersey_number,
    pis.position,
    pis.class_year,
    pis.redshirt_status,
    pis.overall_rating,
    pis.height_inches,
    pis.weight_pounds,
    pis.consecutive_years_with_team,
    pis.is_transfer,
    pis.is_current_season_transfer,
    pis.skill_points,
    pis.experience_points,
    pis.development_trait,
    ts.team_season_id,
    t.team_id,
    t.game_team_index,
    t.school_name,
    t.abbreviation,
    c.conference_id,
    c.game_conference_enum,
    c.conference_name,
    ps.previous_team_id,
    previous_team.school_name AS previous_team_name
FROM analytics.latest_roster_imports AS lri
JOIN seasons AS s
  ON s.season_id = lri.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN player_import_snapshots AS pis
  ON pis.import_id = lri.import_id
JOIN player_seasons AS ps
  ON ps.player_season_id = pis.player_season_id
 AND ps.season_id = s.season_id
JOIN players AS p
  ON p.player_id = ps.player_id
JOIN team_seasons AS ts
  ON ts.team_season_id = pis.team_season_id
 AND ts.season_id = s.season_id
JOIN teams AS t
  ON t.team_id = ts.team_id
LEFT JOIN conferences AS c
  ON c.conference_id = ts.conference_id
LEFT JOIN teams AS previous_team
  ON previous_team.team_id = ps.previous_team_id;

CREATE VIEW analytics.coach_season_snapshots AS
SELECT
    lri.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    cs.coach_season_id,
    coach.coach_id,
    coach.identity_key,
    coach.identity_strategy,
    coach.presentation_id,
    coach.source_coach_row,
    cis.first_name,
    cis.last_name,
    CONCAT_WS(' ', cis.first_name, cis.last_name) AS coach_name,
    cis.role,
    cis.position,
    cis.age,
    cis.years_coaching,
    cis.seasons_with_team,
    cis.level,
    cis.coach_prestige,
    cis.coach_prestige_score,
    cis.coach_points,
    cis.experience_points,
    cis.specialty,
    cis.dominant_archetype,
    cis.alma_mater,
    cis.contract_status,
    cis.contract_years_remaining,
    cis.job_security_status,
    cis.job_security_percentage,
    cis.is_user_controlled,
    ts.team_season_id,
    t.team_id,
    t.game_team_index,
    t.school_name,
    t.abbreviation,
    c.conference_id,
    c.game_conference_enum,
    c.conference_name
FROM analytics.latest_roster_imports AS lri
JOIN seasons AS s
  ON s.season_id = lri.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN coach_import_snapshots AS cis
  ON cis.import_id = lri.import_id
JOIN coach_seasons AS cs
  ON cs.coach_season_id = cis.coach_season_id
 AND cs.season_id = s.season_id
JOIN coaches AS coach
  ON coach.coach_id = cs.coach_id
LEFT JOIN team_seasons AS ts
  ON ts.team_season_id = cis.team_season_id
 AND ts.season_id = s.season_id
LEFT JOIN teams AS t
  ON t.team_id = ts.team_id
LEFT JOIN conferences AS c
  ON c.conference_id = ts.conference_id;

CREATE VIEW analytics.player_attributes AS
SELECT
    pss.import_id,
    pss.dynasty_id,
    pss.season_id,
    pss.season_year,
    pss.player_season_id,
    pss.player_id,
    pss.player_name,
    pss.team_id,
    pss.school_name,
    pas.attribute_name,
    pas.attribute_value_text,
    pas.attribute_value_numeric
FROM analytics.player_season_snapshots AS pss
JOIN player_attribute_snapshots AS pas
  ON pas.import_id = pss.import_id
 AND pas.player_season_id = pss.player_season_id;

CREATE VIEW analytics.player_abilities AS
SELECT
    pss.import_id,
    pss.dynasty_id,
    pss.season_id,
    pss.season_year,
    pss.player_season_id,
    pss.player_id,
    pss.player_name,
    pss.team_id,
    pss.school_name,
    pas.ability_group,
    pas.slot,
    pas.ability_name,
    pas.ability_rank
FROM analytics.player_season_snapshots AS pss
JOIN player_ability_snapshots AS pas
  ON pas.import_id = pss.import_id
 AND pas.player_season_id = pss.player_season_id;

CREATE VIEW analytics.team_grades AS
SELECT
    tss.import_id,
    tss.dynasty_id,
    tss.season_id,
    tss.season_year,
    tss.team_season_id,
    tss.team_id,
    tss.school_name,
    tss.conference_id,
    tss.conference_name,
    tgs.grade_group,
    tgs.grade_name,
    tgs.grade_value,
    tgs.grade_rank
FROM analytics.team_season_snapshots AS tss
JOIN team_grade_snapshots AS tgs
  ON tgs.import_id = tss.import_id
 AND tgs.team_season_id = tss.team_season_id;

CREATE VIEW analytics.coach_stats AS
SELECT
    css.import_id,
    css.dynasty_id,
    css.season_id,
    css.season_year,
    css.coach_season_id,
    css.coach_id,
    css.coach_name,
    css.role,
    css.team_id,
    css.school_name,
    css.conference_id,
    css.conference_name,
    cssnap.stat_scope,
    cssnap.stat_name,
    cssnap.stat_value
FROM analytics.coach_season_snapshots AS css
JOIN coach_stat_snapshots AS cssnap
  ON cssnap.import_id = css.import_id
 AND cssnap.coach_season_id = css.coach_season_id;


-- -------------------- IMPORT-BY-IMPORT HISTORY --------------------
-- These views keep the full snapshot timeline for weekly progression analysis.

CREATE VIEW analytics.team_snapshot_history AS
WITH history AS (
    SELECT
        ic.import_id,
        ic.dynasty_id,
        ic.dynasty_key,
        ic.dynasty_name,
        ic.game_season_id,
        ic.game_season_year,
        ic.roster_season_id AS season_id,
        ic.roster_season_index AS season_index,
        ic.roster_season_year AS season_year,
        ic.week_type,
        ic.week_number,
        ic.offseason_stage,
        ic.source_modified_at,
        ts.team_season_id,
        t.team_id,
        t.game_team_index,
        t.school_name,
        t.abbreviation,
        c.conference_id,
        c.game_conference_enum,
        c.conference_name,
        tis.prestige,
        tis.overall_rating,
        tis.offensive_rating,
        tis.defensive_rating,
        tis.team_rank,
        tis.conference_standing,
        tis.wins,
        tis.losses,
        tis.conference_wins,
        tis.conference_losses,
        tis.nonconference_wins,
        tis.nonconference_losses,
        tis.playoff_status,
        tis.playoff_round_reached,
        LAG(tis.overall_rating) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, t.team_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_overall_rating,
        LAG(tis.team_rank) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, t.team_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_team_rank
    FROM analytics.import_context AS ic
    JOIN team_import_snapshots AS tis
      ON tis.import_id = ic.import_id
    JOIN team_seasons AS ts
      ON ts.team_season_id = tis.team_season_id
     AND ts.season_id = ic.roster_season_id
    JOIN teams AS t
      ON t.team_id = ts.team_id
    LEFT JOIN conferences AS c
      ON c.conference_id = ts.conference_id
)
SELECT
    history.*,
    history.overall_rating - history.prior_import_overall_rating AS overall_change_from_prior_import,
    history.team_rank - history.prior_import_team_rank AS poll_rank_change_from_prior_import
FROM history;

CREATE VIEW analytics.player_snapshot_history AS
WITH history AS (
    SELECT
        ic.import_id,
        ic.dynasty_id,
        ic.dynasty_key,
        ic.dynasty_name,
        ic.game_season_id,
        ic.game_season_year,
        ic.roster_season_id AS season_id,
        ic.roster_season_index AS season_index,
        ic.roster_season_year AS season_year,
        ic.week_type,
        ic.week_number,
        ic.offseason_stage,
        ic.source_modified_at,
        ps.player_season_id,
        p.player_id,
        p.identity_key,
        p.presentation_id,
        CONCAT_WS(' ', p.first_name, p.last_name) AS player_name,
        pis.jersey_number,
        pis.position,
        pis.class_year,
        pis.redshirt_status,
        pis.overall_rating,
        pis.height_inches,
        pis.weight_pounds,
        pis.consecutive_years_with_team,
        pis.is_transfer,
        pis.is_current_season_transfer,
        pis.skill_points,
        pis.experience_points,
        pis.development_trait,
        t.team_id,
        t.school_name,
        c.conference_id,
        c.conference_name,
        LAG(pis.overall_rating) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, p.player_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_overall_rating,
        LAG(t.team_id) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, p.player_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_team_id,
        LAG(pis.position) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, p.player_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_position
    FROM analytics.import_context AS ic
    JOIN player_import_snapshots AS pis
      ON pis.import_id = ic.import_id
    JOIN player_seasons AS ps
      ON ps.player_season_id = pis.player_season_id
     AND ps.season_id = ic.roster_season_id
    JOIN players AS p
      ON p.player_id = ps.player_id
    JOIN team_seasons AS ts
      ON ts.team_season_id = pis.team_season_id
    JOIN teams AS t
      ON t.team_id = ts.team_id
    LEFT JOIN conferences AS c
      ON c.conference_id = ts.conference_id
)
SELECT
    history.*,
    history.overall_rating - history.prior_import_overall_rating AS overall_change_from_prior_import,
    CASE
        WHEN history.prior_import_team_id IS NOT NULL
         AND history.prior_import_team_id <> history.team_id
        THEN TRUE
        ELSE FALSE
    END AS team_changed_from_prior_import,
    CASE
        WHEN history.prior_import_position IS NOT NULL
         AND history.prior_import_position <> history.position
        THEN TRUE
        ELSE FALSE
    END AS position_changed_from_prior_import
FROM history;

CREATE VIEW analytics.coach_snapshot_history AS
WITH history AS (
    SELECT
        ic.import_id,
        ic.dynasty_id,
        ic.dynasty_key,
        ic.dynasty_name,
        ic.game_season_id,
        ic.game_season_year,
        ic.roster_season_id AS season_id,
        ic.roster_season_index AS season_index,
        ic.roster_season_year AS season_year,
        ic.week_type,
        ic.week_number,
        ic.offseason_stage,
        ic.source_modified_at,
        cs.coach_season_id,
        coach.coach_id,
        coach.identity_key,
        CONCAT_WS(' ', cis.first_name, cis.last_name) AS coach_name,
        cis.role,
        cis.position,
        cis.level,
        cis.coach_prestige,
        cis.coach_prestige_score,
        cis.coach_points,
        cis.experience_points,
        cis.contract_status,
        cis.contract_years_remaining,
        cis.job_security_status,
        cis.job_security_percentage,
        cis.is_user_controlled,
        t.team_id,
        t.school_name,
        c.conference_id,
        c.conference_name,
        LAG(cis.level) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, coach.coach_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_level,
        LAG(cis.coach_prestige_score) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, coach.coach_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_prestige_score,
        LAG(t.team_id) OVER (
            PARTITION BY ic.dynasty_id, ic.roster_season_id, coach.coach_id
            ORDER BY ic.source_modified_at NULLS FIRST, ic.import_id
        ) AS prior_import_team_id
    FROM analytics.import_context AS ic
    JOIN coach_import_snapshots AS cis
      ON cis.import_id = ic.import_id
    JOIN coach_seasons AS cs
      ON cs.coach_season_id = cis.coach_season_id
     AND cs.season_id = ic.roster_season_id
    JOIN coaches AS coach
      ON coach.coach_id = cs.coach_id
    LEFT JOIN team_seasons AS ts
      ON ts.team_season_id = cis.team_season_id
    LEFT JOIN teams AS t
      ON t.team_id = ts.team_id
    LEFT JOIN conferences AS c
      ON c.conference_id = ts.conference_id
)
SELECT
    history.*,
    history.level - history.prior_import_level AS level_change_from_prior_import,
    history.coach_prestige_score - history.prior_import_prestige_score AS prestige_change_from_prior_import,
    CASE
        WHEN history.prior_import_team_id IS NOT NULL
         AND history.prior_import_team_id <> history.team_id
        THEN TRUE
        ELSE FALSE
    END AS team_changed_from_prior_import
FROM history;


-- -------------------- CURRENT GAME SCHEDULE / RESULTS --------------------

CREATE VIEW analytics.games AS
SELECT
    lgi.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    g.game_id,
    g.week_type,
    g.week_number,
    g.game_number,
    gis.source_season_game_row,
    gis.game_status,
    (gis.game_status IN ('HomeWon', 'AwayWon', 'Tie')) AS is_final,
    gis.home_team_id,
    gis.home_team_index,
    gis.home_team_name,
    gis.away_team_id,
    gis.away_team_index,
    gis.away_team_name,
    gis.home_score,
    gis.away_score,
    CASE
        WHEN gis.game_status NOT IN ('HomeWon', 'AwayWon', 'Tie') THEN NULL
        WHEN gis.home_score > gis.away_score THEN gis.home_team_id
        WHEN gis.away_score > gis.home_score THEN gis.away_team_id
        ELSE NULL
    END AS winner_team_id,
    CASE
        WHEN gis.game_status NOT IN ('HomeWon', 'AwayWon', 'Tie') THEN NULL
        WHEN gis.home_score > gis.away_score THEN gis.home_team_name
        WHEN gis.away_score > gis.home_score THEN gis.away_team_name
        ELSE NULL
    END AS winner_team_name,
    CASE
        WHEN gis.game_status NOT IN ('HomeWon', 'AwayWon', 'Tie') THEN NULL
        ELSE ABS(gis.home_score - gis.away_score)
    END AS score_margin,
    gis.day_of_week,
    gis.game_date_month,
    gis.game_date_day,
    gis.time_of_day_minutes,
    gis.broadcast_network,
    gis.stadium_reference,
    gis.is_game_of_the_week,
    gis.new_years_flag,
    gis.player_stats_available,
    gis.bowl_name,
    gis.bowl_asset_name,
    gis.bowl_presentation_id,
    gis.bowl_logo_id,
    gis.is_playoff_bowl,
    gis.playoff_bracket_slot,
    gis.should_play_new_years,
    gls.home_q1,
    gls.home_q2,
    gls.home_q3,
    gls.home_q4,
    gls.home_overtime,
    gls.away_q1,
    gls.away_q2,
    gls.away_q3,
    gls.away_q4,
    gls.away_overtime,
    CASE
        WHEN COALESCE(gls.home_overtime, 0) > 0
          OR COALESCE(gls.away_overtime, 0) > 0
        THEN TRUE
        ELSE FALSE
    END AS went_to_overtime
FROM analytics.latest_game_imports AS lgi
JOIN seasons AS s
  ON s.season_id = lgi.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN games AS g
  ON g.season_id = s.season_id
JOIN game_import_snapshots AS gis
  ON gis.import_id = lgi.import_id
 AND gis.game_id = g.game_id
LEFT JOIN game_line_scores AS gls
  ON gls.import_id = gis.import_id
 AND gls.game_id = gis.game_id;


-- -------------------- TEAM GAME ANALYTICS --------------------

CREATE VIEW analytics.team_games AS
SELECT
    btgi.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    g.game_id,
    g.week_type,
    g.week_number,
    g.game_number,
    gis.game_status,
    tgs.side AS home_away,
    tgs.team_id,
    tgs.team_index,
    tgs.team_name,
    ts.team_season_id,
    c.conference_id,
    c.game_conference_enum,
    c.conference_name,
    opponent.team_id AS opponent_team_id,
    opponent.team_index AS opponent_team_index,
    opponent.team_name AS opponent_team_name,
    opponent_ts.conference_id AS opponent_conference_id,
    opponent_conference.conference_name AS opponent_conference_name,
    CASE
        WHEN ts.conference_id IS NOT NULL
         AND opponent_ts.conference_id = ts.conference_id
        THEN TRUE
        ELSE FALSE
    END AS is_conference_game,
    CASE
        WHEN tgs.side = 'home' THEN gis.home_score
        ELSE gis.away_score
    END AS points_for,
    CASE
        WHEN tgs.side = 'home' THEN gis.away_score
        ELSE gis.home_score
    END AS points_against,
    CASE
        WHEN gis.game_status NOT IN ('HomeWon', 'AwayWon', 'Tie') THEN NULL
        WHEN gis.home_score = gis.away_score THEN 'T'
        WHEN tgs.side = 'home' AND gis.home_score > gis.away_score THEN 'W'
        WHEN tgs.side = 'away' AND gis.away_score > gis.home_score THEN 'W'
        ELSE 'L'
    END AS result,
    CASE
        WHEN gis.game_status NOT IN ('HomeWon', 'AwayWon', 'Tie') THEN NULL
        WHEN tgs.side = 'home' THEN gis.home_score - gis.away_score
        ELSE gis.away_score - gis.home_score
    END AS point_margin,
    tgs.first_downs,
    tgs.total_yards,
    tgs.offensive_yards,
    tgs.rushing_yards,
    tgs.rushing_attempts,
    tgs.passing_yards,
    tgs.completions,
    tgs.passing_attempts,
    tgs.passing_tds,
    tgs.rushing_tds,
    tgs.interceptions_thrown,
    tgs.fumbles_lost,
    tgs.giveaways,
    tgs.takeaways,
    tgs.takeaways - tgs.giveaways AS turnover_margin,
    tgs.sacks,
    tgs.sacks_allowed,
    tgs.third_down_conversions,
    tgs.third_down_attempts,
    tgs.third_down_percentage,
    tgs.fourth_down_conversions,
    tgs.fourth_down_attempts,
    tgs.fourth_down_percentage,
    tgs.red_zone_trips,
    tgs.red_zone_tds,
    tgs.red_zone_field_goals,
    CASE
        WHEN tgs.red_zone_trips > 0
        THEN (tgs.red_zone_tds::numeric / tgs.red_zone_trips) * 100
        ELSE NULL
    END AS red_zone_td_percentage,
    CASE
        WHEN tgs.red_zone_trips > 0
        THEN ((tgs.red_zone_tds + tgs.red_zone_field_goals)::numeric / tgs.red_zone_trips) * 100
        ELSE NULL
    END AS red_zone_score_percentage,
    tgs.penalties,
    tgs.penalty_yards,
    tgs.punts,
    tgs.punt_yards,
    tgs.possession_time_seconds,
    tgs.kick_return_yards,
    tgs.punt_return_yards,
    CASE
        WHEN COALESCE(tgs.rushing_attempts, 0) + COALESCE(tgs.passing_attempts, 0) > 0
        THEN tgs.offensive_yards::numeric /
             (COALESCE(tgs.rushing_attempts, 0) + COALESCE(tgs.passing_attempts, 0))
        ELSE NULL
    END AS yards_per_play,
    opponent.offensive_yards AS opponent_offensive_yards,
    opponent.rushing_yards AS opponent_rushing_yards,
    opponent.rushing_attempts AS opponent_rushing_attempts,
    opponent.passing_yards AS opponent_passing_yards,
    opponent.completions AS opponent_completions,
    opponent.passing_attempts AS opponent_passing_attempts,
    opponent.passing_tds AS opponent_passing_tds,
    opponent.rushing_tds AS opponent_rushing_tds,
    opponent.giveaways AS opponent_giveaways,
    opponent.takeaways AS opponent_takeaways,
    opponent.third_down_conversions AS opponent_third_down_conversions,
    opponent.third_down_attempts AS opponent_third_down_attempts,
    opponent.fourth_down_conversions AS opponent_fourth_down_conversions,
    opponent.fourth_down_attempts AS opponent_fourth_down_attempts,
    opponent.red_zone_trips AS opponent_red_zone_trips,
    opponent.red_zone_tds AS opponent_red_zone_tds,
    opponent.red_zone_field_goals AS opponent_red_zone_field_goals,
    CASE
        WHEN tgs.side = 'home' THEN gls.home_q1
        ELSE gls.away_q1
    END AS q1_points,
    CASE
        WHEN tgs.side = 'home' THEN gls.home_q2
        ELSE gls.away_q2
    END AS q2_points,
    CASE
        WHEN tgs.side = 'home' THEN gls.home_q3
        ELSE gls.away_q3
    END AS q3_points,
    CASE
        WHEN tgs.side = 'home' THEN gls.home_q4
        ELSE gls.away_q4
    END AS q4_points,
    CASE
        WHEN tgs.side = 'home' THEN gls.home_overtime
        ELSE gls.away_overtime
    END AS overtime_points,
    gis.bowl_name,
    gis.is_playoff_bowl,
    gis.playoff_bracket_slot
FROM analytics.best_team_game_imports AS btgi
JOIN seasons AS s
  ON s.season_id = btgi.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN games AS g
  ON g.season_id = s.season_id
JOIN game_import_snapshots AS gis
  ON gis.import_id = btgi.import_id
 AND gis.game_id = g.game_id
JOIN team_game_stats AS tgs
  ON tgs.import_id = gis.import_id
 AND tgs.game_id = gis.game_id
LEFT JOIN team_game_stats AS opponent
  ON opponent.import_id = tgs.import_id
 AND opponent.game_id = tgs.game_id
 AND opponent.side <> tgs.side
LEFT JOIN team_seasons AS ts
  ON ts.season_id = s.season_id
 AND ts.team_id = tgs.team_id
LEFT JOIN conferences AS c
  ON c.conference_id = ts.conference_id
LEFT JOIN team_seasons AS opponent_ts
  ON opponent_ts.season_id = s.season_id
 AND opponent_ts.team_id = opponent.team_id
LEFT JOIN conferences AS opponent_conference
  ON opponent_conference.conference_id = opponent_ts.conference_id
LEFT JOIN game_line_scores AS gls
  ON gls.import_id = gis.import_id
 AND gls.game_id = gis.game_id;


-- -------------------- PLAYER GAME ANALYTICS --------------------

CREATE VIEW analytics.player_games AS
WITH player_context AS (
    SELECT
        pgsl.import_id,
        pgsl.game_id,
        pgsl.player_id,
        MAX(pgsl.team_id) AS team_id,
        MAX(pgsl.side) AS home_away,
        MAX(pgsl.team_index) AS team_index,
        MAX(pgsl.team_name) AS team_name,
        MAX(pgsl.opponent_team_index) AS opponent_team_index,
        MAX(pgsl.opponent_team_name) AS opponent_team_name
    FROM player_game_stat_lines AS pgsl
    GROUP BY
        pgsl.import_id,
        pgsl.game_id,
        pgsl.player_id
),
stat_pivot AS (
    SELECT
        pgs.import_id,
        pgs.game_id,
        pgs.player_id,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'passing' AND pgs.stat_name = 'completions'), 0) AS pass_completions,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'passing' AND pgs.stat_name = 'attempts'), 0) AS pass_attempts,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'passing' AND pgs.stat_name = 'passingYards'), 0) AS passing_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'passing' AND pgs.stat_name = 'passingTDs'), 0) AS passing_tds,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'passing' AND pgs.stat_name = 'interceptions'), 0) AS interceptions_thrown,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'passing' AND pgs.stat_name = 'sacks'), 0) AS pass_sacks_taken,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'passing' AND pgs.stat_name = 'longestPass'), 0) AS longest_pass,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'rushing' AND pgs.stat_name = 'rushingAttempts'), 0) AS rushing_attempts,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'rushing' AND pgs.stat_name = 'rushingYards'), 0) AS rushing_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'rushing' AND pgs.stat_name = 'rushingTDs'), 0) AS rushing_tds,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'rushing' AND pgs.stat_name = 'longestRush'), 0) AS longest_rush,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'rushing' AND pgs.stat_name = 'rushingBrokenTackles'), 0) AS rushing_broken_tackles,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'rushing' AND pgs.stat_name = 'fumbles'), 0) AS rushing_fumbles,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'receiving' AND pgs.stat_name = 'receptions'), 0) AS receptions,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'receiving' AND pgs.stat_name = 'receivingYards'), 0) AS receiving_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'receiving' AND pgs.stat_name = 'receivingTDs'), 0) AS receiving_tds,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'receiving' AND pgs.stat_name = 'yardsAfterCatch'), 0) AS yards_after_catch,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'receiving' AND pgs.stat_name = 'longestReception'), 0) AS longest_reception,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'receiving' AND pgs.stat_name = 'drops'), 0) AS drops,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'soloTackles'), 0) AS solo_tackles,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'assistedTackles'), 0) AS assisted_tackles,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'totalTackles'), 0) AS total_tackles,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'tacklesForLoss'), 0) AS tackles_for_loss,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'sacks'), 0) AS defensive_sacks,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'interceptions'), 0) AS defensive_interceptions,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'interceptionYards'), 0) AS interception_return_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'longestInterception'), 0) AS longest_interception_return,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'passDeflections'), 0) AS pass_deflections,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'forcedFumbles'), 0) AS forced_fumbles,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'fumbleRecoveries'), 0) AS fumble_recoveries,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'fumbleRecoveryYards'), 0) AS fumble_recovery_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'blockedKicks'), 0) AS blocked_kicks,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'safeties'), 0) AS safeties,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'defense' AND pgs.stat_name = 'defensiveTDs'), 0) AS defensive_tds,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'o_line' AND pgs.stat_name = 'pancakes'), 0) AS pancakes,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'o_line' AND pgs.stat_name = 'sacksAllowed'), 0) AS oline_sacks_allowed,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'o_line' AND pgs.stat_name = 'downsPlayed'), 0) AS oline_downs_played,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'o_line' AND pgs.stat_name = 'gamesStarted'), 0) AS oline_games_started,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kicking' AND pgs.stat_name = 'fieldGoalsMade'), 0) AS field_goals_made,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kicking' AND pgs.stat_name = 'fieldGoalsAttempted'), 0) AS field_goals_attempted,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kicking' AND pgs.stat_name = 'longestFieldGoal'), 0) AS longest_field_goal,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kicking' AND pgs.stat_name = 'extraPointsMade'), 0) AS extra_points_made,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kicking' AND pgs.stat_name = 'extraPointsAttempted'), 0) AS extra_points_attempted,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punting' AND pgs.stat_name = 'punts'), 0) AS punts,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punting' AND pgs.stat_name = 'puntingYards'), 0) AS punting_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punting' AND pgs.stat_name = 'netPuntingYards'), 0) AS net_punting_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punting' AND pgs.stat_name = 'longestPunt'), 0) AS longest_punt,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punting' AND pgs.stat_name = 'puntsInside20'), 0) AS punts_inside_20,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punting' AND pgs.stat_name = 'touchbacks'), 0) AS punt_touchbacks,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punting' AND pgs.stat_name = 'blockedPunts'), 0) AS blocked_punts,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kick_return' AND pgs.stat_name = 'kickReturns'), 0) AS kick_returns,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kick_return' AND pgs.stat_name = 'kickReturnYards'), 0) AS kick_return_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kick_return' AND pgs.stat_name = 'longestKickReturn'), 0) AS longest_kick_return,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'kick_return' AND pgs.stat_name = 'kickReturnTDs'), 0) AS kick_return_tds,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punt_return' AND pgs.stat_name = 'puntReturns'), 0) AS punt_returns,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punt_return' AND pgs.stat_name = 'puntReturnYards'), 0) AS punt_return_yards,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punt_return' AND pgs.stat_name = 'longestPuntReturn'), 0) AS longest_punt_return,
        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'punt_return' AND pgs.stat_name = 'puntReturnTDs'), 0) AS punt_return_tds,

        COALESCE(MAX(pgs.stat_value) FILTER (WHERE pgs.stat_category = 'fumbles' AND pgs.stat_name = 'fumbles'), 0) AS recorded_fumbles
    FROM player_game_stats AS pgs
    GROUP BY
        pgs.import_id,
        pgs.game_id,
        pgs.player_id
)
SELECT
    bpgi.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    g.game_id,
    g.week_type,
    g.week_number,
    g.game_number,
    gis.game_status,
    pc.player_id,
    p.first_name,
    p.last_name,
    CONCAT_WS(' ', p.first_name, p.last_name) AS player_name,
    pss.jersey_number,
    pss.position,
    pss.class_year,
    pss.overall_rating,
    pc.team_id,
    pc.team_index,
    pc.team_name,
    pc.home_away,
    opponent_team.team_id AS opponent_team_id,
    pc.opponent_team_index,
    pc.opponent_team_name,
    CASE
        WHEN pc.home_away = 'home' THEN gis.home_score
        ELSE gis.away_score
    END AS team_score,
    CASE
        WHEN pc.home_away = 'home' THEN gis.away_score
        ELSE gis.home_score
    END AS opponent_score,
    CASE
        WHEN gis.game_status NOT IN ('HomeWon', 'AwayWon', 'Tie') THEN NULL
        WHEN gis.home_score = gis.away_score THEN 'T'
        WHEN pc.home_away = 'home' AND gis.home_score > gis.away_score THEN 'W'
        WHEN pc.home_away = 'away' AND gis.away_score > gis.home_score THEN 'W'
        ELSE 'L'
    END AS result,

    sp.pass_completions,
    sp.pass_attempts,
    sp.passing_yards,
    sp.passing_tds,
    sp.interceptions_thrown,
    sp.pass_sacks_taken,
    sp.longest_pass,
    CASE WHEN sp.pass_attempts > 0 THEN (sp.pass_completions / sp.pass_attempts) * 100 ELSE NULL END AS completion_percentage,
    CASE WHEN sp.pass_attempts > 0 THEN sp.passing_yards / sp.pass_attempts ELSE NULL END AS passing_yards_per_attempt,

    sp.rushing_attempts,
    sp.rushing_yards,
    sp.rushing_tds,
    sp.longest_rush,
    sp.rushing_broken_tackles,
    sp.rushing_fumbles,
    CASE WHEN sp.rushing_attempts > 0 THEN sp.rushing_yards / sp.rushing_attempts ELSE NULL END AS rushing_yards_per_attempt,

    sp.receptions,
    sp.receiving_yards,
    sp.receiving_tds,
    sp.yards_after_catch,
    sp.longest_reception,
    sp.drops,
    CASE WHEN sp.receptions > 0 THEN sp.receiving_yards / sp.receptions ELSE NULL END AS receiving_yards_per_reception,

    sp.rushing_yards + sp.receiving_yards AS scrimmage_yards,
    sp.rushing_tds + sp.receiving_tds AS scrimmage_tds,

    sp.solo_tackles,
    sp.assisted_tackles,
    sp.total_tackles,
    sp.tackles_for_loss,
    sp.defensive_sacks,
    sp.defensive_interceptions,
    sp.interception_return_yards,
    sp.longest_interception_return,
    sp.pass_deflections,
    sp.forced_fumbles,
    sp.fumble_recoveries,
    sp.fumble_recovery_yards,
    sp.blocked_kicks,
    sp.safeties,
    sp.defensive_tds,

    sp.pancakes,
    sp.oline_sacks_allowed,
    sp.oline_downs_played,
    sp.oline_games_started,

    sp.field_goals_made,
    sp.field_goals_attempted,
    sp.longest_field_goal,
    sp.extra_points_made,
    sp.extra_points_attempted,
    CASE WHEN sp.field_goals_attempted > 0 THEN (sp.field_goals_made / sp.field_goals_attempted) * 100 ELSE NULL END AS field_goal_percentage,

    sp.punts,
    sp.punting_yards,
    sp.net_punting_yards,
    sp.longest_punt,
    sp.punts_inside_20,
    sp.punt_touchbacks,
    sp.blocked_punts,
    CASE WHEN sp.punts > 0 THEN sp.punting_yards / sp.punts ELSE NULL END AS punting_average,
    CASE WHEN sp.punts > 0 THEN sp.net_punting_yards / sp.punts ELSE NULL END AS net_punting_average,

    sp.kick_returns,
    sp.kick_return_yards,
    sp.longest_kick_return,
    sp.kick_return_tds,
    CASE WHEN sp.kick_returns > 0 THEN sp.kick_return_yards / sp.kick_returns ELSE NULL END AS kick_return_average,

    sp.punt_returns,
    sp.punt_return_yards,
    sp.longest_punt_return,
    sp.punt_return_tds,
    CASE WHEN sp.punt_returns > 0 THEN sp.punt_return_yards / sp.punt_returns ELSE NULL END AS punt_return_average,

    GREATEST(sp.rushing_fumbles, sp.recorded_fumbles) AS fumbles,
    sp.passing_tds + sp.rushing_tds + sp.receiving_tds + sp.defensive_tds +
        sp.kick_return_tds + sp.punt_return_tds AS total_touchdowns
FROM analytics.best_player_game_imports AS bpgi
JOIN seasons AS s
  ON s.season_id = bpgi.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN player_context AS pc
  ON pc.import_id = bpgi.import_id
JOIN stat_pivot AS sp
  ON sp.import_id = pc.import_id
 AND sp.game_id = pc.game_id
 AND sp.player_id = pc.player_id
JOIN games AS g
  ON g.game_id = pc.game_id
 AND g.season_id = s.season_id
JOIN game_import_snapshots AS gis
  ON gis.import_id = pc.import_id
 AND gis.game_id = pc.game_id
JOIN players AS p
  ON p.player_id = pc.player_id
LEFT JOIN analytics.player_season_snapshots AS pss
  ON pss.season_id = s.season_id
 AND pss.player_id = pc.player_id
LEFT JOIN teams AS opponent_team
  ON opponent_team.dynasty_id = s.dynasty_id
 AND opponent_team.game_team_index = pc.opponent_team_index;


-- -------------------- PLAYER SEASON ANALYTICS --------------------

CREATE VIEW analytics.player_seasons AS
WITH game_totals AS (
    SELECT
        pg.dynasty_id,
        pg.season_id,
        pg.player_id,
        COUNT(DISTINCT pg.game_id) AS games_with_recorded_stats,
        COUNT(DISTINCT pg.game_id) FILTER (WHERE pg.home_away IS NOT NULL) AS games_appeared,

        SUM(pg.pass_completions) AS pass_completions,
        SUM(pg.pass_attempts) AS pass_attempts,
        SUM(pg.passing_yards) AS passing_yards,
        SUM(pg.passing_tds) AS passing_tds,
        SUM(pg.interceptions_thrown) AS interceptions_thrown,
        SUM(pg.pass_sacks_taken) AS pass_sacks_taken,
        MAX(pg.longest_pass) AS longest_pass,

        SUM(pg.rushing_attempts) AS rushing_attempts,
        SUM(pg.rushing_yards) AS rushing_yards,
        SUM(pg.rushing_tds) AS rushing_tds,
        MAX(pg.longest_rush) AS longest_rush,
        SUM(pg.rushing_broken_tackles) AS rushing_broken_tackles,
        SUM(pg.rushing_fumbles) AS rushing_fumbles,

        SUM(pg.receptions) AS receptions,
        SUM(pg.receiving_yards) AS receiving_yards,
        SUM(pg.receiving_tds) AS receiving_tds,
        SUM(pg.yards_after_catch) AS yards_after_catch,
        MAX(pg.longest_reception) AS longest_reception,
        SUM(pg.drops) AS drops,

        SUM(pg.solo_tackles) AS solo_tackles,
        SUM(pg.assisted_tackles) AS assisted_tackles,
        SUM(pg.total_tackles) AS total_tackles,
        SUM(pg.tackles_for_loss) AS tackles_for_loss,
        SUM(pg.defensive_sacks) AS defensive_sacks,
        SUM(pg.defensive_interceptions) AS defensive_interceptions,
        SUM(pg.interception_return_yards) AS interception_return_yards,
        MAX(pg.longest_interception_return) AS longest_interception_return,
        SUM(pg.pass_deflections) AS pass_deflections,
        SUM(pg.forced_fumbles) AS forced_fumbles,
        SUM(pg.fumble_recoveries) AS fumble_recoveries,
        SUM(pg.fumble_recovery_yards) AS fumble_recovery_yards,
        SUM(pg.blocked_kicks) AS blocked_kicks,
        SUM(pg.safeties) AS safeties,
        SUM(pg.defensive_tds) AS defensive_tds,

        SUM(pg.pancakes) AS pancakes,
        SUM(pg.oline_sacks_allowed) AS oline_sacks_allowed,
        SUM(pg.oline_downs_played) AS oline_downs_played,
        SUM(pg.oline_games_started) AS oline_games_started,

        SUM(pg.field_goals_made) AS field_goals_made,
        SUM(pg.field_goals_attempted) AS field_goals_attempted,
        MAX(pg.longest_field_goal) AS longest_field_goal,
        SUM(pg.extra_points_made) AS extra_points_made,
        SUM(pg.extra_points_attempted) AS extra_points_attempted,

        SUM(pg.punts) AS punts,
        SUM(pg.punting_yards) AS punting_yards,
        SUM(pg.net_punting_yards) AS net_punting_yards,
        MAX(pg.longest_punt) AS longest_punt,
        SUM(pg.punts_inside_20) AS punts_inside_20,
        SUM(pg.punt_touchbacks) AS punt_touchbacks,
        SUM(pg.blocked_punts) AS blocked_punts,

        SUM(pg.kick_returns) AS kick_returns,
        SUM(pg.kick_return_yards) AS kick_return_yards,
        MAX(pg.longest_kick_return) AS longest_kick_return,
        SUM(pg.kick_return_tds) AS kick_return_tds,

        SUM(pg.punt_returns) AS punt_returns,
        SUM(pg.punt_return_yards) AS punt_return_yards,
        MAX(pg.longest_punt_return) AS longest_punt_return,
        SUM(pg.punt_return_tds) AS punt_return_tds,

        SUM(pg.fumbles) AS fumbles,
        SUM(pg.total_touchdowns) AS total_touchdowns
    FROM analytics.player_games AS pg
    GROUP BY
        pg.dynasty_id,
        pg.season_id,
        pg.player_id
)
SELECT
    pss.import_id,
    pss.dynasty_id,
    pss.dynasty_key,
    pss.dynasty_name,
    pss.season_id,
    pss.season_index,
    pss.season_year,
    pss.player_season_id,
    pss.player_id,
    pss.identity_key,
    pss.presentation_id,
    pss.player_name,
    pss.jersey_number,
    pss.position,
    pss.class_year,
    pss.redshirt_status,
    pss.overall_rating,
    pss.height_inches,
    pss.weight_pounds,
    pss.development_trait,
    pss.skill_points,
    pss.experience_points,
    pss.consecutive_years_with_team,
    pss.is_transfer,
    pss.is_current_season_transfer,
    pss.team_season_id,
    pss.team_id,
    pss.game_team_index,
    pss.school_name,
    pss.abbreviation,
    pss.conference_id,
    pss.game_conference_enum,
    pss.conference_name,
    pss.previous_team_id,
    pss.previous_team_name,
    COALESCE(gt.games_with_recorded_stats, 0) AS games_with_recorded_stats,
    COALESCE(gt.games_appeared, 0) AS games_appeared,

    COALESCE(gt.pass_completions, 0) AS pass_completions,
    COALESCE(gt.pass_attempts, 0) AS pass_attempts,
    COALESCE(gt.passing_yards, 0) AS passing_yards,
    COALESCE(gt.passing_tds, 0) AS passing_tds,
    COALESCE(gt.interceptions_thrown, 0) AS interceptions_thrown,
    COALESCE(gt.pass_sacks_taken, 0) AS pass_sacks_taken,
    COALESCE(gt.longest_pass, 0) AS longest_pass,
    CASE WHEN COALESCE(gt.pass_attempts, 0) > 0 THEN (gt.pass_completions / gt.pass_attempts) * 100 ELSE NULL END AS completion_percentage,
    CASE WHEN COALESCE(gt.pass_attempts, 0) > 0 THEN gt.passing_yards / gt.pass_attempts ELSE NULL END AS passing_yards_per_attempt,

    COALESCE(gt.rushing_attempts, 0) AS rushing_attempts,
    COALESCE(gt.rushing_yards, 0) AS rushing_yards,
    COALESCE(gt.rushing_tds, 0) AS rushing_tds,
    COALESCE(gt.longest_rush, 0) AS longest_rush,
    COALESCE(gt.rushing_broken_tackles, 0) AS rushing_broken_tackles,
    COALESCE(gt.rushing_fumbles, 0) AS rushing_fumbles,
    CASE WHEN COALESCE(gt.rushing_attempts, 0) > 0 THEN gt.rushing_yards / gt.rushing_attempts ELSE NULL END AS rushing_yards_per_attempt,

    COALESCE(gt.receptions, 0) AS receptions,
    COALESCE(gt.receiving_yards, 0) AS receiving_yards,
    COALESCE(gt.receiving_tds, 0) AS receiving_tds,
    COALESCE(gt.yards_after_catch, 0) AS yards_after_catch,
    COALESCE(gt.longest_reception, 0) AS longest_reception,
    COALESCE(gt.drops, 0) AS drops,
    CASE WHEN COALESCE(gt.receptions, 0) > 0 THEN gt.receiving_yards / gt.receptions ELSE NULL END AS receiving_yards_per_reception,
    COALESCE(gt.rushing_yards, 0) + COALESCE(gt.receiving_yards, 0) AS scrimmage_yards,
    COALESCE(gt.rushing_tds, 0) + COALESCE(gt.receiving_tds, 0) AS scrimmage_tds,

    COALESCE(gt.solo_tackles, 0) AS solo_tackles,
    COALESCE(gt.assisted_tackles, 0) AS assisted_tackles,
    COALESCE(gt.total_tackles, 0) AS total_tackles,
    COALESCE(gt.tackles_for_loss, 0) AS tackles_for_loss,
    COALESCE(gt.defensive_sacks, 0) AS defensive_sacks,
    COALESCE(gt.defensive_interceptions, 0) AS defensive_interceptions,
    COALESCE(gt.interception_return_yards, 0) AS interception_return_yards,
    COALESCE(gt.longest_interception_return, 0) AS longest_interception_return,
    COALESCE(gt.pass_deflections, 0) AS pass_deflections,
    COALESCE(gt.forced_fumbles, 0) AS forced_fumbles,
    COALESCE(gt.fumble_recoveries, 0) AS fumble_recoveries,
    COALESCE(gt.fumble_recovery_yards, 0) AS fumble_recovery_yards,
    COALESCE(gt.blocked_kicks, 0) AS blocked_kicks,
    COALESCE(gt.safeties, 0) AS safeties,
    COALESCE(gt.defensive_tds, 0) AS defensive_tds,

    COALESCE(gt.pancakes, 0) AS pancakes,
    COALESCE(gt.oline_sacks_allowed, 0) AS oline_sacks_allowed,
    COALESCE(gt.oline_downs_played, 0) AS oline_downs_played,
    COALESCE(gt.oline_games_started, 0) AS oline_games_started,

    COALESCE(gt.field_goals_made, 0) AS field_goals_made,
    COALESCE(gt.field_goals_attempted, 0) AS field_goals_attempted,
    COALESCE(gt.longest_field_goal, 0) AS longest_field_goal,
    COALESCE(gt.extra_points_made, 0) AS extra_points_made,
    COALESCE(gt.extra_points_attempted, 0) AS extra_points_attempted,
    CASE WHEN COALESCE(gt.field_goals_attempted, 0) > 0 THEN (gt.field_goals_made / gt.field_goals_attempted) * 100 ELSE NULL END AS field_goal_percentage,

    COALESCE(gt.punts, 0) AS punts,
    COALESCE(gt.punting_yards, 0) AS punting_yards,
    COALESCE(gt.net_punting_yards, 0) AS net_punting_yards,
    COALESCE(gt.longest_punt, 0) AS longest_punt,
    COALESCE(gt.punts_inside_20, 0) AS punts_inside_20,
    COALESCE(gt.punt_touchbacks, 0) AS punt_touchbacks,
    COALESCE(gt.blocked_punts, 0) AS blocked_punts,
    CASE WHEN COALESCE(gt.punts, 0) > 0 THEN gt.punting_yards / gt.punts ELSE NULL END AS punting_average,
    CASE WHEN COALESCE(gt.punts, 0) > 0 THEN gt.net_punting_yards / gt.punts ELSE NULL END AS net_punting_average,

    COALESCE(gt.kick_returns, 0) AS kick_returns,
    COALESCE(gt.kick_return_yards, 0) AS kick_return_yards,
    COALESCE(gt.longest_kick_return, 0) AS longest_kick_return,
    COALESCE(gt.kick_return_tds, 0) AS kick_return_tds,
    CASE WHEN COALESCE(gt.kick_returns, 0) > 0 THEN gt.kick_return_yards / gt.kick_returns ELSE NULL END AS kick_return_average,

    COALESCE(gt.punt_returns, 0) AS punt_returns,
    COALESCE(gt.punt_return_yards, 0) AS punt_return_yards,
    COALESCE(gt.longest_punt_return, 0) AS longest_punt_return,
    COALESCE(gt.punt_return_tds, 0) AS punt_return_tds,
    CASE WHEN COALESCE(gt.punt_returns, 0) > 0 THEN gt.punt_return_yards / gt.punt_returns ELSE NULL END AS punt_return_average,

    COALESCE(gt.fumbles, 0) AS fumbles,
    COALESCE(gt.total_touchdowns, 0) AS total_touchdowns
FROM analytics.player_season_snapshots AS pss
LEFT JOIN game_totals AS gt
  ON gt.dynasty_id = pss.dynasty_id
 AND gt.season_id = pss.season_id
 AND gt.player_id = pss.player_id;


-- -------------------- TEAM SEASON OFFENSE --------------------

CREATE VIEW analytics.team_offense_seasons AS
SELECT
    tg.dynasty_id,
    tg.dynasty_key,
    tg.dynasty_name,
    tg.season_id,
    tg.season_index,
    tg.season_year,
    tg.team_id,
    tg.team_season_id,
    tg.team_index AS game_team_index,
    tg.team_name AS school_name,
    tg.conference_id,
    tg.game_conference_enum,
    tg.conference_name,
    COUNT(*) AS games_played,
    COUNT(*) FILTER (WHERE tg.result = 'W') AS wins,
    COUNT(*) FILTER (WHERE tg.result = 'L') AS losses,
    COUNT(*) FILTER (WHERE tg.result = 'T') AS ties,
    SUM(tg.points_for) AS points_scored,
    AVG(tg.points_for::numeric) AS points_per_game,
    SUM(tg.offensive_yards) AS offensive_yards,
    AVG(tg.offensive_yards::numeric) AS offensive_yards_per_game,
    SUM(tg.rushing_yards) AS rushing_yards,
    AVG(tg.rushing_yards::numeric) AS rushing_yards_per_game,
    SUM(tg.rushing_attempts) AS rushing_attempts,
    CASE WHEN SUM(tg.rushing_attempts) > 0 THEN SUM(tg.rushing_yards)::numeric / SUM(tg.rushing_attempts) ELSE NULL END AS rushing_yards_per_attempt,
    SUM(tg.passing_yards) AS passing_yards,
    AVG(tg.passing_yards::numeric) AS passing_yards_per_game,
    SUM(tg.completions) AS completions,
    SUM(tg.passing_attempts) AS passing_attempts,
    CASE WHEN SUM(tg.passing_attempts) > 0 THEN (SUM(tg.completions)::numeric / SUM(tg.passing_attempts)) * 100 ELSE NULL END AS completion_percentage,
    CASE WHEN SUM(tg.passing_attempts) > 0 THEN SUM(tg.passing_yards)::numeric / SUM(tg.passing_attempts) ELSE NULL END AS passing_yards_per_attempt,
    CASE
        WHEN SUM(COALESCE(tg.rushing_attempts, 0) + COALESCE(tg.passing_attempts, 0)) > 0
        THEN SUM(tg.offensive_yards)::numeric /
             SUM(COALESCE(tg.rushing_attempts, 0) + COALESCE(tg.passing_attempts, 0))
        ELSE NULL
    END AS yards_per_play,
    SUM(tg.passing_tds) AS passing_tds,
    SUM(tg.rushing_tds) AS rushing_tds,
    SUM(tg.passing_tds) + SUM(tg.rushing_tds) AS offensive_tds,
    SUM(tg.giveaways) AS giveaways,
    AVG(tg.giveaways::numeric) AS giveaways_per_game,
    SUM(tg.sacks_allowed) AS sacks_allowed,
    AVG(tg.sacks_allowed) AS sacks_allowed_per_game,
    SUM(tg.third_down_conversions) AS third_down_conversions,
    SUM(tg.third_down_attempts) AS third_down_attempts,
    CASE WHEN SUM(tg.third_down_attempts) > 0 THEN (SUM(tg.third_down_conversions)::numeric / SUM(tg.third_down_attempts)) * 100 ELSE NULL END AS third_down_percentage,
    SUM(tg.fourth_down_conversions) AS fourth_down_conversions,
    SUM(tg.fourth_down_attempts) AS fourth_down_attempts,
    CASE WHEN SUM(tg.fourth_down_attempts) > 0 THEN (SUM(tg.fourth_down_conversions)::numeric / SUM(tg.fourth_down_attempts)) * 100 ELSE NULL END AS fourth_down_percentage,
    SUM(tg.red_zone_trips) AS red_zone_trips,
    SUM(tg.red_zone_tds) AS red_zone_tds,
    SUM(tg.red_zone_field_goals) AS red_zone_field_goals,
    CASE WHEN SUM(tg.red_zone_trips) > 0 THEN (SUM(tg.red_zone_tds)::numeric / SUM(tg.red_zone_trips)) * 100 ELSE NULL END AS red_zone_td_percentage,
    CASE WHEN SUM(tg.red_zone_trips) > 0 THEN ((SUM(tg.red_zone_tds) + SUM(tg.red_zone_field_goals))::numeric / SUM(tg.red_zone_trips)) * 100 ELSE NULL END AS red_zone_score_percentage,
    AVG(tg.possession_time_seconds::numeric) AS possession_seconds_per_game,
    SUM(tg.kick_return_yards) AS kick_return_yards,
    SUM(tg.punt_return_yards) AS punt_return_yards
FROM analytics.team_games AS tg
WHERE tg.team_id IS NOT NULL
GROUP BY
    tg.dynasty_id,
    tg.dynasty_key,
    tg.dynasty_name,
    tg.season_id,
    tg.season_index,
    tg.season_year,
    tg.team_id,
    tg.team_season_id,
    tg.team_index,
    tg.team_name,
    tg.conference_id,
    tg.game_conference_enum,
    tg.conference_name;


-- -------------------- TEAM SEASON DEFENSE --------------------

CREATE VIEW analytics.team_defense_seasons AS
SELECT
    tg.dynasty_id,
    tg.dynasty_key,
    tg.dynasty_name,
    tg.season_id,
    tg.season_index,
    tg.season_year,
    tg.team_id,
    tg.team_season_id,
    tg.team_index AS game_team_index,
    tg.team_name AS school_name,
    tg.conference_id,
    tg.game_conference_enum,
    tg.conference_name,
    COUNT(*) AS games_played,
    SUM(tg.points_against) AS points_allowed,
    AVG(tg.points_against::numeric) AS points_allowed_per_game,
    SUM(tg.opponent_offensive_yards) AS yards_allowed,
    AVG(tg.opponent_offensive_yards::numeric) AS yards_allowed_per_game,
    SUM(tg.opponent_rushing_yards) AS rushing_yards_allowed,
    AVG(tg.opponent_rushing_yards::numeric) AS rushing_yards_allowed_per_game,
    SUM(tg.opponent_passing_yards) AS passing_yards_allowed,
    AVG(tg.opponent_passing_yards::numeric) AS passing_yards_allowed_per_game,
    CASE
        WHEN SUM(COALESCE(tg.opponent_rushing_attempts, 0) + COALESCE(tg.opponent_passing_attempts, 0)) > 0
        THEN SUM(tg.opponent_offensive_yards)::numeric /
             SUM(COALESCE(tg.opponent_rushing_attempts, 0) + COALESCE(tg.opponent_passing_attempts, 0))
        ELSE NULL
    END AS yards_per_play_allowed,
    SUM(tg.takeaways) AS takeaways,
    AVG(tg.takeaways::numeric) AS takeaways_per_game,
    SUM(tg.sacks) AS sacks,
    AVG(tg.sacks) AS sacks_per_game,
    SUM(tg.opponent_third_down_conversions) AS opponent_third_down_conversions,
    SUM(tg.opponent_third_down_attempts) AS opponent_third_down_attempts,
    CASE WHEN SUM(tg.opponent_third_down_attempts) > 0 THEN (SUM(tg.opponent_third_down_conversions)::numeric / SUM(tg.opponent_third_down_attempts)) * 100 ELSE NULL END AS opponent_third_down_percentage,
    SUM(tg.opponent_fourth_down_conversions) AS opponent_fourth_down_conversions,
    SUM(tg.opponent_fourth_down_attempts) AS opponent_fourth_down_attempts,
    CASE WHEN SUM(tg.opponent_fourth_down_attempts) > 0 THEN (SUM(tg.opponent_fourth_down_conversions)::numeric / SUM(tg.opponent_fourth_down_attempts)) * 100 ELSE NULL END AS opponent_fourth_down_percentage,
    SUM(tg.opponent_red_zone_trips) AS opponent_red_zone_trips,
    SUM(tg.opponent_red_zone_tds) AS opponent_red_zone_tds,
    SUM(tg.opponent_red_zone_field_goals) AS opponent_red_zone_field_goals,
    CASE WHEN SUM(tg.opponent_red_zone_trips) > 0 THEN (SUM(tg.opponent_red_zone_tds)::numeric / SUM(tg.opponent_red_zone_trips)) * 100 ELSE NULL END AS opponent_red_zone_td_percentage,
    CASE WHEN SUM(tg.opponent_red_zone_trips) > 0 THEN ((SUM(tg.opponent_red_zone_tds) + SUM(tg.opponent_red_zone_field_goals))::numeric / SUM(tg.opponent_red_zone_trips)) * 100 ELSE NULL END AS opponent_red_zone_score_percentage
FROM analytics.team_games AS tg
WHERE tg.team_id IS NOT NULL
GROUP BY
    tg.dynasty_id,
    tg.dynasty_key,
    tg.dynasty_name,
    tg.season_id,
    tg.season_index,
    tg.season_year,
    tg.team_id,
    tg.team_season_id,
    tg.team_index,
    tg.team_name,
    tg.conference_id,
    tg.game_conference_enum,
    tg.conference_name;


-- -------------------- TEAM RANKINGS --------------------

CREATE VIEW analytics.team_rankings AS
WITH metrics AS (
    SELECT
        tss.*,
        offense.games_played,
        offense.points_per_game,
        offense.offensive_yards_per_game,
        offense.rushing_yards_per_game,
        offense.passing_yards_per_game,
        offense.yards_per_play,
        offense.giveaways_per_game,
        defense.points_allowed_per_game,
        defense.yards_allowed_per_game,
        defense.rushing_yards_allowed_per_game,
        defense.passing_yards_allowed_per_game,
        defense.yards_per_play_allowed,
        defense.takeaways_per_game,
        COALESCE(defense.takeaways, 0) - COALESCE(offense.giveaways, 0) AS turnover_margin
    FROM analytics.team_season_snapshots AS tss
    LEFT JOIN analytics.team_offense_seasons AS offense
      ON offense.season_id = tss.season_id
     AND offense.team_id = tss.team_id
    LEFT JOIN analytics.team_defense_seasons AS defense
      ON defense.season_id = tss.season_id
     AND defense.team_id = tss.team_id
)
SELECT
    metrics.*,
    RANK() OVER (PARTITION BY season_id ORDER BY overall_rating DESC NULLS LAST) AS overall_rating_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY offensive_rating DESC NULLS LAST) AS offensive_rating_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY defensive_rating DESC NULLS LAST) AS defensive_rating_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY points_per_game DESC NULLS LAST) AS scoring_offense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY offensive_yards_per_game DESC NULLS LAST) AS total_offense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY rushing_yards_per_game DESC NULLS LAST) AS rushing_offense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY passing_yards_per_game DESC NULLS LAST) AS passing_offense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY points_allowed_per_game ASC NULLS LAST) AS scoring_defense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY yards_allowed_per_game ASC NULLS LAST) AS total_defense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY rushing_yards_allowed_per_game ASC NULLS LAST) AS rushing_defense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY passing_yards_allowed_per_game ASC NULLS LAST) AS passing_defense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY turnover_margin DESC NULLS LAST) AS turnover_margin_rank
FROM metrics;


-- -------------------- CONFERENCE ANALYTICS --------------------

CREATE VIEW analytics.conference_seasons AS
WITH conference_metrics AS (
    SELECT
        tr.dynasty_id,
        tr.dynasty_key,
        tr.dynasty_name,
        tr.season_id,
        tr.season_index,
        tr.season_year,
        tr.conference_id,
        tr.game_conference_enum,
        tr.conference_name,
        COUNT(*) AS team_count,
        COUNT(*) FILTER (WHERE tr.team_rank IS NOT NULL AND tr.team_rank > 0) AS ranked_team_count,
        SUM(COALESCE(tr.wins, 0)) AS combined_wins,
        SUM(COALESCE(tr.losses, 0)) AS combined_losses,
        CASE
            WHEN SUM(COALESCE(tr.wins, 0) + COALESCE(tr.losses, 0)) > 0
            THEN SUM(COALESCE(tr.wins, 0))::numeric /
                 SUM(COALESCE(tr.wins, 0) + COALESCE(tr.losses, 0))
            ELSE NULL
        END AS combined_win_percentage,
        SUM(COALESCE(tr.conference_wins, 0)) AS conference_wins,
        SUM(COALESCE(tr.conference_losses, 0)) AS conference_losses,
        SUM(COALESCE(tr.nonconference_wins, 0)) AS nonconference_wins,
        SUM(COALESCE(tr.nonconference_losses, 0)) AS nonconference_losses,
        AVG(tr.overall_rating::numeric) AS average_overall_rating,
        AVG(tr.offensive_rating::numeric) AS average_offensive_rating,
        AVG(tr.defensive_rating::numeric) AS average_defensive_rating,
        AVG(tr.points_per_game) AS average_points_per_game,
        AVG(tr.offensive_yards_per_game) AS average_offensive_yards_per_game,
        AVG(tr.points_allowed_per_game) AS average_points_allowed_per_game,
        AVG(tr.yards_allowed_per_game) AS average_yards_allowed_per_game,
        AVG(tr.turnover_margin::numeric) AS average_turnover_margin
    FROM analytics.team_rankings AS tr
    WHERE tr.conference_id IS NOT NULL
    GROUP BY
        tr.dynasty_id,
        tr.dynasty_key,
        tr.dynasty_name,
        tr.season_id,
        tr.season_index,
        tr.season_year,
        tr.conference_id,
        tr.game_conference_enum,
        tr.conference_name
)
SELECT
    conference_metrics.*,
    RANK() OVER (PARTITION BY season_id ORDER BY average_overall_rating DESC NULLS LAST) AS average_overall_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY combined_win_percentage DESC NULLS LAST) AS win_percentage_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY average_points_per_game DESC NULLS LAST) AS scoring_offense_rank,
    RANK() OVER (PARTITION BY season_id ORDER BY average_points_allowed_per_game ASC NULLS LAST) AS scoring_defense_rank
FROM conference_metrics;


-- -------------------- COACH ANALYTICS --------------------

CREATE VIEW analytics.coach_seasons AS
WITH stat_pivot AS (
    SELECT
        cs.import_id,
        cs.coach_season_id,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'season' AND cs.stat_name = 'wins') AS season_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'season' AND cs.stat_name = 'losses') AS season_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'wins') AS career_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'losses') AS career_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'winsAtCurrentSchool') AS wins_at_current_school,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'lossesAtCurrentSchool') AS losses_at_current_school,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'bowlWins') AS bowl_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'bowlLosses') AS bowl_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'playoffWins') AS playoff_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'playoffLosses') AS playoff_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'conferenceChampionshipWins') AS conference_championship_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'conferenceChampionshipLosses') AS conference_championship_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'nationalChampionshipWins') AS national_championship_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'nationalChampionshipLosses') AS national_championship_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'rivalryWins') AS rivalry_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'rivalryLosses') AS rivalry_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'top25Wins') AS top25_wins,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'top25Losses') AS top25_losses,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'draftPicks') AS draft_picks,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'firstRoundDraftPicks') AS first_round_draft_picks,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'top5RecruitingClasses') AS top5_recruiting_classes,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'prestigeIncreases') AS prestige_increases,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'playersMaxProgressed') AS players_max_progressed,
        MAX(cs.stat_value) FILTER (WHERE cs.stat_scope = 'career' AND cs.stat_name = 'timesFired') AS times_fired
    FROM analytics.coach_stats AS cs
    GROUP BY
        cs.import_id,
        cs.coach_season_id
)
SELECT
    css.*,
    COALESCE(sp.season_wins, 0) AS season_wins,
    COALESCE(sp.season_losses, 0) AS season_losses,
    CASE
        WHEN COALESCE(sp.season_wins, 0) + COALESCE(sp.season_losses, 0) > 0
        THEN sp.season_wins /
             (sp.season_wins + sp.season_losses)
        ELSE NULL
    END AS season_win_percentage,
    COALESCE(sp.career_wins, 0) AS career_wins,
    COALESCE(sp.career_losses, 0) AS career_losses,
    CASE
        WHEN COALESCE(sp.career_wins, 0) + COALESCE(sp.career_losses, 0) > 0
        THEN sp.career_wins /
             (sp.career_wins + sp.career_losses)
        ELSE NULL
    END AS career_win_percentage,
    COALESCE(sp.wins_at_current_school, 0) AS wins_at_current_school,
    COALESCE(sp.losses_at_current_school, 0) AS losses_at_current_school,
    COALESCE(sp.bowl_wins, 0) AS bowl_wins,
    COALESCE(sp.bowl_losses, 0) AS bowl_losses,
    COALESCE(sp.playoff_wins, 0) AS playoff_wins,
    COALESCE(sp.playoff_losses, 0) AS playoff_losses,
    COALESCE(sp.conference_championship_wins, 0) AS conference_championship_wins,
    COALESCE(sp.conference_championship_losses, 0) AS conference_championship_losses,
    COALESCE(sp.national_championship_wins, 0) AS national_championship_wins,
    COALESCE(sp.national_championship_losses, 0) AS national_championship_losses,
    COALESCE(sp.rivalry_wins, 0) AS rivalry_wins,
    COALESCE(sp.rivalry_losses, 0) AS rivalry_losses,
    COALESCE(sp.top25_wins, 0) AS top25_wins,
    COALESCE(sp.top25_losses, 0) AS top25_losses,
    COALESCE(sp.draft_picks, 0) AS draft_picks,
    COALESCE(sp.first_round_draft_picks, 0) AS first_round_draft_picks,
    COALESCE(sp.top5_recruiting_classes, 0) AS top5_recruiting_classes,
    COALESCE(sp.prestige_increases, 0) AS prestige_increases,
    COALESCE(sp.players_max_progressed, 0) AS players_max_progressed,
    COALESCE(sp.times_fired, 0) AS times_fired
FROM analytics.coach_season_snapshots AS css
LEFT JOIN stat_pivot AS sp
  ON sp.import_id = css.import_id
 AND sp.coach_season_id = css.coach_season_id;


-- -------------------- HISTORICAL / TRANSFER ANALYTICS --------------------

CREATE VIEW analytics.player_history AS
WITH history AS (
    SELECT
        ps.*,
        LAG(ps.team_id) OVER (
            PARTITION BY ps.dynasty_id, ps.player_id
            ORDER BY ps.season_index
        ) AS prior_season_team_id,
        LAG(ps.school_name) OVER (
            PARTITION BY ps.dynasty_id, ps.player_id
            ORDER BY ps.season_index
        ) AS prior_season_team_name,
        LAG(ps.overall_rating) OVER (
            PARTITION BY ps.dynasty_id, ps.player_id
            ORDER BY ps.season_index
        ) AS prior_season_overall_rating
    FROM analytics.player_seasons AS ps
)
SELECT
    history.*,
    history.overall_rating - history.prior_season_overall_rating AS overall_rating_change,
    CASE
        WHEN history.previous_team_id IS NOT NULL
         AND history.previous_team_id <> history.team_id
        THEN history.previous_team_id
        WHEN history.prior_season_team_id IS NOT NULL
         AND history.prior_season_team_id <> history.team_id
        THEN history.prior_season_team_id
        ELSE NULL
    END AS inferred_from_team_id,
    CASE
        WHEN history.previous_team_id IS NOT NULL
         AND history.previous_team_id <> history.team_id
        THEN history.previous_team_name
        WHEN history.prior_season_team_id IS NOT NULL
         AND history.prior_season_team_id <> history.team_id
        THEN history.prior_season_team_name
        ELSE NULL
    END AS inferred_from_team_name,
    CASE
        WHEN history.is_transfer OR history.is_current_season_transfer THEN TRUE
        WHEN history.prior_season_team_id IS NOT NULL
         AND history.prior_season_team_id <> history.team_id THEN TRUE
        WHEN history.previous_team_id IS NOT NULL
         AND history.previous_team_id <> history.team_id THEN TRUE
        ELSE FALSE
    END AS transfer_detected
FROM history;

CREATE VIEW analytics.player_transfers AS
SELECT
    ph.dynasty_id,
    ph.dynasty_key,
    ph.dynasty_name,
    ph.season_id,
    ph.season_index,
    ph.season_year,
    ph.player_id,
    ph.player_name,
    ph.position,
    ph.class_year,
    ph.overall_rating,
    ph.inferred_from_team_id AS from_team_id,
    ph.inferred_from_team_name AS from_team_name,
    ph.team_id AS to_team_id,
    ph.school_name AS to_team_name,
    ph.conference_id AS to_conference_id,
    ph.conference_name AS to_conference_name,
    ph.is_transfer,
    ph.is_current_season_transfer,
    ph.prior_season_team_id IS NOT NULL
        AND ph.prior_season_team_id <> ph.team_id AS changed_team_between_tracked_seasons
FROM analytics.player_history AS ph
WHERE ph.transfer_detected;

CREATE VIEW analytics.player_careers AS
SELECT
    ps.dynasty_id,
    ps.dynasty_key,
    ps.dynasty_name,
    ps.player_id,
    MAX(ps.player_name) AS player_name,
    MIN(ps.season_year) AS first_season_year,
    MAX(ps.season_year) AS last_season_year,
    COUNT(*) AS seasons_tracked,
    COUNT(DISTINCT ps.team_id) AS teams_played_for,
    MAX(ps.overall_rating) AS peak_overall_rating,
    SUM(ps.games_appeared) AS games_appeared,
    SUM(ps.pass_completions) AS pass_completions,
    SUM(ps.pass_attempts) AS pass_attempts,
    SUM(ps.passing_yards) AS passing_yards,
    SUM(ps.passing_tds) AS passing_tds,
    SUM(ps.interceptions_thrown) AS interceptions_thrown,
    SUM(ps.rushing_attempts) AS rushing_attempts,
    SUM(ps.rushing_yards) AS rushing_yards,
    SUM(ps.rushing_tds) AS rushing_tds,
    SUM(ps.receptions) AS receptions,
    SUM(ps.receiving_yards) AS receiving_yards,
    SUM(ps.receiving_tds) AS receiving_tds,
    SUM(ps.scrimmage_yards) AS scrimmage_yards,
    SUM(ps.scrimmage_tds) AS scrimmage_tds,
    SUM(ps.total_tackles) AS total_tackles,
    SUM(ps.tackles_for_loss) AS tackles_for_loss,
    SUM(ps.defensive_sacks) AS defensive_sacks,
    SUM(ps.defensive_interceptions) AS defensive_interceptions,
    SUM(ps.pass_deflections) AS pass_deflections,
    SUM(ps.forced_fumbles) AS forced_fumbles,
    SUM(ps.fumble_recoveries) AS fumble_recoveries,
    SUM(ps.defensive_tds) AS defensive_tds,
    SUM(ps.pancakes) AS pancakes,
    SUM(ps.oline_sacks_allowed) AS oline_sacks_allowed,
    SUM(ps.field_goals_made) AS field_goals_made,
    SUM(ps.field_goals_attempted) AS field_goals_attempted,
    SUM(ps.punts) AS punts,
    SUM(ps.punting_yards) AS punting_yards,
    SUM(ps.kick_return_yards) AS kick_return_yards,
    SUM(ps.kick_return_tds) AS kick_return_tds,
    SUM(ps.punt_return_yards) AS punt_return_yards,
    SUM(ps.punt_return_tds) AS punt_return_tds,
    SUM(ps.total_touchdowns) AS total_touchdowns
FROM analytics.player_seasons AS ps
GROUP BY
    ps.dynasty_id,
    ps.dynasty_key,
    ps.dynasty_name,
    ps.player_id;

CREATE VIEW analytics.team_history AS
SELECT
    tr.*,
    tr.overall_rating - LAG(tr.overall_rating) OVER (
        PARTITION BY tr.dynasty_id, tr.team_id
        ORDER BY tr.season_index
    ) AS overall_rating_change,
    tr.offensive_rating - LAG(tr.offensive_rating) OVER (
        PARTITION BY tr.dynasty_id, tr.team_id
        ORDER BY tr.season_index
    ) AS offensive_rating_change,
    tr.defensive_rating - LAG(tr.defensive_rating) OVER (
        PARTITION BY tr.dynasty_id, tr.team_id
        ORDER BY tr.season_index
    ) AS defensive_rating_change,
    tr.wins - LAG(tr.wins) OVER (
        PARTITION BY tr.dynasty_id, tr.team_id
        ORDER BY tr.season_index
    ) AS wins_change,
    LAG(tr.conference_id) OVER (
        PARTITION BY tr.dynasty_id, tr.team_id
        ORDER BY tr.season_index
    ) AS prior_conference_id,
    LAG(tr.conference_name) OVER (
        PARTITION BY tr.dynasty_id, tr.team_id
        ORDER BY tr.season_index
    ) AS prior_conference_name
FROM analytics.team_rankings AS tr;

CREATE VIEW analytics.coach_history AS
SELECT
    cs.*,
    LAG(cs.team_id) OVER (
        PARTITION BY cs.dynasty_id, cs.coach_id
        ORDER BY cs.season_index
    ) AS prior_team_id,
    LAG(cs.school_name) OVER (
        PARTITION BY cs.dynasty_id, cs.coach_id
        ORDER BY cs.season_index
    ) AS prior_team_name,
    cs.level - LAG(cs.level) OVER (
        PARTITION BY cs.dynasty_id, cs.coach_id
        ORDER BY cs.season_index
    ) AS level_change,
    cs.coach_prestige_score - LAG(cs.coach_prestige_score) OVER (
        PARTITION BY cs.dynasty_id, cs.coach_id
        ORDER BY cs.season_index
    ) AS prestige_score_change
FROM analytics.coach_seasons AS cs;

CREATE VIEW analytics.coach_careers AS
SELECT DISTINCT ON (ch.dynasty_id, ch.coach_id)
    ch.dynasty_id,
    ch.dynasty_key,
    ch.dynasty_name,
    ch.coach_id,
    ch.coach_name,
    ch.identity_strategy,
    ch.presentation_id,
    ch.source_coach_row,
    ch.season_year AS latest_season_year,
    ch.role AS latest_role,
    ch.team_id AS latest_team_id,
    ch.school_name AS latest_team_name,
    ch.level AS latest_level,
    ch.coach_prestige AS latest_coach_prestige,
    ch.coach_prestige_score AS latest_coach_prestige_score,
    ch.career_wins,
    ch.career_losses,
    ch.career_win_percentage,
    ch.wins_at_current_school,
    ch.losses_at_current_school,
    ch.bowl_wins,
    ch.bowl_losses,
    ch.playoff_wins,
    ch.playoff_losses,
    ch.conference_championship_wins,
    ch.conference_championship_losses,
    ch.national_championship_wins,
    ch.national_championship_losses,
    ch.rivalry_wins,
    ch.rivalry_losses,
    ch.top25_wins,
    ch.top25_losses,
    ch.draft_picks,
    ch.first_round_draft_picks,
    ch.top5_recruiting_classes,
    ch.prestige_increases,
    ch.players_max_progressed,
    ch.times_fired
FROM analytics.coach_history AS ch
ORDER BY
    ch.dynasty_id,
    ch.coach_id,
    ch.season_index DESC;


-- -------------------- SCORING EVENT ANALYTICS --------------------

CREATE VIEW analytics.scoring_events AS
SELECT
    bsi.import_id,
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    g.game_id,
    g.week_type,
    g.week_number,
    g.game_number,
    gis.home_team_id,
    gis.home_team_name,
    gis.away_team_id,
    gis.away_team_name,
    sse.event_ordinal,
    sse.quarter,
    sse.quarter_display,
    sse.time_remaining_seconds,
    sse.scoring_side,
    sse.scoring_team_id,
    sse.scoring_team_index,
    sse.scoring_team_name,
    sse.scoring_type,
    sse.raw_scoring_points,
    sse.conversion_type,
    sse.conversion_points,
    sse.points_scored,
    sse.home_previous_score,
    sse.away_previous_score,
    sse.home_current_score,
    sse.away_current_score,
    sse.home_score_after_play,
    sse.away_score_after_play
FROM analytics.best_scoring_imports AS bsi
JOIN seasons AS s
  ON s.season_id = bsi.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN scoring_summary_events AS sse
  ON sse.import_id = bsi.import_id
JOIN games AS g
  ON g.game_id = sse.game_id
 AND g.season_id = s.season_id
JOIN game_import_snapshots AS gis
  ON gis.import_id = sse.import_id
 AND gis.game_id = sse.game_id;


-- -------------------- POWER BI DIMENSIONS --------------------

CREATE VIEW bi.dim_dynasty AS
SELECT
    dynasty_id,
    dynasty_key,
    dynasty_name,
    created_at
FROM dynasties;

CREATE VIEW bi.dim_season AS
SELECT
    s.season_id,
    s.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_index,
    s.season_year
FROM seasons AS s
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id;

CREATE VIEW bi.dim_team AS
SELECT
    t.team_id,
    t.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    t.game_team_index,
    t.school_name,
    t.nickname,
    t.abbreviation,
    t.asset_name,
    t.is_team_builder
FROM teams AS t
JOIN dynasties AS d
  ON d.dynasty_id = t.dynasty_id;

CREATE VIEW bi.dim_conference AS
SELECT
    conference_id,
    game_conference_enum,
    conference_name,
    asset_name,
    style_name
FROM conferences;

CREATE VIEW bi.dim_player AS
SELECT
    p.player_id,
    p.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    p.identity_key,
    p.identity_strategy,
    p.presentation_id,
    p.first_name,
    p.last_name,
    CONCAT_WS(' ', p.first_name, p.last_name) AS player_name,
    p.hometown,
    p.home_state,
    p.birth_date_raw,
    p.asset_name
FROM players AS p
JOIN dynasties AS d
  ON d.dynasty_id = p.dynasty_id;

CREATE VIEW bi.dim_coach AS
SELECT
    c.coach_id,
    c.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    c.identity_key,
    c.identity_strategy,
    c.presentation_id,
    c.source_coach_row,
    c.first_name,
    c.last_name,
    CONCAT_WS(' ', c.first_name, c.last_name) AS coach_name,
    c.home_town,
    c.home_state,
    c.alma_mater,
    c.asset_name
FROM coaches AS c
JOIN dynasties AS d
  ON d.dynasty_id = c.dynasty_id;


-- -------------------- POWER BI FACTS --------------------
-- These are intentionally flat views with stable keys. Power BI can relate
-- them to the dimension views without reading JSONB or choosing save imports.

CREATE VIEW bi.fact_game AS
SELECT * FROM analytics.games;

CREATE VIEW bi.fact_team_game AS
SELECT * FROM analytics.team_games;

CREATE VIEW bi.fact_player_game AS
SELECT * FROM analytics.player_games;

CREATE VIEW bi.fact_team_season AS
SELECT * FROM analytics.team_rankings;

CREATE VIEW bi.fact_player_season AS
SELECT * FROM analytics.player_seasons;

CREATE VIEW bi.fact_coach_season AS
SELECT * FROM analytics.coach_seasons;

CREATE VIEW bi.fact_player_attribute AS
SELECT * FROM analytics.player_attributes;

CREATE VIEW bi.fact_player_ability AS
SELECT * FROM analytics.player_abilities;

CREATE VIEW bi.fact_team_grade AS
SELECT * FROM analytics.team_grades;

CREATE VIEW bi.fact_coach_stat AS
SELECT * FROM analytics.coach_stats;

CREATE VIEW bi.fact_scoring_event AS
SELECT * FROM analytics.scoring_events;

CREATE VIEW bi.fact_player_transfer AS
SELECT * FROM analytics.player_transfers;

CREATE VIEW bi.fact_player_career AS
SELECT * FROM analytics.player_careers;

CREATE VIEW bi.fact_coach_career AS
SELECT * FROM analytics.coach_careers;

CREATE VIEW bi.fact_conference_season AS
SELECT * FROM analytics.conference_seasons;

CREATE VIEW bi.fact_team_progression AS
SELECT * FROM analytics.team_snapshot_history;

CREATE VIEW bi.fact_player_progression AS
SELECT * FROM analytics.player_snapshot_history;

CREATE VIEW bi.fact_coach_progression AS
SELECT * FROM analytics.coach_snapshot_history;

COMMIT;
