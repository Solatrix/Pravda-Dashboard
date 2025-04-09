import { popupHTML } from "./constants.js"
import { renderHourlyGraph, renderPostingFrequencyChart, renderTopSourcesChart, renderCategories } from "./graphCollection.js";
export const modalBox = async (feature, domains, world) => {
    const loadRemoteData = async (domain) =>
    {
       
        return (await (await fetch(`https://raw.githubusercontent.com/CheckFirstHQ/pravda-network/refs/heads/main/json/${domain}_viz.json`)).json())
    } 
    let domainMap = domains.Regions[feature];
    if(!document.querySelector("dialog#feature-view")){
        const e = document.createElement('dialog');
        e.id = "feature-view"
        document.querySelector("body").appendChild(e)
    }
    const domain = domainMap[0]
    let template = popupHTML.replaceAll("{{feature}}", feature)
        template = template.replaceAll("{{domain}}", domain)

    const dialog = document.querySelector("dialog#feature-view");
    dialog.innerHTML = template;
    dialog.showModal();

    const resetView = () => {
        dialog.close()
        console.log(dialog)
        document.querySelector(".title h3").innerHTML = ""
    }
    document.querySelector(".close-button").addEventListener("click", resetView)
    const elements = document.querySelector('dialog .container');
    elements.classList.add("hidden")
    const data = await loadRemoteData(domain)

    renderTopSourcesChart(data, "top-sources-chart")
    renderHourlyGraph(data, "hourly-chart")
    renderPostingFrequencyChart(data, "frequency-chart")
    renderCategories(data, "category-chart")
    elements.classList.remove("hidden")
    document.querySelector("dialog#feature-view .loader_container").classList.add("hidden")


   
}