// Initialize Supabase client
const supabaseUrl = 'https://tuuadmjplkzceervaezn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dWFkbWpwbGt6Y2VlcnZhZXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTExMTMsImV4cCI6MjA2MTQyNzExM30.cXGG5WbnUuWRAzlw9Hr_EWz8CEJl-b94zo6S8MENeCY';
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

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
let currentUser = null;
let allOddsData = []; // To store loaded odds data

// Constants for value bet calculation
const TAX_RATE = 0.12;
const VALUE_THRESHOLD = 0.02;

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
        
        // Load odds data
        await loadOddsData(); // Load odds data on startup
        
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

// --- Authentication Functions (Unchanged) ---
function setupAuthListeners() {
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
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            showAuthLoading('Signing in...');
            const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail.value, password: loginPassword.value });
            if (error) throw error;
            loginForm.reset();
        } catch (error) {
            console.error('Login error:', error);
            showAuthError(error.message || 'Failed to sign in. Please check your credentials.');
        }
    });
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            showAuthLoading('Creating account...');
            const { data, error } = await supabase.auth.signUp({ email: signupEmail.value, password: signupPassword.value });
            if (error) throw error;
            signupForm.reset();
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                showAuthError('An account with this email already exists. Please log in instead.');
            } else {
                showAuthSuccess('Account created! Please check your email for confirmation.');
            }
        } catch (error) {
            console.error('Signup error:', error);
            showAuthError(error.message || 'Failed to create account. Please try again.');
        }
    });
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
function updateAuthUI(isAuthenticated) {
    if (isAuthenticated && currentUser) {
        loginNavItem.style.display = 'none';
        userNavItem.style.display = 'block';
        authStatusContainer.style.display = 'block';
        userEmail.textContent = currentUser.email;
        statusUserEmail.textContent = currentUser.email;
    } else {
        loginNavItem.style.display = 'block';
        userNavItem.style.display = 'none';
        authStatusContainer.style.display = 'none';
    }
}
function showAuthError(message) { authAlert.className = 'alert alert-danger'; authAlert.textContent = message; authAlert.style.display = 'block'; }
function showAuthSuccess(message) { authAlert.className = 'alert alert-success'; authAlert.textContent = message; authAlert.style.display = 'block'; }
function showAuthLoading(message) { authAlert.className = 'alert alert-info'; authAlert.textContent = message; authAlert.style.display = 'block'; }
function hideAuthAlert() { authAlert.style.display = 'none'; }
function showError(message) { alert(message); }
// --- End Authentication Functions ---

// Load teams from Supabase (Unchanged)
async function loadTeams() {
    try {
        homeTeamSelect.innerHTML = '<option value="">Loading teams...</option>';
        awayTeamSelect.innerHTML = '<option value="">Loading teams...</option>';
        const { data: teams, error } = await supabase.from('teams').select('id, name, logo_url, league_id, leagues(name)').order('name');
        if (error) throw error;
        allTeams = teams;
        homeTeamSelect.innerHTML = '<option value="">Select Home Team</option>';
        awayTeamSelect.innerHTML = '<option value="">Select Away Team</option>';
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
    } catch (error) {
        console.error('Error loading teams:', error);
        homeTeamSelect.innerHTML = '<option value="">Error loading teams</option>';
        awayTeamSelect.innerHTML = '<option value="">Error loading teams</option>';
    }
}

// Load odds data from JSON file
async function loadOddsData() {
    try {
        const response = await fetch('./upcoming_fixtures_odds.json'); // Fetch the local JSON file
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawOddsData = await response.json();
        console.log(`Loaded ${rawOddsData.length} raw fixtures with odds.`);

        // Create a map using a composite key: homeName_awayName_YYYY-MM-DD
        allOddsData = new Map();
        rawOddsData.forEach(o => {
            try {
                const datePart = new Date(o.date).toISOString().split('T')[0]; // Get YYYY-MM-DD
                const key = `${o.home_team_name}_${o.away_team_name}_${datePart}`;
                allOddsData.set(key, o.odds);
            } catch (e) {
                console.error(`Error processing odds entry: ${JSON.stringify(o)}`, e);
            }
        });
        console.log(`Created odds map with ${allOddsData.size} entries. First key example:`, allOddsData.size > 0 ? allOddsData.keys().next().value : 'N/A'); // DEBUG

    } catch (error) {
        console.error('Error loading or processing odds data:', error);
        showError('Could not load betting odds data. Value bet analysis will be unavailable.');
        allOddsData = new Map(); // Ensure it's an empty map on error
    }
}

