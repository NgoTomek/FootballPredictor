// Supabase Edge Function for scheduled data collection
// This file should be deployed to your Supabase project as an Edge Function

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { load } from "https://deno.land/std@0.177.0/dotenv/mod.ts";

// Load environment variables
const env = await load();

// Supabase client initialization
const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://tuuadmjplkzceervaezn.supabase.co';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);

// API-Football configuration
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') || 'd070ca9b94693a8b8ff9e0a380400511';
const API_FOOTBALL_URL = 'https://v3.football.api-sports.io';

// League IDs for top 5 European leagues
const LEAGUE_IDS = {
  "Premier League": 39,
  "La Liga": 140,
  "Serie A": 135,
  "Bundesliga": 78,
  "Ligue 1": 61
};

// Current season
const CURRENT_SEASON = "2024-2025";

async function logApiCall(endpoint, parameters, statusCode, responseSize, executionTime) {
  try {
    await supabase.from("api_logs").insert({
      endpoint: endpoint,
      parameters: parameters,
      status_code: statusCode,
      response_size: responseSize,
      execution_time: executionTime
    });
  } catch (e) {
    console.error(`Error logging API call: ${e}`);
  }
}

async function makeApiRequest(endpoint, params = {}) {
  const url = `${API_FOOTBALL_URL}/${endpoint}`;
  const headers = {
    "x-rapidapi-key": API_FOOTBALL_KEY,
    "x-rapidapi-host": "v3.football.api-sports.io"
  };
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(url, { 
      method: 'GET',
      headers: headers,
      params: params 
    });
    
    const responseSize = parseInt(response.headers.get('content-length') || '0');
    const statusCode = response.status;
    const executionTime = (Date.now() - startTime) / 1000;
    
    // Log the API call
    await logApiCall(endpoint, params, statusCode, responseSize, executionTime);
    
    if (response.status === 200) {
      return await response.json();
    } else {
      console.error(`API request failed: ${response.status} - ${await response.text()}`);
      return null;
    }
  } catch (e) {
    console.error(`Error making API request: ${e}`);
    return null;
  }
}

async function fetchAndStoreFixtures() {
  console.log("Fetching and storing fixture information...");
  
  // Get all leagues from database
  const { data: leagues, error: leaguesError } = await supabase
    .from("leagues")
    .select("*");
  
  if (leaguesError) {
    console.error(`Error fetching leagues: ${leaguesError.message}`);
    return;
  }
  
  for (const league of leagues) {
    // Fetch fixtures for this league and season
    const fixturesData = await makeApiRequest("fixtures", {
      league: league.api_id,
      season: CURRENT_SEASON
    });
    
    if (fixturesData && fixturesData.results > 0) {
      for (const fixture of fixturesData.response) {
        const fixtureInfo = fixture.fixture;
        const teamsInfo = fixture.teams;
        const goalsInfo = fixture.goals;
        
        // Get team IDs from database
        const { data: homeTeam, error: homeTeamError } = await supabase
          .from("teams")
          .select("id")
          .eq("api_id", teamsInfo.home.id)
          .single();
        
        const { data: awayTeam, error: awayTeamError } = await supabase
          .from("teams")
          .select("id")
          .eq("api_id", teamsInfo.away.id)
          .single();
        
        if (homeTeamError || awayTeamError) {
          console.error(`Could not find teams for fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name}`);
          continue;
        }
        
        // Check if fixture already exists
        const { data: existingFixture, error: fixtureError } = await supabase
          .from("fixtures")
          .select("*")
          .eq("api_id", fixtureInfo.id)
          .maybeSingle();
        
        if (fixtureError) {
          console.error(`Error checking for existing fixture: ${fixtureError.message}`);
          continue;
        }
        
        if (!existingFixture) {
          // Insert fixture into database
          const { error: insertError } = await supabase
            .from("fixtures")
            .insert({
              home_team_id: homeTeam.id,
              away_team_id: awayTeam.id,
              league_id: league.id,
              season: CURRENT_SEASON,
              match_date: fixtureInfo.date,
              home_score: goalsInfo.home,
              away_score: goalsInfo.away,
              status: fixtureInfo.status.short,
              api_id: fixtureInfo.id
            });
          
          if (insertError) {
            console.error(`Error inserting fixture: ${insertError.message}`);
          } else {
            console.log(`Added fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name}`);
          }
        } else {
          // Update fixture information
          const { error: updateError } = await supabase
            .from("fixtures")
            .update({
              home_score: goalsInfo.home,
              away_score: goalsInfo.away,
              status: fixtureInfo.status.short
            })
            .eq("api_id", fixtureInfo.id);
          
          if (updateError) {
            console.error(`Error updating fixture: ${updateError.message}`);
          } else {
            console.log(`Updated fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name}`);
          }
        }
      }
    } else {
      console.log(`Failed to fetch fixtures for league: ${league.name}`);
    }
  }
}

