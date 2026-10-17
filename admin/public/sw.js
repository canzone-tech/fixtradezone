const STATIC_CACHE = "fixtradezone-static-v2";
const STATIC_ASSETS = [
  "/assets/fixtradezone/svg/fixtradezone-pwa-icon.svg",
  "/assets/fixtradezone/svg/fixtradezone-admin-logo.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (!STATIC_ASSETS.includes(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request)),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title =
    typeof payload.title === "string" ? payload.title : "FixTradeZone";
  const body =
    typeof payload.body === "string"
      ? payload.body
      : "A Daily Trade result is available.";
  const tag = typeof payload.id === "string" ? payload.id : undefined;

  event.waitUntil(
    (async () => {
      // Push subscriptions are tied to the USER who opted in. A shared
      // browser must not display USER A's trading result after USER B logs in.
      const response = await fetch("/api/user/session", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) return;
      const session = await response.json();
      if (
        !session.user ||
        typeof payload.userId !== "string" ||
        session.user.id !== payload.userId
      ) return;

      await self.registration.showNotification(title, {
        body,
        tag,
        // Ask supporting desktop browsers to keep the popup visible until
        // the user dismisses or opens it. OS notification policies may override.
        requireInteraction: true,
        icon: "/assets/fixtradezone/svg/fixtradezone-pwa-icon.svg",
        badge: "/assets/fixtradezone/svg/fixtradezone-pwa-icon.svg",
        data: { url: "/user/trading" },
      });
    })().catch(() => {
      // Never disclose account-specific results without session verification.
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL("/user/trading", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      async (windows) => {
        for (const client of windows) {
          if (client.url.startsWith(self.location.origin)) {
            await client.navigate(destination);
            return client.focus();
          }
        }
        return self.clients.openWindow(destination);
      },
    ),
  );
});
