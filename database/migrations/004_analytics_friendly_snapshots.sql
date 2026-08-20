-- -------------------- FIELD INDEX ANALYTICS-FRIENDLY SNAPSHOTS --------------------

BEGIN;

-- -------------------- GRADE SCALE --------------------
-- Ordinal helper for analysis only. Raw CFB27 grade text is preserved separately.

CREATE TABLE grade_scale (
    grade_value TEXT PRIMARY KEY,
    ordinal_rank INTEGER NOT NULL UNIQUE
);

INSERT INTO grade_scale (grade_value, ordinal_rank)
VALUES
    ('F', 0),
    ('Dminus', 1),
    ('D', 2),
    ('Dplus', 3),
    ('Cminus', 4),
    ('C', 5),
    ('Cplus', 6),
    ('Bminus', 7),
    ('B', 8),
    ('Bplus', 9),
    ('Aminus', 10),
    ('A', 11),
    ('Aplus', 12);


-- -------------------- TEAM GRADES --------------------

CREATE TABLE team_grade_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    team_season_id INTEGER NOT NULL
        REFERENCES team_seasons(team_season_id) ON DELETE CASCADE,

    grade_group TEXT NOT NULL
        CHECK (grade_group IN ('program', 'my_school', 'playing_style')),

    grade_name TEXT NOT NULL,
    grade_value TEXT NOT NULL,
    grade_rank INTEGER,

    PRIMARY KEY (import_id, team_season_id, grade_group, grade_name)
);

CREATE INDEX team_grade_snapshots_team_season_id_idx
ON team_grade_snapshots(team_season_id);

CREATE INDEX team_grade_snapshots_grade_name_idx
ON team_grade_snapshots(grade_name);


-- -------------------- PLAYER ATTRIBUTES --------------------

CREATE TABLE player_attribute_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    player_season_id INTEGER NOT NULL
        REFERENCES player_seasons(player_season_id) ON DELETE CASCADE,

    attribute_name TEXT NOT NULL,
    attribute_value_text TEXT NOT NULL,
    attribute_value_numeric NUMERIC,

    PRIMARY KEY (import_id, player_season_id, attribute_name)
);

CREATE INDEX player_attribute_snapshots_player_season_id_idx
ON player_attribute_snapshots(player_season_id);

CREATE INDEX player_attribute_snapshots_attribute_name_idx
ON player_attribute_snapshots(attribute_name);


-- -------------------- PLAYER ABILITIES --------------------

CREATE TABLE player_ability_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    player_season_id INTEGER NOT NULL
        REFERENCES player_seasons(player_season_id) ON DELETE CASCADE,

    ability_group TEXT NOT NULL
        CHECK (ability_group IN ('physical', 'mental')),

    slot INTEGER NOT NULL CHECK (slot > 0),
    ability_name TEXT NOT NULL,
    ability_rank TEXT,

    PRIMARY KEY (import_id, player_season_id, ability_group, slot)
);

CREATE INDEX player_ability_snapshots_player_season_id_idx
ON player_ability_snapshots(player_season_id);

CREATE INDEX player_ability_snapshots_ability_name_idx
ON player_ability_snapshots(ability_name);


-- -------------------- COACH STATS --------------------

CREATE TABLE coach_stat_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    coach_season_id INTEGER NOT NULL
        REFERENCES coach_seasons(coach_season_id) ON DELETE CASCADE,

    stat_scope TEXT NOT NULL
        CHECK (stat_scope IN ('season', 'career')),

    stat_name TEXT NOT NULL,
    stat_value NUMERIC NOT NULL,

    PRIMARY KEY (import_id, coach_season_id, stat_scope, stat_name)
);

CREATE INDEX coach_stat_snapshots_coach_season_id_idx
ON coach_stat_snapshots(coach_season_id);

CREATE INDEX coach_stat_snapshots_stat_name_idx
ON coach_stat_snapshots(stat_name);

COMMIT;
