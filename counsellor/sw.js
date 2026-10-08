// Counsellor alerts: shows a notification when the alert sender pushes one, even with the inbox closed.
// The push never contains anything a visitor wrote; it only says a chat or request is waiting.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  var title = d.title || "ZeroDepression";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "Someone is waiting in the counsellor inbox.",
    tag: d.tag || "zd-alert",
    renotify: true,
    requireInteraction: true,
    icon: "/apple-touch-icon.png",
    badge: "/favicon-32.png",
    data: { url: d.url || "/counsellor/" },
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/counsellor/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf("/counsellor/") !== -1 && "focus" in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
