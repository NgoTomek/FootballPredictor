// Supabase Edge Function for scheduled data collection - Optimized for Single League Processing + Predictions Enabled
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

// League IDs mapping (used for reference, not iteration)
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

// Function to ensure a specific league exists in the DB
async function ensureLeagueExists(leagueApiId) {
  console.log(`Ensuring league with API ID ${leagueApiId} exists...`);
  
  // Find league name from LEAGUE_IDS mapping (optional, for logging)
  const leagueName = Object.keys(LEAGUE_IDS).find(key => LEAGUE_IDS[key] === leagueApiId) || `League ${leagueApiId}`;

  // Check if league already exists
  const { data: existingLeague, error: checkError } = await supabase
    .from("leagues")
    .select("id, name, api_id") // Select api_id as well
    .eq("api_id", leagueApiId)
    .maybeSingle();

  if (checkError) {
    console.error(`Error checking league ${leagueName}: ${checkError.message}`);
    return null; // Return null if error
  }

  if (!existingLeague) {
    const { data: insertedLeague, error: insertError } = await supabase
      .from("leagues")
      .insert({ name: leagueName, api_id: leagueApiId })
      .select("id, name, api_id") // Select api_id as well
      .single();

    if (insertError) {
      console.error(`Error inserting league ${leagueName}: ${insertError.message}`);
      return null; // Return null if error
    } else {
      console.log(`Added league: ${leagueName}`);
      return insertedLeague; // Return the newly inserted league object
    }
  } else {
    console.log(`League ${leagueName} already exists.`);
    return existingLeague; // Return the existing league object
  }
}

// Modified to fetch teams only for the specified league
async function fetchAndStoreTeams(league) {
  // **FIX:** Check if league object is valid and contains id and api_id
  if (!league || typeof league !== 'object' || !league.id || !league.api_id) {
      console.error("Invalid league object passed to fetchAndStoreTeams:", league);
      return; // Stop execution for this step if league object is invalid
  }
  console.log(`Fetching and storing team information for league: ${league.name} (API ID: ${league.api_id})...`);
  
  // Fetch teams for this specific league and season
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
}

// Modified to fetch fixtures only for the specified league
async function fetchAndStoreFixtures(league) {
  // **FIX:** Check if league object is valid and contains id and api_id
  if (!league || typeof league !== 'object' || !league.id || !league.api_id) {
      console.error("Invalid league object passed to fetchAndStoreFixtures:", league);
      return; // Stop execution for this step if league object is invalid
  }
  console.log(`Fetching and storing fixture information for league: ${league.name} (API ID: ${league.api_id})...`);
  
  // Fetch fixtures for this specific league and season
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
        .maybeSingle();
      
      const { data: awayTeam, error: awayTeamError } = await supabase
        .from("teams")
        .select("id")
        .eq("api_id", teamsInfo.away.id)
        .maybeSingle();
      
      if (homeTeamError || awayTeamError) {
        console.error(`Supabase error fetching team IDs for fixture ${fixtureInfo.id}: ${homeTeamError?.message || awayTeamError?.message}`);
        continue;
      }
      
      if (!homeTeam || !awayTeam) {
        console.warn(`Could not find one or both teams in DB for fixture API ID ${fixtureInfo.id}. Home API ID: ${teamsInfo.home.id} (Found: ${!!homeTeam}), Away API ID: ${teamsInfo.away.id} (Found: ${!!awayTeam}). Skipping fixture.`);
        continue;
      }
      
      // Check if fixture already exists
      const { data: existingFixture, error: fixtureCheckError } = await supabase
        .from("fixtures")
        .select("id")
        .eq("api_id", fixtureInfo.id)
        .maybeSingle();
      
      if (fixtureCheckError) {
        console.error(`Error checking for existing fixture ${fixtureInfo.id}: ${fixtureCheckError.message}`);
        continue;
      }
      
      const fixtureData = {
        home_team_id: homeTeam.id,
        away_team_id: awayTeam.id,
        league_id: league.id,
        season: CURRENT_SEASON,
        match_date: fixtureInfo.date,
        home_score: goalsInfo.home,
        away_score: goalsInfo.away,
        status: fixtureInfo.status.short,
        api_id: fixtureInfo.id
      };

      if (!existingFixture) {
        const { error: insertError } = await supabase
          .from("fixtures")
          .insert(fixtureData);
        
        if (insertError) {
          console.error(`Error inserting fixture ${fixtureInfo.id}: ${insertError.message}`);
        } else {
          console.log(`Added fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name} (API ID: ${fixtureInfo.id})`);
        }
      } else {
        const { error: updateError } = await supabase
          .from("fixtures")
          .update(fixtureData)
          .eq("api_id", fixtureInfo.id);
        
        if (updateError) {
          console.error(`Error updating fixture ${fixtureInfo.id}: ${updateError.message}`);
        } else {
          // console.log(`Updated fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name} (API ID: ${fixtureInfo.id})`);
        }
      }
    }
  } else {
    console.log(`No fixtures found or error fetching fixtures for league: ${league.name} (API ID: ${league.api_id})`);
  }
}

