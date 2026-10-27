# Pravda Network Atlas

An interactive globe of the Pravda Network, the Russian disinformation network first reported by Viginum. It shows which countries, regions and themes each site targets, how output changes month by month, and the sources behind each target.

**Live:** [solatrix.github.io/Pravda-Dashboard](https://solatrix.github.io/Pravda-Dashboard/) · [Legacy dashboard](https://solatrix.github.io/Pravda-Dashboard/legacy/)

## Data

All figures come from CheckFirst's near real-time [Pravda Network Data Collection](https://github.com/CheckFirstHQ/pravda-network). This repository adds:

- `res/json/pravda-all-domains.json`: which domains serve which target
- `res/json/summary.json`: per-target monthly totals, recent days and twins (built twice daily)
- `res/json/history.json`: month-by-month sources and categories from CheckFirst's git history (built weekly)
- `res/json/headlines.json`: latest headlines with Wayback Machine links (built nightly)

The site is static (GitHub Pages). The JSON files are built by GitHub Actions in `.github/workflows/`, using the scripts in `tools/`, so visitors' browsers never contact the network's sites.

## Run locally

```sh
python3 -m http.server 8000
```

## Context

Originally built with [DFRLab](https://www.dfrlab.org) and [CheckFirst](https://www.checkfirst.network). For the network's tactics and targets, see [DFRLab's report](https://dfrlab.org/the-pravda-network/). CheckFirst also runs its own [Pravda Dashboard](https://portal-kombat.com).

Built with D3, globe.gl and world-atlas (Natural Earth). The previous version, in `legacy/`, uses D3, Plotly and Leaflet.

## Citation

> Valentin Châtelet. *Pravda Network Atlas*. https://github.com/Solatrix/Pravda-Dashboard. Data: CheckFirst, Pravda Network Data Collection, https://github.com/CheckFirstHQ/pravda-network.

**Maintainer:** Valentin Châtelet