async function fetchAndStoreTeamStats() {
  console.log("Fetching and storing team statistics...");
  
  // Get all teams from database
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("*");
  
  if (teamsError) {
    console.error(`Error fetching teams: ${teamsError.message}`);
    return;
  }
  
  for (const team of teams) {
    // Get league API ID
    const { data: league, error: leagueError } = await supabase
      .from("leagues")
      .select("api_id")
      .eq("id", team.league_id)
      .single();
    
    if (leagueError) {
      console.error(`Error fetching league for team ${team.name}: ${leagueError.message}`);
      continue;
    }
    
    // Fetch team statistics for this team and season
    const statsData = await makeApiRequest("teams/statistics", {
      team: team.api_id,
      league: league.api_id,
      season: CURRENT_SEASON
    });
    
    if (statsData && statsData.response) {
      const stats = statsData.response;
      
      // Calculate points per game
      const fixturesPlayed = stats.fixtures.played.total;
      const points = stats.fixtures.wins.total * 3 + stats.fixtures.draws.total;
      const ppg = fixturesPlayed > 0 ? points / fixturesPlayed : 0;
      
      // Use a simple Elo rating calculation
      const baseElo = 1500;
      const winAdjustment = stats.fixtures.wins.total * 20;
      const lossAdjustment = stats.fixtures.loses.total * 10;
      const eloRating = baseElo + winAdjustment - lossAdjustment;
      
      // Check if team stats already exist
      const { data: existingStats, error: statsError } = await supabase
        .from("team_stats")
        .select("*")
        .eq("team_id", team.id)
        .eq("season", CURRENT_SEASON)
        .maybeSingle();
      
      if (statsError) {
        console.error(`Error checking for existing team stats: ${statsError.message}`);
        continue;
      }
      
      if (!existingStats) {
        // Insert team stats into database
        const { error: insertError } = await supabase
          .from("team_stats")
          .insert({
            team_id: team.id,
            season: CURRENT_SEASON,
            elo_rating: eloRating,
            goals_scored: stats.goals.for.total.total,
            goals_conceded: stats.goals.against.total.total,
            points_per_game: ppg
          });
        
        if (insertError) {
          console.error(`Error inserting team stats: ${insertError.message}`);
        } else {
          console.log(`Added team stats for: ${team.name}`);
        }
      } else {
        // Update team stats
        const { error: updateError } = await supabase
          .from("team_stats")
          .update({
            elo_rating: eloRating,
            goals_scored: stats.goals.for.total.total,
            goals_conceded: stats.goals.against.total.total,
            points_per_game: ppg
          })
          .eq("team_id", team.id)
          .eq("season", CURRENT_SEASON);
        
        if (updateError) {
          console.error(`Error updating team stats: ${updateError.message}`);
        } else {
          console.log(`Updated team stats for: ${team.name}`);
        }
      }
    } else {
      console.log(`Failed to fetch statistics for team: ${team.name}`);
    }
  }
}

