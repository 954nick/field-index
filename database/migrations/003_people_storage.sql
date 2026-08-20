-- -------------------- FIELD INDEX PLAYER AND COACH STORAGE --------------------

BEGIN;

-- -------------------- PLAYERS --------------------

CREATE TABLE players (
    player_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    dynasty_id INTEGER NOT NULL
        REFERENCES dynasties(dynasty_id),

    identity_key TEXT NOT NULL,
    identity_strategy TEXT NOT NULL
        CHECK (identity_strategy IN ('presentation_id', 'bio_fingerprint')),

    presentation_id INTEGER,
    asset_name TEXT,
    birth_date_raw INTEGER,

    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    hometown TEXT,
    home_state TEXT,

    first_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    last_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (dynasty_id, identity_key)
);

CREATE INDEX players_dynasty_presentation_id_idx
ON players(dynasty_id, presentation_id)
WHERE presentation_id IS NOT NULL AND presentation_id > 0;

CREATE INDEX players_dynasty_id_idx
ON players(dynasty_id);


-- -------------------- PLAYER SEASONS --------------------

CREATE TABLE player_seasons (
    player_season_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    player_id INTEGER NOT NULL
        REFERENCES players(player_id),

    team_season_id INTEGER NOT NULL
        REFERENCES team_seasons(team_season_id),

    previous_team_id INTEGER
        REFERENCES teams(team_id),

    first_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    last_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    UNIQUE (season_id, player_id)
);

CREATE INDEX player_seasons_team_season_id_idx
ON player_seasons(team_season_id);

CREATE INDEX player_seasons_player_id_idx
ON player_seasons(player_id);


-- -------------------- PLAYER IMPORT SNAPSHOTS --------------------

CREATE TABLE player_import_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    player_season_id INTEGER NOT NULL
        REFERENCES player_seasons(player_season_id) ON DELETE CASCADE,

    team_season_id INTEGER NOT NULL
        REFERENCES team_seasons(team_season_id),

    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    hometown TEXT,
    home_state TEXT,

    jersey_number INTEGER,
    position TEXT,
    class_year TEXT,
    redshirt_status TEXT,
    overall_rating INTEGER,
    height_inches INTEGER,
    weight_pounds INTEGER,

    consecutive_years_with_team INTEGER,
    is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
    is_current_season_transfer BOOLEAN NOT NULL DEFAULT FALSE,

    skill_points INTEGER,
    experience_points INTEGER,
    development_trait TEXT,

    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    abilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    appearance JSONB NOT NULL DEFAULT '{}'::jsonb,

    PRIMARY KEY (import_id, player_season_id)
);

CREATE INDEX player_import_snapshots_player_season_id_idx
ON player_import_snapshots(player_season_id);

CREATE INDEX player_import_snapshots_team_season_id_idx
ON player_import_snapshots(team_season_id);


-- -------------------- COACHES --------------------

CREATE TABLE coaches (
    coach_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    dynasty_id INTEGER NOT NULL
        REFERENCES dynasties(dynasty_id),

    identity_key TEXT NOT NULL,
    identity_strategy TEXT NOT NULL
        CHECK (identity_strategy IN ('presentation_id', 'coach_row', 'bio_fingerprint')),

    presentation_id INTEGER,
    source_coach_row INTEGER,
    asset_name TEXT,

    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    home_town TEXT,
    home_state TEXT,
    alma_mater INTEGER,

    first_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    last_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (dynasty_id, identity_key)
);

CREATE INDEX coaches_dynasty_id_idx
ON coaches(dynasty_id);

CREATE INDEX coaches_dynasty_presentation_id_idx
ON coaches(dynasty_id, presentation_id)
WHERE presentation_id IS NOT NULL AND presentation_id > 0;

CREATE INDEX coaches_dynasty_source_coach_row_idx
ON coaches(dynasty_id, source_coach_row)
WHERE source_coach_row IS NOT NULL;


-- -------------------- COACH SEASONS --------------------

CREATE TABLE coach_seasons (
    coach_season_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    coach_id INTEGER NOT NULL
        REFERENCES coaches(coach_id),

    team_season_id INTEGER
        REFERENCES team_seasons(team_season_id),

    role TEXT,

    first_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    last_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    UNIQUE (season_id, coach_id)
);

CREATE INDEX coach_seasons_team_season_id_idx
ON coach_seasons(team_season_id);

CREATE INDEX coach_seasons_coach_id_idx
ON coach_seasons(coach_id);


-- -------------------- COACH IMPORT SNAPSHOTS --------------------

CREATE TABLE coach_import_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    coach_season_id INTEGER NOT NULL
        REFERENCES coach_seasons(coach_season_id) ON DELETE CASCADE,

    team_season_id INTEGER
        REFERENCES team_seasons(team_season_id),

    role TEXT,
    position TEXT,

    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,

    age INTEGER,
    years_coaching INTEGER,
    seasons_with_team INTEGER,
    level INTEGER,
    coach_prestige TEXT,
    coach_prestige_score INTEGER,
    coach_points INTEGER,
    experience_points INTEGER,
    specialty TEXT,
    dominant_archetype TEXT,
    alma_mater INTEGER,

    contract_status TEXT,
    contract_years_remaining INTEGER,
    job_security_status TEXT,
    job_security_percentage INTEGER,
    is_user_controlled BOOLEAN,

    appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
    season_stats JSONB,
    career_stats JSONB,

    PRIMARY KEY (import_id, coach_season_id)
);

CREATE INDEX coach_import_snapshots_coach_season_id_idx
ON coach_import_snapshots(coach_season_id);

CREATE INDEX coach_import_snapshots_team_season_id_idx
ON coach_import_snapshots(team_season_id);

COMMIT;
