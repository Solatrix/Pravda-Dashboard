export class URLRouter{
    constructor(domainMap){
        this.location = window.location;
        this.args = new URLSearchParams(window.location.search);
        console.log(domainMap)
        if(!this.args.get("view")) return
        
        if(this.args.get("view") === "world"){
            this.region = "World"
            this.domain = "all.news-pravda.com"
        }
        else if(domainMap.Regions[this.args.get("view")]){
            this.domain = domainMap.Regions[this.args.get("view")][0]
            this.region = this.args.get("view")
        }

        return {
            region: this.region,
            domain: this.domain,
        }
    }
}