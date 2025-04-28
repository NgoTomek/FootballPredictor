# Football Match Predictor - Supabase Edition

This project hosts a football match prediction model on Supabase, featuring continuous data collection and a simple web UI for users to view predictions and make custom match forecasts.

## Project Overview

The system combines manager tactical styles with team performance metrics to predict football match outcomes. It leverages Supabase for database storage, authentication, and serverless functions, along with API-Football for real-time data.

**Key Features:**

*   **Database:** PostgreSQL database on Supabase storing leagues, teams, managers, tactical vectors, fixtures, team stats, predictions, and logs.
*   **Data Collection:** A Supabase Edge Function (`data-collection`) runs periodically (or can be triggered manually) to fetch the latest data from API-Football, update team stats, calculate tactical matchups, and generate predictions for upcoming matches.
*   **Web UI:** A responsive web interface (`index.html`, `app.js`) allows users to:
    *   View upcoming matches and their predictions.
    *   Filter matches by league and date range.
    *   Make custom predictions by selecting home and away teams.
    *   View detailed prediction probabilities and key tactical insights.
*   **Authentication:** Supabase Auth is configured for user sign-up/sign-in, with Row-Level Security (RLS) policies protecting the data.
*   **Model:** A pre-trained CatBoost model (`best_model.pkl`) and scaler (`scaler.pkl`) are used for predictions (Note: The current implementation uses a heuristic in the UI and Edge Function for demonstration; integrating the actual model requires a dedicated backend or more complex Edge Function setup).

## Repository Contents

*   `index.html`: The main HTML file for the web UI.
*   `app.js`: JavaScript code for the web UI, interacting with Supabase.
*   `database_schema.sql`: SQL script to set up the database tables and functions in Supabase.
*   `data_collection.py`: Python script (run locally or adapted) for initial data population and feature calculation.
*   `supabase/functions/data-collection/index.ts`: Supabase Edge Function for continuous data collection and prediction updates.
*   `auth_config.md`: Documentation on setting up Supabase authentication and RLS policies.
*   `best_model.pkl`: The trained prediction model (CatBoost).
*   `scaler.pkl`: The scaler used for feature preprocessing.
*   `manager_tactical_vectors.csv`: CSV file containing the base tactical vectors for managers.
*   `README.md`: This file.

## Setup Instructions

1.  **Supabase Project:**
    *   Create a new Supabase project.
    *   Navigate to the SQL Editor.
    *   Copy and paste the contents of `database_schema.sql` and run it to create the necessary tables, functions, and triggers.
    *   Configure Authentication as described in `auth_config.md` (Enable Email provider, set URLs, apply RLS policies).

2.  **Environment Variables:**
    *   Set the following environment variables in your Supabase project settings (Project Settings > Edge Functions):
        *   `SUPABASE_URL`: Your Supabase project URL.
        *   `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key.
        *   `API_FOOTBALL_KEY`: Your API-Football API key.

3.  **Deploy Edge Function:**
    *   Install the Supabase CLI: `npm install supabase --save-dev`
    *   Log in: `npx supabase login`
    *   Link your project: `npx supabase link --project-ref <your-project-ref>`
    *   Deploy the function: `npx supabase functions deploy data-collection --no-verify-jwt`
    *   **(Optional) Schedule the Function:** Supabase allows scheduling Edge Functions via `cron`. You can set this up in the Supabase dashboard (Database > Functions > Schedules) or via the CLI to run the `data-collection` function periodically (e.g., daily).
        *Example Cron:* `0 0 * * *` (runs daily at midnight UTC).
        *Note:* Automatic scheduling might be subject to platform limitations or require paid plans.

4.  **Initial Data Population:**
    *   You may need to run the `data_collection.py` script locally first to populate the initial manager tactical vectors and potentially other historical data. Ensure you have Python and necessary libraries (`requests`, `pandas`, `supabase-py`, `numpy`) installed.
    *   Update the Supabase URL/Key and API Key within the script if running locally.
    *   Place `manager_tactical_vectors.csv`, `best_model.pkl`, and `scaler.pkl` in the same directory as the script.
    *   Run: `python data_collection.py`

5.  **Web UI:**
    *   Update the `supabaseUrl` and `supabaseAnonKey` in `app.js` with your Supabase project details.
    *   Host the `index.html` and `app.js` files on a static web hosting provider (e.g., Vercel, Netlify, GitHub Pages, or Supabase Storage).

## Usage

*   **Data Collection:** The `data-collection` Edge Function will automatically fetch new fixtures, update team stats, calculate matchups, and generate predictions based on its schedule or when triggered manually.
*   **Web UI:** Access the hosted `index.html` file in your browser.
    *   Browse upcoming matches and their predictions.
    *   Use the custom prediction section to select two teams and get an instant prediction.
    *   Click "Detailed Analysis" on upcoming matches to see the full prediction breakdown.

## Important Notes

*   **Model Integration:** The current `app.js` and `data-collection/index.ts` use a *heuristic* for predictions for demonstration purposes, as running complex Python models directly in the browser or standard Edge Functions is challenging. For production, you would typically:
    *   Create a dedicated backend API (e.g., using Python Flask/FastAPI) to serve predictions from the `.pkl` model.
    *   Or, explore more advanced serverless options that support Python runtimes if available on Supabase or integrate with external services.
*   **API Rate Limits:** Be mindful of the API-Football rate limits. The data collection scripts include basic checks, but adjust the frequency of scheduled runs accordingly.
*   **Elo Calculation:** The Elo rating calculation in the scripts is basic. For more accurate ratings, consider implementing a more standard Elo algorithm.
*   **Security:** Ensure your Supabase service role key and API keys are kept secure and are not exposed in client-side code. Use environment variables for Edge Functions.

## Maintenance

*   Monitor the execution logs of the `data-collection` Edge Function for errors.
*   Periodically update the `manager_tactical_vectors.csv` if new manager data becomes available and re-run the `load_tactical_vectors` part of the data collection process.
*   Retrain the `best_model.pkl` and `scaler.pkl` as needed with new data and update the files in the repository/deployment.