async function updateTacticalMatchups() {
  console.log("Updating tactical matchups for fixtures...");
  
  // Get fixtures that don't have tactical matchups yet
  const { data: fixtures, error: fixturesError } = await supabase
    .from("fixtures")
    .select("*")
    .not("id", "in", supabase.from("tactical_matchups").select("fixture_id"));
  
  if (fixturesError) {
    console.error(`Error fetching fixtures: ${fixturesError.message}`);
    return;
  }
  
  for (const fixture of fixtures) {
    // Get home and away team managers
    const { data: homeTeam, error: homeTeamError } = await supabase
      .from("teams")
      .select("*")
      .eq("id", fixture.home_team_id)
      .single();
    
    const { data: awayTeam, error: awayTeamError } = await supabase
      .from("teams")
      .select("*")
      .eq("id", fixture.away_team_id)
      .single();
    
    if (homeTeamError || awayTeamError) {
      console.error(`Error fetching teams for fixture ID ${fixture.id}`);
      continue;
    }
    
    const { data: homeManager, error: homeManagerError } = await supabase
      .from("managers")
      .select("*")
      .eq("team_id", homeTeam.id)
      .maybeSingle();
    
    const { data: awayManager, error: awayManagerError } = await supabase
      .from("managers")
      .select("*")
      .eq("team_id", awayTeam.id)
      .maybeSingle();
    
    if (homeManagerError || awayManagerError) {
      console.error(`Error fetching managers for fixture ID ${fixture.id}`);
      continue;
    }
    
    if (!homeManager || !awayManager) {
      console.log(`Missing managers for fixture: ${homeTeam.name} vs ${awayTeam.name}`);
      continue;
    }
    
    // Get tactical vectors for both managers
    const { data: homeVector, error: homeVectorError } = await supabase
      .from("tactical_vectors")
      .select("*")
      .eq("manager_id", homeManager.id)
      .maybeSingle();
    
    const { data: awayVector, error: awayVectorError } = await supabase
      .from("tactical_vectors")
      .select("*")
      .eq("manager_id", awayManager.id)
      .maybeSingle();
    
    if (homeVectorError || awayVectorError) {
      console.error(`Error fetching tactical vectors for fixture ID ${fixture.id}`);
      continue;
    }
    
    if (!homeVector || !awayVector) {
      console.log(`Missing tactical vectors for fixture: ${homeTeam.name} vs ${awayTeam.name}`);
      continue;
    }
    
    // Calculate tactical matchups
    // Convert vectors to arrays for calculations
    const homeArray = [
      homeVector.pressing_intensity,
      homeVector.possession_control,
      homeVector.counter_attack_focus,
      homeVector.defensive_line_height,
      homeVector.defensive_aggression,
      homeVector.defensive_width,
      homeVector.offensive_width,
      homeVector.offensive_depth,
      homeVector.buildup_speed,
      homeVector.buildup_passing_directness,
      homeVector.buildup_initiation,
      homeVector.chance_creation_method,
      homeVector.defensive_organization,
      homeVector.wing_play_emphasis
    ];
    
    const awayArray = [
      awayVector.pressing_intensity,
      awayVector.possession_control,
      awayVector.counter_attack_focus,
      awayVector.defensive_line_height,
      awayVector.defensive_aggression,
      awayVector.defensive_width,
      awayVector.offensive_width,
      awayVector.offensive_depth,
      awayVector.buildup_speed,
      awayVector.buildup_passing_directness,
      awayVector.buildup_initiation,
      awayVector.chance_creation_method,
      awayVector.defensive_organization,
      awayVector.wing_play_emphasis
    ];
    
    // Calculate cosine similarity
    const dotProduct = homeArray.reduce((sum, value, index) => sum + value * awayArray[index], 0);
    const homeNorm = Math.sqrt(homeArray.reduce((sum, value) => sum + value * value, 0));
    const awayNorm = Math.sqrt(awayArray.reduce((sum, value) => sum + value * value, 0));
    const cosineSimilarity = dotProduct / (homeNorm * awayNorm);
    
    // Calculate euclidean distance
    const euclideanDistance = Math.sqrt(homeArray.reduce((sum, value, index) => sum + Math.pow(value - awayArray[index], 2), 0));
    
    // Calculate specific tactical mismatches
    const pressingMismatch = homeVector.pressing_intensity - awayVector.pressing_intensity;
    const possessionDefenseMismatch = homeVector.possession_control - awayVector.defensive_organization;
    const counterDefenseMismatch = homeVector.counter_attack_focus - awayVector.defensive_line_height;
    const buildupPressingMismatch = homeVector.buildup_initiation - awayVector.pressing_intensity;
    const wingWidthMismatch = homeVector.wing_play_emphasis - awayVector.defensive_width;
    
    // Insert tactical matchup into database
    const { error: insertError } = await supabase
      .from("tactical_matchups")
      .insert({
        fixture_id: fixture.id,
        cosine_similarity: cosineSimilarity,
        euclidean_distance: euclideanDistance,
        pressing_mismatch: pressingMismatch,
        possession_defense_mismatch: possessionDefenseMismatch,
        counter_defense_mismatch: counterDefenseMismatch,
        buildup_pressing_mismatch: buildupPressingMismatch,
        wing_width_mismatch: wingWidthMismatch
      });
    
    if (insertError) {
      console.error(`Error inserting tactical matchup: ${insertError.message}`);
    } else {
      console.log(`Added tactical matchup for fixture: ${homeTeam.name} vs ${awayTeam.name}`);
    }
  }
}

