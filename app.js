/* Pravda Network Atlas — engine.
 * Globals: d3 (v7), topojson (client v3), Globe (globe.gl).
 * Reads CheckFirst's feed unchanged, plus three files of our own:
 *   res/json/pravda-all-domains.json  target → domains, with ISO codes and types
 *   res/json/history.json             month-by-month figures from the feed's git history (optional)
 *   res/json/headlines.json           latest headlines collected server-side (optional)
 */
(() => {
"use strict";

/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-GB");
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
const signed = v => (v > 0 ? "+" : "") + pct(v);
const fmtDate = d3.utcFormat("%-d %b %Y");
const fmtMonth = d3.utcFormat("%b %Y");
const fmtMonthShort = d3.utcFormat("%b %y");
const parseDate = d3.utcParse("%Y-%m-%d");
const parseMonth = d3.utcParse("%Y-%m");
const monthLabel = m => fmtMonth(parseMonth(m));
const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fold = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const langName = (() => {
	let dn; try { dn = new Intl.DisplayNames(["en"], { type: "language" }); } catch { /* old browser */ }
	return code => { try { return dn ? dn.of(code) : code; } catch { return code; } };
})();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TYPE_LABEL = { country: "Country", subnational: "Sub-national", supranational: "Supranational", thematic: "Thematic", hub: "Network hub" };
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isTelegram = s => s.startsWith("Telegram:");
// MAX (VK's messenger) channels appear as "MAX <channel>" or as max.ru links.
const isMax = s => s.startsWith("MAX") || s.includes("max.ru");
const sourceLabel = s => isTelegram(s) ? s.slice(9).trim() : s.startsWith("MAX") ? s.replace(/^MAX:?\s*/, "") : s;
const sourceChip = s => isTelegram(s) ? `<span class="chip chip-tg">Telegram</span>` : isMax(s) ? `<span class="chip chip-max">MAX</span>` : `<span class="chip chip-web">Web</span>`;

function mergeCounts(lists, key, val = "count") {
	const m = new Map();
	for (const list of lists) for (const e of list || []) m.set(e[key], (m.get(e[key]) || 0) + e[val]);
	return [...m].map(([k, v]) => ({ [key]: k, [val]: v }));
}

/* ---------- loader: one line per step until the globe and every target file are in ---------- */
// Reads the body as a stream so the loader can count bytes; onBytes gets each chunk's size.
async function fetchJSON(url, onBytes) {
	const r = await fetch(url);
	if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
	if (!r.body) return r.json();
	const reader = r.body.getReader(), chunks = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value); onBytes?.(value.length);
	}
	return JSON.parse(await new Blob(chunks).text());
}
const kb = n => n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} KB` : `${(n / 1e6).toFixed(1)} MB`;

// One bar for the whole load. Each step owns a fixed share of 100 (libraries 10, data files 10 each,
// globe 20) and fills within it. Without summary.json the target files are added as a second 100.
const Loader = {
	total: 100,
	steps: [{ name: "Libraries", weight: 10, frac: 1, state: "done" }],
	add(name, weight, detail = "") { const s = { name, weight, detail, frac: 0, state: "run" }; this.steps.push(s); return this.set(s); },
	set(s, { state, detail, frac } = {}) {
		if (state) s.state = state;
		if (detail != null) s.detail = detail;
		if (frac != null) s.frac = frac;
		if (s.state !== "run") s.frac = 1;
		else this.current = s;
		this.render();
		return s;
	},
	render() {
		const p = Math.min(1, d3.sum(this.steps, s => s.weight * s.frac) / this.total);
		$("#ld-fill").style.width = $("#ld-pct").textContent = pct(p);
		$("#ld-bar").setAttribute("aria-valuenow", Math.round(p * 100));
		const s = this.current?.state === "run" ? this.current : this.steps.findLast(x => x.state === "run");
		if (s) $("#ld-caption").textContent = s.detail ? `${s.name} · ${s.detail}` : s.name;
	},
	// Shows the failure under the bar and resolves with the label of the button pressed.
	fail(s, msg, buttons = ["Retry"]) {
		const box = $("#ld-errors"), row = document.createElement("p");
		row.className = "ld-err"; row.textContent = `${s.name}: ${msg}`;
		box.append(row);
		document.body.dataset.state = "error";
		return new Promise(res => buttons.forEach(b => {
			const btn = document.createElement("button");
			btn.type = "button"; btn.textContent = b;
			btn.onclick = () => { row.remove(); if (!box.children.length) document.body.dataset.state = "loading"; res(b); };
			row.append(btn);
		}));
	},
	// A required file retries until it loads; an optional one is skipped and resolves null.
	async load(name, url, { optional = false } = {}) {
		const s = this.add(name, 10);
		for (;;) {
			let n = 0;
			try {
				const json = await fetchJSON(url, b => this.set(s, { detail: kb(n += b) }));
				this.set(s, { state: "done" });
				return json;
			} catch (e) {
				if (optional) { this.set(s, { state: "skip" }); return null; }
				await this.fail(s, e.status ? e.message : "network error");
			}
		}
	},
};

/* ---------- theme: Light → Dark → System, remembered per browser ---------- */
const Theme = {
	modes: ["light", "dark", "system"],
	icons: {
		light: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>`,
		dark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/></svg>`,
		system: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/></svg>`,
	},
	mode: () => document.documentElement.dataset.theme || "system",
	next(m) { return this.modes[(this.modes.indexOf(m) + 1) % this.modes.length]; },
	set(m) {
		if (m === "system") delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = m;
		try { m === "system" ? localStorage.removeItem("atlas-theme") : localStorage.setItem("atlas-theme", m); } catch { /* storage blocked */ }
	},
	init() {
		const btn = $("#theme-btn"); if (!btn) return;
		const show = () => {
			const m = this.mode(), label = `Theme: ${m}. Switch to ${this.next(m)}`;
			btn.innerHTML = this.icons[m]; btn.title = label; btn.setAttribute("aria-label", label);
		};
		btn.addEventListener("click", () => { this.set(this.next(this.mode())); show(); });
		show();
	},
};

