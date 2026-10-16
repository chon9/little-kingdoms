import test from 'node:test';
import assert from 'node:assert/strict';
import {tr,setLanguage,getLanguage,LANGUAGE_KEY} from '../public/i18n.js';
import {AVATARS,avatarLine} from '../public/progression.js';
import {COSMETICS} from '../public/cosmetics.js';

test('English and Simplified Chinese switch without changing source text, and invalid language codes are ignored',()=>{
  setLanguage('en');assert.equal(tr('Play again'),'Play again');setLanguage('zh-Hans');assert.equal(getLanguage(),'zh-Hans');assert.match(tr('Play again'),/[\u3400-\u9fff]/);setLanguage('invalid');assert.equal(getLanguage(),'zh-Hans');setLanguage('en');assert.equal(tr('Play again'),'Play again');assert.equal(LANGUAGE_KEY,'little-kingdoms-language');
});
test('all sixty general names and ninety collectible names have Chinese translations',()=>{
  setLanguage('zh-Hans');
  for(const item of [...AVATARS,...COSMETICS]){const translated=tr(item.name);assert.match(translated,/[\u3400-\u9fff]/,item.name);assert.doesNotMatch(translated,/[A-Za-z]{2,}/,item.name);}
  for(const avatar of AVATARS)assert.match(tr(avatar.han),/[\u3400-\u9fff]/);
  setLanguage('en');
});

test('new general speech, team turns, rematch consent and download actions are localized',()=>{
  setLanguage('zh-Hans');
  for(const a of AVATARS.slice(40))for(const event of['start','move','win','loss','threat','territory'])assert.doesNotMatch(tr(avatarLine(a.id,event)),/[A-Za-z]{2,}/);
  for(const s of['P3 is planning','P3 · Shu moves','Blue A → Orange A → Blue B → Orange B','3 / 4 consecutive passes. Blue A → Orange A → Blue B → Orange B','2 / 4 commanders accepted. Colors swap when all four are ready.','All four commanders must accept. Teams swap Blue and Orange for the next battle.'])assert.doesNotMatch(tr(s),/[A-Za-z]{2,}/,s);
  assert.match(tr('Download Windows ↓'),/下载/);assert.match(tr('Your avatars · 60'),/头像/);setLanguage('en');
});
test('specific tutorial, reward and accessible-name patterns take priority over punctuation fallbacks',()=>{
  setLanguage('zh-Hans');
  for(const text of ['STEP 2 / 3 · SHU · BLUE','For this step, deploy at A9. Your practice board has not changed.','Owned 2/50 · Cosmetic rewards only','Shu group: 1 liberty','Shu group: 2 liberties'])assert.doesNotMatch(tr(text),/[A-Za-z]{2,}/,text);
  const name=tr('Your commander Jade Pagoda, level 2. Edit name and view record.');assert.ok(name.includes('Jade Pagoda'),'public nickname remains raw');assert.ok(!name.includes('Your commander'));assert.ok(!name.includes('Edit name'));
  setLanguage('en');
});
test('coordinates and random room codes remain unchanged inside localized gameplay messages',()=>{
  setLanguage('zh-Hans');assert.ok(tr('Deploy A9').includes('A9'));assert.ok(tr('A9: Shu castle, danger: opponent has a legal winning capture').includes('A9'));assert.ok(tr('Room code: X7A9Q2').includes('X7A9Q2'));assert.equal(tr('E5'),'E5');assert.equal(tr('ABC123'),'ABC123');setLanguage('en');
});

test('territory lock, lead ribbon and capture callouts translate completely',()=>{setLanguage('zh-Hans');for(const s of ['Blue Lead 4','Orange Lead 2','Level · 0','CASTLE FALLS!','BLUE WINS BY CAPTURE','ORANGE WINS BY CAPTURE','SIMULTANEOUS CAPTURE','Shu sealed territory: locked for both players','Can Shu fill its own eye? →','Can Shu fill its own land? →','This sealed territory is locked for both players. Keep it empty to preserve its points.'])assert.doesNotMatch(tr(s),/[A-Za-z]{2,}/,s);setLanguage('en');});

test('all rematch decisions and consent messages translate completely',()=>{setLanguage('zh-Hans');for(const s of ['SAME ROOM · REMATCH','Request rematch ↻','Accept rematch ↻','Waiting for rival…','Cancel request','Decline','Rematch unavailable','You accepted. Waiting for your rival to accept.','Your rival wants a rematch. Accept to begin again in this room.','You declined the rematch.','Your rival declined the rematch.','The rematch request was cancelled.','Same room, same kingdoms. Both commanders must accept.','A commander left this room. Create a new room to play again.'])assert.doesNotMatch(tr(s),/[A-Za-z]{2,}/,s);setLanguage('en');});

test('pending moves and request timing feedback are localized',()=>{setLanguage('zh-Hans');for(const s of ['Sending…','Castle awaiting server confirmation','Connection is slow. Confirming your move…','Connection interrupted. Retrying your move safely…','Your move is confirmed.','Last server response: 120 ms · D1 round trip: 80 ms','The server did not confirm the request. Reconnecting…'])assert.doesNotMatch(tr(s),/[A-Za-z]{2,}/,s);setLanguage('en');});
