import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {createRoom, start, nextRound, view} from '../server/game.js';
import {settle, leaderboard} from '../server/ranking.js';

test('next round resets every game field, preserves seats and scoring history, and accepts legacy rooms',()=>{
  const room=createRoom(true);room.demo=false;
  room.players.forEach(p=>p.profileId=`profile-${p.id}`);
  start(room);room.phase='end';room.winner='好人阵营';settle(room);
  const credentials=room.players.map(({id,name,token,profileId})=>({id,name,token,profileId}));
  const before=leaderboard({room});
  delete room.round; // Previously saved rooms have no round or history fields.
  room.players.forEach(p=>{p.alive=false;p.revealed=true;});
  room.potions={save:false,poison:false};room.checks={5:[{target:1,wolf:true}]};room.shooter=7;room.resume='day';
  nextRound(room);
  assert.equal(room.round,2);assert.equal(room.phase,'lobby');assert.equal(room.day,0);assert.equal(room.winner,null);
  assert.deepEqual(room.players.map(({id,name,token,profileId})=>({id,name,token,profileId})),credentials);
  assert.ok(room.players.every(p=>p.alive&&!p.revealed&&p.role===null));
  assert.deepEqual(room.potions,{save:true,poison:true});
  for(const field of ['actions','night','checks','performance'])assert.deepEqual(room[field],{});
  for(const field of ['result','scoringVersion','shooter','resume'])assert.equal(room[field],undefined);
  assert.deepEqual(leaderboard({room}),before);assert.equal(room.logs.length,1);
  const playerView=view(room,room.players[0].token);assert.ok(playerView.players.every(p=>p.role===null));assert.equal(playerView.history,undefined);
  assert.throws(()=>nextRound(room),/结束/);assert.equal(room.history.length,1);
  start(room);assert.equal(room.phase,'wolf');assert.equal(room.round,2);
  assert.deepEqual(leaderboard({room}),before); // In-progress rounds do not score.
  room.phase='end';room.winner='好人阵营';settle(room);settle(room);
  assert.equal(leaderboard({room}).games,2);
  nextRound(room);assert.equal(room.history.length,2);assert.equal(leaderboard({room}).games,2);
  assert.deepEqual(leaderboard({room:JSON.parse(JSON.stringify(room))}),leaderboard({room}));
  const other=structuredClone(room);delete other.result;other.history=[room.history[0]];
  assert.equal(leaderboard({room,other}).games,3);
});

test('12 real players finish two rounds in one room; room scope, permissions and restart preserve totals',async t=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'moonveil-multiround-'));
  const release=path.join(temp,'release');
  await cp(new URL('../server/',import.meta.url),path.join(release,'server'),{recursive:true});
  await cp(new URL('../deploy/web/',import.meta.url),path.join(release,'dist'),{recursive:true});
  await cp(new URL('../package.json',import.meta.url),path.join(release,'package.json'));
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  let child;
  const base=`http://127.0.0.1:${port}`;
  async function boot(){
    child=spawn(process.execPath,[path.join(release,'server/index.js')],{env:{...process.env,DATA_DIR:path.join(temp,'data'),PORT:String(port),HOST:'127.0.0.1'},stdio:'ignore'});
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,30));}
    throw new Error('server did not start');
  }
  async function stop(){if(child&&child.exitCode===null){child.kill();await once(child,'exit');}}
  t.after(async()=>{await stop();await rm(temp,{recursive:true,force:true});});
  await boot();
  async function request(route,body,token,status=200){
    const response=await fetch(base+'/api'+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{'X-Moonveil-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
  }
  const room=await request('/rooms',{demo:false},null,201);
  const players=[];
  for(let i=0;i<12;i++)players.push(await request(`/rooms/${room.id}/join`,{name:`玩家${i+1}`}));
  const read=()=>request(`/rooms/${room.id}`,null,room.token);
  const command=(command,extra={},token=room.token,status=200)=>request(`/rooms/${room.id}/command`,{command,...extra},token,status);
  async function finish(){
    for(let step=0;step<40;step++){
      const state=await read();if(state.phase==='end')return state;
      if(state.phase==='day'){await command('next',{round:state.round});continue;}
      const wolf=state.players.find(p=>p.alive&&p.role==='wolf');
      for(const actor of state.eligible){
        const target=state.phase==='seer'||state.phase==='vote'?wolf.id:null;
        await command('action',{round:state.round,actor,target,kind:'pass'});
      }
      await command('next',{round:state.round});
    }
    throw new Error('full game did not finish');
  }
  await command('start',{round:1});await command('rematch',{round:1},room.token,400);
  const first=await finish();assert.equal(first.ranking.counted,true);assert.equal(first.winner,'好人阵营');
  const totals=await request('/leaderboard');assert.equal(totals.games,1);assert.equal(totals.rows.length,12);
  await request(`/leaderboard?room=${room.id}`,null,null,403);
  assert.deepEqual(await request(`/leaderboard?room=${room.id}`,null,players[0].token),totals);
  await command('rematch',{round:1},players[0].token,403);
  await command('rematch',{round:1});
  const lobby=await read();assert.equal(lobby.round,2);assert.equal(lobby.phase,'lobby');assert.ok(lobby.players.every(p=>p.role===null));
  assert.deepEqual(await request('/leaderboard'),totals);
  assert.equal((await request(`/rooms/${room.id}`,null,players[0].token)).me,1);
  await command('start',{round:1},room.token,409); // Delayed request from prior round.
  await command('rematch',{round:2},room.token,400); // Cannot archive twice.
  await command('start',{round:2});assert.equal((await request(`/rooms/${room.id}`,null,players[0].token)).round,2);
  assert.deepEqual(await request('/leaderboard'),totals);
  await finish();const two=await request('/leaderboard');assert.equal(two.games,2);assert.ok(two.rows.every(p=>p.games===2));
  await stop();await boot();assert.deepEqual(await request('/leaderboard'),two);
  assert.deepEqual(await request(`/leaderboard?room=${room.id}`,null,room.token),two);
  await command('rematch',{round:2});assert.equal((await read()).round,3);
  assert.deepEqual(await request('/leaderboard'),two);
});
