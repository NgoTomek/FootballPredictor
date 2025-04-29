// Supabase Edge Function for scheduled data collection - Optimized + Tactical Data + Enhanced Predictions v5 (Batching + Safeguards)
// This file should be deployed to your Supabase project as an Edge Function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { load } from "https://deno.land/std@0.177.0/dotenv/mod.ts";

// Load environment variables
const env = await load();

// Supabase client initialization
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://tuuadmjplkzceervaezn.supabase.co";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

// API-Football configuration
const API_FOOTBALL_KEY = Deno.env.get("API_FOOTBALL_KEY") || "d070ca9b94693a8b8ff9e0a380400511"; // Use environment variable
const API_FOOTBALL_URL = "https://v3.football.api-sports.io";

// League IDs mapping (used for reference, not iteration)
const LEAGUE_IDS = {
  "Premier League": 39,
  "La Liga": 140,
  "Serie A": 135,
  "Bundesliga": 78,
  "Ligue 1": 61,
};

// Current season (as integer)
const CURRENT_SEASON = 2024;

// Batch size for Supabase operations
const BATCH_SIZE = 100;

// Helper function for cosine similarity
function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0; // Return 0 if vectors are invalid or different lengths
  }
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
    magnitudeA += (vecA[i] || 0) ** 2;
    magnitudeB += (vecB[i] || 0) ** 2;
  }
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0; // Avoid division by zero
  }
  return dotProduct / (magnitudeA * magnitudeB);
}

async function logApiCall(endpoint, parameters, statusCode, responseSize, executionTime) {
  try {
    await supabase.from("api_logs").insert({
      endpoint: endpoint,
      parameters: parameters,
      status_code: statusCode,
      response_size: responseSize,
      execution_time: executionTime,
    });
  } catch (e) {
    console.error(`Error logging API call: ${e}`);
  }
}

async function makeApiRequest(endpoint, params = {}) {
  const url = `${API_FOOTBALL_URL}/${endpoint}`;
  const headers = {
    "x-rapidapi-key": API_FOOTBALL_KEY,
    "x-rapidapi-host": "v3.football.api-sports.io",
  };

  const startTime = Date.now();

  try {
    const queryParams = new URLSearchParams(params).toString();
    const requestUrl = queryParams ? `${url}?${queryParams}` : url;

    console.log(`Making API request to: ${requestUrl}`);
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: headers,
    });

    const responseSize = parseInt(response.headers.get("content-length") || "0");
    const statusCode = response.status;
    const executionTime = (Date.now() - startTime) / 1000;

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
  const leagueName = Object.keys(LEAGUE_IDS).find((key) => LEAGUE_IDS[key] === leagueApiId) || `League ${leagueApiId}`;

  const { data: existingLeague, error: checkError } = await supabase
    .from("leagues")
    .select("id, name, api_id")
    .eq("api_id", leagueApiId)
    .maybeSingle();

  if (checkError) {
    console.error(`Error checking league ${leagueName}: ${checkError.message}`);
    return null;
  }

  if (!existingLeague) {
    const { data: insertedLeague, error: insertError } = await supabase
      .from("leagues")
      .insert({ name: leagueName, api_id: leagueApiId })
      .select("id, name, api_id")
      .single();

    if (insertError) {
      console.error(`Error inserting league ${leagueName}: ${insertError.message}`);
      return null;
    } else {
      console.log(`Added league: ${leagueName}`);
      return insertedLeague;
    }
  } else {
    console.log(`League ${leagueName} already exists.`);
    return existingLeague;
  }
}

// --- Performance Optimization: Batch Upsert Helper ---
async function batchUpsert(tableName, data, conflictColumn) {
  if (!data || data.length === 0) return;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    console.log(`Upserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(data.length / BATCH_SIZE)} to ${tableName}...`);
    const { error } = await supabase.from(tableName).upsert(batch, { onConflict: conflictColumn });
    if (error) {
      console.error(`Error upserting batch to ${tableName}: ${error.message}`);
      // Optionally, try individual upserts for the failed batch for more granular error reporting
      // for (const item of batch) {
      //   const { error: singleError } = await supabase.from(tableName).upsert(item, { onConflict: conflictColumn });
      //   if (singleError) console.error(`Error upserting single item to ${tableName} (ID: ${item[conflictColumn]}): ${singleError.message}`);
      // }
    }
  }
}

