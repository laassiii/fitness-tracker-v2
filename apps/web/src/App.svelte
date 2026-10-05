<script lang="ts">
  import { onMount } from "svelte";
  import {
    api,
    restore,
    verify,
    signOut,
    ApiError,
    clearSession,
  } from "./lib/api";
  import Auth from "./features/Auth.svelte";
  import ConsentScreen from "./features/Consent.svelte";
  import ProfileScreen from "./features/Profile.svelte";
  import Exercises from "./features/Exercises.svelte";
  import Plans from "./features/Plans.svelte";
  import Workout from "./features/Workout.svelte";
  import History from "./features/History.svelte";
  import ProgressScreen from "./features/Progress.svelte";
  import type {
    Profile,
    Consent,
    Page,
    Session,
    LegalDocument,
  } from "./lib/types";
  import "./lib/styles.css";
  type Screen =
    | "dashboard"
    | "profile"
    | "exercises"
    | "plans"
    | "workout"
    | "history"
    | "progress"
    | "legal";
  let screen = $state<Screen>("dashboard");
  let ready = $state(false);
  let signedIn = $state(false);
  let consent = $state(false);
  let profile = $state<Profile | null>(null);
  let recovery = $state(false);
  let error = $state("");
  let sessionId = $state("");
  let sessions = $state<Session[]>([]);
  let docs = $state<LegalDocument[]>([]);
  let starting = $state(false);
  const starts = new Map<string, string>();
  async function loadDashboard() {
    sessions = (await api<Page<Session>>("/sessions?status=in_progress")).items;
  }
  async function enter() {
    signedIn = true;
    consent = (await api<Consent>("/me/consents")).accepted;
    if (!consent) return;
    try {
      profile = await api<Profile>("/me/profile");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        profile = null;
        screen = "profile";
      } else throw e;
    }
    await loadDashboard();
  }
  onMount(() => {
    void (async () => {
      try {
        const url = new URL(location.href);
        const hash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        if (hash) {
          history.replaceState(null, "", location.pathname);
          await verify(hash, type ?? "email");
          if (type === "recovery") {
            signedIn = true;
            recovery = true;
          } else await enter();
        } else {
          await restore();
          await enter();
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401))
          error = e instanceof Error ? e.message : "Unable to load session";
        clearSession();
        signedIn = false;
      } finally {
        ready = true;
      }
    })();
  });
  async function logout() {
    try {
      await signOut();
      signedIn = false;
      recovery = false;
      profile = null;
      consent = false;
      sessions = [];
      sessionId = "";
      screen = "dashboard";
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Unable to sign out. Please retry.";
    }
  }
  async function start(day?: string) {
    starting = true;
    try {
      const key = day ?? "free";
      const idempotency = starts.get(key) ?? crypto.randomUUID();
      starts.set(key, idempotency);
      const result = await api<{ id: string }>("/sessions", "POST", {
        ...(day ? { day_id: day } : { name: "Freestyle workout" }),
        idempotency_key: idempotency,
      });
      starts.delete(key);
      sessionId = result.id;
      screen = "workout";
      await loadDashboard();
    } finally {
      starting = false;
    }
  }
  async function navigate(next: Screen) {
    screen = next;
    error = "";
    try {
      if (next === "dashboard") await loadDashboard();
      if (next === "legal")
        docs = (await api<{ items: LegalDocument[] }>("/legal")).items;
    } catch (e) {
      error = e instanceof Error ? e.message : "Unable to load";
    }
  }
</script>

<svelte:head
  ><title>Fitness Tracker</title><meta
    name="description"
    content="Private server-backed workout tracking."
  /><meta name="referrer" content="no-referrer" /></svelte:head
>
<header>
  <strong>FITNESS TRACKER</strong
  >{#if signedIn && !recovery && consent && profile}<nav
      aria-label="Main navigation"
    >
      {#each [["dashboard", "Dashboard"], ["exercises", "Exercises"], ["plans", "Plans"], ["history", "History"], ["progress", "Progress"], ["profile", "Profile"], ["legal", "Legal"]] as [key, label]}<button
          class:active={screen === key}
          onclick={() => navigate(key as Screen)}>{label}</button
        >{/each}
    </nav>{/if}{#if signedIn}<button class="secondary" onclick={logout}
      >Sign out</button
    >{/if}
</header>
<main>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if !ready}<p role="status">
      Restoring your session…
    </p>{:else if !signedIn || recovery}<Auth
      {recovery}
      onready={async () => {
        recovery = false;
        await enter();
      }}
    />{:else if !consent}<ConsentScreen
      onaccepted={enter}
    />{:else if !profile || screen === "profile"}<ProfileScreen
      onsaved={async () => {
        profile = await api<Profile>("/me/profile");
        screen = "dashboard";
        await loadDashboard();
      }}
    />{:else if screen === "dashboard"}<h1>
      Ready to train, {profile.display_name}?
    </h1>
    <p class="muted">Your plans, saved sets, and progress stay private.</p>
    <section class="card">
      <h2>Start your next workout</h2>
      <div class="actions">
        <button onclick={() => navigate("plans")}>Choose a workout plan</button
        ><button
          class="secondary"
          disabled={starting}
          onclick={() => start().catch((e) => (error = e.message))}
          >Start freestyle workout</button
        >
      </div>
    </section>
    <section class="card">
      <h2>In-progress workouts</h2>
      {#each sessions as session}<p>
          <button
            class="secondary"
            onclick={() => {
              sessionId = session.id;
              screen = "workout";
            }}>Resume {session.name_snapshot}</button
          >
          · {new Date(session.started_at).toLocaleDateString()}
        </p>{:else}<p>No workout in progress.</p>{/each}
    </section>{:else if screen === "exercises"}<Exercises
    />{:else if screen === "plans"}<Plans
      onstart={start}
    />{:else if screen === "workout"}<Workout
      id={sessionId}
      oncomplete={async () => {
        screen = "history";
        await loadDashboard();
      }}
    />{:else if screen === "history"}<History
      onopen={(id) => {
        sessionId = id;
        screen = "workout";
      }}
    />{:else if screen === "progress"}<ProgressScreen
    />{:else if screen === "legal"}<section class="card">
      <h1>Terms & privacy</h1>
      {#each docs as doc}<details open>
          <summary>{doc.document_type} · {doc.version}</summary>
          <pre class="legal">{doc.content}</pre>
        </details>{/each}
      <p>Only essential authentication cookies are used.</p>
    </section>{/if}
</main>
