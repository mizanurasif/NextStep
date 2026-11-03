# NextStep

**Track every job, university and professor application in one place, never miss a deadline,
and ask an AI research assistant about your applications and the web.**

NextStep is a React Native (Expo) app for people applying to many places at once: jobs, graduate
programs, and professors for research positions. Each kind of application has its own stages,
fields and reminders. An AI layer reads pasted job circulars to fill in the form, and a research
agent (OpenAI or Claude with web search, plus tools that read your saved applications) answers questions
with cited sources.

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
| **Ask NextStep** | A research agent. It reads your saved applications ("Which of my jobs need React Native?", "Which applications close this month?") and searches the web for interview questions and candidate experiences, professors' research and reviews, and admission deadlines, fees, funding and IELTS/GRE requirements. It can combine both: "What have my interview-stage companies asked before?". The answer streams in with its sources; tap one to open the web page or the application. Open it from an application to start from that one. |

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
| AI backend | Supabase Edge Functions (Deno); Supabase Postgres for the daily limits |
| AI models | Research agent: OpenAI `gpt-6.1-terra` with web search by default, or Claude Opus 5.5 (switch with `AI_PROVIDER`); OpenAI `gpt-6.1-terra` with structured output (extraction) |

---

## Architecture

```
┌──────────────── App (Expo) ────────────────┐
│ Screens · Reminders · Ask NextStep chat    │
└───────┬───────────────────────────┬────────┘
        │ applications              │ AI requests + Firebase ID token
        ▼                           ▼
┌───────────────────┐     ┌─────────────────────────────┐      ┌─────────────────────┐
│ Firebase          │     │ Supabase Edge Function "ai" │ ───► │ OpenAI: extract +   │
│ Auth              │◄────│ verify token → daily limit  │      │ research (default)  │
│ Realtime Database │     │ → extract / research        │      ├─────────────────────┤
│ (source of truth) │     └──────────────┬──────────────┘      │ Claude: research    │
└───────────────────┘                    ▼                     └─────────────────────┘
                          ┌─────────────────────────────┐
                          │ Postgres: ai_usage          │
                          │ (daily limits)              │
                          └─────────────────────────────┘
```

- **Firebase Realtime Database is the source of truth.** All application data lives there.
  The research agent's tools read it with the user's own token, so the Firebase rules still apply.
- **Supabase is only the AI layer.** It runs the function and counts daily requests.
- **No API keys on the phone.** The OpenAI and Claude keys are only on the server. The server
  verifies the Firebase sign-in token on every request and takes the user id from it.

---

## How the research agent works

Ask NextStep is an **agent**: a model, a set of tools, and a loop (the *harness*) that runs on the
server until the model has an answer.

```
question ──► the AI ──► "call list_applications({type: 'job'})"
                           │  server runs it, sends back one line per application
             the AI ──► "call read_applications({ids: [...]})"
                           │  server sends back those circulars
             the AI ──► searches the web (run on the AI's side)
             the AI ──► final answer with sources ──► streamed to the app
```

| Part | What it does | Where |
|---|---|---|
| **The rules** | one system prompt: prefer official sources, search before stating facts, never guess, plain text for a phone | `agent.ts` |
| **The tools** | web search (run by the AI company); `list_applications` (every saved application, one line each) and `read_applications` (full circulars), run by us and read-only | `applications.ts` |
| **The loop** | call the AI → if it asks for a tool, run it and send the result back → repeat (at most 10 rounds) until it answers | `agent-openai.ts`, `agent-claude.ts` |
| **Around the loop** | login check, daily limit, the first message, status lines ("Searching: …"), sources, streaming | `index.ts`, `research.ts` |
| **The chat** | the app keeps the chat the server returns and sends it back with the next question, so follow-ups work | `lib/ai.ts`, `app/ask.tsx` |