/* ---------- data ---------- */
const Data = {
	async init(cfg) {
		this.cfg = cfg;
		const [mapping, network, infoDefense, topo, history, headlines, summary] = await Promise.all([
			Loader.load("Domain mapping", cfg.resBase + "pravda-all-domains.json"),
			Loader.load("Network totals", cfg.feedBase + "a.network.news-pravda.com_viz.json"),
			Loader.load("InfoDefense list", cfg.resBase + "info-defense-dataset.json"),
			Loader.load("Map shapes", cfg.resBase + "countries-50m.json"),
			Loader.load("Monthly history", cfg.resBase + "history.json", { optional: true }),
			Loader.load("Headlines", cfg.resBase + "headlines.json", { optional: true }),
			Loader.load("Target summary", cfg.resBase + "summary.json", { optional: true }),
		]);
		Object.assign(this, { mapping, network, topo, history, headlines, summary });
		this.infoDefense = new Set(Object.values(infoDefense));
		this.cache = new Map();
		this.failed = new Set();
		this.lastDate = network.articlesPerDay.at(-1).date;

		const perDomain = new Map(network.articlesPerDomain.map(e => [e.domain, e.totalArticles]));
		this.regions = Object.entries(mapping.Regions).map(([name, domains]) => {
			const meta = mapping.Meta[name];
			const total = d3.sum(domains, d => perDomain.get(d) || 0);
			return { name, slug: slug(meta.label), label: meta.label, meta, type: meta.type, domains, live: domains.filter(d => perDomain.has(d)), total };
		}).filter(r => r.total > 0);
		this.regions.sort((a, b) => b.total - a.total);
		this.regions.forEach((r, i) => r.rank = i + 1);
		this.bySlug = new Map(this.regions.map(r => [r.slug, r]));
		this.byIso = new Map(this.regions.filter(r => r.meta.iso).map(r => [r.meta.iso, r]));
		if (summary) this.useSummary(summary);
		return this;
	},

	/* Monthly totals, recent days and twins for every target from summary.json (built by a workflow),
	   so the overview needs none of the per-domain files. Targets missing from it fall back to their files. */
	useSummary(summary) {
		const end = parseDate(summary.lastDate);
		const dates = d3.range(summary.recentDays).map(i => d3.utcFormat("%Y-%m-%d")(d3.utcDay.offset(end, i - summary.recentDays + 1)));
		const byName = new Map(this.regions.map(r => [r.name, r]));
		for (const r of this.regions) {
			const s = summary.regions[r.name]; if (!s) continue;
			r.monthly = new Map(Object.entries(s.monthly));
			r.firstDay = s.firstDay;
			r.recent = s.recent.map((count, i) => ({ date: dates[i], count }));
			r.twins = s.twins.filter(([n]) => byName.has(n)).map(([n, score]) => ({ o: byName.get(n), s: score }));
		}
		this.recentEnd = summary.lastDate;
		this.missing = this.regions.filter(r => !r.monthly);
	},

	domainFile(domain) {
		if (!this.cache.has(domain)) {
			this.cache.set(domain, fetchJSON(`${this.cfg.feedBase}${domain}_viz.json`, b => this.onBytes?.(b))
				.catch(() => { this.failed.add(domain); return null; }));
		}
		return this.cache.get(domain);
	},

	/* A target = all of its domains merged. */
	async region(r) {
		if (r.data) return r.data;
		const files = (await Promise.all(r.live.map(d => this.domainFile(d)))).filter(Boolean);
		const total = d3.sum(files, f => f.totalArticles);
		const withAlt = d3.sum(files, f => f.alternatesStats?.articlesWithAlternates || 0);
		const altSum = d3.sum(files, f => (f.alternatesStats?.avgAlternatesPerArticle || 0) * (f.alternatesStats?.articlesWithAlternates || 0));
		const days = mergeCounts(files.map(f => f.articlesPerDay), "date").sort((a, b) => a.date < b.date ? -1 : 1);
		const monthly = new Map();
		for (const d of days) { const m = d.date.slice(0, 7); monthly.set(m, (monthly.get(m) || 0) + d.count); }
		r.data = {
			files: files.map(f => f.domain),
			totalArticles: total,
			articlesPerDay: days,
			monthly,
			topSources: mergeCounts(files.map(f => f.topSources), "source").sort((a, b) => b.count - a.count),
			categories: mergeCounts(files.map(f => f.categories), "category").sort((a, b) => b.count - a.count),
			publicationHours: mergeCounts(files.map(f => f.publicationHours), "hour").sort((a, b) => a.hour - b.hour),
			languages: mergeCounts(files.map(f => f.languages), "language").sort((a, b) => b.count - a.count),
			alternates: { share: total ? withAlt / total : 0, avg: withAlt ? altSum / withAlt : 0 },
			firstDay: days.find(d => d.count > 0)?.date,
		};
		if (!r.monthly) Object.assign(r, { monthly: r.data.monthly, firstDay: r.data.firstDay, recent: days });
		return r.data;
	},

	// Forgets failed downloads so allRegions fetches them again.
	resetFailed() {
		for (const d of this.failed) this.cache.delete(d);
		for (const r of this.regions) if (r.live.some(d => this.failed.has(d))) r.data = null;
		this.failed.clear();
	},

	async allRegions(onProgress, list = this.regions) {
		let done = 0;
		const queue = [...list];
		const worker = async () => { while (queue.length) { const r = queue.shift(); await this.region(r); onProgress?.(++done, list.length); } };
		await Promise.all(Array.from({ length: 6 }, worker));
		this.buildMonths();
	},

	/* Monthly totals, ranks and month-on-month change for every target. */
	buildMonths() {
		const first = d3.min(this.regions, r => r.firstDay) || this.network.articlesPerDay[0].date;
		this.months = d3.utcMonth.range(d3.utcMonth.floor(parseDate(first)), d3.utcMonth.offset(d3.utcMonth.floor(parseDate(this.lastDate)), 1))
			.map(d3.utcFormat("%Y-%m"));
		const lastDay = parseDate(this.lastDate);
		this.partialMonth = d3.utcDay.offset(lastDay, 1).getUTCMonth() === lastDay.getUTCMonth() ? this.months.at(-1) : null;
		this.monthStats = new Map();
		this.months.forEach((m, i) => {
			const prev = this.months[i - 1];
			const rows = this.regions.filter(r => r.monthly).map(r => ({ r, v: r.monthly.get(m) || 0, pv: prev ? r.monthly.get(prev) || 0 : 0 }))
				.filter(x => x.v > 0).sort((a, b) => b.v - a.v);
			const stats = new Map();
			rows.forEach((x, k) => stats.set(x.r, { v: x.v, rank: k + 1, prev: x.pv, change: x.pv ? x.v / x.pv - 1 : null }));
			const prevStats = prev ? this.monthStats.get(prev)?.stats : null;
			for (const [r, s] of stats) s.rankDelta = prevStats?.get(r) ? prevStats.get(r).rank - s.rank : null;
			this.monthStats.set(m, { stats, n: rows.length, total: d3.sum(rows, x => x.v) });
		});
	},
};

/* ---------- analysis ---------- */
const Analysis = {
	surges(days, max = 5) {
		const out = [];
		for (let i = 28; i < days.length; i++) {
			const win = days.slice(i - 28, i).map(d => d.count);
			const m = d3.mean(win), s = d3.deviation(win) || 0, c = days[i].count;
			if (c > m + 3 * s && c > 30 && c > m * 1.8) out.push({ ...days[i], ratio: c / Math.max(m, 1) });
		}
		out.sort((a, b) => b.ratio - a.ratio);
		const kept = [];
		for (const s of out) {
			const t = parseDate(s.date);
			if (kept.every(k => Math.abs(parseDate(k.date) - t) > 14 * 864e5)) kept.push(s);
			if (kept.length === max) break;
		}
		return kept.sort((a, b) => a.date < b.date ? -1 : 1);
	},
	rolling(days, n = 7) {
		let acc = 0;
		return days.map((d, i) => { acc += d.count; if (i >= n) acc -= days[i - n].count; return { date: d.date, v: acc / Math.min(i + 1, n) }; });
	},
	momentum(days, lastDate) {
		const end = parseDate(lastDate);
		const sumRange = (from, to) => d3.sum(days, d => { const t = parseDate(d.date); return t > from && t <= to ? d.count : 0; });
		const d30 = d3.utcDay.offset(end, -30), d120 = d3.utcDay.offset(end, -120);
		const recent = sumRange(d30, end) / 30, before = sumRange(d120, d30) / 90;
		return { recent, before, change: before ? recent / before - 1 : null };
	},
	vector(data) { return new Map(data.topSources.map(s => [s.source, s.count])); },
	cosine(a, b) {
		let dot = 0, na = 0, nb = 0;
		for (const [k, v] of a) { na += v * v; const w = b.get(k); if (w) dot += v * w; }
		for (const v of b.values()) nb += v * v;
		return na && nb ? dot / Math.sqrt(na * nb) : 0;
	},
	weekday(days) {
		const sums = Array(7).fill(0);
		for (const d of days.slice(-364)) sums[(parseDate(d.date).getUTCDay() + 6) % 7] += d.count;
		const mean = d3.mean(sums);
		return sums.map(v => v / mean);
	},
};

/* ---------- tooltip ---------- */
const Tip = {
	el: null,
	show(html, x, y) {
		if (!this.el) this.el = $("#tooltip");
		this.el.innerHTML = html; this.el.hidden = false;
		const w = this.el.offsetWidth, h = this.el.offsetHeight;
		this.el.style.transform = `translate(${Math.min(Math.max(8, x + 14), innerWidth - w - 8)}px, ${y + 16 + h > innerHeight ? y - h - 12 : y + 16}px)`;
	},
	hide() { if (this.el) this.el.hidden = true; },
};
const tipOn = (el, html) => {
	el.addEventListener("pointerenter", e => Tip.show(html(), e.clientX, e.clientY));
	el.addEventListener("pointermove", e => Tip.show(html(), e.clientX, e.clientY));
	el.addEventListener("pointerleave", () => Tip.hide());
};

