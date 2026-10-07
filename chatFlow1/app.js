


//animations
// let elements = document.querySelectorAll(".hidden");
// let windowHeight = window.innerHeight;

// function checkPosition() {
//   for (let i = 0; i < elements.length; i++) {
//     element = elements[i];
//     let topPos = element.getBoundingClientRect().top;
//     if (topPos - windowHeight <= 0) {
//       element.classList.add("animate");
//       element.classList.remove("hidden");
//     } else {
//       element.classList.remove("animate");
//       element.classList.add("hidden");
//     }
//   }
// }
// window.addEventListener("scroll", checkPosition);
// window.addEventListener("resize", checkPosition);

  // const articles = document.querySelectorAll("article")
  // setTimeout(()=> {
  //   let firstArticle = articles[0]
  //   firstArticle.classList.remove("animate")
  //   firstArticle.classList.remove("hidden")
  //   firstArticle.classList.add("appear")
  // }, 1000)


// route to chat page

let callBtn = document.getElementById("call");
const chat = document.getElementById("chat");

callBtn.addEventListener("click", () => {
window.location.href = "../chatFlow3/index.html"
})

chat.addEventListener('click', ()=> {
  window.location.href = "../chatFlow2/index.html"
})

