/* =====================================
   UI MODULE
   All DOM rendering functions
===================================== */

var UIModule = (function() {
    
    /* =====================================
       HELPERS
    ===================================== */
    function showView(view, scrollTop) {
        if (scrollTop === undefined) {
            scrollTop = true;
        }
        
        var allViews = [
            document.getElementById("homeView"),
            document.getElementById("profileView"),
            document.getElementById("workoutView")
        ];
        
        allViews.forEach(function(v) {
            if (v) {
                v.classList.remove("active");
                v.style.display = "none";
            }
        });

        if (view) {
            view.classList.add("active");
            view.style.display = "block";
        }

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
       RENDER FRIENDS
    ===================================== */
    function renderFriends(friends) {
        var friendGrid = document.getElementById("friendGrid");
        if (!friendGrid) return;
        
        friendGrid.innerHTML = "";

        friends.forEach(function(friend, index) {
            if (!friend) return;

            var card = document.createElement("div");
            card.className = "friend-card glass";

            card.innerHTML = 
                '<div class="friend-card-image-wrapper">' +
                    '<img' +
                        ' src="' + (friend.image || '') + '"' +
                        ' alt="' + (friend.name || 'Friend') + '"' +
                        ' class="friend-card-image"' +
                        ' onerror="UIModule.handleImageError(this)"' +
                        ' loading="lazy"' +
                    '>' +
                '</div>' +
                '<div class="friend-card-content">' +
                    '<h2>' + (friend.name || 'Unknown') + '</h2>' +
                    '<div class="friend-card-meta">' +
                        '<span>' + (friend.goal || 'No goal set') + '</span>' +
                        '<span>' + (friend.trainingDays || 0) + ' Training Days</span>' +
                    '</div>' +
                '</div>';

            card.addEventListener("click", function() {
                UIModule.openProfile(friend);
            });
            card.style.animationDelay = (index * 0.1) + 's';
            
            friendGrid.appendChild(card);
        });
    }

    /* =====================================
       OPEN PROFILE
    ===================================== */
    function openProfile(friend) {
        if (!friend) return;
        
        // Access app state through window
        if (window.AppModule) {
            window.AppModule.setSelectedFriend(friend);
            window.AppModule.setProfileScrollPosition(0);
        }
        
        var profileView = document.getElementById("profileView");
        var profileContainer = document.getElementById("profileContainer");
        var dayGrid = document.getElementById("dayGrid");

        if (profileContainer) {
            profileContainer.innerHTML = 
                '<div class="profile-card glass">' +
                    '<div class="profile-image-wrapper">' +
                        '<img' +
                            ' src="' + (friend.image || '') + '"' +
                            ' alt="' + (friend.name || 'Friend') + '"' +
                            ' class="profile-image"' +
                            ' onerror="UIModule.handleImageError(this)"' +
                        '>' +
                    '</div>' +
                    '<h2>' + (friend.name || 'Unknown') + '</h2>' +
                    '<div class="profile-goal">' +
                        (friend.goal || 'No goal set') +
                    '</div>' +
                    '<div class="profile-meta">' +
                        '<div>' +
                            '<strong>Training Days:</strong>' +
                            (friend.trainingDays || 0) +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        if (dayGrid) {
            dayGrid.innerHTML = "";

            if (!friend.days || friend.days.length === 0) {
                dayGrid.innerHTML = 
                    '<div class="empty-state">' +
                        '<p>No training days available</p>' +
                    '</div>';
            } else {
                friend.days.forEach(function(day, index) {
                    if (!day) return;

                    var card = document.createElement("div");
                    card.className = "day-card glass";

                    card.innerHTML = 
                        '<div class="day-card-header">' +
                            '<h3>' + (day.name || 'Unknown Day') + '</h3>' +
                            (day.focus ? '<span class="day-focus-badge">' + day.focus + '</span>' : '') +
                        '</div>' +
                        '<div class="day-card-footer">' +
                            '<span class="day-exercise-count">' +
                                '<svg class="exercise-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                    '<path d="M18 20V10M12 20V4M6 20v-6"/>' +
                                '</svg>' +
                                (day.exercises ? day.exercises.length : 0) + ' Exercises' +
                            '</span>' +
                        '</div>';

                    card.addEventListener("click", function() {
                        UIModule.openWorkout(day);
                    });
                    card.style.animationDelay = (index * 0.1) + 's';
                    
                    dayGrid.appendChild(card);
                });
            }
        }

        showView(profileView);
        
        // Save scroll position when user scrolls
        window.addEventListener("scroll", saveProfileScrollPosition);
    }

    function saveProfileScrollPosition() {
        var profileView = document.getElementById("profileView");
        if (profileView && profileView.classList.contains("active")) {
            if (window.AppModule) {
                window.AppModule.setProfileScrollPosition(window.scrollY);
            }
        }
    }

    /* =====================================
       OPEN WORKOUT
    ===================================== */
    function openWorkout(day) {
        var selectedFriend = window.AppModule ? window.AppModule.getSelectedFriend() : null;
        if (!day || !selectedFriend) return;
        
        if (window.AppModule) {
            window.AppModule.setSelectedDay(day);
        }
        
        var workoutHeader = document.getElementById("workoutHeader");
        var exerciseContainer = document.getElementById("exerciseContainer");
        var workoutView = document.getElementById("workoutView");

        if (workoutHeader) {
            workoutHeader.innerHTML = 
                '<div class="profile-card glass">' +
                    '<h2>' + (selectedFriend.name || 'Unknown') + '</h2>' +
                    '<p class="workout-day-name">' + (day.name || 'Unknown Day') + '</p>' +
                    (day.focus ? '<p class="workout-focus">' + day.focus + '</p>' : '') +
                '</div>';
        }

        if (exerciseContainer) {
            if (!day.exercises || day.exercises.length === 0) {
                exerciseContainer.innerHTML = 
                    '<div class="empty-state">' +
                        '<p>No exercises for this day</p>' +
                    '</div>';
            } else {
                var exercisesHtml = '';
                day.exercises.forEach(function(exercise, index) {
                    exercisesHtml += 
                        '<div class="exercise-card glass" style="animation-delay: ' + (index * 0.1) + 's">' +
                            '<h3>' + (exercise.name || 'Unknown Exercise') + '</h3>' +
                            '<div class="exercise-info">' +
                                '<span>Sets: ' + (exercise.sets || 0) + '</span>' +
                                '<span>Reps: ' + (exercise.reps || 0) + '</span>' +
                                '<span>Rest: ' + (exercise.rest || '0s') + '</span>' +
                            '</div>' +
                        '</div>';
                });
                
                exerciseContainer.innerHTML = '<div class="exercise-list">' + exercisesHtml + '</div>';
            }
        }

        showView(workoutView);
    }

    /* =====================================
       PUBLIC API
    ===================================== */
    return {
        showView: showView,
        handleImageError: handleImageError,
        renderFriends: renderFriends,
        openProfile: openProfile,
        openWorkout: openWorkout,
        saveProfileScrollPosition: saveProfileScrollPosition
    };
    
})();