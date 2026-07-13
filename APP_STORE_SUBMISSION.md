# Prova — App Store Submission Pack

Everything needed to submit Prova to the App Store, in one place.
Last updated: 12 July 2026 · Prepared for Ethan & Cohnor.

---

## 1. Current status

| Item | Status |
|---|---|
| Production build v1.0.1 (build 3) — new icon, animated intro, account deletion | 🔨 building on EAS |
| Previous build v1.0.0 (2) | ✅ uploaded to TestFlight (superseded — use 1.0.1) |
| Privacy Policy (public URL) | ✅ live |
| Terms & Conditions (public URL) | ✅ live |
| Support page (public URL) | ✅ live |
| In-app account deletion (Apple requirement 5.1.1(v)) | ✅ in v1.0.1 (Profile → Delete account) |
| Encryption compliance flag | ✅ set (`ITSAppUsesNonExemptEncryption: false`) |
| App icon + launch screen | ✅ in v1.0.1 (brand ring + PROVA) |
| iPad support | ❌ deliberately OFF for v1 (untested UI; halves screenshot work; can re-add later) |
| Screenshots | ⬜ TO DO (see §6) |
| App Store Connect metadata (name/subtitle/description/etc.) | ⬜ TO DO — copy ready below, paste into ASC |
| App Privacy questionnaire | ⬜ TO DO — answers in §7 |
| Age rating questionnaire | ⬜ TO DO — guidance in §8 |
| Demo accounts for the reviewer | ⬜ TO DO (see §9) |
| Mock paywall switched OFF before review | ⬜ TO DO — **required**, see §10 |

---

## 2. Identity & URLs

| Field | Value |
|---|---|
| App Store name | **Prova: Practice & Progress** |
| Subtitle | **Your AI music practice coach** |
| Bundle ID | `com.ethanlam.prova` |
| ASC App ID | `6789881436` (currently named "prova (ec54f8)" — **rename it** in ASC → App Information) |
| SKU | EX1783765385958 (auto-generated, fine) |
| Privacy Policy URL | https://prova-583c9.web.app/privacy.html |
| Terms URL | https://prova-583c9.web.app/terms.html |
| Support URL | https://prova-583c9.web.app/support.html |
| Marketing URL (optional) | https://prova-583c9.web.app |
| Copyright | © 2026 Prova |
| Primary category | Education |
| Secondary category | Music |
| Price | Free |

---

## 3. Description (paste into ASC)

> Prova is your music practice coach — built for guitar and bass players who want to actually improve, and for the teachers who guide them.
>
> A DAILY PLAN THAT FITS YOU
> Tell Prova your instrument, level, and goals, and it builds a personalised practice plan — concrete exercises with exact tempos, frets, and techniques. Rate how a session felt and your plan adapts.
>
> PRACTICE THAT FEELS LIKE PROGRESS
> A guided practice player walks you through each task. Earn points, build streaks, unlock ranks, and watch your practice hours stack up in beautiful charts.
>
> EVERYTHING IN ONE PLACE
> • Chromatic tuner and smart metronome with speed trainer
> • Chord & scale library with clear diagrams
> • Song library, AI gig setlists, and a learn-a-song step planner
> • Lesson library packed with technique topics
> • Ask Prova — your AI coach for any playing question
>
> BUILT FOR REAL TEACHERS
> Teachers get a full studio toolkit: student rosters with join codes, assignments with proof-of-practice videos, lesson calendar with attendance and notes, reusable lesson packs and multi-week programs, class groups with leaderboards, and automatic weekly practice reports emailed to parents.
>
> SAFE FOR SCHOOLS
> Student messaging is locked to teacher↔student only — no student-to-student private chats, enforced on our servers.
>
> Whether you're picking up a guitar for the first time or running a teaching studio, Prova keeps practice on track. Play. Practice. Perform.

**Promotional text** (170 chars, editable anytime without review):
> Your AI music coach for guitar & bass — daily practice plans, streaks, tuner and metronome, plus a full studio toolkit for teachers. 

