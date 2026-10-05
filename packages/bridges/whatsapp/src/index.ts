#!/usr/bin/env node
// @mulmobridge/whatsapp — WhatsApp bridge for MulmoClaude.
//
// Uses Meta's WhatsApp Cloud API (webhook mode).
//
// Required env vars:
//   WHATSAPP_ACCESS_TOKEN    — permanent access token
//   WHATSAPP_PHONE_NUMBER_ID — phone number ID from Meta dashboard
//   WHATSAPP_VERIFY_TOKEN    — any string for webhook verification
//   WHATSAPP_APP_SECRET      — App secret for x-hub-signature-256 HMAC
//
// Optional:
//   WHATSAPP_BRIDGE_PORT        — webhook port (default: 3003)
//   WHATSAPP_ALLOWED_NUMBERS    — CSV of phone numbers (empty = all)
//   WHATSAPP_PHOTO_WAIT_SECONDS — how long a photo without a caption waits
//                                 for the sender's next text (default: 30,
//                                 0 = send photos right away)

import "dotenv/config";
import { createBridgeClient, formatAckReply } from "@mulmobridge/client";
import type { Attachment } from "@mulmobridge/protocol";
import { createWebhookApp, registerMetaWebhook } from "@mulmobridge/webhook-runtime";
import { parseCsvSet } from "@mulmoclaude/common";
import { extractWhatsAppImageMessages, extractWhatsAppMessages, type WhatsAppImageMessage, type WhatsAppTextMessage } from "@mulmoclaude/common/meta-webhook";
import { downloadWhatsAppImage } from "./media.js";
import { PHOTO_FAILED_REPLY, composePhotoTurnText, createPhotoBuffer, parsePhotoWaitMs } from "./photoBuffer.js";

const TRANSPORT_ID = "whatsapp";
const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT) || 3003;
const FETCH_TIMEOUT_MS = 30_000;
const PHOTO_WAIT_MS = parsePhotoWaitMs(process.env.WHATSAPP_PHOTO_WAIT_SECONDS);

function readRequiredEnv(): { accessToken: string; phoneNumberId: string; verifyToken: string; appSecret: string } {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!accessToken || !phoneNumberId || !verifyToken || !appSecret) {
    console.error(
      "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, and WHATSAPP_APP_SECRET are required.\nSee README for setup instructions.",
    );
    process.exit(1);
  }
  return { accessToken, phoneNumberId, verifyToken, appSecret };
}
const { accessToken, phoneNumberId, verifyToken, appSecret } = readRequiredEnv();

const allowedNumbers = parseCsvSet(process.env.WHATSAPP_ALLOWED_NUMBERS);
const allowAll = allowedNumbers.size === 0;

const mulmo = createBridgeClient({ transportId: TRANSPORT_ID });

mulmo.onPush((pushEvent) => {
  sendWhatsAppMessage(pushEvent.chatId, pushEvent.message).catch((err) => console.error(`[whatsapp] push send failed: ${err}`));
});

// ── WhatsApp Cloud API ──────────────────────────────────────────

const API_BASE = `https://graph.facebook.com/v21.0/${phoneNumberId}`;

async function sendWhatsAppMessage(recipientId: string, text: string): Promise<void> {
  const MAX = 4096;
  const chunks =
    text.length === 0
      ? ["(empty reply)"]
      : Array.from({ length: Math.ceil(text.length / MAX) }, (_, chunkIndex) => text.slice(chunkIndex * MAX, (chunkIndex + 1) * MAX));

  for (const chunk of chunks) {
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipientId,
          type: "text",
          text: { body: chunk },
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[whatsapp] sendMessage failed: ${res.status} ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`[whatsapp] sendMessage error: ${err}`);
    }
  }
}

// ── Webhook server ──────────────────────────────────────────────

const app = createWebhookApp();

function isAllowed(sender: string): boolean {
  if (allowAll || allowedNumbers.has(sender)) return true;
  console.log(`[whatsapp] denied from=${sender}`);
  return false;
}

async function downloadPhotos(photos: readonly WhatsAppImageMessage[]): Promise<Attachment[]> {
  const results = await Promise.all(photos.map((photo) => downloadWhatsAppImage(photo.mediaId, { accessToken })));
  return results.filter((attachment): attachment is Attachment => attachment !== null);
}

/** Send one turn to MulmoClaude and the reply back to WhatsApp. `question` is
 *  what the sender typed (a text or a caption); null for photos sent alone. */
async function relayToMulmo(sender: string, question: string | null, photos: readonly WhatsAppImageMessage[]): Promise<void> {
  try {
    const attachments = await downloadPhotos(photos);
    if (question === null && attachments.length === 0) {
      await sendWhatsAppMessage(sender, PHOTO_FAILED_REPLY);
      return;
    }
    const text = composePhotoTurnText(question, photos.length - attachments.length);
    const ack = await mulmo.send(sender, text, attachments.length > 0 ? attachments : undefined);
    await sendWhatsAppMessage(sender, formatAckReply(ack));
  } catch (err) {
    console.error(`[whatsapp] message handling failed: ${err}`);
  }
}

const photoBuffer = createPhotoBuffer<WhatsAppImageMessage>({
  waitMs: PHOTO_WAIT_MS,
  onTimeout: (sender, photos) => {
    void relayToMulmo(sender, null, photos);
  },
});

async function processTextMessage(msg: WhatsAppTextMessage): Promise<void> {
  if (!isAllowed(msg.from)) return;
  const photos = photoBuffer.take(msg.from);
  console.log(`[whatsapp] message from=${msg.from} len=${msg.text.body.length} photos=${photos.length}`);
  await relayToMulmo(msg.from, msg.text.body, photos);
}

// A captioned photo carries its own question and goes out now; a bare one
// waits for the sender's next text so the two arrive as one turn.
async function processImageMessage(photo: WhatsAppImageMessage): Promise<void> {
  if (!isAllowed(photo.from)) return;
  console.log(`[whatsapp] photo from=${photo.from} caption=${photo.caption ? "yes" : "no"}`);
  if (photo.caption === undefined && PHOTO_WAIT_MS > 0) {
    photoBuffer.hold(photo.from, photo);
    return;
  }
  await relayToMulmo(photo.from, photo.caption ?? null, [...photoBuffer.take(photo.from), photo]);
}

/** `undefined` is an unambiguous parse-failure sentinel — JSON has no
 *  `undefined` literal, so a valid body can never produce it. */
function parseWebhookJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}

async function handleWebhookBody(rawBody: string): Promise<void> {
  const parsed = parseWebhookJson(rawBody);
  if (parsed === undefined) {
    console.error("[whatsapp] malformed JSON in webhook body");
    return;
  }
  // Photos first, so a body carrying a photo AND its question pairs them up.
  for (const photo of extractWhatsAppImageMessages(parsed)) {
    await processImageMessage(photo);
  }
  for (const msg of extractWhatsAppMessages(parsed)) {
    await processTextMessage(msg);
  }
}

registerMetaWebhook(app, { verifyToken, appSecret, label: "whatsapp", ackBody: "OK", onBody: handleWebhookBody });

app.listen(PORT, () => {
  console.log("MulmoClaude WhatsApp bridge");
  console.log(`Webhook listening on http://localhost:${PORT}/webhook`);
});
