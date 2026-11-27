import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const path=join(homedir(),'Library/Application Support/PLAYFOLD/ServiceConnections/wolse-landing-metrics.json');
const {reportToken,endpoint}=JSON.parse(await readFile(path,'utf8'));
const url=new URL('/report',endpoint);
for (const arg of process.argv.slice(2)) {
  const [key,value]=arg.split('=');
  if (!['from','to','qa'].includes(key) || !value) throw Error('Use from=YYYY-MM-DD to=YYYY-MM-DD qa=1 (optional)');
  url.searchParams.set(key,value);
}
const response=await fetch(url,{headers:{Authorization:`Bearer ${reportToken}`}});
if (!response.ok) throw Error(`Report failed: ${response.status}`);
console.log(JSON.stringify(await response.json(),null,2));
