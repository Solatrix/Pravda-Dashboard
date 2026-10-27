"""Collect the latest headlines of every Pravda network domain, server-side.

Runs nightly in a GitHub Action, so visitors' browsers never contact the
network's sites: one request per domain per night, from GitHub's machines,
no cookies kept. Each article is linked to a Wayback Machine copy; with
--archive the job also asks the Wayback Machine to capture articles it
doesn't hold yet.

Usage: python fetch_headlines.py <pravda-all-domains.json> <out headlines.json> [--per-domain 10] [--archive]
       python fetch_headlines.py <pravda-all-domains.json> --probe [N]
--probe tries every feed path on N domains (default 3), prints what each returns and writes nothing.
Standard library only.
"""
import json, sys, time, http.client, urllib.request, urllib.error, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

MAPPING, OUT = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else None)
PROBE = int(sys.argv[sys.argv.index("--probe") + 1]) if "--probe" in sys.argv and sys.argv.index("--probe") + 1 < len(sys.argv) else (3 if "--probe" in sys.argv else 0)
PER = int(sys.argv[sys.argv.index("--per-domain") + 1]) if "--per-domain" in sys.argv else 10
ARCHIVE = "--archive" in sys.argv
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


def wayback(url):
    """Closest existing capture, or a capture request when --archive is set."""
    try:
        data = json.loads(get("https://archive.org/wayback/available?url=" + urllib.request.quote(url, safe="")))
        snap = data.get("archived_snapshots", {}).get("closest")
        if snap and snap.get("available"): return snap["url"]
        if ARCHIVE:
            get("https://web.archive.org/save/" + url, timeout=60)
            time.sleep(5)  # stay well under Save Page Now's rate limit
    except Exception:
        pass
    return "https://web.archive.org/web/" + url


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

out = {"generated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "domains": {}, "failed": []}
for d in domains:
    items = None
    for path in CANDIDATES:
        try:
            items = parse(get(f"https://{d}{path}"))
            if items: break
        except (urllib.error.HTTPError, http.client.HTTPException, ET.ParseError, ValueError):
            continue  # the site answers but not with a feed here: try the next path
        except OSError:
            break     # DNS failure, timeout or dropped connection: the site is down, skip it
    if not items:
        out["failed"].append(d); continue
    items.sort(key=lambda i: i["published"] or "", reverse=True)
    out["domains"][d] = [{**i, "archive": wayback(i["url"])} for i in items[:PER]]
    time.sleep(1)  # one domain per second: gentle on their servers and on archive.org
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"{len(out['domains'])} domains with headlines, {len(out['failed'])} without", file=sys.stderr)
