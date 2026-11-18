// Local browser integration tests: external requests are intercepted.
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chrome node tests/tracking.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const target = 'https://trk.viewapproval.com/cf/click/1';
const server = http.createServer((req,res)=>{
  let file = path.join(root,new URL(req.url,'http://localhost').pathname);
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try{
    for(const failTag of [false,true]) for(const label of ['YES','NO']){
      const context=await browser.newContext();
      // Fresh visitors get PageView automatically; each CTA click sends one Lead.
      let metaRequests=0,tagRequest,clicks=0,tagSeen;
      const tagReady=new Promise(resolve=>{tagSeen=resolve;});
      await context.route(/https:\/\/.*facebook\.(net|com)\//,r=>{metaRequests++;return r.fulfill({contentType:'application/javascript',body:'/* Meta stub: events remain in queue for assertions. */'});});
      await context.route('https://trk.viewapproval.com/cf/tags/**',r=>{
        tagRequest=new URL(r.request().url());tagSeen();
        if(failTag)return r.abort();
        // Model the remote tag's link setter without creating real campaign traffic.
        return r.fulfill({contentType:'application/javascript',body:`Object.defineProperty(window.clickflare,'l',{configurable:true,set(url){window.testClickflareHandled=url;}});`});
      });
      await context.route(target,r=>{clicks++;return r.fulfill({contentType:'text/html',body:'Mock offer destination'});});
      const page=await context.newPage();
      await page.goto(base+'/getoffer/?cftmid=test-container&cpid=test-campaign&lptoken=123456&cep=Opaque%2BVisit%2FToken%3D');
      await tagReady;
      assert.equal(tagRequest.pathname,'/cf/tags/test-container');
      assert.equal(tagRequest.searchParams.get('cpid'),'test-campaign');
      const link=page.getByRole('link',{name:label,exact:true});
      if(failTag){
        await page.waitForFunction(()=>document.querySelector('[data-lead-choice]').getAttribute('href')==='https://trk.viewapproval.com/cf/click/1');
        await link.click();await page.waitForURL(target);assert.equal(clicks,1);
      }else{
        await page.waitForFunction(()=>!!Object.getOwnPropertyDescriptor(window.clickflare,'l'));
        assert((await link.getAttribute('href')).startsWith('javascript:window.clickflare.l='));
        await link.click();
        await page.waitForFunction(()=>window.testClickflareHandled==='https://trk.viewapproval.com/cf/click/1');
        assert.equal(await page.evaluate(()=>window.testClickflareHandled),target);
        assert.equal(clicks,0,'Must use vendor setter, not direct navigation');
        assert.equal(await page.evaluate(()=>typeof window.fbq),'function');
        const events=await page.evaluate(()=>fbq.queue.filter(e=>e[0]==='trackSingle').map(e=>Array.from(e)));
        assert.deepEqual(events,[['trackSingle','2214758409422215','PageView'],['trackSingle','2214758409422215','Lead']]);
        await page.evaluate(()=>{window.testClickflareHandled=null;document.querySelector('[data-lead-choice]').click();});
        assert.equal(await page.evaluate(()=>window.testClickflareHandled),null,'Duplicate click blocked');
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));
        assert.equal(await link.getAttribute('aria-disabled'),null);
      }
      assert.equal(metaRequests,1);
      await context.close();
    }
    for (const mode of ['unanswered','rejected','gpc','sensitive-url']) {
      const c=await browser.newContext();let meta=0;
      if(mode!=='unanswered') await c.addInitScript(value=>localStorage.setItem('autoquote-ad-consent-v1',JSON.stringify({value,at:Date.now()})),mode==='rejected'?'rejected':'accepted');
      if(mode==='gpc') await c.addInitScript(()=>Object.defineProperty(navigator,'globalPrivacyControl',{value:true}));
      await c.route(/https:\/\/.*facebook\.(net|com)\//,r=>{meta++;return r.abort();});
      await c.route('https://trk.viewapproval.com/**',r=>r.abort());
      const p=await c.newPage();await p.goto(base+'/getoffer/'+(mode==='sensitive-url'?'?email=private@example.com':''));
      // Only browser privacy signals (GPC/DNT) block Meta; URL parameters never do.
      const expected=mode!=='gpc';
      assert.equal(await p.evaluate(()=>typeof fbq),expected?'function':'undefined');
      if(expected){
        await p.waitForFunction(()=>!!window.fbq);
        const events=await p.evaluate(()=>fbq.queue.filter(e=>e[0]==='trackSingle').map(e=>Array.from(e)));
        assert.deepEqual(events,[['trackSingle','2214758409422215','PageView']]);
      }else assert.equal(meta,0);
      assert.equal(await p.locator('#privacy-banner,[data-privacy-settings]').count(),0);
      await c.close();
    }
    const context=await browser.newContext();
    await context.route(/https:\/\/.*facebook\.(net|com)\//,r=>r.abort());
    await context.route('https://trk.viewapproval.com/**',r=>r.abort());
    const page=await context.newPage();
    for(const width of [390,1440]){
      await page.setViewportSize({width,height:900});
      for(const file of ['/getoffer/','/quote/','/getyours/','/test/','/privacy-policy.html','/terms.html']){
        await page.goto(base+file);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      }
    }
    // /quote/: same ClickFlare + Meta behavior as /getoffer/, across its CTA types.
    const quoteTarget='https://trk.viewapproval.com/cf/click/1';
    for(const failTag of [false,true]) for(const sel of ['.option >> nth=0','.option >> nth=2','.q-card .cta-main','.band .cta-main']){
      const q=await browser.newContext();
      let qMeta=0,qTag,qClicks=0,qSeen;const qReady=new Promise(r=>{qSeen=r;});
      await q.route(/https:\/\/.*facebook\.(net|com)\//,r=>{qMeta++;return r.fulfill({contentType:'application/javascript',body:'/* stub */'});});
      await q.route('https://trk.viewapproval.com/cf/tags/**',r=>{
        qTag=new URL(r.request().url());qSeen();
        if(failTag)return r.abort();
        return r.fulfill({contentType:'application/javascript',body:`Object.defineProperty(window.clickflare,'l',{configurable:true,set(url){window.testClickflareHandled=url;}});`});
      });
      await q.route(quoteTarget,r=>{qClicks++;return r.fulfill({contentType:'text/html',body:'Mock offer destination'});});
      const qp=await q.newPage();
      await qp.goto(base+'/quote/?cftmid=test-container&cpid=test-campaign');
      assert.equal(await qp.evaluate(()=>window.QUOTE_PAGE_CONFIG.ctaUrl),quoteTarget);
      assert.equal(await qp.evaluate(()=>window.QUOTE_PAGE_CONFIG.metaPixelId),'2214758409422215');
      await qReady;
      assert.equal(qTag.pathname,'/cf/tags/test-container');
      assert.equal(qTag.searchParams.get('cpid'),'test-campaign');
      const cta=qp.locator(sel);
      if(failTag){
        await qp.waitForFunction(u=>[...document.querySelectorAll('[data-cta]')].every(a=>a.getAttribute('href')===u),quoteTarget);
        await cta.click();await qp.waitForURL(quoteTarget);assert.equal(qClicks,1);
      }else{
        await qp.waitForFunction(()=>!!Object.getOwnPropertyDescriptor(window.clickflare,'l'));
        const hrefs=await qp.locator('[data-cta]').evaluateAll(els=>els.map(e=>e.getAttribute('href')));
        assert(hrefs.every(h=>h.startsWith('javascript:window.clickflare.l=')),'all quote CTAs rewritten by ClickFlare');
        await cta.click();
        await qp.waitForFunction(u=>window.testClickflareHandled===u,quoteTarget);
        assert.equal(qClicks,0,'Must use vendor setter, not direct navigation');
        const qev=await qp.evaluate(()=>fbq.queue.filter(e=>e[0]==='trackSingle').map(e=>Array.from(e)));
        assert.deepEqual(qev,[['trackSingle','2214758409422215','PageView'],['trackSingle','2214758409422215','Lead']]);
        await qp.evaluate(()=>{window.testClickflareHandled=null;document.querySelector('.band .cta-main').click();});
        assert.equal(await qp.evaluate(()=>window.testClickflareHandled),null,'Duplicate click blocked');
        assert.equal(await qp.evaluate(()=>fbq.queue.filter(e=>e[2]==='Lead').length),1,'One Lead only');
        await qp.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));
        assert.equal(await cta.getAttribute('aria-disabled'),null);
      }
      assert.equal(qMeta,1);
      await q.close();
    }
    // /getyours/: ClickFlare CTAs (button, banner, headline) with PageView + one Lead.
    for(const failTag of [false,true]) for(const sel of ['.cta-btn','.header-banner h1','.hero-headline']){
      const g=await browser.newContext();let gMeta=0,gClicks=0,gTag,gSeen;const gReady=new Promise(r=>{gSeen=r;});
      const gUrl='https://trk.viewapproval.com/cf/click/1';
      await g.route(/https:\/\/.*facebook\.(net|com)\//,r=>{gMeta++;return r.fulfill({contentType:'application/javascript',body:'/* stub */'});});
      await g.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
      await g.route('https://trk.viewapproval.com/cf/tags/**',r=>{gTag=new URL(r.request().url());gSeen();
        if(failTag)return r.abort();
        return r.fulfill({contentType:'application/javascript',body:`Object.defineProperty(window.clickflare,'l',{configurable:true,set(url){window.testClickflareHandled=url;}});`});});
      await g.route(gUrl,r=>{gClicks++;return r.fulfill({contentType:'text/html',body:'Mock offer destination'});});
      const gp=await g.newPage();await gp.goto(base+'/getyours/?cftmid=test-container&cpid=test-campaign');
      assert.equal(await gp.evaluate(()=>window.GETYOURS_PAGE_CONFIG.ctaUrl),gUrl);
      await gReady;assert.equal(gTag.pathname,'/cf/tags/test-container');assert.equal(gTag.searchParams.get('cpid'),'test-campaign');
      const el=gp.locator(sel);
      if(failTag){
        await gp.waitForFunction(u=>[...document.querySelectorAll('a[data-cta]')].every(a=>a.getAttribute('href')===u),gUrl);
        await el.click();await gp.waitForURL(gUrl);assert.equal(gClicks,1);
      }else{
        await gp.waitForFunction(()=>!!Object.getOwnPropertyDescriptor(window.clickflare,'l'));
        const hrefs=await gp.locator('a[data-cta]').evaluateAll(els=>els.map(e=>e.getAttribute('href')));
        assert(hrefs.length===5&&hrefs.every(h=>h.startsWith('javascript:window.clickflare.l=')),'all getyours CTAs rewritten');
        await el.click();await gp.waitForFunction(u=>window.testClickflareHandled===u,gUrl);assert.equal(gClicks,0);
        const gev=await gp.evaluate(()=>fbq.queue.filter(e=>e[0]==='trackSingle').map(e=>Array.from(e)));
        assert.deepEqual(gev,[['trackSingle','2214758409422215','PageView'],['trackSingle','2214758409422215','Lead']]);
        await gp.evaluate(()=>{window.testClickflareHandled=null;document.querySelector('.cta-btn').click();});
        assert.equal(await gp.evaluate(()=>window.testClickflareHandled),null,'Duplicate click blocked');
      }
      assert.equal(gMeta,1);
      await g.close();
    }
    // /test/: ClickFlare only, no Meta.
    for(const failTag of [false,true]){
      const t=await browser.newContext();let tMeta=0,tClicks=0,tTag,tSeen;const tReady=new Promise(r=>{tSeen=r;});
      const tUrl='https://trk.viewapproval.com/cf/click/1';
      await t.route(/https:\/\/.*facebook\.(net|com)\//,r=>{tMeta++;return r.abort();});
      await t.route('https://trk.viewapproval.com/cf/tags/**',r=>{tTag=new URL(r.request().url());tSeen();
        if(failTag)return r.abort();
        return r.fulfill({contentType:'application/javascript',body:`Object.defineProperty(window.clickflare,'l',{configurable:true,set(url){window.testClickflareHandled=url;}});`});});
      await t.route(tUrl,r=>{tClicks++;return r.fulfill({contentType:'text/html',body:'Mock offer destination'});});
      const tp=await t.newPage();await tp.goto(base+'/test/?cftmid=test-container&cpid=test-campaign');
      await tReady;assert.equal(tTag.pathname,'/cf/tags/test-container');assert.equal(tTag.searchParams.get('cpid'),'test-campaign');
      assert.equal(await tp.evaluate(()=>typeof window.fbq),'undefined','no Meta on /test/');
      const btn=tp.locator('.cta-btn');
      if(failTag){
        await tp.waitForFunction(u=>document.querySelector('.cta-btn').getAttribute('href')===u,tUrl);
        await btn.click();await tp.waitForURL(tUrl);assert.equal(tClicks,1);
      }else{
        await tp.waitForFunction(()=>!!Object.getOwnPropertyDescriptor(window.clickflare,'l'));
        assert((await btn.getAttribute('href')).startsWith('javascript:window.clickflare.l='));
        await btn.click();await tp.waitForFunction(u=>window.testClickflareHandled===u,tUrl);assert.equal(tClicks,0);
      }
      assert.equal(tMeta,0,'no Meta requests on /test/');
      await t.close();
    }
    // Policy pages: return links go back to the referring lander (with its params).
    {
      const r=await browser.newContext();
      await r.route(/^https?:\/\/(?!127\.0\.0\.1)/,x=>x.abort());
      const rp=await r.newPage();
      for(const lander of ['/quote/?cpid=abc&cftmid=xyz','/getyours/?cpid=abc','/test/','/getoffer/?cpid=abc']){
        for(const policy of ['Privacy Policy',/^Terms/]){
          await rp.goto(base+lander);
          await rp.locator('footer').getByRole('link',{name:policy}).click();await rp.waitForLoadState();
          assert.equal(await rp.locator('.back-link').getAttribute('href'),base+lander);
          await rp.locator('.back-link').click();await rp.waitForURL(base+lander);
        }
      }
      // lander -> privacy -> terms -> "Return to insurance options" still returns to the lander
      await rp.goto(base+'/quote/?cpid=abc');
      await rp.locator('footer').getByRole('link',{name:'Privacy Policy'}).click();await rp.waitForLoadState();
      await rp.locator('.legal-footer').getByRole('link',{name:'Terms of Use'}).click();await rp.waitForLoadState();
      assert.equal(await rp.locator('.return-link').getAttribute('href'),base+'/quote/?cpid=abc');
      await rp.locator('.return-link').click();await rp.waitForURL(base+'/quote/?cpid=abc');
      await r.close();
      // direct visit in a fresh session falls back to getoffer/
      const r2=await browser.newContext();const rp2=await r2.newPage();
      await rp2.goto(base+'/terms.html');
      assert.equal(await rp2.locator('.back-link').getAttribute('href'),'getoffer/');
      await r2.close();
    }
    await page.goto(base+'/');assert.equal((await page.locator('body').innerText()).trim(),'Happy World!');assert.equal(await page.locator('script').count(),0);
    await context.close();
    console.log('PASS: both ClickFlare-managed CTAs, tag failure fallback, campaign parameters, duplicate guard, back navigation reset, automatic PageView plus one Lead per CTA click without popup, responsive layouts, /quote/ ClickFlare CTAs (all types, fallback, Lead, duplicate guard), /getyours/ ClickFlare CTAs with Lead, /test/ ClickFlare-only CTA, policy return links, and root page.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
