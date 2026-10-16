import {writeFile,readFile} from 'node:fs/promises';
const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const families=[{family:'DM+Sans:wght@400..700',name:'dm-sans',weight:'400 700',license:'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt'},{family:'Marcellus',name:'marcellus',weight:'400',license:'https://raw.githubusercontent.com/google/fonts/main/ofl/marcellus/OFL.txt'}];
let rules='';
for(const f of families){
  const response=await fetch('https://fonts.googleapis.com/css2?family='+f.family+'&display=swap',{headers:{'User-Agent':ua},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Font stylesheet failed');
  const css=await response.text(),urls=[...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m=>m[1]);const url=urls.at(-1);if(!url)throw new Error('Missing Latin font');
  const data=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!data.ok)throw new Error('Font file failed');await writeFile(`public/assets/${f.name}.woff2`,Buffer.from(await data.arrayBuffer()));
  const license=await fetch(f.license,{signal:AbortSignal.timeout(20000)});if(!license.ok)throw new Error('Font license failed');await writeFile(`public/assets/${f.name}-OFL.txt`,await license.text());
  rules+=`@font-face{font-family:'${f.name==='dm-sans'?'DM Sans':'Marcellus'}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url('/assets/${f.name}.woff2') format('woff2')}\n`;
}
const current=await readFile('public/styles.css','utf8');await writeFile('public/styles.css',rules+current.replace(/^@import.*\r?\n/,'').replace(/^@font-face\{[^\n]+\}\r?\n/gm,''));console.log('Bundled local fonts and their open-source licenses.');