/* ---------- charts ---------- */
const Charts = {
	width(el) { return Math.max(260, el.clientWidth || el.parentElement.clientWidth || 320); },

	timeline(el, days, { surges = [], height = 170 } = {}) {
		el.innerHTML = "";
		const W = this.width(el), M = { t: 10, r: 8, b: 22, l: 38 };
		const pts = days.map(d => ({ t: parseDate(d.date), v: d.count, date: d.date }));
		const roll = Analysis.rolling(days).map(d => ({ t: parseDate(d.date), v: d.v }));
		const x = d3.scaleUtc(d3.extent(pts, d => d.t), [M.l, W - M.r]);
		const y = d3.scaleLinear([0, d3.max(pts, d => d.v) || 1], [height - M.b, M.t]).nice();
		const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${height}`).attr("width", "100%").attr("role", "img")
			.attr("aria-label", `Daily articles from ${fmtDate(pts[0].t)} to ${fmtDate(pts.at(-1).t)}`);
		svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(3)).join("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y).attr("y2", y);
		svg.append("path").datum(pts).attr("class", "area-daily").attr("d", d3.area().x(d => x(d.t)).y0(y(0)).y1(d => y(d.v)).curve(d3.curveStepAfter));
		svg.append("path").datum(roll).attr("class", "line-roll").attr("d", d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX));
		svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - M.b})`).call(d3.axisBottom(x).ticks(W < 420 ? 3 : 6).tickSizeOuter(0));
		svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(compact.format).tickSize(0)).call(g => g.select(".domain").remove());
		const sg = svg.append("g").attr("class", "surges").selectAll("g").data(surges).join("g").attr("transform", d => `translate(${x(parseDate(d.date))},${y(d.count)})`);
		sg.append("circle").attr("r", 4.5);
		sg.append("text").attr("y", -9).attr("text-anchor", d => x(parseDate(d.date)) > W - 60 ? "end" : "middle").text((d, i) => i + 1);
		const focus = svg.append("g").attr("class", "focus").style("display", "none");
		focus.append("line").attr("y1", M.t).attr("y2", height - M.b);
		focus.append("circle").attr("r", 3.5);
		const bis = d3.bisector(d => d.t).center;
		svg.append("rect").attr("x", M.l).attr("width", W - M.l - M.r).attr("height", height).attr("fill", "transparent").style("touch-action", "pan-y")
			.on("pointermove", ev => {
				const i = bis(pts, x.invert(d3.pointer(ev)[0])), p = pts[i];
				focus.style("display", null).attr("transform", `translate(${x(p.t)},0)`);
				focus.select("circle").attr("cy", y(p.v));
				const s = surges.find(s => s.date === p.date);
				Tip.show(`<b>${fmtDate(p.t)}</b><br>${full.format(p.v)} articles<br><span class="muted">7-day average ${full.format(Math.round(roll[i].v))}</span>${s ? `<br><span class="hot">Surge: ${s.ratio.toFixed(1)}× the previous 4 weeks</span>` : ""}`, ev.clientX, ev.clientY);
			})
			.on("pointerleave", () => { focus.style("display", "none"); Tip.hide(); });
	},

	/* Monthly bars; the selected month is highlighted and each bar can select its month. */
	months(el, months, value, { selected, onPick, rankOf, height = 120 } = {}) {
		el.innerHTML = "";
		const W = this.width(el), M = { t: 8, r: 4, b: 20, l: 36 };
		const x = d3.scaleBand(months, [M.l, W - M.r]).padding(0.18);
		const y = d3.scaleLinear([0, d3.max(months, value) || 1], [height - M.b, M.t]).nice();
		const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${height}`).attr("width", "100%").attr("role", "img").attr("aria-label", "Articles per month");
		svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(3)).join("line").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y).attr("y2", y);
		const every = Math.ceil(months.length / (W < 420 ? 4 : 8));
		svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - M.b})`)
			.call(d3.axisBottom(x).tickValues(months.filter((m, i) => (months.length - 1 - i) % every === 0)).tickFormat(m => fmtMonthShort(parseMonth(m))).tickSize(0))
			.call(g => g.select(".domain").remove());
		svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(compact.format).tickSize(0)).call(g => g.select(".domain").remove());
		svg.append("g").selectAll("rect").data(months).join("rect")
			.attr("class", m => "mbar" + (m === selected ? " is-sel" : "") + (m === Data.partialMonth ? " is-partial" : ""))
			.attr("x", m => x(m)).attr("width", x.bandwidth()).attr("y", m => y(value(m))).attr("height", m => y(0) - y(value(m))).attr("rx", 1.5)
			.style("cursor", onPick ? "pointer" : null)
			.on("pointerenter pointermove", (ev, m) => Tip.show(`<b>${monthLabel(m)}${m === Data.partialMonth ? " (to date)" : ""}</b><br>${full.format(value(m))} articles${rankOf?.(m) ? `<br><span class="muted">Rank ${rankOf(m)}</span>` : ""}`, ev.clientX, ev.clientY))
			.on("pointerleave", () => Tip.hide())
			.on("click", (ev, m) => onPick?.(m));
	},

	spark(el, days, n = 120) {
		const pts = days.slice(-n), W = 120, H = 28;
		const x = d3.scaleLinear([0, pts.length - 1], [1, W - 3]);
		const y = d3.scaleLinear([0, d3.max(pts, d => d.count) || 1], [H - 2, 2]);
		const roll = Analysis.rolling(pts);
		el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="spark" aria-hidden="true"><path class="spark-area" d="${d3.area().x((d, i) => x(i)).y0(H).y1(d => y(d.v))(roll)}"/><path class="spark-line" d="${d3.line().x((d, i) => x(i)).y(d => y(d.v))(roll)}"/><circle class="spark-end" cx="${x(roll.length - 1)}" cy="${y(roll.at(-1).v)}" r="2.5"/></svg>`;
	},

	bars(el, rows, { label, value, total, chip, after, onClick } = {}) {
		const max = d3.max(rows, value) || 1;
		el.innerHTML = `<ol class="bars">${rows.map((r, i) => `
			<li class="bar-row${onClick ? " is-link" : ""}" ${onClick ? `tabindex="0" role="button" data-i="${i}"` : ""}>
				<span class="bar-label">${label(r)}${chip ? chip(r) : ""}</span>
				<span class="bar-val">${after ? after(r) : ""}${compact.format(value(r))}${total ? `<small> ${pct(value(r) / total, value(r) / total < 0.1 ? 1 : 0)}</small>` : ""}</span>
				<span class="bar-track"><span class="bar-fill" style="width:${(value(r) / max * 100).toFixed(2)}%"></span></span>
			</li>`).join("")}</ol>`;
		if (onClick) el.querySelectorAll("[data-i]").forEach(li => {
			const go = () => onClick(rows[+li.dataset.i]);
			li.addEventListener("click", go);
			li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
		});
	},

	hours(el, hours) {
		const all = Array.from({ length: 24 }, (_, h) => hours.find(e => e.hour === h)?.count || 0);
		const tot = d3.sum(all) || 1, max = d3.max(all) || 1;
		el.innerHTML = `<div class="hourstrip" role="img" aria-label="Busiest hour ${String(all.indexOf(max)).padStart(2, "0")}:00">${all.map((c, h) => `<span class="hcell" style="--k:${(c / max).toFixed(3)}" data-h="${h}"></span>`).join("")}</div><div class="hourticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>`;
		el.querySelectorAll(".hcell").forEach(c => { const h = +c.dataset.h; tipOn(c, () => `${String(h).padStart(2, "0")}:00 · ${full.format(all[h])} articles (${pct(all[h] / tot, 1)})`); });
	},

	weekday(el, idx) {
		const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], max = d3.max(idx);
		el.innerHTML = `<div class="weekday">${idx.map((v, i) => `<div class="wd"><span class="wd-bar" style="height:${(v / max * 100).toFixed(1)}%"></span><span class="wd-v">${Math.round(v * 100)}</span><span class="wd-l">${names[i]}</span></div>`).join("")}</div>`;
	},

	/* 100% stacked bar per month, fixed colour per category. */
	mix(el, months, rowsByMonth, catColor) {
		const cats = [...new Set(rowsByMonth.flatMap(r => Object.keys(r)))]
			.sort((a, b) => d3.sum(rowsByMonth, r => r[b] || 0) - d3.sum(rowsByMonth, r => r[a] || 0));
		el.innerHTML = `<div class="mix">${months.map((m, i) => {
			const row = rowsByMonth[i], tot = d3.sum(Object.values(row)) || 1;
			return `<div class="mix-row"><span class="mix-m">${fmtMonthShort(parseMonth(m))}</span><span class="mix-bar">${cats.map(c => row[c] ? `<i style="width:${(row[c] / tot * 100).toFixed(2)}%;background:${catColor(c)}" data-t="${esc(c)}: ${pct(row[c] / tot, 1)}"></i>` : "").join("")}</span></div>`;
		}).join("")}</div><p class="mix-key">${cats.map(c => `<span><i style="background:${catColor(c)}"></i>${esc(c)}</span>`).join("")}</p>`;
		el.querySelectorAll(".mix-bar i").forEach(i => tipOn(i, () => esc(i.dataset.t)));
	},
};

