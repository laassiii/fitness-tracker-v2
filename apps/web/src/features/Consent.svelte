<script lang="ts">
  import { api } from "../lib/api";
  import type { Consent } from "../lib/types";
  let { onaccepted }: { onaccepted: () => Promise<void> } = $props();
  let consentData = $state<Consent | null>(null);
  let accepted = $state(false);
  let busy = $state(false);
  let error = $state("");
  $effect(() => {
    api<Consent>("/me/consents")
      .then((r) => (consentData = r))
      .catch((e) => (error = e.message));
  });
  async function save() {
    busy = true;
    error = "";
    try {
      if (!accepted || !consentData) return;
      await api("/me/consents", "POST", {
        accepted: true,
        versions: Object.fromEntries(
          consentData.documents.map((d) => [d.document_type, d.version]),
        ),
      });
      await onaccepted();
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to record acceptance";
    } finally {
      busy = false;
    }
  }
</script>

<section class="card">
  <h1>Terms & privacy</h1>
  <p>
    Review the current versions before continuing. These documents are templates
    requiring review before public launch.
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if consentData}{#each consentData.documents as doc}<details open>
        <summary>{doc.document_type} · {doc.version}</summary>
        <pre class="legal">{doc.content}</pre>
      </details>{/each}
    <label class="check"
      ><input type="checkbox" bind:checked={accepted} />I accept both current
      document versions.</label
    ><button disabled={!accepted || busy} onclick={save}
      >Accept and continue</button
    >{/if}
</section>
