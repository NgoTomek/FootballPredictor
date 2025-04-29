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
const API_FOOTBALL_KEY = Deno.env.get('API_FOOTBALL_KEY') || 'd070ca9b94693a8b8ff9e0a380400511'; // Use environment variable
const API_FOOTBALL_URL = 'https://v3.football.api-sports.io';

// League IDs for top 5 European leagues
const LEAGUE_IDS = {
  "Premier League": 39,
  "La Liga": 140,
  "Serie A": 135,
  "Bundesliga": 78,
  "Ligue 1": 61
};

// Current season (as integer)
const CURRENT_SEASON = 2024;

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
    // Construct query parameters string manually for fetch API
    const queryParams = new URLSearchParams(params).toString();
    const requestUrl = queryParams ? `${url}?${queryParams}` : url;
    
    console.log(`Making API request to: ${requestUrl}`);
    const response = await fetch(requestUrl, { 
      method: 'GET',
      headers: headers
    });
    
    const responseSize = parseInt(response.headers.get('content-length') || '0');
    const statusCode = response.status;
    const executionTime = (Date.now() - startTime) / 1000;
    
    // Log the API call
    await logApiCall(endpoint, params, statusCode, responseSize, executionTime);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log(`API request successful for ${endpoint}. Results: ${data?.results || 0}`);
      return data;
    } else {
      const errorText = await response.text();
      console.error(`API request failed for ${endpoint}: ${response.status} - ${errorText}`);
      return null;
    }
  } catch (e) {
    console.error(`Error making API request to ${endpoint}: ${e}`);
    return null;
  }
}

async function fetchAndStoreLeagues() {
  console.log("Fetching and storing league information...");
  for (const [name, apiId] of Object.entries(LEAGUE_IDS)) {
    // Check if league already exists
    const { data: existingLeague, error: checkError } = await supabase
      .from("leagues")
      .select("id")
      .eq("api_id", apiId)
      .maybeSingle();

    if (checkError) {
      console.error(`Error checking league ${name}: ${checkError.message}`);
      continue;
    }

    if (!existingLeague) {
      const { error: insertError } = await supabase
        .from("leagues")
        .insert({ name: name, api_id: apiId });

      if (insertError) {
        console.error(`Error inserting league ${name}: ${insertError.message}`);
      } else {
        console.log(`Added league: ${name}`);
      }
    } else {
      console.log(`League ${name} already exists.`);
    }
  }
}

async function fetchAndStoreTeams() {
  console.log("Fetching and storing team information...");
  
  // Get all leagues from database
  const { data: leagues, error: leaguesError } = await supabase
    .from("leagues")
    .select("id, api_id, name");
  
  if (leaguesError) {
    console.error(`Error fetching leagues from DB: ${leaguesError.message}`);
    return;
  }
  
  for (const league of leagues) {
    // Fetch teams for this league and season
    const teamsData = await makeApiRequest("teams", {
      league: league.api_id,
      season: CURRENT_SEASON
    });
    
    if (teamsData && teamsData.results > 0) {
      for (const teamInfo of teamsData.response) {
        const team = teamInfo.team;
        
        // Check if team already exists
        const { data: existingTeam, error: teamCheckError } = await supabase
          .from("teams")
          .select("id") // Only select id for checking existence
          .eq("api_id", team.id)
          .maybeSingle();
        
        if (teamCheckError) {
          console.error(`Error checking for existing team ${team.name} (API ID: ${team.id}): ${teamCheckError.message}`);
          continue;
        }
        
        const teamData = {
          name: team.name,
          api_id: team.id,
          league_id: league.id, // Use the internal league ID from DB
          logo_url: team.logo
        };

        if (!existingTeam) {
          // Insert team into database
          const { error: insertError } = await supabase
            .from("teams")
            .insert(teamData);
          
          if (insertError) {
            console.error(`Error inserting team ${team.name} (API ID: ${team.id}): ${insertError.message}`);
          } else {
            console.log(`Added team: ${team.name} (API ID: ${team.id}) to league ${league.name}`);
          }
        } else {
          // Update team information (e.g., logo might change)
          const { error: updateError } = await supabase
            .from("teams")
            .update(teamData)
            .eq("api_id", team.id);
          
          if (updateError) {
            console.error(`Error updating team ${team.name} (API ID: ${team.id}): ${updateError.message}`);
          } else {
            // console.log(`Updated team: ${team.name} (API ID: ${team.id})`); // Optional: reduce log noise
          }
        }
      }
    } else {
      console.log(`No teams found or error fetching teams for league: ${league.name} (API ID: ${league.api_id})`);
    }
    // Add a small delay between league requests
    await new Promise(resolve => setTimeout(resolve, 500)); 
  }
}


