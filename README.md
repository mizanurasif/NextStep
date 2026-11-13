# NextStep

**Track every job, university and professor application in one place, never miss a deadline,
and ask an AI research assistant about your applications and the web.**

NextStep is a React Native (Expo) app for people applying to many places at once: jobs, graduate
programs, and professors for research positions. Each kind of application has its own stages,
fields and reminders. AI reads pasted job circulars to fill in the form, and a research agent
(OpenAI or Claude with web search, plus tools that read your saved applications) answers questions
with cited sources. The AI runs on the phone with the user's own API key; there is no AI server.

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

| Feature | Without a key | With your own OpenAI or Claude key (Profile → AI) |
|---|---|---|
| **Fill from a circular**: paste a job circular, program page or professor profile; the AI fills in the type, title, organization, deadline (in your time zone), link, email, location and a short summary. Every value is checked against the original text, and you review everything before saving. | Free with Gemini, **50 fills per day** | Unlimited, on your key |
| **Ask NextStep**: a research agent that reads your saved applications ("Which of my jobs need React Native?") and searches the web for interview questions, professors' research, and admission deadlines, fees and test requirements. The answer streams in with its sources. | Off: the button is dimmed and explains where to add a key | On |

How these work is explained in **[AI_ARCHITECTURE.md](AI_ARCHITECTURE.md)**.

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
| AI (user's key) | OpenAI `gpt-6.1-terra` or Claude Opus 5.5, called from the phone with the official SDKs; key in expo-secure-store |
| AI (free) | Gemini `gemini-3.8-flash` through Firebase AI Logic (Gemini Developer API, Spark plan), circular reading only |

---

## Architecture

```
┌──────────────────────── App (Expo) ────────────────────────┐
│ Screens · Reminders · Ask NextStep · Fill from a circular  │
│                                                            │
│  lib/ai/research  (agent loop + application tools)         │
│  lib/ai/circular  (prompt, schema, grounding checks)       │
│  lib/ai/keys      (user's key, encrypted on the phone)     │
└──────┬──────────────────────┬──────────────────────┬───────┘
       │ applications,        │ user's key           │ no key
       │ free-fill counter    ▼                      ▼
       ▼              ┌────────────────┐   ┌─────────────────────┐
┌───────────────────┐ │ OpenAI/Claude  │   │ Firebase AI Logic   │
│ Firebase          │ │ (web search    │   │ → Gemini (free tier)│
│ Auth              │ │  included)     │   └─────────────────────┘
│ Realtime Database │ └────────────────┘
└───────────────────┘
```

- **Firebase Realtime Database is the only database.** Applications, and the per-user count of
  free circular fills.
- **No AI server.** The app calls OpenAI or Claude directly with the user's own key, so usage is
  billed to the user. The free Gemini reader goes through Firebase AI Logic, so no Gemini key is in
  the app either.
- **The agent's tools read the applications already on the phone**, so they include changes that
  haven't synced yet and can only see this user's data.

---

## How the research agent works

Ask NextStep is an **agent**: a model, a set of tools, and a loop (the *harness*) that runs on the
phone until the model has an answer.

```
question ──► the AI ──► "call list_applications({type: 'job'})"
                           │  the app answers with one line per application
             the AI ──► "call read_applications({ids: [...]})"
                           │  the app sends those circulars
             the AI ──► searches the web (run on the AI company's side)
             the AI ──► final answer with sources, streamed to the screen
```

| Part | What it does | Where (`lib/ai/research/`) |
|---|---|---|
| **The rules** | one system prompt: prefer official sources, search before stating facts, never guess, plain text for a phone | `agent.ts` |
| **The tools** | web search (run by the AI company); `list_applications` and `read_applications`, run by the app, read-only | `application-tools.ts` |
| **The loop** | call the AI → if it asks for a tool, run it and send the result back → repeat (at most 10 rounds) | `openai-agent.ts`, `claude-agent.ts` |
| **Around the loop** | picks the user's AI, the first message, status lines, sources, friendly errors | `research.ts` |
| **The chat** | the screen keeps the chat and passes it back with the next question, so follow-ups work | `app/ask.tsx` |

---

## Security and privacy

- The user's API key is stored only on their phone, in encrypted storage (Android Keystore / iOS
  Keychain), one per account. It is never written to the database.
- The agent's tools only read, and only the signed-in user's own applications.
- Firebase rules: each user can only read and write their own data.
- Prompt-injection defenses: circulars, notes and web pages are treated as untrusted data,
  extracted values are checked against the source, and nothing is saved without the user.

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Android Studio with an emulator **or** an Android phone with USB/wireless debugging
  (macOS + Xcode for iOS)
- A Firebase project (Authentication with Email/Password enabled, and Realtime Database)

### 1. Install

```bash
npm install
```

### 2. Configure Firebase

Put your Firebase web config in `lib/firebase.ts` (it identifies the project and is not a secret;
the security rules protect the data). Deploy the rules in `database.rules.json`:

```bash
npx firebase deploy --only database
```

### 3. Turn on the free AI (optional)

Firebase console → **AI Logic** → **Get started** → choose the **Gemini Developer API**. This keeps
the project on the free Spark plan. Without it, "Fill from a circular" only works for users who
added their own key.

### 4. Run

Reminders, alarms and the key store use native modules that **Expo Go doesn't include**, so run a
development build:

```bash
npx expo prebuild --platform android   # after adding native libraries or changing app.json
npm run android                        # builds and installs the development build
npx expo start                         # later: start the dev server
```

Each user adds their own OpenAI or Claude key in **Profile → AI** to turn on Ask NextStep.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run android` / `npm run ios` | build and run a development build |
| `npm start` | start the Expo dev server |
| `npx tsc --noEmit` | type-check the app |
| `npm run lint` | lint |

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
components/                   Form, cards, detail sections, AI key settings
lib/
  firebase.ts                 Firebase setup
  database.ts                 Realtime Database reads and writes
  applications-store.tsx      live applications list for the whole app
  applications.ts             stages, reminder presets, date helpers
  notifications.ts, alarms.ts reminders, deadline and follow-up notifications, alarms
  ai/
    keys.tsx                  the user's AI key (SecureStore)
    providers.ts              OpenAI / Claude clients and error messages
    circular.ts               Fill from a circular: prompt, schema, grounding checks
    gemini.ts                 the free Gemini reader and its daily limit
    research/                 Ask NextStep: the agent loop, its tools and rules
database.rules.json           Firebase Realtime Database security rules
AI_ARCHITECTURE.md            how the AI features work
```

---

## Known limitations

- Ringing alarms are Android-only; iOS gets notifications.
- AI features need a connection.
- The free fill limit (50 a day) is counted in Realtime Database by the app. The rules cap the
  number, but a user who edits the database directly could reset their own count; Firebase App
  Check is the next step to protect the free quota.
- Only pasted text is supported for circulars, not images or PDFs yet.
- Applications created before the AI features have no saved circular, so the agent only sees their fields and notes.
- Each research question uses the user's own API credit (a few cents on `gpt-6.1-terra`; more on Claude Opus 5.5, or when it searches a lot).

---

## Roadmap

- Chat actions (more tools): "move TechNova to interview", "remind me 2 days before", always
  confirmed by the user
- Extract skills and required experience from each circular, so the application list answers more without reading circulars
- CV upload and a fit score ranking saved circulars against your CV
- Scan circulars from a photo or PDF
- Firebase App Check for the free Gemini reader
- An evaluation set to measure answer quality
