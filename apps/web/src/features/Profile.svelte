<script lang="ts">
  import { api, ApiError } from "../lib/api";
  import type { Profile } from "../lib/types";
  let { onsaved }: { onsaved: () => Promise<void> } = $props();
  let handle = $state("");
  let name = $state("");
  let bio = $state("");
  let busy = $state(false);
  let error = $state("");
  let message = $state("");
  $effect(() => {
    api<Profile>("/me/profile")
      .then((p) => {
        handle = p.handle;
        name = p.display_name;
        bio = p.bio;
      })
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 404)) error = e.message;
      });
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    try {
      await api("/me/profile", "PUT", { handle, display_name: name, bio });
      message = "Profile saved.";
      await onsaved();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to save";
    } finally {
      busy = false;
    }
  }
</script>

<section class="card">
  <h1>Your profile</h1>
  <p class="muted">Your profile and fitness data are private.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}{#if message}<p
      class="notice"
    >
      {message}
    </p>{/if}
  <form onsubmit={save}>
    <label
      >Handle<input
        bind:value={handle}
        pattern={"[a-z0-9_]{3,30}"}
        minlength="3"
        maxlength="30"
        required
        autocomplete="username"
      /><small>3–30 lowercase letters, numbers or underscores.</small></label
    ><label
      >Display name<input
        bind:value={name}
        required
        maxlength="80"
        autocomplete="name"
      /></label
    ><label>Bio<textarea bind:value={bio} maxlength="500"></textarea></label
    ><button disabled={busy}>Save profile</button>
  </form>
</section>
