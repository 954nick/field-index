-- -------------------- FIELD INDEX INITIAL DATABASE SCHEMA --------------------

-- -------------------- DYNASTIES --------------------

CREATE TABLE dynasties (
    dynasty_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dynasty_name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- -------------------- TEAMS --------------------

CREATE TABLE teams (
    team_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_team_index INTEGER NOT NULL UNIQUE,
    school_name TEXT NOT NULL
);


-- -------------------- SEASONS --------------------

CREATE TABLE seasons (
    season_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    dynasty_id INTEGER NOT NULL
        REFERENCES dynasties(dynasty_id),

    season_index INTEGER NOT NULL
        CHECK (season_index >= 0),

    season_year INTEGER NOT NULL
        CHECK (season_year >= 2026),

    UNIQUE (dynasty_id, season_index),
    UNIQUE (dynasty_id, season_year)
);


-- -------------------- SAVE IMPORTS --------------------

CREATE TABLE save_imports (
    import_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    source_file_name TEXT NOT NULL,
    file_hash CHAR(64) NOT NULL,

    imported_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (season_id, file_hash)
);