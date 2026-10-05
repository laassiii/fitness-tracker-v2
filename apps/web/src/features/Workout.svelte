<script lang="ts">
  import { api } from "../lib/api";
  import type {
    Session,
    Exercise,
    SessionExercise,
    PerformedSet,
  } from "../lib/types";
  let { id, oncomplete }: { id: string; oncomplete: () => Promise<void> } =
    $props();
  let session = $state<Session | null>(null);
  let catalog = $state<Exercise[]>([]);
  let error = $state("");
  let busy = $state(false);
  const drafts = new Map<string, string>();
  async function load() {
    session = await api<Session>(`/sessions/${id}`);
    session.session_exercises.sort((a, b) => a.position - b.position);
    for (const e of session.session_exercises)
      e.performed_sets.sort((a, b) => a.position - b.position);
  }
  $effect(() => {
    const sessionId = id;
    api<Session>(`/sessions/${sessionId}`)
      .then((s) => {
        s.session_exercises.sort((a, b) => a.position - b.position);
        for (const exercise of s.session_exercises)
          exercise.performed_sets.sort((a, b) => a.position - b.position);
        session = s;
      })
      .catch((e) => (error = e.message));
    api<{ system: Exercise[]; custom: Exercise[] }>("/exercises")
      .then(
        (r) =>
          (catalog = [
            ...r.system,
            ...r.custom.map((e) => ({ ...e, custom: true })),
          ]),
      )
      .catch((e) => (error = e.message));
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
  async function set(
    ex: SessionExercise,
    event: SubmitEvent,
    existing?: PerformedSet,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    await run(async () => {
      const position =
        existing?.position ??
        Math.max(-1, ...ex.performed_sets.map((s) => s.position)) + 1;
      const key = `${ex.id}:${position}`;
      const setId = existing?.id ?? drafts.get(key) ?? crypto.randomUUID();
      drafts.set(key, setId);
      const body = {
        reps: Number(data.get("reps")),
        weight_kg: Number(data.get("weight")),
      };
      await api(
        existing ? `/sets/${existing.id}` : `/session-exercises/${ex.id}/sets`,
        existing ? "PATCH" : "POST",
        existing ? body : { ...body, id: setId, position },
      );
      drafts.delete(key);
      await load();
    });
  }
  async function addExercise(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const [kind, exercise] = String(data.get("exercise")).split(":");
    await run(async () => {
      await api(`/sessions/${id}/exercises`, "POST", {
        [kind === "custom" ? "user_exercise_id" : "exercise_id"]: exercise,
        position:
          Math.max(-1, ...session!.session_exercises.map((e) => e.position)) +
          1,
      });
      await load();
    });
  }
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}{#if session}<h1>
    {session.name_snapshot}
  </h1>
  <p class="muted">
    {new Date(session.started_at).toLocaleString()} · {session.status.replace(
      "_",
      " ",
    )}
  </p>
  {#each session.session_exercises as ex}<section class="card">
      <h2>{ex.name_snapshot}</h2>
      {#if ex.target_snapshot.length}<p class="muted">
          Planned: {ex.target_snapshot.length} sets · {ex.target_snapshot[0]
            ?.reps ?? "—"} reps · {ex.target_snapshot[0]?.weight_kg ?? "—"} kg
        </p>{/if}
      <table>
        <thead
          ><tr><th>Set</th><th>Weight</th><th>Reps</th><th>Type</th></tr></thead
        ><tbody
          >{#each ex.performed_sets as set}<tr
              ><td>{set.position + 1}</td><td>{set.weight_kg} kg</td><td
                >{set.reps}</td
              ><td>{set.set_type}</td></tr
            >{/each}</tbody
        >
      </table>
      {#if session.status === "in_progress"}{#each ex.performed_sets as existing}<details
          >
            <summary>Edit set {existing.position + 1}</summary>
            <form onsubmit={(event) => set(ex, event, existing)}>
              <div class="row">
                <label
                  >Weight (kg)<input
                    name="weight"
                    type="number"
                    min="0"
                    max="2000"
                    step="0.001"
                    value={existing.weight_kg}
                    required
                  /></label
                ><label
                  >Reps<input
                    name="reps"
                    type="number"
                    min="1"
                    max="1000"
                    value={existing.reps}
                    required
                  /></label
                >
              </div>
              <div class="actions">
                <button class="secondary" disabled={busy}>Save set</button
                ><button
                  type="button"
                  class="danger"
                  disabled={busy}
                  onclick={() =>
                    run(async () => {
                      await api(`/sets/${existing.id}`, "DELETE");
                      await load();
                    })}>Remove set</button
                >
              </div>
            </form>
          </details>{/each}
        <form onsubmit={(event) => set(ex, event)} style="margin-top:16px">
          <div class="row">
            <label
              >Weight (kg)<input
                name="weight"
                type="number"
                min="0"
                max="2000"
                step="0.001"
                value={ex.performed_sets.at(-1)?.weight_kg ??
                  ex.target_snapshot[0]?.weight_kg ??
                  0}
                required
              /></label
            ><label
              >Reps<input
                name="reps"
                type="number"
                min="1"
                max="1000"
                value={ex.performed_sets.at(-1)?.reps ??
                  ex.target_snapshot[0]?.reps ??
                  8}
                required
              /></label
            >
          </div>
          <button disabled={busy}>Log set for {ex.name_snapshot}</button>
        </form>{/if}
    </section>{/each}
  {#if session.status === "in_progress"}<section class="card">
      <form onsubmit={addExercise}>
        <label
          >Add exercise<select name="exercise" required
            ><option value="">Choose an exercise</option
            >{#each catalog as e}<option
                value={`${e.custom ? "custom" : "system"}:${e.id}`}
                >{e.name}</option
              >{/each}</select
          ></label
        ><button class="secondary" disabled={busy}>Add exercise</button>
      </form>
      <div class="actions" style="margin-top:24px">
        <button
          disabled={busy}
          onclick={() =>
            run(async () => {
              await api(`/sessions/${id}/complete`, "POST", {});
              await oncomplete();
            })}>Complete workout</button
        ><button
          class="secondary"
          disabled={busy}
          onclick={() =>
            run(async () => {
              await api(`/sessions/${id}/discard`, "POST", {});
              await oncomplete();
            })}>Discard workout</button
        >
      </div>
    </section>{:else}<p class="notice">
      This workout is closed. Changes to your plan cannot rewrite this record.
    </p>{/if}{/if}
