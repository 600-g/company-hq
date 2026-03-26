/* 두근컴퍼니 Service Worker — 웹 푸시 + 배지 + 네비게이션 */

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// 푸시 수신
self.addEventListener("push", (e) => {
  if (!e.data) return;

  let data;
  try {
    data = e.data.json();
  } catch {
    data = { title: "두근컴퍼니", body: e.data.text() };
  }

  const options = {
    body: data.body || "",
    tag: data.tag || "default",
    renotify: true,
    data: { url: data.url || "/", team_id: data.team_id || "" },
    vibrate: [200, 100, 200],
  };

  // 앱 배지 (아이폰/macOS처럼 숫자 표시)
  if (data.badge_count && navigator.setAppBadge) {
    navigator.setAppBadge(data.badge_count).catch(() => {});
  }

  e.waitUntil(self.registration.showNotification(data.title || "두근컴퍼니", options));
});

// 알림 클릭 → 해당 팀 채팅 열기
self.addEventListener("notificationclick", (e) => {
  e.notification.close();

  const teamId = e.notification.data?.team_id || "";

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // 이미 열린 탭이 있으면 메시지 보내고 포커스
      for (const client of clients) {
        if (client.url.includes("600g.net") || client.url.includes("localhost")) {
          client.postMessage({ type: "OPEN_TEAM_CHAT", team_id: teamId });
          return client.focus();
        }
      }
      // 없으면 새 탭 (team_id를 hash로 전달)
      const url = teamId ? `/?team=${teamId}` : "/";
      return self.clients.openWindow(url);
    })
  );
});

// 메시지 수신 (배지 초기화 등)
self.addEventListener("message", (e) => {
  if (e.data?.type === "CLEAR_BADGE" && navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }
});
