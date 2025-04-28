// Initialize Supabase client
const supabaseUrl = 'https://tuuadmjplkzceervaezn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dWFkbWpwbGt6Y2VlcnZhZXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTExMTMsImV4cCI6MjA2MTQyNzExM30.cXGG5WbnUuWRAzlw9Hr_EWz8CEJl-b94zo6S8MENeCY';
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

// Authentication DOM elements
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const signupEmail = document.getElementById('signupEmail');
const signupPassword = document.getElementById('signupPassword');
const authAlert = document.getElementById('authAlert');
const loginNavItem = document.getElementById('loginNavItem');
const userNavItem = document.getElementById('userNavItem');
const userEmail = document.getElementById('userEmail');
const statusUserEmail = document.getElementById('statusUserEmail');
const logoutBtn = document.getElementById('logoutBtn');
const authStatusContainer = document.getElementById('authStatusContainer');
const authModal = new bootstrap.Modal(document.getElementById('authModal'), {
    keyboard: false
});

// Global variables
let allTeams = [];
let allManagers = [];
let allTacticalVectors = [];
let currentUser = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            currentUser = session.user;
            updateAuthUI(true);
        } else {
            updateAuthUI(false);
        }

        // Set up auth event listeners
        setupAuthListeners();
        
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

// Set up authentication listeners
function setupAuthListeners() {
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            updateAuthUI(true);
            authModal.hide();
            showAuthSuccess('Successfully signed in!');
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            updateAuthUI(false);
            showAuthSuccess('Successfully signed out!');
        }
    });

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            showAuthLoading('Signing in...');
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginEmail.value,
                password: loginPassword.value
            });
            
            if (error) throw error;
            
            // Clear form
            loginForm.reset();
            
        } catch (error) {
            console.error('Login error:', error);
            showAuthError(error.message || 'Failed to sign in. Please check your credentials.');
        }
    });

    // Signup form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            showAuthLoading('Creating account...');
            
            const { data, error } = await supabase.auth.signUp({
                email: signupEmail.value,
                password: signupPassword.value
            });
            
            if (error) throw error;
            
            // Clear form
            signupForm.reset();
            
            // Show confirmation message
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                // User already exists
                showAuthError('An account with this email already exists. Please log in instead.');
            } else {
                showAuthSuccess('Account created! Please check your email for confirmation.');
            }
            
        } catch (error) {
            console.error('Signup error:', error);
            showAuthError(error.message || 'Failed to create account. Please try again.');
        }
    });

    // Logout button
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } catch (error) {
            console.error('Logout error:', error);
            showError('Failed to sign out. Please try again.');
        }
    });
}

// Update UI based on authentication state
function updateAuthUI(isAuthenticated) {
    if (isAuthenticated && currentUser) {
        // User is logged in
        loginNavItem.style.display = 'none';
        userNavItem.style.display = 'block';
        authStatusContainer.style.display = 'block';
        
        // Update user info
        userEmail.textContent = currentUser.email;
        statusUserEmail.textContent = currentUser.email;
    } else {
        // User is logged out
        loginNavItem.style.display = 'block';
        userNavItem.style.display = 'none';
        authStatusContainer.style.display = 'none';
    }
}

// Show authentication alert messages
function showAuthError(message) {
    authAlert.className = 'alert alert-danger';
    authAlert.textContent = message;
    authAlert.style.display = 'block';
}

function showAuthSuccess(message) {
    authAlert.className = 'alert alert-success';
    authAlert.textContent = message;
    authAlert.style.display = 'block';
}

function showAuthLoading(message) {
    authAlert.className = 'alert alert-info';
    authAlert.textContent = message;
    authAlert.style.display = 'block';
}

function hideAuthAlert() {
    authAlert.style.display = 'none';
}

