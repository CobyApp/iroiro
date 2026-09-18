// 이로이로 웹 푸시 서비스워커 — 푸시 수신 표시 + 클릭 시 앱 내 딥링크 이동.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: event.data.text() };
  }
  const title = payload.title || "이로이로";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/brand/iroiro-mark.png",
      badge: "/brand/iroiro-mark.png",
      data: { link: payload.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // 이미 열린 탭이 있으면 포커스 + 이동, 없으면 새 창.
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) return client.navigate(link);
            return undefined;
          }
        }
        return clients.openWindow(link);
      }),
  );
});
