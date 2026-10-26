# NextStep

**Track every job, university and professor application in one place, never miss a deadline,
and ask an AI assistant about the circulars you've saved.**

NextStep is a React Native (Expo) app for people applying to many places at once: jobs, graduate
programs, and professors for research positions. Each kind of application has its own stages,
fields and reminders. An AI layer reads pasted job circulars to fill in the form and answers
questions about your saved applications using RAG (retrieval-augmented generation) with cited
sources.

<!-- Add screenshots or a short demo GIF here, e.g. ![Home](docs/home.png) -->

---

## Features

### Track three kinds of applications

| Type | Stages | Extra fields |
|---|---|---|
| **Job** | Saved → Applied → Interview → Offer / Rejected | location, circular link |
| **University** | Preparing → Submitted → Under review → Admitted / Rejected | country, intake, documents checklist |
| **Professor** | Draft → Waiting → Follow up due → Replied / Declined | email, email subject, research area, date sent |

- One add/edit form adapts its fields and labels to the type.
- A detail screen for each type shows a timeline, the deadline countdown, and type-specific
  sections (e.g. "Documents · 3 of 5 ready" for universities).
- Change the stage with one tap from the detail screen.

### Stay on top of deadlines

- **Home**: a "This week" summary, applications due soon, and professors you're awaiting a reply from.
- **Applications**: search by role, company or professor, and filter by type.
- **Calendar**: deadlines by day, with one coloured dot per application type.

### Reminders and alarms

- Preset reminders that adapt to how far away the deadline is (1 week, 3 days, on the day, or
  1 hour), plus **custom reminder times**, with or without a deadline.
- Each reminder can be a **notification** or a **notification plus a loud alarm**. On Android,
  alarms ring full-screen with **Stop** and **Snooze**.
- Automatic notifications when a deadline passes, and a **follow-up nudge 7 days** after emailing a
  professor who hasn't replied.
- Reminders for applications that are no longer active (applied, rejected…) are silenced automatically.

### ✨ AI features

| Feature | What it does |
|---|---|
| **Fill from a circular** | Paste a job circular, program page or professor profile. The AI fills in the type, title, organization, deadline (in your time zone), link, email, location and a short summary. Every extracted value is checked against the original text, and you review everything before saving. |
| **Ask NextStep** | A chat over your own applications: "Which jobs need React Native?", "What should I prepare for the TechNova interview?", "Which applications close this month?". Answers cite their sources, and tapping a source opens that application. Open it from an application to ask about just that one. |
| **Search index** | Runs in the background. Saved circulars and notes are split into chunks, embedded, and kept in sync as you add, edit or delete applications, including after being offline. |

How these work, and why they were built this way, is explained in detail in
**[AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)**.

### Works offline

Adding, editing, deleting and changing stages work without a connection. Changes appear
instantly and sync when the phone is back online. Pending changes are kept in memory, so they're
lost if the app is fully closed before reconnecting. AI features need a connection.

---

## Tech stack

| Area | Technology |
|---|---|
| App | React Native 0.86, Expo SDK 57, Expo Router (file-based routing), TypeScript |
| Styling | NativeWind 5 (Tailwind CSS 4) |
| Auth | Firebase Authentication (email + password) |
| Main database | Firebase Realtime Database (live sync, offline writes, per-user security rules) |
| Notifications | expo-notifications; react-native-notify-kit for Android alarms |
| AI backend | Supabase Edge Functions (Deno) |
| Vector database | Supabase Postgres + pgvector (HNSW) + full-text search |
| AI models | Google Gemini: `gemini-3.5-flash-lite` (extraction), `gemini-3.5-flash` (answers), `gemini-embedding-2` (embeddings, 768 dimensions) |

---

## Architecture

```
┌──────────────── App (Expo) ────────────────┐
│ Screens · Reminders · Search-index sync    │
└───────┬───────────────────────────┬────────┘
        │ applications              │ AI requests + Firebase ID token
        ▼                           ▼
┌───────────────────┐     ┌─────────────────────────────┐      ┌──────────┐
│ Firebase          │     │ Supabase Edge Function "ai" │ ───► │  Gemini  │
│ Auth              │◄────│ verify token → daily limit  │      └──────────┘
│ Realtime Database │     │ → extract / index / ask     │
│ (source of truth) │     └──────────────┬──────────────┘
└───────────────────┘                    ▼
                          ┌─────────────────────────────┐
                          │ Postgres + pgvector         │
                          │ chunks (search index)       │
                          │ ai_usage (daily limits)     │
                          └─────────────────────────────┘
```

