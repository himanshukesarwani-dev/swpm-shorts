# PRD — Shorts Generator (MVP)

**Owner:** Himanshu
**Status:** MVP for internal review

---

## Problem

Producing one short takes hours across five disconnected tools. The hardest part is the
script. Writing from scratch, or prompting an LLM cold, produces flat structure: a weak
hook, no rhythm, nothing that holds attention past three seconds.

## Insight

Structure is the hard part, and it does not need to be invented. Shorts that heavily
outperform their creator's own average have a proven skeleton. Reuse the skeleton,
change the topic.

## What we are building

A tool that takes a topic, borrows the structure of a proven outlier video, writes a
script in Shravan's voice, and turns it into a talking-head video.

## Users

Internal only. One user. Not a product to sell.

---

## What this product does NOT do

**Discovery.** Finding what is trending is handled by Signal, a separate internal tool.
The user arrives at this product already knowing the topic.

**Editing, captions, b-roll, publishing.** All happen outside, after the video is
downloaded.

---

## Assumptions

**1. Discovery is already solved elsewhere.** The product does not scan the internet for
what to make. It starts from a topic the user already has, sourced from Signal. Building
trend discovery here would duplicate an existing internal tool.

**2. Outlier structure transfers across topics.** The core bet: a skeleton that worked for
one topic will work for a different topic in the same domain. This is what the MVP is
testing. If it turns out a structure only works for the topic it came from, the whole
approach needs rethinking.

**3. Transcripts for other creators' Shorts are retrievable.** The repo cannot be built
without them. If programmatic transcript access is not available, the fallback is
transcribing the audio ourselves, which adds cost and time.

**4. ElevenLabs and HeyGen will be approved.** Both are pending. The MVP may run on
cheaper stand-ins, and swapping to the real services is a config change, not a rebuild.

---

## The two loops

### Loop A — Building the repo (occasional)

Two creators, fixed for this MVP: Varun Mayya and Vaibhav Sisinty. Adding creators is
out of scope. More will come later, but not in this build.

The user presses Refresh. The system then:
1. Pulls all Shorts from each channel
2. Calculates that creator's average views — this is their **baseline**
3. Selects only videos that beat their own baseline by **5x or more** — the outliers
4. Fetches transcripts for those outliers
5. Stores them in the repo

This runs weekly, or when creators post new work. Not per short.

**Why outliers, not all videos:** a video that beat its own creator's average five times
over is doing something structurally right. Average videos teach nothing.

### Loop B — Making a short (every time)

The user supplies two inputs and approves once. Everything else is automatic.

---

## User flow

1. User opens the page
2. Types a topic, e.g. `GPT Astra`
3. Picks a reference structure from the repo dropdown
4. Presses Generate
5. **System researches, extracts structure, writes the script**
6. User reads the script and the sourced facts beneath it, edits if needed
7. User presses Approve
8. **System generates audio, then the avatar video**
9. User downloads the MP4

Total user effort per short: type a topic, pick a structure, approve a script.

---

## What happens inside, on Generate

Three sequential Claude API calls. No agents, no orchestration framework.

| Call | Input | Output | Notes |
|---|---|---|---|
| 0. Research | topic | facts, with sources | Web search tool enabled |
| 1. Reverse engineer | chosen transcript | structure: beats, pacing, rules | |
| 2. Write | facts + structure + persona | the script | |

Then two production calls: ElevenLabs for audio, HeyGen for the avatar. Audio must
complete before video, because the avatar render is driven by the audio file.

---

## Persona

Persona is configuration, not input. It holds Shravan's speaking voice and his audience
profile. Written once, injected into every script generation, never shown on the create
screen.

---

## Scope

**In**
- One plain web page
- Two fixed creators, hardcoded
- Automatic outlier detection at 5x baseline, transcript fetching, repo storage
- Research via Claude with web search
- Live structure extraction from a chosen transcript
- Script generation from facts, structure and persona
- A human approval gate before any production spend
- Audio generation
- Talking-head video generation
- Playable, downloadable output
- Deployed on Vercel, reachable by Shravan and Deepk, password protected

**Out**
- Discovery of topics — Signal handles this
- Styling beyond plain default
- Real user accounts — a single shared password is enough
- Adding or managing creators in any form — the two are hardcoded
- Captions, b-roll, editing, publishing
- Error recovery and retries

---

## Known risk

Claude's research on very new products can be incomplete or wrong, and the script format
demands specific numbers. Wrong facts would be spoken by Shravan's avatar.

**Mitigation:** the researched facts and their sources are displayed alongside the script
at the approval step, so the user can verify before anything is produced.

---

## Success criteria

1. One topic produces one playable video, end to end, without manual steps in between
2. The same topic run through two different reference structures produces two visibly
   different scripts

Criterion 2 is the real one. It proves the structure is doing the work.

---

## Explicit non-goals

Output quality. Voice and avatar fidelity depend on subscriptions not yet purchased. This
MVP proves the parts connect and the mechanism works.

---

## Next, after this MVP

- More creators, and a way to add them without editing code
- Pull topics directly from Signal instead of typing them
- Auto-suggest which reference structure best fits a given topic
- Per-channel personas, since the three channels have different audiences
- Feed published performance back in, so the repo learns which structures work for us
