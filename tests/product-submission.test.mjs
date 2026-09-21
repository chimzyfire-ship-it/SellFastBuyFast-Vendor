import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = source.indexOf("  if (form.id === 'product-form')");
const end = source.indexOf('  // Return Decision Form', start);
test('actual Product Studio submit preserves imperfect details and sends missing logistics for review', async () => {
  const values = { title:'shoes', categoryId:'', brand:'sellfast', sku:'', priceNaira:'3445567', availableQuantity:'1', description:'wrong details', imageUrl:'', weightKg:'', dimensionsCm:'', careInstructions:'keep dry' };
  const elements = Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}]));
  elements.submitForReview={checked:true};
  const requests=[];
  const state={productDraft:{}, categories:[], merchant:{id:'merchant'}, products:[]};
  const context=vm.createContext({state,form:{id:'product-form',elements,querySelectorAll:()=>[]},
    FormData:class { *[Symbol.iterator](){yield* Object.entries(values);} },
    showNotice(){},render(){},isMediaUrlValid:()=>true,console,
    performServerAction:async (_key,operation)=>operation(),
    api:async(path,options)=>{requests.push({path,...options});return {id:'product',status:'draft'};},
  });
  await vm.runInContext(`(async()=>{${source.slice(start,end)}})()`,context);
  assert.equal(requests.length,2,state.formError);
  assert.equal(requests[0].body.weightKg,null);
  assert.equal(requests[0].body.dimensionsCm,'');
  assert.equal(requests[0].body.variants[0].priceMinor,344556700);
  assert.match(requests[0].body.description,/wrong details/);
  assert.match(requests[0].body.description,/keep dry/);
  assert.equal(requests[1].path,'/v1/catalog-management/products/product/submit');
  assert.equal(state.activeView,'catalogue');
});