**Two AIs, one harness.** It runs on OpenAI `gpt-6.1-terra` by default, or on Claude Opus 5.5.
Everything except the loop is shared. To switch, set the Supabase secret `AI_PROVIDER` to `claude`
or `openai`; no redeploy or app update is needed.

The full walk-through is in [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md#5-feature-2--ask-nextstep-the-research-agent),
and a beginner's explanation is in [AI_HARNESS_EXPLAINED.txt](AI_HARNESS_EXPLAINED.txt).

---

## Security highlights

- AI keys kept server-side in Supabase secrets, never in the app bundle.
- The agent's tools only read, and only the signed-in user's own applications.
- Firebase ID tokens verified against Google's public keys (signature, RS256, issuer, audience,
  expiry); the user id is never taken from the request body.
- Firebase rules: each user can only read and write their own data.
- Supabase: Row Level Security on with no policies (deny by default); database functions callable
  only by the server.
- Per-user daily AI limits, request size limits, and prompt-injection defenses (documents are
  treated as untrusted data, extracted values are checked against the source, nothing is saved
  without the user).

Details and test results: [AI_ARCHITECTURE.md → Security](AI_ARCHITECTURE.md#6-security).

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Android Studio with an emulator **or** an Android phone with USB/wireless debugging
  (macOS + Xcode for iOS)
- A Firebase project (Authentication with Email/Password enabled, and Realtime Database)
- For the AI features: a Supabase project, and an OpenAI API key (plus a Claude API key if you want the agent on Claude)

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

# Database: the daily-limit table and function
npx supabase db push --linked

# Secrets (create supabase/functions/.env first; it is gitignored)
#   OPENAI_API_KEY=sk-...
#   ANTHROPIC_API_KEY=sk-ant-...      only if you set AI_PROVIDER=claude
#   AI_PROVIDER=openai                optional: openai (default) or claude
#   FIREBASE_PROJECT_ID=<your-firebase-project-id>
#   FIREBASE_DATABASE_URL=https://...   only if it isn't <project-id>-default-rtdb.firebaseio.com
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
  ask.tsx                     Ask NextStep (research agent chat)
  alarm.tsx                   full-screen ringing alarm (Android)
  onboarding.tsx
components/                   Form, cards, detail sections
lib/
  firebase.ts                 Firebase setup
  database.ts                 Realtime Database reads and writes
  applications-store.tsx      live applications list for the whole app
  applications.ts             stages, reminder presets, date helpers
  notifications.ts, alarms.ts reminders, deadline and follow-up notifications, alarms
  ai.ts                       the app's client for the AI function (streams research answers)
supabase/
  migrations/                 database schema (daily limits)
  functions/ai/               Edge Function: auth, extraction, research agent and its tools
database.rules.json           Firebase Realtime Database security rules
AI_ARCHITECTURE.md            how the AI features work, decisions and measurements
```

---

## Known limitations

- Ringing alarms are Android-only; iOS gets notifications.
- AI features need a connection and are limited to 30 AI requests per user per day.
- Only pasted text is supported for circulars, not images or PDFs yet.
- Applications created before the AI features have no saved circular, so the agent only sees their fields and notes.
- The agent reads applications from the server, so offline changes that haven't synced yet aren't in its answers.
- Each research question uses API credit with the chosen AI (a few cents on OpenAI's `gpt-6.1-terra`; more on Claude Opus 5.5, or when it searches a lot).
- Supabase runs on the free tier, so the project pauses after about a week without activity.

More in [AI_ARCHITECTURE.md → Limits and known gaps](AI_ARCHITECTURE.md#11-limits-and-known-gaps).

---

## Roadmap

- Chat actions (more tools): "move TechNova to interview", "remind me 2 days before", always
  confirmed by the user
- Extract skills and required experience from each circular, so the application list answers more without reading circulars
- CV upload and a fit score ranking saved circulars against your CV
- Scan circulars from a photo or PDF
- An evaluation set to measure answer quality
