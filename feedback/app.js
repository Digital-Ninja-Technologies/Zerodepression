let radioBtns = document.querySelectorAll("input[name='react']");
let feedOne = document.querySelector(".feed_one");
let feedTwo = document.querySelector(".feed_two");
let feedThree = document.querySelector(".feed_three");
const nxt = document.querySelector(".nxt");
const backOne = document.getElementById("back_one");
const backTwo = document.getElementById("back_two");
const submit = document.getElementById("submit");
const councellor = document.querySelector("input[name='counsellor']");
const message = document.querySelector("textarea");
let mood;

const formValues = {
    name: "",
    counsellor: "",
    message: "",
    mood: "",
 }

nxt.addEventListener("click", () => {
    for (const btn of radioBtns) {
        if (btn.checked) {
            formValues.mood= btn.value;
            feedOne.style.display = "none";
            feedThree.style.display = "none";
            feedTwo.style.display = "block";
            break;
        }
    }})

backOne.addEventListener("click", () => {
    feedOne.style.display = "block";
            feedThree.style.display = "none";
            feedTwo.style.display = "none";
})

backTwo.addEventListener("click", () => {
    feedOne.style.display = "none";
            feedThree.style.display = "none";
            feedTwo.style.display = "block";
})
councellor.addEventListener("change", (e) => {
    formValues.counsellor = e.target.value
})
message.addEventListener("change", (e) => {
    formValues.message = e.target.value
})

submit.addEventListener("click", () => {
    alert(JSON.stringify(formValues));
    feedOne.style.display = "none";
            feedThree.style.display = "block";
            feedTwo.style.display = "none";
})