/* =====================================
   WORKOUT MODULE
   Workout rendering and exercise
   completion handling
===================================== */

var WorkoutModule = (function() {
    
    /**
     * Handle exercise checkbox change
     */
    function handleExerciseCheckbox(checkbox, friendName, dayName, exerciseName) {
        var completed = checkbox.checked;
        
        StorageModule.saveExerciseCompletion(
            friendName,
            dayName,
            exerciseName,
            completed
        );
        
        updateCheckboxStyle(checkbox, completed);
    }
    
    /**
     * Update checkbox visual style based on completion state
     */
    function updateCheckboxStyle(checkbox, completed) {
        var label = checkbox.parentElement;
        if (label) {
            if (completed) {
                label.classList.add('exercise-completed');
            } else {
                label.classList.remove('exercise-completed');
            }
        }
    }
    
    /**
     * Render the workout view for a specific day
     */
    function openWorkout(day) {
        var selectedFriend = window.AppModule ? window.AppModule.getSelectedFriend() : null;
        if (!day || !selectedFriend) return;
        
        var workoutHeader = document.getElementById("workoutHeader");
        var exerciseContainer = document.getElementById("exerciseContainer");

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
                var exercisesHtml = '<div class="exercise-list">';
                
                day.exercises.forEach(function(exercise, index) {
                    var isCompleted = StorageModule.loadExerciseCompletion(
                        selectedFriend.name,
                        day.name,
                        exercise.name
                    );
                    
                    var completedClass = isCompleted ? ' exercise-completed' : '';
                    var checkedAttr = isCompleted ? ' checked' : '';
                    
                    exercisesHtml += 
                        '<div class="exercise-card glass" style="animation-delay: ' + (index * 0.1) + 's">' +
                            '<div class="exercise-header">' +
                                '<h3>' + (exercise.name || 'Unknown Exercise') + '</h3>' +
                                '<label class="exercise-checkbox-label' + completedClass + '">' +
                                    '<input' +
                                        ' type="checkbox"' +
                                        ' class="exercise-checkbox"' +
                                        checkedAttr +
                                        ' onchange="WorkoutModule.handleExerciseCheckbox(this, \'' + 
                                            selectedFriend.name.replace(/'/g, "\\'") + '\', \'' + 
                                            day.name.replace(/'/g, "\\'") + '\', \'' + 
                                            exercise.name.replace(/'/g, "\\'") + '\')"' +
                                    '>' +
                                    '<span class="checkmark"></span>' +
                                '</label>' +
                            '</div>' +
                            '<div class="exercise-info">' +
                                '<span>Sets: ' + (exercise.sets || 0) + '</span>' +
                                '<span>Reps: ' + (exercise.reps || 0) + '</span>' +
                                '<span>Rest: ' + (exercise.rest || '0s') + '</span>' +
                            '</div>' +
                        '</div>';
                });
                
                exercisesHtml += '</div>';
                exerciseContainer.innerHTML = exercisesHtml;
            }
        }

        NavigationModule.showView(document.getElementById("workoutView"));
    }
    
    /* =====================================
       PUBLIC API
    ===================================== */
    return {
        openWorkout: openWorkout,
        handleExerciseCheckbox: handleExerciseCheckbox
    };
    
})();