// Optimized: Fetch and store teams using batch upsert
async function fetchAndStoreTeams(league) {
  if (!league || typeof league !== "object" || !league.id || !league.api_id) {
    console.error("Invalid league object passed to fetchAndStoreTeams:", league);
    return;
  }
  console.log(`Fetching team information for league: ${league.name} (API ID: ${league.api_id})...`);

  const teamsData = await makeApiRequest("teams", {
    league: league.api_id,
    season: CURRENT_SEASON,
  });

  if (teamsData && teamsData.results > 0) {
    const teamsToUpsert = teamsData.response.map(teamInfo => ({
      name: teamInfo.team.name,
      api_id: teamInfo.team.id,
      league_id: league.id,
      logo_url: teamInfo.team.logo,
    }));

    console.log(`Preparing to upsert ${teamsToUpsert.length} teams for league ${league.name}...`);
    await batchUpsert("teams", teamsToUpsert, "api_id");
    console.log(`Finished upserting teams for league ${league.name}.`);

  } else {
    console.log(`No teams found or error fetching teams for league: ${league.name} (API ID: ${league.api_id})`);
  }
}

// Optimized: Fetch and store fixtures using batch upsert
async function fetchAndStoreFixtures(league) {
  if (!league || typeof league !== "object" || !league.id || !league.api_id) {
    console.error("Invalid league object passed to fetchAndStoreFixtures:", league);
    return;
  }
  console.log(`Fetching fixture information for league: ${league.name} (API ID: ${league.api_id})...`);

  const fixturesData = await makeApiRequest("fixtures", {
    league: league.api_id,
    season: CURRENT_SEASON,
  });

  if (fixturesData && fixturesData.results > 0) {
    // Fetch all team API ID to internal ID mappings for this league once
    const { data: teamsMapData, error: teamsMapError } = await supabase
      .from("teams")
      .select("id, api_id")
      .eq("league_id", league.id);

    if (teamsMapError) {
      console.error(`Error fetching team map for league ${league.id}: ${teamsMapError.message}`);
      return;
    }
    const teamApiIdToInternalId = teamsMapData.reduce((map, team) => {
      map[team.api_id] = team.id;
      return map;
    }, {});

    const fixturesToUpsert = [];
    for (const fixture of fixturesData.response) {
      const fixtureInfo = fixture.fixture;
      const teamsInfo = fixture.teams;
      const goalsInfo = fixture.goals;

      const homeTeamInternalId = teamApiIdToInternalId[teamsInfo.home.id];
      const awayTeamInternalId = teamApiIdToInternalId[teamsInfo.away.id];

      if (!homeTeamInternalId || !awayTeamInternalId) {
        console.warn(
          `Could not find internal ID for one or both teams in fixture API ID ${fixtureInfo.id}. Home API ID: ${teamsInfo.home.id}, Away API ID: ${teamsInfo.away.id}. Skipping fixture.`
        );
        continue;
      }

      fixturesToUpsert.push({
        home_team_id: homeTeamInternalId,
        away_team_id: awayTeamInternalId,
        league_id: league.id,
        season: CURRENT_SEASON,
        match_date: fixtureInfo.date,
        home_score: goalsInfo.home,
        away_score: goalsInfo.away,
        status: fixtureInfo.status.short,
        api_id: fixtureInfo.id,
      });
    }

    console.log(`Preparing to upsert ${fixturesToUpsert.length} fixtures for league ${league.name}...`);
    await batchUpsert("fixtures", fixturesToUpsert, "api_id");
    console.log(`Finished upserting fixtures for league ${league.name}.`);

  } else {
    console.log(`No fixtures found or error fetching fixtures for league: ${league.name} (API ID: ${league.api_id})`);
  }
}

