const gap = 300
window.slideLeft = () => {
    const container = document.querySelector(".slideshow")
    const ref = document.querySelector(".slide-element")
    const elems = Array.from(document.querySelectorAll(".slide-element"));
    const activeEl = elems.filter(e => e.classList.contains("active"))[0];
    const totalSize = (elems.length * ref.offsetWidth) + elems.length * container.style.gap;

    const leftBtn = document.querySelector(".arrow-left")

    if(container.offsetLeft*-1 < ref.offsetWidth){
        leftBtn.classList.add("disable")
    }

    if(container.offsetLeft*-1 < totalSize){
        if(elems.indexOf(activeEl)-1 > 0){
            const nextId =  elems.indexOf(activeEl) - 1
            container.style.marginLeft = -((ref.offsetWidth * nextId) + gap*nextId)+ "px"
            activeEl.classList.remove("active")
            elems[nextId].classList.add("active")
            if(leftBtn.classList.contains("disable")) leftBtn.classList.remove("disable")

        }else{
            container.style.marginLeft = 0
            elems.forEach(e => e.classList.remove("active"))
            elems[0].classList.add("active")
        }
    }else{
        container.style.marginLeft = 0
        elems[0].classList.add("active")
    }
}

window.slideRight = () => {
    const container = document.querySelector(".slideshow")
    const ref = document.querySelector(".slide-element")
    const elems = Array.from(document.querySelectorAll(".slide-element"));
    const activeEl = elems.filter(e => e.classList.contains("active"))[0];
    const totalSize = (elems.length * ref.offsetWidth) + elems.length * container.style.gap;
    const leftBtn = document.querySelector(".arrow-left")

    if(container.offsetLeft < totalSize){
        if(elems.indexOf(activeEl)+1 < elems.length){
            const nextId =  elems.indexOf(activeEl) + 1
            container.style.marginLeft = -((ref.offsetWidth * nextId) + gap*nextId)+ "px"
            activeEl.classList.remove("active")
            elems[nextId].classList.add("active")
            if(leftBtn.classList.contains("disable")) leftBtn.classList.remove("disable")

        }else{
            container.style.marginLeft = 0
            leftBtn.classList.add("disable")
            elems[0].classList.add("active")
        }
    }else{
        container.style.marginLeft = 0
        leftBtn.classList.add("disable")
        elems[0].classList.add("active")
    }
   
}