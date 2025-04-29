        // Call prediction API
        const { data: predictionData, error } = await supabase
            .rpc("predict_match", {
                p_home_team_id: parseInt(homeTeamId),
                p_away_team_id: parseInt(awayTeamId)
            });

        // DEBUG: Log the raw response data
        console.log("Raw prediction response:", predictionData);
        
        if (error) throw error;
        
        // Check if data is an array and has at least one element
        if (!predictionData || !Array.isArray(predictionData) || predictionData.length === 0) {
            throw new Error("Failed to generate prediction or received empty data. Please try again.");
        }

        // Access the first element of the array
        const prediction = predictionData[0];

        // DEBUG: Log the extracted prediction object
        console.log("Extracted prediction object:", prediction);
        
        // Format probabilities
        const homeWinProb = Math.round(prediction.home_win_probability * 100);
        const drawProb = Math.round(prediction.draw_probability * 100);
        const awayWinProb = Math.round(prediction.away_win_probability * 100);

        // Determine predicted result
        let resultText = "";
        let resultClass = "";
        
        if (prediction.predicted_result === 1) {
            resultText = "Home Win";
            resultClass = "text-primary";
        } else if (prediction.predicted_result === 0) {
            resultText = "Draw";
            resultClass = "text-secondary";
        } else {
            resultText = "Away Win";
            resultClass = "text-danger";
        }
        
        // Render prediction result
        predictionResultContainer.innerHTML = `
            <div class="card prediction-card mt-4">
                <div class="card-body">
                    <h4 class="card-title">Match Prediction</h4>
                    <div class="row align-items-center mb-3">
                        <div class="col-4 text-center">
                            <img src="${homeTeam.logo_url || "https://via.placeholder.com/50"}" alt="${homeTeam.name}" class="team-logo mb-2">
                            <h6 class="mb-0">${homeTeam.name}</h6>
                        </div>
                        <div class="col-4 text-center">
                            <div class="vs-badge">VS</div>
                        </div>
                        <div class="col-4 text-center">
                            <img src="${awayTeam.logo_url || "https://via.placeholder.com/50"}" alt="${awayTeam.name}" class="team-logo mb-2">
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
                    
                    <!-- Removed Key Factors section as the simplified function doesn't provide this -->
                </div>
            </div>
        `;
    } catch (error) {
        console.error("Error generating prediction:", error);
        predictionResultContainer.innerHTML = `
            <div class="alert alert-danger mt-4">
                <i class="bi bi-exclamation-triangle"></i> ${error.message || "Error generating prediction. Please try again."}
            </div>
        `;
    }
}

