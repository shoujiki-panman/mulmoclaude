# feat — `decide`: OpenAI Decisions API as a runtime plugin

OpenAI shipped the **Decisions API** (DevDay 2026-09-29, public beta): instead
of writing text it answers a fixed set of questions about a text / image input
with _calibrated_ numbers, ~150 ms per call (≈10× faster than the same model
through the Responses API). Three question kinds:

| kind        | asks                              | answer                                                                  |
| ----------- | --------------------------------- | ----------------------------------------------------------------------- |
| `predicate` | "is X true?"                      | probability 0–1                                                         |
| `choice`    | "which of these 2–8 options?"     | chosen option + a probability per option + confidence                   |
| `score`     | "where on this 2–10 level scale?" | probability-weighted level index + per-level probabilities + confidence |

Claude can already classify a single item well, so the value for MulmoClaude is
the part Claude is _not_ good at: **many items, fast, with probabilities** —
"sort these 40 tickets by team and urgency", "which of these product photos
show damage", "how likely is each of these emails phishing". The agent hands
the batch to `decide`, the plugin fans the calls out in parallel, and the
canvas shows a table of answers with the probabilities behind them.

## Shape: devOnly runtime preset plugin

`packages/plugins/decisions-plugin/` → `@mulmoclaude/decisions-plugin`, a
factory-shape runtime plugin (server handler + Vue View / Preview), registered
as a **`devOnly` preset** like `edgar-plugin` / `email-plugin`:

- provider-specific code stays out of `server/` (plugin-vs-host boundary);
- no launcher dependency, so nothing has to be published to npm first — a
  dev checkout gets it, an `npx mulmoclaude` install is unaffected;
- `"private": true` until we decide to publish (keeps it out of
  `audit:releases`, which would otherwise report a never-tagged package).

Gated per role like every runtime plugin: `TOOL_NAMES.decide` is listed in the
`general` role. Nothing else in the host changes.

## Tool: `decide`

```jsonc
{
  "title": "Ticket triage", // optional, View header
  "questions": [
    // 1–6
    {
      "id": "team",
      "type": "choice",
      "question": "Which team should own this ticket?",
      "options": [
        { "id": "payments", "description": "Checkout, billing, payments" },
        { "id": "frontend", "description": "Rendering, layout, browser" },
      ],
    },
    { "id": "urgency", "type": "score", "question": "How urgent is this?", "levels": ["Can wait", "This week", "Blocking revenue now"] }, // lowest first
    { "id": "is_spam", "type": "predicate", "question": "Is this spam?" },
  ],
  "items": [
    // 1–50, each has text and/or image
    { "id": "t1", "text": "Checkout shows a blank page after Pay…" },
    { "id": "p7", "image": "artifacts/images/2026/10/p7.png" },
  ],
}
```

Arrays (not the API's id-keyed maps) because they are easier for the LLM to
fill; the plugin converts. Ids must be `snake_case` (the API's rule), unique.

**Images**: an `https://` URL is passed through; a workspace path under
`artifacts/` is read through `runtime.files.artifacts` and sent as a base64
data URL (png / jpeg / webp / gif). Anything else — notably chat attachments
under `data/attachments/` — is rejected with an instruction to copy the file
under `artifacts/` first, because a runtime plugin can only read its own
scopes plus `artifacts/`. A generic read-only image accessor for runtime
plugins would remove that step; out of scope here.

**Execution**: one API call per item (the API judges one input per call),
at most 4 in flight, 30 s timeout each via `runtime.fetch` with
`allowedHosts: ["api.openai.com"]`. A failing item does not sink the batch —
its row carries the error. If _every_ item fails (bad key, model not enabled
for the account, …) the handler returns `instructions` only, so no empty card
is pushed to the canvas.

**Result**: `data` (questions + per-item answers, model, elapsed ms) drives the
View; `message` gives the LLM a compact JSON line per item (top choice + its
probability, predicate probability, score + nearest level) — full
distributions stay in the View to keep 50-item batches cheap in tokens.

**Config** (read per call, so editing `.env` + restart is the whole setup):

- `OPENAI_API_KEY` — required. Missing → `instructions` telling the agent to
  ask the user to put it in `.env` and restart; never to paste it into chat.
- `MULMOCLAUDE_DECISIONS_MODEL` — optional, default `decisions-1`.

## Wire format — UNVERIFIED

`developers.openai.com` was unreachable from the session that wrote this
(egress policy), so the request / response mapping below comes from secondary
sources and is isolated in `src/wire.ts` so reconciling it with the official
guide is a one-file change:

```jsonc
// POST https://api.openai.com/v1/decisions
{
  "model": "decisions-1",
  "state": "…text…", // or content parts when an image is attached:
  // "state": [ { "type": "input_text", "text": "…" },
  //            { "type": "input_image", "image_url": "https://… | data:image/png;base64,…" } ],
  "questions": {
    "team": { "type": "choice", "instructions": "…", "criteria": { "payments": "…", "frontend": "…" } },
    "urgency": { "type": "score", "instructions": "…", "criteria": ["Can wait", "This week", "Blocking"] },
    "is_spam": { "type": "predicate", "instructions": "…" },
  },
}
// → { "answers": { "team": { "choice": "payments", "probabilities": { … }, "confidence": 0.9 },
//                  "urgency": { "score": 1.7, "probabilities": [ … ], "confidence": 0.8 },
//                  "is_spam": { "probability": 0.03 } } }
```

To confirm against the guide before merging: endpoint path, the image content
part names, the response's top-level key (`answers`?), the predicate answer
field, and whether a score index is 0- or 1-based. The parser rejects
anything it does not recognise with the response's top-level keys in the
error, so a mismatch shows up as a readable failure rather than wrong numbers.

## Files

- `packages/plugins/decisions-plugin/` — `src/{definition,schemas,wire,images,client,run,summary,config,time,index,vue}.ts`,
  `View.vue`, `Preview.vue`, `lang/{index,en,ja}.ts`, tests under `test/`.
- `server/plugins/preset-list.ts` — `{ packageName: "@mulmoclaude/decisions-plugin", devOnly: true }`.
- `src/config/toolNames.ts` — `decide` in the preset runtime-plugin block.
- `src/config/roles.ts` — `TOOL_NAMES.decide` in `general`.
- `.env.example` — the two variables.

No `error-recovery.md` section: every failure the agent can hit (missing key,
401, model not enabled, image outside `artifacts/`) comes back from the tool
itself as `instructions` naming the fix, at the moment it happens — which is
what that help file exists to provide for failures that can't explain
themselves. It would also force a `@mulmoclaude/core` release for a dev-only
plugin.

## Non-goals

- Publishing the plugin / adding it to the launcher (flip `private` + the
  `devOnly` flag together when we do).
- Replacing any of the host's own Claude calls (memory, triage, …) with
  Decisions — worth measuring separately, but it would make an OpenAI key part
  of core behaviour.
- Reading chat attachments directly (see Images).

## Verification

- Unit tests (plugin `test/`): arg validation edge cases, request building,
  response parsing incl. the unrecognised-shape error, image ref resolution,
  the run loop with a fake `fetch` (concurrency cap, per-item failure, all
  failed → instructions), the LLM summary.
- `yarn format` / `yarn lint` / `yarn typecheck` / `yarn build` / `yarn test`.
- Manual, with a real key: `yarn dev`, General role, "これらのチケットをチーム
  と緊急度で分類して" with 5–10 short texts → table renders, probabilities sum
  to ~1 per choice; one `artifacts/images/...` image item; unset the key →
  the agent asks the user to configure `.env`.