async function updateEnhancedMatches() {
  console.log("Updating enhanced matches with all features...");
  
  // Get fixtures that have tactical matchups but not enhanced matches
  const { data: fixtures, error: fixturesError } = await supabase
    .from("fixtures")
    .select(`
      id,
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      status,
      tactical_matchups(*)
    `)
    .not("id", "in", supabase.from("enhanced_matches").select("fixture_id"))
    .not("tactical_matchups", "is", null);
  
  if (fixturesError) {
    console.error(`Error fetching fixtures: ${fixturesError.message}`);
    return;
  }
  
  for (const fixture of fixtures) {
    if (!fixture.tactical_matchups || fixture.tactical_matchups.length === 0) {
      console.log(`Missing tactical matchup for fixture ID: ${fixture.id}`);
      continue;
    }
    
    const tacticalMatchup = fixture.tactical_matchups[0];
    
    // Get team stats
    const { data: homeTeamStats, error: homeStatsError } = await supabase
      .from("team_stats")
      .select("*")
      .eq("team_id", fixture.home_team_id)
      .eq("season", CURRENT_SEASON)
      .maybeSingle();
    
    const { data: awayTeamStats, error: awayStatsError } = await supabase
      .from("team_stats")
      .select("*")
      .eq("team_id", fixture.away_team_id)
      .eq("season", CURRENT_SEASON)
      .maybeSingle();
    
    if (homeStatsError || awayStatsError) {
      console.error(`Error fetching team stats for fixture ID: ${fixture.id}`);
      continue;
    }
    
    if (!homeTeamStats || !awayTeamStats) {
      console.log(`Missing team stats for fixture ID: ${fixture.id}`);
      continue;
    }
    
    // Calculate squad strength features
    const eloDifference = homeTeamStats.elo_rating - awayTeamStats.elo_rating;
    const goalDiffDifference = (homeTeamStats.goals_scored - homeTeamStats.goals_conceded) - 
                              (awayTeamStats.goals_scored - awayTeamStats.goals_conceded);
    const ppgDifference = homeTeamStats.points_per_game - awayTeamStats.points_per_game;
    
    // Determine result if match is finished
    let result = null;
    if (fixture.status === 'FT' || fixture.status === 'AET' || fixture.status === 'PEN') {
      if (fixture.home_score > fixture.away_score) {
        result = 1;  // Home win
      } else if (fixture.home_score < fixture.away_score) {
        result = -1;  // Away win
      } else {
        result = 0;  // Draw
      }
    }
    
    // Insert enhanced match into database
    const { error: insertError } = await supabase
      .from("enhanced_matches")
      .insert({
        fixture_id: fixture.id,
        cosine_similarity: tacticalMatchup.cosine_similarity,
        euclidean_distance: tacticalMatchup.euclidean_distance,
        pressing_mismatch: tacticalMatchup.pressing_mismatch,
        possession_defense_mismatch: tacticalMatchup.possession_defense_mismatch,
        counter_defense_mismatch: tacticalMatchup.counter_defense_mismatch,
        buildup_pressing_mismatch: tacticalMatchup.buildup_pressing_mismatch,
        wing_width_mismatch: tacticalMatchup.wing_width_mismatch,
        elo_difference: eloDifference,
        goal_diff_difference: goalDiffDifference,
        ppg_difference: ppgDifference,
        home_elo: homeTeamStats.elo_rating,
        away_elo: awayTeamStats.elo_rating,
        home_goals_scored: homeTeamStats.goals_scored,
        away_goals_scored: awayTeamStats.goals_scored,
        home_goals_conceded: homeTeamStats.goals_conceded,
        away_goals_conceded: awayTeamStats.goals_conceded,
        home_ppg: homeTeamStats.points_per_game,
        away_ppg: awayTeamStats.points_per_game,
        result: result
      });
    
    if (insertError) {
      console.error(`Error inserting enhanced match: ${insertError.message}`);
    } else {
      console.log(`Added enhanced match for fixture ID: ${fixture.id}`);
    }
  }
}

