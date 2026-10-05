<script lang="ts">
  import { api } from "../lib/api";
  import type { Exercise } from "../lib/types";
  let items = $state<Exercise[]>([]);
  let search = $state("");
  let name = $state("");
  let muscle = $state("");
  let equipment = $state("");
  let instructions = $state("");
  let error = $state("");
  let busy = $state(false);
  async function load() {
    const result = await api<{ system: Exercise[]; custom: Exercise[] }>(
      "/exercises",
    );
    items = [
      ...result.system,
      ...result.custom.map((e) => ({ ...e, custom: true })),
    ];
  }
  $effect(() => {
    load().catch((e) => (error = e.message));
  });
  async function add(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    try {
      await api("/custom-exercises", "POST", {
        name,
        muscle_group: muscle || "Other",
        equipment: equipment || "Other",
        instructions,
      });
      name = "";
      muscle = "";
      equipment = "";
      instructions = "";
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to save";
    } finally {
      busy = false;
    }
  }
  async function archive(id: string) {
    try {
      await api(`/custom-exercises/${id}`, "PATCH", {
        archived_at: new Date().toISOString(),
      });
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to archive";
    }
  }
</script>

<h1>Exercise library</h1>
{#if error}<p class="error" role="alert">{error}</p>{/if}<label
  >Search exercises<input type="search" bind:value={search} /></label
>
<div class="grid" style="margin-top:18px">
  {#each items.filter((e) => e.name
      .toLowerCase()
      .includes(search.toLowerCase())) as e}<article class="card">
      <h2>{e.name}</h2>
      <p class="muted">{e.muscle_group} · {e.equipment}</p>
      <p>{e.instructions}</p>
      {#if e.custom}<span class="badge">Your custom exercise</span><button
          class="secondary"
          onclick={() => archive(e.id)}>Archive</button
        >{/if}
    </article>{/each}
</div>
<section class="card">
  <h2>Add a custom exercise</h2>
  <form onsubmit={add}>
    <label>Name<input required maxlength="100" bind:value={name} /></label>
    <div class="row">
      <label>Muscle group<input maxlength="80" bind:value={muscle} /></label
      ><label>Equipment<input maxlength="80" bind:value={equipment} /></label>
    </div>
    <label
      >Instructions<textarea maxlength="3000" bind:value={instructions}
      ></textarea></label
    ><button disabled={busy}>Add exercise</button>
  </form>
</section>
