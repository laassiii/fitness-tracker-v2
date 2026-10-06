import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {chromium} from '@playwright/test';
const ref='iewlobsbtwovcgpalgva';
if(process.env.PRODUCTION_VALIDATION_REF!==ref)throw Error('Explicit production opt-in required');
const db=`https://${ref}.supabase.co`,origin='https://fitness-tracker-prod.pages.dev';
const keys=JSON.parse(execFileSync('cmd.exe',['/c',`npx supabase projects api-keys --project-ref ${ref} --reveal --output json`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='service_role').api_key;
const email='refresh-validation-'+randomUUID()+'@example.invalid',password=randomUUID()+randomUUID();
const adminHeaders={apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'};
let identity,browser;const evidence={statuses:[],provider_limits_unchanged:true,automatic_retry_requests:null};
try {
 const created=await fetch(db+'/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email,password,email_confirm:true})});
 if(!created.ok)throw Error('Disposable Auth setup failed');identity=(await created.json()).id;
 browser=await chromium.launch({headless:true,executablePath:process.env.PW_BROWSER_EXECUTABLE});
 const context=await browser.newContext();const page=await context.newPage();await page.goto(origin);
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('heading',{name:'Terms & privacy'}).waitFor();
 // Bounded intentional stress test. Stop immediately at 429; never retry it.
 let limited=false;
 for(let i=0;i<35;i++){
   const response=await context.request.post(origin+'/api/v1/auth/refresh',{headers:{Origin:origin,'Content-Type':'application/json'},data:{}});
   evidence.statuses.push(response.status());
   if(response.status()===429){limited=true;evidence.retry_after=response.headers()['retry-after'];break;}
   if(response.status()!==200)throw Error('Unexpected refresh status '+response.status());
 }
 evidence.real_provider_429=limited?'PASS':'UNTESTED within bounded 35 requests';
 if(limited){
   let requests=0;page.on('request',r=>{if(r.url().endsWith('/api/v1/auth/refresh'))requests++;});
   await page.reload();await page.getByRole('heading',{name:'Welcome back'}).waitFor({timeout:15000});
   evidence.user_message=await page.getByRole('alert').allTextContents();
   await page.waitForTimeout(10000);evidence.automatic_retry_requests=requests;
   if(requests!==1)throw Error('Unexpected repeated refresh after reload');
 }
} finally {
 await browser?.close();
 if(identity){const deleted=await fetch(db+'/auth/v1/admin/users/'+identity,{method:'DELETE',headers:adminHeaders});if(!deleted.ok)throw Error('Disposable Auth cleanup failed');}
 evidence.cleanup='disposable identity deleted';mkdirSync('performance-results',{recursive:true});
 writeFileSync('performance-results/refresh-rate-limit.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}
