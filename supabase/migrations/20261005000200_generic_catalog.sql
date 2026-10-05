begin;
insert into public.exercises(id,name,muscle_group,equipment,instructions) values
('10000000-0000-4000-8000-000000000001','Bench Press','Chest','Barbell','Use a controlled range of motion and a suitable spotter.'),
('10000000-0000-4000-8000-000000000002','Squat','Legs','Barbell','Choose a load you can control throughout the movement.'),
('10000000-0000-4000-8000-000000000003','Deadlift','Posterior chain','Barbell','Brace and keep the load close to your body.'),
('10000000-0000-4000-8000-000000000004','Overhead Press','Shoulders','Barbell','Maintain control and avoid excessive back extension.'),
('10000000-0000-4000-8000-000000000005','Dumbbell Row','Back','Dumbbell','Pull with control and keep your torso stable.'),
('10000000-0000-4000-8000-000000000006','Push-up','Chest','Bodyweight','Choose an incline or variation appropriate to your ability.'),
('10000000-0000-4000-8000-000000000007','Lat Pulldown','Back','Cable','Use a controlled pull and return.'),
('10000000-0000-4000-8000-000000000008','Split Squat','Legs','Dumbbell','Keep your stance stable and use a comfortable depth.');
insert into public.workout_templates(id,name,description) values ('20000000-0000-4000-8000-000000000001','Full Body Foundation','A generic starting structure. Adjust exercises and loads to your needs.');
insert into public.template_exercises(id,template_id,exercise_id,position) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',0),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1),
('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005',2);
insert into public.template_set_targets(template_exercise_id,position,reps,rest_seconds)
select id,p,8,120 from public.template_exercises cross join generate_series(0,2) p;
commit;
