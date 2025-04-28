# Supabase Authentication Configuration

This file contains the configuration for setting up authentication in the Football Match Predictor application.

## Authentication Setup

1. Enable Email/Password authentication in the Supabase dashboard:
   - Go to Authentication > Providers
   - Enable Email provider
   - Configure password requirements as needed

2. Configure site URL and redirect URLs:
   - Go to Authentication > URL Configuration
   - Set Site URL to your deployed application URL
   - Add redirect URLs for successful sign-in/sign-up

3. Email templates:
   - Customize email templates for confirmation, password reset, etc.
   - Go to Authentication > Email Templates

## User Management

The application will use the following user roles:

1. **Anonymous Users**:
   - Can view upcoming matches and predictions
   - Cannot make custom predictions

2. **Authenticated Users**:
   - Can view all predictions
   - Can create custom match predictions
   - Can save favorite teams for quick access

3. **Admin Users**:
   - Can manage the data collection process
   - Can view API usage statistics
   - Can update tactical vectors manually

## Row-Level Security Policies

The following RLS policies should be implemented:

```sql
-- Enable RLS on tables
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE enhanced_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- Public access policies (read-only)
CREATE POLICY "Public can view leagues" ON leagues
  FOR SELECT USING (true);

CREATE POLICY "Public can view teams" ON teams
  FOR SELECT USING (true);

CREATE POLICY "Public can view fixtures" ON fixtures
  FOR SELECT USING (true);

CREATE POLICY "Public can view predictions" ON predictions
  FOR SELECT USING (true);

-- Admin-only tables
CREATE POLICY "Only admins can view API logs" ON api_logs
  FOR SELECT USING (auth.role() = 'admin');

CREATE POLICY "Only admins can modify tactical vectors" ON tactical_vectors
  FOR ALL USING (auth.role() = 'admin');

-- Admin can modify all data
CREATE POLICY "Admins have full access" ON leagues
  FOR ALL USING (auth.role() = 'admin');

CREATE POLICY "Admins have full access" ON teams
  FOR ALL USING (auth.role() = 'admin');

CREATE POLICY "Admins have full access" ON managers
  FOR ALL USING (auth.role() = 'admin');

CREATE POLICY "Admins have full access" ON fixtures
  FOR ALL USING (auth.role() = 'admin');

CREATE POLICY "Admins have full access" ON team_stats
  FOR ALL USING (auth.role() = 'admin');

CREATE POLICY "Admins have full access" ON tactical_matchups
  FOR ALL USING (auth.role() = 'admin');

CREATE POLICY "Admins have full access" ON enhanced_matches
  FOR ALL USING (auth.role() = 'admin');

CREATE POLICY "Admins have full access" ON predictions
  FOR ALL USING (auth.role() = 'admin');
```

## User Profiles Table

Create a user profiles table to store additional user information:

```sql
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  full_name TEXT,
  favorite_teams INTEGER[] DEFAULT '{}',
  favorite_leagues INTEGER[] DEFAULT '{}',
  notification_preferences JSONB DEFAULT '{}'
);

-- Set up RLS for user profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Admins have full access to all profiles
CREATE POLICY "Admins have full access to profiles" ON user_profiles
  FOR ALL USING (auth.role() = 'admin');
```

## Authentication in the UI

The UI will implement authentication using the Supabase JavaScript client:

```javascript
// Sign up
const { user, error } = await supabase.auth.signUp({
  email: 'example@email.com',
  password: 'example-password',
});

// Sign in
const { user, error } = await supabase.auth.signIn({
  email: 'example@email.com',
  password: 'example-password',
});

// Sign out
const { error } = await supabase.auth.signOut();

// Get current user
const user = supabase.auth.user();
```

The UI will show different options based on the user's authentication status.
