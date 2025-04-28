import os
import json
import time
import requests
import pandas as pd
from datetime import datetime, timedelta
from supabase import create_client, Client

# Supabase configuration
SUPABASE_URL = "https://tuuadmjplkzceervaezn.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dWFkbWpwbGt6Y2VlcnZhZXpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTg1MTExMywiZXhwIjoyMDYxNDI3MTEzfQ.oF0Uh9ChX5w9-vc97WRFU_754i7OP-xQ4zVMWPlzEm4"

# API-Football configuration
API_FOOTBALL_KEY = "d070ca9b94693a8b8ff9e0a380400511"
API_FOOTBALL_URL = "https://v3.football.api-sports.io"

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# League IDs for top 5 European leagues
LEAGUE_IDS = {
    "Premier League": 39,
    "La Liga": 140,
    "Serie A": 135,
    "Bundesliga": 78,
    "Ligue 1": 61
}

# Current season
CURRENT_SEASON = "2024-2025"

def log_api_call(endpoint, parameters, status_code, response_size, execution_time):
    """
    Log API call to the database
    """
    try:
        supabase.table("api_logs").insert({
            "endpoint": endpoint,
            "parameters": parameters,
            "status_code": status_code,
            "response_size": response_size,
            "execution_time": execution_time
        }).execute()
    except Exception as e:
        print(f"Error logging API call: {e}")

def make_api_request(endpoint, params=None):
    """
    Make a request to the API-Football API with rate limiting and logging
    """
    url = f"{API_FOOTBALL_URL}/{endpoint}"
    headers = {
        "x-rapidapi-key": API_FOOTBALL_KEY,
        "x-rapidapi-host": "v3.football.api-sports.io"
    }
    
    start_time = time.time()
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response_size = len(response.content)
        status_code = response.status_code
        execution_time = time.time() - start_time
        
        # Log the API call
        log_api_call(endpoint, params, status_code, response_size, execution_time)
        
        # Check if we're approaching rate limits
        remaining = int(response.headers.get('x-ratelimit-remaining', 0))
        if remaining < 5:
            print(f"Warning: API rate limit approaching. {remaining} requests remaining.")
            time.sleep(60)  # Sleep for a minute to avoid hitting rate limit
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"API request failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error making API request: {e}")
        return None

def fetch_and_store_leagues():
    """
    Fetch and store league information
    """
    print("Fetching and storing league information...")
    
    for league_name, league_id in LEAGUE_IDS.items():
        # Check if league already exists
        existing_league = supabase.table("leagues").select("*").eq("api_id", league_id).execute()
        
        if len(existing_league.data) == 0:
            # Fetch league details from API
            league_data = make_api_request("leagues", {"id": league_id})
            
            if league_data and league_data["results"] > 0:
                league_info = league_data["response"][0]["league"]
                country = league_data["response"][0]["country"]["name"]
                
                # Insert league into database
                supabase.table("leagues").insert({
                    "name": league_name,
                    "country": country,
                    "api_id": league_id
                }).execute()
                
                print(f"Added league: {league_name}")
            else:
                print(f"Failed to fetch data for league: {league_name}")
        else:
            print(f"League already exists: {league_name}")

def fetch_and_store_teams():
    """
    Fetch and store team information for all leagues
    """
    print("Fetching and storing team information...")
    
    # Get all leagues from database
    leagues = supabase.table("leagues").select("*").execute()
    
    for league in leagues.data:
        # Fetch teams for this league and season
        teams_data = make_api_request("teams", {
            "league": league["api_id"],
            "season": CURRENT_SEASON
        })
        
        if teams_data and teams_data["results"] > 0:
            for team in teams_data["response"]:
                team_info = team["team"]
                
                # Check if team already exists
                existing_team = supabase.table("teams").select("*").eq("api_id", team_info["id"]).execute()
                
                if len(existing_team.data) == 0:
                    # Insert team into database
                    supabase.table("teams").insert({
                        "name": team_info["name"],
                        "league_id": league["id"],
                        "api_id": team_info["id"],
                        "logo_url": team_info["logo"]
                    }).execute()
                    
                    print(f"Added team: {team_info['name']}")
                else:
                    # Update team information
                    supabase.table("teams").update({
                        "name": team_info["name"],
                        "league_id": league["id"],
                        "logo_url": team_info["logo"]
                    }).eq("api_id", team_info["id"]).execute()
                    
                    print(f"Updated team: {team_info['name']}")
        else:
            print(f"Failed to fetch teams for league: {league['name']}")

