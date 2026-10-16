import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2','.mp3':'audio/mpeg','.pdf':'application/pdf','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon' };
const assets = {};
async function addDirectory(directory, prefix = '') {
  for (const item of await readdir(directory, { withFileTypes:true })) {
    const full = path.join(directory,item.name), url = prefix + '/' + item.name;
    if (item.isDirectory()) {await addDirectory(full,url);continue;}
    const bytes = await readFile(full), ext = path.extname(item.name), binary = ['.png','.webp','.ico','.woff2','.mp3','.pdf'].includes(ext);
    assets[url] = { type:types[ext] || 'application/octet-stream', body:bytes.toString(binary?'base64':'utf8'), base64:binary };
  }
}
await addDirectory('public');
for(const name of ['engine','ai','teams'])assets['/'+name+'.js']={type:types['.js'],body:await readFile('shared/'+name+'.js','utf8'),base64:false};
await mkdir('generated',{recursive:true});
const assetSource = 'export const ASSETS = '+JSON.stringify(assets)+';\n';
await writeFile('generated/assets.js',assetSource);
const engine = await readFile('shared/engine.js','utf8');
const teams = (await readFile('shared/teams.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const teamAPI = (await readFile('server/team-api.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const api = (await readFile('server/api.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const worker = (await readFile('worker/index.js','utf8')).replace(/^import .*;\r?\n/gm,'');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',assetSource+engine+'\n'+teams+'\n'+teamAPI+'\n'+api+'\n'+worker);
try{await copyFile('.openai/hosting.json','dist/.openai/hosting.json');}catch(error){if(error.code!=='ENOENT')throw error;}
console.log(`Built self-contained Worker: ${Object.keys(assets).length} assets.`);
