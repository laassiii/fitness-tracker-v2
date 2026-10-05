<script lang="ts">
  import {
    api,
    signIn,
    signUp,
    recover,
    changePassword,
    signOut,
  } from "../lib/api";
  import type { LegalDocument } from "../lib/types";
  let {
    onready,
    recovery = false,
  }: { onready: () => Promise<void>; recovery?: boolean } = $props();
  let mode = $state<"login" | "signup" | "recover">("login");
  let email = $state("");
  let password = $state("");
  let accepted = $state(false);
  let busy = $state(false);
  let error = $state("");
  let message = $state("");
  let docs = $state<LegalDocument[]>([]);
  $effect(() => {
    api<{ items: LegalDocument[] }>("/legal")
      .then((r) => (docs = r.items))
      .catch((e) => (error = e.message));
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    message = "";
    try {
      if (recovery) {
        await changePassword(password);
        await signOut();
        message = "Password updated. Sign in with your new password.";
        recovery = false;
        mode = "login";
        password = "";
      } else if (mode === "login") {
        await signIn(email, password);
        password = "";
        await onready();
      } else if (mode === "recover") {
        message = (await recover(email)).message;
      } else {
        if (!accepted || docs.length !== 2)
          throw new Error("Read and accept the Terms and Privacy Policy.");
        const versions = Object.fromEntries(
          docs.map((d) => [d.document_type, d.version]),
        ) as { terms: string; privacy: string };
        const result = await signUp(email, password, versions);
        password = "";
        if (result.verification_required) {
          message =
            "Check your email and follow the verification link, then sign in.";
        } else {
          await onready();
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to continue";
    } finally {
      busy = false;
    }
  }
</script>

<section class="card auth">
  <p class="eyebrow">YOUR PRIVATE TRAINING LOG</p>
  <h1>
    {recovery
      ? "Choose a new password"
      : mode === "signup"
        ? "Create your account"
        : mode === "recover"
          ? "Recover your account"
          : "Welcome back"}
  </h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}{#if message}<p
      class="notice"
      role="status"
    >
      {message}
    </p>{/if}
  <form onsubmit={submit}>
    {#if !recovery}<label
        >Email<input
          type="email"
          autocomplete="email"
          required
          bind:value={email}
        /></label
      >{/if}
    {#if recovery || mode !== "recover"}<label
        >Password<input
          type="password"
          autocomplete={mode === "login" && !recovery
            ? "current-password"
            : "new-password"}
          minlength={mode === "signup" || recovery ? 12 : 1}
          required
          bind:value={password}
        /></label
      >{/if}
    {#if mode === "signup" && !recovery}
      {#each docs as doc}<details>
          <summary
            >{doc.document_type === "terms"
              ? "Terms of Service"
              : "Privacy Policy"} · {doc.version}</summary
          >
          <pre class="legal">{doc.content}</pre>
        </details>{/each}
      <label class="check"
        ><input type="checkbox" required bind:checked={accepted} />I have read
        and accept the current Terms and Privacy Policy.</label
      >
    {/if}
    <button disabled={busy || (mode === "signup" && docs.length !== 2)}
      >{busy
        ? "Please wait…"
        : recovery
          ? "Update password"
          : mode === "signup"
            ? "Create account"
            : mode === "recover"
              ? "Send recovery email"
              : "Sign in"}</button
    >
  </form>
  {#if !recovery}<div class="actions" style="margin-top:18px">
      <button
        class="secondary"
        onclick={() => {
          mode = mode === "signup" ? "login" : "signup";
          message = "";
          error = "";
          accepted = false;
        }}>{mode === "signup" ? "Sign in instead" : "Create account"}</button
      ><button
        class="secondary"
        onclick={() => {
          mode = mode === "recover" ? "login" : "recover";
          message = "";
          error = "";
        }}>{mode === "recover" ? "Back to sign in" : "Forgot password?"}</button
      >
    </div>{/if}
  <p class="muted">
    Your fitness records stay on the server. No optional tracking cookies.
  </p>
</section>
