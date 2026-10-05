<script lang="ts">
  import { api } from "../lib/api";
  import type { Plan, Page, Exercise, PlannedExercise } from "../lib/types";
  let { onstart }: { onstart: (day: string) => Promise<void> } = $props();
  let plans = $state<Plan[]>([]);
  let plan = $state<Plan | null>(null);
  let exercises = $state<Exercise[]>([]);
  let templates = $state<{ id: string; name: string }[]>([]);
  let name = $state("");
  let dayName = $state("");
  let error = $state("");
  let busy = $state(false);
  let cursor = $state<string | null>(null);
  const templateKeys = new Map<string, string>();
  async function load() {
    const result = await api<Page<Plan>>("/plans");
    plans = result.items;
    cursor = result.next_cursor;
  }
  async function open(id: string) {
    plan = await api<Plan>(`/plans/${id}`);
    plan.workout_days.sort((a, b) => a.position - b.position);
    for (const d of plan.workout_days)
      d.planned_exercises.sort((a, b) => a.position - b.position);
  }
  $effect(() => {
    Promise.all([
      load(),
      api<{ system: Exercise[]; custom: Exercise[] }>("/exercises").then(
        (r) =>
          (exercises = [
            ...r.system,
            ...r.custom.map((e) => ({ ...e, custom: true })),
          ]),
      ),
      api<{ items: { id: string; name: string }[] }>("/templates").then(
        (r) => (templates = r.items),
      ),
    ]).catch((e) => (error = e.message));
  });
  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to save";
    } finally {
      busy = false;
    }
  }
  function form(event: SubmitEvent) {
    event.preventDefault();
    return new FormData(event.currentTarget as HTMLFormElement);
  }
  async function create(event: SubmitEvent) {
    event.preventDefault();
    await run(async () => {
      const rows = await api<Plan[]>("/plans", "POST", { name });
      name = "";
      await load();
      await open(rows[0].id);
    });
  }
  async function template(id: string, title: string) {
    await run(async () => {
      const key = templateKeys.get(id) ?? crypto.randomUUID();
      templateKeys.set(id, key);
      const result = await api<{ id: string }>("/plans/from-template", "POST", {
        template_id: id,
        name: title,
        idempotency_key: key,
      });
      templateKeys.delete(id);
      await load();
      await open(result.id);
    });
  }
  async function addDay(event: SubmitEvent) {
    event.preventDefault();
    if (!plan) return;
    await run(async () => {
      await api(`/plans/${plan!.id}/days`, "POST", {
        name: dayName,
        position:
          Math.max(-1, ...plan!.workout_days.map((d) => d.position)) + 1,
      });
      dayName = "";
      await open(plan!.id);
    });
  }
  async function addExercise(day: string, event: SubmitEvent) {
    const data = form(event);
    const [kind, id] = String(data.get("exercise")).split(":");
    await run(async () => {
      const d = plan!.workout_days.find((d) => d.id === day)!;
      await api(`/days/${day}/exercises`, "POST", {
        [kind === "custom" ? "user_exercise_id" : "exercise_id"]: id,
        position:
          Math.max(-1, ...d.planned_exercises.map((e) => e.position)) + 1,
      });
      await open(plan!.id);
    });
  }
  async function targets(ex: PlannedExercise, event: SubmitEvent) {
    const data = form(event);
    await run(async () => {
      const count = Number(data.get("sets"));
      const reps = Number(data.get("reps"));
      const kg = Number(data.get("weight"));
      const rest = Number(data.get("rest"));
      for (let position = 0; position < count; position++) {
        const existing = ex.planned_set_targets.find(
          (t) => t.position === position,
        );
        await api(
          existing
            ? `/targets/${existing.id}`
            : `/planned-exercises/${ex.id}/targets`,
          existing ? "PATCH" : "POST",
          { position, reps, weight_kg: kg, rest_seconds: rest },
        );
      }
      for (const extra of ex.planned_set_targets.filter(
        (t) => t.position >= count,
      ))
        await api(`/targets/${extra.id}`, "DELETE");
      await open(plan!.id);
    });
  }
  const exerciseName = (e: PlannedExercise) =>
    exercises.find((x) => x.id === (e.exercise_id ?? e.user_exercise_id))
      ?.name ?? "Exercise";
</script>

