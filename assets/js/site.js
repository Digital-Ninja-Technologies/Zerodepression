(function () {
  "use strict";

  var NEWSLETTER_URLS = [
    "https://api.zerodepression.org/v1/ge/newsletter",
    "https://api1.zerodepression.org/v1/ge/newsletter",
  ];
  var CONTACT_URL = "https://api1.zerodepression.org/api/v1/ge/contact-us";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /* Footer year */
  $$("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* Sticky header shadow */
  var header = $(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Floating call button appears once the page's own call buttons scroll away */
  var fab = $(".fab-group");
  if (fab) {
    var showFab = function () {
      fab.classList.toggle("is-visible", window.scrollY > 520);
    };
    showFab();
    window.addEventListener("scroll", showFab, { passive: true });
  }

  /* Photo lightbox: links marked data-lightbox open the full photo in a pop-up with a close button */
  var photoLinks = $$("a[data-lightbox]");
  if (photoLinks.length && typeof HTMLDialogElement !== "undefined") {
    var box = document.createElement("dialog");
    box.className = "lightbox";
    box.setAttribute("aria-label", "Photo");
    box.innerHTML = '<button class="lightbox-close" type="button" aria-label="Close photo">&times;</button><img alt="">';
    document.body.appendChild(box);
    var boxImg = $("img", box);
    var closeBox = function () { box.close(); };
    $(".lightbox-close", box).addEventListener("click", closeBox);
    box.addEventListener("click", function (e) { if (e.target === box) closeBox(); });
    box.addEventListener("close", function () { document.documentElement.style.overflow = ""; });
    photoLinks.forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var thumb = $("img", a);
        boxImg.src = a.getAttribute("href");
        boxImg.alt = thumb ? thumb.alt : "";
        document.documentElement.style.overflow = "hidden";
        box.showModal();
        $(".lightbox-close", box).focus();
      });
    });
  }

  /* Mobile navigation */
  var toggle = $(".nav-toggle");
  var links = $("#nav-links");
  if (toggle && links) {
    var setNav = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      if (open && header) links.style.top = header.getBoundingClientRect().bottom + "px";
      links.classList.toggle("is-open", open);
      document.body.style.overflow = open ? "hidden" : "";
    };
    toggle.addEventListener("click", function () {
      setNav(toggle.getAttribute("aria-expanded") !== "true");
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) setNav(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setNav(false);
        toggle.focus();
      }
    });
    window.matchMedia("(min-width: 1081px)").addEventListener("change", function (e) {
      if (e.matches) setNav(false);
    });
  }

  /* Reveal on scroll */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* Click-to-load video (no third-party requests until played) */
  $$("[data-video]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var iframe = document.createElement("iframe");
      iframe.src =
        "https://www.youtube-nocookie.com/embed/" +
        btn.getAttribute("data-video") +
        "?autoplay=1&rel=0";
      iframe.title = btn.getAttribute("data-title") || "Video";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      iframe.allowFullscreen = true;
      btn.replaceWith(iframe);
    });
  });

  /* Feedback dialog (loads the Google Form only when opened) */
  $$("[data-open-dialog]").forEach(function (opener) {
    var dialog = document.getElementById(opener.getAttribute("data-open-dialog"));
    if (!dialog) return;
    opener.addEventListener("click", function () {
      var frame = $("iframe[data-src]", dialog);
      if (frame && !frame.src) frame.src = frame.getAttribute("data-src");
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  });
  $$("dialog.modal").forEach(function (dialog) {
    $$("[data-close-dialog]", dialog).forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      });
    });
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog && typeof dialog.close === "function") dialog.close();
    });
  });

  /* Share links built from the current page */
  $$("[data-share]").forEach(function (a) {
    var url = encodeURIComponent(location.href);
    var text = encodeURIComponent(document.title);
    var kind = a.getAttribute("data-share");
    if (kind === "twitter") a.href = "https://twitter.com/intent/tweet?text=" + text + "&url=" + url;
    if (kind === "facebook") a.href = "https://www.facebook.com/sharer/sharer.php?u=" + url;
    if (kind === "linkedin") a.href = "https://www.linkedin.com/shareArticle?mini=true&url=" + url + "&title=" + text;
    if (kind === "whatsapp") a.href = "https://wa.me/?text=" + text + "%20" + url;
  });

  /* Forms */
  function setInvalid(input, invalid) {
    input.setAttribute("aria-invalid", invalid ? "true" : "false");
  }

  function status(form, kind, message) {
    var box = $(".form-status", form);
    if (!box) return;
    box.className = "form-status is-" + kind;
    box.textContent = message;
  }

  function validate(form) {
    var ok = true;
    $$("[required]", form).forEach(function (input) {
      var value = input.value.trim();
      var bad = !value || (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
      setInvalid(input, bad);
      if (bad && ok) {
        ok = false;
        input.focus();
      } else if (bad) {
        ok = false;
      }
    });
    return ok;
  }

  function postJSON(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res;
    });
  }

  function firstSuccess(urls, payload) {
    return urls.reduce(function (chain, url) {
      return chain.catch(function () {
        return postJSON(url, payload);
      });
    }, Promise.reject());
  }

  function wireForm(form, submit, successMessage) {
    var button = $("button[type=submit]", form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status(form, "", "");
      if (!validate(form)) return;
      var label = button.textContent;
      button.disabled = true;
      button.textContent = "Sending…";
      submit()
        .then(function () {
          form.reset();
          status(form, "success", successMessage);
        })
        .catch(function () {
          status(
            form,
            "error",
            "We couldn't send that just now. Please try again, or call us toll-free on 0800 1100 2200."
          );
        })
        .then(function () {
          button.disabled = false;
          button.textContent = label;
        });
    });
    $$("input, textarea, select", form).forEach(function (input) {
      input.addEventListener("input", function () {
        setInvalid(input, false);
      });
    });
  }

  $$("form[data-form=newsletter]").forEach(function (form) {
    wireForm(
      form,
      function () {
        return firstSuccess(NEWSLETTER_URLS, {
          first_name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
        });
      },
      "You're subscribed. Thank you for joining us."
    );
  });

  $$("form[data-form=contact]").forEach(function (form) {
    wireForm(
      form,
      function () {
        var topic = form.elements.topic ? form.elements.topic.value : "";
        var message = form.elements.message.value.trim();
        return postJSON(CONTACT_URL, {
          name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
          contribution: topic ? "[" + topic + "] " + message : message,
        });
      },
      "Message sent. Thank you, we'll be in touch."
    );
  });
  /* Photo slider: shows 3 photos at once on wide screens (2 on tablets, 1 on phones) and moves one photo at a time */
  $$("[data-slider]").forEach(function (slider) {
    var track = $(".slider-track", slider);
    var slides = $$(".slide", slider);
    var prev = $("[data-slider-prev]", slider);
    var next = $("[data-slider-next]", slider);
    var dotsBox = $("[data-slider-dots]", slider);
    if (!track || slides.length < 2) return;
    var index = 0;
    var timer = null;
    var settle = null;
    var moving = false;
    var dots = [];
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function perView() { return Math.max(1, Math.round(track.clientWidth / slides[0].offsetWidth)); }
    function maxIndex() { return Math.max(0, slides.length - perView()); }
    function step() { return slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth; }

    function buildDots() {
      var want = maxIndex() + 1;
      if (dots.length === want) return;
      dotsBox.textContent = "";
      dots = [];
      for (var i = 0; i < want; i++) {
        (function (n) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "slider-dot";
          b.setAttribute("aria-label", "Show photos from " + (n + 1));
          b.addEventListener("click", function () { go(n, true); });
          dotsBox.appendChild(b);
          dots.push(b);
        })(i);
      }
      dotsBox.hidden = want < 2;
    }

    function paint() {
      buildDots();
      index = Math.max(0, Math.min(maxIndex(), index));
      dots.forEach(function (d, i) { d.setAttribute("aria-current", i === index ? "true" : "false"); });
      prev.disabled = index === 0;
      next.disabled = index >= maxIndex();
    }

    function go(i, user) {
      index = Math.max(0, Math.min(maxIndex(), i));
      moving = true;
      clearTimeout(settle);
      settle = setTimeout(function () { moving = false; }, 700);
      track.scrollTo({ left: slides[index].offsetLeft - slides[0].offsetLeft, behavior: reduce ? "auto" : "smooth" });
      paint();
      if (user) stop();
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      if (reduce || timer || maxIndex() === 0) return;
      timer = setInterval(function () { go(index >= maxIndex() ? 0 : index + 1, false); }, 5000);
    }

    prev.addEventListener("click", function () { go(index - 1, true); });
    next.addEventListener("click", function () { go(index + 1, true); });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1, true); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1, true); }
    });

    // keep the dots in step with swipes and scrolling
    var ticking = false;
    track.addEventListener("scroll", function () {
      if (ticking || moving) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var i = Math.round(track.scrollLeft / step());
        if (i !== index && i >= 0 && i <= maxIndex()) { index = i; paint(); }
      });
    }, { passive: true });
    track.addEventListener("pointerdown", stop);
    slider.addEventListener("mouseenter", stop);
    slider.addEventListener("focusin", stop);
    window.addEventListener("resize", function () { paint(); go(index, false); });

    // autoplay only while the slider is on screen
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.4 }).observe(slider);
    }
    paint();
  });
})();
