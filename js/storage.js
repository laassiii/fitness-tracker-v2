/* =====================================
   STORAGE MODULE
   localStorage persistence layer
   No business logic - pure data storage
===================================== */

var StorageModule = (function() {
    
    var STORAGE_PREFIX = 'workout_completion_';
    
    /**
     * Generates a unique storage key for a specific exercise
     * Format: workout_completion_friendname_dayname_exercisename
     */
    function generateKey(friendName, dayName, exerciseName) {
        return STORAGE_PREFIX + 
               friendName.replace(/\s+/g, '_').toLowerCase() + '_' +
               dayName.replace(/\s+/g, '_').toLowerCase() + '_' +
               exerciseName.replace(/\s+/g, '_').toLowerCase();
    }
    
    /**
     * Save exercise completion state to localStorage
     */
    function saveExerciseCompletion(friendName, dayName, exerciseName, completed) {
        try {
            var key = generateKey(friendName, dayName, exerciseName);
            var data = {
                friendName: friendName,
                dayName: dayName,
                exerciseName: exerciseName,
                completed: completed,
                timestamp: Date.now()
            };
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save exercise completion:', e);
        }
    }
    
    /**
     * Load exercise completion state from localStorage
     * Returns: boolean (default false)
     */
    function loadExerciseCompletion(friendName, dayName, exerciseName) {
        try {
            var key = generateKey(friendName, dayName, exerciseName);
            var stored = localStorage.getItem(key);
            
            if (stored) {
                var data = JSON.parse(stored);
                return data.completed === true;
            }
        } catch (e) {
            console.warn('Failed to load exercise completion:', e);
        }
        
        return false;
    }
    
    /**
     * Clear exercise completion state from localStorage
     */
    function clearExerciseCompletion(friendName, dayName, exerciseName) {
        try {
            var key = generateKey(friendName, dayName, exerciseName);
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('Failed to clear exercise completion:', e);
        }
    }
    
    /* =====================================
       PUBLIC API
    ===================================== */
    return {
        saveExerciseCompletion: saveExerciseCompletion,
        loadExerciseCompletion: loadExerciseCompletion,
        clearExerciseCompletion: clearExerciseCompletion
    };
    
})();