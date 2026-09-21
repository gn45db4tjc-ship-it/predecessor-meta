// One ordinary anonymous public-page navigation; no API calls, login, retries or stealth.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome'});
 const result={url:'https://pred.gg/heroes',responses:[],blocked:false};
 try{
  const context=await browser.newContext();const page=await context.newPage();const pending=[];
  page.on('response',response=>{
   if(new URL(response.url()).hostname!=='pred.gg')return;
   const task=(async()=>{
    const status=response.status(),pathname=new URL(response.url()).pathname;
    if([401,403,429].includes(status)){result.blocked=true;result.block={status,path:pathname};await page.close();return;}
    if(!(response.headers()['content-type']||'').includes('json'))return;
    try{const value=await response.json();const data=value?.data;
     if(!data||typeof data!=='object')return;
     const keys=Object.keys(data).filter(k=>['NewestVersion','versions','ratings','heroes','hero','items','eternalCategories'].includes(k));
     if(keys.length)result.responses.push({path:pathname,status,keys,hero_rows:Array.isArray(data.heroes)?data.heroes.length:null});
    }catch{}
   })();pending.push(task);
  });
  try{
   const response=await page.goto(result.url,{waitUntil:'domcontentloaded',timeout:30000});result.document_status=response.status();
   await page.waitForTimeout(15000);
   const html=await page.content();result.document_characters=html.length;result.embedded_responses=(html.match(/data-sveltekit-fetched/g)||[]).length;
   result.title=await page.title();result.headings=await page.locator('h1').allTextContents();
   result.challenge=await page.locator('body').innerText().then(t=>/verify you are human|access denied|enable javascript and cookies/i.test(t));
  }catch(e){result.error=result.blocked?'Stopped on source access denial':e.name;}
  await Promise.allSettled(pending);await context.close();
 }finally{await browser.close();}
 console.log('PRED_PUBLIC_BROWSER_RESULT '+JSON.stringify(result));
})().catch(e=>{console.error(e.name);process.exitCode=1;});
