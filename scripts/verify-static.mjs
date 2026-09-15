import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
const root=process.cwd();
const required=['index.html','login.html','auth-guard.js','mfa-enroll.html','mfa-challenge.html','clients.html','intakes.html','contacts.html','messages.html','cases.html','tasks.html','credit-ops.html','funding-ops.html','agreements.html','quotes.html','documents.html','payments.html','navbar-admin.html'];
const failures=[];
for(const file of required){try{if(!(await stat(join(root,file))).isFile())failures.push(`Missing required file: ${file}`);}catch{failures.push(`Missing required file: ${file}`);}}
async function walk(dir){const out=[];for(const name of await readdir(dir)){if(name==='.git'||name==='node_modules')continue;const path=join(dir,name);const s=await stat(path);if(s.isDirectory())out.push(...await walk(path));else out.push(path);}return out;}
const files=await walk(root);
for(const file of files.filter(f=>/\.(html|js|mjs)$/.test(f))){const text=await readFile(file,'utf8');const rel=file.slice(root.length+1);if(/SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/.test(text))failures.push(`Privileged secret identifier in static source: ${rel}`);if(/http:\/\/reaperai\.com/i.test(text))failures.push(`Insecure ReaperAI URL in ${rel}`);if(file.endsWith('.html')){for(const match of text.matchAll(/(?:href|src)=["']([^"']+)["']/g)){const ref=match[1];if(!ref||ref.startsWith('#')||/^(https?:|mailto:|tel:|data:|javascript:)/i.test(ref))continue;const target=normalize(join(dirname(file),ref.split(/[?#]/)[0]));try{if(!(await stat(target)).isFile())failures.push(`Broken local reference in ${rel}: ${ref}`);}catch{failures.push(`Broken local reference in ${rel}: ${ref}`);}}}}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}console.log(`Admin static verification passed for ${files.length} files.`);
