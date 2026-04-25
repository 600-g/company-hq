/* doogeun-hq 알림 전용 Service Worker */

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// VAPID push 수신 (서버에서 web push 전송 시)
self.addEventListener("push", (event) => {
  let data = { title: "두근컴퍼니", body: "알림", url: "/hub" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil((async () => {
    // 1) 앱이 열려 있으면 in-app toast 로 전달
    try {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clientsArr) {
        c.postMessage({ type: "push", ...data });
      }
    } catch {}
    // 2) OS 레벨 알림 (탭이 닫혀있어도 노출)
    await self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "doogeun-hq",
      data: { url: data.url || "/hub" },
    });
  })());
});

// 알림 클릭 → 해당 경로 포커스/오픈
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/hub";
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clientsArr) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});

// 로컬 알림 (push 없이 클라이언트가 보낸 경우)
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "notify") return;
  self.registration.showNotification(data.title || "두근컴퍼니", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "doogeun-hq-local",
    data: { url: data.url || "/hub" },
  });
});