- **Firebase Realtime Database is the source of truth.** All application data lives there.
- **Supabase is only the AI layer.** It holds the search index, which is always rebuilt from
  Firebase, so nothing is lost if it's wiped.
- **No API keys on the phone.** The Gemini key is only on the server. The server verifies the
  Firebase sign-in token on every request and takes the user id from it.

---

## Security highlights

- Gemini key kept server-side in Supabase secrets, never in the app bundle.
- Firebase ID tokens verified against Google's public keys (signature, RS256, issuer, audience,
  expiry); the user id is never taken from the request body.
- Firebase rules: each user can only read and write their own data.
- Supabase: Row Level Security on with no policies (deny by default); database functions callable
  only by the server.
- Per-user daily AI limits, request size limits, and prompt-injection defenses (documents are
  treated as untrusted data, extracted values are checked against the source, nothing is saved
  without the user).

Details and test results: [AI_ARCHITECTURE.md → Security](AI_ARCHITECTURE.md#7-security).

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Android Studio with an emulator **or** an Android phone with USB/wireless debugging
  (macOS + Xcode for iOS)
- A Firebase project (Authentication with Email/Password enabled, and Realtime Database)
- For the AI features: a Supabase project and a Google Gemini API key

### 1. Install

```bash
npm install
```

### 2. Configure Firebase

Put your Firebase web config in `lib/firebase.ts` (it identifies the project and is not a secret;
the security rules protect the data). Deploy the rules in `database.rules.json` to your
Realtime Database.

### 3. Environment variables

Create `.env` in the project root:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Only public values go here. Variables starting with `EXPO_PUBLIC_` are bundled into the app.

### 4. Set up the AI backend (Supabase)

```bash
npx supabase login
npx supabase link --project-ref <project-ref>

# Database: tables, pgvector, search and quota functions
npx supabase db push --linked

# Secrets (create supabase/functions/.env first; it is gitignored)
#   GEMINI_API_KEY=...
#   FIREBASE_PROJECT_ID=<your-firebase-project-id>
npx supabase secrets set --env-file supabase/functions/.env

# Deploy the function (no Docker needed)
npx supabase functions deploy ai --use-api
```

The app works without this step, but the ✨ AI features will show an error.

### 5. Run

Reminders and alarms use native modules that **Expo Go doesn't include**, so run a development build:

```bash
npm run android          # builds and installs the development build (expo run:android)
npx expo start           # later: start the dev server; add -c after changing .env
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run android` / `npm run ios` | build and run a development build |
| `npm start` | start the Expo dev server |
| `npx tsc --noEmit` | type-check the app |
| `npm run lint` | lint |
| `npx supabase db push --linked` | apply database migrations to Supabase |
| `npx supabase functions deploy ai --use-api` | deploy the AI function |

---

## Project structure

```
app/                          Screens (Expo Router: every file is a route)
  (auth)/                     sign-in, sign-up
  (tabs)/                     Home, Applications, Calendar, Profile
  application/                new, [id] (detail), edit/[id]
  ask.tsx                     Ask NextStep (AI chat)
  alarm.tsx                   full-screen ringing alarm (Android)
  onboarding.tsx
components/                   Form, cards, detail sections
lib/
  firebase.ts                 Firebase setup
  database.ts                 Realtime Database reads and writes
  applications-store.tsx      live applications list for the whole app
  applications.ts             stages, reminder presets, date helpers
  notifications.ts, alarms.ts reminders, deadline and follow-up notifications, alarms
  ai.ts                       the app's client for the AI function
  use-search-index.ts         keeps the AI search index in sync
supabase/
  migrations/                 database schema (pgvector, search, daily limits)
  functions/ai/               Edge Function: auth, extraction, chunking, embeddings, RAG
database.rules.json           Firebase Realtime Database security rules
AI_ARCHITECTURE.md            how the AI and RAG features work, decisions and measurements
```

---

## Known limitations

- Ringing alarms are Android-only; iOS gets notifications.
- AI features need a connection and are limited per user per day (30 AI requests, 300 index updates).
- Only pasted text is supported for circulars, not images or PDFs yet.
- Applications created before the AI features have no saved circular, so only their notes are searchable.
- The AI runs on free tiers: Gemini may be briefly busy, and the Supabase project pauses after
  about a week without activity.

More in [AI_ARCHITECTURE.md → Limits and known gaps](AI_ARCHITECTURE.md#12-limits-and-known-gaps).

---

## Roadmap

- Chat actions (tool calls): "move TechNova to interview", "remind me 2 days before", always
  confirmed by the user
- CV upload and a fit score ranking saved circulars against your CV
- Scan circulars from a photo or PDF
- An evaluation set to measure retrieval and answer quality
