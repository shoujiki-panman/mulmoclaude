# @mulmobridge/muse

> **Experimental** — please test and [report issues](https://github.com/receptron/mulmoclaude/issues/new). A community integration: not made or endorsed by Meta.

Let [Muse](https://muse.ai), Meta's personal AI agent, talk to your [MulmoClaude](https://github.com/receptron/mulmoclaude) through a [Muse Gadget](https://github.com/facebookincubator/muse-gadget-sdk). Ask Muse to "ask MulmoClaude …" and the question reaches your own MulmoClaude — with its workspace, wiki and screen — and the answer comes back through Muse. MulmoClaude's reminders can reach you through Muse too.

```text
you ── "ask MulmoClaude …" ──▶ Muse ── system.run ──▶ Muse gadget (this Linux machine)
                                                       └─ mulmobridge-muse ask ──▶ MulmoClaude
MulmoClaude ── notification ──▶ mulmobridge-muse relay ── musegadget send-user-msg ──▶ Muse
```

The gadget's [Linux Device SDK](https://github.com/facebookincubator/muse-gadget-sdk/tree/main/linux) lets Muse run commands on the machine. This package is the command it runs; [SKILL.md](SKILL.md) teaches Muse how to call it. Nothing in the SDK needs changing.

## What you need

- **MulmoClaude on a Linux machine with Bluetooth LE** — the Muse Linux SDK supports Raspberry Pi OS Bullseye+, Debian 11+ and Ubuntu 22.04+. MulmoClaude only listens on `127.0.0.1`, so the gadget has to be that same machine. (If MulmoClaude runs elsewhere, a Raspberry Pi gadget can forward the port: `ssh -N -L 3001:127.0.0.1:3001 you@mulmoclaude-host`.)
- **Node.js 20.12 or later**, installed where `/usr/bin` or `/usr/local/bin` can see it — not only through nvm.
- **Muse**: an account, the Muse app, and an SDK token from [gadgets.muse.ai](https://gadgets.muse.ai/settings/sdk-tokens). Muse is only available in some countries.

## Setup

### 1. Turn the machine into a Muse gadget

Follow the [Linux Device SDK README](https://github.com/facebookincubator/muse-gadget-sdk/tree/main/linux#install): run its installer with your SDK token, then pair in the Muse app (**Settings > Devices > Developer mode**, then **Add Device**).

Muse gets the access of the account you install the gadget for. Pick one:

- **Your own account** (the one that runs MulmoClaude) — simplest: `mulmobridge-muse` finds MulmoClaude's token in `~/mulmoclaude/.session-token` by itself. Muse can also run any other command as you.
- **A dedicated account without sudo** (`bash install.sh --run-as <account>`) — safer: Muse can only do what that account can, plus ask MulmoClaude. Start MulmoClaude with a fixed `MULMOCLAUDE_AUTH_TOKEN` (see [Auth token](#auth-token)) and give that account the same value in `~/.env` (`chmod 600`):

  ```bash
  MULMOCLAUDE_AUTH_TOKEN=the-same-long-random-value-as-the-server
  ```

  `mulmobridge-muse` reads `.env` from its working directory, which is the account's home when Muse runs it.

### 2. Install the bridge where Muse's commands find it

Muse's commands run with `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`:

```bash
sudo npm install -g @mulmobridge/muse
command -v mulmobridge-muse         # → /usr/local/bin/mulmobridge-muse
```

### 3. Check it the way Muse will run it

As the gadget account, with MulmoClaude running:

```bash
mulmobridge-muse ask "Say hello in five words."
```

stdout is MulmoClaude's answer and nothing else.

### 4. Teach Muse

Paste [SKILL.md](SKILL.md) into your Muse chat — it also ships in the package, at `$(npm root -g)/@mulmobridge/muse/SKILL.md`. Then ask Muse things like:

> Ask MulmoClaude what the next step of my amp build is.

> Ask MulmoClaude to put the wiring diagram for the tube amp on its screen.

> Ask MulmoClaude to add "buy 60/40 solder" to my shopping list.

## Notifications from MulmoClaude (optional)

`mulmobridge-muse relay` stays connected to MulmoClaude and forwards its notifications — scheduled reminders, finished background work — to Muse with the gadget's own `musegadget send-user-msg`, prefixed `[MulmoClaude]`. It holds no Muse credentials, so it has to run as an account in the musegadget socket's group (the account the gadget was installed for). As a systemd service:

```ini
[Unit]
Description=MulmoClaude to Muse relay
After=network-online.target musegadget.service

[Service]
User=<the gadget account>
WorkingDirectory=/home/<the gadget account>
ExecStart=/usr/local/bin/mulmobridge-muse relay
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Set `MUSE_SESSION_ID` (any new UUID) to collect them in a Muse side chat instead of the main chat.

## Commands

```text
mulmobridge-muse ask [--chat ID] [--file PATH]... QUESTION
mulmobridge-muse ask [--chat ID] [--file PATH]... -     (question on stdin)
mulmobridge-muse relay
```

`ask` sends one question and prints MulmoClaude's answer on stdout; logs go to stderr. Questions in the same `--chat` (default `muse`) continue one MulmoClaude conversation; send `/reset` to start a fresh one. `--file` attaches an image or PDF (up to 4, 10 MB each).

| Exit code | Meaning |
|---|---|
| `0` | The answer is on stdout |
| `1` | MulmoClaude reported an error (on stderr) |
| `2` | Bad arguments or files (on stderr) |
| `3` | MulmoClaude isn't running, can't be reached, or rejected the token |

## Environment Variables

All of them can also go in a `.env` file in the working directory.

| Variable | Used by | Description |
|---|---|---|
| `MULMOCLAUDE_API_URL` | both | Default `http://localhost:3001` |
| `MULMOCLAUDE_AUTH_TOKEN` | both | Bearer token. Default: read `~/mulmoclaude/.session-token` |
| `MUSEGADGET` | `relay` | The musegadget command (default: `musegadget`) |
| `MUSE_SESSION_ID` | `relay` | Post into this Muse side chat instead of the main chat |
| `MUSE_BRIDGE_DEFAULT_ROLE` | both | Role id to seed new sessions with (e.g. `general`). Applied only when a session first appears. |
| `BRIDGE_DEFAULT_ROLE` | both | Same, shared by every bridge. `MUSE_BRIDGE_DEFAULT_ROLE` wins when both are set. |

### Auth token

The MulmoClaude server writes a fresh token to `~/mulmoclaude/.session-token` on every start. `ask` reads it on every run, so it keeps working across server restarts when it runs as the same account. A dedicated account, and the long-running `relay`, need a token that doesn't change: set `MULMOCLAUDE_AUTH_TOKEN` to the same long random value (32+ characters) for the server and for the bridge.

## Security

- Muse gets the gadget account's access to the machine — that's how the SDK works — and through this bridge it can ask MulmoClaude anything you could. MulmoClaude can read and change your workspace. Install it only for an account, and a MulmoClaude, you're happy for Muse to use.
- The bridge holds no Muse credentials; `relay` goes through `musegadget send-user-msg`.
- Gadget pairing has no manufacturer verification. Pair on a network you trust.

## Ecosystem

Part of the [`@mulmobridge/*`](https://www.npmjs.com/~mulmobridge) package family — see the [package index](https://github.com/receptron/mulmoclaude/tree/main/packages#readme) for the other bridges and shared libraries.

## License

MIT
