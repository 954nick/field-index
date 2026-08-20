-- -------------------- FIELD INDEX CORE FOOTBALL SCHEMA --------------------

BEGIN;

-- -------------------- DYNASTY IMPORT IDENTITY --------------------

ALTER TABLE dynasties
ADD COLUMN dynasty_key TEXT;

ALTER TABLE dynasties
ADD CONSTRAINT dynasties_dynasty_key_unique UNIQUE (dynasty_key);


-- -------------------- TEAM REFERENCE DETAILS --------------------

ALTER TABLE teams
ADD COLUMN dynasty_id INTEGER
    REFERENCES dynasties(dynasty_id),
ADD COLUMN nickname TEXT,
ADD COLUMN abbreviation TEXT,
ADD COLUMN asset_name TEXT,
ADD COLUMN is_team_builder BOOLEAN NOT NULL DEFAULT FALSE;

-- 001 was created while the local learning database had one dynasty.
-- If manual team rows already exist, only backfill them automatically when
-- exactly one dynasty exists. Never guess which dynasty owns existing rows.
DO $field_index$
DECLARE
    existing_team_count INTEGER;
    existing_dynasty_count INTEGER;
    only_dynasty_id INTEGER;
BEGIN
    SELECT COUNT(*) INTO existing_team_count
    FROM teams
    WHERE dynasty_id IS NULL;

    IF existing_team_count > 0 THEN
        SELECT COUNT(*), MIN(dynasty_id)
        INTO existing_dynasty_count, only_dynasty_id
        FROM dynasties;

        IF existing_dynasty_count = 1 THEN
            UPDATE teams
            SET dynasty_id = only_dynasty_id
            WHERE dynasty_id IS NULL;
        ELSE
            RAISE EXCEPTION
                'Cannot assign existing team rows to a dynasty automatically. Found % dynasties.',
                existing_dynasty_count;
        END IF;
    END IF;
END
$field_index$;

ALTER TABLE teams
ALTER COLUMN dynasty_id SET NOT NULL;

ALTER TABLE teams
DROP CONSTRAINT teams_game_team_index_key;

ALTER TABLE teams
ADD CONSTRAINT teams_dynasty_game_team_index_unique
    UNIQUE (dynasty_id, game_team_index);

CREATE INDEX teams_dynasty_id_idx
ON teams(dynasty_id);


-- -------------------- CONFERENCES --------------------

CREATE TABLE conferences (
    conference_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_conference_enum TEXT NOT NULL UNIQUE,
    conference_name TEXT NOT NULL,
    asset_name TEXT,
    style_name TEXT
);


-- -------------------- TEAM SEASONS --------------------

CREATE TABLE team_seasons (
    team_season_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    team_id INTEGER NOT NULL
        REFERENCES teams(team_id),

    conference_id INTEGER
        REFERENCES conferences(conference_id),

    UNIQUE (season_id, team_id)
);

CREATE INDEX team_seasons_team_id_idx
ON team_seasons(team_id);

CREATE INDEX team_seasons_conference_id_idx
ON team_seasons(conference_id);


-- -------------------- SAVE IMPORT METADATA --------------------

ALTER TABLE save_imports
ADD COLUMN roster_season_id INTEGER
    REFERENCES seasons(season_id),
ADD COLUMN week_number INTEGER,
ADD COLUMN week_type TEXT,
ADD COLUMN offseason_stage INTEGER,
ADD COLUMN file_size_bytes BIGINT,
ADD COLUMN source_modified_at TIMESTAMP,
ADD COLUMN backend_schema_major INTEGER,
ADD COLUMN backend_schema_minor INTEGER,
ADD COLUMN game_year INTEGER,
ADD COLUMN parser_version TEXT,
ADD COLUMN last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- -------------------- TEAM IMPORT SNAPSHOTS --------------------

CREATE TABLE team_import_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    team_season_id INTEGER NOT NULL
        REFERENCES team_seasons(team_season_id) ON DELETE CASCADE,

    prestige INTEGER,
    overall_rating INTEGER,
    offensive_rating INTEGER,
    defensive_rating INTEGER,
    team_rank INTEGER,
    conference_standing INTEGER,
    wins INTEGER,
    losses INTEGER,
    conference_wins INTEGER,
    conference_losses INTEGER,
    nonconference_wins INTEGER,
    nonconference_losses INTEGER,
    playoff_status TEXT,
    playoff_round_reached TEXT,

    program_point_grades JSONB NOT NULL DEFAULT '{}'::jsonb,
    my_school_grades JSONB NOT NULL DEFAULT '{}'::jsonb,
    playing_style_grades JSONB NOT NULL DEFAULT '{}'::jsonb,

    PRIMARY KEY (import_id, team_season_id)
);

CREATE INDEX team_import_snapshots_team_season_id_idx
ON team_import_snapshots(team_season_id);

COMMIT;