// Show general error message
function showError(message) {
    // Create a toast or alert for general errors
    alert(message);
}

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
            // Calculate tactical matchups
            tacticalMatchups = {
                pressingMismatch: homeTacticalVector.pressing_intensity - awayTacticalVector.buildup_speed,
                possessionDefense: homeTacticalVector.possession_control - awayTacticalVector.defensive_aggression,
                counterDefense: homeTacticalVector.counter_attack_focus - awayTacticalVector.defensive_line_height,
                wingWidth: homeTacticalVector.offensive_width - awayTacticalVector.defensive_width
            };
        }
        
        // Calculate team strength differences
        const strengthDifferences = {
            eloDifference: homeTeamStats.elo_rating - awayTeamStats.elo_rating,
            ppgDifference: homeTeamStats.points_per_game - awayTeamStats.points_per_game,
            goalDiffDifference: homeTeamStats.goal_difference - awayTeamStats.goal_difference
        };
        
        // Generate prediction (simplified for demo)
        // In a real implementation, this would call the model API
        const homeAdvantage = 0.1; // 10% home advantage
        const eloPower = 0.4; // 40% of prediction based on Elo
        const tacticalPower = 0.3; // 30% of prediction based on tactical matchups
        const formPower = 0.2; // 20% of prediction based on recent form
        
        let homeWinProb = 0.5; // Start at 50%
        
        // Add home advantage
        homeWinProb += homeAdvantage;
        
        // Add Elo influence
        const normalizedEloDiff = strengthDifferences.eloDifference / 400; // Normalize to -1 to 1 range
        homeWinProb += normalizedEloDiff * eloPower;
        
        // Add tactical influence if available
        if (tacticalMatchups) {
            const tacticalSum = 
                tacticalMatchups.pressingMismatch * 0.3 + 
                tacticalMatchups.possessionDefense * 0.3 + 
                tacticalMatchups.counterDefense * 0.2 + 
                tacticalMatchups.wingWidth * 0.2;
            
            const normalizedTactical = tacticalSum / 4; // Normalize to -1 to 1 range
            homeWinProb += normalizedTactical * tacticalPower;
        }
        
        // Add form influence
        const formDiff = strengthDifferences.ppgDifference / 3; // Normalize to -1 to 1 range
        homeWinProb += formDiff * formPower;
        
        // Ensure probabilities are within 0-1 range
        homeWinProb = Math.max(0.05, Math.min(0.95, homeWinProb));
        
        // Calculate draw and away win probabilities
        const drawProb = (1 - homeWinProb) * 0.5;
        const awayWinProb = 1 - homeWinProb - drawProb;
        
        // Determine predicted result
        let predictedResult = '';
        let resultClass = '';
        
        if (homeWinProb > drawProb && homeWinProb > awayWinProb) {
            predictedResult = 'Home Win';
            resultClass = 'alert-primary';
        } else if (awayWinProb > homeWinProb && awayWinProb > drawProb) {
            predictedResult = 'Away Win';
            resultClass = 'alert-danger';
        } else {
            predictedResult = 'Draw';
            resultClass = 'alert-secondary';
        }
        
        // Format probabilities as percentages
        const homeWinPct = Math.round(homeWinProb * 100);
        const drawPct = Math.round(drawProb * 100);
        const awayWinPct = Math.round(awayWinProb * 100);
        
        // Generate tactical insights
        let tacticalSummary = '';
        if (tacticalMatchups) {
            if (tacticalMatchups.pressingMismatch > 0.3) {
                tacticalSummary = `${homeTeam.name}'s pressing intensity could disrupt ${awayTeam.name}'s build-up play.`;
            } else if (tacticalMatchups.pressingMismatch < -0.3) {
                tacticalSummary = `${awayTeam.name}'s build-up speed could overcome ${homeTeam.name}'s pressing.`;
            } else if (tacticalMatchups.possessionDefense > 0.3) {
                tacticalSummary = `${homeTeam.name}'s possession style could dominate against ${awayTeam.name}'s defensive approach.`;
            } else if (tacticalMatchups.possessionDefense < -0.3) {
                tacticalSummary = `${awayTeam.name}'s defensive aggression could disrupt ${homeTeam.name}'s possession game.`;
            } else if (tacticalMatchups.counterDefense > 0.3) {
                tacticalSummary = `${homeTeam.name}'s counter-attacking could be effective against ${awayTeam.name}'s high defensive line.`;
            } else if (tacticalMatchups.counterDefense < -0.3) {
                tacticalSummary = `${awayTeam.name}'s defensive line height could neutralize ${homeTeam.name}'s counter-attacks.`;
            } else if (tacticalMatchups.wingWidth > 0.3) {
                tacticalSummary = `${homeTeam.name} could exploit wide areas against ${awayTeam.name}'s narrow defense.`;
            } else if (tacticalMatchups.wingWidth < -0.3) {
                tacticalSummary = `${awayTeam.name}'s defensive width could contain ${homeTeam.name}'s wing play.`;
            } else {
                tacticalSummary = `The tactical approaches of both teams are well-matched, leading to a balanced contest.`;
            }
        } else {
            tacticalSummary = `Tactical data not available for one or both managers.`;
        }
        
        // Render prediction result
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
                                                ${predictedResult} (${predictedResult === 'Home Win' ? homeWinPct : predictedResult === 'Away Win' ? awayWinPct : drawPct}%)
                                            </div>
                                            <h6>Outcome Probabilities</h6>
                                            <div class="mb-2">
                                                <div class="d-flex justify-content-between">
                                                    <span>Home Win</span>
                                                    <span id="homeWinProb">${homeWinPct}%</span>
                                                </div>
                                                <div class="progress">
                                                    <div id="homeWinProgress" class="progress-bar progress-bar-home" role="progressbar" style="width: ${homeWinPct}%"></div>
                                                </div>
                                            </div>
                                            <div class="mb-2">
                                                <div class="d-flex justify-content-between">
                                                    <span>Draw</span>
                                                    <span id="drawProb">${drawPct}%</span>
                                                </div>
                                                <div class="progress">
                                                    <div id="drawProgress" class="progress-bar progress-bar-draw" role="progressbar" style="width: ${drawPct}%"></div>
                                                </div>
                                            </div>
                                            <div class="mb-2">
                                                <div class="d-flex justify-content-between">
                                                    <span>Away Win</span>
                                                    <span id="awayWinProb">${awayWinPct}%</span>
                                                </div>
                                                <div class="progress">
                                                    <div id="awayWinProgress" class="progress-bar progress-bar-away" role="progressbar" style="width: ${awayWinPct}%"></div>
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
                                                            style="width: ${Math.abs(tacticalMatchups.pressingMismatch * 100)}%"></div>
                                                    </div>
                                                </div>
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Possession vs Defense</span>
                                                        <span id="possessionDefenseValue">${tacticalMatchups.possessionDefense.toFixed(2)}</span>
                                                    </div>
                                                    <div class="progress feature-importance">
                                                        <div id="possessionDefenseBar" class="progress-bar feature-bar" role="progressbar" 
                                                            style="width: ${Math.abs(tacticalMatchups.possessionDefense * 100)}%"></div>
                                                    </div>
                                                </div>
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Counter vs Defense</span>
                                                        <span id="counterDefenseValue">${tacticalMatchups.counterDefense.toFixed(2)}</span>
                                                    </div>
                                                    <div class="progress feature-importance">
                                                        <div id="counterDefenseBar" class="progress-bar feature-bar" role="progressbar" 
                                                            style="width: ${Math.abs(tacticalMatchups.counterDefense * 100)}%"></div>
                                                    </div>
                                                </div>
                                                <div class="mb-3">
                                                    <div class="d-flex justify-content-between">
                                                        <span>Wing Width Mismatch</span>
                                                        <span id="wingWidthValue">${tacticalMatchups.wingWidth.toFixed(2)}</span>
                                                    </div>
                                                    <div class="progress feature-importance">
                                                        <div id="wingWidthBar" class="progress-bar feature-bar" role="progressbar" 
                                                            style="width: ${Math.abs(tacticalMatchups.wingWidth * 100)}%"></div>
                                                    </div>
                                                </div>
                                                ` : `
                                                <div class="alert alert-warning">
                                                    <i class="bi bi-exclamation-triangle"></i> Tactical data not available for one or both managers.
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
                                <i class="bi bi-exclamation-triangle"></i> Failed to generate prediction. Please try again later.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Function to show detailed prediction for a specific fixture
function showDetailedPrediction(fixtureId) {
    // This would be implemented to show a detailed view of a specific fixture prediction
    alert(`Detailed prediction for fixture ${fixtureId} would be shown here.`);
}
