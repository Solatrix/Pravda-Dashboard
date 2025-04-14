import { complementaryScale, colorScale, defaultLayout, random } from "./constants.js";

export const renderHourlyGraph = async (remoteData, target) => {
	const data = await remoteData;
	const sources = data.publicationHours.map(e => e.hour)
	const counts = data.publicationHours.map(e => e.count)
	const trace = {
		x: sources,
		y: counts,
		type: "bar",
		automargin: true,
		name: "Articles",
		marker: {
			color: complementaryScale[2],
			opacity: .7,
			line: {
				color: "#fff",
				width: 1.5
			}
		},
	};

	const layout = {
		xaxis: { title: "Sources" },
		yaxis: { title: "Articles" },
		colorway: colorScale,
		...defaultLayout

	};

	Plotly.newPlot(target, [trace], layout, { responsive: true, displayModeBar: false });
}

export const renderPostingFrequencyChart = async (remoteData, target) => {
	let data = await remoteData
	const dates = data.articlesPerDay.map((entry) => entry.date);
	const counts = data.articlesPerDay.map((entry) => entry.count);

	const trace = {
		x: dates,
		y: counts,
		type: "scatter",
		autosize: false,
		mode: "lines",
		automargin: true,
		name: "Posts",
		line: {
			color: complementaryScale[2],
			width: 1.2,
		},

	};

	const layout = {
		xaxis: { title: "Date" },
		yaxis: { title: "Posts" },
		...defaultLayout

	};

	Plotly.newPlot(target, [trace], layout, { responsive: true, displayModeBar: false });
}

export const renderTopSourcesChart = async (remoteData, target) => {
	let data = await remoteData
	const sources = data.topSources
		.map((entry) => entry.source.replace("Telegram:", "Telegram: <br>"))
		.slice(0, 9);

	const counts = data.topSources.map((entry) => entry.count).slice(0, 9);

	const trace = {
		x: sources,
		y: counts,
		type: "bar",
		automargin: true,
		name: "Articles",
		marker: {
			color: complementaryScale[2],
			opacity: .7,
			line: {
				color: "rgba(255,255,255,.8)",
				width: 3
			}
		},
	};

	const layout = {
		xaxis: {
			title: "Sources",
			tickangle: -45
		},
		yaxis: { title: "Articles" },
		colorway: colorScale,
		font: {
			family: 'Instrument Sans',
			size: 10,
			color: 'black'
		},
		paper_bgcolor: "transparent",
		plot_bgcolor: "transparent"

	};

	Plotly.newPlot(target, [trace], layout, { responsive: true, displayModeBar: false });
}

export const renderCategories = async (remoteData, target, legendOpt = {}) => {
	let data = await remoteData
	const sources = data.categories.map((entry) => entry.category);
	const counts = data.categories.map((entry) => entry.count);
	let total = 0
	counts.forEach(e => total += e)
	const trace = {
		labels: sources,
		values: counts,
		automargin: true,
		type: "pie",
		textinfo: "percent",
		hole: .6,
		showlegend: true,
		name: "Articles per category",
		textposition: "inside"

	};

	const layout = {
		colorway: complementaryScale,
		...legendOpt,
		...defaultLayout
	};

	Plotly.newPlot(target, [trace], layout, { responsive: true, displayModeBar: false });
}

export const renderSourcesByDay = async (remoteData, target) => {
	const data = await remoteData.sourcesByDay;
	const traceData = [];

	let sources = Object.keys(data[0]).filter(key => key !== 'date');

	sources.forEach(source => {
		const color = complementaryScale[random(0, 4)]
		const trace = {
			x: data.map(item => item.date),
			y: data.map(item => item[source]),
			type: 'scatter',
			line: {
				color: color,
				width: 1.2,
			},
			hovertemplate: `${source}<br>%{y} articles<br>%{x}<extra></extra>`,
			name: source
		};
		traceData.push(trace);
	});

	const layout = {
		xaxis: {
			type: 'category',
			tickangle: -45,
		},
		yaxis: {
			title: 'Articles'
		},
		hovermode: "closest",
		legend: {
			x: 1,
			y: 1
		},
		...defaultLayout
	};
	Plotly.newPlot(target, traceData, layout, {
		responsive: true,
		displayModeBar: false
	});
}

export const renderCirclePack = async (data, target) => {
	const remoteData = await data
	const dataset = remoteData.topSources.slice(0, 10)

	const values = dataset.map(e => e.count)
	const x = d3.scaleSqrt().range([15, 80]).domain([d3.min(values), d3.max(values)]).clamp(true)

	let circles = dataset.map(
		e => {
			return {
				r: x(e.count),
				text: e.source.replace("Telegram:", "Telegram: \n")
			}
		}
	)
	circles = circles.sort((a, b) => b.r - a.r);
	const padding = 5

	const layout = d3.packSiblings(circles)
	const container = d3.select(target);

	const nodes = container
		.selectAll("g.node")
		.data(layout)
		.enter()
		.append("g")
		.attr("class", (d) => { return `circle-entity node ${d.text.includes("Telegram") ? "tg-node" : "ru-node"}`});

	nodes.append("circle")
		.attr("class", "circle")
		.attr("cx", d => d.x)
		.attr("cy", d => d.y)
		.attr("r", d => d.r - padding)

	const labelOffset = 10;
	const lineHeight = 14;
	nodes.each(function (d) {
		const group = d3.select(this);
		const radius = d.r - padding;
		const maxWidth = radius * 1.6;
		const words = d.text.replace("Telegram: \n", "").split(/\s+/);
		const lines = [];
		let line = [];

		const tempText = group.append("text")
			.style("font-size", "12px")
			.style("visibility", "hidden")
			.style("pointer-events", "none");

		words.forEach(word => {
			line.push(word);
			tempText.text(line.join(" "));
			if (tempText.node().getComputedTextLength() > maxWidth) {
				line.pop();
				lines.push(line.join(" "));
				line = [word];
			}
		});
		if (line.length) lines.push(line.join(" "));
		tempText.remove();

		const lineHeight = 14;
		const totalHeight = lines.length * lineHeight;
		const textTooTall = totalHeight / 2 > (radius+10);

		const yOffset = textTooTall ? (radius*2) + 5 : -totalHeight / 2 + lineHeight / 2;
		const textGroup = group.append("text")
			.attr("x", d.x)
			.attr("y", d.y - yOffset)
			.style("text-anchor", "middle")
			.style("font-size", "12px")
			.style("fill", "black")

		lines.forEach((lineText, i) => {
			textGroup.append("tspan")
				.text(lineText)
				.attr("x", d.x)
				.attr("dy", i === 0 ? 0 : lineHeight);
		});
	});
}

export const renderScatterChart =  async (target, remoteData) => {
	const data = await remoteData;
		delete data["all.news-pravda.com"];
	const domains = Object.keys(data);
	const dates = Object.values(data);

	const dateObjects = dates.map(date => new Date(date));
	
	const trace = {
		x: dateObjects,
		y: domains,
		mode: 'markers',
		type: 'scatter',
		marker: {
			size: 12,
			color: colorScale[3],
			opacity: 0.6
		},
		text: domains,
		hoverinfo: 'text'
	};

	const layout = {
		title: 'Pravda Websites First Recorded Activity',
		xaxis: {
			title: 'Date',
			type: 'date',
		},
		yaxis: {
			title: 'Domain',
			visible: true,
			showticklabels: false 
		},
		showlegend: false,
		hovermode: 'closest',
		...defaultLayout
	};

	Plotly.newPlot(target, [trace], layout, {
		responsive: true,
		displayModeBar: false
	});
}