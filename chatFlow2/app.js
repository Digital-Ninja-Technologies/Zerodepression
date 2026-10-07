

// switching to flow1 page
const buttons = document.querySelectorAll("header button");

buttons.forEach((btn) => {
  btn.addEventListener("click", () => {
    window.location.href = "../chatFlow1/index.html";
  });
});

// routing
const back = document.getElementById("back");
back.addEventListener("click", () => {
  window.location.href = "../chatFlow1/index.html";
});

// end chat

const endChat = document.getElementById("end-chat");
const popUp = document.querySelector(".chatpopup");
const yes = document.getElementById("yes");
const no = document.getElementById("no");

endChat.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "smooth",
  });
  popUp.style.display = "flex";

});

popUp.addEventListener("click", (e) => {
  let current = e.target;
  let attr = current.getAttribute("id");
  if (attr === "yes") {
    // implement feedback feature
    popUp.style.display = "none";
  } else {
    popUp.style.display = "none";
  }
});
