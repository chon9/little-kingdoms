import{execFileSync}from'node:child_process';
import{readFile,writeFile,mkdir,access,lstat}from'node:fs/promises';
import path from'node:path';

// Export source only. This intentionally starts without repository history,
// hosted project identity, runtime state, caches, credentials or build output.
const root=process.cwd(),destination=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!destination.startsWith(path.resolve(root,'artifacts')+path.sep))throw new Error('Use a new export directory inside artifacts/.');
try{await access(destination);throw new Error('Export already exists; choose a new directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
const topFiles=new Set(['README.md','package.json','package-lock.json','.gitignore','drizzle.config.js']);
const roots=new Set(['public','shared','server','worker','db','drizzle','scripts','tests','artwork','clients']);
const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean))];
const deleted=new Set(execFileSync('git',['ls-files','--deleted','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean));
let count=0,metadataRemoved=0;
function stripPNGMetadata(bytes){
  if(bytes.length<8||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return bytes;
  const chunks=[bytes.subarray(0,8)];let offset=8;
  while(offset<bytes.length){const length=bytes.readUInt32BE(offset),end=offset+12+length;if(end>bytes.length)throw new Error('Invalid PNG chunk.');const type=bytes.toString('ascii',offset+4,offset+8);if(['tEXt','zTXt','iTXt','eXIf'].includes(type))metadataRemoved++;else chunks.push(bytes.subarray(offset,end));offset=end;}
  return Buffer.concat(chunks);
}
for(const relative of paths){
  if(deleted.has(relative))continue;
  const parts=relative.split('/'),base=parts.at(-1);
  if(!(topFiles.has(relative)||roots.has(parts[0])))continue;
  if(parts.some(p=>['.git','.openai','.agents','.codex','node_modules','.gradle','build','data','generated','dist','www','releases'].includes(p)))continue;
  if(/^\.env(?:\.|$)/i.test(base)&&base!=='.env.example'||/\.(?:pem|p12|pfx|key|jks|keystore|sqlite3?|db|log)$/i.test(base)||base==='local.properties')continue;
  const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw new Error('Unsafe source path.');
  if((await lstat(file)).isSymbolicLink())throw new Error('Review source symlinks before exporting.');
  let bytes=await readFile(file);if(base.endsWith('.png'))bytes=stripPNGMetadata(bytes);
  const output=path.resolve(destination,relative);if(!output.startsWith(destination+path.sep))throw new Error('Unsafe output path.');
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,bytes);count++;
}
await writeFile(path.join(destination,'PUBLIC-SOURCE.md'),'# Public source snapshot\n\nThis source export starts with a fresh Git history. Private hosting identity, source-repository credentials, local room data, browser profiles, caches and machine-specific build settings are excluded. PNG text/EXIF metadata is removed without changing pixels. The client contains only the public online-play URL; it contains no database or administrative credential.\n\nRun `node scripts/dev.mjs` to play locally and `node --test tests/*.test.mjs` to test. `node scripts/build.mjs` builds the Worker; configure your own deployment and DB binding before hosting a separate instance. The original hosted project configuration is intentionally absent.\n');
console.log(JSON.stringify({directory:destination,sourceFiles:count,pngMetadataChunksRemoved:metadataRemoved}));
