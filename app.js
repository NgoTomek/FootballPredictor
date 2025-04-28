// Initialize Supabase client
const supabaseUrl = 'https://tuuadmjplkzceervaezn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dWFkbWpwbGt6Y2VlcnZhZXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTExMTMsImV4cCI6MjA2MTQyNzExM30.Ql6Vy0-nrQMrMNBGXWUFwbvKdNOTjX-QwXJW2Csu9Oc';
const supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const leagueSelect = document.getElementById('leagueSelect');
const dateRangeSelect = document.getElementById('dateRangeSelect');
const loadMatchesBtn = document.getElementById('loadMatchesBtn');
const upcomingMatchesContainer = document.getElementById('upcomingMatchesContainer');
const homeTeamSelect = document.getElementById('homeTeamSelect');
const awayTeamSelect = document.getElementById('awayTeamSelect');
const customPredictionForm = document.getElementById('customPredictionForm');
const predictionResultContainer = document.getElementById('predictionResultContainer');

// Global variables
let allTeams = [];
let allManagers = [];
let allTacticalVectors = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load teams for the select dropdowns
        await loadTeams();
        
        // Set up event listeners
        loadMatchesBtn.addEventListener('click', loadUpcomingMatches);
        customPredictionForm.addEventListener('submit', handleCustomPrediction);
        
        // Load upcoming matches by default
        loadUpcomingMatches();
    } catch (error) {
        console.error('Error initializing application:', error);
        showError('Failed to initialize application. Please try again later.');
    }
});

// Load teams from Supabase
async function loadTeams() {
    try {
        // Show loading state
        homeTeamSelect.innerHTML = '<option value="">Loading teams...</option>';
        awayTeamSelect.innerHTML = '<option value="">Loading teams...</option>';
        
        // Fetch teams from Supabase
        const { data: teams, error } = await supabase
            .from('teams')
            .select(`
                id,
                name,
                logo_url,
                league_id,
                leagues(name)
            `)
            .order('name');
        
        if (error) throw error;
        
        // Store teams globally
        allTeams = teams;
        
        // Reset select options
        homeTeamSelect.innerHTML = '<option value="">Select Home Team</option>';
        awayTeamSelect.innerHTML = '<option value="">Select Away Team</option>';
        
        // Add team options to select dropdowns
        teams.forEach(team => {
            const leagueName = team.leagues ? ` (${team.leagues.name})` : '';
            const homeOption = document.createElement('option');
            homeOption.value = team.id;
            homeOption.textContent = team.name + leagueName;
            homeTeamSelect.appendChild(homeOption);
            
            const awayOption = document.createElement('option');
            awayOption.value = team.id;
            awayOption.textContent = team.name + leagueName;
            awayTeamSelect.appendChild(awayOption);
        });
        
        // Also fetch managers and tactical vectors for later use
        await loadManagersAndTacticalVectors();
    } catch (error) {
        console.error('Error loading teams:', error);
        homeTeamSelect.innerHTML = '<option value="">Error loading teams</option>';
        awayTeamSelect.innerHTML = '<option value="">Error loading teams</option>';
    }
}

// Load managers and tactical vectors
async function loadManagersAndTacticalVectors() {
    try {
        // Fetch managers
        const { data: managers, error: managersError } = await supabase
            .from('managers')
            .select('*');
        
        if (managersError) throw managersError;
        allManagers = managers;
        
        // Fetch tactical vectors
        const { data: tacticalVectors, error: vectorsError } = await supabase
            .from('tactical_vectors')
            .select('*');
        
        if (vectorsError) throw vectorsError;
        allTacticalVectors = tacticalVectors;
    } catch (error) {
        console.error('Error loading managers and tactical vectors:', error);
    }
}

