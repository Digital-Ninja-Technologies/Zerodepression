

// routing
const back = document.getElementById("back");
back.addEventListener("click", () => {
  window.location.href = "../chatFlow1/index.html";
});

// animation
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