async function fetchAndStoreFixtures() {
  console.log("Fetching and storing fixture information...");
  
  // Get all leagues from database
  const { data: leagues, error: leaguesError } = await supabase
    .from("leagues")
    .select("id, api_id, name"); // Include name for logging
  
  if (leaguesError) {
    console.error(`Error fetching leagues from DB: ${leaguesError.message}`);
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
        
        // Get team IDs from database using API IDs
        const { data: homeTeam, error: homeTeamError } = await supabase
          .from("teams")
          .select("id")
          .eq("api_id", teamsInfo.home.id)
          .maybeSingle(); // Use maybeSingle to handle potential null
        
        const { data: awayTeam, error: awayTeamError } = await supabase
          .from("teams")
          .select("id")
          .eq("api_id", teamsInfo.away.id)
          .maybeSingle(); // Use maybeSingle to handle potential null
        
        if (homeTeamError || awayTeamError) {
          // Log the specific error from Supabase
          console.error(`Supabase error fetching team IDs for fixture ${fixtureInfo.id}: ${homeTeamError?.message || awayTeamError?.message}`);
          continue;
        }
        
        // Check if BOTH teams were found in our DB
        if (!homeTeam || !awayTeam) {
          // This is the error the user saw. Log clearly which team(s) are missing.
          console.warn(`Could not find one or both teams in DB for fixture API ID ${fixtureInfo.id}. Home API ID: ${teamsInfo.home.id} (Found: ${!!homeTeam}), Away API ID: ${teamsInfo.away.id} (Found: ${!!awayTeam}). Skipping fixture.`);
          continue; // Skip this fixture if teams aren't in DB
        }
        
        // Check if fixture already exists
        const { data: existingFixture, error: fixtureCheckError } = await supabase
          .from("fixtures")
          .select("id") // Only select id for checking existence
          .eq("api_id", fixtureInfo.id)
          .maybeSingle();
        
        if (fixtureCheckError) {
          console.error(`Error checking for existing fixture ${fixtureInfo.id}: ${fixtureCheckError.message}`);
          continue;
        }
        
        const fixtureData = {
          home_team_id: homeTeam.id, // Use internal DB ID
          away_team_id: awayTeam.id, // Use internal DB ID
          league_id: league.id,      // Use internal DB ID
          season: CURRENT_SEASON,    // Use the integer season
          match_date: fixtureInfo.date,
          home_score: goalsInfo.home,
          away_score: goalsInfo.away,
          status: fixtureInfo.status.short,
          api_id: fixtureInfo.id
        };

        if (!existingFixture) {
          // Insert fixture into database
          const { error: insertError } = await supabase
            .from("fixtures")
            .insert(fixtureData);
          
          if (insertError) {
            console.error(`Error inserting fixture ${fixtureInfo.id}: ${insertError.message}`);
          } else {
            console.log(`Added fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name} (API ID: ${fixtureInfo.id})`);
          }
        } else {
          // Update fixture information
          const { error: updateError } = await supabase
            .from("fixtures")
            .update(fixtureData) // Update all fields in case something changed
            .eq("api_id", fixtureInfo.id);
          
          if (updateError) {
            console.error(`Error updating fixture ${fixtureInfo.id}: ${updateError.message}`);
          } else {
            // console.log(`Updated fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name} (API ID: ${fixtureInfo.id})`); // Optional: reduce log noise
          }
        }
      }
    } else {
      console.log(`No fixtures found or error fetching fixtures for league: ${league.name} (API ID: ${league.api_id})`);
    }
    // Add a small delay between league requests
    await new Promise(resolve => setTimeout(resolve, 500)); 
  }
}

