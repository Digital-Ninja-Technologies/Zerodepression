"""Builds each game's index.html from a shared shell. Run: python3 play/_src/build.py (from the repo root)."""
import pathlib, html
ROOT = pathlib.Path(__file__).resolve().parents[2]
SHELL_HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} | ZeroDepression games</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="{theme}">
<link rel="canonical" href="https://www.zerodepression.org/play/{slug}/">
<link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png?v=2" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ZeroDepression">
<meta property="og:title" content="{title}: a free game from ZeroDepression">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://www.zerodepression.org/play/{slug}/">
<meta property="og:image" content="https://www.zerodepression.org/play/og/{slug}.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/play/play.css">
<link rel="stylesheet" href="/play/{slug}/game.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-4RCRQ4Q5N7"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','G-4RCRQ4Q5N7');</script>
</head>
<body class="play-page" data-game="{slug}">
<header class="play-bar">
  <a class="play-bar__logo" href="/" aria-label="ZeroDepression home"><img src="{logo}" alt="ZeroDepression" width="908" height="357"></a>
  <nav class="play-bar__nav" aria-label="Games">
    <a class="play-bar__link" href="/play/">All games</a>
    <button class="play-help-btn" type="button" data-open-help>Talk to someone</button>
  </nav>
</header>
<main id="main" class="game-stage">
"""
SHELL_FOOT = """</main>
<p class="game-foot">A free game from <a href="/">ZeroDepression</a>. Need to talk? Call <a href="tel:+23480011002200">0800 1100 2200</a> (free) or <a href="/chat/">chat with a counsellor</a>.</p>
<script src="/play/play.js"></script>
<script src="/play/{slug}/game.js"></script>
</body>
</html>
"""
GAMES = {
  "danfo-breathe": ("Danfo Breathe", "Drive a danfo across Lagos at sunset. Hold to breathe in, let go to breathe out. A free 2-minute breathing game.", "#5a1a5e"),
  "oja-ero": ("Ọjà Èrò: The Thought Market", "Customers bring heavy thoughts to your market stall. Spot the thinking trap and trade it for a lighter, truer thought.", "#fff0d2"),
  "irorun-garden": ("Ìrọ̀rùn Garden", "Grow a garden with small acts of self-care. Miss a day and your garden simply waits for you.", "#e6f2ec"),
  "lantern-walk": ("Lantern Walk", "Walk through a quiet night, read lanterns left by people across Nigeria, and light one for a stranger.", "#10213f"),
}
for slug, (title, desc, theme) in GAMES.items():
    body = ROOT / "play" / "_src" / (slug + ".html")
    if not body.exists():
        continue
    out = SHELL_HEAD.format(title=html.escape(title), desc=html.escape(desc), theme=theme, slug=slug, logo="/assets/img/logo-white.webp" if slug == "lantern-walk" else "/assets/img/logo.webp") + body.read_text() + SHELL_FOOT.format(slug=slug)
    (ROOT / "play" / slug / "index.html").write_text(out)
    print("built", slug)
