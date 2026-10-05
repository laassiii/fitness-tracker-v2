<script lang="ts">
  import { api } from "../lib/api";
  import type { Metric, Progress, Record, Page } from "../lib/types";
  let metrics = $state<Metric[]>([]);
  let progress = $state<Progress[]>([]);
  let records = $state<Record[]>([]);
  let cursor = $state<string | null>(null);
  let error = $state("");
  let busy = $state(false);
  let editing = $state<string | null>(null);
  let weight = $state<number | undefined>();
  let fat = $state<number | undefined>();
  let waist = $state<number | undefined>();
  let chest = $state<number | undefined>();
  let observed = $state(new Date().toISOString().slice(0, 10));
  let notes = $state("");
  let exercise = $state("");
  async function load() {
    const [m, p, r] = await Promise.all([
      api<Page<Metric>>("/body-metrics"),
      api<{ items: Progress[] }>("/progress"),
      api<{ items: Record[] }>("/personal-records"),
    ]);
    metrics = m.items;
    cursor = m.next_cursor;
    progress = p.items;
    records = r.items;
    if (!exercise && records.length)
      exercise = records[0].exercise_id ?? records[0].user_exercise_id!;
  }
  $effect(() => {
    load().catch((e) => (error = e.message));
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    try {
      const body = {
        observed_at: new Date(`${observed}T12:00:00Z`).toISOString(),
        notes,
        weight_kg: weight ?? null,
        body_fat_percent: fat ?? null,
        waist_cm: waist ?? null,
        chest_cm: chest ?? null,
      };
      if ([weight, fat, waist, chest].every((v) => v === undefined))
        throw new Error("Record at least one measurement.");
      await api(
        editing ? `/body-metrics/${editing}` : "/body-metrics",
        editing ? "PATCH" : "POST",
        body,
      );
      editing = null;
      weight = fat = waist = chest = undefined;
      notes = "";
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to save";
    } finally {
      busy = false;
    }
  }
  function edit(m: Metric) {
    editing = m.id;
    weight = m.weight_kg ?? undefined;
    fat = m.body_fat_percent ?? undefined;
    waist = m.waist_cm ?? undefined;
    chest = m.chest_cm ?? undefined;
    observed = m.observed_at.slice(0, 10);
    notes = m.notes;
  }
  function points(values: number[]) {
    if (!values.length) return "";
    const min = Math.min(...values);
    const span = Math.max(...values) - min || 1;
    return values
      .map(
        (v, i) =>
          `${20 + (i / (values.length - 1 || 1)) * 560},${150 - ((v - min) / span) * 120}`,
      )
      .join(" ");
  }
  function markers(values: number[]) {
    return points(values)
      .split(" ")
      .filter(Boolean)
      .map((point) => {
        const [x, y] = point.split(",").map(Number);
        return { x, y };
      });
  }
  const series = $derived(
    progress
      .filter((p) => (p.exercise_id ?? p.user_exercise_id) === exercise)
      .slice()
      .reverse(),
  );
</script>

<h1>Progress & body metrics</h1>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<section class="card">
  <h2>Exercise progression</h2>
  <label
    >Exercise<select bind:value={exercise}
      ><option value="">Choose an exercise</option>{#each records as r}<option
          value={r.exercise_id ?? r.user_exercise_id!}>{r.exercise_name}</option
        >{/each}</select
    ></label
  >{#if series.length}<svg
      class="chart"
      viewBox="0 0 600 180"
      role="img"
      aria-label={`Heaviest working-set weight for ${series[0]?.name_snapshot ?? exercise}, ordered by workout date`}
      ><title
        >Heaviest working-set weight for {series[0]?.name_snapshot ??
          exercise}</title
      ><polyline
        points={points(series.map((p) => p.heaviest_kg))}
        fill="none"
        stroke="#245b49"
        stroke-width="3"
      />{#each markers(series.map((p) => p.heaviest_kg)) as point}<circle
          cx={point.x}
          cy={point.y}
          r="4"
          fill="#245d4c"
        />{/each}</svg
    >
    <p class="muted">
      Heaviest working set · {series[0].started_at.slice(0, 10)} to {series
        .at(-1)
        ?.started_at.slice(0, 10)} · {Math.min(
        ...series.map((p) => p.heaviest_kg),
      )}–{Math.max(...series.map((p) => p.heaviest_kg))} kg
    </p>
    <table>
      <thead><tr><th>Date</th><th>Weight</th><th>Volume</th></tr></thead><tbody
        >{#each series.slice().reverse().slice(0, 20) as p}<tr
            ><td>{p.started_at.slice(0, 10)}</td><td>{p.heaviest_kg} kg</td><td
              >{p.volume_kg} kg</td
            ></tr
          >{/each}</tbody
      >
    </table>{:else}<p>
      Complete a workout with working sets to see progression.
    </p>{/if}
  <p class="muted">
    Shows up to 500 recent exercise observations. PRs use all completed working
    sets.
  </p>
</section>
<section class="card">
  <h2>Personal records</h2>
  <p class="muted">
    Estimated 1RM uses the Epley formula for sets of 1–10 reps. It is an
    estimate, not a measured lift.
  </p>
  {#each records as r}<p>
      <strong>{r.exercise_name}</strong> · heaviest set {r.heaviest_kg} kg · most
      reps {r.most_reps} · estimated 1RM {r.estimated_1rm_kg?.toFixed(1) ?? "—"} kg
    </p>{/each}
</section>
<section class="card">
  <h2>{editing ? "Edit measurement" : "Record optional body metrics"}</h2>
  <form onsubmit={save}>
    <label>Date<input type="date" required bind:value={observed} /></label>
    <div class="row">
      <label
        >Bodyweight (kg)<input
          type="number"
          min="1"
          max="500"
          step="0.001"
          bind:value={weight}
        /></label
      ><label
        >Body fat (%)<input
          type="number"
          min="0"
          max="100"
          step="0.01"
          bind:value={fat}
        /></label
      ><label
        >Waist (cm)<input
          type="number"
          min="1"
          max="500"
          step="0.01"
          bind:value={waist}
        /></label
      ><label
        >Chest (cm)<input
          type="number"
          min="1"
          max="500"
          step="0.01"
          bind:value={chest}
        /></label
      >
    </div>
    <label>Notes<textarea bind:value={notes} maxlength="1000"></textarea></label
    ><button disabled={busy}>Save measurement</button>
  </form>
</section>
<section class="card">
  <h2>Measurements</h2>
  {#if metrics.filter((m) => m.weight_kg !== null).length}<svg
      class="chart"
      viewBox="0 0 600 180"
      role="img"
      aria-label="Bodyweight measurements in chronological order"
      ><title>Bodyweight measurements</title><polyline
        points={points(
          metrics
            .filter((m) => m.weight_kg !== null)
            .slice()
            .reverse()
            .map((m) => m.weight_kg!),
        )}
        fill="none"
        stroke="#245b49"
        stroke-width="3"
      />{#each markers(metrics
          .filter((m) => m.weight_kg !== null)
          .slice()
          .reverse()
          .map((m) => m.weight_kg!)) as point}<circle
          cx={point.x}
          cy={point.y}
          r="4"
          fill="#245d4c"
        />{/each}</svg
    >{/if}{#each metrics as m}<article>
      <p>
        {m.observed_at.slice(0, 10)} · {m.weight_kg ?? "—"} kg · {m.body_fat_percent ??
          "—"}% body fat · waist {m.waist_cm ?? "—"} cm · chest {m.chest_cm ??
          "—"} cm
      </p>
      <p>{m.notes}</p>
      <div class="actions">
        <button class="secondary" onclick={() => edit(m)}
          >Edit measurement</button
        ><button
          class="danger"
          disabled={busy}
          onclick={async () => {
            busy = true;
            try {
              await api(`/body-metrics/${m.id}`, "DELETE");
              await load();
            } catch (e) {
              error = e instanceof Error ? e.message : "Unable to remove";
            } finally {
              busy = false;
            }
          }}>Remove measurement</button
        >
      </div>
    </article>{/each}{#if cursor}<button
      class="secondary"
      onclick={async () => {
        try {
          const page = await api<Page<Metric>>(
            `/body-metrics?cursor=${encodeURIComponent(cursor!)}`,
          );
          metrics = [...metrics, ...page.items];
          cursor = page.next_cursor;
        } catch (e) {
          error = e instanceof Error ? e.message : "Unable to load";
        }
      }}>More measurements</button
    >{/if}
</section>