/* ---------- globe ---------- */
const Map3D = {
	init(el, app) {
		this.app = app; this.el = el;
		const feats = topojson.feature(Data.topo, Data.topo.objects.countries).features.filter(f => f.id !== "010");
		for (const f of feats) { f.region = Data.byIso.get(f.id) || null; f.anchor = this.anchor(f); }
		this.feats = feats;
		const tot = Data.regions.filter(r => r.meta.iso).map(r => r.total);
		this.log = d3.scaleLog([Math.max(d3.min(tot), 1), d3.max(tot)], [0, 1]).clamp(true);
		this.pins = Data.regions.filter(r => r.meta.lat != null).map(r => ({ r, lat: r.meta.lat, lng: r.meta.lon }));
		this.state = { hover: null, selected: null };
		this.metric = { kind: "total" };
		this.drawn = new Promise(res => this.markDrawn = res);

		const g = this.g = Globe({ animateIn: !reduceMotion })(el)
			.backgroundColor("rgba(0,0,0,0)")
			.showGraticules(true)
			.polygonsData(feats)
			.onGlobeReady(() => this.whenDrawn())
			.polygonsTransitionDuration(reduceMotion ? 0 : 600)
			.polygonAltitude(f => this.alt(f))
			.polygonCapColor(f => this.cap(f))
			.polygonSideColor(f => this.side(f))
			// The outline stays constant: changing it at runtime makes globe.gl drop the cap.
			.polygonStrokeColor(() => this.colors.stroke)
			.polygonLabel(f => f.region ? this.label(f.region) : "")
			.onPolygonHover(f => { this.state.hover = f && f.region ? f : null; el.style.cursor = this.state.hover ? "pointer" : "grab"; this.refresh(); })
			.onPolygonClick(f => { if (f.region) app.select(f.region); })
			.htmlElementsData(this.pins)
			.htmlAltitude(0.02)
			.htmlElement(p => this.pin(p))
			.onZoom(pov => el.classList.toggle("labels-on", pov.altitude < 1.9));
		g.controls().minDistance = 140;
		g.controls().maxDistance = 520;
		g.pointOfView({ lat: 38, lng: 18, altitude: 2.25 }, 0);
		g.controls().autoRotateSpeed = 0.35;
		g.controls().autoRotate = !reduceMotion;
		el.addEventListener("pointerdown", () => this.stopRotate());
		this.theme();
		new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight)).observe(el);
	},
	// onGlobeReady fires for the bare sphere; the country meshes are built afterwards on the main
	// thread, so wait until they exist in the scene and one more frame has been painted.
	whenDrawn() {
		const has = () => { let n = 0; this.g.scene().traverse(o => { if (o.__globeObjType === "polygon") n++; }); return n > 0; };
		const tick = () => has() ? requestAnimationFrame(() => this.markDrawn()) : requestAnimationFrame(tick);
		tick();
	},
	theme() {
		this.colors = { sea: css("--globe-sea"), land: css("--globe-land"), stroke: css("--globe-stroke"), select: css("--globe-select"), atmo: css("--globe-atmo") };
		this.colors.dark = d3.hsl(this.colors.sea).l < 0.4;
		this.seq = d3.interpolateRgbBasis([css("--seq-0"), css("--seq-1"), css("--seq-2")]);
		this.div = d3.interpolateRgbBasis([css("--div-neg"), css("--div-mid"), css("--div-pos")]);
		this.g.globeMaterial().color.set(this.colors.sea);
		this.g.atmosphereColor(this.colors.atmo).atmosphereAltitude(0.16);
		this.refresh();
	},
	anchor(f) {
		let geom = f.geometry;
		if (geom.type === "MultiPolygon") geom = geom.coordinates.map(c => ({ type: "Polygon", coordinates: c })).sort((a, b) => d3.geoArea(b) - d3.geoArea(a))[0];
		const [lng, lat] = d3.geoCentroid(geom);
		return { lat, lng };
	},
	/* How a target is drawn under the current "Colour by" choice: t ∈ [0,1] sets height (and colour unless overridden). */
	style(r) {
		const m = this.metric;
		if (m.kind === "total") return { t: this.log(r.total) };
		const s = m.stats.get(r);
		if (!s) return null;
		if (m.kind === "rank") return { t: m.n > 1 ? 1 - (s.rank - 1) / (m.n - 1) : 1 };
		const t = m.log(s.v);
		if (m.kind === "articles") return { t };
		return { t, color: s.change == null ? this.colors.land : this.div((Math.max(-1, Math.min(1, s.change)) + 1) / 2) };
	},
	alt(f) {
		const s = f.region && this.style(f.region);
		if (!s) return 0.004;
		const base = 0.006 + s.t * 0.05;
		return f === this.state.selected ? base + 0.02 : f === this.state.hover ? base + 0.01 : base;
	},
	cap(f) {
		const s = f.region && this.style(f.region);
		if (!s) return this.colors.land;
		if (f === this.state.selected) return this.colors.select;
		return s.color || this.seq(s.t);
	},
	side(f) {
		const s = f.region && this.style(f.region);
		const c = d3.color(this.cap(f));
		return (s ? c.darker(this.colors.dark ? 0.9 : 0.7) : c).formatHex();
	},
	label(r) {
		const m = this.metric, s = m.stats?.get(r);
		const line = m.kind === "total"
			? `${full.format(r.total)} articles in total<br><span class="muted">Rank ${r.rank} of ${Data.regions.length} all time</span>`
			: s ? `${full.format(s.v)} articles in ${monthLabel(m.month)}<br><span class="muted">Rank ${s.rank} of ${m.n}${s.change != null ? ` · ${signed(s.change)} vs previous month` : ""}</span>`
				: `<span class="muted">No articles in ${monthLabel(m.month)}</span>`;
		return `<div class="globe-tip"><b>${esc(r.label)}</b><span>${line}</span></div>`;
	},
	pin(p) {
		const b = document.createElement("button");
		b.className = `pin pin-${p.r.type}${p.r.meta.side === "left" ? " pin-left" : ""}`;
		b.type = "button";
		b.innerHTML = `<i></i><span>${esc(p.r.label)}</span>`;
		b.setAttribute("aria-label", `${p.r.label}: ${full.format(p.r.total)} articles`);
		b.style.pointerEvents = "auto";
		b.addEventListener("click", () => this.app.select(p.r));
		p.el = b;
		return b;
	},
	refresh() {
		const g = this.g;
		g.polygonAltitude(g.polygonAltitude()).polygonCapColor(g.polygonCapColor()).polygonSideColor(g.polygonSideColor()).polygonLabel(g.polygonLabel());
		for (const p of this.pins) if (p.el) {
			p.el.classList.toggle("is-off", !this.style(p.r));
			p.el.classList.toggle("is-selected", this.app.current === p.r);
		}
	},
	setMetric(m) { this.metric = m; this.refresh(); },
	focus(r) {
		this.state.selected = r ? this.feats.find(f => f.region === r) || null : null;
		this.refresh();
		if (!r) return;
		const at = this.state.selected ? this.state.selected.anchor : r.meta.lat != null ? { lat: r.meta.lat, lng: r.meta.lon } : null;
		if (at) { this.stopRotate(); this.g.pointOfView({ ...at, altitude: 1.55 }, reduceMotion ? 0 : 1200); }
	},
	stopRotate() {
		const c = this.g.controls(); c.autoRotate = false;
		clearTimeout(this.resume);
		if (!reduceMotion) this.resume = setTimeout(() => { if (!this.app.current && !this.app.playing) c.autoRotate = true; }, 25000);
	},
};

