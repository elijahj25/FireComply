// ============================================================
//  FireComply — Service Worker
//  File: public/sw.js
//
//  Handles:
//  - Push notification display
//  - Notification click routing
//  - Offline caching (basic shell)
// ============================================================

const CACHE_NAME = "firecomploy-v1";
const SHELL_ASSETS = ["/", "/index.html", "/manifest.json"];

// ── INSTALL: cache shell ───────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean old caches ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: serve from cache, fallback to network ──────────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// ── PUSH: display notification ────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "FireComply", body: event.data?.text() ?? "You have a new notification." };
  }

  const {
    title = "FireComply",
    body = "You have a compliance update.",
    icon = "/icons/icon-192.png",
    badge = "/icons/badge-72.png",
    tag = "firecomploy-general",
    url = "/",
    type = "info",            // "overdue" | "reminder" | "service" | "info"
    locationName = "",
  } = data;

  // Choose icon color/emoji based on type
  const typeEmoji = {
    overdue:  "⚠️",
    reminder: "📅",
    service:  "✅",
    info:     "🔥",
  }[type] ?? "🔥";

  const notifTitle = `${typeEmoji} ${title}`;

  const options = {
    body,
    icon,
    badge,
    tag,
    data: { url, type, locationName },
    requireInteraction: type === "overdue",   // stays on screen for overdue alerts
    vibrate: type === "overdue" ? [200, 100, 200, 100, 200] : [100, 50, 100],
    actions: type === "overdue"
      ? [
          { action: "view",    title: "View Dashboard" },
          { action: "dismiss", title: "Dismiss" },
        ]
      : [
          { action: "view", title: "Open App" },
        ],
    // Rich notification styling (where supported)
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(notifTitle, options));
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── PUSH SUBSCRIPTION CHANGE ──────────────────────────────────
self.addEventListener("pushsubscriptionchange", (event) => {
  // Re-subscribe when subscription expires
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.VAPID_PUBLIC_KEY,
    }).then((subscription) => {
      // POST updated subscription to your backend
      return fetch("/api/push/resubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
    })
  );
});
