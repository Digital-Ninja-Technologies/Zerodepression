/* Ọjà Èrò (The Thought Market): spot the thinking trap, then trade the heavy thought for a lighter, truer one. */
(function () {
  "use strict";
  var P = window.ZDPlay;
  var $ = function (s) { return document.querySelector(s); };
  var ROUNDS = 8;

  var TRAPS = {
    allnothing: { name: "All-or-nothing", def: "Seeing things as total success or total failure, with nothing in between." },
    catastrophe: { name: "Catastrophising", def: "Jumping straight to the worst possible outcome." },
    mindread: { name: "Mind-reading", def: "Assuming you know what someone else is thinking, usually something bad about you." },
    fortune: { name: "Fortune-telling", def: "Predicting that things will go badly, as if you already know the future." },
    label: { name: "Labelling", def: "Calling yourself a harsh name because of one thing that happened." },
    should: { name: "Should statements", def: "Holding yourself to rigid rules about how you 'should' be, then feeling bad when life doesn't match." },
    compare: { name: "Comparing", def: "Measuring your whole life against other people's highlights." },
    discount: { name: "Discounting the positive", def: "Brushing off the good things as if they don't count." },
  };

  var CUSTOMERS = [
    { n: "Tunde", c: "#0071bb", trap: "mindread", t: "My boss didn't reply to my message. She must think I'm useless.",
      good: "She may just be busy. I can't know what she thinks unless I ask.",
      fake: "She definitely thinks I'm the best worker in the company.",
      harsh: "I should stop sending her messages. I'm just a bother." },
    { n: "Adaeze", c: "#9b0057", trap: "catastrophe", t: "I didn't pass JAMB this time, so my whole future is finished.",
      good: "This really hurts, but many people retake it and do well. I can plan my next step.",
      fake: "Exams don't matter at all. I won't think about it again.",
      harsh: "Everyone will know I'm a failure now." },
    { n: "Chidi", c: "#2f8f7b", trap: "compare", t: "Everyone on my timeline is japa-ing, buying cars, getting married. I'm so behind.",
      good: "Social media shows highlights, not whole lives. My path has its own timing.",
      fake: "I'm actually ahead of all of them. They're just pretending.",
      harsh: "I've wasted my life. There's no point trying now." },
    { n: "Halima", c: "#b86f00", trap: "allnothing", t: "I made one mistake in my presentation, so the whole thing was a disaster.",
      good: "One part went wrong and most of it went fine. I can learn from the mistake.",
      fake: "It was perfect. Nobody noticed anything.",
      harsh: "I'm never presenting again. I'm just bad at this." },
    { n: "Emeka", c: "#0071bb", trap: "label", t: "I missed the deadline. I'm such a failure.",
      good: "I missed one deadline. That's something I did, not who I am. I can talk to my team about it.",
      fake: "Deadlines are stupid anyway. It's not my problem.",
      harsh: "This proves I'll never be good at anything." },
    { n: "Bisi", c: "#9b0057", trap: "should", t: "I should be able to handle everything on my own without help.",
      good: "Everyone needs support sometimes. Asking for help is a smart move, not a weakness.",
      fake: "I don't need anyone. I'm totally fine on my own, always.",
      harsh: "If I can't cope alone, something must be wrong with me." },
    { n: "Musa", c: "#2f8f7b", trap: "discount", t: "My friends said my drawing was good, but they were just being nice.",
      good: "Maybe they meant it. I can accept the compliment and keep drawing.",
      fake: "My drawing is the best anyone has ever seen.",
      harsh: "People only lie to me to make me feel better." },
    { n: "Ngozi", c: "#b86f00", trap: "fortune", t: "If I go to the party, I'll embarrass myself and no one will talk to me.",
      good: "I don't know how it'll go. It might feel awkward at first, and that's okay.",
      fake: "I'll be the most popular person there, guaranteed.",
      harsh: "I'm better off staying home forever." },
    { n: "Kemi", c: "#0071bb", trap: "mindread", t: "My mum shouted at me today. She must hate me.",
      good: "She was upset in that moment. One argument doesn't mean she doesn't love me.",
      fake: "She didn't really shout. Nothing happened.",
      harsh: "Nobody in this house cares about me." },
    { n: "Yusuf", c: "#9b0057", trap: "fortune", t: "I've felt low all week. I'll always feel like this.",
      good: "Feelings change, even when it doesn't seem like it. Talking to someone could help.",
      fake: "I'm not low. I'll just ignore it and it'll disappear.",
      harsh: "There's no point. Nothing ever gets better for me." },
    { n: "Ifeoma", c: "#2f8f7b", trap: "allnothing", t: "If my business doesn't make money this month, I'm a total failure.",
      good: "One slow month doesn't define my business or me. I can look at what to adjust.",
      fake: "Money doesn't matter. I'll just wait and see.",
      harsh: "I was stupid to ever start a business." },
    { n: "Segun", c: "#b86f00", trap: "should", t: "I should be married by now, like everyone keeps telling me.",
      good: "There's no correct timeline. I can make choices that are right for me.",
      fake: "Marriage is pointless, so it doesn't matter at all.",
      harsh: "Something must be wrong with me if I'm still single." },
    { n: "Amaka", c: "#0071bb", trap: "discount", t: "I got 9 out of 10 questions right, but all I can think about is the one I missed.",
      good: "I got most of it right. That's worth noticing, and I can check the one I missed.",
      fake: "Actually I got 10 out of 10. The teacher made a mistake.",
      harsh: "If it's not perfect, it doesn't count." },
    { n: "Femi", c: "#9b0057", trap: "label", t: "I'm so stupid for forgetting my keys again.",
      good: "I forgot my keys. That happens to everyone, especially when I'm stressed.",
      fake: "Keys don't matter. I'll never need them.",
      harsh: "I can't do anything right." },
    { n: "Zainab", c: "#2f8f7b", trap: "catastrophe", t: "I have a headache, so something terrible must be wrong with me.",
      good: "Headaches usually have simple causes like stress or not drinking enough water. If it keeps happening, I can see a doctor.",
      fake: "I'll never get sick. My body is perfect.",
      harsh: "I'm too scared to find out, so I'll just worry." },
    { n: "Obinna", c: "#b86f00", trap: "compare", t: "My classmates are smarter than me. I'll never be as good as them.",
      good: "Everyone learns at their own pace and has different strengths. I can focus on my own progress.",
      fake: "I'm the smartest person in the class. They're all behind.",
      harsh: "I'm just dull. I should stop trying." },
  ];

  var st;
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function show(id) { ["intro", "round", "end"].forEach(function (k) { $("#" + k).hidden = k !== id; }); window.scrollTo(0, 0); }

  function start() {
    st = { list: shuffle(CUSTOMERS).slice(0, ROUNDS), i: 0, trapRight: 0, lighter: 0, learned: {} };
    P.track("game_start", { game: "oja-ero" });
    show("round");
    renderRound();
  }

  function renderRound() {
    var c = st.list[st.i];
    $("#count").textContent = "Customer " + (st.i + 1) + " of " + ROUNDS;
    $("#basket-n").textContent = st.lighter;
    $("#avatar").textContent = c.n.charAt(0);
    $("#avatar").style.background = c.c;
    $("#cust-name").textContent = c.n + " brings a heavy thought:";
    $("#thought").textContent = "“" + c.t + "”";
    $("#step-label").textContent = "Which thinking trap is this?";
    $("#feedback").hidden = true;
    $("#next").hidden = true;
    var opts = shuffle([c.trap].concat(shuffle(Object.keys(TRAPS).filter(function (k) { return k !== c.trap; })).slice(0, 2)));
    var box = $("#options");
    box.innerHTML = "";
    opts.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "oe-opt";
      b.innerHTML = "<strong></strong>";
      b.querySelector("strong").textContent = TRAPS[k].name;
      b.addEventListener("click", function () { answerTrap(k, b); });
      box.appendChild(b);
    });
    $("#stall").classList.remove("is-light");
  }

  function lock(box) { Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) { b.disabled = true; }); }

  function answerTrap(k, btn) {
    var c = st.list[st.i], box = $("#options");
    lock(box);
    var right = k === c.trap;
    if (right) st.trapRight++;
    st.learned[c.trap] = true;
    Array.prototype.forEach.call(box.querySelectorAll("button"), function (b) {
      if (b.textContent === TRAPS[c.trap].name) b.classList.add("is-right");
    });
    if (!right) btn.classList.add("is-wrong");
    var fb = $("#feedback");
    fb.hidden = false;
    fb.className = "oe-feedback " + (right ? "is-good" : "is-close");
    fb.innerHTML = "";
    var h = document.createElement("strong");
    h.textContent = right ? "Well spotted. That's " + TRAPS[c.trap].name.toLowerCase() + "." : "Good try. This one is " + TRAPS[c.trap].name.toLowerCase() + ".";
    var p = document.createElement("span");
    p.textContent = " " + TRAPS[c.trap].def;
    fb.appendChild(h); fb.appendChild(p);
    setTimeout(askReframe, 200);
  }

  function askReframe() {
    var c = st.list[st.i];
    $("#step-label").textContent = "Now help " + c.n + " trade it for a lighter thought:";
    var box = $("#options");
    var wrap = document.createElement("div");
    wrap.className = "oe-reframes";
    shuffle([["good", c.good], ["fake", c.fake], ["harsh", c.harsh]]).forEach(function (pair) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "oe-opt oe-opt--thought";
      b.textContent = "“" + pair[1] + "”";
      b.addEventListener("click", function () { answerReframe(pair[0], b, wrap); });
      wrap.appendChild(b);
    });
    box.innerHTML = "";
    box.appendChild(wrap);
    wrap.querySelector("button").focus({ preventScroll: true });
  }

  var WHY = {
    good: "That's the one. It's kind and honest at the same time. Lighter doesn't mean pretending. It means fairer.",
    fake: "That sounds cheerful, but it isn't true, so it won't hold up for long. The best lighter thought is kind and realistic.",
    harsh: "That one keeps the load heavy. Look for the thought that's kind and realistic at the same time.",
  };

  function answerReframe(kind, btn, wrap) {
    var c = st.list[st.i];
    lock(wrap);
    Array.prototype.forEach.call(wrap.querySelectorAll("button"), function (b) {
      if (b.textContent === "“" + c.good + "”") b.classList.add("is-right");
    });
    if (kind !== "good") btn.classList.add("is-wrong");
    if (kind === "good") { st.lighter++; $("#basket-n").textContent = st.lighter; $("#stall").classList.add("is-light"); }
    var fb = $("#feedback");
    fb.className = "oe-feedback " + (kind === "good" ? "is-good" : "is-close");
    fb.innerHTML = "";
    var s = document.createElement("span");
    s.textContent = WHY[kind] + (kind === "good" ? " " + c.n + " walks away a little lighter." : "");
    fb.appendChild(s);
    var next = $("#next");
    next.hidden = false;
    next.textContent = st.i + 1 < ROUNDS ? "Next customer" : "Close the stall";
    next.focus({ preventScroll: true });
  }

  function next() {
    st.i++;
    if (st.i < ROUNDS) { renderRound(); window.scrollTo(0, 0); return; }
    finish();
  }

  function finish() {
    show("end");
    $("#e-lighter").textContent = st.lighter;
    $("#e-lighter-l").textContent = st.lighter === 1 ? "customer left lighter" : "customers left lighter";
    $("#e-traps").textContent = st.trapRight + " of " + ROUNDS;
    var list = $("#learned");
    list.innerHTML = "";
    Object.keys(st.learned).forEach(function (k) {
      var li = document.createElement("li");
      var b = document.createElement("strong"); b.textContent = TRAPS[k].name + ": ";
      li.appendChild(b); li.appendChild(document.createTextNode(TRAPS[k].def));
      list.appendChild(li);
    });
    var best = P.store.get("oja-best", 0);
    if (st.lighter > best) P.store.set("oja-best", st.lighter);
    P.track("game_finish", { game: "oja-ero", lighter: st.lighter, traps_right: st.trapRight });
    $("#share-btn").setAttribute("data-play-share", "I helped " + st.lighter + " customers trade heavy thoughts for lighter ones at Ọjà Èrò, the Thought Market 🧺 Can you spot the thinking traps? Free game from ZeroDepression:");
  }

  $("#start").addEventListener("click", start);
  $("#next").addEventListener("click", next);
  $("#again").addEventListener("click", start);
  var best = P.store.get("oja-best", 0);
  if (best) { $("#best").hidden = false; $("#best-n").textContent = best; }
})();