/* ---------- application ---------- */
const App = {
	current: null,
	view: { kind: "total", month: null },

	async start(cfg) {
		this.cfg = cfg;
		document.body.dataset.state = "loading";
		Theme.init();
		Loader.render();
		await Data.init(cfg);
		const draw = Loader.add("Drawing the globe", 20);
		Map3D.init($("#globe"), this);
		Map3D.drawn.then(() => Loader.set(draw, { state: "done" }));
		this.kpis(); this.legend(); this.search(); this.ranking(); this.rhythm(); this.networkHistory();
		this.watchTheme();
		addEventListener("hashchange", () => this.route());
		this.route();
		Promise.all([Map3D.drawn, this.loadAll()]).then(() => { document.body.dataset.state = "ready"; });
		let t, lastW = document.body.clientWidth;
		new ResizeObserver(() => {
			const w = document.body.clientWidth;
			if (Math.abs(w - lastW) < 2) return;
			lastW = w; clearTimeout(t); t = setTimeout(() => this.redraw(), 200);
		}).observe(document.body);
	},

	// With summary.json nothing is fetched here (bar the odd target it lacks); without it, every target's files.
	async loadAll() {
		const list = Data.summary ? Data.missing : Data.regions, n = list.length;
		let done = 0, bytes = 0;
		if (n && !Data.summary) Loader.total += 100;
		const step = n ? Loader.add("Target files", Data.summary ? 0 : 100) : null;
		const show = () => Loader.set(step, { detail: `${done} of ${n} · ${kb(bytes)}`, frac: done / n });
		Data.onBytes = b => { bytes += b; show(); };
		for (;;) {
			if (!n) { Data.buildMonths(); break; }
			await Data.allRegions(d => { done = d; show(); }, list);
			if (!Data.failed.size) break;
			const choice = await Loader.fail(step, `${Data.failed.size} file${Data.failed.size > 1 ? "s" : ""} failed`, ["Retry", "Continue without them"]);
			if (choice !== "Retry") break;
			Data.resetFailed();
		}
		Data.onBytes = null;
		if (step) Loader.set(step, { state: "done" });
		this.allLoaded = true;
		document.body.dataset.deep = "ready";
		const def = Data.partialMonth ? Data.months.at(-2) : Data.months.at(-1);
		this.monthly(def);
		this.rising();
		if (this.current?.data) this.renderRegion(this.current, this.current.data);
	},

	/* ----- month control: colour the globe and the ranking by one month ----- */
	monthly(defaultMonth) {
		const el = $("#monthly"); if (!el) return;
		const months = Data.months;
		el.innerHTML = `
			<div class="mrow">
				<label for="m-metric">Colour by</label>
				<select id="m-metric">
					<option value="rank">Rank in the month</option>
					<option value="articles">Articles in the month</option>
					<option value="change">Change from previous month</option>
					<option value="total">All-time total</option>
				</select>
			</div>
			<div class="growth-ctl">
				<button type="button" class="play" id="m-play"></button>
				<input type="range" id="m-range" min="0" max="${months.length - 1}" value="${months.indexOf(defaultMonth)}" aria-label="Month">
			</div>
			<p class="growth-read"><b id="m-date"></b> <span id="m-sum"></span></p>
			<div class="growth-steps" id="m-steps" aria-hidden="true"></div>`;
		const totals = months.map(m => Data.monthStats.get(m).total), mx = d3.max(totals);
		$("#m-steps").innerHTML = totals.map((v, i) => `<span style="--h:${(v / mx).toFixed(3)}" data-i="${i}"></span>`).join("");
		$("#m-steps").querySelectorAll("span").forEach(s => tipOn(s, () => `${monthLabel(months[+s.dataset.i])}: ${full.format(totals[+s.dataset.i])} articles`));
		const sel = $("#m-metric"), range = $("#m-range"), play = $("#m-play");
		const apply = () => {
			const kind = sel.value, month = months[+range.value];
			this.setView(kind, month);
		};
		sel.addEventListener("change", apply);
		range.addEventListener("input", () => { stop(); apply(); });
		let timer = null;
		const icons = {
			play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`,
			pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>`,
		};
		const showPlay = on => {
			play.innerHTML = on ? icons.pause : icons.play;
			play.setAttribute("aria-label", on ? "Pause" : "Play month by month");
			play.setAttribute("aria-pressed", on);
		};
		const stop = () => { clearInterval(timer); timer = null; this.playing = false; showPlay(false); };
		// Plays once to the last month, holds it for one step, then rewinds to the first month and stops.
		play.addEventListener("click", () => {
			if (timer) return stop();
			if (sel.value === "total") sel.value = "rank";
			let i = +range.value >= months.length - 1 ? 0 : +range.value;
			this.playing = true; showPlay(true); Map3D.stopRotate();
			timer = setInterval(() => {
				if (i < months.length) { range.value = i++; apply(); return; }
				range.value = 0; apply(); stop();
			}, reduceMotion ? 150 : 650);
		});
		showPlay(false);
		this.monthControls = { sel, range };
		apply();
	},

	setView(kind, month) {
		this.view = { kind, month };
		const ms = Data.monthStats?.get(month);
		const tot = kind === "total";
		$("#m-range") && ($("#m-range").disabled = tot);
		if (tot || !ms) Map3D.setMetric({ kind: "total" });
		else {
			const vals = [...ms.stats.values()].map(s => s.v);
			Map3D.setMetric({ kind, month, stats: ms.stats, n: ms.n, log: d3.scaleLog([Math.max(1, d3.min(vals)), d3.max(vals)], [0, 1]).clamp(true) });
		}
		if ($("#m-date")) {
			$("#m-date").textContent = tot ? "All time" : monthLabel(month) + (month === Data.partialMonth ? ` (to ${fmtDate(parseDate(Data.lastDate))})` : "");
			const top = ms && [...ms.stats.entries()].find(([, s]) => s.rank === 1);
			$("#m-sum").textContent = tot ? `${full.format(Data.network.totalArticles)} articles` : ms ? `${full.format(ms.total)} articles · ${ms.n} targets active${top ? ` · most targeted: ${top[0].label}` : ""}` : "";
			$("#m-steps")?.querySelectorAll("span").forEach((s, i) => s.classList.toggle("is-past", !tot && i <= +$("#m-range").value));
		}
		this.legend(); this.ranking();
		if (this.current?.data) { const c = $("#r-months"); if (c) this.drawRegionMonths(this.current); }
	},

	pickMonth(m) {
		if (!this.monthControls) return;
		const { sel, range } = this.monthControls;
		if (sel.value === "total") sel.value = "rank";
		range.value = Data.months.indexOf(m);
		this.setView(sel.value, m);
	},

	/* ----- routing ----- */
	route() {
		const r = Data.bySlug.get(location.hash.slice(1)) || null;
		if (r !== this.current) this.show(r);
	},
	select(r) {
		if (r) { location.hash = r.slug; return; }
		history.replaceState(null, "", location.pathname + location.search);
		this.show(null);
	},
	async show(r) {
		this.current = r;
		document.body.dataset.view = r ? "region" : "overview";
		Map3D.focus(r);
		const host = $("#region");
		if (!r) { host.innerHTML = ""; host.hidden = true; return; }
		host.hidden = false;
		host.innerHTML = `<div class="region-loading">Loading ${esc(r.label)}…</div>`;
		const data = await Data.region(r);
		if (this.current !== r) return;
		this.renderRegion(r, data);
		$("#panel").scrollTop = 0;
		this.cfg.onRegion?.(r);
	},

	/* ----- target panel ----- */
	renderRegion(r, d) {
		const host = $("#region");
		const m = Analysis.momentum(d.articlesPerDay, Data.lastDate);
		const surges = Analysis.surges(d.articlesPerDay);
		const shareOf = test => d3.sum(d.topSources.filter(s => test(s.source)), s => s.count) / (d3.sum(d.topSources, s => s.count) || 1);
		const tgShare = shareOf(isTelegram), maxShare = shareOf(isMax);
		const missing = r.domains.filter(x => !d.files.includes(x));
		const parent = r.meta.parent ? Data.byIso.get(r.meta.parent) : null;
		const arrow = m.change == null ? "flat" : m.change > 0.05 ? "up" : m.change < -0.05 ? "down" : "flat";
		const hist = Data.history?.regions?.[r.name];
		host.innerHTML = `
		<header class="region-head">
			<button class="close" type="button" aria-label="Back to the network overview">← Network</button>
			<p class="eyebrow">${esc(TYPE_LABEL[r.type])}${parent ? ` · within <a href="#${parent.slug}">${esc(parent.label)}</a>` : ""}</p>
			<h2 class="region-name">${esc(r.label)}</h2>
			<p class="region-line">Rank <b>${r.rank}</b> of ${Data.regions.length} targets all time · ${pct(r.total / Data.network.totalArticles, 1)} of all network articles</p>
			<ul class="domains">${r.domains.map(x => `<li class="${d.files.includes(x) ? "" : "is-missing"}">${esc(x)}</li>`).join("")}</ul>
			${missing.length ? `<p class="note">${missing.length} domain${missing.length > 1 ? "s have" : " has"} no file in the CheckFirst feed.</p>` : ""}
		</header>
		<section class="sec kpis kpis-region">
			<div class="kpi"><span class="kpi-v">${compact.format(d.totalArticles)}</span><span class="kpi-l">Articles</span></div>
			<div class="kpi"><span class="kpi-v">${m.recent < 10 ? m.recent.toFixed(1) : compact.format(Math.round(m.recent))}<i class="trend trend-${arrow}">${m.change == null ? "" : signed(m.change)}</i></span><span class="kpi-l">Per day, last 30 days</span><span class="kpi-spark" id="r-spark"></span></div>
			<div class="kpi"><span class="kpi-v">${pct(d.alternates.share)}</span><span class="kpi-l">Cross-posted in other languages</span></div>
			<div class="kpi"><span class="kpi-v">${d.firstDay ? fmtMonth(parseDate(d.firstDay)) : "—"}</span><span class="kpi-l">First article in feed</span></div>
		</section>
		<section class="sec">
			<h3 class="sec-h">Latest articles</h3>
			<div id="r-latest"></div>
		</section>
		<section class="sec">
			<h3 class="sec-h">Month by month</h3>
			<p class="sec-sub">Articles per month and the target's rank among all targets. Select a bar to show that month on the globe.</p>
			<div id="r-months" class="chart"></div>
			<p class="note" id="r-rankline"></p>
		</section>
		<section class="sec">
			<h3 class="sec-h">Articles per day</h3>
			<p class="sec-sub">Daily count with 7-day average. Numbered dots mark surges above three standard deviations of the preceding four weeks.</p>
			<div id="r-timeline" class="chart"></div>
			${surges.length ? `<ol class="surge-list">${surges.map(s => `<li><b>${fmtDate(parseDate(s.date))}</b> ${full.format(s.count)} articles <span class="muted">${s.ratio.toFixed(1)}× usual</span></li>`).join("")}</ol>` : ""}
		</section>
		<section class="sec">
			<h3 class="sec-h">Who supplies the content</h3>
			<p class="sec-sub">Top sources since the target's first article. ${pct(tgShare)} of the top-source volume comes from Telegram channels${maxShare > 0 ? ` and ${pct(maxShare)} from MAX channels` : ""}.</p>
			<div id="r-sources"></div>
		</section>
		<section class="sec">
			<h3 class="sec-h">Source turnover</h3>
			${hist ? `<p class="sec-sub">Each month's five largest sources, from CheckFirst's month-end snapshots. <span class="chip chip-new">New</span> marks a source absent from the target's list a month earlier.</p><div id="r-turnover"></div>` : `<p class="sec-sub">Month-by-month sources need the history file, which hasn't been generated for this target yet.</p>`}
		</section>
		${hist ? `<section class="sec"><h3 class="sec-h">Category mix by month</h3><div id="r-mix"></div></section>` : ""}
		<div class="sec-pair">
			<section class="sec"><h3 class="sec-h">Categories, all time</h3><div id="r-cats"></div></section>
			<section class="sec"><h3 class="sec-h">Languages published</h3><div id="r-langs"></div></section>
		</div>
		<div class="sec-pair">
			<section class="sec"><h3 class="sec-h">Hour of publication</h3><p class="sec-sub">Share of articles by hour, as timestamped in the feed.</p><div id="r-hours"></div></section>
			<section class="sec"><h3 class="sec-h">Day of week</h3><p class="sec-sub">Last 52 weeks, indexed to 100 = average day.</p><div id="r-week"></div></section>
		</div>
		<section class="sec">
			<h3 class="sec-h">Closest twins <span class="tag">Experiment</span></h3>
			<p class="sec-sub">Targets fed by the most similar mix of sources (cosine similarity of source volumes).</p>
			<div id="r-twins"><p class="muted">Comparing with every other target…</p></div>
		</section>
		<footer class="sec cite">
			<button type="button" class="cite-btn" id="cite-btn">Copy citation for this view</button>
			<p class="cite-text" id="cite-text"></p>
		</footer>`;
		host.querySelector(".close").addEventListener("click", () => this.select(null));
		Charts.spark($("#r-spark"), d.articlesPerDay);
		this.latest(r, d);
		this.drawRegionMonths(r);
		Charts.timeline($("#r-timeline"), d.articlesPerDay, { surges });
		Charts.bars($("#r-sources"), d.topSources.slice(0, 12), {
			label: s => esc(sourceLabel(s.source)), value: s => s.count, total: d.totalArticles,
			chip: s => sourceChip(s.source) + (Data.infoDefense.has(s.source) ? `<span class="chip chip-id" title="Listed in the InfoDefense dataset">InfoDefense</span>` : ""),
		});
		if (hist) { this.turnover(hist); this.categoryMix(hist); }
		Charts.bars($("#r-cats"), d.categories, { label: c => esc(c.category), value: c => c.count, total: d.totalArticles });
		Charts.bars($("#r-langs"), d.languages.slice(0, 6), { label: l => esc(langName(l.language)), value: l => l.count, total: d.totalArticles });
		Charts.hours($("#r-hours"), d.publicationHours);
		Charts.weekday($("#r-week"), Analysis.weekday(d.articlesPerDay));
		$("#cite-text").textContent = this.citation(r);
		$("#cite-btn").addEventListener("click", () => this.copy($("#cite-text"), $("#cite-btn")));
		if (this.allLoaded) this.twins(r);
	},

	drawRegionMonths(r) {
		const el = $("#r-months"); if (!el || !r.data) return;
		const months = (Data.months || [...r.data.monthly.keys()].sort()).filter(m => m >= r.data.firstDay?.slice(0, 7)).slice(-30);
		const rankOf = m => Data.monthStats?.get(m)?.stats.get(r)?.rank;
		Charts.months(el, months, m => r.data.monthly.get(m) || 0, { selected: this.view.kind === "total" ? null : this.view.month, rankOf, onPick: m => this.pickMonth(m) });
		const line = $("#r-rankline");
		if (line && Data.monthStats) {
			const last = months.filter(m => m !== Data.partialMonth).slice(-12).map(m => ({ m, rank: rankOf(m) })).filter(x => x.rank);
			if (last.length) {
				const best = d3.least(last, x => x.rank), worst = d3.greatest(last, x => x.rank);
				line.textContent = `Over the last ${last.length} complete months its rank ranged from ${best.rank} (${monthLabel(best.m)}) to ${worst.rank} (${monthLabel(worst.m)}).`;
			}
		}
	},

	latest(r, d) {
		const el = $("#r-latest");
		const items = (Data.headlines?.domains ? r.domains.flatMap(x => (Data.headlines.domains[x] || []).map(a => ({ ...a, domain: x }))) : [])
			.sort((a, b) => (b.published || "").localeCompare(a.published || "")).slice(0, 8);
		const archive = u => `https://web.archive.org/web/${u}`;
		if (items.length) {
			el.innerHTML = `<ol class="latest">${items.map(a => `<li><a href="${esc(a.archive || archive(a.url))}" target="_blank" rel="noopener noreferrer nofollow">${esc(a.title)}</a><span class="muted">${esc(a.domain)}${a.published ? ` · ${fmtDate(new Date(a.published))}` : ""}</span></li>`).join("")}</ol>
				<p class="note">Collected ${fmtDate(new Date(Data.headlines.generated))} by a server-side job. Links open archived copies, so your visit never reaches the network's sites.</p>`;
		} else {
			el.innerHTML = `<p class="sec-sub">Headlines appear here once the nightly collection job has run. Until then, these open the most recent archived copy of each site, so your visit never reaches the network's servers.</p>
				<ul class="archive-links">${d.files.map(x => `<li><a href="${archive("https://" + x + "/")}" target="_blank" rel="noopener noreferrer nofollow">${esc(x)}</a><span class="muted">Wayback Machine</span></li>`).join("")}</ul>`;
		}
	},

	turnover(hist) {
		const el = $("#r-turnover"); if (!el) return;
		const months = Data.history.months;
		const dated = this.current?.data?.monthly;
		const rows = months.map((m, i) => ({ m, total: hist.total[i], sources: hist.sources[i], fresh: new Set(hist.newSources[i]), pub: dated?.get(m) || 0 }))
			.filter(x => x.total > 0).slice(-12).reverse();
		// Collected vs published that month: a large gap means CheckFirst was still loading older articles.
		for (const x of rows) x.backfill = x.pub ? Math.abs(x.total / x.pub - 1) > 0.2 : true;
		el.innerHTML = `<ol class="turnover">${rows.map(x => `
			<li><span class="to-m">${monthLabel(x.m)}${Data.history.partialLast && x.m === months.at(-1) ? " <small>to date</small>" : ""}<small>${compact.format(x.total)} collected</small>${x.backfill ? `<small class="warn" title="Collected ${full.format(x.total)} articles but only ${full.format(x.pub)} are dated to this month: the month includes older, back-loaded articles.">Includes older articles</small>` : ""}</span>
			<ol class="to-src">${x.sources.slice(0, 5).map(([s, c]) => `<li><span class="to-name">${esc(sourceLabel(s))}${isTelegram(s) ? `<span class="chip chip-tg">TG</span>` : isMax(s) ? `<span class="chip chip-max">MAX</span>` : ""}${x.fresh.has(s) ? `<span class="chip chip-new">New</span>` : ""}</span><span class="to-share">${pct(c / x.total)}</span></li>`).join("")}</ol></li>`).join("")}</ol>`;
	},

	categoryMix(hist) {
		const el = $("#r-mix"); if (!el) return;
		const months = Data.history.months;
		const idx = months.map((m, i) => i).filter(i => hist.total[i] > 0).slice(-12);
		// Every category in the history file, so a category keeps its colour whichever targets are loaded.
		const allCats = [...new Set(Object.values(Data.history.regions).flatMap(h => h.categories.flatMap(Object.keys)))].sort();
		const color = c => `var(--cat-${(allCats.indexOf(c) % 8) + 1})`;
		Charts.mix(el, idx.map(i => months[i]), idx.map(i => hist.categories[i]), color);
	},

	twins(r) {
		const el = $("#r-twins"); if (!el || !r.data) return;
		const v = Analysis.vector(r.data);
		const list = r.twins || Data.regions.filter(o => o !== r && o.data).map(o => ({ o, s: Analysis.cosine(v, Analysis.vector(o.data)) })).filter(t => t.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
		el.innerHTML = `<ol class="twins">${list.map(t => `<li><a href="#${t.o.slug}">${esc(t.o.label)}</a><span class="twin-bar"><span style="width:${(t.s * 100).toFixed(1)}%"></span></span><span class="twin-v">${(t.s * 100).toFixed(0)}</span></li>`).join("")}</ol>`;
	},

	citation(r) {
		const url = location.href.split("#")[0] + (r ? "#" + r.slug : "");
		return `Châtelet, V. Pravda Network Atlas — ${r ? r.label : "Network overview"}. ${url} (accessed ${new Date().toISOString().slice(0, 10)}). Data: CheckFirst, Pravda Network Data Collection, snapshot of ${Data.lastDate}, https://github.com/CheckFirstHQ/pravda-network.`;
	},
	async copy(textEl, btn) {
		try { await navigator.clipboard.writeText(textEl.textContent); btn.textContent = "Citation copied"; }
		catch { const s = getSelection(), rg = document.createRange(); rg.selectNodeContents(textEl); s.removeAllRanges(); s.addRange(rg); btn.textContent = "Selected — press Ctrl+C to copy"; }
		setTimeout(() => btn.textContent = "Copy citation for this view", 2500);
	},

	/* ----- overview ----- */
	kpis() {
		const n = Data.network, el = $("#kpis"); if (!el) return;
		el.innerHTML = `
			<div class="kpi"><span class="kpi-v">${compact.format(n.totalArticles)}</span><span class="kpi-l">Articles collected</span></div>
			<div class="kpi"><span class="kpi-v">${n.domainsCount}</span><span class="kpi-l">Active domains</span></div>
			<div class="kpi"><span class="kpi-v">${Data.regions.length}</span><span class="kpi-l">Targets</span></div>
			<div class="kpi"><span class="kpi-v">${n.languages.length}</span><span class="kpi-l">Languages</span></div>
			<div class="kpi"><span class="kpi-v">${pct(n.alternatesStats.percentWithAlternates / 100)}</span><span class="kpi-l">Cross-posted · ${n.alternatesStats.avgAlternatesPerArticle.toFixed(1)} copies avg</span></div>
			<div class="kpi"><span class="kpi-v">${fmtDate(parseDate(Data.lastDate))}</span><span class="kpi-l">Latest data</span></div>`;
	},

	legend() {
		const el = $("#legend"); if (!el) return;
		const m = Map3D.metric;
		const keys = `<p class="legend-keys"><span><i class="sw sw-none"></i>${m.kind === "total" ? "Not targeted" : "No articles that month"}</span><span><i class="sw sw-pin"></i>Sub-national or bloc</span></p>`;
		if (m.kind === "rank") {
			el.innerHTML = `<p class="legend-t">Rank in ${monthLabel(m.month)} <span class="muted">(1 = most articles)</span></p><div class="legend-bar is-rev"></div>
				<div class="legend-ticks"><span style="left:0%">${m.n}</span><span style="left:50%">${Math.round((m.n + 1) / 2)}</span><span style="left:100%">1</span></div>${keys}`;
		} else if (m.kind === "change") {
			el.innerHTML = `<p class="legend-t">Change from previous month <span class="muted">(height = articles)</span></p><div class="legend-bar is-div"></div>
				<div class="legend-ticks"><span style="left:0%">−100%</span><span style="left:50%">0</span><span style="left:100%">+100% or more</span></div>${keys}`;
		} else {
			const scale = m.kind === "articles" ? m.log : Map3D.log, [a, b] = scale.domain();
			const ticks = [10, 100, 1e3, 1e4, 1e5, 1e6].filter(t => t >= a && t <= b);
			el.innerHTML = `<p class="legend-t">${m.kind === "articles" ? `Articles in ${monthLabel(m.month)}` : "Articles, all time"} <span class="muted">(log scale)</span></p><div class="legend-bar"></div>
				<div class="legend-ticks">${ticks.map(t => `<span style="left:${(scale(t) * 100).toFixed(1)}%">${compact.format(t)}</span>`).join("")}</div>${keys}`;
		}
	},

	search() {
		const input = $("#search"), list = $("#search-list"); if (!input) return;
		let items = [], active = -1;
		const render = () => {
			list.innerHTML = items.map((r, i) => `<li role="option" id="opt-${i}" aria-selected="${i === active}" data-i="${i}"><span>${esc(r.label)}</span><small>${esc(TYPE_LABEL[r.type])} · ${compact.format(r.total)}</small></li>`).join("");
			list.hidden = !items.length;
			input.setAttribute("aria-expanded", String(!!items.length));
			if (active >= 0) input.setAttribute("aria-activedescendant", `opt-${active}`); else input.removeAttribute("aria-activedescendant");
		};
		const choose = r => { input.value = ""; items = []; active = -1; render(); input.blur(); this.select(r); };
		input.addEventListener("input", () => {
			const q = fold(input.value.trim());
			items = q ? Data.regions.filter(r => fold(r.label).includes(q) || fold(r.name).includes(q) || r.domains.some(d => d.includes(q)))
				.sort((a, b) => (fold(b.label).startsWith(q) - fold(a.label).startsWith(q)) || b.total - a.total).slice(0, 8) : [];
			active = items.length ? 0 : -1; render();
		});
		input.addEventListener("keydown", e => {
			if (e.key === "ArrowDown") { active = Math.min(active + 1, items.length - 1); render(); e.preventDefault(); }
			else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
			else if (e.key === "Enter" && items[active]) { choose(items[active]); e.preventDefault(); }
			else if (e.key === "Escape") { items = []; render(); }
		});
		list.addEventListener("pointerdown", e => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); choose(items[+li.dataset.i]); } });
		input.addEventListener("blur", () => setTimeout(() => { items = []; render(); }, 120));
	},

	/* Ranking follows the globe: the selected month, or all time. */
	ranking() {
		const el = $("#ranking"); if (!el) return;
		if (!el.dataset.built) {
			const types = ["all", ...new Set(Data.regions.map(r => r.type))];
			el.innerHTML = `<div class="filters" role="group" aria-label="Filter targets">${types.map(t => `<button type="button" class="filter" data-t="${t}" aria-pressed="${t === "all"}">${t === "all" ? "All" : esc(TYPE_LABEL[t])}</button>`).join("")}</div><div id="ranking-list" class="ranking-list"></div>`;
			el.querySelectorAll(".filter").forEach(b => b.addEventListener("click", () => {
				this.rankFilter = b.dataset.t; el.querySelectorAll(".filter").forEach(x => x.setAttribute("aria-pressed", String(x === b))); this.ranking();
			}));
			el.dataset.built = "1";
		}
		const f = this.rankFilter || "all", { kind, month } = this.view;
		const head = $("#ranking-title");
		const ms = kind !== "total" && Data.monthStats?.get(month);
		if (head) head.textContent = ms ? `Targets ranked, ${monthLabel(month)}` : "Targets ranked, all time";
		const rows = ms
			? [...ms.stats.entries()].map(([r, s]) => ({ r, ...s })).sort((a, b) => a.rank - b.rank)
			: Data.regions.map(r => ({ r, v: r.total, rank: r.rank, rankDelta: null }));
		Charts.bars($("#ranking-list"), rows.filter(x => f === "all" || x.r.type === f), {
			label: x => `<span class="rank">${x.rank}</span>${esc(x.r.label)}`, value: x => x.v,
			chip: x => x.r.type !== "country" ? `<span class="chip chip-type">${esc(TYPE_LABEL[x.r.type])}</span>` : "",
			after: x => x.rankDelta ? `<span class="mv mv-${x.rankDelta > 0 ? "up" : "down"}" title="${x.rankDelta > 0 ? "Up" : "Down"} ${Math.abs(x.rankDelta)} from previous month">${x.rankDelta > 0 ? "▲" : "▼"}${Math.abs(x.rankDelta)}</span>` : "",
			onClick: x => this.select(x.r),
		});
	},

	rhythm() {
		const el = $("#rhythm"); if (el) Charts.weekday(el, Analysis.weekday(Data.network.articlesPerDay));
		const h = $("#net-hours"); if (h) Charts.hours(h, Data.network.publicationHours);
		const t = $("#net-timeline"); if (t) Charts.timeline(t, Data.network.articlesPerDay, { surges: Analysis.surges(Data.network.articlesPerDay), height: 150 });
	},

	/* Domains joining or leaving the network, from the month-end snapshots. */
	networkHistory() {
		const el = $("#net-history"), H = Data.history; if (!el) return;
		if (!H) { el.closest(".sec").hidden = true; return; }
		const rows = H.months.map((m, i) => ({ m, n: H.network.domains[i], add: H.network.added[i], rem: H.network.removed[i] })).filter(x => x.add.length || x.rem.length).reverse();
		const first = H.months[0], last = H.months.at(-1);
		el.innerHTML = `<p class="sec-sub">${H.network.domains[0]} domains at the end of ${monthLabel(first)}, ${H.network.domains.at(-1)} in ${monthLabel(last)}.</p>
			${rows.length ? `<ol class="dom-changes">${rows.map(x => `<li><span class="to-m">${monthLabel(x.m)}</span><span>${x.add.map(d => `<span class="chip chip-add">+ ${esc(d)}</span>`).join("")}${x.rem.map(d => `<span class="chip chip-rem">− ${esc(d)}</span>`).join("")}</span></li>`).join("")}</ol>` : `<p class="muted">No domains joined or left in this period.</p>`}`;
	},

	rising() {
		const el = $("#rising"); if (!el) return;
		const rows = Data.regions.filter(r => r.recent).map(r => ({ r, ...Analysis.momentum(r.recent, Data.recentEnd || Data.lastDate) })).filter(x => x.before >= 5 && x.change != null);
		const up = rows.slice().sort((a, b) => b.change - a.change).slice(0, 5), down = rows.slice().sort((a, b) => a.change - b.change).slice(0, 5);
		const li = x => `<li><a href="#${x.r.slug}">${esc(x.r.label)}</a><span class="mo-spark" data-s="${x.r.slug}"></span><span class="trend trend-${x.change > 0 ? "up" : "down"}">${signed(x.change)}</span></li>`;
		el.innerHTML = `<div class="mo"><div><h4>Accelerating</h4><ol>${up.map(li).join("")}</ol></div><div><h4>Slowing</h4><ol>${down.map(li).join("")}</ol></div></div>`;
		el.querySelectorAll(".mo-spark").forEach(s => Charts.spark(s, Data.bySlug.get(s.dataset.s).recent, 150));
	},

	redraw() {
		this.rhythm();
		if (this.current?.data) {
			const t = $("#r-timeline"); if (t) Charts.timeline(t, this.current.data.articlesPerDay, { surges: Analysis.surges(this.current.data.articlesPerDay) });
			this.drawRegionMonths(this.current);
		}
	},

	watchTheme() {
		const re = () => { Map3D.theme(); this.legend(); };
		matchMedia("(prefers-color-scheme: dark)").addEventListener("change", re);
		new MutationObserver(re).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
	},
};

window.PravdaAtlas = { start: cfg => App.start(cfg), Data, globe: () => Map3D.g };
})();
