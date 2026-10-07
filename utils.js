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

// dot image slider
let imgSpan = document.querySelector(".dots");
let dots = document.querySelectorAll(".dots span");
imgSpan.addEventListener("click", (e) => {
  let target = e.target;
  setTargetDot(target);
});

// manual image slide
let cards = document.querySelectorAll(".card");
let next = document.getElementById("next");
let prev = document.getElementById("prev");
// work on setting the left arrow.
let left = 0;
next.onclick = () => {
  left++;
  // if (left > 0 && left === 2) {
  //   next.onclick = "null";
  //   next.style.backgroundImage = "url(./assets/backSwitch.png)";
  //   next.style.transform = "rotate(-180deg)";
  // }
  //   console.log(left);

  cards.forEach((card) => {
    if (left === 0) {
      card.style.left = "-0px";
      changeDot(left);
    }
    if (left === 1) {
      card.style.left = "-340px";
      changeDot(left);
    }
    if (left === 2) {
      card.style.left = "-680px";
      changeDot(left);
    }
    if (left === 3) {
      card.style.left = "-1020px";
      changeDot(left);
    }
    if (left === 4) {
      card.style.left = "-1360px";
      changeDot(left);
    }
    if (left === 5) {
      card.style.left = "-1700px";
      changeDot(left);
    }
    if (left === 6) {
      card.style.left = "-2040px";
      changeDot(left);
    }
    if (left === 7) {
      card.style.left = "-2380px";
      changeDot(left);
    }
    if (left === 8) {
      card.style.left = "-2720px";
      changeDot(left);
    }
    if (left === 9) {
      card.style.left = "-3060px";
      changeDot(left);
    }
    if (left === 10) {
      card.style.left = "-3400px";
      changeDot(left);
    }
    if (left === 11) {
      card.style.left = "-3740px";
      changeDot(left);
    }
    if (left === 12) {
      card.style.left = "-4080px";
      changeDot(left);
    }
    if (left === 13) {
      card.style.left = "-4420px";
      changeDot(left);
    }
    if (left === 14) {
      card.style.left = "-4760px";
      changeDot(left);
    }
    if (left === 15) {
      card.style.left = "-5100px";
      changeDot(left);
    }
    if (left === 16) {
      card.style.left = "-5440px";
      changeDot(left);
    }
    if (left > 16) {
      left = 0;
      card.style.left = "0px";
      changeDot(left);
    }
  });
};

// work to do here.
prev.onclick = () => {
  left--;
  if (left > 0) {
    //  prev.onclick = "null";
    prev.style.backgroundImage = "url(../assets/forwardSwitch.png)";
    prev.style.transform = "rotate(-180deg)";
  }
  cards.forEach((card) => {
    if (left === 0) {
      card.style.left = "-0px";
      changeDot(left);
    }
    if (left === 1) {
      card.style.left = "-340px";
      changeDot(left);
    }
    if (left === 2) {
      card.style.left = "-680px";
      changeDot(left);
    }
    if (left === 3) {
      card.style.left = "-1020px";
      changeDot(left);
    }
    if (left === 4) {
      card.style.left = "-1360px";
      changeDot(left);
    }
    if (left === 5) {
      card.style.left = "-1700px";
      changeDot(left);
    }
    if (left === 6) {
      card.style.left = "-2040px";
      changeDot(left);
    }
    if (left === 7) {
      card.style.left = "-2380px";
      changeDot(left);
    }
    if (left === 8) {
      card.style.left = "-2720px";
      changeDot(left);
    }
    if (left === 9) {
      card.style.left = "-3060px";
      changeDot(left);
    }
    if (left === 10) {
      card.style.left = "-3400px";
      changeDot(left);
    }
    if (left === 11) {
      card.style.left = "-3740px";
      changeDot(left);
    }
    if (left === 12) {
      card.style.left = "-4080px";
      changeDot(left);
    }
    if (left === 13) {
      card.style.left = "-4420px";
      changeDot(left);
    }
    if (left === 14) {
      card.style.left = "-4760px";
      changeDot(left);
    }
    if (left === 15) {
      card.style.left = "-5100px";
      changeDot(left);
    }
    if (left === 16) {
      card.style.left = "-5440px";
      changeDot(left);
    }
    if (left > 16) {
      left = 0;
      card.style.left = "0px";
      changeDot(left);
    }
  });
};

// set active-link on dot onclick
const setTargetDot = (target) => {
  let dots = document.querySelectorAll(".dots span");
  dots.forEach((dot) => {
    dot.classList.remove("active_dot");
  });
  target.classList.add("active_dot");
};

// change dot pos as image slides
const changeDot = (pos) => {
  dots.forEach((dot, index) => {
    dot.classList.remove("active_dot");
    if (index === pos) {
      dot.classList.add("active_dot");
    }
  });
};

// toggle img with dots

const imgs = document.querySelectorAll(".card img");
// setting date dynmically for footer
let date = new Date();
year.textContent = date.getFullYear();
