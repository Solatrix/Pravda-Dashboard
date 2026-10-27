// OpenFreeMap's positron style (no API key), split in two so the labels stay above the choropleth.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"

export async function addBasemap(map, attribution) {
	map.createPane("labels")
	map.getPane("labels").style.zIndex = 99999
	map.getPane("labels").style.pointerEvents = "none"
	try {
		const style = await (await fetch(STYLE_URL)).json()
		const isLabel = layer => layer.type === "symbol"
		L.maplibreGL({
			style: { ...style, layers: style.layers.filter(l => !isLabel(l)) },
			attribution: `© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, ${attribution}`,
		}).addTo(map)
		L.maplibreGL({
			style: { ...style, layers: style.layers.filter(isLabel) },
			pane: "labels",
		}).addTo(map)
	} catch (e) {
		// The choropleth still works without a basemap.
		console.warn("Basemap unavailable", e)
		map.attributionControl.addAttribution(attribution)
	}
}