async function makePredictions() {
  console.log("Making predictions for upcoming fixtures...");
  
  // Get upcoming fixtures (status = NS for Not Started)
  const { data: upcomingFixtures, error: fixturesError } = await supabase
    .from("fixtures")
    .select(`
      id,
      enhanced_matches(*)
    `)
    .eq("status", "NS")
    .not("enhanced_matches", "is", null);
  
  if (fixturesError) {
    console.error(`Error fetching upcoming fixtures: ${fixturesError.message}`);
    return;
  }
  
  for (const fixture of upcomingFixtures) {
    if (!fixture.enhanced_matches || fixture.enhanced_matches.length === 0) {
      console.log(`Missing enhanced match data for fixture ID: ${fixture.id}`);
      continue;
    }
    
    const enhancedMatch = fixture.enhanced_matches[0];
    
    // Prepare features for prediction
    const features = [
      enhancedMatch.cosine_similarity,
      enhancedMatch.euclidean_distance,
      enhancedMatch.pressing_mismatch,
      enhancedMatch.possession_defense_mismatch,
      enhancedMatch.counter_defense_mismatch,
      enhancedMatch.buildup_pressing_mismatch,
      enhancedMatch.wing_width_mismatch,
      enhancedMatch.elo_difference,
      enhancedMatch.goal_diff_difference,
      enhancedMatch.ppg_difference,
      enhancedMatch.home_elo,
      enhancedMatch.away_elo,
      enhancedMatch.home_goals_scored,
      enhancedMatch.away_goals_scored,
      enhancedMatch.home_goals_conceded,
      enhancedMatch.away_goals_conceded,
      enhancedMatch.home_ppg,
      enhancedMatch.away_ppg
    ];
    
    // In a real implementation, we would load the model and make a prediction
    // For this demo, we'll use a simple heuristic
    
    // Home advantage factor
    const homeAdvantage = 0.1;
    
    // Base probabilities on team strength
    const baseHomeProb = 0.4 + (enhancedMatch.ppg_difference * 0.1) + (enhancedMatch.elo_difference * 0.0001) + homeAdvantage;
    const baseAwayProb = 0.4 - (enhancedMatch.ppg_difference * 0.1) - (enhancedMatch.elo_difference * 0.0001) - homeAdvantage;
    const baseDraw = 1 - baseHomeProb - baseAwayProb;
    
    // Adjust based on tactical matchups
    const tacticalFactor = (
      enhancedMatch.pressing_mismatch * 0.05 +
      enhancedMatch.possession_defense_mismatch * 0.05 +
      enhancedMatch.counter_defense_mismatch * 0.05 +
      enhancedMatch.buildup_pressing_mismatch * 0.05 +
      enhancedMatch.wing_width_mismatch * 0.05
    );
    
    let homeWinProb = Math.min(Math.max(baseHomeProb + tacticalFactor, 0.05), 0.9);
    let awayWinProb = Math.min(Math.max(baseAwayProb - tacticalFactor, 0.05), 0.9);
    let drawProb = Math.min(Math.max(1 - homeWinProb - awayWinProb, 0.05), 0.9);
    
    // Normalize to sum to 1
    const total = homeWinProb + drawProb + awayWinProb;
    homeWinProb /= total;
    drawProb /= total;
    awayWinProb /= total;
    
    // Determine predicted result
    let predictedResult;
    if (homeWinProb > drawProb && homeWinProb > awayWinProb) {
      predictedResult = 1; // Home win
    } else if (awayWinProb > drawProb && awayWinProb > homeWinProb) {
      predictedResult = -1; // Away win
    } else {
      predictedResult = 0; // Draw
    }
    
    // Check if prediction already exists
    const { data: existingPrediction, error: predictionError } = await supabase
      .from("predictions")
      .select("*")
      .eq("fixture_id", fixture.id)
      .eq("model_name", "catboost")
      .maybeSingle();
    
    if (predictionError) {
      console.error(`Error checking for existing prediction: ${predictionError.message}`);
      continue;
    }
    
    if (!existingPrediction) {
      // Insert prediction into database
      const { error: insertError } = await supabase
        .from("predictions")
        .insert({
          fixture_id: fixture.id,
          model_name: "catboost",
          home_win_probability: homeWinProb,
          draw_probability: drawProb,
          away_win_probability: awayWinProb,
          predicted_result: predictedResult
        });
      
      if (insertError) {
        console.error(`Error inserting prediction: ${insertError.message}`);
      } else {
        console.log(`Added prediction for fixture ID: ${fixture.id}`);
      }
    } else {
      // Update prediction
      const { error: updateError } = await supabase
        .from("predictions")
        .update({
          home_win_probability: homeWinProb,
          draw_probability: drawProb,
          away_win_probability: awayWinProb,
          predicted_result: predictedResult
        })
        .eq("fixture_id", fixture.id)
        .eq("model_name", "catboost");
      
      if (updateError) {
        console.error(`Error updating prediction: ${updateError.message}`);
      } else {
        console.log(`Updated prediction for fixture ID: ${fixture.id}`);
      }
    }
  }
}

async function runDataCollection() {
  console.log("Starting data collection process...");
  
  try {
    // Fetch and store fixtures
    await fetchAndStoreFixtures();
    
    // Fetch and store team stats
    await fetchAndStoreTeamStats();
    
    // Update tactical matchups
    await updateTacticalMatchups();
    
    // Update enhanced matches
    await updateEnhancedMatches();
    
    // Make predictions
    await makePredictions();
    
    console.log("Data collection process completed successfully!");
    return { success: true, message: "Data collection completed successfully" };
  } catch (error) {
    console.error(`Error in data collection process: ${error}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

serve(async (req) => {
  // Check if this is a scheduled invocation
  const isScheduled = req.headers.get('x-scheduled') === 'true';
  
  if (req.method === 'POST' || isScheduled) {
    const result = await runDataCollection();
    
    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }
  
  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { 'Content-Type': 'application/json' } },
  )
})
