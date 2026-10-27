"""Builds the prototype's data folder.

- res/pravda-all-domains.json : the repo's own mapping file, extended with a
  "Meta" block (ISO numeric code, type, parent, pin coordinates) and the three
  feed domains that were missing (au., lt., md.). "Regions" keeps its shape.
- feed/*.json : a snapshot of CheckFirst's files in their ORIGINAL shape,
  trimmed to the fields the app reads (the artifact sandbox can't fetch
  raw.githubusercontent.com; on GitHub Pages the loader reads the live feed).
"""
import json, glob, os, sys, shutil

FEED = sys.argv[1]          # CheckFirst json dir
REPO = sys.argv[2]          # Pravda-Dashboard checkout
OUT = sys.argv[3]           # output shared dir
WA = sys.argv[4]            # world-atlas package dir

os.makedirs(f"{OUT}/feed", exist_ok=True)
os.makedirs(f"{OUT}/res", exist_ok=True)

mapping = json.load(open(f"{REPO}/res/json/pravda-all-domains.json"))
R = mapping["Regions"]

# Domains present in the feed but missing from the mapping
R["Australia"].append("au.news-pravda.com")
R["Lithuania"].append("lt.news-pravda.com")
R["Moldova"].append("md.news-pravda.com")

ISO = {
 "Albania": "008", "Algeria": "012", "Armenia": "051", "Australia": "036", "Austria": "040",
 "Belgium": "056", "Bosnia and Herzegovina": "070", "Bulgaria": "100", "Burkina Faso": "854",
 "Cameroon": "120", "Canada": "124", "Central African Republic": "140", "Chad": "148",
 "Croatia": "191", "Cyprus": "196", "Czech Republic": "203", "Denmark": "208",
 "North Korea (DPRK)": "408", "Egypt": "818", "Equatorial Guinea": "226", "Eritrea": "232",
 "Estonia": "233", "Finland": "246", "France": "250", "Gambia": "270", "Georgia": "268",
 "Germany": "276", "Greece": "300", "Guinea-Bissau": "624", "Hungary": "348", "Iceland": "352",
 "Ireland": "372", "Italy": "380", "Japan": "392", "South Korea": "410", "Latvia": "428",
 "Lithuania": "440", "Luxemburg": "442", "Mali": "466", "Malta": "470", "Mauritania": "478",
 "Moldova": "498", "Montenegro": "499", "Netherlands": "528", "New Zealand": "554",
 "Niger": "562", "Nigeria": "566", "North-Macedonia": "807", "Norway": "578", "Poland": "616",
 "Portugal": "620", "Romania": "642", "Senegal": "686", "Serbia": "688", "Singapore": "702",
 "Slovakia": "703", "Slovenia": "705", "South-Sudan": "728", "Spain": "724", "Sudan": "729",
 "Sweden": "752", "Switzerland": "756", "Syria": "760", "Taiwan": "158", "Turkey": "792",
 "Ukraine": "804", "United Kingdom": "826", "United States of America": "840",
}
SUB = {  # sub-national targets: parent ISO + pin
 "GE/Abkhazia": ("268", 43.0, 41.0, "Abkhazia"),
 "GE/South-Ossetia": ("268", 42.35, 44.0, "South Ossetia"),
 "ES/Basque Country": ("724", 43.0, -2.6, "Basque Country"),
 "ES/Catalonia": ("724", 41.8, 1.5, "Catalonia"),
 "ES/Galicia": ("724", 42.75, -7.9, "Galicia"),
 "Republika Srpska": ("070", 44.75, 17.3, "Republika Srpska"),
 "UK/Scotland": ("826", 56.8, -4.2, "Scotland"),
 "UK/Wales": ("826", 52.3, -3.7, "Wales"),
}
OTHER = {  # no single geography
 "EU": ("supranational", 50.85, 4.35, "European Union"),
 "NATO": ("supranational", 50.88, 4.42, "NATO"),
 "Region/Balkans": ("supranational", 43.5, 20.5, "Balkans"),
 "Trump": ("thematic", None, None, "Trump"),
 "Macron": ("thematic", None, None, "Macron"),
 "All": ("hub", None, None, "Network hub"),
}
LABEL = {"North-Macedonia": "North Macedonia", "South-Sudan": "South Sudan",
         "Luxemburg": "Luxembourg", "North Korea (DPRK)": "North Korea",
         "United States of America": "United States"}

topo = json.load(open(f"{WA}/countries-50m.json"))
ids = {g.get("id") for g in topo["objects"]["countries"]["geometries"]}

meta = {}
for name in R:
    if name in ISO:
        assert ISO[name] in ids, (name, ISO[name])
        meta[name] = {"type": "country", "iso": ISO[name], "label": LABEL.get(name, name)}
    elif name in SUB:
        p, lat, lon, lab = SUB[name]
        meta[name] = {"type": "subnational", "parent": p, "lat": lat, "lon": lon, "label": lab}
    elif name in OTHER:
        t, lat, lon, lab = OTHER[name]
        m = {"type": t, "label": lab}
        if lat is not None: m.update(lat=lat, lon=lon)
        meta[name] = m
    else:
        raise SystemExit("unmapped region " + name)

for k in ("EU", "GE/Abkhazia", "ES/Galicia", "Republika Srpska", "UK/Wales"):
    meta[k]["side"] = "left"
mapping["Meta"] = meta
for d in ("au.news-pravda.com", "lt.news-pravda.com", "md.news-pravda.com"):
    if d not in mapping["domains"]: mapping["domains"].append(d)
json.dump(mapping, open(f"{OUT}/res/pravda-all-domains.json", "w"), ensure_ascii=False, indent=1)

# Keep only the 50m topology (≈740 KB vs the 10 MB GeoJSON)
shutil.copy(f"{WA}/countries-50m.json", f"{OUT}/res/countries-50m.json")
for f in ("domainActiveSince.json",):
    shutil.copy(f"{REPO}/res/json/{f}", f"{OUT}/res/{f}")
shutil.copy(f"{REPO}/datasets/info-defense-dataset.json", f"{OUT}/res/info-defense-dataset.json")

DOMAIN_KEYS = ["domain", "totalArticles", "articlesPerDay", "topSources", "categories",
               "publicationHours", "topSourceNames", "alternatesStats", "languages",
               "languageConnections"]
NET_KEYS = DOMAIN_KEYS + ["domainsCount", "articlesPerDomain"]
total = 0
for path in sorted(glob.glob(f"{FEED}/*_viz.json")):
    d = json.load(open(path))
    net = os.path.basename(path).startswith("a.network")
    out = {k: d[k] for k in (NET_KEYS if net else DOMAIN_KEYS) if k in d}
    out["topSources"] = out.get("topSources", [])[: 400 if net else 150]
    if not net:
        out["languageConnections"] = sorted(out.get("languageConnections", []),
                                            key=lambda c: -c["strength"])[:60]
    s = json.dumps(out, separators=(",", ":"))
    open(f"{OUT}/feed/{os.path.basename(path)}", "w").write(s)
    total += len(s)
print("feed files:", len(glob.glob(f"{OUT}/feed/*.json")), "size KB:", total // 1024)
print("regions:", len(meta), {t: sum(1 for m in meta.values() if m["type"] == t) for t in {m["type"] for m in meta.values()}})