def fetch_and_store_managers():
    """
    Fetch and store manager information for all teams
    """
    print("Fetching and storing manager information...")
    
    # Get all teams from database
    teams = supabase.table("teams").select("*").execute()
    
    for team in teams.data:
        # Fetch coach/manager for this team
        coach_data = make_api_request("coachs", {"team": team["api_id"]})
        
        if coach_data and coach_data["results"] > 0:
            for coach in coach_data["response"]:
                coach_info = coach
                
                # Check if manager already exists
                existing_manager = supabase.table("managers").select("*").eq("api_id", coach_info["id"]).execute()
                
                if len(existing_manager.data) == 0:
                    # Insert manager into database
                    supabase.table("managers").insert({
                        "name": coach_info["name"],
                        "team_id": team["id"],
                        "api_id": coach_info["id"]
                    }).execute()
                    
                    print(f"Added manager: {coach_info['name']} for team {team['name']}")
                else:
                    # Update manager information
                    supabase.table("managers").update({
                        "name": coach_info["name"],
                        "team_id": team["id"]
                    }).eq("api_id", coach_info["id"]).execute()
                    
                    print(f"Updated manager: {coach_info['name']} for team {team['name']}")
        else:
            print(f"Failed to fetch manager for team: {team['name']}")

def fetch_and_store_fixtures():
    """
    Fetch and store fixture information for all leagues
    """
    print("Fetching and storing fixture information...")
    
    # Get all leagues from database
    leagues = supabase.table("leagues").select("*").execute()
    
    for league in leagues.data:
        # Fetch fixtures for this league and season
        fixtures_data = make_api_request("fixtures", {
            "league": league["api_id"],
            "season": CURRENT_SEASON
        })
        
        if fixtures_data and fixtures_data["results"] > 0:
            for fixture in fixtures_data["response"]:
                fixture_info = fixture["fixture"]
                teams_info = fixture["teams"]
                goals_info = fixture["goals"]
                
                # Get team IDs from database
                home_team = supabase.table("teams").select("id").eq("api_id", teams_info["home"]["id"]).execute()
                away_team = supabase.table("teams").select("id").eq("api_id", teams_info["away"]["id"]).execute()
                
                if len(home_team.data) > 0 and len(away_team.data) > 0:
                    home_team_id = home_team.data[0]["id"]
                    away_team_id = away_team.data[0]["id"]
                    
                    # Check if fixture already exists
                    existing_fixture = supabase.table("fixtures").select("*").eq("api_id", fixture_info["id"]).execute()
                    
                    if len(existing_fixture.data) == 0:
                        # Insert fixture into database
                        supabase.table("fixtures").insert({
                            "home_team_id": home_team_id,
                            "away_team_id": away_team_id,
                            "league_id": league["id"],
                            "season": CURRENT_SEASON,
                            "match_date": fixture_info["date"],
                            "home_score": goals_info["home"],
                            "away_score": goals_info["away"],
                            "status": fixture_info["status"]["short"],
                            "api_id": fixture_info["id"]
                        }).execute()
                        
                        print(f"Added fixture: {teams_info['home']['name']} vs {teams_info['away']['name']}")
                    else:
                        # Update fixture information
                        supabase.table("fixtures").update({
                            "home_score": goals_info["home"],
                            "away_score": goals_info["away"],
                            "status": fixture_info["status"]["short"]
                        }).eq("api_id", fixture_info["id"]).execute()
                        
                        print(f"Updated fixture: {teams_info['home']['name']} vs {teams_info['away']['name']}")
                else:
                    print(f"Could not find teams for fixture: {teams_info['home']['name']} vs {teams_info['away']['name']}")
        else:
            print(f"Failed to fetch fixtures for league: {league['name']}")

