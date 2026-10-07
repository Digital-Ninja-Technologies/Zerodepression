

// route to flow1

// let buttons = document.querySelectorAll("button")

// buttons.forEach( btn => btn.addEventListener("click", () => {
//   window.location.href = "../chatFlow1/index.html"
// }))

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
    error.style.display = "none"
    subscriberName.value = ''
    subscriberEmail.value = ''

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
