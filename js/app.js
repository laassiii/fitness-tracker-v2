
/* =====================================
   STATE
===================================== */
let friends = [];
let selectedFriend = null;
let selectedDay = null;

/* =====================================
   DOM
===================================== */

const homeView = document.getElementById("homeView");
const profileView = document.getElementById("profileView");
const workoutView = document.getElementById("workoutView");

const friendGrid = document.getElementById("friendGrid");
const profileContainer = document.getElementById("profileContainer");
const dayGrid = document.getElementById("dayGrid");

const workoutHeader = document.getElementById("workoutHeader");
const exerciseContainer = document.getElementById("exerciseContainer");

/* =====================================
   HELPERS
===================================== */

function showView(view){

    [homeView,profileView,workoutView].forEach(v=>{
        v.classList.remove("active");
    });

    view.classList.add("active");

    window.scrollTo({
        top:0,
        behavior:"smooth"
    });
}

/* =====================================
   HOME
===================================== */
async function loadFriends() {

    const files = [
        "data/pronoy.json",
        "data/prem.json",
        "data/onton.json",
          "data/dev.json",
          "data/adi.json"
    ];

    const responses = await Promise.all(
        files.map(file => fetch(file))
    );

    friends = await Promise.all(
        responses.map(res => res.json())
    );

    renderFriends();
}
function renderFriends(){

    friendGrid.innerHTML = "";

    friends.forEach(friend=>{

        const card = document.createElement("div");

        card.className = "friend-card glass";

        card.innerHTML = `
            <img
                src="${friend.image}"
                alt="${friend.name}"
                class="friend-card-image"
            >

            <div class="friend-card-content">

                <h2>${friend.name}</h2>

                <div class="friend-card-meta">
                    <span>${friend.goal}</span>
                    <span>${friend.trainingDays} Training Days</span>
                </div>

            </div>
        `;

        card.onclick = ()=>openProfile(friend);

        friendGrid.appendChild(card);
    });
}

/* =====================================
   PROFILE
===================================== */

function openProfile(friend){

    selectedFriend = friend;

    profileContainer.innerHTML = `
        <div class="profile-card glass">

            <img
                src="${friend.image}"
                alt="${friend.name}"
                class="profile-image"
            >

            <h2>${friend.name}</h2>

            <div class="profile-goal">
                ${friend.goal}
            </div>

            <div class="profile-meta">
                <div>
                    <strong>Training Days:</strong>
                    ${friend.trainingDays}
                </div>
            </div>

        </div>
    `;

    dayGrid.innerHTML = "";

    friend.days.forEach(day=>{

        const card = document.createElement("div");

        card.className = "day-card glass";

        card.innerHTML = `
            <h3>${day.name}</h3>
            <span>${day.exercises.length} Exercises</span>
        `;

        card.onclick = ()=>openWorkout(day);

        dayGrid.appendChild(card);
    });

    showView(profileView);
}

/* =====================================
   WORKOUT
===================================== */

function openWorkout(day){

    selectedDay = day;

    workoutHeader.innerHTML = `
        <div class="profile-card glass">
            <h2>${selectedFriend.name}</h2>
            <p>${day.name}</p>
        </div>
    `;

    exerciseContainer.innerHTML = `
        <div class="exercise-list">
            ${day.exercises.map(exercise=>`
                <div class="exercise-card glass">

                    <h3>${exercise.name}</h3>

                    <div class="exercise-info">
                        <span>Sets: ${exercise.sets}</span>
                        <span>Reps: ${exercise.reps}</span>
                        <span>Rest: ${exercise.rest}</span>
                    </div>

                </div>
            `).join("")}
        </div>
    `;

    showView(workoutView);
}

/* =====================================
   NAVIGATION
===================================== */

document
.getElementById("profileBackBtn")
.addEventListener("click",()=>{
    showView(homeView);
});

document
.getElementById("workoutBackBtn")
.addEventListener("click",()=>{
    showView(profileView);
});

/* =====================================
   INIT
===================================== */

loadFriends();