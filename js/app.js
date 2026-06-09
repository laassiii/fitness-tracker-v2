/* =====================================
   STATE
===================================== */
let friends = [];
let selectedFriend = null;
let selectedDay = null;
let profileScrollPosition = 0;

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
function showView(view, scrollTop = true) {
    [homeView, profileView, workoutView].forEach(v => {
        v.classList.remove("active");
        v.style.display = "none";
    });

    view.classList.add("active");
    view.style.display = "block";

    if (scrollTop) {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }
}

function handleImageError(img) {
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect width='150' height='150' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='white' font-size='20'%3ENo Image%3C/text%3E%3C/svg%3E";
    img.alt = "Image not available";
}

/* =====================================
   HOME
===================================== */
async function loadFriends() {
    try {
        const files = [
            "data/pronoy.json",
            "data/prem.json",
            "data/onton.json",
            "data/dev.json",
            "data/adi.json"
        ];

        const responses = await Promise.all(
            files.map(file => fetch(file).catch(err => {
                console.warn(`Failed to load ${file}:`, err);
                return null;
            }))
        );

        friends = await Promise.all(
            responses.map(async (res, index) => {
                if (!res || !res.ok) {
                    console.warn(`Could not load friend data for index ${index}`);
                    return null;
                }
                try {
                    return await res.json();
                } catch (e) {
                    console.warn(`Invalid JSON from ${files[index]}`);
                    return null;
                }
            })
        );

        // Filter out any null values from failed loads
        friends = friends.filter(friend => friend !== null);
        
        if (friends.length === 0) {
            friendGrid.innerHTML = `
                <div class="empty-state">
                    <p>No friends data available</p>
                    <button onclick="loadFriends()">Retry</button>
                </div>
            `;
            return;
        }

        renderFriends();
    } catch (error) {
        console.error("Error loading friends:", error);
        friendGrid.innerHTML = `
            <div class="empty-state">
                <p>Failed to load friends</p>
                <button onclick="loadFriends()">Retry</button>
            </div>
        `;
    }
}

function renderFriends() {
    if (!friendGrid) return;
    
    friendGrid.innerHTML = "";

    friends.forEach((friend, index) => {
        if (!friend) return;

        const card = document.createElement("div");
        card.className = "friend-card glass";

        card.innerHTML = `
            <div class="friend-card-image-wrapper">
                <img
                    src="${friend.image || ''}"
                    alt="${friend.name || 'Friend'}"
                    class="friend-card-image"
                    onerror="handleImageError(this)"
                    loading="lazy"
                >
            </div>
            <div class="friend-card-content">
                <h2>${friend.name || 'Unknown'}</h2>
                <div class="friend-card-meta">
                    <span>${friend.goal || 'No goal set'}</span>
                    <span>${friend.trainingDays || 0} Training Days</span>
                </div>
            </div>
        `;

        card.addEventListener("click", () => openProfile(friend));
        card.style.animationDelay = `${index * 0.1}s`;
        
        friendGrid.appendChild(card);
    });
}

/* =====================================
   PROFILE
===================================== */
function openProfile(friend) {
    if (!friend) return;
    
    selectedFriend = friend;
    profileScrollPosition = 0;

    if (profileContainer) {
        profileContainer.innerHTML = `
            <div class="profile-card glass">
                <div class="profile-image-wrapper">
                    <img
                        src="${friend.image || ''}"
                        alt="${friend.name || 'Friend'}"
                        class="profile-image"
                        onerror="handleImageError(this)"
                    >
                </div>
                <h2>${friend.name || 'Unknown'}</h2>
                <div class="profile-goal">
                    ${friend.goal || 'No goal set'}
                </div>
                <div class="profile-meta">
                    <div>
                        <strong>Training Days:</strong>
                        ${friend.trainingDays || 0}
                    </div>
                </div>
            </div>
        `;
    }

    if (dayGrid) {
        dayGrid.innerHTML = "";

        if (!friend.days || friend.days.length === 0) {
            dayGrid.innerHTML = `
                <div class="empty-state">
                    <p>No training days available</p>
                </div>
            `;
        } else {
            friend.days.forEach((day, index) => {
                if (!day) return;

                const card = document.createElement("div");
                card.className = "day-card glass";

                // Build the card HTML with focus area if available
                card.innerHTML = `
                    <div class="day-card-header">
                        <h3>${day.name || 'Unknown Day'}</h3>
                        ${day.focus ? `<span class="day-focus-badge">${day.focus}</span>` : ''}
                    </div>
                    <div class="day-card-footer">
                        <span class="day-exercise-count">
                            <svg class="exercise-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 20V10M12 20V4M6 20v-6"/>
                            </svg>
                            ${day.exercises ? day.exercises.length : 0} Exercises
                        </span>
                    </div>
                `;

                card.addEventListener("click", () => openWorkout(day));
                card.style.animationDelay = `${index * 0.1}s`;
                
                dayGrid.appendChild(card);
            });
        }
    }

    showView(profileView);
    
    // Save scroll position when user scrolls
    window.addEventListener("scroll", saveProfileScrollPosition);
}

function saveProfileScrollPosition() {
    if (profileView.classList.contains("active")) {
        profileScrollPosition = window.scrollY;
    }
}

/* =====================================
   WORKOUT
===================================== */
function openWorkout(day) {
    if (!day || !selectedFriend) return;
    
    selectedDay = day;

    if (workoutHeader) {
        workoutHeader.innerHTML = `
            <div class="profile-card glass">
                <h2>${selectedFriend.name || 'Unknown'}</h2>
                <p class="workout-day-name">${day.name || 'Unknown Day'}</p>
                ${day.focus ? `<p class="workout-focus">${day.focus}</p>` : ''}
            </div>
        `;
    }

    if (exerciseContainer) {
        if (!day.exercises || day.exercises.length === 0) {
            exerciseContainer.innerHTML = `
                <div class="empty-state">
                    <p>No exercises for this day</p>
                </div>
            `;
        } else {
            exerciseContainer.innerHTML = `
                <div class="exercise-list">
                    ${day.exercises.map((exercise, index) => `
                        <div class="exercise-card glass" style="animation-delay: ${index * 0.1}s">
                            <h3>${exercise.name || 'Unknown Exercise'}</h3>
                            <div class="exercise-info">
                                <span>Sets: ${exercise.sets || 0}</span>
                                <span>Reps: ${exercise.reps || 0}</span>
                                <span>Rest: ${exercise.rest || '0s'}</span>
                            </div>
                        </div>
                    `).join("")}
                </div>
            `;
        }
    }

    showView(workoutView);
}

/* =====================================
   NAVIGATION
===================================== */
document.getElementById("profileBackBtn")?.addEventListener("click", () => {
    window.removeEventListener("scroll", saveProfileScrollPosition);
    showView(homeView);
});

document.getElementById("workoutBackBtn")?.addEventListener("click", () => {
    showView(profileView, false);
    
    setTimeout(() => {
        window.scrollTo({
            top: profileScrollPosition || 0,
            behavior: "smooth"
        });
    }, 100);
});

/* =====================================
   INIT
===================================== */
document.addEventListener("DOMContentLoaded", () => {
    loadFriends();
});