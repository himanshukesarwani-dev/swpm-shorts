# Implementation Plan — Shorts Generator MVP

Companion to PRD.md. Deployed on Vercel so Shravan and Deepk can use it directly.

---

## 1. Architecture

```
LOOP A — build the repo        RUNS LOCALLY, not on Vercel

  config: ["@VarunMayya", "@VaibhavSisinty"]
        │
  vidIQ ─── all shorts + view counts
        │
  baseline = creator's average views
  keep videos ≥ 5x baseline           ← outliers
        │
  vidIQ ─── transcript per outlier
        │
        ▼
  SUPABASE  reference_videos table


LOOP B — make a short          RUNS ON VERCEL

  USER: topic + reference video
        │
        ▼
  POST /api/generate                        ~40s, returns script
    ├── CLAUDE 0  web search ──▶ facts + sources
    ├── CLAUDE 1  transcript  ──▶ structure
    └── CLAUDE 2  facts+structure+persona ──▶ script
        │
        ▼
  USER reads script + facts, edits, APPROVES     ← only gate
        │
        ▼
  POST /api/produce                         ~25s, returns jobId
    ├── ELEVENLABS ──▶ mp3
    ├── upload mp3 to SUPABASE STORAGE
    ├── submit to HEYGEN with webhook url
    └── write job row to SUPABASE, return immediately
        │
        ▼            (3–5 minutes pass)
        │
  POST /api/webhooks/heygen   ← HeyGen calls us
    ├── download mp4, upload to SUPABASE STORAGE
    └── mark job ready in SUPABASE
        │
  page polls GET /api/jobs/[id] every 5s ──▶ shows video
```

**Fixed ordering:** audio before video, because the avatar render is driven by the audio
file. Claude calls 0 and 1 are independent and run in parallel; call 2 needs both.

### Responsibilities

| Component | Input | Output |
|---|---|---|
| vidIQ | channel handle | shorts with view counts, transcripts |
| Outlier filter | views list | videos at ≥5x their creator's baseline |
| Claude 0 | topic | facts with sources, web search enabled |
| Claude 1 | transcript | structure: beats, word budgets, rules |
| Claude 2 | facts + structure + persona | the script |
| ElevenLabs | script | MP3 |
| HeyGen | MP3 + avatar id | MP4, delivered by webhook |

No agents. Three plain sequential API calls, three separate prompt files.

---

## 2. Where everything lives

| Piece | Where | Why |
|---|---|---|
| The website | Vercel | One deployed link to share with everyone |
| Database | Supabase | Vercel does not host databases; nothing does |
| Audio and video files | Supabase Storage | Same account as the database, one less service |
| Repo builder script | The local machine | Too slow for a serverless function |

Two accounts, both free tier. The database is invisible to anyone using the link.

---

## 3. What Vercel forces

Three things that would work locally do not work on Vercel.

| Problem | Why | Solution |
|---|---|---|
| Cannot write files | Runtime filesystem is read-only | **Supabase Storage** for mp3 and mp4 |
| In-memory state is lost | Requests hit different serverless instances | **Supabase Postgres** for job and repo state |
| Cannot wait 3–5 min | Functions time out | **HeyGen webhook** calls us when the render finishes |

**Why Loop A runs locally.** Building the repo means fetching two channels, pulling
several transcripts and extracting structures — minutes of work that no serverless
function can hold open. Running it as a local script that writes straight to Supabase
avoids needing a job runner entirely. Vercel only ever reads the repo.

**Function durations.** `/api/generate` needs roughly 40 seconds, so set `maxDuration` on
that route and confirm your Vercel plan allows it. Everything else is comfortably short.

**A cron safety net.** `/api/cron/reconcile` runs every 5 minutes and polls HeyGen for any
job stuck in `rendering` for more than 10 minutes, in case a webhook is missed.

---

## 4. The page

Two inputs, one button, then a review step.

**Reference dropdown** lists every outlier in the repo, showing creator, title, views and
the baseline multiple:

```
Varun — Drone swarm hand control       11.2M    8x
Varun — Nvidia DIGITS                   1.7M    1.2x
Vaibhav — ...                              X    Yx
```

The multiple is shown because it is the signal for which reference is strongest.

**No structure preview in the MVP.** The user knows these creators and can judge from the
title. Showing an extracted structure summary before selection is a v2 nicety, not
needed to prove the mechanism.

After Generate, the page shows the script in an editable box with the researched facts
and their sources beneath it, then an Approve button.

---

## 5. Testing on free tiers

Build against ElevenLabs and HeyGen from day one, on their free plans. Same APIs, same
code. When the subscriptions are approved, only the plan changes — nothing in the
codebase does.

| Service | Free tier | Enough for testing? |
|---|---|---|
| ElevenLabs | 10,000 credits/month, ~1,000 per 60s short | Yes, about 10 shorts |
| HeyGen | Limited monthly credits, watermarked output | Yes, watermark is irrelevant here |
| Supabase | Free tier | Yes |
| Vercel | Free tier | Yes |
| Anthropic | Pay as you go | A few dollars total |

