import { complementaryScale, colorScale, defaultLayout } from "./constants.js";

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

	Plotly.newPlot(target, [trace], layout, { responsive: true });
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

	Plotly.newPlot(target, [trace], layout, { responsive: true });
}

export const renderTopSourcesChart =  async (remoteData, target) => {
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

	Plotly.newPlot(target, [trace], layout, { responsive: true });
}

export const renderCategories = async (remoteData, target) => {
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
		textinfo:"percent",
		hole: .6,
		showlegend:true,
		name: "Articles per category",
		textposition:"inside"

	};

	const layout = {
		colorway: complementaryScale,
		...defaultLayout
	};

	Plotly.newPlot(target, [trace], layout, { responsive: true });
}