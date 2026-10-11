/* Ọjà Èrò: The Thought Market. Spot the thinking trap, then pick the lighter, truer thought. */
(function () {
  "use strict";

  var TRAPS = {
    all: { name: "All-or-nothing", tip: "Seeing things as total success or total failure, with nothing in between." },
    mind: { name: "Mind reading", tip: "Assuming you know what other people are thinking, usually something bad about you." },
    fortune: { name: "Fortune telling", tip: "Predicting the worst will happen, as if it's already certain." },
    label: { name: "Labelling", tip: "Turning one event into a harsh name for yourself, like \"useless\" or \"a failure\"." },
    should: { name: "\"Should\" statements", tip: "Holding yourself to rigid rules about where you should be or what you should manage." },
    discount: { name: "Discounting the positive", tip: "Brushing off good things as if they don't count." },
    feeling: { name: "Feelings as facts", tip: "Believing something must be true because you feel it strongly." },
    blame: { name: "Blaming yourself for everything", tip: "Taking full responsibility for things that are mostly outside your control." },
  };

  var PEOPLE = [
    { name: "Chioma, 16", trap: "all", thought: "I failed one test. I'm a complete failure and I'll never get into university.",
      good: "One test doesn't decide my future. I can find out what went wrong and prepare better for the next one.",
      bad: ["Just stop thinking about it and be happy.", "Maybe I really am not smart enough for university."] },
    { name: "Emeka, 24", trap: "mind", thought: "My friends didn't reply in the group chat. They must be tired of me.",
      good: "They could just be busy. I don't actually know what they're thinking. I can message one of them directly.",
      bad: ["I'll leave the group before they kick me out.", "Who cares, I don't need friends anyway."] },
    { name: "Aisha, 19", trap: "fortune", thought: "If I tell my parents I'm struggling, they'll never speak to me again.",
      good: "I can't know how they'll react. I could start with the one I trust most, or talk to a counsellor first.",
      bad: ["I'll keep everything to myself forever, it's safer.", "Everything will definitely be perfect if I tell them."] },
    { name: "Tunde, 30", trap: "label", thought: "I lost my job. I'm useless.",
      good: "Losing a job is something that happened to me, not who I am. I still have skills, and people who care about me.",
      bad: ["Real men don't feel bad about this, I should just move on.", "Maybe I'm just not meant to succeed."] },
    { name: "Ngozi, 22", trap: "should", thought: "I should have my life together by now. Everyone my age is doing better than me.",
      good: "Everyone moves at their own pace, and social media only shows the highlights. I'm allowed to be where I am.",
      bad: ["I need to work harder until I catch up with everyone.", "There's no point trying, I'm already too far behind."] },
    { name: "Femi, 17", trap: "discount", thought: "My teacher praised my essay, but she was just being nice.",
      good: "Maybe my essay really was good. I can let myself accept that.",
      bad: ["Teachers have to say nice things, it doesn't mean anything.", "I'll write an even better one so the praise is real."] },
    { name: "Blessing, 27", trap: "all", thought: "I made one mistake at work today. The whole day is ruined.",
      good: "One mistake doesn't erase everything else I did today. I can fix it and keep going.",
      bad: ["I'll go home and forget work exists.", "I always mess things up, today proves it."] },
    { name: "Ibrahim, 20", trap: "feeling", thought: "I feel anxious, so something bad must be about to happen.",
      good: "Feeling anxious doesn't mean danger is coming. It's a feeling, and feelings pass.",
      bad: ["I should stay home until the feeling goes away completely.", "Ignore it, anxiety isn't real."] },
    { name: "Zainab, 15", trap: "fortune", thought: "Nobody at school likes me. I'll be alone forever.",
      good: "Making friends can take time. There may be one or two people I could get to know a little better.",
      bad: ["I'll stop trying to talk to anyone.", "Forever is a long time, so it doesn't matter now."] },
    { name: "Kunle, 35", trap: "blame", thought: "It's my fault my family is struggling. I should be able to fix everything.",
      good: "A lot of what affects my family is outside my control. I'm doing what I can, and that matters.",
      bad: ["If I just work every hour of the day, I can fix it all.", "My family would be better off without my problems."] },
    { name: "Grace, 21", trap: "discount", thought: "People say I'm talented, but they don't see how often I mess up.",
      good: "I can be talented and still make mistakes. Both things can be true.",
      bad: ["They're just being polite, so it doesn't count.", "I should stop showing people my work."] },
    { name: "Seyi, 18", trap: "fortune", thought: "If I don't get straight A's, my life is over.",
      good: "Grades matter, but there are many paths to a good life. One result won't close every door.",
      bad: ["Life is over anyway, so why study?", "I'll stay up every night until I'm perfect."] },
  ];
  var ROUND = 8;
  var SKIN = ["#7a4a26", "#5a3418", "#8d5a33", "#6b3f1f", "#a0673a"];
  var WRAP = ["#9b0057", "#0071bb", "#ffa500", "#2f8f7b", "#e28f00", "#10213f"];

  var $ = function (id) { return document.getElementById(id); };
  var deck = [], i = 0, coins = 0, trapsRight = 0, seen = {}, stepDone = false;

  function shuffle(a) { a = a.slice(); for (var k = a.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)); var t = a[k]; a[k] = a[j]; a[j] = t; } return a; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function avatar(n) {
    var skin = SKIN[n % SKIN.length], wrap = WRAP[(n * 3) % WRAP.length];
    return '<svg viewBox="0 0 60 60"><rect width="60" height="60" fill="#fff0d2"/>' +
      '<rect x="12" y="44" width="36" height="22" rx="12" fill="' + wrap + '"/>' +
      '<circle cx="30" cy="28" r="14" fill="' + skin + '"/>' +
      (n % 2 ? '<path d="M14 24 Q30 2 46 24 Q30 14 14 24Z" fill="' + wrap + '"/>' : '<path d="M16 24 Q30 8 44 24 Q40 14 30 14 Q20 14 16 24Z" fill="#1d120a"/>') +
      '<circle cx="25" cy="29" r="1.8" fill="#1d120a"/><circle cx="35" cy="29" r="1.8" fill="#1d120a"/>' +
      '<path d="M25 36 Q30 33 35 36" stroke="#1d120a" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
  }

  function start() {
    deck = shuffle(PEOPLE).slice(0, ROUND); i = 0; coins = 0; trapsRight = 0; seen = {};
    $("tm-start").hidden = true; $("tm-end").hidden = true;
    window.ZDPlay && ZDPlay.track("play_start", { game: "thought-market" });
    show();
  }

  function show() {
    var p = deck[i];
    stepDone = false;
    $("tm-progress").textContent = "Customer " + (i + 1) + " of " + ROUND;
    $("tm-coins").innerHTML = '<span aria-hidden="true">☀︎</span> ' + coins + " hope coins";
    $("tm-avatar").innerHTML = avatar(PEOPLE.indexOf(p));
    $("tm-name").textContent = p.name;
    $("tm-sub").textContent = "brought a heavy thought";
    $("tm-thought").textContent = "“" + p.thought + "”";
    $("tm-step1").hidden = false; $("tm-step2").hidden = true;
    $("tm-feedback").hidden = true; $("tm-nextwrap").hidden = true;
    var others = shuffle(Object.keys(TRAPS).filter(function (k) { return k !== p.trap; })).slice(0, 2);
    $("tm-traps").innerHTML = shuffle([p.trap].concat(others)).map(function (k) {
      return '<button type="button" class="tm-opt" data-trap="' + k + '">' + esc(TRAPS[k].name) + "<small>" + esc(TRAPS[k].tip) + "</small></button>";
    }).join("");
    var stall = $("tm-stall"); stall.scrollIntoView && window.innerHeight < 760 && stall.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  $("tm-traps").addEventListener("click", function (e) {
    var b = e.target.closest("[data-trap]"); if (!b || stepDone) return;
    var p = deck[i], pick = b.getAttribute("data-trap"), right = pick === p.trap;
    seen[p.trap] = true;
    Array.prototype.forEach.call($("tm-traps").children, function (o) {
      o.disabled = true;
      if (o.getAttribute("data-trap") === p.trap) o.classList.add("is-right"); else if (o === b) o.classList.add("is-wrong");
    });
    if (right) { coins++; trapsRight++; }
    var fb = $("tm-feedback");
    fb.hidden = false; fb.className = "tm-feedback" + (right ? "" : " is-soft");
    fb.innerHTML = (right ? "<strong>Spot on! +1 hope coin.</strong> " : "<strong>Close one.</strong> This is <strong>" + esc(TRAPS[p.trap].name) + "</strong>. ") + esc(TRAPS[p.trap].tip);
    var opts = shuffle([{ t: p.good, ok: true }].concat(p.bad.map(function (x) { return { t: x, ok: false }; })));
    $("tm-reframes").innerHTML = opts.map(function (o) { return '<button type="button" class="tm-opt" data-ok="' + (o.ok ? 1 : 0) + '">' + esc(o.t) + "</button>"; }).join("");
    $("tm-step2").hidden = false;
  });

  $("tm-reframes").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ok]"); if (!b || stepDone) return;
    stepDone = true;
    var right = b.getAttribute("data-ok") === "1", p = deck[i];
    Array.prototype.forEach.call($("tm-reframes").children, function (o) {
      o.disabled = true;
      if (o.getAttribute("data-ok") === "1") o.classList.add("is-right"); else if (o === b) o.classList.add("is-wrong");
    });
    if (right) coins++;
    var fb = $("tm-feedback");
    fb.className = "tm-feedback" + (right ? "" : " is-soft");
    fb.innerHTML = right
      ? "<strong>Fair trade! +1 hope coin.</strong> " + esc(p.name.split(",")[0]) + " leaves your stall a little lighter. A good reframe isn't fake positivity, it's a kinder thought that's also true."
      : "<strong>Not quite.</strong> Forcing yourself to \"just be happy\" or being harsher on yourself usually makes the load heavier. The lighter thought is the one that's kind <em>and</em> true.";
    $("tm-coins").innerHTML = '<span aria-hidden="true">☀︎</span> ' + coins + " hope coins";
    $("tm-sub").textContent = right ? "is feeling a bit lighter" : "is still thinking it over";
    $("tm-next").textContent = i + 1 < ROUND ? "Next customer" : "Close the stall";
    $("tm-nextwrap").hidden = false;
    $("tm-next").focus({ preventScroll: true });
  });

  $("tm-next").addEventListener("click", function () {
    i++;
    if (i < ROUND) { show(); return; }
    finish();
  });

  function finish() {
    $("tm-final").textContent = coins;
    $("tm-traps-n").textContent = trapsRight + "/" + ROUND;
    $("tm-rank").textContent = coins >= 14 ? "Master trader! You have a real gift for kinder thinking."
      : coins >= 10 ? "Great trading. You're getting good at spotting traps."
      : "Every trade is practice. These traps are tricky for everyone, that's why they're traps.";
    $("tm-gloss").innerHTML = Object.keys(seen).map(function (k) { return "<li><strong>" + esc(TRAPS[k].name) + ":</strong> " + esc(TRAPS[k].tip) + "</li>"; }).join("");
    $("tm-end").hidden = false;
    var best = (window.ZDPlay && ZDPlay.store.get("tm-best", 0)) || 0;
    if (coins > best && window.ZDPlay) ZDPlay.store.set("tm-best", coins);
    window.ZDPlay && ZDPlay.track("play_complete", { game: "thought-market", score: coins });
  }

  $("tm-go").addEventListener("click", start);
  $("tm-again").addEventListener("click", start);
  $("tm-share").addEventListener("click", function () {
    ZDPlay.share({
      title: "Ọjà Èrò: The Thought Market",
      text: "I traded heavy thoughts for lighter ones at Ọjà Èrò and earned " + coins + "/16 hope coins 🧺 Can you spot the thinking traps?",
      url: ZDPlay.site + "/play/thought-market/",
    });
  });
})();