def fetch_and_store_team_stats():
    """
    Fetch and store team statistics for all teams
    """
    print("Fetching and storing team statistics...")
    
    # Get all teams from database
    teams = supabase.table("teams").select("*").execute()
    
    for team in teams.data:
        # Fetch team statistics for this team and season
        stats_data = make_api_request("teams/statistics", {
            "team": team["api_id"],
            "league": supabase.table("leagues").select("api_id").eq("id", team["league_id"]).execute().data[0]["api_id"],
            "season": CURRENT_SEASON
        })
        
        if stats_data and "response" in stats_data:
            stats = stats_data["response"]
            
            # Calculate points per game
            fixtures_played = stats["fixtures"]["played"]["total"]
            points = stats["fixtures"]["wins"]["total"] * 3 + stats["fixtures"]["draws"]["total"]
            ppg = points / fixtures_played if fixtures_played > 0 else 0
            
            # Use a simple Elo rating calculation (starting at 1500 and adjusting based on results)
            # In a real system, you'd want a more sophisticated Elo calculation
            base_elo = 1500
            win_adjustment = stats["fixtures"]["wins"]["total"] * 20
            loss_adjustment = stats["fixtures"]["loses"]["total"] * 10
            elo_rating = base_elo + win_adjustment - loss_adjustment
            
            # Check if team stats already exist
            existing_stats = supabase.table("team_stats").select("*").eq("team_id", team["id"]).eq("season", CURRENT_SEASON).execute()
            
            if len(existing_stats.data) == 0:
                # Insert team stats into database
                supabase.table("team_stats").insert({
                    "team_id": team["id"],
                    "season": CURRENT_SEASON,
                    "elo_rating": elo_rating,
                    "goals_scored": stats["goals"]["for"]["total"]["total"],
                    "goals_conceded": stats["goals"]["against"]["total"]["total"],
                    "points_per_game": ppg
                }).execute()
                
                print(f"Added team stats for: {team['name']}")
            else:
                # Update team stats
                supabase.table("team_stats").update({
                    "elo_rating": elo_rating,
                    "goals_scored": stats["goals"]["for"]["total"]["total"],
                    "goals_conceded": stats["goals"]["against"]["total"]["total"],
                    "points_per_game": ppg
                }).eq("team_id", team["id"]).eq("season", CURRENT_SEASON).execute()
                
                print(f"Updated team stats for: {team['name']}")
        else:
            print(f"Failed to fetch statistics for team: {team['name']}")

def load_tactical_vectors():
    """
    Load tactical vectors from the CSV file and store in database
    """
    print("Loading tactical vectors from CSV file...")
    
    try:
        # Load the CSV file with tactical vectors
        df = pd.read_csv("manager_tactical_vectors.csv")
        
        # Get all managers from database
        managers = supabase.table("managers").select("*").execute().data
        
        # Create a mapping of manager names to IDs
        manager_map = {manager["name"]: manager["id"] for manager in managers}
        
        # Process each row in the CSV
        for _, row in df.iterrows():
            manager_name = row["manager"]
            
            # Find the manager ID
            manager_id = None
            for db_name, db_id in manager_map.items():
                # Simple name matching (could be improved with fuzzy matching)
                if manager_name.lower() in db_name.lower() or db_name.lower() in manager_name.lower():
                    manager_id = db_id
                    break
            
            if manager_id:
                # Check if tactical vector already exists
                existing_vector = supabase.table("tactical_vectors").select("*").eq("manager_id", manager_id).execute()
                
                # Extract tactical metrics from the row
                tactical_data = {
                    "manager_id": manager_id,
                    "pressing_intensity": row["pressing_intensity"],
                    "possession_control": row["possession_control"],
                    "counter_attack_focus": row["counter_attack_focus"],
                    "defensive_line_height": row["defensive_line_height"],
                    "defensive_aggression": row["defensive_aggression"],
                    "defensive_width": row["defensive_width"],
                    "offensive_width": row["offensive_width"],
                    "offensive_depth": row["offensive_depth"],
                    "buildup_speed": row["buildup_speed"],
                    "buildup_passing_directness": row["buildup_passing_directness"],
                    "buildup_initiation": row["buildup_initiation"],
                    "chance_creation_method": row["chance_creation_method"],
                    "defensive_organization": row["defensive_organization"],
                    "wing_play_emphasis": row["wing_play_emphasis"]
                }
                
                if len(existing_vector.data) == 0:
                    # Insert tactical vector into database
                    supabase.table("tactical_vectors").insert(tactical_data).execute()
                    print(f"Added tactical vector for manager: {manager_name}")
                else:
                    # Update tactical vector
                    supabase.table("tactical_vectors").update(tactical_data).eq("manager_id", manager_id).execute()
                    print(f"Updated tactical vector for manager: {manager_name}")
            else:
                print(f"Could not find manager in database: {manager_name}")
    except Exception as e:
        print(f"Error loading tactical vectors: {e}")

