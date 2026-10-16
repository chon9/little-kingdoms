import { cp,mkdir,copyFile,writeFile,readFile,readdir,unlink } from 'node:fs/promises';
import path from 'node:path';
const directory='clients/www';
// Mirror the shipped assets so removed soundtracks cannot survive a rebuild.
const outputRoot=path.resolve(directory),sourceRoot=path.resolve('public'),expected=new Set(['engine.js','ai.js','teams.js']);
async function collect(dir,relative=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error('Client asset symlinks require review.');
    const key=path.join(relative,entry.name);
    if(entry.isDirectory())await collect(path.join(dir,entry.name),key);else expected.add(key);
  }
}
async function prune(dir,relative=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error('Client output symlinks require review.');
    const key=path.join(relative,entry.name),file=path.resolve(outputRoot,key);
    if(!file.startsWith(outputRoot+path.sep))throw new Error('Unsafe client output path.');
    if(entry.isDirectory())await prune(file,key);else if(!expected.has(key))await unlink(file);
  }
}
await collect(sourceRoot);
await mkdir(directory,{recursive:true});await prune(outputRoot);
await cp('public',directory,{recursive:true});
for(const name of ['engine','ai','teams'])await copyFile(`shared/${name}.js`,`${directory}/${name}.js`);
const origin='https://shu-wei-kingdoms.alexchon911.chatgpt.site';
await writeFile(directory+'/client-config.js','window.KINGDOMS_API_BASE = '+JSON.stringify(origin)+';\n');
const html=await readFile(directory+'/index.html','utf8');
const csp=`default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self' ${origin}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'self'`;
await writeFile(directory+'/index.html',html.replace('<head>','<head>\n  <meta http-equiv="Content-Security-Policy" content="'+csp+'">'));
console.log('Built bundled offline client assets in clients/www; online PvP connects to '+origin);
