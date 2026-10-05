<script lang="ts">
  import { api } from "../lib/api";
  import type { Session, Page } from "../lib/types";
  let { onopen }: { onopen: (id: string) => void } = $props();
  let items = $state<Session[]>([]);
  let cursor = $state<string | null>(null);
  let error = $state("");
  let busy = $state(false);
  let loaded = $state(false);
  async function load(more = false) {
    busy = true;
    error = "";
    try {
      const page = await api<Page<Session>>(
        `/history${more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      items = more ? [...items, ...page.items] : page.items;
      cursor = page.next_cursor;
      loaded = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to load history";
    } finally {
      busy = false;
    }
  }
  $effect(() => {
    load();
  });
</script>

<h1>Workout history</h1>
{#if error}<p class="error" role="alert">
    {error}
  </p>{/if}{#if loaded && !items.length}<p class="card">
    Your completed workouts will appear here.
  </p>{/if}
{#each items as session}<article class="card">
    <h2>{session.name_snapshot}</h2>
    <p>{new Date(session.started_at).toLocaleString()}</p>
    <button class="secondary" onclick={() => onopen(session.id)}
      >View workout</button
    >
  </article>{/each}{#if cursor}<button
    disabled={busy}
    onclick={() => load(true)}>Load more workouts</button
  >{/if}
