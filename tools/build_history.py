"""Monthly history of the Pravda network from CheckFirst's git snapshots.

CheckFirst commits its JSON hourly. Fields such as topSources, categories and
languages are cumulative totals with no dates, so the difference between two
month-end snapshots gives that month's figures. The source data is only read.

Usage (locally or in a GitHub Action with a full-history, blobless checkout):
    python build_history.py <pravda-network checkout> <pravda-all-domains.json> <out history.json> [cache dir]
"""
import json, os, subprocess, sys, tarfile, io, datetime as dt
from collections import Counter, defaultdict

REPO, MAPPING, OUT = sys.argv[1:4]
CACHE = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(OUT), ".history-cache")
os.makedirs(CACHE, exist_ok=True)
# Network-wide totals, not sites: all.news-pravda.com until April 2025, then a.network.news-pravda.com.
NETWORK_FILES = ("a.network.news-pravda.com", "all.news-pravda.com")
git = lambda *a: subprocess.run(["git", "-C", REPO, *a], check=True, capture_output=True).stdout


def month_ends():
    """Last commit touching json/ in each complete month, plus the latest commit."""
    first = git("log", "--reverse", "--format=%cI", "--", "json").decode().split("\n", 1)[0][:7]
    y, m = map(int, first.split("-"))
    today = dt.date.today()
    out = []
    while (y, m) < (today.year, today.month):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        sha = git("rev-list", "-1", f"--before={ny}-{nm:02d}-01T00:00:00Z", "HEAD", "--", "json").decode().strip()
        if sha: out.append((f"{y}-{m:02d}", sha))
        y, m = ny, nm
    head = git("rev-parse", "HEAD").decode().strip()
    out.append((f"{today.year}-{today.month:02d}", head))   # month to date
    return out


def snapshot(sha):
    """Cumulative counters per domain at one commit (cached as compact JSON)."""
    path = os.path.join(CACHE, sha + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    raw = git("archive", sha, "json")
    snap = {}
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        for m in tar.getmembers():
            if not m.name.endswith("_viz.json"): continue
            d = json.load(tar.extractfile(m))
            dom = os.path.basename(m.name)[:-9]
            snap[dom] = {
                "total": d.get("totalArticles", 0),
                "sources": {e["source"]: e["count"] for e in d.get("topSources", [])},
                "categories": {e["category"]: e["count"] for e in d.get("categories", [])},
                "languages": {e["language"]: e["count"] for e in d.get("languages", [])},
                "domains": d.get("allDomains") if dom in NETWORK_FILES else None,
            }
    json.dump(snap, open(path, "w"), separators=(",", ":"))
    return snap


def diff(new, old):
    """Positive month deltas; counts that went down (reprocessing) are clamped and reported."""
    out, neg = Counter(), 0
    for k, v in new.items():
        dv = v - old.get(k, 0)
        if dv > 0: out[k] = dv
        elif dv < 0: neg += 1
    return out, neg


mapping = json.load(open(MAPPING))
regions = mapping["Regions"]
ends = month_ends()
print("month-ends:", len(ends), file=sys.stderr)
snaps = []
for label, sha in ends:
    snaps.append((label, sha, snapshot(sha)))
    print("snapshot", label, sha[:8], file=sys.stderr, flush=True)

months = [label for label, _, _ in snaps[1:]]
hist = {"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "source": "github.com/CheckFirstHQ/pravda-network (git history, month-end snapshots)",
        "months": months, "partialLast": True,
        "snapshots": {label: sha for label, sha, _ in snaps},
        "network": {"domains": [], "added": [], "removed": []}, "regions": {}, "clamped": 0}

for name, doms in regions.items():
    r = {"total": [], "sources": [], "newSources": [], "categories": [], "languages": []}
    for (_, _, old), (label, _, new) in zip(snaps, snaps[1:]):
        tot, src, cat, lang, seen_before = 0, Counter(), Counter(), Counter(), set()
        for d in doms:
            if d not in new: continue
            o = old.get(d, {"total": 0, "sources": {}, "categories": {}, "languages": {}})
            tot += max(0, new[d]["total"] - o["total"])
            for key, acc in (("sources", src), ("categories", cat), ("languages", lang)):
                delta, neg = diff(new[d][key], o[key])
                acc.update(delta); hist["clamped"] += neg
            seen_before |= set(o["sources"])
        top = src.most_common(10)
        r["total"].append(tot)
        r["sources"].append([[s, c] for s, c in top])
        # Sources in this month's top 10 that were not in the target's list a month earlier
        r["newSources"].append([s for s, _ in top if s not in seen_before] if seen_before else [])
        r["categories"].append(dict(cat.most_common()))
        r["languages"].append(dict(lang.most_common(6)))
    if any(r["total"]): hist["regions"][name] = r

prev = None
for label, _, snap in snaps:
    net = next((v for k, v in snap.items() if k in NETWORK_FILES), None)
    cur = set((net or {}).get("domains") or [k for k in snap if k not in NETWORK_FILES])
    # Keep the network's own sites; from 2026 the list also carries AMP mirrors and telegra.ph.
    known = {d for ds in regions.values() for d in ds}
    cur = {d for d in cur if d not in NETWORK_FILES and (d in known or (d.endswith("news-pravda.com") and "ampproject" not in d))}
    if prev is not None:
        hist["network"]["domains"].append(len(cur))
        hist["network"]["added"].append(sorted(cur - prev))
        hist["network"]["removed"].append(sorted(prev - cur))
    prev = cur

json.dump(hist, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB; clamped deltas:", hist["clamped"], file=sys.stderr)
