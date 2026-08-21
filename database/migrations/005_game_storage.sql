-- -------------------- FIELD INDEX GAME STORAGE --------------------

BEGIN;

-- -------------------- GAMES --------------------
-- A game row represents one logical schedule slot inside one dynasty season.
-- Participants and results are intentionally snapshot data because unplayed
-- CFP/bowl slots can change between save imports.

CREATE TABLE games (
    game_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    season_id INTEGER NOT NULL
        REFERENCES seasons(season_id),

    week_type TEXT NOT NULL,
    week_number INTEGER NOT NULL
        CHECK (week_number >= 0),
    game_number INTEGER NOT NULL
        CHECK (game_number >= 0),

    first_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),
    last_seen_import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id),

    UNIQUE (season_id, week_type, week_number, game_number)
);

CREATE INDEX games_season_week_idx
ON games(season_id, week_type, week_number);


-- -------------------- GAME IMPORT SNAPSHOTS --------------------

CREATE TABLE game_import_snapshots (
    import_id INTEGER NOT NULL
        REFERENCES save_imports(import_id) ON DELETE CASCADE,

    game_id BIGINT NOT NULL
        REFERENCES games(game_id) ON DELETE CASCADE,

    source_season_game_row INTEGER,
    game_status TEXT NOT NULL,

    home_team_id INTEGER
        REFERENCES teams(team_id),
    away_team_id INTEGER
        REFERENCES teams(team_id),

    home_team_index INTEGER NOT NULL,
    home_team_name TEXT NOT NULL,
    away_team_index INTEGER NOT NULL,
    away_team_name TEXT NOT NULL,

    home_score INTEGER
        CHECK (home_score IS NULL OR home_score >= 0),
    away_score INTEGER
        CHECK (away_score IS NULL OR away_score >= 0),

    day_of_week TEXT,
    game_date_month INTEGER
        CHECK (game_date_month IS NULL OR game_date_month BETWEEN 1 AND 12),
    game_date_day INTEGER
        CHECK (game_date_day IS NULL OR game_date_day BETWEEN 1 AND 31),
    time_of_day_minutes INTEGER
        CHECK (time_of_day_minutes IS NULL OR time_of_day_minutes >= 0),

    broadcast_network TEXT,
    stadium_reference TEXT,
    is_game_of_the_week BOOLEAN NOT NULL DEFAULT FALSE,
    new_years_flag BOOLEAN NOT NULL DEFAULT FALSE,
    player_stats_available BOOLEAN NOT NULL DEFAULT FALSE,

    bowl_name TEXT,
    bowl_asset_name TEXT,
    bowl_presentation_id INTEGER,
    bowl_logo_id INTEGER,
    is_playoff_bowl BOOLEAN,
    playoff_bracket_slot INTEGER,
    should_play_new_years BOOLEAN,

    PRIMARY KEY (import_id, game_id)
);

CREATE INDEX game_import_snapshots_game_id_idx
ON game_import_snapshots(game_id);

CREATE INDEX game_import_snapshots_home_team_id_idx
ON game_import_snapshots(home_team_id);

CREATE INDEX game_import_snapshots_away_team_id_idx
ON game_import_snapshots(away_team_id);

CREATE INDEX game_import_snapshots_status_idx
ON game_import_snapshots(game_status);


-- -------------------- GAME LINE SCORES --------------------
-- SeasonGame quarter/OT fields are authoritative. OT is stored as the game's
-- aggregate overtime score because that is what CFB27 exposes here.

CREATE TABLE game_line_scores (
    import_id INTEGER NOT NULL,
    game_id BIGINT NOT NULL,

    home_q1 INTEGER NOT NULL DEFAULT 0 CHECK (home_q1 >= 0),
    home_q2 INTEGER NOT NULL DEFAULT 0 CHECK (home_q2 >= 0),
    home_q3 INTEGER NOT NULL DEFAULT 0 CHECK (home_q3 >= 0),
    home_q4 INTEGER NOT NULL DEFAULT 0 CHECK (home_q4 >= 0),
    home_overtime INTEGER NOT NULL DEFAULT 0 CHECK (home_overtime >= 0),
    home_total INTEGER NOT NULL CHECK (home_total >= 0),

    away_q1 INTEGER NOT NULL DEFAULT 0 CHECK (away_q1 >= 0),
    away_q2 INTEGER NOT NULL DEFAULT 0 CHECK (away_q2 >= 0),
    away_q3 INTEGER NOT NULL DEFAULT 0 CHECK (away_q3 >= 0),
    away_q4 INTEGER NOT NULL DEFAULT 0 CHECK (away_q4 >= 0),
    away_overtime INTEGER NOT NULL DEFAULT 0 CHECK (away_overtime >= 0),
    away_total INTEGER NOT NULL CHECK (away_total >= 0),

    PRIMARY KEY (import_id, game_id),

    FOREIGN KEY (import_id, game_id)
        REFERENCES game_import_snapshots(import_id, game_id)
        ON DELETE CASCADE
);


-- -------------------- TEAM GAME STATS --------------------
-- FCS opponents are valid game context but are not part of the 138-program
-- teams table. team_id may therefore be NULL while team_index/name remain.

