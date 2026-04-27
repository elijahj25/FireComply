// ============================================================
//  FireComply — Push Send Edge Function
//  File: supabase/functions/push-send/index.ts
//
//  Sends Web Push notifications to subscribed users.
//  Called internally by notify-overdue.
//
//  Deploy: supabase functions deploy push-send
//  Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUB    = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIV   = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_EMAIL  = Deno.env.get("VAPID_EMAIL")!;

// ─── VAPID JWT signing (no external dep) ──────────────────────
async function signVapidJwt(audience: string): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 3600, sub: VAPID_EMAIL };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const unsigned = `${encode(header)}.${encode(payload)}`;

  // Import VAPID private key
  const keyData = Uint8Array.from(
    atob(VAPID_PRIV.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsigned)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${unsigned}.${sigB64}`;
}

// ─── Send a single push ───────────────────────────────────────
async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await signVapidJwt(audience);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt},k=${VAPID_PUB}`,
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
    },
    body: payload,
  });

  if (!res.ok && res.status !== 201) {
    throw new Error(`Push failed: ${res.status} ${await res.text()}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { userIds, payload } = await req.json() as {
    userIds: string[];
    payload: Record<string, unknown>;
  };

  if (!userIds?.length || !payload) {
    return new Response(JSON.stringify({ error: "userIds and payload required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const payloadStr = JSON.stringify(payload);
  const results = await Promise.allSettled(
    (subs ?? []).map((sub) => sendPush(sub, payloadStr))
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message);

  return new Response(
    JSON.stringify({ sent, failed, total: subs?.length ?? 0, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