// Load upcoming matches
async function loadUpcomingMatches() {
    try {
        // Show loading state
        upcomingMatchesContainer.innerHTML = `
            <div class="loading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        `;
        
        // Get selected league and date range
        const leagueId = leagueSelect.value;
        const daysAhead = parseInt(dateRangeSelect.value);
        
        // Calculate date range
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + daysAhead);
        
        // Format dates for query
        const todayStr = today.toISOString();
        const endDateStr = endDate.toISOString();
        
        // Build query
        let query = supabase
            .from('fixtures')
            .select(`
                id,
                match_date,
                status,
                home_team_id,
                away_team_id,
                home_score,
                away_score,
                home_team:home_team_id(id, name, logo_url),
                away_team:away_team_id(id, name, logo_url),
                league_id,
                leagues(name),
                predictions(home_win_probability, draw_probability, away_win_probability, predicted_result)
            `)
            .eq('status', 'NS') // Not Started
            .gte('match_date', todayStr)
            .lte('match_date', endDateStr)
            .order('match_date');
        
        // Add league filter if specified
        if (leagueId !== 'all') {
            query = query.eq('league_id', leagueId);
        }
        
        // Execute query
        const { data: fixtures, error } = await query;
        
        if (error) throw error;
        
        // Check if we have fixtures
        if (!fixtures || fixtures.length === 0) {
            upcomingMatchesContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="bi bi-info-circle"></i> No upcoming matches found for the selected criteria.
                </div>
            `;
            return;
        }
        
        // Render fixtures
        let fixturesHtml = '';
        
        fixtures.forEach(fixture => {
            const matchDate = new Date(fixture.match_date);
            const formattedDate = matchDate.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const homeTeam = fixture.home_team;
            const awayTeam = fixture.away_team;
            const leagueName = fixture.leagues ? fixture.leagues.name : 'Unknown League';
            
            // Get prediction if available
            let predictionHtml = '';
            if (fixture.predictions && fixture.predictions.length > 0) {
                const prediction = fixture.predictions[0];
                const homeWinProb = Math.round(prediction.home_win_probability * 100);
                const drawProb = Math.round(prediction.draw_probability * 100);
                const awayWinProb = Math.round(prediction.away_win_probability * 100);
                
                let resultText = '';
                let resultClass = '';
                
                if (prediction.predicted_result === 1) {
                    resultText = 'Home Win';
                    resultClass = 'text-primary';
                } else if (prediction.predicted_result === 0) {
                    resultText = 'Draw';
                    resultClass = 'text-secondary';
                } else {
                    resultText = 'Away Win';
                    resultClass = 'text-danger';
                }
                
                predictionHtml = `
                    <div class="mt-3">
                        <h6>Prediction: <span class="${resultClass}">${resultText}</span></h6>
                        <div class="progress mb-2" style="height: 10px;">
                            <div class="progress-bar progress-bar-home" role="progressbar" style="width: ${homeWinProb}%" title="Home Win: ${homeWinProb}%"></div>
                            <div class="progress-bar progress-bar-draw" role="progressbar" style="width: ${drawProb}%" title="Draw: ${drawProb}%"></div>
                            <div class="progress-bar progress-bar-away" role="progressbar" style="width: ${awayWinProb}%" title="Away Win: ${awayWinProb}%"></div>
                        </div>
                        <div class="d-flex justify-content-between small">
                            <span>${homeWinProb}%</span>
                            <span>${drawProb}%</span>
                            <span>${awayWinProb}%</span>
                        </div>
                    </div>
                `;
            } else {
                predictionHtml = `
                    <div class="mt-3">
                        <span class="badge bg-secondary">No prediction available</span>
                    </div>
                `;
            }
            
            fixturesHtml += `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card h-100">
                        <div class="card-header bg-light">
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="badge bg-primary">${leagueName}</span>
                                <span class="text-muted small">${formattedDate}</span>
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="row align-items-center mb-3">
                                <div class="col-4 text-center">
                                    <img src="${homeTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${homeTeam.name}" class="team-logo mb-2" style="width: 50px; height: 50px;">
                                    <h6 class="mb-0">${homeTeam.name}</h6>
                                </div>
                                <div class="col-4 text-center">
                                    <div class="vs-badge" style="width: 40px; height: 40px; font-size: 16px;">VS</div>
                                </div>
                                <div class="col-4 text-center">
                                    <img src="${awayTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${awayTeam.name}" class="team-logo mb-2" style="width: 50px; height: 50px;">
                                    <h6 class="mb-0">${awayTeam.name}</h6>
                                </div>
                            </div>
                            ${predictionHtml}
                        </div>
                        <div class="card-footer bg-white">
                            <button class="btn btn-outline-primary btn-sm w-100" onclick="showDetailedPrediction(${fixture.id})">
                                <i class="bi bi-graph-up"></i> Detailed Analysis
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        upcomingMatchesContainer.innerHTML = `
            <div class="row">
                ${fixturesHtml}
            </div>
        `;
    } catch (error) {
        console.error('Error loading upcoming matches:', error);
        upcomingMatchesContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Failed to load upcoming matches. Please try again later.
            </div>
        `;
    }
}

// Handle custom prediction form submission
async function handleCustomPrediction(event) {
    event.preventDefault();
    
    try {
        // Get selected teams
        const homeTeamId = homeTeamSelect.value;
        const awayTeamId = awayTeamSelect.value;
        
        // Validate selection
        if (!homeTeamId || !awayTeamId) {
            showError('Please select both home and away teams.');
            return;
        }
        
        if (homeTeamId === awayTeamId) {
            showError('Please select different teams for home and away.');
            return;
        }
        
        // Show loading state
        predictionResultContainer.style.display = 'block';
        predictionResultContainer.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="loading">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                                <p class="mt-3">Generating prediction...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Scroll to prediction result
        predictionResultContainer.scrollIntoView({ behavior: 'smooth' });
        
        // Get team details
        const homeTeam = allTeams.find(team => team.id === parseInt(homeTeamId));
        const awayTeam = allTeams.find(team => team.id === parseInt(awayTeamId));
        
        // Get managers for both teams
        const homeManager = allManagers.find(manager => manager.team_id === parseInt(homeTeamId));
        const awayManager = allManagers.find(manager => manager.team_id === parseInt(awayTeamId));
        
        // Get tactical vectors for both managers
        const homeTacticalVector = homeManager ? allTacticalVectors.find(vector => vector.manager_id === homeManager.id) : null;
        const awayTacticalVector = awayManager ? allTacticalVectors.find(vector => vector.manager_id === awayManager.id) : null;
        
        // Get team stats
        const { data: homeTeamStats, error: homeStatsError } = await supabase
            .from('team_stats')
            .select('*')
            .eq('team_id', homeTeamId)
            .single();
        
        if (homeStatsError) throw homeStatsError;
        
        const { data: awayTeamStats, error: awayStatsError } = await supabase
            .from('team_stats')
            .select('*')
            .eq('team_id', awayTeamId)
            .single();
        
        if (awayStatsError) throw awayStatsError;
        
        // Calculate tactical matchups if vectors are available
        let tacticalMatchups = null;
        if (homeTacticalVector && awayTacticalVector) {
            // Convert vectors to arrays for calculations
            const homeArray = [
                homeTacticalVector.pressing_intensity,
                homeTacticalVector.possession_control,
                homeTacticalVector.counter_attack_focus,
                homeTacticalVector.defensive_line_height,
                homeTacticalVector.defensive_aggression,
                homeTacticalVector.defensive_width,
                homeTacticalVector.offensive_width,
                homeTacticalVector.offensive_depth,
                homeTacticalVector.buildup_speed,
                homeTacticalVector.buildup_passing_directness,
                homeTacticalVector.buildup_initiation,
                homeTacticalVector.chance_creation_method,
                homeTacticalVector.defensive_organization,
                homeTacticalVector.wing_play_emphasis
            ];
            
            const awayArray = [
                awayTacticalVector.pressing_intensity,
                awayTacticalVector.possession_control,
                awayTacticalVector.counter_attack_focus,
                awayTacticalVector.defensive_line_height,
                awayTacticalVector.defensive_aggression,
                awayTacticalVector.defensive_width,
                awayTacticalVector.offensive_width,
                awayTacticalVector.offensive_depth,
                awayTacticalVector.buildup_speed,
                awayTacticalVector.buildup_passing_directness,
                awayTacticalVector.buildup_initiation,
                awayTacticalVector.chance_creation_method,
                awayTacticalVector.defensive_organization,
                awayTacticalVector.wing_play_emphasis
            ];
            
            // Calculate cosine similarity
            const dotProduct = homeArray.reduce((sum, value, index) => sum + value * awayArray[index], 0);
            const homeNorm = Math.sqrt(homeArray.reduce((sum, value) => sum + value * value, 0));
            const awayNorm = Math.sqrt(awayArray.reduce((sum, value) => sum + value * value, 0));
            const cosineSimilarity = dotProduct / (homeNorm * awayNorm);
            
            // Calculate euclidean distance
            const euclideanDistance = Math.sqrt(homeArray.reduce((sum, value, index) => sum + Math.pow(value - awayArray[index], 2), 0));
            
            // Calculate specific tactical mismatches
            const pressingMismatch = homeTacticalVector.pressing_intensity - awayTacticalVector.pressing_intensity;
            const possessionDefenseMismatch = homeTacticalVector.possession_control - awayTacticalVector.defensive_organization;
            const counterDefenseMismatch = homeTacticalVector.counter_attack_focus - awayTacticalVector.defensive_line_height;
            const buildupPressingMismatch = homeTacticalVector.buildup_initiation - awayTacticalVector.pressing_intensity;
            const wingWidthMismatch = homeTacticalVector.wing_play_emphasis - awayTacticalVector.defensive_width;
            
            tacticalMatchups = {
                cosineSimilarity,
                euclideanDistance,
                pressingMismatch,
                possessionDefenseMismatch,
                counterDefenseMismatch,
                buildupPressingMismatch,
                wingWidthMismatch
            };
        }
        
        // Calculate squad strength features
        const eloDifference = homeTeamStats.elo_rating - awayTeamStats.elo_rating;
        const goalDiffDifference = (homeTeamStats.goals_scored - homeTeamStats.goals_conceded) - 
                                  (awayTeamStats.goals_scored - awayTeamStats.goals_conceded);
        const ppgDifference = homeTeamStats.points_per_game - awayTeamStats.points_per_game;
        
        // Prepare features for prediction
        const features = [
            tacticalMatchups ? tacticalMatchups.cosineSimilarity : 0,
            tacticalMatchups ? tacticalMatchups.euclideanDistance : 0,
            tacticalMatchups ? tacticalMatchups.pressingMismatch : 0,
            tacticalMatchups ? tacticalMatchups.possessionDefenseMismatch : 0,
            tacticalMatchups ? tacticalMatchups.counterDefenseMismatch : 0,
            tacticalMatchups ? tacticalMatchups.buildupPressingMismatch : 0,
            tacticalMatchups ? tacticalMatchups.wingWidthMismatch : 0,
            eloDifference,
            goalDiffDifference,
            ppgDifference,
            homeTeamStats.elo_rating,
            awayTeamStats.elo_rating,
            homeTeamStats.goals_scored,
            awayTeamStats.goals_scored,
            homeTeamStats.goals_conceded,
            awayTeamStats.goals_conceded,
            homeTeamStats.points_per_game,
            awayTeamStats.points_per_game
        ];
        
        // Make prediction using serverless function
        // In a real implementation, this would call a serverless function that loads the model and makes a prediction
        // For this demo, we'll simulate a prediction based on the features
        
        // Simple heuristic for demonstration purposes
        let homeWinProb, drawProb, awayWinProb, predictedResult;
        
        // Home advantage factor
        const homeAdvantage = 0.1;
        
        // Base probabilities on team strength
        const baseHomeProb = 0.4 + (ppgDifference * 0.1) + (eloDifference * 0.0001) + homeAdvantage;
        const baseAwayProb = 0.4 - (ppgDifference * 0.1) - (eloDifference * 0.0001) - homeAdvantage;
        const baseDraw = 1 - baseHomeProb - baseAwayProb;
        
        // Adjust based on tactical matchups if available
        if (tacticalMatchups) {
            // Positive values favor home team
            const tacticalFactor = (
                tacticalMatchups.pressingMismatch * 0.05 +
                tacticalMatchups.possessionDefenseMismatch * 0.05 +
                tacticalMatchups.counterDefenseMismatch * 0.05 +
                tacticalMatchups.buildupPressingMismatch * 0.05 +
                tacticalMatchups.wingWidthMismatch * 0.05
            );
            
            homeWinProb = Math.min(Math.max(baseHomeProb + tacticalFactor, 0.05), 0.9);
            awayWinProb = Math.min(Math.max(baseAwayProb - tacticalFactor, 0.05), 0.9);
            drawProb = Math.min(Math.max(1 - homeWinProb - awayWinProb, 0.05), 0.9);
            
            // Normalize to sum to 1
            const total = homeWinProb + drawProb + awayWinProb;
            homeWinProb /= total;
            drawProb /= total;
            awayWinProb /= total;
        } else {
            homeWinProb = baseHomeProb;
            drawProb = baseDraw;
            awayWinProb = baseAwayProb;
        }
        
        // Determine predicted result
        if (homeWinProb > drawProb && homeWinProb > awayWinProb) {
            predictedResult = 1; // Home win
        } else if (awayWinProb > drawProb && awayWinProb > homeWinProb) {
            predictedResult = -1; // Away win
        } else {
            predictedResult = 0; // Draw
        }
        
        // Convert to percentages
        const homeWinPercent = Math.round(homeWinProb * 100);
        const drawPercent = Math.round(drawProb * 100);
        const awayWinPercent = Math.round(awayWinProb * 100);
        
        // Generate tactical summary
        let tacticalSummary = '';
        if (tacticalMatchups) {
            if (tacticalMatchups.pressingMismatch > 0.2) {
                tacticalSummary = `${homeTeam.name} has a significant pressing advantage which could disrupt ${awayTeam.name}'s build-up play.`;
            } else if (tacticalMatchups.pressingMismatch < -0.2) {
                tacticalSummary = `${awayTeam.name} has a significant pressing advantage which could disrupt ${homeTeam.name}'s build-up play.`;
            } else if (tacticalMatchups.possessionDefenseMismatch > 0.2) {
                tacticalSummary = `${homeTeam.name}'s possession-based style could challenge ${awayTeam.name}'s defensive organization.`;
            } else if (tacticalMatchups.counterDefenseMismatch > 0.2) {
                tacticalSummary = `${homeTeam.name}'s counter-attacking style could exploit ${awayTeam.name}'s high defensive line.`;
            } else if (tacticalMatchups.wingWidthMismatch > 0.2) {
                tacticalSummary = `${homeTeam.name}'s wing play could create overloads against ${awayTeam.name}'s narrower defensive setup.`;
            } else {
                tacticalSummary = `The tactical styles of both teams are well-matched, with no significant advantages in any area.`;
            }
        } else {
            tacticalSummary = `Tactical data is incomplete. Prediction is based primarily on team performance metrics.`;
        }
        
        // Render prediction result
        let resultText, resultClass;
        if (predictedResult === 1) {
            resultText = `Home Win (${homeWinPercent}%)`;
            resultClass = 'alert-primary';
        } else if (predictedResult === 0) {
            resultText = `Draw (${drawPercent}%)`;
            resultClass = 'alert-secondary';
        } else {
            resultText = `Away Win (${awayWinPercent}%)`;
            resultClass = 'alert-danger';
        }
        
        // Update prediction result container
        predictionResultContainer.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header bg-primary text-white">
                            <h3><i class="bi bi-graph-up"></i> Match Prediction</h3>
                        </div>
                        <div class="card-body">
                            <div class="row align-items-center mb-4">
                                <div class="col-md-5 text-center">
                                    <img id="homeTeamLogo" src="${homeTeam.logo_url || 'https://via.placeholder.com/80'}" alt="${homeTeam.name}" class="team-logo mb-2">
                                    <h4 id="homeTeamName">${homeTeam.name}</h4>
                                </div>
                                <div class="col-md-2 text-center">
                                    <div class="vs-badge">VS</div>
                                </div>
                                <div class="col-md-5 text-center">
                                    <img id="awayTeamLogo" src="${awayTeam.logo_url || 'https://via.placeholder.com/80'}" alt="${awayTeam.name}" class="team-logo mb-2">
                                    <h4 id="awayTeamName">${awayTeam.name}</h4>
                                </div>
                            </div>

                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card prediction-card mb-3">
                                        <div class="card-body">
                                            <h5 class="card-title">Prediction Result</h5>
                                            <div class="alert ${resultClass}" id="predictionResult">
                                                ${resultText}
                                            </div>
                                            <h6>Outcome Probabilities</h6>
                                            <div class="mb-2">
                                                <div class="d-flex justify-content-between">
                                                    <span>Home Win</span>
                                                    <span id="homeWinProb">${homeWinPercent}%</span>
                                                </div>
                                                <div class="progress">
                                                    <div id="homeWinProgress" class="progress-bar progress-bar-home" role="progressbar" style="width: ${homeWinPercent}%"></div>
                                                </div>
                                            </div>
                                            <div class="mb-2">
                                                <div class="d-flex justify-content-between">
                                                    <span>Draw</span>
                                                    <span id="drawProb">${drawPercent}%</span>
                                                </div>
                                                <div class="progress">
                                                    <div id="drawProgress" class="progress-bar progress-bar-draw" role="progressbar" style="width: ${drawPercent}%"></div>
                                                </div>
                                            </div>
                                            <div class="mb-2">
                                                <div class="d-flex justify-content-between">
                                                    <span>Away Win</span>
                                                    <span id="awayWinProb">${awayWinPercent}%</span>
                                                </div>
                                                <div class="progress">
                                                    <div id="awayWinProgress" class="progress-bar progress-bar-away" role="progressbar" style="width: ${awayWinPercent}%"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card tactical-card">
                                        <div class="card-body">
                                            <h5 class="card-title">Key Tactical Insights</h5>
                                            <div id="tacticalInsights">
                                                ${tacticalMatchups ? `
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Pressing Mismatch</span>
                                                        <span id="pressingMismatchValue">${tacticalMatchups.pressingMismatch.toFixed(2)}</span>
                                                    </div>
                                                    <div class="progress feature-importance">
                                                        <div id="pressingMismatchBar" class="progress-bar feature-bar" role="progressbar" 
                                                            style="width: ${Math.abs(tacticalMatchups.pressingMismatch) * 100}%"></div>
                                                    </div>
                                                </div>
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Possession vs Defense</span>
                                                        <span id="possessionDefenseValue">${tacticalMatchups.possessionDefenseMismatch.toFixed(2)}</span>
                                                    </div>
                                                    <div class="progress feature-importance">
                                                        <div id="possessionDefenseBar" class="progress-bar feature-bar" role="progressbar" 
                                                            style="width: ${Math.abs(tacticalMatchups.possessionDefenseMismatch) * 100}%"></div>
                                                    </div>
                                                </div>
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Counter vs Defense</span>
                                                        <span id="counterDefenseValue">${tacticalMatchups.counterDefenseMismatch.toFixed(2)}</span>
                                                    </div>
                                                    <div class="progress feature-importance">
                                                        <div id="counterDefenseBar" class="progress-bar feature-bar" role="progressbar" 
                                                            style="width: ${Math.abs(tacticalMatchups.counterDefenseMismatch) * 100}%"></div>
                                                    </div>
                                                </div>
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Wing Width Mismatch</span>
                                                        <span id="wingWidthValue">${tacticalMatchups.wingWidthMismatch.toFixed(2)}</span>
                                                    </div>
                                                    <div class="progress feature-importance">
                                                        <div id="wingWidthBar" class="progress-bar feature-bar" role="progressbar" 
                                                            style="width: ${Math.abs(tacticalMatchups.wingWidthMismatch) * 100}%"></div>
                                                    </div>
                                                </div>
                                                ` : `
                                                <div class="alert alert-warning">
                                                    <i class="bi bi-info-circle"></i> 
                                                    Tactical data is not available for one or both managers.
                                                </div>
                                                `}
                                            </div>
                                            <div class="alert alert-warning mt-3">
                                                <i class="bi bi-info-circle"></i> 
                                                <span id="tacticalSummary">${tacticalSummary}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error generating prediction:', error);
        predictionResultContainer.innerHTML = `
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="alert alert-danger">
                                <i class="bi bi-exclamation-triangle"></i> 
                                Failed to generate prediction. Please try again later.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Show detailed prediction for a specific fixture
async function showDetailedPrediction(fixtureId) {
    try {
        // Get fixture details
        const { data: fixture, error: fixtureError } = await supabase
            .from('fixtures')
            .select(`
                id,
                home_team_id,
                away_team_id,
                home_team:home_team_id(id, name, logo_url),
                away_team:away_team_id(id, name, logo_url),
                enhanced_matches(*)
            `)
            .eq('id', fixtureId)
            .single();
        
        if (fixtureError) throw fixtureError;
        
        // Get prediction
        const { data: prediction, error: predictionError } = await supabase
            .from('predictions')
            .select('*')
            .eq('fixture_id', fixtureId)
            .single();
        
        if (predictionError && predictionError.code !== 'PGRST116') throw predictionError;
        
        // Set form values to match the fixture
        homeTeamSelect.value = fixture.home_team_id;
        awayTeamSelect.value = fixture.away_team_id;
        
        // Trigger prediction
        customPredictionForm.dispatchEvent(new Event('submit'));
        
        // Scroll to prediction result
        predictionResultContainer.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error showing detailed prediction:', error);
        showError('Failed to load detailed prediction. Please try again later.');
    }
}

// Helper function to show error messages
function showError(message) {
    const errorAlert = document.createElement('div');
    errorAlert.className = 'alert alert-danger alert-dismissible fade show';
    errorAlert.innerHTML = `
        <i class="bi bi-exclamation-triangle"></i> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.querySelector('.container').insertBefore(errorAlert, document.querySelector('.container').firstChild);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        errorAlert.classList.remove('show');
        setTimeout(() => errorAlert.remove(), 500);
    }, 5000);
}
