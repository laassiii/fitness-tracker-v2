/* =====================================
   UI MODULE
   DOM rendering - cards, images,
   visual updates
===================================== */

var UIModule = (function() {
    
    /* =====================================
       IMAGE HANDLING
    ===================================== */
    function handleImageError(img) {
        img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Crect width='150' height='150' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='white' font-size='20'%3ENo Image%3C/text%3E%3C/svg%3E";
        img.alt = "Image not available";
    }
    
    /* =====================================
       COMPLETION COUNT HTML HELPER
    ===================================== */
    function buildExerciseCountHTML(completedCount, totalExercises) {
        var allCompletedClass = (completedCount === totalExercises && totalExercises > 0) ? ' all-completed' : '';
        
        return '<span class="day-exercise-count' + allCompletedClass + '">' +
                    '<svg class="exercise-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                        '<path d="M18 20V10M12 20V4M6 20v-6"/>' +
                    '</svg>' +
                    completedCount + '/' + totalExercises + ' Completed' +
                '</span>';
    }
    
    /* =====================================
       UPDATE DAY COMPLETION COUNTS
       Updates existing DOM without recreating
    ===================================== */
    function updateDayCompletionCounts(friend) {
        if (!friend || !friend.days) return;
        
        var dayCards = document.querySelectorAll('.day-card');
        var dayGrid = document.getElementById('dayGrid');
        
        if (!dayCards.length || !dayGrid) return;
        
        dayCards.forEach(function(card, index) {
            if (index < friend.days.length) {
                var day = friend.days[index];
                
                if (!day || !day.exercises) return;
                
                var counts = ProgressModule.getDayCompletionCount(friend.name, day);
                var exerciseCountSpan = card.querySelector('.day-exercise-count');
                
                if (exerciseCountSpan) {
                    var svgIcon = exerciseCountSpan.querySelector('.exercise-icon');
                    
                    if (svgIcon) {
                        exerciseCountSpan.innerHTML = svgIcon.outerHTML + 
                            counts.completed + '/' + counts.total + ' Completed';
                    } else {
                        exerciseCountSpan.innerHTML = buildExerciseCountHTML(counts.completed, counts.total);
                    }
                    
                    if (counts.completed === counts.total && counts.total > 0) {
                        exerciseCountSpan.classList.add('all-completed');
                    } else {
                        exerciseCountSpan.classList.remove('all-completed');
                    }
                } else {
                    var footer = card.querySelector('.day-card-footer');
                    if (footer) {
                        footer.innerHTML = buildExerciseCountHTML(counts.completed, counts.total);
                    }
                }
            }
        });
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
                NavigationModule.goToProfile(friend);
            });
            card.style.animationDelay = (index * 0.1) + 's';
            
            friendGrid.appendChild(card);
        });
    }
    
    /* =====================================
       RENDER PROFILE
    ===================================== */
    function openProfile(friend) {
        if (!friend) return;
        
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
                            ' loading="lazy"' +
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

                    var counts = ProgressModule.getDayCompletionCount(friend.name, day);

                    card.innerHTML = 
                        '<div class="day-card-header">' +
                            '<h3>' + (day.name || 'Unknown Day') + '</h3>' +
                            (day.focus ? '<span class="day-focus-badge">' + day.focus + '</span>' : '') +
                        '</div>' +
                        '<div class="day-card-footer">' +
                            buildExerciseCountHTML(counts.completed, counts.total) +
                        '</div>';

                    card.addEventListener("click", function() {
                        NavigationModule.goToWorkout(day);
                    });
                    card.style.animationDelay = (index * 0.1) + 's';
                    
                    dayGrid.appendChild(card);
                });
            }
        }

        NavigationModule.showView(document.getElementById("profileView"));
        
        window.addEventListener("scroll", NavigationModule.saveProfileScrollPosition);
    }
    
    /* =====================================
       PUBLIC API
    ===================================== */
    return {
        handleImageError: handleImageError,
        renderFriends: renderFriends,
        openProfile: openProfile,
        updateDayCompletionCounts: updateDayCompletionCounts
    };
    
})();