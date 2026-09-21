import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../account-access.js',import.meta.url),'utf8');
async function page(type='recovery',failure=false){
 const elements=Object.fromEntries(['title','status','password-form','done','password','confirm','submit'].map(id=>[id,{hidden:true,value:'',textContent:'',disabled:false,addEventListener(_name,fn){this.submit=fn;},reset(){this.resetCalled=true;}}]));
 let clientOptions,updated=0,sessionCount=0,cleared=false;
 await vm.runInNewContext(source,{
  document:{getElementById:id=>elements[id]},location:{hash:type?`#type=${type}&access_token=isolated-access&refresh_token=isolated-refresh`:'',pathname:'/account-access.html'},
  history:{replaceState(){cleared=true;}},URLSearchParams,
  fetch:async()=>({ok:true,json:async()=>({data:{supabaseUrl:'https://test.invalid',supabaseAnonKey:'test-public-key'}})}),
  window:{supabase:{createClient(_url,_key,options){clientOptions=options;return{auth:{setSession:async()=>{sessionCount++;return{error:failure?Error('expired'):null};},updateUser:async()=>{updated++;return{error:null};},signOut:async()=>({error:null})}};}}},
 });
 return {elements,get updated(){return updated;},get sessionCount(){return sessionCount;},clientOptions,cleared};
}
test('Recovery clears URL tokens and keeps its session out of persistent storage',async()=>{const p=await page();assert.equal(p.cleared,true);assert.equal(p.clientOptions.auth.persistSession,false);assert.equal(p.elements['password-form'].hidden,false);});
test('No link or rejected session cannot open the password form',async()=>{for(const p of [await page(''),await page('recovery',true)])assert.equal(p.elements['password-form'].hidden,true);});
test('Password mismatch does not mutate the identity; matching input updates once',async()=>{const p=await page();p.elements.password.value='Long-test-password';p.elements.confirm.value='Does-not-match';await p.elements['password-form'].submit({preventDefault(){}});assert.equal(p.updated,0);p.elements.confirm.value=p.elements.password.value;await p.elements['password-form'].submit({preventDefault(){}});assert.equal(p.updated,1);assert.equal(p.elements['password-form'].hidden,true);assert.equal(p.elements.done.hidden,false);});
test('Confirmation links show confirmation without allowing a password reset',async()=>{const p=await page('signup');assert.equal(p.sessionCount,1);assert.equal(p.elements['password-form'].hidden,true);assert.equal(p.elements.done.hidden,false);assert.equal(p.updated,0);});