// Optimized: Fetch and store team stats using batch upsert
async function fetchAndStoreTeamStats(league) {
  if (!league || typeof league !== "object" || !league.id || !league.api_id) {
    console.error("Invalid league object passed to fetchAndStoreTeamStats:", league);
    return;
  }
  console.log(`Fetching team statistics for league: ${league.name} (API ID: ${league.api_id})...`);

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, api_id, name")
    .eq("league_id", league.id);

  if (teamsError) {
    console.error(`Error fetching teams from DB for league ${league.name}: ${teamsError.message}`);
    return;
  }

  if (!teams || teams.length === 0) {
    console.log(`No teams found in DB for league ${league.name} to fetch stats for.`);
    return;
  }

  const teamStatsToUpsert = [];
  for (const team of teams) {
    const statsData = await makeApiRequest("teams/statistics", {
      team: team.api_id,
      league: league.api_id,
      season: CURRENT_SEASON,
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

      teamStatsToUpsert.push({
        team_id: team.id,
        season: CURRENT_SEASON,
        elo_rating: eloRating,
        goals_scored: stats.goals?.for?.total?.total || 0,
        goals_conceded: stats.goals?.against?.total?.total || 0,
        points_per_game: ppg,
      });
      console.log(`Fetched stats for: ${team.name}`);
    } else {
      console.log(`Failed to fetch statistics for team: ${team.name} (API ID: ${team.api_id})`);
    }
    // Removed delay between team requests for performance
    // await new Promise((resolve) => setTimeout(resolve, 300));
  }

  console.log(`Preparing to upsert ${teamStatsToUpsert.length} team stats records for league ${league.name}...`);
  await batchUpsert("team_stats", teamStatsToUpsert, "team_id, season"); // Use composite key for conflict
  console.log(`Finished upserting team stats for league ${league.name}.`);
}

// Optimized: Update enhanced matches using batch upsert
async function updateEnhancedMatches(league) {
  if (!league || typeof league !== "object" || !league.id) {
    console.error("Invalid league object passed to updateEnhancedMatches:", league);
    return;
  }
  console.log(`Updating enhanced match data for league: ${league.name}...`);

  // Fetch all fixture IDs for the league
  const { data: leagueFixtureIdsData, error: leagueFixtureIdsError } = await supabase
    .from("fixtures")
    .select("id")
    .eq("league_id", league.id);

  if (leagueFixtureIdsError) {
    console.error(`Error fetching fixture IDs for league ${league.id}: ${leagueFixtureIdsError.message}`);
    return;
  }
  const leagueFixtureIds = leagueFixtureIdsData.map((item) => item.id);
  if (leagueFixtureIds.length === 0) {
      console.log(`No fixtures found in DB for league ${league.name} to enhance.`);
      return;
  }

  // Fetch IDs of fixtures already enhanced
  const { data: existingEnhancedFixtureIdsData, error: existingEnhancedError } = await supabase
    .from("enhanced_matches")
    .select("fixture_id")
    .in("fixture_id", leagueFixtureIds);

  if (existingEnhancedError) {
    console.error(`Error fetching existing enhanced match fixture IDs for league ${league.id}: ${existingEnhancedError.message}`);
    return;
  }
  const existingEnhancedFixtureIds = new Set(existingEnhancedFixtureIdsData.map((item) => item.fixture_id)); // Use Set for faster lookups
  console.log(`Found ${existingEnhancedFixtureIds.size} existing enhanced matches for league ${league.name}.`);

  // Determine fixtures needing processing
  const fixturesToProcessIds = leagueFixtureIds.filter(id => !existingEnhancedFixtureIds.has(id));
  if (fixturesToProcessIds.length === 0) {
      console.log(`All fixtures for league ${league.name} already have enhanced data.`);
      return;
  }
  console.log(`Found ${fixturesToProcessIds.length} fixtures needing enhanced data for league ${league.name}.`);

  // Fetch full fixture data for processing in batches to avoid large payloads
  const enhancedMatchesToUpsert = [];
  for (let i = 0; i < fixturesToProcessIds.length; i += BATCH_SIZE) {
    const batchIds = fixturesToProcessIds.slice(i, i + BATCH_SIZE);
    console.log(`Fetching fixture details batch ${i / BATCH_SIZE + 1} for enhanced data...`);

    const { data: fixturesBatch, error: fixturesError } = await supabase
      .from("fixtures")
      .select("*, home_team_id(id, name), away_team_id(id, name)")
      .in("id", batchIds);

    if (fixturesError) {
      console.error(`Error fetching fixture batch for processing in league ${league.id}: ${fixturesError.message}`);
      continue; // Skip this batch
    }

    // Fetch related data (team stats and tactical vectors) for the batch
    const teamIds = new Set([...fixturesBatch.map(f => f.home_team_id.id), ...fixturesBatch.map(f => f.away_team_id.id)]);
    const teamNames = new Set([...fixturesBatch.map(f => f.home_team_id.name), ...fixturesBatch.map(f => f.away_team_id.name)]);

    const { data: statsData, error: statsError } = await supabase
      .from("team_stats")
      .select("*")
      .in("team_id", Array.from(teamIds))
      .eq("season", CURRENT_SEASON);

    const { data: vectorsData, error: vectorsError } = await supabase
      .from("manager_tactical_vectors")
      .select("*")
      .in("team_name", Array.from(teamNames))
      .eq("season", CURRENT_SEASON);

    if (statsError || vectorsError) {
        if (statsError) console.error(`Error fetching batch team stats: ${statsError.message}`);
        if (vectorsError) console.error(`Error fetching batch tactical vectors: ${vectorsError.message}`);
        // Continue processing fixtures individually if batch fetch fails?
        // For simplicity, we might skip the batch, but ideally handle this better.
        console.warn("Skipping batch due to error fetching related stats/vectors.");
        continue;
    }

    // Create maps for quick lookup
    const statsMap = statsData.reduce((map, stat) => { map[stat.team_id] = stat; return map; }, {});
    const vectorsMap = vectorsData.reduce((map, vec) => { map[vec.team_name] = vec; return map; }, {});

    // Process each fixture in the batch
    for (const fixture of fixturesBatch) {
      try {
        const homeStats = statsMap[fixture.home_team_id.id];
        const awayStats = statsMap[fixture.away_team_id.id];
        const homeVectors = vectorsMap[fixture.home_team_id.name];
        const awayVectors = vectorsMap[fixture.away_team_id.name];

        if (!homeStats || !awayStats) {
          console.warn(`Missing crucial team stats for enhanced match ${fixture.id}. Skipping.`);
          continue;
        }

        let cosineSimilarity = 0;
        let pressingMismatch = 0;

        if (homeVectors && awayVectors) {
          const vectorKeys = [
            "pressing_intensity_normalized", "possession_control_normalized", "counter_attack_focus_normalized",
            "attack_tempo_normalized", "defensive_line_height_normalized",
          ];
          try {
            const homeVec = vectorKeys.map(key => homeVectors[key]);
            const awayVec = vectorKeys.map(key => awayVectors[key]);
            cosineSimilarity = calculateCosineSimilarity(homeVec, awayVec);
            pressingMismatch = Math.abs((homeVectors.pressing_intensity_normalized || 0) - (awayVectors.pressing_intensity_normalized || 0));
          } catch (e) {
            console.error(`Error calculating tactical metrics for fixture ${fixture.id}: ${e.message}. Using defaults.`);
          }
        } else {
          console.warn(`Missing tactical vectors for one or both teams in fixture ${fixture.id}. Using default tactical metrics (0).`);
        }

        enhancedMatchesToUpsert.push({
          fixture_id: fixture.id,
          home_team_elo: homeStats.elo_rating || 1500,
          away_team_elo: awayStats.elo_rating || 1500,
          home_ppg: homeStats.points_per_game || 0,
          away_ppg: awayStats.points_per_game || 0,
          cosine_similarity: cosineSimilarity,
          pressing_mismatch: pressingMismatch,
          match_date: fixture.match_date,
          status: fixture.status,
        });
      } catch (loopError) {
        console.error(`Caught error processing fixture ID ${fixture.id} in updateEnhancedMatches loop: ${loopError.message}`);
      }
    }
  }

  console.log(`Preparing to upsert ${enhancedMatchesToUpsert.length} enhanced match records for league ${league.name}...`);
  await batchUpsert("enhanced_matches", enhancedMatchesToUpsert, "fixture_id");
  console.log(`Finished processing enhanced matches for league ${league.name}.`);
}

// Optimized: Make predictions using batch upsert
async function makePredictions(league) {
  if (!league || typeof league !== "object" || !league.id) {
    console.error("Invalid league object passed to makePredictions:", league);
    return;
  }
  console.log(`Making predictions for upcoming matches in league: ${league.name}...`);

  // Fetch upcoming fixture IDs
  const { data: upcomingFixtureIdsData, error: upcomingFixtureIdsError } = await supabase
    .from("fixtures")
    .select("id")
    .eq("league_id", league.id)
    .eq("status", "NS");

  if (upcomingFixtureIdsError) {
    console.error(`Error fetching upcoming fixture IDs for prediction in league ${league.id}: ${upcomingFixtureIdsError.message}`);
    return;
  }
  const upcomingFixtureIds = upcomingFixtureIdsData.map(item => item.id);
  if (upcomingFixtureIds.length === 0) {
      console.log(`No upcoming matches found needing prediction for league ${league.name}.`);
      return;
  }

  // Fetch enhanced data for these upcoming fixtures in batches
  const predictionsToUpsert = [];
  for (let i = 0; i < upcomingFixtureIds.length; i += BATCH_SIZE) {
      const batchIds = upcomingFixtureIds.slice(i, i + BATCH_SIZE);
      console.log(`Fetching enhanced data batch ${i / BATCH_SIZE + 1} for predictions...`);

      const { data: upcomingMatchesBatch, error: fetchError } = await supabase
        .from("enhanced_matches")
        .select("*, fixture_id!inner(id, api_id, league_id, home_team_id(name), away_team_id(name))")
        .in("fixture_id", batchIds);

      if (fetchError) {
        console.error(`Error fetching enhanced data batch for upcoming matches in league ${league.id}: ${fetchError.message}`);
        continue; // Skip this batch
      }

      if (!upcomingMatchesBatch || upcomingMatchesBatch.length === 0) {
        console.log(`No enhanced data found for batch ${i / BATCH_SIZE + 1} of upcoming matches.`);
        continue;
      }

      console.log(`Processing ${upcomingMatchesBatch.length} predictions for batch ${i / BATCH_SIZE + 1}...`);

      for (const match of upcomingMatchesBatch) {
        try {
          const homeElo = match.home_team_elo || 1500;
          const awayElo = match.away_team_elo || 1500;
          const eloDiff = homeElo - awayElo;
          const cosineSimilarity = match.cosine_similarity || 0;
          const pressingMismatch = match.pressing_mismatch || 0;

          let homeWinProb = 0.33, drawProb = 0.34, awayWinProb = 0.33;
          const eloProbShift = Math.min(Math.abs(eloDiff) / 400 * 0.3, 0.3);
          if (eloDiff > 50) {
              homeWinProb += eloProbShift; awayWinProb -= eloProbShift / 2; drawProb -= eloProbShift / 2;
          } else if (eloDiff < -50) {
              awayWinProb += eloProbShift; homeWinProb -= eloProbShift / 2; drawProb -= eloProbShift / 2;
          }
          const similarityAdjustment = (cosineSimilarity - 0.5) * 0.05;
          drawProb += similarityAdjustment; homeWinProb -= similarityAdjustment / 2; awayWinProb -= similarityAdjustment / 2;

          let totalProb = homeWinProb + drawProb + awayWinProb;
          homeWinProb = Math.max(0.01, homeWinProb / totalProb);
          drawProb = Math.max(0.01, drawProb / totalProb);
          awayWinProb = Math.max(0.01, awayWinProb / totalProb);
          totalProb = homeWinProb + drawProb + awayWinProb;
          if (totalProb > 0) {
              homeWinProb /= totalProb; drawProb /= totalProb; awayWinProb /= totalProb;
          }

          let predictedOutcome = "Draw";
          if (homeWinProb > awayWinProb && homeWinProb > drawProb) predictedOutcome = "Home Win";
          else if (awayWinProb > homeWinProb && awayWinProb > drawProb) predictedOutcome = "Away Win";

          predictionsToUpsert.push({
            fixture_id: match.fixture_id.id,
            model_name: "EloTacticsV1", // Added default model name
            predicted_outcome: predictedOutcome,
            home_win_probability: homeWinProb,
            draw_probability: drawProb,
            away_win_probability: awayWinProb,
            prediction_date: new Date().toISOString(),
          });
        } catch (loopError) {
          console.error(`Caught error processing prediction for fixture ID ${match.fixture_id?.id} in makePredictions loop: ${loopError.message}`);
        }
      }
  }

  console.log(`Preparing to upsert ${predictionsToUpsert.length} predictions for league ${league.name}...`);
  await batchUpsert("predictions", predictionsToUpsert, "fixture_id");
  console.log(`Finished processing predictions for league ${league.name}.`);
}

// Main function handler
serve(async (req) => {
  const overallStartTime = Date.now(); // **DEBUG:** Track overall time
  let leagueApiId = null;
  let status = 500; // Default to error
  let responseBody = { error: "An unexpected error occurred." };

  try {
    const requestBody = await req.json();
    leagueApiId = requestBody?.league_api_id ? parseInt(requestBody.league_api_id) : null;
  } catch (e) {
    console.log("No valid league_api_id found in request body.");
  }

  if (!leagueApiId || !Object.values(LEAGUE_IDS).includes(leagueApiId)) {
    console.error(`Invalid or missing league_api_id provided: ${leagueApiId}. Aborting.`);
    return new Response(JSON.stringify({ error: `Invalid or missing league_api_id. Provide one of: ${Object.values(LEAGUE_IDS).join(", ")}` }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  try {
    console.log(`Data collection process started for league API ID: ${leagueApiId}...`);

    console.time("ensureLeagueExists");
    const league = await ensureLeagueExists(leagueApiId);
    console.timeEnd("ensureLeagueExists");
    if (!league || typeof league !== "object" || !league.id || !league.api_id) {
      throw new Error(`Failed to ensure league ${leagueApiId} exists in the database.`);
    }

    console.time("fetchAndStoreTeams");
    await fetchAndStoreTeams(league);
    console.timeEnd("fetchAndStoreTeams");

    console.time("fetchAndStoreFixtures");
    await fetchAndStoreFixtures(league);
    console.timeEnd("fetchAndStoreFixtures");

    console.time("fetchAndStoreTeamStats");
    await fetchAndStoreTeamStats(league);
    console.timeEnd("fetchAndStoreTeamStats");

    console.time("updateEnhancedMatches");
    await updateEnhancedMatches(league);
    console.timeEnd("updateEnhancedMatches");

    console.time("makePredictions");
    await makePredictions(league);
    console.timeEnd("makePredictions");

    const overallEndTime = Date.now(); // **DEBUG:** End overall time
    const overallDuration = (overallEndTime - overallStartTime) / 1000;
    console.log(`Data collection process completed successfully for league API ID: ${leagueApiId} in ${overallDuration.toFixed(2)} seconds!`);

    // If all steps completed without throwing an error, set success status and message
    status = 200;
    responseBody = { message: `Data collection process completed successfully for league API ID: ${leagueApiId} in ${overallDuration.toFixed(2)} seconds!` };

  } catch (error) {
    // Error already logged within the catch block
    console.error(`Error during data collection process for league ${leagueApiId}:`, error);
    console.error("Caught error details:", error.message, error.stack);
    // Keep status 500 and set error message
    responseBody = { error: `Data collection failed for league ${leagueApiId}: ${error.message}` };

  } finally {
    // **Safeguard:** Always return a response, even if an error occurred
    console.log(`Returning response with status ${status} for league ${leagueApiId}.`);
    return new Response(JSON.stringify(responseBody), {
      headers: { "Content-Type": "application/json" },
      status: status,
    });
  }
});

