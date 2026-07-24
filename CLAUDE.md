# Prova — AI Music Practice Coach

## Project Overview
Prova is an AI-powered music practice coach mobile app for guitar and bass players. It solves three core problems: no structured practice plan, no accountability on time, and no progress tracking.

The app serves **two roles from one codebase**: students and teachers. A user's `role` field decides which tab bar they get (see Navigation below) — this is the single most important structural fact about the app.

## Tech Stack
- **Framework**: Expo SDK 54 + React Native (JavaScript only — no TypeScript, no .tsx files)
- **Backend**: Firebase (Firestore database, Firebase Auth)
- **AI**: Claude API via raw fetch (NOT the Anthropic SDK — it doesn't work in React Native)
- **Navigation**: React Navigation v6 (native stack + bottom tabs)
- **Analytics**: PostHog (`src/lib/analytics.js`)

## Navigation
`App.js` builds the whole tree. Two different tab bars, chosen by `isTeacher`:

**Student tabs** — Today · Practice · Progress · Messages · Profile
**Teacher tabs** — Home · Students · Resources · Messages · Profile

Tabs are mounted with `lazy: false` (everything loads at app start, so tab switches and the guided tour never show a cold-load spinner). Students also get a floating `<MetronomePill />` that survives tab switches.

Each tab is a stack:

| Stack | Screens |
|---|---|
| **Today** | TodayHome, CreatePlan, LessonNotes, Notifications |
| **Practice** | PracticeHome, Songs, Schedule, Library, ChordLibrary, EarTraining, FretboardGame, RhythmTapper, TheoryQuiz, Journal, LearnSong, LessonNotes |
| **Progress** | ProgressHome, SkillTree |
| **Teacher Home** | TeacherHomeMain, TeacherCalendar, TeacherOverview, LessonNote, Packs, Notifications |
| **Resources** (teacher) | ResourcesHome, EarTraining, FretboardGame, RhythmTapper, TheoryQuiz |

`AskProva` is a modal pushed above the tabs from anywhere.

## Project Structure
```
prova/
├── App.js                          # Entry point — navigation, role split, auth routing
├── index.js                        # Expo root component registration
├── app.json                        # Expo config (SDK version, icons, etc.)
├── src/
│   ├── components/                 # Shared UI (see below)
│   ├── constants/                  # Static data + theme (see below)
│   ├── contexts/AuthContext.js
│   ├── hooks/                      # useAuth, useKeyboardInset, useMaintenance
│   ├── lib/                        # Firebase, Claude, and feature logic (see below)
│   └── screens/
│       ├── MaintenanceScreen.js
│       ├── auth/                   # Welcome, Login, Signup
│       ├── onboarding/             # OnboardingFlow + 5 steps, FirstWin,
│       │                           #   CreatePlanScreen, TeacherOnboarding
│       └── tabs/                   # 26 screens — see table below
```

### Screens (`src/screens/tabs/`)
**Student**
| File | What it is |
|---|---|
| `TodayScreen.js` | Daily practice + per-task timer. The app's home. |
| `PracticeScreen.js` | Practice hub — entry point to songs, drills, games |
| `ProgressScreen.js` | Streak, hours, level, Prova Score, charts |
| `SkillTreeScreen.js` | Progression map, 4 lanes, unlocks from cumulative stats |
| `SongsScreen.js` | Song library + gig setlists |
| `LearnSongScreen.js` | AI-generated step-by-step plan for learning one song |
| `ScheduleScreen.js` | Weekly plan / calendar view |
| `JournalScreen.js` | Private reflection log — focus, productivity 1–5, mood |
| `LibraryScreen.js` / `ChordLibraryScreen.js` | Reference material, chord shapes |
| `ProfileScreen.js` | Account, theme, settings, logout |

**Mini-games** (shared by both roles)
| File | What it is |
|---|---|
| `EarTrainingScreen.js` | Intervals + chord quality by ear. No mic needed. |
| `FretboardGameScreen.js` | "Find the note" — taps the right fret |
| `RhythmTapperScreen.js` | Tap in time to a click, scored on accuracy |
| `TheoryQuizScreen.js` | Multiple-choice theory, generated on the fly |

**Teacher**
| File | What it is |
|---|---|
| `TeacherScreen.js` | Student roster + dashboard. Largest file in the app (~4k lines). |
| `TeacherHomeScreen.js` | Teacher landing |
| `TeacherCalendarScreen.js` | Lesson scheduling |
| `TeacherOverviewScreen.js` | Cross-student overview |
| `LessonNoteScreen.js` / `StudentLessonNoteScreen.js` | Lesson notes, teacher + student side |
| `PacksScreen.js` | Assignable content packs |
| `ResourceLibraryScreen.js` | Teaching resources |

**Shared** — `MessagesScreen.js` (chat), `NotificationsScreen.js`, `AskProvaScreen.js` (AI chat modal)

### `src/lib/`
| File | Purpose |
|---|---|
| `firebase.js` | Firebase client (Auth + Firestore) |
| `claude.js` | Claude API calls via fetch |
| `entitlements.js` | **Free/paid split — currently switched OFF, see Free Launch below** |
| `score.js` | Prova Score — ever-increasing XP, banked per session |
| `badges.js` | Badge engine + awarding |
| `practiceLog.js` | Shared "real practice happened" accounting |
| `teacher.js` | Teacher ↔ student linking |
| `chat.js`, `groupChat.js`, `inbox.js`, `chatTime.js` | Messaging |
| `notifications.js` | Local practice reminders — on-device, no push server |
| `analytics.js` | PostHog. Tracks which features get used, never message content. |
| `ThemeContext.js` | App-wide palette (mode + accent) |
| `MetronomeContext.js` | Global metronome state — powers `<MetronomePill />` |
| `spotify.js`, `youtube.js`, `media.js` | Integrations + media handling |
| `livegig.js`, `programs.js`, `progressReport.js` | Gig mode, programs, parent reports |
| `displayName.js`, `savedLogin.js`, `webAlert.js` | Small helpers |

### `src/components/`
`PracticePlayer` · `PracticeWrapped` · `PerformanceMode` · `MetronomePill` · `ChordDiagram` · `ScaleDiagram` · `Celebration` · `TourOverlay` / `TourSpot` (guided tour) · `IntroSplash` · `SheetModal` · `TimeWheel` · `DueDatePicker` · `EmptyState` · `Ghost` · `GroupChatView` · `MediaMessageBubble` · `ProofMedia` · `Reactions` · `StudentKeeperModal` · `YouTubePlayerModal`

*(`.web.js` variants exist for `IntroSplash` and `YouTubePlayerModal`.)*

### `src/constants/`
`theme.js` (colors, spacing) · `library.js` · `songs.js` · `drills.js` · `challenges.js` · `badges.js` · `chords.js` · `scales.js` · `notes.js` · `pianoNotes.js` · `theory.js` · `resources.js`

## Free Launch (Apple 3.1.1) — read before touching anything paid
The App Store requires purchasable digital content to be sold through Apple IAP. Until a real StoreKit paywall ships, **the app sells nothing**: every account is fully unlocked and there are zero purchase surfaces.

All of this lives in `src/lib/entitlements.js`, deliberately switched off:
- `isPersonal()` and `isProTeacher()` hard-return `true`
- `allowGameRound()` always allows
- Upsell prompts are no-ops

The standalone `PaywallScreen.js` was deleted. `TeacherScreen.js` keeps an unrendered `PaywallScreen` stub. The real gating logic is in git history and gets re-enabled alongside the IAP paywall.

**Do not add any upgrade button, plan name, or purchase surface** without the StoreKit work landing first — it's what got the app rejected.

## Git Workflow
Two developers (Cohnor and Ethan) work on this repo simultaneously, both using Claude Code.
`master` is **not** protected by required reviews — no approval is needed to merge. Each developer's work stands on its own; you do not need to wait on or request review from the other developer.

1. Before starting any work, create a branch:
   ```bash
   git checkout master && git pull
   git checkout -b <your-name>/<short-description>
   # e.g. cohnor/timer-lock  or  ethan/practice-screen
   ```
2. Make all commits on that branch.
3. When done, push and merge it yourself:
   ```bash
   git push -u origin <branch-name>
   gh pr create --fill && gh pr merge --merge --delete-branch
   ```
   You may merge your own PR. Do **not** block on the other developer reviewing it.

Branch naming: `cohnor/<feature>` or `ethan/<feature>`. Keep branches short-lived (one feature per branch).

If `master` is ahead of your branch before you push, rebase:
```bash
git fetch origin && git rebase origin/master
```

## Key Rules
- All files must be `.js` — never `.ts` or `.tsx`
- Never use `import ... from 'firebase/analytics'` — analytics is browser-only and crashes React Native
- Never import `@anthropic-ai/sdk` — use raw fetch in `src/lib/claude.js` instead
- Firebase Auth uses `initializeAuth` with `getReactNativePersistence(AsyncStorage)` — not `getAuth()`
- Claude API key goes in an `.env` file as `ANTHROPIC_API_KEY` — never hardcoded
- `Alert.alert` is a no-op on react-native-web — use `src/lib/webAlert.js`
- Anything role-specific must work for both students and teachers, or be gated on `role`

## Firebase Firestore Schema
```
users/{uid}
  email: string
  role: "student" | "teacher" | "personal"
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
  provaScore: number (ever-increasing XP, banked per session — src/lib/score.js)
  totalMinutes: number
  lastSessionRating: string
  lastSessionDate: ISO string
  lastChallengeDate: ISO string (daily challenge — src/constants/challenges.js)
  songLibrary: { id, title, artist, addedAt }[]
  setlists: { id, name, setting, audience, vibe, createdAt,
              songs: { id, title, artist, note, fromLibrary }[] }[]
  journalEntries: {...}[]
  badges: {...}
  theme / accent: UI preferences
  teacherPlan: "pro" | ... (teacher tier — inert during free launch)
```
Not exhaustive — features add fields as they land.

## Environment Variables
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude plan generation

## Running the App
```bash
npx expo start
```
Scan the QR code with Expo Go (SDK 54) on your phone.

## Feature Status
**Shipped**
- [x] Auth (signup/login) + 5-step onboarding
- [x] AI practice plan generation (Claude)
- [x] Daily practice view with per-task timer
- [x] Session rating + feedback
- [x] Weekly plan calendar view
- [x] Progress screen (streak, hours, level)
- [x] Prova Score — ever-increasing XP (`src/lib/score.js`)
- [x] Daily challenge / streak-saver (`src/constants/challenges.js`)
- [x] Pre-gig mode — AI setlist generator + library playlists
- [x] Song library + Learn-a-Song step plans
- [x] Skill tree progression
- [x] Practice journal
- [x] Mini-games — ear training, fretboard, rhythm, theory quiz
- [x] Teacher mode — roster, lesson notes, calendar, packs, parent reports
- [x] Messaging (1:1 + group)
- [x] Badges
- [x] Local practice reminders (`src/lib/notifications.js`)
- [x] Spotify playlist export · YouTube search
- [x] Global metronome · themes (mode + accent) · guided tour

**Not built**
- Song DNA matching
- Voice check-in after sessions
- Backing track library
- Community + leaderboards
- Milestone certificates
- Real StoreKit IAP paywall (see Free Launch above)

## GitHub
Repository: https://github.com/cohnor08/prova (private)
