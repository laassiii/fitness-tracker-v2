/* =====================================
   NAVIGATION MODULE
   View switching, scroll management,
   back button behavior
===================================== */

var NavigationModule = (function() {
    
    /**
     * Switch between views with optional scroll control
     */
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
    
    /**
     * Save current scroll position for profile view
     */
    function saveProfileScrollPosition() {
        var profileView = document.getElementById("profileView");
        if (profileView && profileView.classList.contains("active")) {
            if (window.AppModule) {
                window.AppModule.setProfileScrollPosition(window.scrollY);
            }
        }
    }
    
    /**
     * Navigate back from profile to home
     */
    function goToHomeFromProfile() {
        window.removeEventListener("scroll", saveProfileScrollPosition);
        showView(document.getElementById("homeView"));
    }
    
    /**
     * Navigate back from workout to profile
     * Preserves scroll position, updates completion counts
     */
    function goToProfileFromWorkout() {
        var selectedFriend = window.AppModule ? window.AppModule.getSelectedFriend() : null;
        
        if (selectedFriend) {
            UIModule.updateDayCompletionCounts(selectedFriend);
        }
        
        showView(document.getElementById("profileView"), false);
    }
    
    /**
     * Navigate to profile view for a specific friend
     */
    function goToProfile(friend) {
        if (!friend) return;
        
        if (window.AppModule) {
            window.AppModule.setSelectedFriend(friend);
            window.AppModule.setProfileScrollPosition(0);
        }
        
        UIModule.openProfile(friend);
    }
    
    /**
     * Navigate to workout view for a specific day
     */
    function goToWorkout(day) {
        if (!day) return;
        
        if (window.AppModule) {
            window.AppModule.setSelectedDay(day);
        }
        
        WorkoutModule.openWorkout(day);
    }
    
    /* =====================================
       PUBLIC API
    ===================================== */
    return {
        showView: showView,
        saveProfileScrollPosition: saveProfileScrollPosition,
        goToHomeFromProfile: goToHomeFromProfile,
        goToProfileFromWorkout: goToProfileFromWorkout,
        goToProfile: goToProfile,
        goToWorkout: goToWorkout
    };
    
})();