// Supabase Edge Function for scheduled data collection - Optimized + Tactical Data + Enhanced Predictions v4 (Debug Logging)
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
    // Construct query parameters string manually for fetch API
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
  const leagueName = Object.keys(LEAGUE_IDS).find((key) => LEAGUE_IDS[key] === leagueApiId) || `League ${leagueApiId}`;

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
  if (!league || typeof league !== "object" || !league.id || !league.api_id) {
    console.error("Invalid league object passed to fetchAndStoreTeams:", league);
    return; // Stop execution for this step if league object is invalid
  }
  console.log(`Fetching and storing team information for league: ${league.name} (API ID: ${league.api_id})...`);

  // Fetch teams for this specific league and season
  const teamsData = await makeApiRequest("teams", {
    league: league.api_id,
    season: CURRENT_SEASON,
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
        logo_url: team.logo,
      };

      if (!existingTeam) {
        // Insert team into database
        const { error: insertError } = await supabase.from("teams").insert(teamData);

        if (insertError) {
          console.error(`Error inserting team ${team.name} (API ID: ${team.id}): ${insertError.message}`);
        } else {
          console.log(`Added team: ${team.name} (API ID: ${team.id}) to league ${league.name}`);
        }
      } else {
        // Update team information (e.g., logo might change)
        const { error: updateError } = await supabase.from("teams").update(teamData).eq("api_id", team.id);

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
  if (!league || typeof league !== "object" || !league.id || !league.api_id) {
    console.error("Invalid league object passed to fetchAndStoreFixtures:", league);
    return; // Stop execution for this step if league object is invalid
  }
  console.log(`Fetching and storing fixture information for league: ${league.name} (API ID: ${league.api_id})...`);

  // Fetch fixtures for this specific league and season
  const fixturesData = await makeApiRequest("fixtures", {
    league: league.api_id,
    season: CURRENT_SEASON,
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
        console.warn(
          `Could not find one or both teams in DB for fixture API ID ${fixtureInfo.id}. Home API ID: ${teamsInfo.home.id} (Found: ${!!homeTeam}), Away API ID: ${teamsInfo.away.id} (Found: ${!!awayTeam}). Skipping fixture.`
        );
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
        api_id: fixtureInfo.id,
      };

      if (!existingFixture) {
        const { error: insertError } = await supabase.from("fixtures").insert(fixtureData);

        if (insertError) {
          console.error(`Error inserting fixture ${fixtureInfo.id}: ${insertError.message}`);
        } else {
          console.log(`Added fixture: ${teamsInfo.home.name} vs ${teamsInfo.away.name} (API ID: ${fixtureInfo.id})`);
        }
      } else {
        const { error: updateError } = await supabase.from("fixtures").update(fixtureData).eq("api_id", fixtureInfo.id);

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
  if (!league || typeof league !== "object" || !league.id || !league.api_id) {
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

      const teamStatsData = {
        team_id: team.id, // Use internal team ID
        season: CURRENT_SEASON,
        elo_rating: eloRating,
        goals_scored: stats.goals?.for?.total?.total || 0,
        goals_conceded: stats.goals?.against?.total?.total || 0,
        points_per_game: ppg,
      };

      // Upsert team stats (insert if not exist, update if exist)
      const { error: upsertError } = await supabase.from("team_stats").upsert(teamStatsData, { onConflict: "team_id, season" }); // Define conflict target

      if (upsertError) {
        console.error(`Error upserting team stats for team ${team.id}: ${upsertError.message}`);
      } else {
        console.log(`Upserted team stats for: ${team.name}`);
      }
    } else {
      console.log(`Failed to fetch statistics for team: ${team.name} (API ID: ${team.api_id})`);
    }
    // Add a small delay between team requests
    await new Promise((resolve) => setTimeout(resolve, 300)); // Slightly shorter delay ok here
  }
}

// --- Enhanced Matches (Fix for .in() filter TypeError) ---
async function updateEnhancedMatches(league) {
  if (!league || typeof league !== "object" || !league.id) {
    console.error("Invalid league object passed to updateEnhancedMatches:", league);
    return;
  }
  console.log(`Updating enhanced match data for league: ${league.name}...`);

  // **FIX:** Step 1: Get all fixture IDs for the league first
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

  // **FIX:** Step 2: Get IDs of fixtures in this league that *already* have enhanced data, using the fetched IDs
  const { data: existingEnhancedFixtureIdsData, error: existingEnhancedError } = await supabase
    .from("enhanced_matches")
    .select("fixture_id")
    .in("fixture_id", leagueFixtureIds); // Use the array of IDs

  if (existingEnhancedError) {
    console.error(`Error fetching existing enhanced match fixture IDs for league ${league.id}: ${existingEnhancedError.message}`);
    return;
  }
  const existingEnhancedFixtureIds = existingEnhancedFixtureIdsData.map((item) => item.fixture_id);
  console.log(`Found ${existingEnhancedFixtureIds.length} existing enhanced matches for league ${league.name}.`);

  // **FIX:** Step 3: Determine which fixture IDs from the league *need* processing
  const fixturesToProcessIds = leagueFixtureIds.filter(id => !existingEnhancedFixtureIds.includes(id));
  if (fixturesToProcessIds.length === 0) {
      console.log(`All fixtures for league ${league.name} already have enhanced data.`);
      return;
  }
  console.log(`Found ${fixturesToProcessIds.length} fixtures needing enhanced data for league ${league.name}.`);

  // **FIX:** Step 4: Fetch the full fixture data only for those needing processing
  const { data: fixturesToProcess, error: fixturesError } = await supabase
    .from("fixtures")
    .select("*, home_team_id(id, name), away_team_id(id, name)") // Fetch related team data
    .in("id", fixturesToProcessIds); // Use the filtered array of IDs

  if (fixturesError) {
    console.error(`Error fetching full fixture data for processing in league ${league.id}: ${fixturesError.message}`);
    return;
  }

  // Process each fixture
  let processedCount = 0; // **DEBUG:** Add counter
  for (const fixture of fixturesToProcess) {
    try { // Add try-catch around the loop body for individual fixture errors
        // **DEBUG:** Log progress every 50 fixtures
        if (processedCount % 50 === 0) {
            console.log(`Processing enhanced data for fixture ${processedCount + 1}/${fixturesToProcess.length} (ID: ${fixture.id})...`);
        }

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

        // Fetch tactical vectors (using team name for lookup)
        const { data: homeVectors, error: homeVectorsError } = await supabase
          .from("manager_tactical_vectors")
          .select("*")
          .eq("team_name", fixture.home_team_id.name)
          .eq("season", CURRENT_SEASON)
          .maybeSingle();

        const { data: awayVectors, error: awayVectorsError } = await supabase
          .from("manager_tactical_vectors")
          .select("*")
          .eq("team_name", fixture.away_team_id.name)
          .eq("season", CURRENT_SEASON)
          .maybeSingle();

        if (homeStatsError || awayStatsError || homeVectorsError || awayVectorsError) {
          // Log specific errors but continue if possible
          if (homeStatsError) console.error(`Error fetching home stats for fixture ${fixture.id}: ${homeStatsError.message}`);
          if (awayStatsError) console.error(`Error fetching away stats for fixture ${fixture.id}: ${awayStatsError.message}`);
          if (homeVectorsError) console.error(`Error fetching home vectors for fixture ${fixture.id}: ${homeVectorsError.message}`);
          if (awayVectorsError) console.error(`Error fetching away vectors for fixture ${fixture.id}: ${awayVectorsError.message}`);
          // Only continue if stats are missing, as they are crucial
          if (!homeStats || !awayStats) {
              console.log(`Missing crucial team stats for enhanced match ${fixture.id}. Skipping.`);
              processedCount++; // **DEBUG:** Increment counter even if skipped
              continue;
          }
        }

        // Calculate tactical metrics - Handle missing vectors
        let cosineSimilarity = 0;
        let pressingMismatch = 0;

        if (homeVectors && awayVectors) {
            // Define which vector components to use for similarity
            const vectorKeys = [
              "pressing_intensity_normalized",
              "possession_control_normalized",
              "counter_attack_focus_normalized",
              "attack_tempo_normalized",
              "defensive_line_height_normalized",
            ];
            try {
                const homeVec = vectorKeys.map(key => homeVectors[key]);
                const awayVec = vectorKeys.map(key => awayVectors[key]);
                cosineSimilarity = calculateCosineSimilarity(homeVec, awayVec);
                pressingMismatch = Math.abs((homeVectors.pressing_intensity_normalized || 0) - (awayVectors.pressing_intensity_normalized || 0));
            } catch (e) {
                console.error(`Error calculating tactical metrics for fixture ${fixture.id}: ${e.message}. Using defaults.`);
                cosineSimilarity = 0;
                pressingMismatch = 0;
            }
        } else {
            // Use console.warn for non-fatal issues
            console.warn(`Missing tactical vectors for one or both teams in fixture ${fixture.id}. Using default tactical metrics (0).`);
            // Default values are already set
        }

        // Combine data into enhanced_matches format
        const enhancedData = {
          fixture_id: fixture.id,
          home_team_elo: homeStats?.elo_rating || 1500, // Use default if stats somehow missing after check
          away_team_elo: awayStats?.elo_rating || 1500,
          home_ppg: homeStats?.points_per_game || 0,
          away_ppg: awayStats?.points_per_game || 0,
          cosine_similarity: cosineSimilarity,
          pressing_mismatch: pressingMismatch,
          match_date: fixture.match_date,
          status: fixture.status,
        };

        const { error: upsertError } = await supabase.from("enhanced_matches").upsert(enhancedData, { onConflict: "fixture_id" });
        if (upsertError) {
          console.error(`Error upserting enhanced match data for fixture ${fixture.id}: ${upsertError.message}`);
        } else {
          // **DEBUG:** Log successful processing, maybe less frequently?
          // console.log(`Processed enhanced match data (Tactics: ${homeVectors && awayVectors ? 'Yes' : 'No'}) for fixture ${fixture.id}`);
        }
    } catch (loopError) {
        console.error(`Caught error processing fixture ID ${fixture.id} in updateEnhancedMatches loop: ${loopError.message}`);
        // Continue to the next fixture
    }
    processedCount++; // **DEBUG:** Increment counter
    await new Promise((resolve) => setTimeout(resolve, 50)); // Shorter delay ok
  }
  console.log(`Finished processing ${processedCount} enhanced matches for league ${league.name}.`); // **DEBUG:** Log completion
}

// --- Predictions (Now uses enhanced data with tactical metrics) ---
async function makePredictions(league) {
  if (!league || typeof league !== "object" || !league.id) {
    console.error("Invalid league object passed to makePredictions:", league);
    return;
  }
  console.log(`Making predictions for upcoming matches in league: ${league.name}...`);

  // Fetch enhanced match data (including tactical metrics) for fixtures in this league that are 'Not Started' (NS)
  // **FIX:** Need to fetch fixture IDs first, then query enhanced_matches
  const { data: upcomingFixtureIdsData, error: upcomingFixtureIdsError } = await supabase
    .from("fixtures")
    .select("id")
    .eq("league_id", league.id)
    .eq("status", "NS"); // Filter for 'Not Started' matches

  if (upcomingFixtureIdsError) {
    console.error(`Error fetching upcoming fixture IDs for prediction in league ${league.id}: ${upcomingFixtureIdsError.message}`);
    return;
  }
  const upcomingFixtureIds = upcomingFixtureIdsData.map(item => item.id);
  if (upcomingFixtureIds.length === 0) {
      console.log(`No upcoming matches found needing prediction for league ${league.name}.`);
      return;
  }

  // Now fetch enhanced data for these specific upcoming fixtures
  const { data: upcomingMatches, error: fetchError } = await supabase
    .from("enhanced_matches")
    .select("*, fixture_id!inner(id, api_id, league_id, home_team_id(name), away_team_id(name))") // Use inner join to get fixture details
    .in("fixture_id", upcomingFixtureIds); // Filter by the upcoming fixture IDs

  if (fetchError) {
    console.error(`Error fetching enhanced data for upcoming matches in league ${league.id}: ${fetchError.message}`);
    return;
  }

  if (!upcomingMatches || upcomingMatches.length === 0) {
    console.log(`No enhanced data found for upcoming matches in league ${league.name}. Ensure enhanced_matches step ran successfully.`);
    return;
  }

  console.log(`Found ${upcomingMatches.length} upcoming matches with enhanced data to predict for league ${league.name}.`);

  let predictedCount = 0; // **DEBUG:** Add counter
  for (const match of upcomingMatches) {
    try { // Add try-catch around the loop body
        // **DEBUG:** Log progress every 50 predictions
        if (predictedCount % 50 === 0) {
            console.log(`Processing prediction ${predictedCount + 1}/${upcomingMatches.length} (Fixture ID: ${match.fixture_id.id})...`);
        }

        // Enhanced prediction using Elo and tactical metrics
        const homeElo = match.home_team_elo || 1500;
        const awayElo = match.away_team_elo || 1500;
        const eloDiff = homeElo - awayElo;
        const cosineSimilarity = match.cosine_similarity || 0; // Default to 0 if null
        const pressingMismatch = match.pressing_mismatch || 0; // Default to 0 if null

        // Base probabilities
        let homeWinProb = 0.33;
        let drawProb = 0.34;
        let awayWinProb = 0.33;

        // 1. Adjust based on Elo difference
        const eloProbShift = Math.min(Math.abs(eloDiff) / 400 * 0.3, 0.3); // Max 30% shift based on Elo
        if (eloDiff > 50) { // Home team favored by Elo
            homeWinProb += eloProbShift;
            awayWinProb -= eloProbShift / 2;
            drawProb -= eloProbShift / 2;
        } else if (eloDiff < -50) { // Away team favored by Elo
            awayWinProb += eloProbShift;
            homeWinProb -= eloProbShift / 2;
            drawProb -= eloProbShift / 2;
        }

        // 2. Adjust based on tactical similarity (cosine similarity)
        // Higher similarity slightly increases draw probability
        const similarityAdjustment = (cosineSimilarity - 0.5) * 0.05; // Small adjustment (max +/- 2.5%)
        drawProb += similarityAdjustment;
        homeWinProb -= similarityAdjustment / 2;
        awayWinProb -= similarityAdjustment / 2;

        // 3. Adjust based on pressing mismatch (placeholder logic)
        // Assuming higher pressing intensity is generally advantageous
        // This requires knowing which team has higher pressing intensity from the original vectors, not just the mismatch value.
        // For now, we'll skip this adjustment as it needs more context.
        // const pressingAdjustment = pressingMismatch * 0.02; // Example: Small adjustment based on mismatch magnitude
        // // Need logic here to determine which team benefits from the mismatch

        // Normalize probabilities
        let totalProb = homeWinProb + drawProb + awayWinProb;
        homeWinProb = Math.max(0.01, homeWinProb / totalProb); // Ensure non-negative and non-zero
        drawProb = Math.max(0.01, drawProb / totalProb);
        awayWinProb = Math.max(0.01, awayWinProb / totalProb);
        // Re-normalize after ensuring non-negative
        totalProb = homeWinProb + drawProb + awayWinProb;
        if (totalProb > 0) {
            homeWinProb /= totalProb;
            drawProb /= totalProb;
            awayWinProb /= totalProb;
        }

        // Determine predicted outcome based on highest probability
        let predictedOutcome = "Draw";
        if (homeWinProb > awayWinProb && homeWinProb > drawProb) {
            predictedOutcome = "Home Win";
        } else if (awayWinProb > homeWinProb && awayWinProb > drawProb) {
            predictedOutcome = "Away Win";
        }

        const predictionData = {
          fixture_id: match.fixture_id.id,
          predicted_outcome: predictedOutcome,
          home_win_probability: homeWinProb,
          draw_probability: drawProb,
          away_win_probability: awayWinProb,
          prediction_date: new Date().toISOString(),
        };

        // Upsert prediction into the database
        const { error: upsertError } = await supabase.from("predictions").upsert(predictionData, { onConflict: "fixture_id" }); // Update if prediction for this fixture already exists

        if (upsertError) {
          console.error(`Error saving prediction for fixture ${match.fixture_id.id}: ${upsertError.message}`);
        } else {
          // **DEBUG:** Log successful prediction, maybe less frequently?
          // console.log(
          //   `Prediction saved for fixture ${match.fixture_id.id}: ${match.fixture_id.home_team_id.name} vs ${match.fixture_id.away_team_id.name} -> ${predictedOutcome} (H: ${homeWinProb.toFixed(3)}, D: ${drawProb.toFixed(3)}, A: ${awayWinProb.toFixed(3)})`
          // );
        }
    } catch (loopError) {
        console.error(`Caught error processing prediction for fixture ID ${match.fixture_id?.id} in makePredictions loop: ${loopError.message}`);
        // Continue to the next prediction
    }
    predictedCount++; // **DEBUG:** Increment counter
    await new Promise((resolve) => setTimeout(resolve, 50)); // Shorter delay ok
  }
  console.log(`Finished processing ${predictedCount} predictions for league ${league.name}.`); // **DEBUG:** Log completion
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
    return new Response(JSON.stringify({ error: `Invalid or missing league_api_id. Provide one of: ${Object.values(LEAGUE_IDS).join(", ")}` }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  try {
    console.log(`Data collection process started for league API ID: ${leagueApiId}...`);

    // 1. Ensure the specified league exists in the DB and get its internal ID
    console.time("ensureLeagueExists"); // **DEBUG:** Start timer
    const league = await ensureLeagueExists(leagueApiId);
    console.timeEnd("ensureLeagueExists"); // **DEBUG:** End timer
    // **FIX:** Check if league object is valid before proceeding
    if (!league || typeof league !== "object" || !league.id || !league.api_id) {
      // Log the actual value received
      console.error("Failed to get valid league object from ensureLeagueExists:", league);
      throw new Error(`Failed to ensure league ${leagueApiId} exists in the database.`);
    }

    // 2. Fetch and store teams for this specific league
    console.time("fetchAndStoreTeams"); // **DEBUG:** Start timer
    await fetchAndStoreTeams(league);
    console.timeEnd("fetchAndStoreTeams"); // **DEBUG:** End timer

    // 3. Fetch and store fixtures for this specific league
    console.time("fetchAndStoreFixtures"); // **DEBUG:** Start timer
    await fetchAndStoreFixtures(league);
    console.timeEnd("fetchAndStoreFixtures"); // **DEBUG:** End timer

    // 4. Fetch and store team statistics for this specific league
    console.time("fetchAndStoreTeamStats"); // **DEBUG:** Start timer
    await fetchAndStoreTeamStats(league);
    console.timeEnd("fetchAndStoreTeamStats"); // **DEBUG:** End timer

    // 5. Update enhanced matches (using stats AND tactical data)
    console.time("updateEnhancedMatches"); // **DEBUG:** Start timer
    await updateEnhancedMatches(league);
    console.timeEnd("updateEnhancedMatches"); // **DEBUG:** End timer

    // 6. Make predictions (using enhanced matches with tactical data)
    console.time("makePredictions"); // **DEBUG:** Start timer
    await makePredictions(league);
    console.timeEnd("makePredictions"); // **DEBUG:** End timer

    console.log(`Data collection process completed successfully for league API ID: ${leagueApiId}!`);
    return new Response(JSON.stringify({ message: `Data collection process completed successfully for league API ID: ${leagueApiId}!` }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(`Error during data collection process for league ${leagueApiId}:`, error);
    // Log the specific error that caused the catch block
    console.error("Caught error details:", error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