<h1>Workout plans</h1>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="grid">
  <section class="card">
    <h2>Create a plan</h2>
    <form onsubmit={create}>
      <label
        >Plan name<input bind:value={name} required maxlength="100" /></label
      ><button disabled={busy}>Create plan</button>
    </form>
  </section>
  <section class="card">
    <h2>Start with a template</h2>
    {#each templates as t}<p>
        <button
          class="secondary"
          disabled={busy}
          onclick={() => template(t.id, t.name)}>Use {t.name}</button
        >
      </p>{/each}
  </section>
</div>
<div class="actions">
  {#each plans as p}<button
      class="secondary"
      onclick={() => run(() => open(p.id))}
      >{p.name}{p.archived_at ? " · archived" : ""}</button
    >{/each}{#if cursor}<button
      class="secondary"
      onclick={() =>
        run(async () => {
          const page = await api<Page<Plan>>(
            `/plans?cursor=${encodeURIComponent(cursor!)}`,
          );
          plans = [...plans, ...page.items];
          cursor = page.next_cursor;
        })}>More plans</button
    >{/if}
</div>
{#if plan}<section class="card" style="margin-top:20px">
    <h2>Edit plan</h2>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api(`/plans/${plan!.id}`, "PATCH", {
            name: plan!.name,
            description: plan!.description,
          });
          await load();
        });
      }}
    >
      <label
        >Name<input required maxlength="100" bind:value={plan.name} /></label
      ><label
        >Description<textarea maxlength="2000" bind:value={plan.description}
        ></textarea></label
      >
      <div class="actions">
        <button disabled={busy}>Save plan</button>{#if !plan.archived_at}<button
            type="button"
            class="secondary"
            disabled={busy}
            onclick={() =>
              run(async () => {
                await api(`/plans/${plan!.id}`, "PATCH", {
                  archived_at: new Date().toISOString(),
                });
                await open(plan!.id);
                await load();
              })}>Archive plan</button
          >{/if}
      </div>
    </form>
    {#if plan.archived_at}<p class="notice">
        Archived plans retain their history and cannot start new workouts.
      </p>{:else}
      {#each plan.workout_days as day}<article
          class="card"
          style="margin-top:20px"
        >
          <form
            onsubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api(`/days/${day.id}`, "PATCH", { name: day.name });
                await open(plan!.id);
              });
            }}
          >
            <label
              >Workout day<input
                required
                bind:value={day.name}
                maxlength="100"
              /></label
            >
            <div class="actions">
              <button class="secondary" disabled={busy}>Save day name</button
              ><button
                type="button"
                disabled={busy}
                onclick={() => run(() => onstart(day.id))}>Start workout</button
              ><button
                type="button"
                class="danger"
                disabled={busy}
                onclick={() =>
                  run(async () => {
                    await api(`/days/${day.id}`, "DELETE");
                    await open(plan!.id);
                  })}>Remove day</button
              >
            </div>
          </form>
          {#each day.planned_exercises as ex}<details
              open
              style="margin-top:18px"
            >
              <summary>{exerciseName(ex)}</summary>
              <form onsubmit={(event) => targets(ex, event)}>
                <div class="row">
                  <label
                    >Target sets<input
                      name="sets"
                      type="number"
                      min="1"
                      max="50"
                      value={ex.planned_set_targets.length || 3}
                      required
                    /></label
                  ><label
                    >Reps<input
                      name="reps"
                      type="number"
                      min="1"
                      max="1000"
                      value={ex.planned_set_targets[0]?.reps ?? 8}
                      required
                    /></label
                  ><label
                    >Weight (kg)<input
                      name="weight"
                      type="number"
                      min="0"
                      max="2000"
                      step="0.001"
                      value={ex.planned_set_targets[0]?.weight_kg ?? 0}
                      required
                    /></label
                  ><label
                    >Rest (seconds)<input
                      name="rest"
                      type="number"
                      min="0"
                      max="3600"
                      value={ex.planned_set_targets[0]?.rest_seconds ?? 120}
                      required
                    /></label
                  >
                </div>
                <div class="actions">
                  <button class="secondary" disabled={busy}>Save targets</button
                  ><button
                    class="danger"
                    type="button"
                    disabled={busy}
                    onclick={() =>
                      run(async () => {
                        await api(`/planned-exercises/${ex.id}`, "DELETE");
                        await open(plan!.id);
                      })}>Remove exercise</button
                  >
                </div>
              </form>
            </details>{/each}
          <form onsubmit={(event) => addExercise(day.id, event)}>
            <label
              >Add exercise<select name="exercise" required
                ><option value="">Choose an exercise</option
                >{#each exercises as e}<option
                    value={`${e.custom ? "custom" : "system"}:${e.id}`}
                    >{e.name}</option
                  >{/each}</select
              ></label
            ><button class="secondary" disabled={busy}>Add to day</button>
          </form>
        </article>{/each}
      <form onsubmit={addDay}>
        <label
          >New workout day<input
            required
            maxlength="100"
            bind:value={dayName}
          /></label
        ><button disabled={busy}>Add day</button>
      </form>{/if}
  </section>{/if}
