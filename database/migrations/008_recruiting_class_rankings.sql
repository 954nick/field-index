BEGIN;

-- -------------------- TEAM RECRUITING CLASS SNAPSHOT FIELDS --------------------

ALTER TABLE team_import_snapshots
ADD COLUMN recruiting_class_rank INTEGER,
ADD COLUMN recruiting_class_conference_rank INTEGER,
ADD COLUMN recruit_program_points_spent INTEGER,
ADD COLUMN last_week_committed_recruits INTEGER;

CREATE INDEX team_import_snapshots_recruiting_rank_idx
ON team_import_snapshots(recruiting_class_rank)
WHERE recruiting_class_rank BETWEEN 1 AND 254;

-- -------------------- RECRUITING CLASS RANKING HISTORY --------------------

CREATE VIEW analytics.recruiting_class_ranking_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id AS save_season_id,
    s.season_index AS save_season_index,
    s.season_year AS save_season_year,
    s.season_index + 1 AS class_season_index,
    s.season_year + 1 AS class_season_year,
    si.import_id,
    si.imported_at,
    si.week_type,
    si.week_number,
    si.offseason_stage,
    t.team_id,
    t.game_team_index AS team_index,
    t.school_name AS team_name,
    c.conference_id,
    c.game_conference_enum,
    c.conference_name,
    tis.recruiting_class_rank AS rank,
    tis.recruiting_class_conference_rank AS conference_rank,
    tis.recruit_program_points_spent,
    tis.last_week_committed_recruits
FROM team_import_snapshots AS tis
JOIN save_imports AS si
  ON si.import_id = tis.import_id
JOIN seasons AS s
  ON s.season_id = si.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN team_seasons AS ts
  ON ts.team_season_id = tis.team_season_id
JOIN teams AS t
  ON t.team_id = ts.team_id
LEFT JOIN conferences AS c
  ON c.conference_id = ts.conference_id
WHERE tis.recruiting_class_rank BETWEEN 1 AND 254;

CREATE VIEW analytics.latest_recruiting_class_rankings AS
SELECT DISTINCT ON (dynasty_id, class_season_index, team_id)
    *
FROM analytics.recruiting_class_ranking_history
ORDER BY
    dynasty_id,
    class_season_index,
    team_id,
    imported_at DESC,
    import_id DESC;

-- -------------------- BI-READY RECRUITING RANKING VIEWS --------------------

CREATE VIEW bi.fact_recruiting_class_ranking AS
SELECT * FROM analytics.recruiting_class_ranking_history;

CREATE VIEW bi.current_recruiting_class_ranking AS
SELECT * FROM analytics.latest_recruiting_class_rankings;

COMMIT;
