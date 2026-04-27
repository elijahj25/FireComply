// ============================================================
//  FireComply — Push Notification System
//  File: src/lib/usePushNotifications.js
//
//  Includes:
//  1. usePushNotifications() — React hook to register SW,
//     request permission, and save subscription to Supabase
//  2. <PushPermissionBanner /> — UI prompt component
//  3. Supabase Edge Function: push-send/index.ts
//     (sends push to subscribed users for a location)
// ============================================================

import { useState, useEffect, useCallback } from "react";

// ─── VAPID KEY ────────────────────────────────────────────────
// Generate your own: https://vapidkeys.com or run:
//   npx web-push generate-vapid-keys
// Then set in Supabase secrets:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
//
// Paste your PUBLIC key here:
const VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY_HERE";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

// ─── HOOK ─────────────────────────────────────────────────────

/**
 * usePushNotifications
 *
 * Usage:
 *   const { permission, supported, subscribe, unsubscribe, subscription } = usePushNotifications({ userId, supabaseClient });
 */
export function usePushNotifications({ userId, supabaseUrl, supabaseKey }) {
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [subscription, setSubscription] = useState(null);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check support on mount
  useEffect(() => {
    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(isSupported);

    if (isSupported) {
      // Register service worker
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check existing subscription
          return reg.pushManager.getSubscription();
        })
        .then((sub) => {
          if (sub) setSubscription(sub);
        })
        .catch(console.error);
    }
  }, []);

  // Save subscription to Supabase
  async function saveSubscription(sub) {
    if (!userId) return;
    const payload = sub.toJSON();
    await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        user_id: userId,
        endpoint: payload.endpoint,
        p256dh: payload.keys?.p256dh,
        auth: payload.keys?.auth,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  // Delete subscription from Supabase
  async function deleteSubscription(endpoint) {
    if (!userId) return;
    await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(endpoint)}`,
      {
        method: "DELETE",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
      }
    );
  }

  // Subscribe
  const subscribe = useCallback(async () => {
    if (!supported || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Permission denied. Enable notifications in your browser settings.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      setSubscription(sub);
      await saveSubscription(sub);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [supported, userId]);

  // Unsubscribe
  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    setLoading(true);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscription(null);
      setPermission("default");
      await deleteSubscription(endpoint);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [subscription]);

  return { permission, subscription, supported, loading, error, subscribe, unsubscribe };
}

// ─── PERMISSION BANNER COMPONENT ──────────────────────────────

/**
 * PushPermissionBanner
 * Drop this anywhere in your app after the user logs in.
 *
 * Usage:
 *   <PushPermissionBanner userId={profile.id} supabaseUrl={SUPABASE_URL} supabaseKey={SUPABASE_ANON_KEY} />
 */
export function PushPermissionBanner({ userId, supabaseUrl, supabaseKey }) {
  const { permission, subscription, supported, loading, error, subscribe, unsubscribe } =
    usePushNotifications({ userId, supabaseUrl, supabaseKey });

  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem("fc_push_dismissed") === "1"
  );

  if (!supported) return null;
  if (permission === "denied") return null;
  if (subscription) return null;
  if (dismissed) return null;

  return (
    <div style={{
      margin: "12px 16px 0",
      background: "#111",
      border: "1px solid rgba(231,76,60,0.3)",
      borderRadius: 14,
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "rgba(231,76,60,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
        }}>🔔</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
            Enable Push Notifications
          </div>
          <div style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.5 }}>
            Get instant alerts for overdue services and upcoming inspection dates — even when the app is closed.
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={subscribe}
          disabled={loading}
          style={{
            flex: 2,
            background: "#e74c3c", color: "#fff", border: "none",
            borderRadius: 10, padding: "11px", fontSize: 14,
            fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {loading ? "Enabling..." : "Enable Notifications"}
        </button>
        <button
          onClick={() => { setDismissed(true); localStorage.setItem("fc_push_dismissed", "1"); }}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)", color: "#9ca3af",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "11px", fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}


// ============================================================
//  SUPABASE SQL: push_subscriptions table
//  Add this to your Supabase SQL Editor
// ============================================================
/*
create table push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references profiles(id) on delete cascade,
  endpoint   text not null,
  p256dh     text,
  auth       text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, endpoint)
);

alter table push_subscriptions enable row level security;

-- Users manage their own subscriptions
create policy "Own subscriptions" on push_subscriptions
  for all using (user_id = auth.uid());

-- Service role can read all (for sending notifications)
create policy "Service role reads all" on push_subscriptions
  for select using (true);
*/


// ============================================================
//  SUPABASE EDGE FUNCTION: push-send/index.ts
//  File: supabase/functions/push-send/index.ts
//
//  Called by notify-overdue to send push notifications
//  alongside the emails.
//
//  Deploy: supabase functions deploy push-send
//  Secrets needed:
//    VAPID_PUBLIC_KEY
//    VAPID_PRIVATE_KEY
//    VAPID_EMAIL=mailto:you@yourdomain.com
// ============================================================
/*
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.6";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUB     = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIV    = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_EMAIL   = Deno.env.get("VAPID_EMAIL")!;

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUB, VAPID_PRIV);

serve(async (req) => {
  const { userIds, payload } = await req.json();
  // payload = { title, body, type, url, locationName }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds);

  const results = await Promise.allSettled(
    (subs ?? []).map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  );

  const sent   = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
*/


// ============================================================
//  HOW TO INTEGRATE: add to your notify-overdue function
// ============================================================
/*
// After sending emails for an overdue location, also push:

const userIds = contacts.map(c => c.id);

await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    userIds,
    payload: {
      title: `Service Overdue — ${loc.name}`,
      body: `This location is ${daysOverdue} day(s) past its service due date.`,
      type: "overdue",
      url: "/",
      locationName: loc.name,
      tag: `overdue-${loc.id}`,
    },
  }),
});
*/