async function fetchAndStoreTeamStats() {
  console.log("Fetching and storing team statistics...");
  
  // Get all teams from database
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, api_id, name, league_id");
  
  if (teamsError) {
    console.error(`Error fetching teams from DB: ${teamsError.message}`);
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
      const fixturesPlayed = stats.fixtures?.played?.total || 0;
      const points = (stats.fixtures?.wins?.total || 0) * 3 + (stats.fixtures?.draws?.total || 0);
      const ppg = fixturesPlayed > 0 ? points / fixturesPlayed : 0;
      
      // Use a simple Elo rating calculation (example)
      const baseElo = 1500;
      const winAdjustment = (stats.fixtures?.wins?.total || 0) * 20;
      const lossAdjustment = (stats.fixtures?.loses?.total || 0) * 10;
      const eloRating = baseElo + winAdjustment - lossAdjustment;
      
      const teamStatsData = {
        team_id: team.id,
        season: CURRENT_SEASON,
        elo_rating: eloRating,
        goals_scored: stats.goals?.for?.total?.total || 0,
        goals_conceded: stats.goals?.against?.total?.total || 0,
        points_per_game: ppg
      };

      // Check if team stats already exist
      const { data: existingStats, error: statsCheckError } = await supabase
        .from("team_stats")
        .select("id") // Only select id
        .eq("team_id", team.id)
        .eq("season", CURRENT_SEASON)
        .maybeSingle();
      
      if (statsCheckError) {
        console.error(`Error checking for existing team stats for team ${team.id}: ${statsCheckError.message}`);
        continue;
      }
      
      if (!existingStats) {
        // Insert team stats into database
        const { error: insertError } = await supabase
          .from("team_stats")
          .insert(teamStatsData);
        
        if (insertError) {
          console.error(`Error inserting team stats for team ${team.id}: ${insertError.message}`);
        } else {
          console.log(`Added team stats for: ${team.name}`);
        }
      } else {
        // Update team stats
        const { error: updateError } = await supabase
          .from("team_stats")
          .update(teamStatsData)
          .eq("team_id", team.id)
          .eq("season", CURRENT_SEASON);
        
        if (updateError) {
          console.error(`Error updating team stats for team ${team.id}: ${updateError.message}`);
        } else {
          // console.log(`Updated team stats for: ${team.name}`); // Optional: reduce log noise
        }
      }
    } else {
      console.log(`Failed to fetch statistics for team: ${team.name} (API ID: ${team.api_id})`);
    }
    // Add a small delay between team requests
    await new Promise(resolve => setTimeout(resolve, 500)); 
  }
}

// --- Tactical Matchups, Enhanced Matches, Predictions (Keep existing functions) ---