CREATE TABLE team_game_stats (
    import_id INTEGER NOT NULL,
    game_id BIGINT NOT NULL,

    side TEXT NOT NULL
        CHECK (side IN ('home', 'away')),

    team_id INTEGER
        REFERENCES teams(team_id),
    team_index INTEGER NOT NULL,
    team_name TEXT NOT NULL,

    first_downs INTEGER,
    total_yards INTEGER,
    offensive_yards INTEGER,
    rushing_yards INTEGER,
    rushing_attempts INTEGER,
    passing_yards INTEGER,
    completions INTEGER,
    passing_attempts INTEGER,
    passing_tds INTEGER,
    rushing_tds INTEGER,
    interceptions_thrown INTEGER,
    fumbles_lost INTEGER,
    giveaways INTEGER,
    takeaways INTEGER,
    sacks NUMERIC,
    sacks_allowed NUMERIC,
    third_down_conversions INTEGER,
    third_down_attempts INTEGER,
    third_down_percentage NUMERIC,
    fourth_down_conversions INTEGER,
    fourth_down_attempts INTEGER,
    fourth_down_percentage NUMERIC,
    red_zone_trips INTEGER,
    red_zone_tds INTEGER,
    red_zone_field_goals INTEGER,
    penalties INTEGER,
    penalty_yards INTEGER,
    punts INTEGER,
    punt_yards INTEGER,
    possession_time_seconds INTEGER,
    kick_return_yards INTEGER,
    punt_return_yards INTEGER,

    PRIMARY KEY (import_id, game_id, side),

    FOREIGN KEY (import_id, game_id)
        REFERENCES game_import_snapshots(import_id, game_id)
        ON DELETE CASCADE
);

CREATE INDEX team_game_stats_team_id_idx
ON team_game_stats(team_id);


-- -------------------- PLAYER GAME STAT LINES --------------------
-- One row per player/category keeps the raw clean category together. The
-- normalized player_game_stats table below is generated from this JSONB.

CREATE TABLE player_game_stat_lines (
    import_id INTEGER NOT NULL,
    game_id BIGINT NOT NULL,

    player_id INTEGER NOT NULL
        REFERENCES players(player_id),

    team_id INTEGER
        REFERENCES teams(team_id),

    side TEXT NOT NULL
        CHECK (side IN ('home', 'away')),
    team_index INTEGER NOT NULL,
    team_name TEXT,
    opponent_team_index INTEGER,
    opponent_team_name TEXT,

    stat_category TEXT NOT NULL
        CHECK (stat_category IN (
            'passing',
            'rushing',
            'receiving',
            'defense',
            'o_line',
            'kicking',
            'punting',
            'kick_return',
            'punt_return',
            'fumbles'
        )),

    stats JSONB NOT NULL DEFAULT '{}'::jsonb,

    PRIMARY KEY (import_id, game_id, player_id, stat_category),

    FOREIGN KEY (import_id, game_id)
        REFERENCES game_import_snapshots(import_id, game_id)
        ON DELETE CASCADE
);

CREATE INDEX player_game_stat_lines_player_id_idx
ON player_game_stat_lines(player_id);

CREATE INDEX player_game_stat_lines_team_id_idx
ON player_game_stat_lines(team_id);

CREATE INDEX player_game_stat_lines_category_idx
ON player_game_stat_lines(stat_category);


-- -------------------- NORMALIZED PLAYER GAME STATS --------------------
-- Long-form numeric facts are SQL/Power BI friendly. Example:
-- player + game + 'passing' + 'passingYards' + 314.

CREATE TABLE player_game_stats (
    import_id INTEGER NOT NULL,
    game_id BIGINT NOT NULL,
    player_id INTEGER NOT NULL
        REFERENCES players(player_id),

    stat_category TEXT NOT NULL,
    stat_name TEXT NOT NULL,
    stat_value NUMERIC NOT NULL,

    PRIMARY KEY (
        import_id,
        game_id,
        player_id,
        stat_category,
        stat_name
    ),

    FOREIGN KEY (
        import_id,
        game_id,
        player_id,
        stat_category
    )
        REFERENCES player_game_stat_lines(
            import_id,
            game_id,
            player_id,
            stat_category
        )
        ON DELETE CASCADE
);

CREATE INDEX player_game_stats_player_id_idx
ON player_game_stats(player_id);

CREATE INDEX player_game_stats_stat_name_idx
ON player_game_stats(stat_name);

CREATE INDEX player_game_stats_category_idx
ON player_game_stats(stat_category);


-- -------------------- SCORING SUMMARY EVENTS --------------------
-- ScoringSummary is event-list data only. It is never used to reconstruct
-- the authoritative final score; game_import_snapshots/game_line_scores use
-- SeasonGame values for that purpose.

CREATE TABLE scoring_summary_events (
    import_id INTEGER NOT NULL,
    game_id BIGINT NOT NULL,

    event_ordinal INTEGER NOT NULL
        CHECK (event_ordinal > 0),

    quarter INTEGER,
    quarter_display TEXT,
    time_remaining_seconds INTEGER,

    scoring_side TEXT
        CHECK (scoring_side IS NULL OR scoring_side IN ('home', 'away')),
    scoring_team_id INTEGER
        REFERENCES teams(team_id),
    scoring_team_index INTEGER,
    scoring_team_name TEXT,

    scoring_type TEXT,
    raw_scoring_points INTEGER,
    conversion_type TEXT,
    conversion_points INTEGER,
    points_scored INTEGER,

    home_previous_score INTEGER,
    away_previous_score INTEGER,
    home_current_score INTEGER,
    away_current_score INTEGER,
    home_score_after_play INTEGER,
    away_score_after_play INTEGER,

    home_player_snapshots_reference TEXT,
    away_player_snapshots_reference TEXT,

    PRIMARY KEY (import_id, game_id, event_ordinal),

    FOREIGN KEY (import_id, game_id)
        REFERENCES game_import_snapshots(import_id, game_id)
        ON DELETE CASCADE
);

CREATE INDEX scoring_summary_events_game_id_idx
ON scoring_summary_events(game_id);

CREATE INDEX scoring_summary_events_scoring_team_id_idx
ON scoring_summary_events(scoring_team_id);

COMMIT;