// Modified to fetch stats only for teams in the specified league
async function fetchAndStoreTeamStats(league) {
   // **FIX:** Check if league object is valid and contains id and api_id
   if (!league || typeof league !== 'object' || !league.id || !league.api_id) {
      console.error("Invalid league object passed to fetchAndStoreTeamStats:", league);
      return; // Stop execution for this step if league object is invalid
  }
  console.log(`Fetching and storing team statistics for league: ${league.name} (API ID: ${league.api_id})...`);
  
  // Get teams belonging to this league from database
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, api_id, name") // Only need these fields
    .eq("league_id", league.id); // Filter by internal league ID
  
  if (teamsError) {
    console.error(`Error fetching teams from DB for league ${league.name}: ${teamsError.message}`);
    return;
  }

  if (!teams || teams.length === 0) {
      console.log(`No teams found in DB for league ${league.name} to fetch stats for.`);
      return;
  }
  
  for (const team of teams) {
    // Fetch team statistics for this team, league, and season
    const statsData = await makeApiRequest("teams/statistics", {
      team: team.api_id,
      league: league.api_id, // Use league's API ID for the API call
      season: CURRENT_SEASON
    });
    
    if (statsData && statsData.response) {
      const stats = statsData.response;
      
      const fixturesPlayed = stats.fixtures?.played?.total || 0;
      const points = (stats.fixtures?.wins?.total || 0) * 3 + (stats.fixtures?.draws?.total || 0);
      const ppg = fixturesPlayed > 0 ? points / fixturesPlayed : 0;
      
      const baseElo = 1500;
      const winAdjustment = (stats.fixtures?.wins?.total || 0) * 20;
      const lossAdjustment = (stats.fixtures?.loses?.total || 0) * 10;
      const eloRating = baseElo + winAdjustment - lossAdjustment;
      
      const teamStatsData = {
        team_id: team.id, // Use internal team ID
        season: CURRENT_SEASON,
        elo_rating: eloRating,
        goals_scored: stats.goals?.for?.total?.total || 0,
        goals_conceded: stats.goals?.against?.total?.total || 0,
        points_per_game: ppg
      };

      // Upsert team stats (insert if not exist, update if exist)
      const { error: upsertError } = await supabase
        .from("team_stats")
        .upsert(teamStatsData, { onConflict: 'team_id, season' }); // Define conflict target

      if (upsertError) {
        console.error(`Error upserting team stats for team ${team.id}: ${upsertError.message}`);
      } else {
        console.log(`Upserted team stats for: ${team.name}`);
      }
    } else {
      console.log(`Failed to fetch statistics for team: ${team.name} (API ID: ${team.api_id})`);
    }
    // Add a small delay between team requests
    await new Promise(resolve => setTimeout(resolve, 300)); // Slightly shorter delay ok here
  }
}

// --- Tactical Matchups (Still requires manager/vector data) ---
async function updateTacticalMatchups(league) { 
    // This function would need significant work to fetch manager data,
    // calculate/fetch tactical vectors, and filter by league.
    // Keeping it commented out for now.
    console.log(`Skipping tactical matchups for league ${league.name} (Not Implemented)`);
}

