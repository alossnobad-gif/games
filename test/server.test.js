import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

test('prebuilt release runs without node_modules, reports SHA and accepts an independent game token',async t=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'moonveil-release-test-'));
  const release=path.join(temp,'release');
  await cp(new URL('../server/',import.meta.url),path.join(release,'server'),{recursive:true});
  await cp(new URL('../deploy/web/',import.meta.url),path.join(release,'dist'),{recursive:true});
  await cp(new URL('../package.json',import.meta.url),path.join(release,'package.json'));
  const sha='1234567890abcdef1234567890abcdef12345678';
  await writeFile(path.join(release,'RELEASE_SHA'),sha+'\n');
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,[path.join(release,'server/index.js')],{env:{...process.env,DATA_DIR:path.join(temp,'data'),PORT:String(port)},stdio:'ignore'});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(temp,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`;
  let health;
  for(let i=0;i<60;i++){try{health=await fetch(base+'/api/health');if(health.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
  assert.ok(health?.ok,'release server started');assert.deepEqual(await health.json(),{ok:true,version:sha});
  assert.ok((await(await fetch(base)).text()).includes('月隐镇'));
  const room=await(await fetch(base+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demo:true})})).json();
  const headers={'Content-Type':'application/json','X-Moonveil-Token':room.token,Authorization:'Basic proxy-credential'};
  const started=await fetch(base+`/api/rooms/${room.id}/command`,{method:'POST',headers,body:JSON.stringify({command:'start'})});assert.equal(started.status,200);
  const state=await(await fetch(base+`/api/rooms/${room.id}`,{headers})).json();assert.equal(state.isJudge,true);assert.equal(state.phase,'wolf');
  const denied=await fetch(base+`/api/rooms/${room.id}`,{headers:{Authorization:'Basic proxy-credential'}});assert.equal(denied.status,400);
});
