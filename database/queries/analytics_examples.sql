-- -------------------- FIELD INDEX ANALYTICS EXAMPLES --------------------
-- Run individual queries in pgAdmin or psql after migration 007.

-- -------------------- TEAM RANKINGS --------------------

SELECT
    season_year,
    school_name,
    wins,
    losses,
    team_rank AS in_game_poll_rank,
    points_per_game,
    scoring_offense_rank,
    points_allowed_per_game,
    scoring_defense_rank,
    turnover_margin,
    turnover_margin_rank
FROM analytics.team_rankings
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
ORDER BY scoring_offense_rank, school_name;


-- -------------------- PASSING LEADERS --------------------

SELECT
    season_year,
    player_name,
    school_name,
    position,
    passing_yards,
    passing_tds,
    interceptions_thrown,
    completion_percentage,
    passing_yards_per_attempt
FROM analytics.player_seasons
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
  AND pass_attempts > 0
ORDER BY passing_yards DESC
LIMIT 25;


-- -------------------- RUSHING LEADERS --------------------

SELECT
    player_name,
    school_name,
    position,
    rushing_attempts,
    rushing_yards,
    rushing_tds,
    rushing_yards_per_attempt
FROM analytics.player_seasons
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
  AND rushing_attempts > 0
ORDER BY rushing_yards DESC
LIMIT 25;


-- -------------------- RECEIVING LEADERS --------------------

SELECT
    player_name,
    school_name,
    position,
    receptions,
    receiving_yards,
    receiving_tds,
    receiving_yards_per_reception,
    yards_after_catch,
    drops
FROM analytics.player_seasons
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
  AND receptions > 0
ORDER BY receiving_yards DESC
LIMIT 25;


-- -------------------- DEFENSIVE LEADERS --------------------

SELECT
    player_name,
    school_name,
    position,
    total_tackles,
    tackles_for_loss,
    defensive_sacks,
    defensive_interceptions,
    pass_deflections,
    forced_fumbles
FROM analytics.player_seasons
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
ORDER BY tackles_for_loss DESC, defensive_sacks DESC
LIMIT 25;


-- -------------------- ONE TEAM'S GAME LOG --------------------

SELECT
    season_year,
    week_type,
    week_number,
    home_away,
    opponent_team_name,
    result,
    points_for,
    points_against,
    offensive_yards,
    opponent_offensive_yards,
    turnover_margin
FROM analytics.team_games
WHERE dynasty_key = 'gators-dynasty'
  AND team_name = 'Florida'
ORDER BY season_year, week_number, game_number;


-- -------------------- PLAYER GAME LOG --------------------

SELECT
    season_year,
    week_type,
    week_number,
    opponent_team_name,
    result,
    passing_yards,
    passing_tds,
    rushing_yards,
    rushing_tds,
    receiving_yards,
    receiving_tds,
    total_tackles,
    defensive_sacks,
    defensive_interceptions
FROM analytics.player_games
WHERE dynasty_key = 'gators-dynasty'
  AND player_name = 'Keisean Henderson'
ORDER BY season_year, week_number, game_number;


-- -------------------- CONFERENCE COMPARISON --------------------

SELECT
    season_year,
    conference_name,
    team_count,
    combined_wins,
    combined_losses,
    combined_win_percentage,
    average_overall_rating,
    average_points_per_game,
    average_points_allowed_per_game,
    average_overall_rank
FROM analytics.conference_seasons
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
ORDER BY average_overall_rank;


-- -------------------- COACH ANALYTICS --------------------

SELECT
    season_year,
    coach_name,
    school_name,
    role,
    level,
    coach_prestige,
    season_wins,
    season_losses,
    career_wins,
    career_losses,
    playoff_wins,
    national_championship_wins,
    draft_picks
FROM analytics.coach_seasons
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
ORDER BY school_name, role;


-- -------------------- TRANSFER HISTORY --------------------

SELECT
    season_year,
    player_name,
    position,
    overall_rating,
    from_team_name,
    to_team_name,
    is_current_season_transfer,
    changed_team_between_tracked_seasons
