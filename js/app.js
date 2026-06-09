/* =====================================
   APP MODULE
   Global state, DOM references,
   data loading, events, initialization
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
       DOM REFERENCES
    ===================================== */
    var homeView;
    var profileView;
    var workoutView;
    var friendGrid;
    var profileContainer;
    var dayGrid;
    var workoutHeader;
    var exerciseContainer;
    var profileBackBtn;
    var workoutBackBtn;

    /* =====================================
       DATA LOADING
    ===================================== */
    async function loadFriends() {
        try {
            var files = [
                "data/pronoy.json",
                "data/prem.json",
                "data/onton.json",
                "data/dev.json",
                "data/adi.json"
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

            // Filter out any null values from failed loads
            friends = parsedFriends.filter(function(friend) {
                return friend !== null;
            });
            
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

    /* =====================================
       NAVIGATION EVENT HANDLERS
    ===================================== */
    function onProfileBackClick() {
        window.removeEventListener("scroll", UIModule.saveProfileScrollPosition);
        UIModule.showView(homeView);
    }

    function onWorkoutBackClick() {
        UIModule.showView(profileView, false);
        
        setTimeout(function() {
            window.scrollTo({
                top: profileScrollPosition || 0,
                behavior: "smooth"
            });
        }, 100);
    }

    /* =====================================
       INITIALIZATION
    ===================================== */
    function init() {
        // Cache DOM references
        homeView = document.getElementById("homeView");
        profileView = document.getElementById("profileView");
        workoutView = document.getElementById("workoutView");
        friendGrid = document.getElementById("friendGrid");
        profileContainer = document.getElementById("profileContainer");
        dayGrid = document.getElementById("dayGrid");
        workoutHeader = document.getElementById("workoutHeader");
        exerciseContainer = document.getElementById("exerciseContainer");
        profileBackBtn = document.getElementById("profileBackBtn");
        workoutBackBtn = document.getElementById("workoutBackBtn");

        // Attach event listeners
        if (profileBackBtn) {
            profileBackBtn.addEventListener("click", onProfileBackClick);
        }

        if (workoutBackBtn) {
            workoutBackBtn.addEventListener("click", onWorkoutBackClick);
        }

        // Load data
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
        getFriends: function() { return friends; }
    };
    
})();

/* =====================================
   APPLICATION STARTUP
===================================== */
document.addEventListener("DOMContentLoaded", function() {
    AppModule.init();
});