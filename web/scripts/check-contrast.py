"""Check every fg/bg pair the dark theme actually renders, per WCAG 2.1."""
import re, sys

css = open("src/app/globals.css", encoding="utf-8").read()

def block(sel):
    m = re.search(re.escape(sel) + r"\s*\{(.*?)\n\}", css, re.S)
    return dict(re.findall(r"--([\w-]+):\s*([^;]+);", m.group(1)))

def rgb(v, tok):
    v = v.strip()
    while not v.startswith("#") and not v.startswith("rgba"):
        v = tok[v.strip()].strip()          # follow var() indirection
    if v.startswith("rgba"):
        r, g, b, a = [float(x) for x in re.findall(r"[\d.]+", v)]
        return (r, g, b, a)
    h = v.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)

def over(fg, bg):                            # composite alpha onto the backdrop
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)

def lum(c):
    def f(x):
        x /= 255
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])

def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    if a < b:
        a, b = b, a
    return (a + 0.05) / (b + 0.05)

INK_DARK = (0x0e, 0x0f, 0x0c, 1.0)           # fixed in both modes

# (label, fg token, bg token or literal, alpha applied to fg)
PAIRS = [
    ("footer body text",     "canvas-soft", INK_DARK, 0.60),
    ("footer links",         "canvas-soft", INK_DARK, 0.70),
    ("footer disclosure",    "canvas-soft", INK_DARK, 0.50),
    ("footer brand",         "canvas-soft", INK_DARK, 1.00),
    ("footer brand accent",  "primary",     INK_DARK, 1.00),
    ("pulse positive text",  "positive-deep", "accent",    1.00),
    ("pulse negative text",  "negative-deep", "secondary", 1.00),
    ("card body text",       "body",        "card",      1.00),
    ("card muted text",      "mute",        "card",      1.00),
    ("page text",            "foreground",  "background", 1.00),
    ("warning pill ink",     "warning-content", "warning", 1.00),
]

fails = 0
for mode, sel in (("light", ":root"), ("dark", ".dark")):
    tok = block(sel)
    print(f"\n{mode}")
    for label, fg_t, bg_t, alpha in PAIRS:
        bg = bg_t if isinstance(bg_t, tuple) else rgb(tok[bg_t], tok)
        if bg[3] < 1:
            bg = over(bg, (255, 255, 255, 1) if mode == "light" else INK_DARK)
        fg = rgb(tok[fg_t], tok)[:3] + (alpha,)
        r = ratio(over(fg, bg), bg)
        ok = r >= 4.5 if alpha == 1.0 else r >= 3.0   # semi-transparent = secondary text
        fails += not ok
        print(f"  {'ok ' if ok else 'FAIL'} {r:5.2f}:1  {label}")

print(f"\n{fails} failing pair(s)")
sys.exit(1 if fails else 0)
