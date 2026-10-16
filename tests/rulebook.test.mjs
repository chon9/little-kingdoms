import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';
// Load the same browser module with its one absolute URL import resolved for Node.
const source=(await readFile(new URL('../public/rulebook.js',import.meta.url),'utf8')).replace("from '/engine.js'",`from '${new URL('../shared/engine.js',import.meta.url).href}'`);
const {RULE_EXAMPLES,tryRuleExample,COMIC_PAGES,comicMarkup}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('every comic example agrees with the real game engine',()=>{
  for(const [key,example]of Object.entries(RULE_EXAMPLES)){
    const result=tryRuleExample(key);
    if(example.expected==='blocked')assert.ok(result.error,`${key} must be blocked`);
    else {assert.equal(result.error,undefined,key);assert.equal(!!result.winner,example.expected==='capture',key);}
  }
  for(const key of ['eye','large','neutral'])assert.match(tryRuleExample(key).error,/sealed/);
  assert.match(tryRuleExample('suicide').error,/sacrifice/);
});
test('the complete comic includes setup, eyes, larger territory, capture, exceptions and the confirmed scoring',()=>{
  assert.equal(COMIC_PAGES.length,12);const html=comicMarkup({all:true});assert.equal((html.match(/data-rule-page=/g)||[]).length,12);
  for(const phrase of ['40','E5','up, down, left or right','one empty square at C7','fully sealed','both colors with zero liberties','5 more raw territory','green check','red !'])assert.ok(html.includes(phrase),phrase);
  assert.equal(tryRuleExample('unknown'),null);
});
