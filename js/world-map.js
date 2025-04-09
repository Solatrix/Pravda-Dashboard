import { nonGeographicEntries, localeNb } from "./constants.js";
import { modalBox } from "./modalBox.js";

(async (d3, L) => {
	async function loadData() {
		return {
			country: await (await fetch("https://raw.githubusercontent.com/CheckFirstHQ/pravda-network/refs/heads/main/json/francais.news-pravda.com_viz.json")).json(),
			perDomain: await (await fetch("https://raw.githubusercontent.com/CheckFirstHQ/pravda-network/refs/heads/main/json/all.news-pravda.com_viz.json")).json()
		}
	}
	async function renderMap(remoteData, domains) {
		let data = await remoteData
		for (let entry in nonGeographicEntries) {
			delete data[nonGeographicEntries[entry]]
		}
		const keys = Object.keys(data)
		const values = Object.values(data).map(e => e.totalArticles)
		const myColor = d3.scaleQuantile()
			.domain([d3.min(values), d3.max(values)])
			.range(d3.schemePuBuGn[6]);

		const map = L.map("background-map", {
			center: [46.71109, 1.7191036],
			zoom: 3,
			scrollWheelZoom: false
		})

		map.dragging.enable();
		map.attributionControl.setPosition('bottomleft');
		map.createPane("labels")
		map.getPane("labels").style.zIndex = 99999;

		function showData(feature, layer) {

			const hilightData = (e) => {
				if (!data[feature.properties.ADMIN]) return
				const tooltip = document.querySelector('.tooltip');
				tooltip.classList.remove("hidden")
				tooltip.style.left = e.originalEvent.pageX + 'px';
				tooltip.style.top = e.originalEvent.pageY + 'px';
				tooltip.innerHTML = `
					${feature.properties.ADMIN}<br>
					${data[feature.properties.ADMIN] ? "Articles: "+localeNb.format(data[feature.properties.ADMIN].totalArticles) : "N/A"}
				`
			}
			const disableTooltip = (e) => document.querySelector(".tooltip").classList.add("hidden")

			const highlightFeature = (e) => {
				if (!data[feature.properties.ADMIN]) return
				map.setView(e.latlng, 6)
				map.fitBounds(e.target._bounds)
				modalBox(feature.properties.ADMIN, domains, data)
			}
			layer.on({
				mouseover: hilightData,
				mouseout: disableTooltip,
				click: highlightFeature
			})

		}

		L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
			attribution: "©OpenStreetMap, ©CartoDB, CheckFirst & DFRLab",
		}).addTo(map);
		L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
			{
				pane: "labels"
			}
		).addTo(map);
		const geojson = await fetch("res/countries-min.geojson")
			.then(async (response) => { 
				let r = await response.json()
				L.geoJSON(r,
					{
						onEachFeature: showData,
						style: function (entity) {
							if (keys.includes(entity.properties.ADMIN)) {
								return {
									fillColor: myColor(data[entity.properties.ADMIN].totalArticles),
									weight: 1.7,
									fillOpacity: 0.80,
									opacity: 1,
									color: "rgba(0,0,0,.05)"
								}
							} else {
								return {
									color: "#GGG"
								}
							}
						},
	
					}).addTo(map);
					return r
			})
		return { map, geojson }
	}

	async function domainToCountry(remoteData) {
		let data = await remoteData
		const perDomain = data.articlesPerDomain;
		const countryToDomainMap = await (await fetch("res/pravda-all-domains.json")).json()
		const regions = Object.keys(countryToDomainMap.Regions)
		let r = []
		for (let region of regions) {
			r[region] = {
				totalArticles: 0
			}

			for (let entry of perDomain) {
				if (countryToDomainMap.Regions[region].includes(entry.domain)) {
					r[region].totalArticles += entry.totalArticles
				}
			}
		}
		return {world: r, domains: countryToDomainMap};
	}

	function triggerListeners({ searchInput, map, geojson, world, domains }) {
		const input = searchInput;
		const worldKeys = Object.keys(world)
		let results = []

		const updateResults = (e) => {
			if (input.value.length > 2) {
				results = worldKeys.filter(entry => entry.toLowerCase().includes(input.value.toLowerCase())).slice(0, 5)
			}
			if (input.value.length === 0) results = []
			updateResultsUI(results)
		}

		const updateResultsUI = (data) => {
			if (
				data.length === 0 &&
				!document.querySelector(".search-bar-results")
			) return
			else if (data.length === 0 &&
				!document.querySelector(".search-bar-results").classList.contains("hidden")
			) {
				document.querySelector(".search-bar-results").classList.add("hidden")
				return
			}

			if (!document.querySelector(".search-bar-results") && data.length > 0) {
				const parentElement = document.querySelector(".search-bar")
				const div = document.createElement("div")
				div.classList.add("search-bar-results");
				div.classList.add("hidden")
				parentElement.appendChild(div)
			}
			const dropdownList = document.querySelector(".search-bar-results");
			dropdownList.innerHTML = ""
			if(data.length > 0){
				for (let entry of data) {
					let item = document.createElement("div")
					item.classList.add("search-bar-result-item")
					item.dataset['featureName'] = entry
					item.innerHTML = entry
					dropdownList.appendChild(item)
					item.addEventListener("click", zoomToFeature)
				}
				dropdownList.classList.remove("hidden")
			}
		}

		const zoomToFeature = (e) => {
			const feature = e.target.dataset.featureName
			const polygon = geojson.features.filter((entry) => entry.properties.ADMIN === feature)[0]
			if(polygon){
				console.log("zooming")
				map.fitBounds(L.geoJSON(polygon).getBounds())
			}
			modalBox(feature, domains, world)
				updateResultsUI([])
				input.value = ""
		}

		input.addEventListener("keyup", updateResults);
	}

	async function initialize() {
		const { country, perDomain } = await loadData()
		const { world, domains } = await domainToCountry(perDomain)
		const searchInput = document.querySelector("input#search-input")
		const {map, geojson} = await renderMap(world, domains);
		triggerListeners({
			searchInput, map, geojson, world, domains
		});
		document.querySelector(".loader_container").classList.add("hidden")
	}

	initialize()
})(d3, L)