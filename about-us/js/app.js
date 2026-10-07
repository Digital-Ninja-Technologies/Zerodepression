// switch to counsellors page
// let gotoGallery = document.getElementById("goto_gallery");
// gotoGallery.addEventListener("click", () => {
//   window.location.href = "../gallery/gallery.html";
// });

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

// switching to flow1 page
// const buttons = document.querySelectorAll("header button");
// const footerBtn = document.querySelector(".connect button");

// buttons.forEach((btn) => {
//   btn.addEventListener("click", () => {
//     window.location.href = "../chatFlow1/index.html";
//   });
// });

// footerBtn.addEventListener("click", () => {
//   window.location.href = "../chatFlow1/index.html";
// });
// switching users

// const user = document.querySelector('.users')
const avatars = document.querySelectorAll(".avatar");
let mainComment = document.querySelector(".main-comment h2");
const comments = [
  "I'm glad that I was able to bare out my mind without feeling like a bad person",

  "I came to the platform with a heavy heart, but the councellors are \
    caring and loving, i dismissed my suicide though at once, Thank you \
    ZeroDepression Team",

  "Giving birth to new child was sort of overwhelming for me but talking to a counsellor here gave me a bit of relief.",
];

avatars.forEach((avatar) => {
  avatar.addEventListener("click", (e) => {
    avatars.forEach((avatar) => {
      avatar.classList.remove("active-user");
    });
    e.currentTarget.classList.add("active-user");
    let id = parseInt(e.currentTarget.getAttribute("data-user"));

    mainComment.textContent = comments[id];
  });
});

// auto switch comments

function switchComments() {
  let count = 0;
  setInterval(() => {
    if (count > 2) {
      count = 0;
    }
    avatars.forEach((avatar, index) => {
      avatar.classList.remove("active-user");
      if (count === index) {
        avatar.classList.add("active-user");
        mainComment.textContent = comments[index];
      }
    }),
      count++;
  }, 2500);
}

window.addEventListener("DOMContentLoaded", () => {
  switchComments();
});

// submitting subscribe form

const url = "https://api.zerodepression.org/v1/ge/newsletter";

const subscriberName = document.getElementById("name");
const subscriberEmail = document.getElementById("email");
const subscribe = document.getElementById("subscribe");
const error = document.querySelector(".subscribe .error");
let subscriber = {
  first_name: "",
  email: "",
};

subscribe.addEventListener("click", () => {
  if (subscriberName.value !== "" && subscriberEmail.value !== "") {
    subscriber.first_name = subscriberName.value;
    subscriber.email = subscriberEmail;
    error.style.display = "none";
    subscriberName.value = "";
    subscriberEmail.value = "";

    fetch(url, {
      method: "post",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(subscriber),
    })
      .then((res) => res.json())
      .then((data) => console.log(data));
  } else {
    error.style.display = "block";
  }
});
