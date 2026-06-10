/* =====================================
   PROGRESS MODULE
   Completion counting and progress
   calculations - no DOM manipulation
===================================== */

var ProgressModule = (function() {
    
    /**
     * Count completed exercises for a specific day
     * Returns: { completed: number, total: number }
     */
    function getDayCompletionCount(friendName, day) {
        if (!day || !day.exercises) {
            return { completed: 0, total: 0 };
        }
        
        var completedCount = 0;
        var totalExercises = day.exercises.length;
        
        day.exercises.forEach(function(exercise) {
            if (StorageModule.loadExerciseCompletion(
                friendName,
                day.name,
                exercise.name
            )) {
                completedCount++;
            }
        });
        
        return {
            completed: completedCount,
            total: totalExercises
        };
    }
    
    /**
     * Check if all exercises in a day are completed
     */
    function isDayFullyCompleted(friendName, day) {
        var counts = getDayCompletionCount(friendName, day);
        return counts.total > 0 && counts.completed === counts.total;
    }
    
    /**
     * Get completion percentage for a day (0-100)
     */
    function getDayCompletionPercentage(friendName, day) {
        var counts = getDayCompletionCount(friendName, day);
        if (counts.total === 0) return 0;
        return Math.round((counts.completed / counts.total) * 100);
    }
    
    /**
     * Get overall completion for a friend across all days
     */
    function getOverallCompletion(friend) {
        if (!friend || !friend.days) {
            return { completed: 0, total: 0, percentage: 0 };
        }
        
        var totalCompleted = 0;
        var totalExercises = 0;
        
        friend.days.forEach(function(day) {
            var counts = getDayCompletionCount(friend.name, day);
            totalCompleted += counts.completed;
            totalExercises += counts.total;
        });
        
        return {
            completed: totalCompleted,
            total: totalExercises,
            percentage: totalExercises > 0 ? Math.round((totalCompleted / totalExercises) * 100) : 0
        };
    }
    
    /**
     * Check if a specific exercise is completed
     */
    function isExerciseCompleted(friendName, dayName, exerciseName) {
        return StorageModule.loadExerciseCompletion(friendName, dayName, exerciseName);
    }
    
    /* =====================================
       PUBLIC API
    ===================================== */
    return {
        getDayCompletionCount: getDayCompletionCount,
        isDayFullyCompleted: isDayFullyCompleted,
        getDayCompletionPercentage: getDayCompletionPercentage,
        getOverallCompletion: getOverallCompletion,
        isExerciseCompleted: isExerciseCompleted
    };
    
})();