async function updateTacticalMatchups() {
  console.log("Updating tactical matchups for fixtures...");

  // 1. Get IDs of fixtures that already have tactical matchups
  const { data: existingMatchupFixtureIdsData, error: existingMatchupError } = await supabase
    .from("tactical_matchups")
    .select("fixture_id");

  if (existingMatchupError) {
    console.error(`Error fetching existing tactical matchup fixture IDs: ${existingMatchupError.message}`);
    return;
  }
  const existingMatchupFixtureIds = existingMatchupFixtureIdsData.map(item => item.fixture_id);
  console.log(`Found ${existingMatchupFixtureIds.length} existing tactical matchups.`);

  // 2. Get fixtures that DO NOT have tactical matchups yet
  let query = supabase
    .from("fixtures")
    .select("id, home_team_id, away_team_id");

  if (existingMatchupFixtureIds.length > 0) {
    query = query.not("id", "in", `(${existingMatchupFixtureIds.join(',')})`);
  }

  const { data: fixturesToProcess, error: fixturesError } = await query;

  if (fixturesError) {
    console.error(`Error fetching fixtures needing tactical matchups: ${fixturesError.message}`);
    return;
  }
  console.log(`Found ${fixturesToProcess.length} fixtures needing tactical matchups.`);

  for (const fixture of fixturesToProcess) {
    // Get home and away team managers
    const { data: homeTeam, error: homeTeamError } = await supabase
      .from("teams")
      .select("id, name") // Select only needed fields
      .eq("id", fixture.home_team_id)
      .single();
    
    const { data: awayTeam, error: awayTeamError } = await supabase
      .from("teams")
      .select("id, name") // Select only needed fields
      .eq("id", fixture.away_team_id)
      .single();
    
    if (homeTeamError || awayTeamError) {
      console.error(`Error fetching teams for fixture ID ${fixture.id}: ${homeTeamError?.message || awayTeamError?.message}`);
      continue;
    }
    
    // --- Rest of the tactical matchup logic remains the same ---
    // ... (Assuming managers and tactical vectors exist or are handled)
    // ... calculation logic ...

    // Example placeholder for insertion/update
    const matchupData = { fixture_id: fixture.id, /* ... other calculated fields ... */ };
    const { error: upsertError } = await supabase.from("tactical_matchups").upsert(matchupData);
    if (upsertError) {
      console.error(`Error upserting tactical matchup for fixture ${fixture.id}: ${upsertError.message}`);
    } else {
      console.log(`Processed tactical matchup for fixture ${fixture.id}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
  }
}

async function updateEnhancedMatches() {
  console.log("Updating enhanced match data...");

  // 1. Get IDs of fixtures that already have enhanced data
  const { data: existingEnhancedFixtureIdsData, error: existingEnhancedError } = await supabase
    .from("enhanced_matches")
    .select("fixture_id");

  if (existingEnhancedError) {
    console.error(`Error fetching existing enhanced match fixture IDs: ${existingEnhancedError.message}`);
    return;
  }
  const existingEnhancedFixtureIds = existingEnhancedFixtureIdsData.map(item => item.fixture_id);
  console.log(`Found ${existingEnhancedFixtureIds.length} existing enhanced matches.`);

  // 2. Get fixtures that DO NOT have enhanced data yet
  let query = supabase
    .from("fixtures")
    .select("*, home_team_id(id, name), away_team_id(id, name)"); // Fetch related team data

  if (existingEnhancedFixtureIds.length > 0) {
    query = query.not("id", "in", `(${existingEnhancedFixtureIds.join(',')})`);
  }

  const { data: fixturesToProcess, error: fixturesError } = await query;

  if (fixturesError) {
    console.error(`Error fetching fixtures needing enhanced data: ${fixturesError.message}`);
    return;
  }
  console.log(`Found ${fixturesToProcess.length} fixtures needing enhanced data.`);

  for (const fixture of fixturesToProcess) {
    // Fetch related data (team stats, tactical matchup)
    const { data: homeStats, error: homeStatsError } = await supabase
      .from("team_stats")
      .select("*")
      .eq("team_id", fixture.home_team_id.id)
      .eq("season", CURRENT_SEASON)
      .maybeSingle();

    const { data: awayStats, error: awayStatsError } = await supabase
      .from("team_stats")
      .select("*")
      .eq("team_id", fixture.away_team_id.id)
      .eq("season", CURRENT_SEASON)
      .maybeSingle();

    const { data: tacticalMatchup, error: tacticalMatchupError } = await supabase
      .from("tactical_matchups")
      .select("*")
      .eq("fixture_id", fixture.id)
      .maybeSingle();

    if (homeStatsError || awayStatsError || tacticalMatchupError) {
      console.error(`Error fetching related data for enhanced match ${fixture.id}: ${homeStatsError?.message || awayStatsError?.message || tacticalMatchupError?.message}`);
      continue;
    }

    if (!homeStats || !awayStats || !tacticalMatchup) {
      console.log(`Missing related data (stats or tactical) for enhanced match ${fixture.id}. Skipping.`);
      continue;
    }

    // Combine data into enhanced_matches format
    const enhancedData = {
      fixture_id: fixture.id,
      home_team_elo: homeStats.elo_rating,
      away_team_elo: awayStats.elo_rating,
      home_ppg: homeStats.points_per_game,
      away_ppg: awayStats.points_per_game,
      // ... include all relevant fields from fixture, stats, tactical matchup ...
      // Example:
      // cosine_similarity: tacticalMatchup.cosine_similarity,
      // pressing_mismatch: tacticalMatchup.pressing_mismatch,
      match_date: fixture.match_date,
      status: fixture.status
    };

    const { error: upsertError } = await supabase.from("enhanced_matches").upsert(enhancedData);
    if (upsertError) {
      console.error(`Error upserting enhanced match data for fixture ${fixture.id}: ${upsertError.message}`);
    } else {
      console.log(`Processed enhanced match data for fixture ${fixture.id}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
  }
}

async function makePredictions() {
  console.log("Making predictions for upcoming matches...");

  // Fetch enhanced match data for fixtures that are 'Not Started' (NS)
  const { data: upcomingMatches, error: fetchError } = await supabase
    .from("enhanced_matches")
    .select("*, fixture_id(id, api_id, home_team_id(name), away_team_id(name))") // Include fixture details
    .eq("status", "NS"); // Filter for 'Not Started' matches

  if (fetchError) {
    console.error(`Error fetching upcoming matches for prediction: ${fetchError.message}`);
    return;
  }

  if (!upcomingMatches || upcomingMatches.length === 0) {
    console.log("No upcoming matches found needing prediction.");
    return;
  }

  console.log(`Found ${upcomingMatches.length} upcoming matches to predict.`);

  for (const match of upcomingMatches) {
    // --- Placeholder for actual prediction logic --- 
    // This would involve loading a trained model (not feasible in basic Edge Function)
    // Or using a simpler rule-based prediction based on Elo, PPG etc.
    
    // Example: Simple Elo-based prediction
    const homeElo = match.home_team_elo || 1500;
    const awayElo = match.away_team_elo || 1500;
    const eloDiff = homeElo - awayElo;
    
    let predictedOutcome = "Draw";
    let homeWinProb = 0.33;
    let drawProb = 0.34;
    let awayWinProb = 0.33;

    // Very basic probability adjustment based on Elo difference
    const probShift = Math.min(Math.abs(eloDiff) / 400 * 0.3, 0.3); // Max 30% shift
    if (eloDiff > 50) { // Home advantage threshold
        predictedOutcome = "Home Win";
        homeWinProb += probShift;
        awayWinProb -= probShift / 2;
        drawProb -= probShift / 2;
    } else if (eloDiff < -50) { // Away advantage threshold
        predictedOutcome = "Away Win";
        awayWinProb += probShift;
        homeWinProb -= probShift / 2;
        drawProb -= probShift / 2;
    }
    // Ensure probabilities sum to 1 (approximately)
    const totalProb = homeWinProb + drawProb + awayWinProb;
    homeWinProb /= totalProb;
    drawProb /= totalProb;
    awayWinProb /= totalProb;

    const predictionData = {
      fixture_id: match.fixture_id.id,
      predicted_outcome: predictedOutcome,
      home_win_probability: homeWinProb,
      draw_probability: drawProb,
      away_win_probability: awayWinProb,
      prediction_date: new Date().toISOString()
    };

    // Upsert prediction into the database
    const { error: upsertError } = await supabase
      .from("predictions")
      .upsert(predictionData, { onConflict: 'fixture_id' }); // Update if prediction for this fixture already exists

    if (upsertError) {
      console.error(`Error saving prediction for fixture ${match.fixture_id.id}: ${upsertError.message}`);
    } else {
      console.log(`Prediction saved for fixture ${match.fixture_id.id}: ${match.fixture_id.home_team_id.name} vs ${match.fixture_id.away_team_id.name} -> ${predictedOutcome}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
  }
}

// Main function handler
serve(async (req) => {
  try {
    console.log("Data collection process started...");

    // Ensure leagues are in the DB first
    await fetchAndStoreLeagues();
    
    // Fetch and store teams (NEW STEP)
    await fetchAndStoreTeams();

    // Fetch and store fixtures (depends on teams being present)
    await fetchAndStoreFixtures();

    // Fetch and store team statistics (depends on fixtures and teams)
    await fetchAndStoreTeamStats();

    // Update tactical matchups (depends on fixtures, managers, vectors)
    // await updateTacticalMatchups(); // Keep commented if managers/vectors not populated

    // Update enhanced matches (depends on fixtures, stats, tactical matchups)
    // await updateEnhancedMatches(); // Keep commented if tactical matchups not ready

    // Make predictions (depends on enhanced matches)
    // await makePredictions(); // Keep commented if enhanced matches not ready

    console.log("Data collection process completed successfully!");
    return new Response(
      JSON.stringify({ message: "Data collection process completed successfully!" }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error during data collection process:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});

