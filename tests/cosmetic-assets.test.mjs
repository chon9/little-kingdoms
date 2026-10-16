import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {COSMETICS,CASTLE_ARTS,BOARD_ARTS} from '../public/cosmetics.js';

function inspectWebP(bytes){
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  let width,height,alpha=false;const chunks=[];
  for(let offset=12;offset+8<=bytes.length;){
    const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;assert.ok(start+size<=bytes.length);chunks.push(type);
    if(type==='VP8X'){alpha=!!(bytes[start]&16);width=1+bytes.readUIntLE(start+4,3);height=1+bytes.readUIntLE(start+7,3);}
    if(type==='ALPH')alpha=true;
    if(type==='VP8 '&&!width){assert.equal(bytes.toString('hex',start+3,start+6),'9d012a');width=bytes.readUInt16LE(start+6)&16383;height=bytes.readUInt16LE(start+8)&16383;}
    if(type==='VP8L'&&!width){assert.equal(bytes[start],47);const bits=bytes.readUInt32LE(start+1);width=(bits&16383)+1;height=((bits>>>14)&16383)+1;alpha=!!(bits&(1<<28));}
    offset=start+size+(size%2);
  }
  return{width,height,alpha,chunks};
}
test('all ninety collectible assets are distinct optimized WebP files with the required geometry and no private metadata',async()=>{
  const root=new URL('../public/assets/cosmetics/',import.meta.url),files=await readdir(root),hashes=new Set();
  assert.deepEqual(files.filter(n=>n.endsWith('.webp')).sort(),COSMETICS.map(item=>item.id+'.webp').sort());
  for(const item of COSMETICS){
    const bytes=await readFile(new URL(item.id+'.webp',root)),image=inspectWebP(bytes);
    assert.ok(bytes.length<220000,item.id+' remains lightweight');hashes.add(createHash('sha256').update(bytes).digest('hex'));
    assert.equal(image.width,item.type==='castle'?256:768,item.id+' width');assert.equal(image.height,image.width,item.id+' square art');
    if(item.type==='castle')assert.equal(image.alpha,true,item.id+' preserves transparency');
    assert.ok(!image.chunks.some(type=>['EXIF','XMP '].includes(type)),item.id+' excludes source metadata');
  }
  assert.equal(hashes.size,90,'each design has its own image');
  const prompts=JSON.parse(await readFile(new URL('../artwork/cosmetics-prompts.json',import.meta.url),'utf8'));
  assert.deepEqual(prompts.castles.map(p=>p.id),CASTLE_ARTS.map(p=>p.id));assert.deepEqual(prompts.boards.map(p=>p.id),BOARD_ARTS.map(p=>p.id));
  for(const entry of [...prompts.castles,...prompts.boards])assert.ok(entry.prompt.length>150,'retain each complete generation brief');
});
