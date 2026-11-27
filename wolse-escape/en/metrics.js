(() => {
  'use strict';
  if (window.__wolseMetricsLoaded) return;
  window.__wolseMetricsLoaded = true;
  const endpoint = 'https://wolse-landing-metrics.chununrok-kuc3369.workers.dev/collect';
  const params = new URLSearchParams(location.search);
  const exactPaid = params.get('utm_source') === 'instagram' && params.get('utm_medium') === 'paid_social' && params.get('utm_campaign') === 'wolse_us_uk_20261124' && params.get('utm_content') === 'rank_v3_20261127';
  let source = 'direct';
  if (exactPaid) source = 'instagram_paid_rank_v3';
  else if (['utm_source','utm_medium','utm_campaign','utm_content'].some(key=>params.has(key))) source='other';
  else if (document.referrer) {
    try { const host=new URL(document.referrer).hostname; source=host==='instagram.com'||host.endsWith('.instagram.com') ? 'instagram_organic' : host==='facebook.com'||host.endsWith('.facebook.com') ? 'facebook_organic' : 'other'; } catch { source='other'; }
  }
  // Random for this page only: never placed in cookies or browser storage.
  const page=typeof crypto.randomUUID==='function' ? crypto.randomUUID() : (()=>{
    const bytes=crypto.getRandomValues(new Uint8Array(16)); bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  })();
  const qa=params.get('metrics_test')==='1' || !['play-fold.net'].includes(location.hostname);
  const sent=new Set();
  function send(event,cta) {
    const key=event+':'+(cta||'');
    if (sent.has(key)) return;
    const body=JSON.stringify({v:1,page,source,event,...(cta ? {cta} : {}),qa});
    sent.add(key);
    try {
      if (navigator.sendBeacon?.(endpoint,new Blob([body],{type:'text/plain;charset=UTF-8'}))) return;
      fetch(endpoint,{method:'POST',body,headers:{'Content-Type':'text/plain;charset=UTF-8'},mode:'cors',credentials:'omit',keepalive:true,referrerPolicy:'no-referrer'}).catch(()=>{});
    } catch { }
  }
  function visit() { if (document.visibilityState!=='hidden') send('visit'); }
  visit();
  document.addEventListener('visibilitychange',visit);
  document.querySelectorAll('[data-store-cta]').forEach(link=> {
    link.addEventListener('click',()=>send('store_click',link.dataset.storeCta));
    link.addEventListener('auxclick',event=>{ if (event.button===1) send('store_click',link.dataset.storeCta); });
  });
})();