def calculate_tactical_matchups():
    """
    Calculate tactical matchups for fixtures
    """
    print("Calculating tactical matchups for fixtures...")
    
    # Get fixtures that don't have tactical matchups yet
    fixtures = supabase.table("fixtures").select("*").execute().data
    
    for fixture in fixtures:
        # Check if tactical matchup already exists
        existing_matchup = supabase.table("tactical_matchups").select("*").eq("fixture_id", fixture["id"]).execute()
        
        if len(existing_matchup.data) == 0:
            # Get home and away team managers
            home_team = supabase.table("teams").select("*").eq("id", fixture["home_team_id"]).execute().data[0]
            away_team = supabase.table("teams").select("*").eq("id", fixture["away_team_id"]).execute().data[0]
            
            home_manager = supabase.table("managers").select("*").eq("team_id", home_team["id"]).execute().data
            away_manager = supabase.table("managers").select("*").eq("team_id", away_team["id"]).execute().data
            
            if home_manager and away_manager:
                home_manager = home_manager[0]
                away_manager = away_manager[0]
                
                # Get tactical vectors for both managers
                home_vector = supabase.table("tactical_vectors").select("*").eq("manager_id", home_manager["id"]).execute().data
                away_vector = supabase.table("tactical_vectors").select("*").eq("manager_id", away_manager["id"]).execute().data
                
                if home_vector and away_vector:
                    home_vector = home_vector[0]
                    away_vector = away_vector[0]
                    
                    # Calculate tactical matchups
                    # Convert vectors to numpy arrays for calculations
                    import numpy as np
                    
                    home_array = np.array([
                        home_vector["pressing_intensity"],
                        home_vector["possession_control"],
                        home_vector["counter_attack_focus"],
                        home_vector["defensive_line_height"],
                        home_vector["defensive_aggression"],
                        home_vector["defensive_width"],
                        home_vector["offensive_width"],
                        home_vector["offensive_depth"],
                        home_vector["buildup_speed"],
                        home_vector["buildup_passing_directness"],
                        home_vector["buildup_initiation"],
                        home_vector["chance_creation_method"],
                        home_vector["defensive_organization"],
                        home_vector["wing_play_emphasis"]
                    ])
                    
                    away_array = np.array([
                        away_vector["pressing_intensity"],
                        away_vector["possession_control"],
                        away_vector["counter_attack_focus"],
                        away_vector["defensive_line_height"],
                        away_vector["defensive_aggression"],
                        away_vector["defensive_width"],
                        away_vector["offensive_width"],
                        away_vector["offensive_depth"],
                        away_vector["buildup_speed"],
                        away_vector["buildup_passing_directness"],
                        away_vector["buildup_initiation"],
                        away_vector["chance_creation_method"],
                        away_vector["defensive_organization"],
                        away_vector["wing_play_emphasis"]
                    ])
                    
                    # Calculate cosine similarity
                    cosine_similarity = np.dot(home_array, away_array) / (np.linalg.norm(home_array) * np.linalg.norm(away_array))
                    
                    # Calculate euclidean distance
                    euclidean_distance = np.linalg.norm(home_array - away_array)
                    
                    # Calculate specific tactical mismatches
                    pressing_mismatch = home_vector["pressing_intensity"] - away_vector["pressing_intensity"]
                    possession_defense_mismatch = home_vector["possession_control"] - away_vector["defensive_organization"]
                    counter_defense_mismatch = home_vector["counter_attack_focus"] - away_vector["defensive_line_height"]
                    buildup_pressing_mismatch = home_vector["buildup_initiation"] - away_vector["pressing_intensity"]
                    wing_width_mismatch = home_vector["wing_play_emphasis"] - away_vector["defensive_width"]
                    
                    # Insert tactical matchup into database
                    supabase.table("tactical_matchups").insert({
                        "fixture_id": fixture["id"],
                        "cosine_similarity": float(cosine_similarity),
                        "euclidean_distance": float(euclidean_distance),
                        "pressing_mismatch": float(pressing_mismatch),
                        "possession_defense_mismatch": float(possession_defense_mismatch),
                        "counter_defense_mismatch": float(counter_defense_mismatch),
                        "buildup_pressing_mismatch": float(buildup_pressing_mismatch),
                        "wing_width_mismatch": float(wing_width_mismatch)
                    }).execute()
                    
                    print(f"Added tactical matchup for fixture: {home_team['name']} vs {away_team['name']}")
                else:
                    print(f"Missing tactical vectors for fixture: {home_team['name']} vs {away_team['name']}")
            else:
                print(f"Missing managers for fixture: {home_team['name']} vs {away_team['name']}")

