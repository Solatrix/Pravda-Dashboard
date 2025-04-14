import { renderHourlyGraph, renderPostingFrequencyChart, renderTopSourcesChart, renderCategories, renderCirclePack } from "./graphCollection.js";
import { localeNb, } from "./constants.js";
export const modalBox = async (feature, domains, world) => {
    const loadRemoteData = async (domain) =>
    {
        return (await (await fetch(`https://raw.githubusercontent.com/CheckFirstHQ/pravda-network/refs/heads/main/json/${domain}_viz.json`)).json())
    }
    
    const loadTemplate = async() => {
        return (await (await fetch('./res/html/modalBox.template.html')).text())
    }

    const loadFactSheet = async() => {
        return (await(await fetch("./res/html/factSheet.template.html")).text())
    }

    const parseFactSheet = async (factSheet, remoteData) => {
        const data = await remoteData
        const orderByArticles = Object.entries(world).sort(([, a], [, b]) => a.totalArticles > b.totalArticles ? -1 : 0)
        const orderByCountries = orderByArticles.map(e => e[0])
        const topInfluencers = {
            Telegram: data.topSourceNames
                    .filter(e => e.includes("Telegram")),
            Websites: data.topSourceNames
                    .filter(e => !e.includes("Telegram"))
        }
        const datasheet = {
            rank : orderByCountries.indexOf(feature)+1,
            figure: localeNb.format(world[feature].totalArticles),
            feature: feature,
            "domain-list" : domains.Regions[feature].map(e => `<article class="domain-entry">${e}</article>`).join(""),
            domains: domains.Regions[feature].length,
            x : topInfluencers.Websites.length,
            y : topInfluencers.Telegram.length
        }

        for(let entry in datasheet){
            factSheet = factSheet.replaceAll(`{{${entry}}}`, datasheet[entry])
        }
        return factSheet
    }

    const openNewTab = (e) => {
        e.preventDefault();
        window.open(e.target.href, '_blank').focus();
    }

    const highlightFeatures = (e) => {
        console.log("entering")
        const elem = e.target;
        if(elem.classList.contains("tg-caption")){
            const circles = Array.from(document.querySelectorAll("svg.circle-pack g.tg-node .circle"));
            circles.forEach(c => c.classList.add("highlight")) 
        }
        if(elem.classList.contains("web-caption")){
            const circles = Array.from(document.querySelectorAll("svg.circle-pack g.ru-node circle"));
            circles.forEach(c => c.classList.add("highlight")) 
        }
    }

    const unHighlightFeatures = (e) => {
        console.log("leaving")
        const circles = Array.from(document.querySelectorAll("svg.circle-pack g circle"));
        circles.forEach(c => c.classList.remove("highlight")) 
    }
    const renderContent = async (resetView, remoteData, openNewTab) => {
        const data = await remoteData;
        document.querySelector(".close-button").addEventListener("click", resetView);
        
        renderCirclePack(data, "svg.circle-pack g")
        renderTopSourcesChart(data, "top-sources-chart");
        renderHourlyGraph(data, "hourly-chart");

        Array.from(document.querySelectorAll("p.small-caption")).
        forEach(e => e.addEventListener("mouseenter", highlightFeatures));
        Array.from(document.querySelectorAll("p.small-caption")).
        forEach(e => e.addEventListener("mouseleave", unHighlightFeatures));

        renderPostingFrequencyChart(data, "frequency-chart");
        renderCategories(data, "category-chart",{
            legend: {
                        x: 0,
                        y: 1,
                        traceorder: 'normal',
                        font: {
                          family: 'Instrument Sans',
                          size: 12,
                          color: '#000'
                        },
                        bgcolor: 'none',
                        bordercolor: 'none',
                        borderwidth: 0
                    }
        });
        const elements = document.querySelector('dialog .container');

        elements.classList.remove("hidden");
    
        document.querySelector("a.domain").addEventListener("click", openNewTab);
    }
    

    const init = async () => {
        const domain = domains.Regions[feature][0]
        if(!document.querySelector("dialog#feature-view")){
            const e = document.createElement('dialog');
            e.id = "feature-view"
            document.querySelector("body").appendChild(e)
        }

        let template = (await loadTemplate()).replaceAll("{{feature}}", feature)

        const dialog = document.querySelector("dialog#feature-view");
            dialog.innerHTML = template;
        const elements = document.querySelector('dialog .container');
            elements.classList.add("hidden");
            dialog.showModal();

        const data = await loadRemoteData(domain)
        let factSheet = await parseFactSheet(await loadFactSheet(), data)
            template = template.replaceAll("{{fact-sheet}}", factSheet)
            template = template.replaceAll("{{domain}}", domain)
        dialog.innerHTML = template;
        const input = document.querySelector(".tabbed input[checked]")
        document.querySelector(`#${input.id.replace("-tab", "")}`).classList.remove("hidden")
        const resetView = () => dialog.close()
        await renderContent(resetView, data, openNewTab);
        document.querySelector("dialog#feature-view .loader_container").classList.add("hidden");
        
    }

    await init()

}