// --- Enhanced Matches (Enabled, but without tactical data) ---
async function updateEnhancedMatches(league) {
  if (!league || typeof league !== 'object' || !league.id) {
      console.error("Invalid league object passed to updateEnhancedMatches:", league);
      return;
  }
  console.log(`Updating enhanced match data for league: ${league.name}...`);

  // 1. Get IDs of fixtures in this league that already have enhanced data
  const { data: existingEnhancedFixtureIdsData, error: existingEnhancedError } = await supabase
    .from("enhanced_matches")
    .select("fixture_id")
    .in("fixture_id", supabase.from("fixtures").select("id").eq("league_id", league.id)); // Filter by league

  if (existingEnhancedError) {
    console.error(`Error fetching existing enhanced match fixture IDs for league ${league.id}: ${existingEnhancedError.message}`);
    return;
  }
  const existingEnhancedFixtureIds = existingEnhancedFixtureIdsData.map(item => item.fixture_id);
  console.log(`Found ${existingEnhancedFixtureIds.length} existing enhanced matches for league ${league.name}.`);

  // 2. Get fixtures in this league that DO NOT have enhanced data yet
  let query = supabase
    .from("fixtures")
    .select("*, home_team_id(id, name), away_team_id(id, name)") // Fetch related team data
    .eq("league_id", league.id); // Filter by league

  if (existingEnhancedFixtureIds.length > 0) {
    query = query.not("id", "in", `(${existingEnhancedFixtureIds.join(',')})`);
  }

  const { data: fixturesToProcess, error: fixturesError } = await query;

  if (fixturesError) {
    console.error(`Error fetching fixtures needing enhanced data for league ${league.id}: ${fixturesError.message}`);
    return;
  }
  console.log(`Found ${fixturesToProcess.length} fixtures needing enhanced data for league ${league.name}.`);

  for (const fixture of fixturesToProcess) {
    // Fetch related data (team stats)
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

    // Tactical matchup data is skipped for now
    // const { data: tacticalMatchup, error: tacticalMatchupError } = await supabase
    //   .from("tactical_matchups")
    //   .select("*")
    //   .eq("fixture_id", fixture.id)
    //   .maybeSingle();

    if (homeStatsError || awayStatsError /*|| tacticalMatchupError*/) {
      console.error(`Error fetching related stats for enhanced match ${fixture.id}: ${homeStatsError?.message || awayStatsError?.message /*|| tacticalMatchupError?.message*/}`);
      continue;
    }

    if (!homeStats || !awayStats /*|| !tacticalMatchup*/) {
      console.log(`Missing team stats for enhanced match ${fixture.id}. Skipping.`);
      continue;
    }

    // Combine data into enhanced_matches format (without tactical data)
    const enhancedData = {
      fixture_id: fixture.id,
      home_team_elo: homeStats.elo_rating,
      away_team_elo: awayStats.elo_rating,
      home_ppg: homeStats.points_per_game,
      away_ppg: awayStats.points_per_game,
      // Tactical fields are omitted
      // cosine_similarity: tacticalMatchup.cosine_similarity,
      // pressing_mismatch: tacticalMatchup.pressing_mismatch,
      match_date: fixture.match_date,
      status: fixture.status
    };

    const { error: upsertError } = await supabase.from("enhanced_matches").upsert(enhancedData, { onConflict: 'fixture_id' });
    if (upsertError) {
      console.error(`Error upserting enhanced match data for fixture ${fixture.id}: ${upsertError.message}`);
    } else {
      console.log(`Processed enhanced match data for fixture ${fixture.id}`);
    }
    await new Promise(resolve => setTimeout(resolve, 50)); // Shorter delay ok
  }
}

