const CloseBtn = document.getElementById("closeBtn");
const sideNav = document.getElementById("sideMenu");
const hamburger = document.querySelector(".hamburger");
const year = document.getElementById("year");
// toggling  mobile nav.
hamburger.addEventListener("click", () => {
  sideNav.style.width = "100%";
});

CloseBtn.addEventListener("click", () => {
  sideNav.style.width = "0px";
});

// route to flow1

// let buttons = document.querySelectorAll("button");

// buttons.forEach((btn) =>
//   btn.addEventListener("click", () => {
//     window.location.href = "../chatFlow1/index.html";
//   })
// );
