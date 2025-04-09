import { nonGeographicEntries, localeNb } from "./constants.js";
import { URLRouter } from "./urlrouter.class.js" 
import { renderPostingFrequencyChart, renderTopSourcesChart, renderCategories, renderHourlyGraph, renderSourcesByDay } from "./graphCollection.js"
(async (d3js) => {
	const d3 = d3js

	async function loadData() {
		return {
			perDomain : await (await fetch("https://raw.githubusercontent.com/CheckFirstHQ/pravda-network/refs/heads/main/json/all.news-pravda.com_viz.json")).json()
		}
	}
	async function loadCountry(domain) {
		return {
			country: await (await fetch(`https://raw.githubusercontent.com/CheckFirstHQ/pravda-network/refs/heads/main/json/${domain}_viz.json`)).json(),
		}
	}

	async function domainToCountry(remoteData){
		let data = await remoteData
		const perDomain = data.articlesPerDomain;
		const countryToDomainMap = await (await fetch("./res/pravda-all-domains.json")).json()
		const regions = Object.keys(countryToDomainMap.Regions)
		let r = []
		for(let region of regions){
			r[region] = {
				totalArticles : 0
			}
			
			for(let entry of perDomain){
				if(countryToDomainMap.Regions[region].includes(entry.domain)){
					r[region].totalArticles += entry.totalArticles
				}
			}
		}
		return { world:r, countryToDomainMap };
	}

	async function renderMap(remoteData, defaultFeature) {
		let data = await remoteData
		for(let entry in nonGeographicEntries){
			delete data[nonGeographicEntries[entry]]
		}
		const keys = Object.keys(data)	
		const values = Object.values(data).map(e => e.totalArticles)
		const myColor =  d3.scaleQuantile()
		.domain([d3.min(values), d3.max(values)])
		.range(d3.schemeRdPu[6]);

		const map = L.map("dashboard-map", {
			center: [46.71109, 1.7191036],
			zoom: 3,
			scrollWheelZoom: false
		})

		// map.dragging.disable();
		map.attributionControl.setPosition('bottomleft');
		map.createPane("labels")
		map.getPane("labels").style.zIndex = 99999;

		L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
			attribution: "©OpenStreetMap, ©CartoDB",
		}).addTo(map);
		L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
			{
				pane:"labels"
			}
		).addTo(map);
		fetch("./res/countries-min.geojson")
			.then((response) => response.json())
			.then((geojsonData) => {
				const geoJSONObj = L.geoJSON(geojsonData,
					{
						onEachFeature: showData,
						style: function (entity) {
							if (keys.includes(entity.properties.ADMIN)) {
								return {
									fillColor: myColor(data[entity.properties.ADMIN].totalArticles),
									weight: 1.7,
									fillOpacity: 0.80,
									opacity:1,
									color:"rgba(0,0,0,.05)"
								}
							} else {
								return {
									color: "#GGG"
								}
							}
						},

					}).addTo(map);
				let zoomTo = geojsonData.features.filter(entity => entity.properties.ADMIN === defaultFeature)
				if(zoomTo){
					map.fitBounds(L.geoJSON(zoomTo).getBounds())
				}
			});


		function showData(feature, layer) {
			const hilightData = (e) => {
				if(!data[feature.properties.ADMIN]) return
				const tooltip = document.querySelector('.tooltip');
				tooltip.classList.remove("hidden")
				tooltip.style.left = e.originalEvent.pageX + 'px';
				tooltip.style.top = e.originalEvent.pageY + 'px';
				tooltip.innerHTML = `\
					${feature.properties.ADMIN}<br> \
					${data[feature.properties.ADMIN] ? localeNb.format(data[feature.properties.ADMIN].totalArticles) : "N/A"}\
				`
			}
			
			const disableTooltip = (e) => document.querySelector(".tooltip").classList.add("hidden")
			layer.on({
				mouseover: hilightData,
				mouseout: disableTooltip
			})
		}
	}

	async function renderArticleFigures(remoteData) {
		const data = await remoteData;
		const allArticles = document.querySelector(".totalArticles h3");
		allArticles.dataset.value = localeNb.format(data.totalArticles);
		const alternateArticles = document.querySelector(".totalAlternate h3")
		alternateArticles.dataset.value = localeNb.format(data.alternatesStats.articlesWithAlternates);
	}

	async function renderLeaderBoard(perDomain) {
		const tableData = await fetch("./res/leaderBoard.template.html")
		const leaderBoardData = await perDomain
		const uiTable = document.createElement("div")
		uiTable.classList.add("leader-board-chart")
		uiTable.innerHTML = await tableData.text()
		const sortable = Object.entries(leaderBoardData).sort(([, a], [, b]) => a.totalArticles > b.totalArticles ? -1 : 0).slice(0, 9)
		const uiContainer = uiTable.querySelector("table")
		for (let record in sortable) {
			const tr = document.createElement("tr")
			const tdCountry = document.createElement("td")
			tdCountry.innerHTML = sortable[record][0]
			const tdValue = document.createElement("td")
			tdValue.innerHTML = localeNb.format(sortable[record][1].totalArticles)
			tr.appendChild(tdCountry)
			tr.appendChild(tdValue)
			uiContainer.appendChild(tr)
		}
		document.querySelector(".leaderBoard").innerHTML = uiTable.outerHTML
	}

	

	async function initDashboard() {
		const { perDomain } = await loadData()
		const { world, countryToDomainMap } = await domainToCountry(perDomain)
		const router = new URLRouter(countryToDomainMap)
		const { country } = await loadCountry(router.domain)
		
		document.querySelector("h2#countryName").innerHTML = router.region;
		document.querySelector("#domainName").innerHTML = router.domain;
		renderArticleFigures(country);
		renderPostingFrequencyChart(country, "posting-frequency-chart");
		renderTopSourcesChart(country, "top-influencers-chart");
		renderCategories(country, "categories-chart");
		renderHourlyGraph(country, "hourly-chart");
		renderSourcesByDay(country, "sources-frequency-chart");
		renderMap(world, router.region);
		renderLeaderBoard(world);
	}

	initDashboard();
})(window.d3)