// --- Predictions (Enabled, uses enhanced data) ---
async function makePredictions(league) {
  if (!league || typeof league !== 'object' || !league.id) {
      console.error("Invalid league object passed to makePredictions:", league);
      return;
  }
  console.log(`Making predictions for upcoming matches in league: ${league.name}...`);

  // Fetch enhanced match data for fixtures in this league that are 'Not Started' (NS)
  const { data: upcomingMatches, error: fetchError } = await supabase
    .from("enhanced_matches")
    .select("*, fixture_id!inner(id, api_id, league_id, home_team_id(name), away_team_id(name))") // Use inner join to filter by league
    .eq("status", "NS") // Filter for 'Not Started' matches
    .eq("fixture_id.league_id", league.id); // Filter by league ID

  if (fetchError) {
    console.error(`Error fetching upcoming matches for prediction in league ${league.id}: ${fetchError.message}`);
    return;
  }

  if (!upcomingMatches || upcomingMatches.length === 0) {
    console.log(`No upcoming matches found needing prediction for league ${league.name}.`);
    return;
  }

  console.log(`Found ${upcomingMatches.length} upcoming matches to predict for league ${league.name}.`);

  for (const match of upcomingMatches) {
    // Simple Elo-based prediction (as before)
    const homeElo = match.home_team_elo || 1500;
    const awayElo = match.away_team_elo || 1500;
    const eloDiff = homeElo - awayElo;
    
    let predictedOutcome = "Draw";
    let homeWinProb = 0.33;
    let drawProb = 0.34;
    let awayWinProb = 0.33;

    const probShift = Math.min(Math.abs(eloDiff) / 400 * 0.3, 0.3); 
    if (eloDiff > 50) { 
        predictedOutcome = "Home Win";
        homeWinProb += probShift;
        awayWinProb -= probShift / 2;
        drawProb -= probShift / 2;
    } else if (eloDiff < -50) { 
        predictedOutcome = "Away Win";
        awayWinProb += probShift;
        homeWinProb -= probShift / 2;
        drawProb -= probShift / 2;
    }
    
    const totalProb = homeWinProb + drawProb + awayWinProb;
    homeWinProb = Math.max(0, homeWinProb / totalProb); // Ensure non-negative
    drawProb = Math.max(0, drawProb / totalProb);
    awayWinProb = Math.max(0, awayWinProb / totalProb);
    // Re-normalize if needed after ensuring non-negative
    const finalTotalProb = homeWinProb + drawProb + awayWinProb;
    if (finalTotalProb > 0) {
        homeWinProb /= finalTotalProb;
        drawProb /= finalTotalProb;
        awayWinProb /= finalTotalProb;
    }

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
    await new Promise(resolve => setTimeout(resolve, 50)); // Shorter delay ok
  }
}

// Main function handler - Modified to accept league_api_id
serve(async (req) => {
  let leagueApiId = null;
  try {
    // Try to parse league_api_id from request body
    const requestBody = await req.json();
    leagueApiId = requestBody?.league_api_id ? parseInt(requestBody.league_api_id) : null;
  } catch (e) {
    // Ignore errors if body is empty or not JSON
    console.log("No valid league_api_id found in request body.");
  }

  if (!leagueApiId || !Object.values(LEAGUE_IDS).includes(leagueApiId)) {
      console.error(`Invalid or missing league_api_id provided: ${leagueApiId}. Aborting.`);
      return new Response(
          JSON.stringify({ error: `Invalid or missing league_api_id. Provide one of: ${Object.values(LEAGUE_IDS).join(', ')}` }),
          { headers: { "Content-Type": "application/json" }, status: 400 }
      );
  }

  try {
    console.log(`Data collection process started for league API ID: ${leagueApiId}...`);

    // 1. Ensure the specified league exists in the DB and get its internal ID
    const league = await ensureLeagueExists(leagueApiId);
    // **FIX:** Check if league object is valid before proceeding
    if (!league || typeof league !== 'object' || !league.id || !league.api_id) {
        // Log the actual value received
        console.error("Failed to get valid league object from ensureLeagueExists:", league);
        throw new Error(`Failed to ensure league ${leagueApiId} exists in the database.`);
    }

    // 2. Fetch and store teams for this specific league
    await fetchAndStoreTeams(league);

    // 3. Fetch and store fixtures for this specific league
    await fetchAndStoreFixtures(league);

    // 4. Fetch and store team statistics for this specific league
    await fetchAndStoreTeamStats(league);

    // 5. Update enhanced matches (using stats, omitting tactical for now)
    await updateEnhancedMatches(league); 

    // 6. Make predictions (using enhanced matches)
    await makePredictions(league); 

    // NOTE: Tactical step is still commented out
    // await updateTacticalMatchups(league); 

    console.log(`Data collection process completed successfully for league API ID: ${leagueApiId}!`);
    return new Response(
      JSON.stringify({ message: `Data collection process completed successfully for league API ID: ${leagueApiId}!` }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error(`Error during data collection process for league ${leagueApiId}:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});

