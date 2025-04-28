-- Supabase Database Schema for Football Prediction System

-- Leagues table to store information about football leagues
CREATE TABLE leagues (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    api_id INTEGER UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams table to store information about football teams
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    league_id INTEGER REFERENCES leagues(id),
    api_id INTEGER UNIQUE,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Managers table to store information about football managers
CREATE TABLE managers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    team_id INTEGER REFERENCES teams(id),
    api_id INTEGER UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tactical vectors table to store manager tactical metrics
CREATE TABLE tactical_vectors (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER REFERENCES managers(id),
    pressing_intensity FLOAT,
    possession_control FLOAT,
    counter_attack_focus FLOAT,
    defensive_line_height FLOAT,
    defensive_aggression FLOAT,
    defensive_width FLOAT,
    offensive_width FLOAT,
    offensive_depth FLOAT,
    buildup_speed FLOAT,
    buildup_passing_directness FLOAT,
    buildup_initiation FLOAT,
    chance_creation_method FLOAT,
    defensive_organization FLOAT,
    wing_play_emphasis FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(manager_id)
);

-- Team stats table to store team performance metrics
CREATE TABLE team_stats (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES teams(id),
    season VARCHAR(20) NOT NULL,
    elo_rating FLOAT,
    goals_scored INTEGER,
    goals_conceded INTEGER,
    points_per_game FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, season)
);

-- Fixtures table to store match information
CREATE TABLE fixtures (
    id SERIAL PRIMARY KEY,
    home_team_id INTEGER REFERENCES teams(id),
    away_team_id INTEGER REFERENCES teams(id),
    league_id INTEGER REFERENCES leagues(id),
    season VARCHAR(20) NOT NULL,
    match_date TIMESTAMP WITH TIME ZONE,
    home_score INTEGER,
    away_score INTEGER,
    status VARCHAR(20) DEFAULT 'scheduled',
    api_id INTEGER UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tactical matchups table to store tactical features for matches
CREATE TABLE tactical_matchups (
    id SERIAL PRIMARY KEY,
    fixture_id INTEGER REFERENCES fixtures(id),
    cosine_similarity FLOAT,
    euclidean_distance FLOAT,
    pressing_mismatch FLOAT,
    possession_defense_mismatch FLOAT,
    counter_defense_mismatch FLOAT,
    buildup_pressing_mismatch FLOAT,
    wing_width_mismatch FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(fixture_id)
);

-- Enhanced matches table to store complete feature set for prediction
CREATE TABLE enhanced_matches (
    id SERIAL PRIMARY KEY,
    fixture_id INTEGER REFERENCES fixtures(id),
    cosine_similarity FLOAT,
    euclidean_distance FLOAT,
    pressing_mismatch FLOAT,
    possession_defense_mismatch FLOAT,
    counter_defense_mismatch FLOAT,
    buildup_pressing_mismatch FLOAT,
    wing_width_mismatch FLOAT,
    elo_difference FLOAT,
    goal_diff_difference FLOAT,
    ppg_difference FLOAT,
    home_elo FLOAT,
    away_elo FLOAT,
    home_goals_scored FLOAT,
    away_goals_scored FLOAT,
    home_goals_conceded FLOAT,
    away_goals_conceded FLOAT,
    home_ppg FLOAT,
    away_ppg FLOAT,
    result INTEGER, -- 1 for home win, 0 for draw, -1 for away win
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(fixture_id)
);

-- Predictions table to store model predictions
CREATE TABLE predictions (
    id SERIAL PRIMARY KEY,
    fixture_id INTEGER REFERENCES fixtures(id),
    model_name VARCHAR(50) NOT NULL,
    home_win_probability FLOAT,
    draw_probability FLOAT,
    away_win_probability FLOAT,
    predicted_result INTEGER, -- 1 for home win, 0 for draw, -1 for away win
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(fixture_id, model_name)
);

-- API logs table to track API usage
CREATE TABLE api_logs (
    id SERIAL PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    parameters JSONB,
    status_code INTEGER,
    response_size INTEGER,
    execution_time FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_fixtures_date ON fixtures(match_date);
CREATE INDEX idx_fixtures_status ON fixtures(status);
CREATE INDEX idx_fixtures_league ON fixtures(league_id);
CREATE INDEX idx_teams_league ON teams(league_id);
CREATE INDEX idx_managers_team ON managers(team_id);
CREATE INDEX idx_enhanced_matches_fixture ON enhanced_matches(fixture_id);
CREATE INDEX idx_predictions_fixture ON predictions(fixture_id);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_leagues_updated_at
BEFORE UPDATE ON leagues
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_managers_updated_at
BEFORE UPDATE ON managers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tactical_vectors_updated_at
BEFORE UPDATE ON tactical_vectors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_stats_updated_at
BEFORE UPDATE ON team_stats
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fixtures_updated_at
BEFORE UPDATE ON fixtures
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tactical_matchups_updated_at
BEFORE UPDATE ON tactical_matchups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enhanced_matches_updated_at
BEFORE UPDATE ON enhanced_matches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_predictions_updated_at
BEFORE UPDATE ON predictions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