def create_enhanced_matches():
    """
    Create enhanced matches with all features for prediction
    """
    print("Creating enhanced matches with all features...")
    
    # Get fixtures that have tactical matchups but not enhanced matches
    fixtures = supabase.table("fixtures").select("*").execute().data
    
    for fixture in fixtures:
        # Check if enhanced match already exists
        existing_enhanced = supabase.table("enhanced_matches").select("*").eq("fixture_id", fixture["id"]).execute()
        
        if len(existing_enhanced.data) == 0:
            # Get tactical matchup
            tactical_matchup = supabase.table("tactical_matchups").select("*").eq("fixture_id", fixture["id"]).execute().data
            
            if tactical_matchup:
                tactical_matchup = tactical_matchup[0]
                
                # Get team stats
                home_team_stats = supabase.table("team_stats").select("*").eq("team_id", fixture["home_team_id"]).eq("season", CURRENT_SEASON).execute().data
                away_team_stats = supabase.table("team_stats").select("*").eq("team_id", fixture["away_team_id"]).eq("season", CURRENT_SEASON).execute().data
                
                if home_team_stats and away_team_stats:
                    home_team_stats = home_team_stats[0]
                    away_team_stats = away_team_stats[0]
                    
                    # Calculate squad strength features
                    elo_difference = home_team_stats["elo_rating"] - away_team_stats["elo_rating"]
                    goal_diff_difference = (home_team_stats["goals_scored"] - home_team_stats["goals_conceded"]) - (away_team_stats["goals_scored"] - away_team_stats["goals_conceded"])
                    ppg_difference = home_team_stats["points_per_game"] - away_team_stats["points_per_game"]
                    
                    # Determine result if match is finished
                    result = None
                    if fixture["status"] in ["FT", "AET", "PEN"]:
                        if fixture["home_score"] > fixture["away_score"]:
                            result = 1  # Home win
                        elif fixture["home_score"] < fixture["away_score"]:
                            result = -1  # Away win
                        else:
                            result = 0  # Draw
                    
                    # Insert enhanced match into database
                    supabase.table("enhanced_matches").insert({
                        "fixture_id": fixture["id"],
                        "cosine_similarity": tactical_matchup["cosine_similarity"],
                        "euclidean_distance": tactical_matchup["euclidean_distance"],
                        "pressing_mismatch": tactical_matchup["pressing_mismatch"],
                        "possession_defense_mismatch": tactical_matchup["possession_defense_mismatch"],
                        "counter_defense_mismatch": tactical_matchup["counter_defense_mismatch"],
                        "buildup_pressing_mismatch": tactical_matchup["buildup_pressing_mismatch"],
                        "wing_width_mismatch": tactical_matchup["wing_width_mismatch"],
                        "elo_difference": elo_difference,
                        "goal_diff_difference": goal_diff_difference,
                        "ppg_difference": ppg_difference,
                        "home_elo": home_team_stats["elo_rating"],
                        "away_elo": away_team_stats["elo_rating"],
                        "home_goals_scored": home_team_stats["goals_scored"],
                        "away_goals_scored": away_team_stats["goals_scored"],
                        "home_goals_conceded": home_team_stats["goals_conceded"],
                        "away_goals_conceded": away_team_stats["goals_conceded"],
                        "home_ppg": home_team_stats["points_per_game"],
                        "away_ppg": away_team_stats["points_per_game"],
                        "result": result
                    }).execute()
                    
                    print(f"Added enhanced match for fixture ID: {fixture['id']}")
                else:
                    print(f"Missing team stats for fixture ID: {fixture['id']}")
            else:
                print(f"Missing tactical matchup for fixture ID: {fixture['id']}")

