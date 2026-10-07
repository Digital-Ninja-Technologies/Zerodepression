/* Tiny client for the chat backend (Supabase RPC functions, see backend/zd_chat.sql).
   The key below is the project's public "anon" key: it is meant to be shipped to browsers.
   It can only run the zd_* functions, and each one checks a per-chat or per-session secret. */
(function () {
  "use strict";

  var BASE = (window.ZD_API_BASE || "https://knffcabxyazookxchruq.supabase.co") + "/rest/v1/rpc/";
  var KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuZmZjYWJ4eWF6b29reGNocnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1Mjg5NTAsImV4cCI6MjEwMzEwNDk1MH0.Ls3m0K0xQn1AWoV_Or_t-uFfMKf6lZIcTBK_pCefbxw";

  function call(fn, args, timeoutMs) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 15000) : null;
    return fetch(BASE + fn, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: "Bearer " + KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args || {}),
      signal: ctrl ? ctrl.signal : undefined,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }).then(
      function (res) {
        if (timer) clearTimeout(timer);
        if (res.status === 204) return null;
        return res.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* non-JSON error page */ }
          if (!res.ok) {
            var err = new Error((data && data.message) || "HTTP " + res.status);
            err.status = res.status;
            throw err;
          }
          return data;
        });
      },
      function () {
        if (timer) clearTimeout(timer);
        var err = new Error("network");
        err.network = true;
        throw err;
      }
    );
  }

  /* "zd:slow_down" -> "slow_down"; transport problems -> "network". */
  function errorKey(err) {
    if (err && err.network) return "network";
    var m = /zd:([a-z_]+)/.exec((err && err.message) || "");
    return m ? m[1] : "unknown";
  }

  window.ZD = { call: call, errorKey: errorKey };
})();
