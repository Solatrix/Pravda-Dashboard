"""Compact per-target summary for the Atlas, so visitors don't download every domain file.

Merges each target's domains exactly as the Atlas does and keeps only what the
overview needs for every target at once: monthly totals, the last 150 days of
daily counts (momentum and sparklines) and the five closest twins by source
mix. A target's full files are still fetched when someone opens it.
The output has no timestamp, so it only changes when CheckFirst's data does.

Usage: python build_summary.py <dir with *_viz.json> <pravda-all-domains.json> <out summary.json> [--sha COMMIT]
Standard library only.
"""
import json, math, os, sys, datetime as dt
from collections import Counter

SRC, MAPPING, OUT = sys.argv[1:4]
SHA = sys.argv[sys.argv.index("--sha") + 1] if "--sha" in sys.argv else None
RECENT = 150
NETWORK = "a.network.news-pravda.com"


def load(domain):
    path = os.path.join(SRC, f"{domain}_viz.json")
    return json.load(open(path)) if os.path.exists(path) else None


def cosine(a, b):
    dot = sum(v * b.get(k, 0) for k, v in a.items())
    na, nb = math.sqrt(sum(v * v for v in a.values())), math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0


network = load(NETWORK)
last = network["articlesPerDay"][-1]["date"]
end = dt.date.fromisoformat(last)
window = [(end - dt.timedelta(days=i)).isoformat() for i in range(RECENT - 1, -1, -1)]
per_domain = {e["domain"]: e["totalArticles"] for e in network["articlesPerDomain"]}

regions, sources = {}, {}
for name, domains in json.load(open(MAPPING))["Regions"].items():
    live = [d for d in domains if d in per_domain]
    if not sum(per_domain[d] for d in live): continue
    files = [f for f in map(load, live) if f]
    days, src = Counter(), Counter()
    for f in files:
        for e in f.get("articlesPerDay") or []: days[e["date"]] += e["count"]
        for e in f.get("topSources") or []: src[e["source"]] += e["count"]
    monthly = Counter()
    for date, n in days.items(): monthly[date[:7]] += n
    regions[name] = {
        "monthly": dict(sorted(monthly.items())),
        "firstDay": min((d for d, n in days.items() if n > 0), default=None),
        "recent": [days.get(d, 0) for d in window],
    }
    sources[name] = src

for name, r in regions.items():
    scored = ((cosine(sources[name], sources[o]), o) for o in regions if o != name)
    scores = sorted((x for x in scored if x[0] > 0), key=lambda x: -x[0])[:5]
    r["twins"] = [[o, round(s, 4)] for s, o in scores]

out = {"source": "github.com/CheckFirstHQ/pravda-network", "snapshot": SHA, "lastDate": last, "recentDays": RECENT, "regions": regions}
text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
if os.path.exists(OUT) and open(OUT).read() == text:
    print("unchanged", OUT, file=sys.stderr)
else:
    open(OUT, "w").write(text)
    print("wrote", OUT, len(text) // 1024, "KB,", len(regions), "targets, data to", last, file=sys.stderr)
