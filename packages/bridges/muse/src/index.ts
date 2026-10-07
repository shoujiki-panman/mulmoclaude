#!/usr/bin/env node
// @mulmobridge/muse — lets Meta's Muse talk to MulmoClaude through a Muse
// Gadget. The gadget's Linux Device SDK
// (https://github.com/facebookincubator/muse-gadget-sdk) lets Muse run
// commands on this machine; this CLI is the command it runs.
//
//   mulmobridge-muse ask [--chat ID] [--file PATH]... QUESTION|-
//       One question in, MulmoClaude's answer out on stdout. SKILL.md
//       teaches Muse how to call it.
//   mulmobridge-muse relay
//       Long-running: forwards MulmoClaude's notifications to Muse with
//       `musegadget send-user-msg`.
//
// Environment (or a .env file in the working directory):
//   MULMOCLAUDE_API_URL    — default http://localhost:3001
//   MULMOCLAUDE_AUTH_TOKEN — default: ~/mulmoclaude/.session-token
//   MUSEGADGET             — relay: the musegadget command (default: musegadget)
//   MUSE_SESSION_ID        — relay: post into this Muse side chat instead of
//                            the main chat

import dotenv from "dotenv";
import { USAGE } from "./args.js";
import { runAsk } from "./ask.js";
import { EXIT_CODES, errorMessage } from "./config.js";
import { runRelay } from "./relay.js";

// quiet: dotenv 17 otherwise logs to stdout, which `ask` keeps for the answer.
dotenv.config({ quiet: true });

const HELP_COMMANDS = new Set(["help", "--help", "-h"]);

function exitAfterFlush(code: number): void {
  process.stdout.write("", () => process.exit(code));
}

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "ask") return exitAfterFlush(await runAsk(rest));
  if (command === "relay") return runRelay();
  const wantsHelp = command === undefined || HELP_COMMANDS.has(command);
  (wantsHelp ? process.stdout : process.stderr).write(USAGE);
  exitAfterFlush(wantsHelp ? EXIT_CODES.ok : EXIT_CODES.usage);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(`mulmobridge-muse: ${errorMessage(err)}`);
  process.exit(EXIT_CODES.mulmoError);
});
