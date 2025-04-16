const gap = 300
window.slideLeft = (e) => {

    if(e.target.classList.contains("disable")) return
    const container = document.querySelector(".slideshow")
    const ref = document.querySelector(".slide-element")
    const elems = Array.from(document.querySelectorAll(".slide-element"));
    const activeEl = elems.filter(e => e.classList.contains("active"))[0];
    const totalSize = (elems.length * ref.offsetWidth) + elems.length * gap;
    const rightBtn = document.querySelector(".arrow-right")
    const leftBtn = document.querySelector(".arrow-left")

    if(Math.abs(container.offsetLeft) < ref.offsetWidth || elems.indexOf(activeEl) === 0){
        leftBtn.classList.add("disable")
    }

    if(Math.abs(container.offsetLeft) < totalSize){
        if(elems.indexOf(activeEl)-1 > 0){
            const nextId =  elems.indexOf(activeEl) - 1
            container.style.marginLeft = -((ref.offsetWidth * nextId) + gap*nextId)+ "px"
            activeEl.classList.remove("active")
            elems[nextId].classList.add("active")
            if(leftBtn.classList.contains("disable")) leftBtn.classList.remove("disable")
            if(nextId+1 < elems.length && rightBtn.classList.contains("disable")) rightBtn.classList.remove("disable") 
        }else{
            container.style.marginLeft = 0
            elems.forEach(e => e.classList.remove("active"))
            elems[0].classList.add("active")
            leftBtn.classList.add("disable")
            rightBtn.classList.remove("disable")
        }
    }else{
        container.style.marginLeft = 0
        elems[0].classList.add("active")
        leftBtn.classList.add("disable")
        rightBtn.classList.remove("disable")
    }
}

window.slideRight = (e) => {
    if(e.target.classList.contains("disable")) return
    const container = document.querySelector(".slideshow")
    const ref = document.querySelector(".slide-element")
    const elems = Array.from(document.querySelectorAll(".slide-element"));
    const activeEl = elems.filter(e => e.classList.contains("active"))[0];
    const totalSize = (elems.length * ref.offsetWidth) + elems.length * gap;
    const leftBtn = document.querySelector(".arrow-left")
    const rightBtn = document.querySelector(".arrow-right")
    
    if(container.offsetLeft < totalSize){
        if(elems.indexOf(activeEl)+1 <= elems.length){
            const nextId =  elems.indexOf(activeEl) + 1;
            if(nextId === elems.length-1) rightBtn.classList.add("disable")
            container.style.marginLeft = -((ref.offsetWidth * nextId) + gap*nextId)+ "px"
            activeEl.classList.remove("active")
            elems[nextId].classList.add("active")
            if(leftBtn.classList.contains("disable")) leftBtn.classList.remove("disable")
        }else{
            container.style.marginLeft = 0
            leftBtn.classList.add("disable")
            elems[0].classList.add("active")
            activeEl.classList.remove("active")
        }
    }else{
        container.style.marginLeft = 0
        leftBtn.classList.add("disable")
        elems[0].classList.add("active")
    }
   
}