// Helper function to calculate required probability
function calculateRequiredProb(decimalOdds) {
    if (!decimalOdds || decimalOdds <= 1) {
        return 1.0; // Cannot profit if odds are 1 or less, or invalid
    }
    const effectiveOdds = 1 + (decimalOdds - 1) * (1 - TAX_RATE);
    return 1 / effectiveOdds;
}

// Load upcoming matches - MODIFIED to include odds and value bet analysis
async function loadUpcomingMatches() {
    try {
        upcomingMatchesContainer.innerHTML = `<div class="loading"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
        
        const leagueId = leagueSelect.value;
        const daysAhead = parseInt(dateRangeSelect.value);
        const today = new Date();
        const endDate = new Date();
        endDate.setDate(today.getDate() + daysAhead);
        const todayStr = today.toISOString();
        const endDateStr = endDate.toISOString();
        
        let fixtureQuery = supabase
            .from('fixtures')
            .select('id, match_date, status, home_team_id, away_team_id, home_score, away_score, home_team:home_team_id(id, name, logo_url), away_team:away_team_id(id, name, logo_url), league_id, leagues(name)')
            .eq('status', 'NS')
            .gte('match_date', todayStr)
            .lte('match_date', endDateStr)
            .order('match_date');
            
        if (leagueId !== 'all') {
            fixtureQuery = fixtureQuery.eq('league_id', leagueId);
        }
        
        const { data: fixtures, error: fixtureError } = await fixtureQuery;
        if (fixtureError) throw fixtureError;
        
        if (!fixtures || fixtures.length === 0) {
            upcomingMatchesContainer.innerHTML = `<div class="alert alert-info"><i class="bi bi-info-circle"></i> No upcoming matches found for the selected criteria.</div>`;
            return;
        }

            // Odds are now stored in allOddsData map with composite key (home_away_date)
            console.log("Using allOddsData map with composite keys. Size:", allOddsData.size); // Updated log

        let fixturesHtml = '<div class="row">';
        
        // Use Promise.all to fetch all predictions concurrently
        const predictionPromises = fixtures.map(fixture => 
            supabase.rpc('predict_match', {
                p_home_team_id: fixture.home_team_id,
                p_away_team_id: fixture.away_team_id
            })
        );

        const predictionResults = await Promise.allSettled(predictionPromises);

        fixtures.forEach((fixture, index) => {
            const matchDate = new Date(fixture.match_date);
            const formattedDate = matchDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const homeTeam = fixture.home_team;
            const awayTeam = fixture.away_team;
            const leagueName = fixture.leagues ? fixture.leagues.name : 'Unknown League';
            
            let predictionHtml = '';
            let oddsHtml = '';
            
            // Construct the key to find odds in the allOddsData map (homeName_awayName_YYYY-MM-DD)
            let odds = null;
            if (homeTeam && awayTeam && homeTeam.name && awayTeam.name) {
                try {
                    const datePart = matchDate.toISOString().split("T")[0]; // Get YYYY-MM-DD
                    const key = `${homeTeam.name}_${awayTeam.name}_${datePart}`;
                    odds = allOddsData.get(key);
                    console.log(`DEBUG: Looking for odds with key: ${key}. Found:`, odds ? JSON.stringify(odds) : 'Not Found'); // Updated DEBUG
                } catch (e) {
                    console.error(`Error constructing key or getting odds for fixture ${fixture.id} (${homeTeam.name} vs ${awayTeam.name}):`, e);
                }
            } else {
                console.log(`DEBUG: Missing team names for fixture ${fixture.id}, cannot look up odds.`);
            }
            
            // Process prediction result for this fixture
            const predictionResult = predictionResults[index];
            let prediction = null;
            let modelProbH = null, modelProbD = null, modelProbA = null;

            if (predictionResult.status === 'fulfilled' && predictionResult.value.data && predictionResult.value.data.length > 0) {
                prediction = predictionResult.value.data[0];
                // DEBUG: Log the prediction received by JS RPC
                console.log(`JS RPC Prediction for fixture ${fixture.id}:`, prediction);
                
                modelProbH = prediction.home_win_prob;
                modelProbD = prediction.draw_prob;
                modelProbA = prediction.away_win_prob;

                // Check if probabilities are valid numbers
                if (typeof modelProbH !== 'number' || typeof modelProbD !== 'number' || typeof modelProbA !== 'number') {
                    console.error(`Invalid probability types for fixture ${fixture.id}:`, modelProbH, modelProbD, modelProbA);
                    predictionHtml = `<div class="mt-3"><span class="badge bg-warning text-dark">Prediction Error</span></div>`;
                    modelProbH = modelProbD = modelProbA = null; // Reset for safety
                } else {
                    const homeWinProb = Math.round(modelProbH * 100);
                    const drawProb = Math.round(modelProbD * 100);
                    const awayWinProb = Math.round(modelProbA * 100);
                    
                    let resultText = '';
                    let resultClass = '';
                    if (prediction.predicted_outcome === 1) { resultText = 'Home Win'; resultClass = 'text-primary'; }
                    else if (prediction.predicted_outcome === 0) { resultText = 'Draw'; resultClass = 'text-secondary'; }
                    else { resultText = 'Away Win'; resultClass = 'text-danger'; }
                    
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
                }
            } else {
                if (predictionResult.status === 'rejected') {
                    console.error(`Error fetching prediction for fixture ${fixture.id}:`, predictionResult.reason);
                }
                predictionHtml = `<div class="mt-3"><span class="badge bg-secondary">No prediction available</span></div>`;
            }

            // Process odds and value bets
            if (odds) {
                const homeOdd = odds.home_odd;
                const drawOdd = odds.draw_odd;
                const awayOdd = odds.away_odd;

                let valueIndicatorH = '';
                let valueIndicatorD = '';
                let valueIndicatorA = '';

                // Only calculate value if we have valid model probabilities
                if (modelProbH !== null && modelProbD !== null && modelProbA !== null) {
                    const reqProbH = calculateRequiredProb(homeOdd);
                    const reqProbD = calculateRequiredProb(drawOdd);
                    const reqProbA = calculateRequiredProb(awayOdd);

                    if (modelProbH >= reqProbH + VALUE_THRESHOLD) {
                        valueIndicatorH = ' <span class="badge bg-success value-bet-indicator" title="Value Bet!">V</span>';
                    }
                    if (modelProbD >= reqProbD + VALUE_THRESHOLD) {
                        valueIndicatorD = ' <span class="badge bg-success value-bet-indicator" title="Value Bet!">V</span>';
                    }
                    if (modelProbA >= reqProbA + VALUE_THRESHOLD) {
                        valueIndicatorA = ' <span class="badge bg-success value-bet-indicator" title="Value Bet!">V</span>';
                    }
                }

                oddsHtml = `
                    <div class="mt-3 border-top pt-2">
                        <h6 class="small text-muted">Odds (Bet365)</h6>
                        <div class="d-flex justify-content-between small">
                            <span>H: ${homeOdd ? homeOdd.toFixed(2) : 'N/A'}${valueIndicatorH}</span>
                            <span>D: ${drawOdd ? drawOdd.toFixed(2) : 'N/A'}${valueIndicatorD}</span>
                            <span>A: ${awayOdd ? awayOdd.toFixed(2) : 'N/A'}${valueIndicatorA}</span>
                        </div>
                    </div>
                `;
            } else {
                oddsHtml = `
                    <div class="mt-3 border-top pt-2">
                        <span class="badge bg-light text-dark">No odds available</span>
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
                        <div class="card-body d-flex flex-column">
                            <div class="row align-items-center text-center">
                                <div class="col-5">
                                    <img src="${homeTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${homeTeam.name}" class="team-logo mb-2">
                                    <h6 class="mb-0">${homeTeam.name}</h6>
                                </div>
                                <div class="col-2">
                                    <span class="vs-badge">VS</span>
                                </div>
                                <div class="col-5">
                                    <img src="${awayTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${awayTeam.name}" class="team-logo mb-2">
                                    <h6 class="mb-0">${awayTeam.name}</h6>
                                </div>
                            </div>
                            <div class="mt-auto"> <!-- Push prediction and odds to bottom -->
                                ${predictionHtml}
                                ${oddsHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        fixturesHtml += '</div>'; // Close row
        upcomingMatchesContainer.innerHTML = fixturesHtml;
        
    } catch (error) {
        console.error('Error loading upcoming matches:', error);
        upcomingMatchesContainer.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle"></i> Error loading matches: ${error.message}</div>`;
    }
}

// Handle custom prediction form submission (Unchanged from previous fix)
async function handleCustomPrediction(e) {
    e.preventDefault();
    try {
        const homeTeamId = homeTeamSelect.value;
        const awayTeamId = awayTeamSelect.value;
        if (!homeTeamId || !awayTeamId) { throw new Error('Please select both home and away teams.'); }
        if (homeTeamId === awayTeamId) { throw new Error('Home and away teams cannot be the same.'); }
        
        predictionResultContainer.innerHTML = `<div class="loading mt-4"><div class="spinner-border text-success" role="status"><span class="visually-hidden">Generating prediction...</span></div><div class="mt-2">Generating prediction...</div></div>`;
        predictionResultContainer.style.display = 'block';
        
        const homeTeam = allTeams.find(team => team.id.toString() === homeTeamId);
        const awayTeam = allTeams.find(team => team.id.toString() === awayTeamId);
        if (!homeTeam || !awayTeam) { throw new Error('Selected teams not found in database.'); }
        
        const { data: predictionData, error } = await supabase.rpc("predict_match", { p_home_team_id: parseInt(homeTeamId), p_away_team_id: parseInt(awayTeamId) });
        console.log("Raw prediction response (custom):", predictionData);
        if (error) throw error;
        if (!predictionData || !Array.isArray(predictionData) || predictionData.length === 0) { throw new Error("Failed to generate prediction or received empty data. Please try again."); }
        const prediction = predictionData[0];
        console.log("Extracted prediction object (custom):", prediction);
        console.log("Raw probabilities (custom):", prediction.home_win_prob, prediction.draw_prob, prediction.away_win_prob);
        
        const homeWinProb = Math.round(prediction.home_win_prob * 100);
        const drawProb = Math.round(prediction.draw_prob * 100);
        const awayWinProb = Math.round(prediction.away_win_prob * 100);
        
        let resultText = "";
        let resultClass = "";
        if (prediction.predicted_outcome === 1) { resultText = "Home Win"; resultClass = "text-primary"; }
        else if (prediction.predicted_outcome === 0) { resultText = "Draw"; resultClass = "text-secondary"; }
        else { resultText = "Away Win"; resultClass = "text-danger"; }
        
        const generatedHtmlString = `
            <div class="card prediction-card mt-4">
                <div class="card-body">
                    <h4 class="card-title">Match Prediction</h4>
                    <div class="row align-items-center mb-3">
                        <div class="col-4 text-center">
                            <img src="${homeTeam.logo_url || "https://via.placeholder.com/50"}" alt="${homeTeam.name}" class="team-logo mb-2">
                            <h6 class="mb-0">${homeTeam.name}</h6>
                        </div>
                        <div class="col-4 text-center"><div class="vs-badge">VS</div></div>
                        <div class="col-4 text-center">
                            <img src="${awayTeam.logo_url || "https://via.placeholder.com/50"}" alt="${awayTeam.name}" class="team-logo mb-2">
                            <h6 class="mb-0">${awayTeam.name}</h6>
                        </div>
                    </div>
                    <div class="mt-4">
                        <h5>Predicted Result: <span class="${resultClass}">${resultText}</span></h5>
                        <div class="progress mb-2" style="height: 25px;">
                            <div class="progress-bar progress-bar-home" role="progressbar" style="width: ${homeWinProb}%" title="Home Win: ${homeWinProb}%">${homeWinProb}%</div>
                            <div class="progress-bar progress-bar-draw" role="progressbar" style="width: ${drawProb}%" title="Draw: ${drawProb}%">${drawProb}%</div>
                            <div class="progress-bar progress-bar-away" role="progressbar" style="width: ${awayWinProb}%" title="Away Win: ${awayWinProb}%">${awayWinProb}%</div>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span>${homeTeam.name} Win</span>
                            <span>Draw</span>
                            <span>${awayTeam.name} Win</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        console.log("Generated HTML (custom):", generatedHtmlString);
        predictionResultContainer.innerHTML = generatedHtmlString;
        predictionResultContainer.style.display = 'block'; 
        console.log("Container innerHTML after set (custom):", predictionResultContainer.innerHTML);
    } catch (error) {
        console.error("Error generating prediction:", error);
        predictionResultContainer.innerHTML = `<div class="alert alert-danger mt-4"><i class="bi bi-exclamation-triangle"></i> ${error.message || "Error generating prediction. Please try again."}</div>`;
        predictionResultContainer.style.display = 'block'; 
    }
}

