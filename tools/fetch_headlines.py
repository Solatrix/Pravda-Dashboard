"""Collect the latest headlines of every Pravda network domain, server-side, and scan them on urlscan.io.

Runs nightly in a GitHub Action, so visitors' browsers never contact the network's sites: one request per
domain per night, from GitHub's machines, no cookies kept. With --scan, the articles the Atlas displays (the
newest shown per target) are submitted to urlscan.io as public scans, so each headline can link to a scan
(screenshot and page contents) instead of the live site. An article is submitted once: scans recorded in the
previous output file are reused. Needs the URLSCAN_API_KEY environment variable (a repository secret); without
it headlines are still collected, just not scanned.

Usage: python fetch_headlines.py <pravda-all-domains.json> <out headlines.json> [--per-domain 10] [--scan]
       python fetch_headlines.py <pravda-all-domains.json> --probe [N]
--probe tries every feed path on N domains (default 3), prints what each returns and writes nothing.
Standard library only.
"""
import json, os, sys, time, http.client, urllib.request, urllib.error, xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

MAPPING, OUT = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else None)
PROBE = int(sys.argv[sys.argv.index("--probe") + 1]) if "--probe" in sys.argv and sys.argv.index("--probe") + 1 < len(sys.argv) else (3 if "--probe" in sys.argv else 0)
PER = int(sys.argv[sys.argv.index("--per-domain") + 1]) if "--per-domain" in sys.argv else 10
SCAN = "--scan" in sys.argv
KEY = os.environ.get("URLSCAN_API_KEY", "").strip()
SHOWN = 8            # headlines per target in the Atlas (latest() in app.js): only these are scanned
WORKERS = 8          # domains collected in parallel; each worker waits 1 s after a domain
MAX_SCANS = 1000     # per run, a safety cap on the daily quota
COLLECT_BUDGET, SCAN_BUDGET = 15 * 60, 45 * 60   # seconds since start; the workflow is killed at 60 minutes
T0 = time.monotonic()
UA = "PravdaAtlas-research-bot/1.0 (+https://github.com/Solatrix/Pravda-Dashboard)"
# Feed locations to try, in order. /rss.xml confirmed by --probe on GitHub (Oct 2026): 200 items per site.
CANDIDATES = ["/rss.xml", "/rss", "/feed", "/feed/", "/sitemap-news.xml", "/sitemap.xml"]
NS = {"atom": "http://www.w3.org/2005/Atom", "news": "http://www.google.com/schemas/sitemap-news/0.9",
      "sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def iso(s):
    if not s: return None
    try: return parsedate_to_datetime(s).astimezone(timezone.utc).isoformat()
    except Exception:
        try: return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except Exception: return None


def parse(xml):
    root = ET.fromstring(xml)
    items = []
    for it in root.iter("item"):                                   # RSS 2.0
        items.append({"title": (it.findtext("title") or "").strip(), "url": (it.findtext("link") or "").strip(), "published": iso(it.findtext("pubDate"))})
    for e in root.iter(f"{{{NS['atom']}}}entry"):                   # Atom
        link = e.find("atom:link", NS)
        items.append({"title": (e.findtext("atom:title", "", NS)).strip(), "url": link.get("href") if link is not None else "", "published": iso(e.findtext("atom:updated", None, NS))})
    for u in root.iter(f"{{{NS['sm']}}}url"):                        # news sitemap
        n = u.find("news:news", NS)
        if n is not None:
            items.append({"title": (n.findtext("news:title", "", NS)).strip(), "url": u.findtext("sm:loc", "", NS).strip(), "published": iso(n.findtext("news:publication_date", None, NS))})
    return [i for i in items if i["title"] and i["url"]]


class Stop(Exception):
    """Scanning cannot continue tonight (quota used up, key rejected)."""


def urlscan(method, path, body=None):
    req = urllib.request.Request("https://urlscan.io" + path, method=method, headers={"API-Key": KEY, "Content-Type": "application/json", "User-Agent": UA},
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def wait_after(e, default=30):
    try: return int(float(e.headers.get("X-Rate-Limit-Reset-After") or e.headers.get("Retry-After") or default))
    except ValueError: return default


def submit(url):
    """The scan's result page, or None when urlscan refuses this URL; raises Stop when scanning has to end for tonight."""
    for _ in range(4):
        try:
            d = json.loads(urlscan("POST", "/api/v1/scan/", {"url": url, "visibility": "public"}))
            return d.get("result") or f"https://urlscan.io/result/{d['uuid']}/"
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = wait_after(e)
                if wait > 300: raise Stop("the daily quota is used up")
                time.sleep(wait + 1)
            elif e.code in (401, 403): raise Stop(f"urlscan rejected the API key (HTTP {e.code})")
            elif e.code < 500: return None     # refused for this URL: unresolvable, blocked...
            else: time.sleep(5)
        except (OSError, http.client.HTTPException, ValueError, KeyError):
            time.sleep(5)
    return None


def collect(d):
    """(domain, newest items), where items is None for a site that is down or has no feed, "skipped" past the time budget."""
    if time.monotonic() - T0 > COLLECT_BUDGET: return d, "skipped"
    items = None
    for path in CANDIDATES:
        try:
            items = parse(get(f"https://{d}{path}"))
            if items: break
        except (urllib.error.HTTPError, http.client.HTTPException, ET.ParseError, ValueError):
            continue  # the site answers but not with a feed here: try the next path
        except OSError:
            break     # DNS failure, timeout or dropped connection: the site is down, skip it
    time.sleep(1)     # gentle on their servers
    if not items: return d, None
    items.sort(key=lambda i: i["published"] or "", reverse=True)
    return d, items[:PER]


mapping = json.load(open(MAPPING))
domains = sorted({d for ds in mapping["Regions"].values() for d in ds})

if PROBE:
    # Spread the sample across the alphabet so it covers different site generations.
    sample = domains[::max(1, len(domains) // PROBE)][:PROBE]
    for d in sample:
        print(f"== {d}")
        for path in CANDIDATES:
            url = f"https://{d}{path}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, text/xml"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    body, status, ctype, final = r.read(), r.status, r.headers.get("Content-Type", ""), r.geturl()
                try: items = parse(body)
                except ET.ParseError: items = None
                note = f"{len(items)} items, newest: {items[0]['title'][:70]!r}" if items else ("not XML" if items is None else "XML, 0 items")
                print(f"  {path:<18} {status} {ctype[:30]:<30} {len(body):>8} B  {note}" + (f"  -> {final}" if final != url else ""))
            except urllib.error.HTTPError as e:
                print(f"  {path:<18} {e.code}")
            except Exception as e:
                print(f"  {path:<18} error: {type(e).__name__}: {e}")
            time.sleep(1)
    sys.exit(0)

prev_scans = {}
if OUT and os.path.exists(OUT):
    try:
        prev = json.load(open(OUT))
        prev_scans = {i["url"]: i["scan"] for items in prev.get("domains", {}).values() for i in items if i.get("scan")}
    except (OSError, ValueError, KeyError, AttributeError):
        pass

with ThreadPoolExecutor(WORKERS) as pool:
    results = list(pool.map(collect, domains))
out = {"generated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "domains": {}, "failed": []}
skipped = [d for d, items in results if items == "skipped"]
for d, items in results:
    if items == "skipped": continue
    if not items: out["failed"].append(d); continue
    out["domains"][d] = [{**i, **({"scan": prev_scans[i["url"]]} if i["url"] in prev_scans else {})} for i in items]
if skipped:
    out["skipped"] = skipped
    print(f"time budget reached, {len(skipped)} domains left for tomorrow", file=sys.stderr)

# What the Atlas shows for a target: its domains' items merged, newest SHOWN. Those without a scan yet need one.
todo = []
for ds in mapping["Regions"].values():
    merged = sorted((i for d in ds for i in out["domains"].get(d, [])), key=lambda i: i["published"] or "", reverse=True)
    todo += [i for i in merged[:SHOWN] if "scan" not in i]
reused = sum(1 for items in out["domains"].values() for i in items if "scan" in i)

if SCAN and not KEY:
    print("URLSCAN_API_KEY is not set: headlines collected, nothing scanned", file=sys.stderr)
elif SCAN:
    submitted = refused = 0
    try:
        for i in todo[:MAX_SCANS]:
            if time.monotonic() - T0 > SCAN_BUDGET:
                print("time budget reached, the remaining articles will be scanned tomorrow", file=sys.stderr); break
            r = submit(i["url"])
            if r: i["scan"] = r; submitted += 1     # a scan is ready within seconds, long before the file is published
            else: refused += 1
            time.sleep(1.2)   # urlscan limits submissions per minute
    except Stop as e:
        print(f"scanning stopped: {e}", file=sys.stderr)
    print(f"scans: {submitted} submitted, {refused} refused, {len(todo) - submitted - refused} left for tomorrow, {reused} reused", file=sys.stderr)
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"{len(out['domains'])} domains with headlines, {len(out['failed'])} without", file=sys.stderr)
