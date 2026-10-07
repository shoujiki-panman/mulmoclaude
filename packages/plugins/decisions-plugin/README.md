# @mulmoclaude/decisions-plugin

Runtime plugin that gives the MulmoClaude agent one tool, **`decide`**, backed
by OpenAI's [Decisions API](https://developers.openai.com/api/docs/guides/decisions)
(public beta). It answers fixed questions about a batch of texts and/or images
with calibrated numbers, fast (~150 ms per call), and shows the answers in the
canvas as a table with a probability breakdown per row.

| Question type | Ask                                        | Answer                                                           |
| ------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `predicate`   | is it true?                                | probability 0–1                                                  |
| `choice`      | which of these 2–8 options?                | chosen option, a probability per option, confidence              |
| `score`       | where on these 2–10 levels (lowest first)? | weighted level index from 0, a probability per level, confidence |

Up to 6 questions and 50 items per call; items are judged in parallel (4 in
flight). Typical asks: "triage these tickets by team and urgency", "which of
these product photos show damage", "how likely is each of these mails
phishing".

## Setup

Dev checkouts only for now (`devOnly` preset, not published). Put the key in
the MulmoClaude `.env` and restart:

```bash
OPENAI_API_KEY=sk-...
# optional, default decisions-1
MULMOCLAUDE_DECISIONS_MODEL=decisions-1
```

The tool is enabled for the **General** role. Without a key it replies with
setup instructions instead of calling the API.

## Images

`image` is either an `https://` URL (passed through) or a workspace path under
`artifacts/` (png / jpeg / webp / gif, ≤ 20 MB), sent as a base64 data URL. A
runtime plugin can't read other workspace folders, so a chat attachment under
`data/attachments/` has to be copied under `artifacts/` first — the tool's
error message says so, and the agent can do it itself.

## Status

The request / response mapping (`src/wire.ts`) was written without access to
the official guide and is **unverified** — see
[`plans/feat-decisions-plugin.md`](../../../plans/feat-decisions-plugin.md)
for what to confirm.