**Keywords** (100 chars max, don't repeat words from name/subtitle):
```
guitar,bass,lessons,teacher,metronome,tuner,chords,scales,streak,habit,learn,student
```

**What's New (v1.0.1):**
> First public release of Prova — your AI practice coach for guitar and bass.

---

## 4. Version & build numbering

- Version: **1.0.1** (`app.json` → `version`) — bump this for each App Store release.
- Build number: **auto-increments on every EAS production build** (`autoIncrement: true`, managed remotely). Nobody ever sets it by hand.
- Rebuild + submit commands:
  ```
  eas build --profile production --platform ios
  eas submit --platform ios --latest
  ```

---

## 5. What was submitted where

- `eas submit` uploads the build to **TestFlight** (internal testing — add yourselves as Internal Testers in ASC → TestFlight).
- The **App Store release** is separate: in ASC → App Store tab → create version 1.0.1 → attach the build → fill metadata (§2–§3) → answer §7–§8 → **Submit for Review**.

---

## 6. Screenshots — exact sizes

Apple requires **iPhone 6.9-inch screenshots: 1320 × 2868 px, portrait PNG/JPG** (3–10 images; the first 3 matter most). iPad is NOT required (tablet support is off).

**How we'll do it:** take screenshots on the iPhone (side button + volume up) of these screens, in this order:

1. **Today** — student account with a plan, streak chip, sessions visible
2. **Practice Player** — mid-task with the timer running
3. **Progress** — charts with real data + rank ring
4. **Chords & Scales library** — diagrams grid
5. **Teacher Home** — Practice Pulse + calendar widgets
6. **Songs & Setlists** or **Ask Prova** chat

Then drop the raw screenshots in a folder and ask Claude to resize — the exact command per image is:
```
sips -z 2868 1320 input.png --out output.png
```
(iPhone screenshots are a slightly different ratio; the resize is a hair of stretch nobody can see. Use clean accounts — real-looking data, full battery/wifi in the status bar, no debug markers.)

---

## 7. App Privacy questionnaire (ASC → App Privacy)

Answer **"Yes, we collect data"**, no tracking, no third-party advertising. Data types:

| ASC data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | No | App functionality (account) |
| User Content → Photos or Videos | Yes | Yes | No | App functionality (proof clips, chat media) |
| User Content → Other User Content | Yes | Yes | No | App functionality (messages, practice data, profile) |
| Identifiers → User ID | Yes | Yes | No | App functionality |
| Usage Data → Product Interaction | Yes | Yes | No | Analytics (PostHog — added after build 4; tick this when the analytics build/OTA ships) |
| Everything else (location, contacts, browsing, purchases, diagnostics) | No | — | — | — |

Notes: no analytics SDK, no ads, no ATT prompt needed. The parent email a teacher enters counts under Contact Info → Email Address (collected, linked, app functionality).

---

## 8. Age rating questionnaire — guidance

Answer honestly; expected outcome is a low rating (4+/9+):
- Violence/sexual content/profanity/horror/gambling/alcohol-drugs: **None**
- Unrestricted web access: **No** (YouTube videos play in a controlled player)
- User-generated content: the questionnaire may ask — Prova has teacher↔student chat and class announcements. Answer truthfully; note the safeguards in Review Notes (§9).
- Made for Kids category: **NO — do not opt in.** Prova is a general-audience app (opting into Kids brings much stricter rules).

---

## 9. App Review notes + demo accounts

Paste something like this into ASC → App Review Information → Notes:

> Prova is a music practice coach for guitar/bass students and their real-life teachers. Teachers connect students via a private join code — there is no public discovery or matching of strangers.
>
> Messaging safeguards: students can ONLY message their own linked teacher; student-to-student private messaging is blocked server-side (Firestore security rules). Class group chats are teacher-broadcast with emoji reactions only.
>
> Demo accounts (pre-linked teacher + student):
> — Teacher: [CREATE + FILL IN EMAIL/PASSWORD]
> — Student: [CREATE + FILL IN EMAIL/PASSWORD]
>
> The student account has an active practice plan and assigned tasks so all features are visible. The "upgrade" screen is informational only — no purchase is possible in this version.

**TO DO:** create two fresh demo accounts (teacher + student, linked, with some practice data and an assigned task) and fill in the credentials above. Don't use personal accounts.

---

## 10. ⚠️ Must-do before submitting for review

1. **Flip the paywall switch OFF**: Firebase console → Firestore → `config/paywall` → `mockCheckout: false`. With it on, "Start free trial" grants a fake $5.99 subscription with no real payment — that's a guaranteed rejection (guideline 3.1.1: digital goods must use Apple IAP). With it off, the button reads "Coming soon" — acceptable. Flip it back on after approval if needed for demos.
2. **Rename the ASC app record** from "prova (ec54f8)" to **Prova: Practice & Progress** + set the subtitle (ASC → App Information).
3. **TestFlight-test build 1.0.1 on a real phone first** — check the new icon, the animated intro, login, practice player, and Delete Account (on a throwaway account!).
4. Add the screenshots (§6) and fill §7–§8.

---

## 11. Known review risks (honest assessment)

- **Chat/UGC (guideline 1.2):** Apple sometimes asks UGC apps for content reporting/blocking tools. Mitigation story: no peer-to-peer chat (server-enforced), teacher-only messaging, class chats are broadcast-only. If review asks for more, we may need a "report message" button — small feature, build on request.
- **Kids/COPPA positioning:** the app is 13+ per Terms; student accounts are meant to be teacher/parent-supervised. Fine for now; real age-gating at signup is on the roadmap before pushing into schools.
- **Teacher content:** teachers can attach YouTube links/photos; these go only to their own students.
- **AI-generated content:** plans come from Claude with rate limits and prompt-injection escaping server-side. Low risk.

---

## 12. After approval — worth knowing

- **OTA updates are live**: JS-only fixes ship instantly with `eas update --channel production` — no review needed. Native changes still need a build + review.
- The in-app legal text (Profile → Privacy/Terms) should be refreshed to match the hosted versions (hosted ones are newer). Minor, post-launch fine.
- Real billing (RevenueCat + IAP) is the gate for turning the paywall back on for real.
- `sendWeeklyParentReports` emails parents automatically — currently from `onboarding@resend.dev` (test mode: only delivers to the Resend account owner). Before real parents: verify a domain in Resend and update `REPORT_FROM` in `functions/index.js`.
