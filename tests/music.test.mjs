import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MUSIC_TRACKS,MusicQueue} from '../public/music-library.js';
import {setLanguage,tr} from '../public/i18n.js';

test('rotation visits all four tracks, wraps, and repeat changes only on manual next',()=>{
  const ids=MUSIC_TRACKS.map(t=>t.id),queue=new MusicQueue();
  assert.deepEqual([queue.track,...Array.from({length:ids.length-1},()=>queue.next())],ids);
  assert.equal(queue.next(),ids[0]);queue.configure(ids[1],'repeat');
  assert.equal(queue.next(),ids[1]);assert.equal(queue.next(true),ids[2]);
});
test('shuffle covers each cycle and does not repeat at a cycle boundary',()=>{
  for(const seed of [0,.2,.5,.99]){
    const queue=new MusicQueue(MUSIC_TRACKS[0].id,'shuffle',()=>seed);
    const first=[queue.track,...Array.from({length:3},()=>queue.next())];
    assert.equal(new Set(first).size,4);
    let last=first.at(-1);
    for(let cycle=0;cycle<10;cycle++){
      const next=Array.from({length:4},()=>queue.next());assert.equal(new Set(next).size,4);
      assert.notEqual(next[0],last);last=next.at(-1);
    }
  }
});
test('invalid saved music settings recover, and volume sync preserves a shuffle cycle',()=>{
  const queue=new MusicQueue('missing','invalid',()=>.5);
  assert.equal(queue.track,MUSIC_TRACKS[0].id);assert.equal(queue.mode,'rotation');
  queue.configure(MUSIC_TRACKS[0].id,'shuffle');queue.next();const remaining=[...queue.remaining];
  queue.configure(queue.track,queue.mode);assert.deepEqual(queue.remaining,remaining);
  queue.configure(MUSIC_TRACKS[3].id,'repeat');assert.equal(queue.remaining,null);assert.equal(queue.next(),MUSIC_TRACKS[3].id);
});
test('every bundled soundtrack has a local MP3, a primary source credit, and a Chinese title',async()=>{
  const sw=await readFile('public/sw.js','utf8'),credits=await readFile('public/assets/music-credits.txt','utf8');
  setLanguage('zh-Hans');
  for(const track of MUSIC_TRACKS){
    const bytes=await readFile('public'+track.file);assert.ok(bytes.length>100000,track.title);
    assert.ok(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255,'MP3 signature');
    assert.ok(sw.includes(track.file),'precache '+track.id);assert.ok(credits.includes(track.source));assert.ok(credits.includes(track.author));
    assert.match(tr(track.title),/[\u3400-\u9fff]/);
  }
  assert.ok(credits.includes('https://creativecommons.org/publicdomain/zero/1.0/'));setLanguage('en');
});
