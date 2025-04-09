export const colorScale = ["#3CCE9D", "#32AC83", "#3ED6A4", "#288A69", "#1E684F", "#144535"];
export const complementaryScale = ["#A74D8F", "#2B9677", "#3ED6A4", "#815162", "#446F76", "#332B3E"];
export const nonGeographicEntries = ["Trump", "Macron", "Scholz", "All"];

export const defaultLayout = {
	font: {
		family: 'Instrument Sans',
		size: 12,
		color: 'black'
	},
	paper_bgcolor: "transparent",
	plot_bgcolor: "transparent"
};
export const random = (min, max) => { return Math.floor(Math.random() * (max - min)) + min; };

export const localeNb = new Intl.NumberFormat('en-GB', {
	notation: "compact",
	compactDisplay: "short",
	roundingMode: "ceil",
	maximumFractionDigits: 1
});

export const popupHTML = ` 
	<div class="overlay-popup">
	<div class="close-button">x</div>
	<div class="header">
		<h3>{{feature}}</h3>
		<div class="domain">
			{{domain}}
		</div>
	</div>
	<div class="container graph-container-small" data-feature-name="{{feature}}">

		<div class="header">Most frequent sources</div>
		<div id="top-sources-chart"></div>

		<div class="header">
			Posting frequency over time
		</div>
		<div id="frequency-chart">
		</div>
	
		<div class="header">Publications per hour</div>
		<div id="hourly-chart"></div>

		<div class="header">Categories</div>
		<div id="category-chart"></div>
	</div>
		<div class="loader_container">
			<div class="merge"></div>
		</div>
`