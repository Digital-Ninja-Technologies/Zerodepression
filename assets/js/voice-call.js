/* Live voice calls inside a chat, shared by the visitor page and the counsellor inbox.
 *
 * Audio goes browser to browser (WebRTC). Firestore only carries the connection details (offer/answer and
 * network candidates) under chats/{id}/calls/{callId}, which the security rules limit to the visitor and the
 * counsellor in that chat. Calls are direct (no relay), so each side's network can technically see the other's
 * IP address; the chat page's privacy notes say so.
 *
 * Usage: var call = ZDCall({ fb, role: "user" | "counsellor", actions, bar, notice, otherName })
 *        call.attach(chatId)  call.setAvailable(true|false)  call.detach()
 */
(function () {
  "use strict";

  var ICE = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  var RING_MS = 45000;          // give up on an unanswered call after this long
  var STALE_MS = 60000;         // ignore "ringing" calls older than this (left over from a closed tab)
  var CONNECT_MS = 25000;       // if audio hasn't connected by then, the network is blocking a direct call

  var PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

  function supported() {
    return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function mmss(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2);
  }

  window.ZDCall = function (opts) {
    var fb = opts.fb, role = opts.role, other = role === "user" ? "counsellor" : "user";
    var otherName = typeof opts.otherName === "function" ? opts.otherName : function () { return role === "user" ? "Your counsellor" : "The visitor"; };
    var say = opts.notice || function () {};

    var st = { chatId: null, available: false, call: null, callId: null, pc: null, stream: null, unsubs: [], iceUnsub: null,
               pendingIce: [], remoteSet: false, localIce: [], callSaved: false, ringTimer: null, connectTimer: null, tick: null, startedAt: 0, muted: false,
               handled: {}, ringCtx: null, ringLoop: null, busy: false };

    /* ---------------------------------------------------------- UI */
    var callBtn = el("button", "btn-quiet call-btn");
    callBtn.type = "button";
    callBtn.innerHTML = PHONE + "<span>Request voice call</span>";
    callBtn.hidden = true;
    if (opts.actions) opts.actions.insertBefore(callBtn, opts.actions.firstChild);

    var bar = el("div", "call-bar");
    bar.setAttribute("role", "status");
    bar.hidden = true;
    var barText = el("span", "call-bar-text");
    var barBtns = el("div", "call-bar-actions");
    bar.appendChild(barText); bar.appendChild(barBtns);
    if (opts.bar) opts.bar.parentNode.insertBefore(bar, opts.bar);

    var audio = document.createElement("audio");
    audio.autoplay = true; audio.setAttribute("playsinline", "");
    bar.appendChild(audio);

    function button(label, cls, fn) {
      var b = el("button", "btn btn-sm " + cls, label);
      b.type = "button";
      b.addEventListener("click", fn);
      return b;
    }

    /* Visitors must agree before any call can start or be answered (counsellors are bound by their role). */
    function consent(incoming) {
      if (role !== "user") return Promise.resolve(true);
      return new Promise(function (resolve) {
        var d = el("dialog", "modal modal--confirm");
        var body = el("div", "modal-body");
        var h = el("h2", "", incoming ? otherName() + " would like to talk by voice" : "Request a voice call?");
        var p1 = el("p", "", "A voice call is optional and only happens if you agree. Please check you're happy with this first:");
        var ul = el("ul", "exit-list");
        ["The call is not recorded.",
         "Your browser will ask to use your microphone. You can end the call at any time and carry on by text."
        ].forEach(function (t) { ul.appendChild(el("li", "", t)); });
        var acts = el("div", "modal-actions");
        var no = el("button", "btn btn-quiet", incoming ? "No, keep to text" : "Cancel"); no.type = "button";
        var yes = el("button", "btn btn-primary", incoming ? "I consent, accept call" : "I consent, send request"); yes.type = "button";
        acts.appendChild(no); acts.appendChild(yes);
        body.appendChild(h); body.appendChild(p1); body.appendChild(ul); body.appendChild(acts);
        d.appendChild(body);
        document.body.appendChild(d);
        var done = false;
        function finish(ok) { if (done) return; done = true; try { d.close(); } catch (e) { /* ignore */ } d.remove(); resolve(ok); }
        yes.addEventListener("click", function () { finish(true); });
        no.addEventListener("click", function () { finish(false); });
        d.addEventListener("cancel", function () { finish(false); });
        d.addEventListener("close", function () { finish(false); });
        if (typeof d.showModal === "function") { d.showModal(); yes.focus(); }
        else { finish(window.confirm("Voice calls are optional and are not recorded. Do you consent to a voice call?")); }
      });
    }

    function showBar(text, buttons, tone) {
      barText.textContent = text;
      barBtns.textContent = "";
      (buttons || []).forEach(function (b) { barBtns.appendChild(b); });
      bar.dataset.tone = tone || "";
      bar.hidden = false;
    }
    function hideBar() { bar.hidden = true; barBtns.textContent = ""; }

    function renderButton() {
      var inCall = !!st.pc || (st.call && (st.call.state === "ringing" || st.call.state === "active") && !isStale(st.call));
      callBtn.hidden = !st.available || !supported() || inCall;
    }

    /* ---------------------------------------------------------- ringing sound */
    function ring(on) {
      clearInterval(st.ringLoop); st.ringLoop = null;
      if (!on) return;
      var beep = function () {
        try {
          st.ringCtx = st.ringCtx || new (window.AudioContext || window.webkitAudioContext)();
          var ctx = st.ringCtx;
          [0, 0.35].forEach(function (d) {
            var o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + d;
            o.type = "sine"; o.frequency.value = role === "counsellor" ? 660 : 520;
            g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.2, at + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
            o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 0.32);
          });
        } catch (e) { /* audio blocked until a click */ }
      };
      beep(); st.ringLoop = setInterval(beep, 2200);
    }

    /* ---------------------------------------------------------- helpers */
    function isStale(c) { return c.state === "ringing" && c.createdAt && Date.now() - c.createdAt > STALE_MS; }

    function micError(err) {
      var name = err && err.name;
      return name === "NotAllowedError" || name === "SecurityError"
        ? "We couldn't use your microphone. Allow microphone access for this site in your browser, then try again."
        : name === "NotFoundError" ? "No microphone was found on this device."
        : "We couldn't start the call. Please try again.";
    }

    function cleanup() {
      ring(false);
      clearTimeout(st.ringTimer); clearTimeout(st.connectTimer); clearInterval(st.tick);
      if (st.iceUnsub) { try { st.iceUnsub(); } catch (e) { /* ignore */ } st.iceUnsub = null; }
      if (st.pc) { try { st.pc.close(); } catch (e) { /* ignore */ } st.pc = null; }
      if (st.stream) { st.stream.getTracks().forEach(function (t) { t.stop(); }); st.stream = null; }
      audio.srcObject = null;
      st.pendingIce = []; st.localIce = []; st.callSaved = false; st.remoteSet = false; st.startedAt = 0; st.muted = false; st.busy = false;
      hideBar(); renderButton();
    }

    function makePc(callId) {
      var pc = new RTCPeerConnection({ iceServers: ICE });
      pc.onicecandidate = function (e) {
        if (!e.candidate || !st.chatId) return;
        var cand = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
        if (st.callSaved) fb.calls.addIce(st.chatId, callId, role, cand).catch(function () {});
        else st.localIce.push(cand);   // the call record must exist before candidates can be saved
      };
      pc.ontrack = function (e) { audio.srcObject = e.streams[0]; audio.play && audio.play().catch(function () {}); };
      pc.oniceconnectionstatechange = function () {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") onConnected();
      };
      pc.onconnectionstatechange = function () {
        if (pc.connectionState === "connected") onConnected();
        if (pc.connectionState === "failed") endCall("failed", "The call couldn't connect on this network. You can keep chatting here, or call us free on 0800 1100 2200.");
      };
      st.iceUnsub = fb.calls.watchIce(st.chatId, callId, other, function (cands) {
        cands.forEach(function (c) {
          if (st.remoteSet) pc.addIceCandidate(c).catch(function () {});
          else st.pendingIce.push(c);
        });
      }, function () {});
      return pc;
    }

    function savedCall() {
      st.callSaved = true;
      var id = st.callId, chatId = st.chatId;
      st.localIce.splice(0).forEach(function (c) { fb.calls.addIce(chatId, id, role, c).catch(function () {}); });
    }

    function flushIce() {
      st.remoteSet = true;
      st.pendingIce.splice(0).forEach(function (c) { st.pc && st.pc.addIceCandidate(c).catch(function () {}); });
    }

    function onConnected() {
      if (st.startedAt) return;
      clearTimeout(st.connectTimer);
      st.startedAt = Date.now();
      var mute = button("Mute", "btn-ghost", function () {
        st.muted = !st.muted;
        if (st.stream) st.stream.getAudioTracks().forEach(function (t) { t.enabled = !st.muted; });
        mute.textContent = st.muted ? "Unmute" : "Mute";
        mute.setAttribute("aria-pressed", st.muted ? "true" : "false");
      });
      mute.setAttribute("aria-pressed", "false");
      var end = button("End call", "btn-danger-solid", function () { endCall("ended"); });
      var draw = function () { showBar("On a voice call with " + otherName() + " · " + mmss(Date.now() - st.startedAt), [mute, end], "live"); };
      draw(); st.tick = setInterval(function () { barText.textContent = "On a voice call with " + otherName() + " · " + mmss(Date.now() - st.startedAt); }, 1000);
      say("Voice call started.");
    }

    function endCall(state, message) {
      var id = st.callId, wasLive = st.startedAt ? Date.now() - st.startedAt : 0;
      if (id && st.chatId && st.callSaved) fb.calls.end(st.chatId, id, role, state).catch(function () {});   // refused harmlessly if already over
      st.handled[id] = true;
      cleanup();
      if (message) say(message);
      else if (wasLive) say("Voice call ended · " + mmss(wasLive) + ".");
    }

    /* ---------------------------------------------------------- start (outgoing) */
    callBtn.addEventListener("click", function () {
      if (st.busy || st.pc || !st.chatId || !st.available) return;
      st.busy = true; callBtn.hidden = true;
      consent(false).then(function (ok) {
        if (!ok) { st.busy = false; renderButton(); return; }
        startOutgoing();
      });
    });

    function startOutgoing() {
      showBar("Sending your call request…", [], "");
      var chatId = st.chatId, callId = fb.calls.newId(chatId);
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }).then(function (stream) {
        st.stream = stream; st.callId = callId; st.handled[callId] = false;
        var pc = st.pc = makePc(callId);
        stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
        return pc.createOffer().then(function (offer) {
          return pc.setLocalDescription(offer).then(function () { return fb.calls.start(chatId, callId, role, offer); }).then(savedCall);
        });
      }).then(function () {
        st.busy = false;
        ring(true);
        showBar("Call request sent. Waiting for " + otherName() + " to accept…", [button("Cancel request", "btn-ghost", function () { endCall("missed", "You cancelled the call request."); })], "ringing");
        st.ringTimer = setTimeout(function () { endCall("missed", otherName() + " didn't respond to your call request. You can keep chatting here."); }, RING_MS);
      }, function (err) {
        cleanup();
        say(err && err.name ? micError(err) : "We couldn't start the call. Please try again.");
      });
    }

    /* ---------------------------------------------------------- incoming + state changes */
    function onCall(c) {
      st.call = c;
      if (!c) { renderButton(); return; }

      // Our own outgoing call
      if (c.caller === role && c.id === st.callId) {
        if (c.state === "active" && c.answer && st.pc && !st.remoteSet) {
          ring(false); clearTimeout(st.ringTimer);
          showBar("Connecting…", [button("End call", "btn-danger-solid", function () { endCall("ended"); })], "ringing");
          st.connectTimer = setTimeout(function () {
            if (!st.startedAt) endCall("failed", "The call couldn't connect on this network. You can keep chatting here, or call us free on 0800 1100 2200.");
          }, CONNECT_MS);
          st.pc.setRemoteDescription(c.answer).then(flushIce, function () { endCall("failed", "The call couldn't connect. Please try again."); });
        } else if (c.state === "declined" && st.pc) {
          st.handled[c.id] = true; cleanup(); say(otherName() + " declined the call request. You can keep chatting here.");
        } else if ((c.state === "ended" || c.state === "failed" || c.state === "missed") && st.pc) {
          var live = st.startedAt ? Date.now() - st.startedAt : 0;
          st.handled[c.id] = true; cleanup(); say(live ? "Voice call ended · " + mmss(live) + "." : "The call ended.");
        }
        renderButton(); return;
      }

      // A call from the other side
      if (c.caller === other) {
        if (c.state === "ringing" && !isStale(c) && !st.handled[c.id] && !st.pc && !st.busy) {
          st.callId = c.id;
          ring(true);
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            try { new Notification(otherName() + " wants to start a voice call", { body: "Open the chat to accept or decline.", tag: "zd-call" }); } catch (e) { /* ignore */ }
          }
          var accept = button("Accept call", "btn-primary", function () {
            ring(false); st.busy = true;
            consent(true).then(function (ok) {
              st.busy = false;
              if (ok) answer(c);
              else { st.handled[c.id] = true; hideBar(); fb.calls.end(st.chatId, c.id, role, "declined").catch(function () {}); renderButton(); }
            });
          });
          var decline = button("Decline", "btn-ghost", function () {
            st.handled[c.id] = true; ring(false); hideBar();
            fb.calls.end(st.chatId, c.id, role, "declined").catch(function () {});
            renderButton();
          });
          showBar(otherName() + " is requesting a voice call. Accept to start talking?", [accept, decline], "ringing");
        } else if (c.id === st.callId && (c.state === "ended" || c.state === "missed" || c.state === "failed" || c.state === "declined")) {
          var was = st.startedAt ? Date.now() - st.startedAt : 0, hadUi = !bar.hidden;
          st.handled[c.id] = true; cleanup();
          if (was) say("Voice call ended · " + mmss(was) + ".");
          else if (hadUi && c.state === "missed") say("You missed a voice call from " + otherName() + ".");
        }
      }
      renderButton();
    }

    function answer(c) {
      if (st.busy) return;
      st.callId = c.id;
      st.busy = true; ring(false);
      showBar("Connecting…", [], "ringing");
      var chatId = st.chatId;
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }).then(function (stream) {
        st.stream = stream;
        var pc = st.pc = makePc(c.id);
        stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
        return pc.setRemoteDescription(c.offer).then(function () {
          flushIce();
          return pc.createAnswer();
        }).then(function (ans) {
          return pc.setLocalDescription(ans).then(function () { return fb.calls.answer(chatId, c.id, ans); }).then(savedCall);
        });
      }).then(function () {
        st.busy = false;
        showBar("Connecting…", [button("End call", "btn-danger-solid", function () { endCall("ended"); })], "ringing");
        st.connectTimer = setTimeout(function () {
          if (!st.startedAt) endCall("failed", "The call couldn't connect on this network. You can keep chatting here, or call us free on 0800 1100 2200.");
        }, CONNECT_MS);
      }, function (err) {
        var msg = err && err.name ? micError(err) : "We couldn't answer the call. Please try again.";
        st.handled[c.id] = true;
        fb.calls.end(chatId, c.id, role, "declined").catch(function () {});
        cleanup(); say(msg);
      });
    }

    /* ---------------------------------------------------------- public API */
    function detach() {
      if (st.pc) endCall("ended");
      cleanup();
      st.unsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } });
      st.unsubs = []; st.chatId = null; st.call = null; st.callId = null; st.available = false;
      renderButton();
    }

    window.addEventListener("pagehide", function () { if (st.pc && st.callId && st.chatId) fb.calls.end(st.chatId, st.callId, role, "ended").catch(function () {}); });

    return {
      attach: function (chatId) {
        if (st.chatId === chatId) return;
        detach();
        st.chatId = chatId;
        st.unsubs.push(fb.calls.watchLatest(chatId, onCall, function () { /* not allowed (e.g. chat not ours): stay quiet */ }));
        renderButton();
      },
      setAvailable: function (on) {
        st.available = !!on;
        if (!on && (st.pc || st.busy)) endCall("ended", "The voice call ended because the chat ended.");
        renderButton();
      },
      detach: detach,
      supported: supported,
    };
  };
})();
