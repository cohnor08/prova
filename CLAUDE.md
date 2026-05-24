# Prova — AI Music Practice Coach

## Project Overview
Prova is an AI-powered music practice coach mobile app for guitar and bass players. It solves three core problems: no structured practice plan, no accountability on time, and no progress tracking.

## Tech Stack
- **Framework**: Expo SDK 54 + React Native (JavaScript only — no TypeScript, no .tsx files)
- **Backend**: Firebase (Firestore database, Firebase Auth)
- **AI**: Claude API via raw fetch (NOT the Anthropic SDK — it doesn't work in React Native)
- **Navigation**: React Navigation v6 (native stack + bottom tabs)

## Project Structure
```
prova/
├── App.js                          # Entry point — navigation + auth routing
├── index.js                        # Expo root component registration
├── app.json                        # Expo config (SDK version, icons, etc.)
├── src/
│   ├── constants/theme.js          # Colors, spacing, app-wide constants
│   ├── hooks/useAuth.js            # Firebase auth state listener
│   ├── lib/
│   │   ├── firebase.js             # Firebase client (Auth + Firestore)
│   │   └── claude.js              # Claude API calls via fetch
│   └── screens/
│       ├── auth/
│       │   ├── LoginScreen.js
│       │   └── SignupScreen.js
│       ├── onboarding/
│       │   ├── OnboardingFlow.js   # Orchestrates all 5 onboarding steps
│       │   ├── OnboardingInstrument.js
│       │   ├── OnboardingLevel.js
│       │   ├── OnboardingGoals.js
│       │   ├── OnboardingSchedule.js
│       │   └── OnboardingGenerating.js
│       └── tabs/
│           ├── TodayScreen.js      # Daily practice + per-task timer
│           ├── PlanScreen.js       # Full weekly plan view
│           ├── ProgressScreen.js   # Streak, hours, level
│           └── ProfileScreen.js    # Account info + logout
```

## Key Rules
- All files must be `.js` — never `.ts` or `.tsx`
- Never use `import ... from 'firebase/analytics'` — analytics is browser-only and crashes React Native
- Never import `@anthropic-ai/sdk` — use raw fetch in `src/lib/claude.js` instead
- Firebase Auth uses `initializeAuth` with `getReactNativePersistence(AsyncStorage)` — not `getAuth()`
- Claude API key goes in an `.env` file as `ANTHROPIC_API_KEY` — never hardcoded

## Firebase Firestore Schema
```
users/{uid}
  email: string
  createdAt: ISO string
  onboardingComplete: boolean
  instrument: "Guitar" | "Bass"
  level: "Beginner" | "Novice" | "Intermediate" | "Advanced" | "Elite"
  goals: string[]
  skills: string[]
  availableDays: string[]
  dailyDuration: number (minutes)
  practicePlan: { weeklyPlan: { monday: {...}, ... } }
  planGeneratedAt: ISO string
  streak: number
  totalMinutes: number
  lastSessionRating: string
  lastSessionDate: ISO string
```

## Environment Variables
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude plan generation

## Running the App
```bash
npx expo start
```
Scan the QR code with Expo Go (SDK 54) on your phone.

## MVP Feature Scope
- [x] Auth (signup/login)
- [x] 5-step onboarding
- [x] AI practice plan generation (Claude)
- [x] Daily practice view with per-task timer
- [x] Session rating + feedback
- [x] Weekly plan calendar view
- [x] Progress screen (streak, hours, level)

## Phase 2 Features (not yet built)
- Prova Score (single number out of 1000)
- Song DNA matching
- Voice check-in after sessions
- Backing track library
- Pre-gig mode
- Community + leaderboards
- Teacher mode
- Milestone certificates
- Daily challenge (streak-saver)
- Push notification reminders

## GitHub
Repository: https://github.com/cohnor08/prova (private)