def make_predictions():
    """
    Make predictions for upcoming fixtures
    """
    print("Making predictions for upcoming fixtures...")
    
    # Load the trained model
    import pickle
    
    try:
        with open("best_model.pkl", "rb") as f:
            model = pickle.load(f)
        
        with open("scaler.pkl", "rb") as f:
            scaler = pickle.load(f)
        
        # Get upcoming fixtures (status = NS for Not Started)
        upcoming_fixtures = supabase.table("fixtures").select("*").eq("status", "NS").execute().data
        
        for fixture in upcoming_fixtures:
            # Get enhanced match data
            enhanced_match = supabase.table("enhanced_matches").select("*").eq("fixture_id", fixture["id"]).execute().data
            
            if enhanced_match:
                enhanced_match = enhanced_match[0]
                
                # Prepare features for prediction
                features = [
                    enhanced_match["cosine_similarity"],
                    enhanced_match["euclidean_distance"],
                    enhanced_match["pressing_mismatch"],
                    enhanced_match["possession_defense_mismatch"],
                    enhanced_match["counter_defense_mismatch"],
                    enhanced_match["buildup_pressing_mismatch"],
                    enhanced_match["wing_width_mismatch"],
                    enhanced_match["elo_difference"],
                    enhanced_match["goal_diff_difference"],
                    enhanced_match["ppg_difference"],
                    enhanced_match["home_elo"],
                    enhanced_match["away_elo"],
                    enhanced_match["home_goals_scored"],
                    enhanced_match["away_goals_scored"],
                    enhanced_match["home_goals_conceded"],
                    enhanced_match["away_goals_conceded"],
                    enhanced_match["home_ppg"],
                    enhanced_match["away_ppg"]
                ]
                
                # Scale features
                features_scaled = scaler.transform([features])
                
                # Make prediction
                prediction = model.predict(features_scaled)[0]
                
                # Get probabilities
                probabilities = model.predict_proba(features_scaled)[0]
                
                # Check if prediction already exists
                existing_prediction = supabase.table("predictions").select("*").eq("fixture_id", fixture["id"]).eq("model_name", "catboost").execute()
                
                if len(existing_prediction.data) == 0:
                    # Insert prediction into database
                    supabase.table("predictions").insert({
                        "fixture_id": fixture["id"],
                        "model_name": "catboost",
                        "home_win_probability": float(probabilities[2]) if len(probabilities) > 2 else float(probabilities[1]),
                        "draw_probability": float(probabilities[1]) if len(probabilities) > 2 else float(probabilities[0]),
                        "away_win_probability": float(probabilities[0]) if len(probabilities) > 2 else 1.0 - float(probabilities[0]) - float(probabilities[1]),
                        "predicted_result": int(prediction)
                    }).execute()
                    
                    print(f"Added prediction for fixture ID: {fixture['id']}")
                else:
                    # Update prediction
                    supabase.table("predictions").update({
                        "home_win_probability": float(probabilities[2]) if len(probabilities) > 2 else float(probabilities[1]),
                        "draw_probability": float(probabilities[1]) if len(probabilities) > 2 else float(probabilities[0]),
                        "away_win_probability": float(probabilities[0]) if len(probabilities) > 2 else 1.0 - float(probabilities[0]) - float(probabilities[1]),
                        "predicted_result": int(prediction)
                    }).eq("fixture_id", fixture["id"]).eq("model_name", "catboost").execute()
                    
                    print(f"Updated prediction for fixture ID: {fixture['id']}")
            else:
                print(f"Missing enhanced match data for fixture ID: {fixture['id']}")
    except Exception as e:
        print(f"Error making predictions: {e}")

def run_data_collection():
    """
    Run the complete data collection process
    """
    print("Starting data collection process...")
    
    try:
        # Fetch and store leagues
        fetch_and_store_leagues()
        
        # Fetch and store teams
        fetch_and_store_teams()
        
        # Fetch and store managers
        fetch_and_store_managers()
        
        # Fetch and store fixtures
        fetch_and_store_fixtures()
        
        # Fetch and store team stats
        fetch_and_store_team_stats()
        
        # Load tactical vectors from CSV
        load_tactical_vectors()
        
        # Calculate tactical matchups
        calculate_tactical_matchups()
        
        # Create enhanced matches
        create_enhanced_matches()
        
        # Make predictions
        make_predictions()
        
        print("Data collection process completed successfully!")
    except Exception as e:
        print(f"Error in data collection process: {e}")

if __name__ == "__main__":
    run_data_collection()
