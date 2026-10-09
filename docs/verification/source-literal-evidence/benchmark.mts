import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { factSourcePipeline } from '../../../modules/review/pipeline';
import { mockProvider } from '../../../modules/review/mock-provider';
const sentence='The source keeps original human writing as the basis of review.';
const missing=' This additional sentence is absent from the source.';
const cells=[];
for(const pattern of ['same-part','distinct-parts'])for(const kind of ['ASCII','NFKC-prefix'])for(const count of (pattern==='same-part'?[1,10,384]:[384])) {
  const prefix=kind==='ASCII'?'Unrelated context. ': 'Ａ unrelated context. ';
  const parts=Array.from({length:count},(_,i)=>pattern==='same-part'?sentence:`Unique human source sentence ${String(i).padStart(3,'0')} remains unchanged.`);
  const tail=pattern==='same-part'?sentence:parts.join('\n');
  const budget=1999999-Buffer.byteLength(tail);
  const source=prefix.repeat(Math.floor(budget/Buffer.byteLength(prefix)))+tail;
  const quotes=parts.map((part,i)=>({id:`quote-${i}`,text:part+missing,sourceUrl:'https://example.com/shared',sourceTitle:'Human title'}));
  for(const type of ['FULL','SOURCE'] as const){
    const times=[];let result;let calls=0;
    for(let iteration=0;iteration<4;iteration++){
      calls=0;const start=performance.now();
      result=await factSourcePipeline({markdown:'Human note',type,groups:[],quotes},{provider:{...mockProvider(),async extractClaims(){return [];}},fetcher:{async fetch(url){calls++;return {url,text:source,title:'Source',accessedAt:new Date().toISOString()};}},search:{async search(){return [];}},stage:async()=>{}});
      if(iteration)times.push(performance.now()-start);
    }
    if(calls!==1||result!.findings.length!==count||result!.sourceChecks.some(c=>c.status!=='PARTIAL_MATCH'))throw new Error('Benchmark correctness failure');
    if(type==='SOURCE'&&result!.findings.some((f,i)=>!f.evidence[0].text.includes(parts[i])))throw new Error('Excerpt missing literal match');
    cells.push({pattern,kind,count,type,sourceBytes:Buffer.byteLength(source),milliseconds:times.sort((a,b)=>a-b)[1],samples:times,oneFetch:true,allPartial:true,allQuoteIdentitiesDistinct:new Set(result!.findings.map(f=>f.sourceQuoteId)).size===count});
  }
}
await writeFile(new URL('./performance.json', import.meta.url),JSON.stringify({node:process.version,protocol:'Standalone after all checks and focused UI ended. One warmup; median of three actual pipeline runs. FULL source stage retains previous per-quote normalization. SOURCE is the new prepared literal helper. No network, DB or UI timing; no absolute performance assertion; 384 is a fixture, not a quote limit.',cells},null,2));
console.log(cells);
