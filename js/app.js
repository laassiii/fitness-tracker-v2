/* =====================================
   APP MODULE
   Application state, initialization,
   data loading, module wiring
===================================== */

var AppModule = (function() {
    
    /* =====================================
       STATE
    ===================================== */
    var friends = [];
    var selectedFriend = null;
    var selectedDay = null;
    var profileScrollPosition = 0;

    /* =====================================
       DATA LOADING
    ===================================== */
    async function loadFriends() {
        try {
            var files = [
                "data/friends/pronoy.json",
                "data/friends/prem.json",
                "data/friends/onton.json",
                "data/friends/dev.json",
                "data/friends/adi.json"
            ];

            var responses = await Promise.all(
                files.map(function(file) {
                    return fetch(file).catch(function(err) {
                        console.warn("Failed to load " + file + ":", err);
                        return null;
                    });
                })
            );

            var parsedFriends = await Promise.all(
                responses.map(async function(res, index) {
                    if (!res || !res.ok) {
                        console.warn("Could not load friend data for index " + index);
                        return null;
                    }
                    try {
                        return await res.json();
                    } catch (e) {
                        console.warn("Invalid JSON from " + files[index]);
                        return null;
                    }
                })
            );

            friends = parsedFriends.filter(function(friend) {
                return friend !== null;
            });
            
            var friendGrid = document.getElementById("friendGrid");
            
            if (friends.length === 0) {
                if (friendGrid) {
                    friendGrid.innerHTML = 
                        '<div class="empty-state">' +
                            '<p>No friends data available</p>' +
                            '<button onclick="AppModule.loadFriends()">Retry</button>' +
                        '</div>';
                }
                return;
            }

            UIModule.renderFriends(friends);
        } catch (error) {
            console.error("Error loading friends:", error);
            var friendGrid = document.getElementById("friendGrid");
            if (friendGrid) {
                friendGrid.innerHTML = 
                    '<div class="empty-state">' +
                        '<p>Failed to load friends</p>' +
                        '<button onclick="AppModule.loadFriends()">Retry</button>' +
                    '</div>';
            }
        }
    }

    /* =====================================
       STATE GETTERS & SETTERS
    ===================================== */
    function getSelectedFriend() {
        return selectedFriend;
    }

    function setSelectedFriend(friend) {
        selectedFriend = friend;
    }

    function getSelectedDay() {
        return selectedDay;
    }

    function setSelectedDay(day) {
        selectedDay = day;
    }

    function setProfileScrollPosition(position) {
        profileScrollPosition = position;
    }

    function getProfileScrollPosition() {
        return profileScrollPosition;
    }
    
    function getFriends() {
        return friends;
    }

    /* =====================================
       INITIALIZATION
    ===================================== */
    function init() {
        // Attach event listeners for back buttons
        var profileBackBtn = document.getElementById("profileBackBtn");
        var workoutBackBtn = document.getElementById("workoutBackBtn");

        if (profileBackBtn) {
            profileBackBtn.addEventListener("click", function() {
                NavigationModule.goToHomeFromProfile();
            });
        }

        if (workoutBackBtn) {
            workoutBackBtn.addEventListener("click", function() {
                NavigationModule.goToProfileFromWorkout();
            });
        }

        // Load friend data
        loadFriends();
    }

    /* =====================================
       PUBLIC API
    ===================================== */
    return {
        init: init,
        loadFriends: loadFriends,
        getSelectedFriend: getSelectedFriend,
        setSelectedFriend: setSelectedFriend,
        getSelectedDay: getSelectedDay,
        setSelectedDay: setSelectedDay,
        setProfileScrollPosition: setProfileScrollPosition,
        getProfileScrollPosition: getProfileScrollPosition,
        getFriends: getFriends
    };
    
})();

/* =====================================
   APPLICATION STARTUP
===================================== */
document.addEventListener("DOMContentLoaded", function() {
    AppModule.init();
});

/* =========================
   FEATURE CARDS
========================= */

document
    .getElementById("homeWorkoutsCard")
    .addEventListener("click", function () {
        console.log("Home Workouts Clicked");
    });

document
    .getElementById("fitnessMythsCard")
    .addEventListener("click", function () {
        console.log("Fitness Myths Clicked");
    });