FROM analytics.player_transfers
WHERE dynasty_key = 'gators-dynasty'
ORDER BY season_year DESC, overall_rating DESC;


-- -------------------- PLAYER DEVELOPMENT HISTORY --------------------

SELECT
    season_year,
    week_type,
    week_number,
    player_name,
    school_name,
    position,
    overall_rating,
    overall_change_from_prior_import
FROM analytics.player_snapshot_history
WHERE dynasty_key = 'gators-dynasty'
  AND player_name = 'Keisean Henderson'
ORDER BY season_index, source_modified_at, import_id;


-- -------------------- TEAM YEAR-OVER-YEAR HISTORY --------------------

SELECT
    season_year,
    school_name,
    wins,
    losses,
    overall_rating,
    overall_rating_change,
    offensive_rating,
    offensive_rating_change,
    defensive_rating,
    defensive_rating_change,
    points_per_game,
    points_allowed_per_game,
    conference_name,
    prior_conference_name
FROM analytics.team_history
WHERE dynasty_key = 'gators-dynasty'
  AND school_name = 'Florida'
ORDER BY season_year;


-- -------------------- CFP RANKING MOVEMENT --------------------

SELECT
    season_year,
    week_type,
    week_number,
    team_name,
    rank,
    last_week_rank,
    points_raw,
    first_place_votes
FROM analytics.ranking_history
WHERE dynasty_key = 'gators-dynasty'
  AND season_year = 2028
  AND poll_type = 'cfp'
  AND team_name = 'Florida'
ORDER BY import_id;


-- -------------------- RECRUITING CLASS SUMMARY --------------------

SELECT
    class_season_year,
    team_name,
    signed_count,
    transfer_count,
    non_transfer_count,
    average_star_rating,
    average_national_rank
FROM analytics.recruiting_classes
WHERE dynasty_key = 'gators-dynasty'
ORDER BY class_season_year DESC, signed_count DESC, team_name;


-- -------------------- RECRUIT TO ROSTER MATCHES --------------------

SELECT
    rh.class_season_year,
    rh.player_display_name AS recruit_name,
    rh.position,
    rh.star_rating,
    rh.signed_team_name,
    rrm.matched_player_id,
    rrm.match_strategy,
    rrm.candidate_count
FROM analytics.recruiting_history AS rh
JOIN analytics.recruiting_roster_matches AS rrm
  ON rrm.recruit_id = rh.recruit_id
WHERE rh.dynasty_key = 'gators-dynasty'
  AND rh.is_signed
ORDER BY rh.class_season_year DESC, rh.national_rank NULLS LAST, recruit_name;


-- -------------------- DEPTH CHART HISTORY --------------------

SELECT
    season_year,
    week_type,
    week_number,
    team_name,
    position_key,
    depth,
    player_display_name,
    jersey_number,
    overall_rating
FROM analytics.depth_chart_history
WHERE dynasty_key = 'gators-dynasty'
  AND team_name = 'Florida'
  AND position_key = 'QB'
ORDER BY season_year, import_id, depth;


-- -------------------- POSTSEASON GAME HISTORY --------------------

SELECT
    season_year,
    week_type,
    week_number,
    postseason_game_type,
    bowl_name,
    home_team_name,
    away_team_name,
    home_score,
    away_score
FROM analytics.postseason_games
WHERE dynasty_key = 'gators-dynasty'
ORDER BY season_year, week_number, game_number;


-- -------------------- NATIONAL CHAMPIONSHIP HISTORY --------------------

SELECT
    season_year,
    national_champion_team_name,
    runner_up_team_name,
    cfp_complete
FROM analytics.championship_history
WHERE dynasty_key = 'gators-dynasty'
ORDER BY season_year;


-- -------------------- AWARD HISTORY --------------------

SELECT
    season_year,
    award_type,
    entity_type,
    entity_display_name,
    team_name,
    position,
    award_score
FROM analytics.award_history
WHERE dynasty_key = 'gators-dynasty'
ORDER BY season_year DESC, award_type, award_ordinal;
