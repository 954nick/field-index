-- -------------------- FIELD INDEX COACH TALENT HISTORY --------------------

BEGIN;

-- -------------------- COACH TALENT TREE SNAPSHOTS --------------------

CREATE TABLE coach_talent_tree_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    coach_season_id INTEGER NOT NULL
        REFERENCES coach_seasons(coach_season_id) ON DELETE CASCADE,

    tree_index INTEGER NOT NULL CHECK (tree_index BETWEEN 0 AND 12),
    tree_internal_name TEXT NOT NULL,
    tree_display_name TEXT NOT NULL,
    tree_description TEXT,
    available BOOLEAN NOT NULL,
    tree_state TEXT NOT NULL
        CHECK (tree_state IN ('Unlocked', 'Purchasable', 'Locked', 'Unavailable')),
    root_status TEXT,
    coach_points_spent INTEGER,
    owned_count INTEGER NOT NULL DEFAULT 0,
    purchasable_count INTEGER NOT NULL DEFAULT 0,
    not_owned_count INTEGER NOT NULL DEFAULT 0,
    locked_count INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (import_id, coach_season_id, tree_index)
);

CREATE INDEX coach_talent_tree_snapshots_coach_season_idx
ON coach_talent_tree_snapshots(coach_season_id, tree_index);

CREATE INDEX coach_talent_tree_snapshots_state_idx
ON coach_talent_tree_snapshots(tree_internal_name, tree_state);


-- -------------------- COACH TALENT NODE SNAPSHOTS --------------------

CREATE TABLE coach_talent_node_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    coach_season_id INTEGER NOT NULL
        REFERENCES coach_seasons(coach_season_id) ON DELETE CASCADE,

    tree_index INTEGER NOT NULL CHECK (tree_index BETWEEN 0 AND 12),
    tree_internal_name TEXT NOT NULL,
    tree_display_name TEXT NOT NULL,
    talent_index INTEGER NOT NULL CHECK (talent_index BETWEEN 0 AND 32),
    canonical_key TEXT NOT NULL,
    talent_status TEXT NOT NULL
        CHECK (talent_status IN ('NotOwned', 'Purchasable', 'Owned', 'Locked')),

    -- Live CFB27 static talent metadata. These are descriptive only; save writes
    -- continue to use tree + TalentStatus index as the authoritative identity.
    ability_name TEXT,
    ability_description TEXT,
    staff_point_cost INTEGER,
    is_archetype_node BOOLEAN,
    progress_label TEXT,
    branch_title TEXT,
    branch_subtitle TEXT,
    position_group TEXT,
    effect TEXT,
    duration TEXT,
    prerequisite_json JSONB,

    PRIMARY KEY (import_id, coach_season_id, tree_index, talent_index)
);

CREATE INDEX coach_talent_node_snapshots_coach_season_idx
ON coach_talent_node_snapshots(coach_season_id, tree_index, talent_index);

CREATE INDEX coach_talent_node_snapshots_status_idx
ON coach_talent_node_snapshots(tree_internal_name, talent_status);

CREATE INDEX coach_talent_node_snapshots_name_idx
ON coach_talent_node_snapshots(tree_internal_name, ability_name)
WHERE ability_name IS NOT NULL;


-- -------------------- ANALYTICS VIEWS --------------------

CREATE VIEW analytics.coach_talent_tree_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    si.import_id,
    si.imported_at,
    si.week_type,
    si.week_number,
    si.offseason_stage,
    c.coach_id,
    c.identity_key AS coach_identity_key,
    c.source_coach_row,
    CONCAT_WS(' ', cis.first_name, cis.last_name) AS coach_name,
    cis.role,
    cis.position,
    cis.team_season_id,
    t.team_id,
    t.game_team_index AS team_index,
    t.school_name AS team_name,
    ctts.tree_index,
    ctts.tree_internal_name,
    ctts.tree_display_name,
    ctts.tree_description,
    ctts.available,
    ctts.tree_state,
    ctts.root_status,
    ctts.coach_points_spent,
    ctts.owned_count,
    ctts.purchasable_count,
    ctts.not_owned_count,
    ctts.locked_count
FROM coach_talent_tree_snapshots AS ctts
JOIN save_imports AS si
  ON si.import_id = ctts.import_id
JOIN coach_seasons AS cs
  ON cs.coach_season_id = ctts.coach_season_id
JOIN seasons AS s
  ON s.season_id = cs.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN coaches AS c
  ON c.coach_id = cs.coach_id
JOIN coach_import_snapshots AS cis
  ON cis.import_id = ctts.import_id
 AND cis.coach_season_id = ctts.coach_season_id
LEFT JOIN team_seasons AS ts
  ON ts.team_season_id = cis.team_season_id
LEFT JOIN teams AS t
  ON t.team_id = ts.team_id;

CREATE VIEW analytics.coach_talent_node_history AS
SELECT
    d.dynasty_id,
    d.dynasty_key,
    d.dynasty_name,
    s.season_id,
    s.season_index,
    s.season_year,
    si.import_id,
    si.imported_at,
    si.week_type,
    si.week_number,
    si.offseason_stage,
    c.coach_id,
    c.identity_key AS coach_identity_key,
    c.source_coach_row,
    CONCAT_WS(' ', cis.first_name, cis.last_name) AS coach_name,
    cis.role,
    cis.position,
    t.team_id,
    t.game_team_index AS team_index,
    t.school_name AS team_name,
    ctns.tree_index,
    ctns.tree_internal_name,
    ctns.tree_display_name,
    ctns.talent_index,
    ctns.canonical_key,
    ctns.talent_status,
    ctns.ability_name,
    ctns.ability_description,
    ctns.staff_point_cost,
    ctns.is_archetype_node,
    ctns.progress_label,
    ctns.branch_title,
    ctns.branch_subtitle,
    ctns.position_group,
    ctns.effect,
    ctns.duration,
    ctns.prerequisite_json
FROM coach_talent_node_snapshots AS ctns
JOIN save_imports AS si
  ON si.import_id = ctns.import_id
JOIN coach_seasons AS cs
  ON cs.coach_season_id = ctns.coach_season_id
JOIN seasons AS s
  ON s.season_id = cs.season_id
JOIN dynasties AS d
  ON d.dynasty_id = s.dynasty_id
JOIN coaches AS c
  ON c.coach_id = cs.coach_id
JOIN coach_import_snapshots AS cis
  ON cis.import_id = ctns.import_id
 AND cis.coach_season_id = ctns.coach_season_id
LEFT JOIN team_seasons AS ts
  ON ts.team_season_id = cis.team_season_id
LEFT JOIN teams AS t
  ON t.team_id = ts.team_id;

CREATE VIEW analytics.latest_coach_talent_nodes AS
SELECT DISTINCT ON (dynasty_id, coach_id, tree_index, talent_index)
    *
FROM analytics.coach_talent_node_history
ORDER BY dynasty_id, coach_id, tree_index, talent_index, imported_at DESC, import_id DESC;


-- -------------------- POWER BI BACKEND VIEWS --------------------
-- Backend views only. No Power BI report/dashboard is created here.

CREATE VIEW bi.fact_coach_talent_tree AS
SELECT * FROM analytics.coach_talent_tree_history;

CREATE VIEW bi.fact_coach_talent_node AS
SELECT * FROM analytics.coach_talent_node_history;

CREATE VIEW bi.current_coach_talent_node AS
SELECT * FROM analytics.latest_coach_talent_nodes;

COMMIT;