Two things the free tiers do not give us, and neither matters yet:

- **No Professional Voice Clone** on ElevenLabs free. Testing uses a stock voice. Shravan's
  cloned voice arrives with the Creator plan.
- **Watermarked HeyGen output.** We are proving the mechanism, not shipping the video.

Total testing spend: a few dollars on Anthropic, nothing else.

---

## 6. Access control — do not skip this

A public Vercel URL with Anthropic, ElevenLabs and HeyGen keys behind it means anyone who
finds it can spend your credits.

Minimum viable protection: a single shared password checked in `middleware.ts`, stored as
an env var, held in a cookie once entered. Ten minutes of work.

Shravan and Deepk get the password. That is the whole auth system.

---

## 7. Data model

**reference_videos** — id, creator, youtube_id, title, views, multiple, transcript,
structure_json (nullable, cached after first extraction)

**jobs** — id, topic, reference_video_id, facts_json, script, audio_url, video_url,
heygen_job_id, status, error, created_at

**status:** `generating` → `script_ready` → `approved` → `audio` → `rendering` → `ready` | `failed`

Persona stays a committed JSON file. It is configuration, not data.

---

## 8. File structure

```
swpm-shorts/
  .env.local                    ANTHROPIC, VIDIQ, ELEVENLABS, HEYGEN keys
                                SUPABASE_URL, SUPABASE_SERVICE_KEY, APP_PASSWORD
  config.ts                     creator handles, baseline multiple (5)
  persona.json                  Shravan's voice + audience
  middleware.ts                 password gate
  db/
    schema.ts                   Drizzle schema
    supabase.ts                 client
  scripts/
    refresh-repo.ts             LOCAL ONLY — Loop A
  lib/
    vidiq.ts
    outliers.ts
    claude.ts
    produce.ts
    storage.ts                  Supabase Storage upload helpers
  prompts/
    research.ts
    extract-structure.ts
    write-script.ts
  app/
    page.tsx
    api/generate/route.ts
    api/produce/route.ts
    api/webhooks/heygen/route.ts
    api/jobs/[id]/route.ts
    api/cron/reconcile/route.ts
  vercel.json                   cron schedule
```

---

## 9. Build order

Each step must run before starting the next. Commit after each.

| # | Step | Done when |
|---|---|---|
| 1 | Supabase project + tables + storage bucket | Tables exist, connection works from local |
| 2 | `refresh-repo.ts` local script | reference_videos populated for both creators |
| 3 | `extractStructure` + prompt | A structure JSON prints for one repo row |
| 4 | `research` + `writeScript` + prompts | A full script prints in the terminal |
| 5 | ElevenLabs + Supabase Storage upload | An MP3 public URL comes back |
| 6 | HeyGen submit + webhook handler | An MP4 URL lands in Supabase Storage via the webhook |
| 7 | API routes + job status | Routes return correct JSON via curl |
| 8 | `page.tsx` | Full flow works locally |
| 9 | `middleware.ts` password gate | Site prompts before showing anything |
| 10 | Deploy, env vars, register webhook, cron | Full flow works on the live URL |
| 11 | Demo runs | Two videos, one topic, two structures |

**Steps 3 and 4 are the product. Everything else is plumbing.** When time runs short, cut
plumbing, not prompt quality.

**Webhook testing.** Step 6 cannot be tested locally without a tunnel, since HeyGen must
reach you. Use `ngrok http 3000` and register the ngrok URL while developing.

---

## 10. Time budget

| Step | Budget |
|---|---|
| Setup, keys, persona.json | 45 min |
| 1. Supabase setup | 30 min |
| 2. Repo builder | 60 min |
| 3. Structure extraction | 45 min |
| 4. Research + script | 90 min |
| 5. Audio + Storage | 40 min |
| 6. HeyGen + webhook | 75 min |
| 7. Routes | 45 min |
| 8. Page | 60 min |
| 9. Password gate | 15 min |
| 10. Deploy | 60 min |
| 11. Demo | 30 min |

Roughly 10 hours. Vercel adds about 3 hours over a local-only build, mostly in the
webhook and deployment steps.

---

## 11. Risks

| Risk | Handling |
|---|---|
| vidIQ has no backend API access on our plan | Fall back to Whisper on downloaded audio. **Verify before step 2.** |
| A creator has too few outliers at 5x | Lower the multiple in config until the repo has enough |
| Facts from research are wrong | Facts and sources shown beside the script at the approval gate |
| Webhook never arrives | Cron reconcile catches anything stuck over 10 minutes |
| `/api/generate` exceeds function limit | Split the three Claude calls into separate routes |
| Public URL, paid keys | Password middleware, step 9. Non-negotiable. |
| Claude Code scaffolds beyond scope | Name the step explicitly in every prompt |

---

## 12. Rules while building

- Build nothing outside PRD scope, however small it looks
- Commit after every step that works
- If a step exceeds double its budget, stub it and move on
- Never copy phrasing from a source transcript, only structure
- All keys server-side, `.env.local` gitignored from the first commit
