# @mulmobridge/whatsapp

> **Experimental** — please test and [report issues](https://github.com/receptron/mulmoclaude/issues/new).

WhatsApp bridge for [MulmoClaude](https://github.com/receptron/mulmoclaude) via Meta's Cloud API. Requires a Meta Business account.

## Setup

### 1. Create a Meta App

1. Go to [developers.facebook.com](https://developers.facebook.com/apps/) → **Create App** → **Business** type
2. Add the **WhatsApp** product
3. In WhatsApp → Getting Started, note your **Phone Number ID** and generate a **permanent access token**

### 2. Set up ngrok

```bash
ngrok http 3003
```

### 3. Configure webhook

In Meta Dashboard → WhatsApp → Configuration:
- **Callback URL**: `https://xxxx.ngrok-free.app/webhook`
- **Verify token**: any string you choose (set as `WHATSAPP_VERIFY_TOKEN`)
- Subscribe to: `messages`

### 4. Run the bridge

```bash
# Testing with mock server
npx @mulmobridge/mock-server &
WHATSAPP_ACCESS_TOKEN=... \
WHATSAPP_PHONE_NUMBER_ID=... \
WHATSAPP_VERIFY_TOKEN=my-verify-token \
WHATSAPP_APP_SECRET=... \
MULMOCLAUDE_AUTH_TOKEN=mock-test-token \
npx @mulmobridge/whatsapp

# With real MulmoClaude
WHATSAPP_ACCESS_TOKEN=... \
WHATSAPP_PHONE_NUMBER_ID=... \
WHATSAPP_VERIFY_TOKEN=my-verify-token \
WHATSAPP_APP_SECRET=... \
npx @mulmobridge/whatsapp
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Yes | Permanent access token from Meta dashboard |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | Phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Arbitrary string for webhook verification |
| `WHATSAPP_APP_SECRET` | Yes | App secret (Meta Dashboard → App settings → Basic) — verifies each webhook's `x-hub-signature-256` |
| `WHATSAPP_BRIDGE_PORT` | No | Webhook port (default: 3003) |
| `WHATSAPP_ALLOWED_NUMBERS` | No | CSV of phone numbers (empty = all) |
| `WHATSAPP_PHOTO_WAIT_SECONDS` | No | How long a photo sent **without** a caption waits for your next text (default: 30). `0` sends every photo right away. See [Photos](#photos). |
| `MULMOCLAUDE_API_URL` | No | Default `http://localhost:3001` |
| `MULMOCLAUDE_AUTH_TOKEN` | No | Bearer token |
| `WHATSAPP_BRIDGE_DEFAULT_ROLE` | No | Role id to seed new bridge sessions with (e.g. `coder`, `general`). Applied ONLY when a whatsapp session first appears — once the user switches role via `/role <id>` the session's own role wins. Unknown role ids silently fall back to the server's default with a warn log. |
| `BRIDGE_DEFAULT_ROLE` | No | Same as above but shared across every bridge. Transport-specific `WHATSAPP_BRIDGE_DEFAULT_ROLE` wins when both are set. |

### Auth token persistence across server restarts

The MulmoClaude server regenerates a fresh bearer token on every startup and writes it to `~/mulmoclaude/.session-token`. The bridge reads that file once at launch and keeps the token in memory — so if the server restarts while the bridge is running, the bridge keeps using the **old** token and every API call returns **401**, silently.

**Fix**: set `MULMOCLAUDE_AUTH_TOKEN` to the same long random value on **both** the server and the bridge. The server uses it verbatim instead of regenerating, so the token survives restarts and the bridge stays authenticated.

```bash
# Server (one-time setup — same value across restarts)
MULMOCLAUDE_AUTH_TOKEN=long-random-string yarn dev

# Bridge (separate process / machine — same value)
MULMOCLAUDE_AUTH_TOKEN=long-random-string \
  <bridge-specific-envs> \
  npx <this-package>@latest
```

Recommended: at least 32 characters of random data (the server logs a warning at startup for shorter values).

## Photos

Send a photo and MulmoClaude sees it — the bridge downloads it from WhatsApp and attaches it to the message, so you can ask about what is in front of you.

- **Photo with a caption** → sent right away; the caption is the question.
- **Photo without a caption** → held for up to `WHATSAPP_PHOTO_WAIT_SECONDS` (30 s by default). Your next text in that window is sent **together with** the photo as one message. Several photos in a row are collected (up to 4). If no text arrives, the photo goes out on its own and MulmoClaude describes it.
- If a photo can't be downloaded, MulmoClaude is told so (rather than answering about a photo it never received); a photo sent alone gets a "please send it again" reply.
- Only images are forwarded — videos, voice notes, stickers and photos sent as a *document* are ignored. Photos over 10 MB are refused.

Photos need the direct webhook setup above: the [MulmoBridge relay](https://www.npmjs.com/package/@mulmobridge/relay) forwards text only.

### Hands-free with Ray-Ban Meta glasses

Glasses that can share to WhatsApp work as a hands-free camera. Save the bridge's WhatsApp number as a contact (say, "MulmoClaude"), connect WhatsApp in the Meta AI app, then:

1. "Hey Meta, send a photo to MulmoClaude on WhatsApp."
2. Within 30 seconds: "Hey Meta, send a message to MulmoClaude on WhatsApp: is this solder joint OK?"

Both reach MulmoClaude as one message, and the reply arrives as a WhatsApp message the glasses can read out. The exact voice commands depend on your glasses' language and app version.

## Notes

- WhatsApp has a **24-hour messaging window**: you can only reply to a user within 24 hours of their last message. After that, you need a pre-approved template message to initiate contact.
- The Meta Cloud API requires a **verified Business account** for production use. The test number works for development.

## Ecosystem

Part of the [`@mulmobridge/*`](https://www.npmjs.com/~mulmobridge) package family.

**Shared libraries:**

- [`@mulmobridge/client`](https://www.npmjs.com/package/@mulmobridge/client) — socket.io client library used by every bridge below
- [`@mulmobridge/protocol`](https://www.npmjs.com/package/@mulmobridge/protocol) — wire types and constants
- [`@mulmobridge/chat-service`](https://www.npmjs.com/package/@mulmobridge/chat-service) — server-side relay + session store
- [`@mulmobridge/relay`](https://www.npmjs.com/package/@mulmobridge/relay) — Cloudflare Workers webhook proxy
- [`@mulmobridge/mock-server`](https://www.npmjs.com/package/@mulmobridge/mock-server) — mock server for local bridge development

**Bridges** (one npm package per platform):

- [`@mulmobridge/bluesky`](https://www.npmjs.com/package/@mulmobridge/bluesky) — Bluesky DMs over atproto
- [`@mulmobridge/chatwork`](https://www.npmjs.com/package/@mulmobridge/chatwork) — Chatwork (Japanese business chat)
- [`@mulmobridge/cli`](https://www.npmjs.com/package/@mulmobridge/cli) — interactive terminal bridge
- [`@mulmobridge/discord`](https://www.npmjs.com/package/@mulmobridge/discord) — Discord bot via Gateway
- [`@mulmobridge/email`](https://www.npmjs.com/package/@mulmobridge/email) — IMAP poll + SMTP reply, threading preserved
- [`@mulmobridge/google-chat`](https://www.npmjs.com/package/@mulmobridge/google-chat) — Google Chat via MulmoBridge relay
- [`@mulmobridge/irc`](https://www.npmjs.com/package/@mulmobridge/irc) — IRC (Libera, Freenode, custom)
- [`@mulmobridge/line`](https://www.npmjs.com/package/@mulmobridge/line) — LINE Messaging API via MulmoBridge relay
- [`@mulmobridge/line-works`](https://www.npmjs.com/package/@mulmobridge/line-works) — LINE Works (enterprise LINE)
- [`@mulmobridge/mastodon`](https://www.npmjs.com/package/@mulmobridge/mastodon) — Mastodon DMs + mentions
- [`@mulmobridge/matrix`](https://www.npmjs.com/package/@mulmobridge/matrix) — Matrix / Element
- [`@mulmobridge/mattermost`](https://www.npmjs.com/package/@mulmobridge/mattermost) — Mattermost
- [`@mulmobridge/messenger`](https://www.npmjs.com/package/@mulmobridge/messenger) — Facebook Messenger via MulmoBridge relay
- [`@mulmobridge/nostr`](https://www.npmjs.com/package/@mulmobridge/nostr) — Nostr NIP-04 encrypted DMs
- [`@mulmobridge/rocketchat`](https://www.npmjs.com/package/@mulmobridge/rocketchat) — Rocket.Chat
- [`@mulmobridge/signal`](https://www.npmjs.com/package/@mulmobridge/signal) — Signal via signal-cli-rest-api
- [`@mulmobridge/slack`](https://www.npmjs.com/package/@mulmobridge/slack) — Slack Socket Mode
- [`@mulmobridge/teams`](https://www.npmjs.com/package/@mulmobridge/teams) — Microsoft Teams via Bot Framework
- [`@mulmobridge/telegram`](https://www.npmjs.com/package/@mulmobridge/telegram) — Telegram bot
- [`@mulmobridge/twilio-sms`](https://www.npmjs.com/package/@mulmobridge/twilio-sms) — SMS via Twilio Programmable Messaging
- [`@mulmobridge/viber`](https://www.npmjs.com/package/@mulmobridge/viber) — Viber Public Account bots
- [`@mulmobridge/webhook`](https://www.npmjs.com/package/@mulmobridge/webhook) — generic HTTP webhook bridge
- [`@mulmobridge/whatsapp`](https://www.npmjs.com/package/@mulmobridge/whatsapp) — WhatsApp Cloud API via MulmoBridge relay  ← **this package**
- [`@mulmobridge/xmpp`](https://www.npmjs.com/package/@mulmobridge/xmpp) — XMPP / Jabber
- [`@mulmobridge/zulip`](https://www.npmjs.com/package/@mulmobridge/zulip) — Zulip

## Related projects

Published from the MulmoClaude monorepo by [Receptron](https://github.com/receptron).

- **[MulmoClaude](https://github.com/receptron/mulmoclaude)** — an open-source AI assistant platform that runs on your own computer. Claude Code as the engine, a personal wiki for long-term memory, schema-driven collections for your data, and chat that summons the right GUI (markdown, charts, forms, spreadsheets, wikis) for each task.
- **[MulmoTerminal](https://github.com/receptron/mulmoterminal)** — a terminal-first cockpit for running many AI coding agents in parallel. One roster showing every session's summary and PR status, tmux-backed session persistence, git-worktree isolation, one-click PRs, and mobile push with remote reply.
- **[MulmoTerminal manual](https://receptron.github.io/mulmoterminal/)** — setup, workflows, feature reference, configuration, mobile notifications, and alternative / local model providers. Available in English and Japanese.

## License

MIT
