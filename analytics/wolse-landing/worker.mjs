import { DurableObject } from 'cloudflare:workers';

const ORIGIN = 'https://play-fold.net';
const SOURCES = new Set(['instagram_paid_rank_v3', 'instagram_organic', 'facebook_organic', 'direct', 'other']);
const CTAS = new Set(['hero_us', 'hero_gb', 'bottom_us', 'bottom_gb']);
const MAX_BYTES = 512;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function authorized(request, secret) {
  const received = request.headers.get('Authorization') || '';
  const expected = `Bearer ${secret || ''}`;
  if (!secret || received.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return difference === 0;
}
export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['v','page','source','event','cta','qa'].includes(key))) return null;
  if (input.v !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.page) || !SOURCES.has(input.source) || typeof input.qa !== 'boolean') return null;
  if (input.event === 'visit' && input.cta === undefined) return input;
  if (input.event === 'store_click' && CTAS.has(input.cta)) return input;
  return null;
}
function reportRange(url) {
  const today = new Date().toISOString().slice(0,10);
  const from = url.searchParams.get('from') || new Date(Date.now() - 6*86400000).toISOString().slice(0,10);
  const to = url.searchParams.get('to') || today;
  if (![from,to].every(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v)) return null;
  const span = (Date.parse(to) - Date.parse(from))/86400000;
  if (span < 0 || span > 30 || to > today) return null;
  return {from,to,qa: url.searchParams.get('qa') === '1' ? 1 : 0};
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ok:true,version:'wolse-metrics-v1'});
    if (url.pathname === '/report' && request.method === 'GET') {
      if (!authorized(request, env.REPORT_TOKEN)) return json({error:'unauthorized'},401);
      const range = reportRange(url);
      if (!range) return json({error:'invalid_range'},400);
      return json(await env.METRICS.getByName('wolse-en-v1').report(range));
    }
    if (url.pathname !== '/collect') return json({error:'not_found'},404);
    if (request.headers.get('Origin') !== ORIGIN) return json({error:'origin'},403);
    const cors = {'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store'};
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'}});
    if (request.method !== 'POST') return new Response(null,{status:405,headers:cors});
    const declared = request.headers.get('Content-Length');
    if (declared && Number(declared) > MAX_BYTES) return new Response(null,{status:413,headers:cors});
    const reader = request.body?.getReader();
    if (!reader) return new Response(null,{status:400,headers:cors});
    const chunks = []; let length = 0;
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return new Response(null,{status:413,headers:cors}); }
      chunks.push(value);
    }
    let input;
    try { const bytes = new Uint8Array(length); let offset=0; for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; } input=validateEvent(JSON.parse(new TextDecoder().decode(bytes))); } catch { }
    if (!input) return new Response(null,{status:400,headers:cors});
    try {
      const accepted = await env.METRICS.getByName('wolse-en-v1').record(input);
      return new Response(null,{status:accepted ? 204 : 429,headers:cors});
    } catch { return new Response(null,{status:503,headers:cors}); }
  }
};

export class LandingMetrics extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql=ctx.storage.sql;
    this.window=0; this.requests=0; this.cleanedDay='';
    this.sql.exec(`CREATE TABLE IF NOT EXISTS page_events(day TEXT NOT NULL, qa INTEGER NOT NULL, page TEXT NOT NULL, source TEXT NOT NULL, clicked INTEGER NOT NULL DEFAULT 0, hero_us INTEGER NOT NULL DEFAULT 0, hero_gb INTEGER NOT NULL DEFAULT 0, bottom_us INTEGER NOT NULL DEFAULT 0, bottom_gb INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,qa,page))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS daily(day TEXT NOT NULL, qa INTEGER NOT NULL, source TEXT NOT NULL, visits INTEGER NOT NULL DEFAULT 0, clicked_visits INTEGER NOT NULL DEFAULT 0, hero_us INTEGER NOT NULL DEFAULT 0, hero_gb INTEGER NOT NULL DEFAULT 0, bottom_us INTEGER NOT NULL DEFAULT 0, bottom_gb INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,qa,source))`);
  }
  async record(input) {
    const minute = Math.floor(Date.now()/60000);
    if (minute !== this.window) { this.window=minute; this.requests=0; }
    if (++this.requests > 300) return false;
    const day = new Date().toISOString().slice(0,10), qa=Number(input.qa);
    if (day !== this.cleanedDay) {
      this.sql.exec('DELETE FROM page_events WHERE day < ?',new Date(Date.now()-86400000).toISOString().slice(0,10));
      this.sql.exec('DELETE FROM daily WHERE day < ?',new Date(Date.now()-365*86400000).toISOString().slice(0,10));
      this.cleanedDay=day;
      await this.ctx.storage.setAlarm(Date.parse(day)+86400000+60000);
    }
    return this.ctx.storage.transactionSync(() => {
    let page = this.sql.exec('SELECT * FROM page_events WHERE day=? AND qa=? AND page=?',day,qa,input.page).toArray()[0];
    if (!page) {
      this.sql.exec('INSERT INTO page_events(day,qa,page,source) VALUES(?,?,?,?)',day,qa,input.page,input.source);
      this.sql.exec('INSERT INTO daily(day,qa,source,visits) VALUES(?,?,?,1) ON CONFLICT(day,qa,source) DO UPDATE SET visits=visits+1',day,qa,input.source);
      page={source:input.source,clicked:0};
    }
    if (input.event==='store_click' && !page[input.cta]) {
      // cta is a server allowlist constant; no user-controlled SQL identifier is accepted.
      this.sql.exec(`UPDATE page_events SET clicked=1,${input.cta}=1 WHERE day=? AND qa=? AND page=?`,day,qa,input.page);
      this.sql.exec(`UPDATE daily SET clicked_visits=clicked_visits+?,${input.cta}=${input.cta}+1 WHERE day=? AND qa=? AND source=?`,page.clicked ? 0 : 1,day,qa,page.source);
    }
    return true;
    });
  }
  async alarm() {
    this.sql.exec('DELETE FROM page_events WHERE day < ?',new Date(Date.now()-86400000).toISOString().slice(0,10));
    this.sql.exec('DELETE FROM daily WHERE day < ?',new Date(Date.now()-365*86400000).toISOString().slice(0,10));
    const count=this.sql.exec('SELECT COUNT(*) AS total FROM daily').one().total;
    if (count) await this.ctx.storage.setAlarm(Date.now()+86400000);
  }
  report({from,to,qa}) {
    const rows=this.sql.exec('SELECT * FROM daily WHERE day>=? AND day<=? AND qa=? ORDER BY day,source',from,to,qa).toArray();
    const total={visits:0,clicked_visits:0,hero_us:0,hero_gb:0,bottom_us:0,bottom_gb:0};
    for (const row of rows) for (const key of Object.keys(total)) total[key]+=row[key];
    const rate=total.visits ? total.clicked_visits/total.visits : null;
    return {version:1,from,to,timezone:'UTC',qa:Boolean(qa),totals:{...total,click_through_rate:rate},rows,definition:'visits = page loads observed through a visit or click event, counted once per page load per UTC day; clicked_visits = those page loads with at least one App Store click; CTA counts deduplicate each button per page load per UTC day. Not unique people, App Store arrivals, purchases, or installs.'};
  }
}
