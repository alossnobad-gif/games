import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,start,action,advance,view,nextRound,ROLES} from '../server/game.js';
import {BOARD_PRESETS,ROLE_DEFINITIONS,presetRoles} from '../server/rules.js';

function voting(options={}){
  const room=createRoom(true,options);start(room);
  room.players.forEach((player,index)=>player.role=ROLES[index]);
  room.phase='vote';return room;
}
function cast(room,choose){for(const player of room.players)if(player.alive&&!player.revealed)action(room,player.id,choose(player));}

test('vote details stay hidden even after everyone submits until judge settlement; snapshots have no private data',()=>{
  const room=voting();
  action(room,1,2);assert.equal(view(room,room.players[1].token).voteRecords.length,0);
  assert.throws(()=>advance(room),/未行动/);assert.equal(room.voteRecords.length,0);
  for(const player of room.players.slice(1))action(room,player.id,player.id===12?null:2);
  assert.equal(view(room,room.judge).voteRecords.length,0);
  advance(room);
  const record=view(room,room.players[0].token).voteRecords[0];
  assert.equal(record.day,1);assert.equal(record.outcome,'exiled');assert.equal(record.target,2);
  assert.deepEqual(record.totals,[{seat:2,votes:11}]);assert.equal(record.ballots[11].status,'abstained');
  assert.equal(record.ballots[0].target,2);assert.equal(room.players[1].alive,false);
  for(const ballot of record.ballots)assert.deepEqual(Object.keys(ballot).sort(),['name','seat','status','target']);
  const preview=view(room,room.judge,1);assert.deepEqual(preview.voteRecords,[record]);
  assert.equal(preview.isJudge,false);assert.ok(!JSON.stringify(record).includes('token'));
  // Later phases cannot mutate the published snapshot.
  room.actions={vote:{1:3}};room.players[0].name='新名字';assert.equal(record.ballots[0].name,'林夜');assert.equal(record.ballots[0].target,2);
});

test('records distinguish tied votes, abstention, dead seats, lost voting rights and idiot immunity',()=>{
  const tie=voting();cast(tie,player=>player.id%2?1:2);advance(tie);
  assert.equal(tie.voteRecords[0].outcome,'tie');assert.equal(tie.voteRecords[0].target,null);
  const blank=voting();cast(blank,()=>null);advance(blank);assert.equal(blank.voteRecords[0].outcome,'all-abstained');
  const room=voting();cast(room,()=>8);advance(room);
  assert.equal(room.voteRecords[0].outcome,'idiot-revealed');assert.equal(room.players[7].alive,true);
  assert.equal(room.voteRecords[0].ballots[7].status,'voted'); // It had voting rights at that time.
  room.phase='vote';room.players[8].alive=false;cast(room,()=>null);advance(room);
  assert.equal(room.voteRecords[1].day,2);assert.equal(room.voteRecords[1].ballots[7].status,'no-vote');
  assert.equal(room.voteRecords[1].ballots[8].status,'dead');
  assert.equal(room.voteRecords[1].ballots.filter(ballot=>ballot.status==='abstained').length,10);
});

test('disabled and legacy rooms expose no records; next round preserves setting and clears prior votes',()=>{
  for(const legacy of [false,true]){
    const room=voting({publicVoteRecords:false});
    if(legacy){delete room.settings;delete room.voteRecords;delete room.rulesetId;delete room.rulesetVersion;}
    cast(room,()=>1);advance(room);
    assert.deepEqual(view(room,room.judge).voteRecords,[]);
    assert.equal(view(room,room.players[0].token).settings.publicVoteRecords,false);
  }
  const room=voting();cast(room,()=>1);advance(room);assert.equal(room.voteRecords.length,1);
  room.phase='end';nextRound(room);assert.deepEqual(room.voteRecords,[]);assert.equal(room.settings.publicVoteRecords,true);
  const restored=JSON.parse(JSON.stringify(room));assert.equal(view(restored,restored.judge).settings.publicVoteRecords,true);
});

test('only implemented board presets are accepted and role counts remain consistent',()=>{
  assert.throws(()=>createRoom(false,{publicVoteRecords:'false'}),/开关/);
  assert.throws(()=>createRoom(false,{rulesetId:'guardian'}),/板型/);
  assert.throws(()=>createRoom(false,{rulesetId:'__proto__'}),/板型/);
  for(const preset of Object.values(BOARD_PRESETS)){
    const roles=presetRoles(preset.id);assert.equal(roles.length,preset.playerCount);
    for(const id of roles)assert.ok(ROLE_DEFINITIONS[id]);
    const room=createRoom(true,{rulesetId:preset.id});start(room);
    assert.deepEqual(room.players.map(player=>player.role).sort(),roles.sort());
    assert.equal(room.rulesetVersion,preset.version);
  }
  const room=createRoom(true);room.rulesetVersion=999;assert.throws(()=>start(room),/版本/);
});
