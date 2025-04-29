// Initialize Supabase client
const supabaseUrl = 'https://tuuadmjplkzceervaezn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1dWFkbWpwbGt6Y2VlcnZhZXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTExMTMsImV4cCI6MjA2MTQyNzExM30.cXGG5WbnUuWRAzlw9Hr_EWz8CEJl-b94zo6S8MENeCY';
// Fix: Use the global Supabase object correctly
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
                predictions(home_win_probability, draw_probability, away_win_probability, predicted_outcome)
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
        
        // Add this line for debugging:
        console.log("Upcoming Fixture IDs:", fixtures ? fixtures.map(f => f.id) : 'No fixtures found');
        
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
        let fixturesHtml = '<div class="row">';
        
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
                
                let resultText = prediction.predicted_outcome; // Use the text outcome directly
                let resultClass = '';
                
                // Set class based on the text outcome
                if (resultText === 'Home Win') {
                    resultClass = 'text-primary';
                } else if (resultText === 'Draw') {
                    resultClass = 'text-secondary';
                } else if (resultText === 'Away Win') {
                    resultClass = 'text-danger';
                } else { // Handle potential null or unexpected values
                    resultText = 'N/A'; 
                    resultClass = 'text-muted';
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
                                    <img src="${homeTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${homeTeam.name}" class="team-logo mb-2">
                                    <h6 class="mb-0">${homeTeam.name}</h6>
                                </div>
                                <div class="col-4 text-center">
                                    <div class="vs-badge">VS</div>
                                </div>
                                <div class="col-4 text-center">
                                    <img src="${awayTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${awayTeam.name}" class="team-logo mb-2">
                                    <h6 class="mb-0">${awayTeam.name}</h6>
                                </div>
                            </div>
                            ${predictionHtml}
                        </div>
                    </div>
                </div>
            `;
        });
        
        fixturesHtml += '</div>';
        upcomingMatchesContainer.innerHTML = fixturesHtml;
    } catch (error) {
        console.error('Error loading upcoming matches:', error);
        upcomingMatchesContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error loading matches: ${error.message}
            </div>
        `;
    }
}

// Handle custom prediction form submission
async function handleCustomPrediction(e) {
    e.preventDefault();
    
    try {
        // Get selected teams
        const homeTeamId = homeTeamSelect.value;
        const awayTeamId = awayTeamSelect.value;
        
        if (!homeTeamId || !awayTeamId) {
            throw new Error('Please select both home and away teams.');
        }
        
        if (homeTeamId === awayTeamId) {
            throw new Error('Home and away teams cannot be the same.');
        }
        
        // Show loading state
        predictionResultContainer.innerHTML = `
            <div class="loading mt-4">
                <div class="spinner-border text-success" role="status">
                    <span class="visually-hidden">Generating prediction...</span>
                </div>
                <div class="mt-2">Generating prediction...</div>
            </div>
        `;
        
        // Get team and manager data
        const homeTeam = allTeams.find(team => team.id.toString() === homeTeamId);
        const awayTeam = allTeams.find(team => team.id.toString() === awayTeamId);
        
        if (!homeTeam || !awayTeam) {
            throw new Error('Selected teams not found in database.');
        }
        
        // Call prediction API
        const { data: prediction, error } = await supabase
            .rpc('predict_match', {
                p_home_team_id: parseInt(homeTeamId),
                p_away_team_id: parseInt(awayTeamId)
            });
        
        if (error) throw error;
        
        if (!prediction) {
            throw new Error('Failed to generate prediction. Please try again.');
        }
        
        // Format probabilities
        const homeWinProb = Math.round(prediction.home_win_probability * 100);
        const drawProb = Math.round(prediction.draw_probability * 100);
        const awayWinProb = Math.round(prediction.away_win_probability * 100);
        
        // Determine predicted result
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
        
        // Render prediction result
        predictionResultContainer.innerHTML = `
            <div class="card prediction-card mt-4">
                <div class="card-body">
                    <h4 class="card-title">Match Prediction</h4>
                    <div class="row align-items-center mb-3">
                        <div class="col-4 text-center">
                            <img src="${homeTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${homeTeam.name}" class="team-logo mb-2">
                            <h6 class="mb-0">${homeTeam.name}</h6>
                        </div>
                        <div class="col-4 text-center">
                            <div class="vs-badge">VS</div>
                        </div>
                        <div class="col-4 text-center">
                            <img src="${awayTeam.logo_url || 'https://via.placeholder.com/50'}" alt="${awayTeam.name}" class="team-logo mb-2">
                            <h6 class="mb-0">${awayTeam.name}</h6>
                        </div>
                    </div>
                    
                    <div class="mt-4">
                        <h5>Predicted Result: <span class="${resultClass}">${resultText}</span></h5>
                        <div class="progress mb-2" style="height: 25px;">
                            <div class="progress-bar progress-bar-home" role="progressbar" style="width: ${homeWinProb}%" title="Home Win: ${homeWinProb}%">
                                ${homeWinProb}%
                            </div>
                            <div class="progress-bar progress-bar-draw" role="progressbar" style="width: ${drawProb}%" title="Draw: ${drawProb}%">
                                ${drawProb}%
                            </div>
                            <div class="progress-bar progress-bar-away" role="progressbar" style="width: ${awayWinProb}%" title="Away Win: ${awayWinProb}%">
                                ${awayWinProb}%
                            </div>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span>${homeTeam.name} Win</span>
                            <span>Draw</span>
                            <span>${awayTeam.name} Win</span>
                        </div>
                    </div>
                    
                    <div class="mt-4">
                        <h5>Key Factors</h5>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <div class="d-flex justify-content-between mb-1">
                                        <span>Team Strength</span>
                                        <span>60%</span>
                                    </div>
                                    <div class="progress feature-importance">
                                        <div class="progress-bar feature-bar" role="progressbar" style="width: 60%"></div>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <div class="d-flex justify-content-between mb-1">
                                        <span>Tactical Approach</span>
                                        <span>40%</span>
                                    </div>
                                    <div class="progress feature-importance">
                                        <div class="progress-bar feature-bar" role="progressbar" style="width: 40%"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <div class="d-flex justify-content-between mb-1">
                                        <span>Home Advantage</span>
                                        <span>25%</span>
                                    </div>
                                    <div class="progress feature-importance">
                                        <div class="progress-bar feature-bar" role="progressbar" style="width: 25%"></div>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <div class="d-flex justify-content-between mb-1">
                                        <span>Recent Form</span>
                                        <span>35%</span>
                                    </div>
                                    <div class="progress feature-importance">
                                        <div class="progress-bar feature-bar" role="progressbar" style="width: 35%"></div>
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
            <div class="alert alert-danger mt-4">
                <i class="bi bi-exclamation-triangle"></i> ${error.message || 'Error generating prediction. Please try again.'}
            </div>
        `;
    }
}
