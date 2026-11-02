import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'watchworld-audience-'));
process.env.WATCHWORLD_DATA_DIR=dir;
try {
 const {getAvgViewers,observeAudiences,capacityForAudience}=await import('../src/audience.js');
 assert.equal(getAvgViewers('unknown'),undefined);
 observeAudiences([{channel:'sample',viewers:100}]);assert.equal(getAvgViewers('sample'),100);
 observeAudiences([{channel:'sample',viewers:200},{channel:'sample',viewers:900}]);assert.equal(getAvgViewers('sample'),110);
 observeAudiences([{channel:'zero',viewers:0}]);assert.equal(getAvgViewers('zero'),0);
 console.log('PASS EMA first sample, 0.9/0.1 weighting, zero viewers and per-poll deduplication');
 const probe=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {getAvgViewers} from './src/audience.ts'; console.log(getAvgViewers('sample'));"],{cwd:new URL('../',import.meta.url),env:process.env,encoding:'utf8'});
 assert.equal(probe.status,0);assert.equal(Number(probe.stdout.trim()),110);console.log('PASS audience average survives a new process');
 for(const [audience,capacity] of [[0,12],[29,12],[30,24],[299,24],[300,60],[2999,60],[3000,128],[14999,128],[15000,240]])assert.equal(capacityForAudience(audience),capacity);
 assert.equal(capacityForAudience(undefined),12);console.log('PASS all capacity thresholds and unknown audience fallback');
}finally{await rm(dir,{recursive:true,force:true});}
