import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
test.describe.configure({ mode: "serial" });
test.skip(process.env.PRODUCTION_VALIDATION_REF !== 'iewlobsbtwovcgpalgva', 'Explicit production opt-in required');
let page: Page;
let context: BrowserContext;
let local: { API_URL: string; SECRET_KEY: string };
const email = `browser-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();

test.beforeAll(async ({browser})=>{
 if(process.env.PRODUCTION_VALIDATION_REF!=='iewlobsbtwovcgpalgva')throw Error('Production opt-in required');
 const keys=JSON.parse(execFileSync('cmd.exe',['/c','npx supabase projects api-keys --project-ref iewlobsbtwovcgpalgva --reveal --output json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 local={API_URL:'https://iewlobsbtwovcgpalgva.supabase.co',SECRET_KEY:keys.find((k:{name:string})=>k.name==='service_role').api_key};
 const created=await fetch(local.API_URL+'/auth/v1/admin/users',{method:'POST',headers:{apikey:local.SECRET_KEY,Authorization:'Bearer '+local.SECRET_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true})});
 if(!created.ok)throw Error('Disposable browser identity setup failed');
 context=await browser.newContext({baseURL:'https://fitness-tracker-prod.pages.dev',viewport:{width:1280,height:900}});page=await context.newPage();
});
test.afterAll(async()=>{
 if(local){const r=await fetch(local.API_URL+'/auth/v1/admin/users?per_page=1000',{headers:{apikey:local.SECRET_KEY,Authorization:'Bearer '+local.SECRET_KEY}});const list=await r.json();const user=list.users?.find((u:{email:string})=>u.email===email);if(user){const deleted=await fetch(local.API_URL+'/auth/v1/admin/users/'+user.id,{method:'DELETE',headers:{apikey:local.SECRET_KEY,Authorization:'Bearer '+local.SECRET_KEY}});if(!deleted.ok)throw Error('Disposable identity cleanup failed');}}
 await context?.close();
});
test('real production signin, consent and profile onboarding',async()=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Terms & privacy'})).toBeVisible();await expect(page.getByRole('checkbox')).not.toBeChecked();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Accept and continue'}).click();
 await expect(page.getByRole('heading',{name:'Your profile'})).toBeVisible();await page.getByLabel('Handle').fill('browser_'+randomUUID().slice(0,8));await page.getByLabel('Display name').fill('Browser Test');await page.getByLabel('Bio').fill('<script>untrusted text</script>');await page.getByRole('button',{name:'Save profile'}).click();await expect(page.getByRole('heading',{name:'Ready to train, Browser Test?'})).toBeVisible();
});
test("session restoration and custom exercise workflow", async () => {
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ready to train, Browser Test?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exercises", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Exercise library" }),
  ).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Browser Custom Row");
  await page.getByLabel("Muscle group").fill("Back");
  await page.getByLabel("Equipment").fill("Dumbbell");
  await page.getByRole("button", { name: "Add exercise", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Custom Row" }),
  ).toBeVisible();
});
test("plan creation, day/exercise/targets and workout execution", async () => {
  await page.getByRole("button", { name: "Plans", exact: true }).click();
  await page.getByLabel("Plan name").fill("Browser Plan");
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await page.getByLabel("New workout day").fill("Browser Push");
  await page.getByRole("button", { name: "Add day", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Add exercise", exact: true })
    .selectOption({ label: "Bench Press" });
  await page.getByRole("button", { name: "Add to day" }).click();
  await page.getByLabel("Target sets").fill("2");
  await page.getByRole("button", { name: "Save targets" }).click();
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser Push" }),
  ).toBeVisible();
  await page.getByLabel("Weight (kg)", { exact: true }).fill("80");
  await page.getByLabel("Reps", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Log set for Bench Press" }).click();
  await expect(page.getByRole("cell", { name: "80 kg" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume Browser Push" }).click();
  await expect(page.getByRole("cell", { name: "80 kg" })).toBeVisible();
  await page.getByRole("button", { name: "Complete workout" }).click();
  await expect(
    page.getByRole("heading", { name: "Workout history" }),
  ).toBeVisible();
});
test("historical integrity, progress and optional metrics", async () => {
  await page.getByRole("button", { name: "Plans", exact: true }).click();
  await page.getByRole("button", { name: "Browser Plan", exact: true }).click();
  await page.getByLabel("Workout day", { exact: true }).fill("Edited day");
  await page.getByRole("button", { name: "Save day name" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "View workout" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Push" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete workout" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Personal records" }),
  ).toBeVisible();
  await expect(page.getByText(/heaviest set 80 kg/)).toBeVisible();
  await page.getByLabel("Bodyweight (kg)").fill("75");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await expect(
    page.getByRole("button", { name: "Edit measurement" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit measurement" }).click();
  await page.getByLabel("Bodyweight (kg)").fill("76");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await expect(page.getByText(/76 kg/)).toBeVisible();
  await page.screenshot({
    path: "test-results/production-progress-desktop.png",
    fullPage: true,
  });
});
test("safe rendering, mobile usability and no browser data database", async () => {
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Bio")).toHaveValue(
    "<script>untrusted text</script>",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  const cookie = (await context.cookies()).find(c => c.name === '__Host-fitness-refresh');
  expect(cookie).toMatchObject({httpOnly:true,secure:true,sameSite:'Lax',path:'/'});
  await page.screenshot({
    path: "test-results/production-profile-mobile.png",
    fullPage: true,
  });
});

test('a separate browser context sees the same server-side workout and metrics',async({browser})=>{
  const other=await browser.newContext({baseURL:'https://fitness-tracker-prod.pages.dev'});
  try {
    const p=await other.newPage();await p.goto('/');
    await p.getByLabel('Email',{exact:true}).fill(email);await p.getByLabel('Password',{exact:true}).fill(password);
    await p.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(p.getByRole('heading',{name:'Ready to train, Browser Test?'})).toBeVisible();
    await p.getByRole('button',{name:'History',exact:true}).click();
    await p.getByRole('button',{name:'View workout'}).click();
    await expect(p.getByRole('heading',{name:'Browser Push'})).toBeVisible();
    await expect(p.getByRole('cell',{name:'80 kg'})).toBeVisible();
    await p.getByRole('button',{name:'Progress',exact:true}).click();await expect(p.getByText(/76 kg/)).toBeVisible();
    await p.getByRole('button',{name:'Sign out',exact:true}).click();
  } finally {await other.close();}
});
test("signout clears restoration and signin works again", async () => {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready to train, Browser Test?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
});
