export interface Profile {
  user_id: string;
  handle: string;
  display_name: string;
  bio: string;
}
export interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  instructions: string;
  custom?: boolean;
}
export interface Target {
  id: string;
  position: number;
  reps: number | null;
  weight_kg: number | null;
  rest_seconds: number | null;
}
export interface PlannedExercise {
  id: string;
  exercise_id: string | null;
  user_exercise_id: string | null;
  position: number;
  notes: string;
  planned_set_targets: Target[];
}
export interface WorkoutDay {
  id: string;
  name: string;
  position: number;
  planned_exercises: PlannedExercise[];
}
export interface Plan {
  id: string;
  name: string;
  description: string;
  archived_at: string | null;
  workout_days: WorkoutDay[];
}
export interface PerformedSet {
  id: string;
  position: number;
  reps: number;
  weight_kg: number;
  set_type: string;
  rpe: number | null;
  notes: string;
}
export interface SessionExercise {
  id: string;
  name_snapshot: string;
  position: number;
  target_snapshot: Omit<Target, "id">[];
  performed_sets: PerformedSet[];
}
export interface Session {
  id: string;
  name_snapshot: string;
  status: "in_progress" | "completed" | "discarded";
  started_at: string;
  ended_at: string | null;
  session_exercises: SessionExercise[];
}
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
export interface Metric {
  id: string;
  observed_at: string;
  weight_kg: number | null;
  body_fat_percent: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  notes: string;
}
export interface Progress {
  exercise_id: string | null;
  user_exercise_id: string | null;
  name_snapshot: string;
  started_at: string;
  heaviest_kg: number;
  estimated_1rm_kg: number | null;
  volume_kg: number;
}
export interface Record {
  exercise_id: string | null;
  user_exercise_id: string | null;
  exercise_name: string;
  heaviest_kg: number;
  most_reps: number;
  estimated_1rm_kg: number | null;
}
export interface LegalDocument {
  document_type: "terms" | "privacy";
  version: string;
  content: string;
  content_hash: string;
}
export interface Consent {
  accepted: boolean;
  documents: LegalDocument[];
  records: {
    document_type: string;
    document_version: string;
    accepted_at: string;
  }[];
}
