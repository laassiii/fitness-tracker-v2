<script lang="ts">
  let status = $state('Your training, in one place.');
</script>

<svelte:head><meta name="description" content="Private fitness tracking with server-backed workout history."></svelte:head>
<main>
  <p class="eyebrow">FITNESS TRACKER</p>
  <h1>Build a stronger routine.</h1>
  <p>{status}</p>
  <section aria-label="Development status"><h2>Application foundation</h2><p>Authentication and workout workflows are being connected to the secure API.</p></section>
</main>
<style>
  :global(body){margin:0;background:#f5f6f3;color:#172c26;font-family:system-ui,sans-serif}main{max-width:960px;margin:auto;padding:clamp(24px,6vw,80px)}.eyebrow{font-size:.8rem;letter-spacing:.15em}h1{font-size:clamp(2.4rem,6vw,4.5rem);max-width:700px;line-height:1.1}section{background:white;border:1px solid #dbe3db;border-radius:16px;padding:24px;margin-top:48px}
</style>
