import { randomInt, randomUUID } from 'node:crypto';

export const ROLES = ['wolf','wolf','wolf','wolf','seer','witch','hunter','idiot','villager','villager','villager','villager'];
export const LABELS = { wolf:'狼人', seer:'预言家', witch:'女巫', hunter:'猎人', idiot:'白痴', villager:'平民' };
export const PHASES = { lobby:'等待入座', wolf:'狼人行动', seer:'预言家查验', witch:'女巫行动', day:'白天发言', vote:'放逐投票', hunter:'猎人开枪', end:'对局结束' };
const fail = message => { throw new Error(message); };
export function log(r, text, privateLog = false) { r.logs.push({ id:randomUUID(), time:Date.now(), text, private:privateLog }); r.logs=r.logs.slice(-150); }
export function createRoom(demo=false) {
  const r={id:String(randomInt(100000,1000000)),judge:randomUUID(),demo,phase:'lobby',day:0,players:[],logs:[],actions:{},potions:{save:true,poison:true},checks:{},night:{},winner:null};
  log(r,'房间已创建，等待玩家入座');
  if(demo) fillDemo(r);
  return r;
}
export function addPlayer(r,name) {
  if(r.phase!=='lobby') fail('游戏已经开始，无法加入');
  if(r.players.length>=12) fail('房间已满');
  const p={id:r.players.length+1,name:String(name||'').trim().slice(0,12)||`${r.players.length+1}号玩家`,token:randomUUID(),role:null,alive:true,revealed:false};
  r.players.push(p); log(r,`${p.id} 号 · ${p.name} 已入座`); return p;
}
export function fillDemo(r) {
  if(r.phase!=='lobby') fail('仅可在准备阶段添加');
  const names=['林夜','苏晚','陈默','叶棠','周野','姜梨','陆川','顾念','许言','白露','江望','沈棠'];
  while(r.players.length<12) addPlayer(r,names[r.players.length]);
}
function shuffle(a) { for(let i=a.length-1;i>0;i--){const j=randomInt(i+1); [a[i],a[j]]=[a[j],a[i]];} return a; }
export function start(r) {
  if(r.phase!=='lobby') fail('对局已开始');
  if(r.players.length!==12) fail('需要 12 名玩家全部入座');
  const roles=shuffle([...ROLES]);r.players.forEach((p,i)=>p.role=roles[i]);r.day=1;r.phase='wolf';r.actions={};r.night={};
  log(r,'身份已分配，请玩家在自己的手机上查看');log(r,'第 1 夜降临，狼人请睁眼');
}
export function eligible(r,p) {
  if(!p) return false;
  if(r.phase==='hunter') return p.id===r.shooter;
  if(!p.alive) return false;
  return r.phase==='vote'?!p.revealed:({wolf:'wolf',seer:'seer',witch:'witch'}[r.phase]===p.role);
}
export function getKnife(r) {
  const votes=Object.values(r.actions.wolf||{}).filter(Boolean),counts={};
  for(const id of votes) counts[id]=(counts[id]||0)+1;
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  return sorted.length&&(!sorted[1]||sorted[0][1]>sorted[1][1])?Number(sorted[0][0]):null;
}
export function action(r,actorId,target,kind='target') {
  const actor=r.players.find(p=>p.id===Number(actorId));
  if(!eligible(r,actor)) fail('当前不能由该玩家行动');
  if(r.actions[r.phase]?.[actor.id]!==undefined) fail('你已提交本阶段行动');
  const id=Number(target)||null,p=r.players.find(p=>p.id===id);
  if(id&&(!p||!p.alive)) fail('目标必须是存活玩家');
  if(r.phase==='wolf'&&p?.role==='wolf') fail('狼人不能袭击狼队友');
  if(r.phase==='seer') {
    if(!p||p.id===actor.id) fail('请选择其他存活玩家');
    (r.checks[actor.id]??=[]).push({day:r.day,target:id,wolf:p.role==='wolf'});
    log(r,`预言家查验 ${id} 号：${p.role==='wolf'?'狼人':'好人'}`,true);
  }
  if(r.phase==='witch') {
    if(!['save','poison','pass'].includes(kind)) fail('请选择用药或不用药');
    if(kind==='save') {
      if(!r.potions.save||!r.night.knife) fail('当前无法使用解药');
      if(r.night.knife===actor.id&&r.day>1) fail('女巫仅首夜可自救');
      r.potions.save=false;r.night.saved=true;
    }
    if(kind==='poison') {if(!r.potions.poison||!p) fail('请选择毒药目标');r.potions.poison=false;r.night.poison=id;}
    log(r,`女巫${kind==='save'?'使用解药':kind==='poison'?`毒杀 ${id} 号`:'选择不用药'}`,true);
  }
  if(r.phase==='hunter') {
    if(p){p.alive=false;log(r,`猎人开枪带走 ${id} 号 · ${p.name}`);}else log(r,'猎人放弃开枪');
    r.shooter=null;r.phase=r.resume;checkWinner(r);return;
  }
  (r.actions[r.phase]??={})[actor.id]=r.phase==='witch'?kind:id;
  if(r.phase==='vote') log(r,`${actor.id} 号已完成投票`);
}
function checkWinner(r) {
  const alive=r.players.filter(p=>p.alive),wolves=alive.filter(p=>p.role==='wolf');
  if(!wolves.length) r.winner='好人阵营';
  else if(!alive.some(p=>p.role==='villager')||!alive.some(p=>!['villager','wolf'].includes(p.role))) r.winner='狼人阵营';
  if(r.winner){r.phase='end';log(r,`${r.winner}获胜，对局结束`);}
}
function death(r,ids,resume,poison=null) {
  const dead=[...new Set(ids.filter(Boolean))].map(id=>r.players.find(p=>p.id===id)).filter(p=>p?.alive);
  dead.forEach(p=>p.alive=false);r.phase=resume;
  const hunter=dead.find(p=>p.role==='hunter'&&p.id!==poison);
  if(hunter){r.phase='hunter';r.shooter=hunter.id;r.resume=resume;log(r,`${hunter.id} 号猎人可选择开枪`);}else checkWinner(r);
  return dead;
}
export function advance(r) {
  if(['lobby','end'].includes(r.phase)) fail('当前阶段无法推进');
  if(r.phase==='hunter') fail('请先由猎人开枪或放弃');
  const waiting=r.players.filter(p=>eligible(r,p)&&r.actions[r.phase]?.[p.id]===undefined);
  if(waiting.length) fail(`还有 ${waiting.map(p=>p.id).join('、')} 号未行动，可由法官代操作`);
  if(r.phase==='wolf') {r.night.knife=getKnife(r);r.phase='seer';log(r,'狼人行动结束，预言家请睁眼');}
  else if(r.phase==='seer'){r.phase='witch';log(r,'预言家行动结束，女巫请睁眼');}
  else if(r.phase==='witch') {
    const dead=death(r,[r.night.saved?null:r.night.knife,r.night.poison],'day',r.night.poison);
    log(r,dead.length?`天亮了，昨夜 ${dead.map(p=>p.id).join('、')} 号出局`:'天亮了，昨夜是平安夜');
  } else if(r.phase==='day'){r.phase='vote';log(r,'发言结束，开始放逐投票');}
  else if(r.phase==='vote') {
    const tally={};for(const v of Object.values(r.actions.vote||{})){if(v)tally[v]=(tally[v]||0)+1;}
    const ranked=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
    log(r,`投票结果：${ranked.map(([id,n])=>`${id} 号 ${n} 票`).join('，')||'全部弃票'}`);
    const id=ranked.length&&(!ranked[1]||ranked[0][1]>ranked[1][1])?Number(ranked[0][0]):null;
    const p=r.players.find(p=>p.id===id);
    if(p?.role==='idiot'&&!p.revealed){p.revealed=true;log(r,`${id} 号白痴翻牌免于放逐，失去投票权`);}
    else if(p){log(r,`${id} 号 · ${p.name} 被放逐`);death(r,[id],'wolf');}
    else log(r,'平票或全部弃票，本轮无人出局');
    r.day++;r.actions={};r.night={};
    if(!['end','hunter'].includes(r.phase))r.phase='wolf';
    if(r.phase==='wolf')log(r,`第 ${r.day} 夜降临`);
  }
}
export function view(r,token,previewId=null) {
  const judge=token===r.judge,me=judge&&previewId?r.players.find(p=>p.id===Number(previewId)):r.players.find(p=>p.token===token);
  if(!judge&&!me) fail('房间凭证无效，请重新加入');
  const isJudge=judge&&!previewId,finished=r.phase==='end';
  const result={id:r.id,demo:r.demo,phase:r.phase,phaseLabel:PHASES[r.phase],day:r.day,winner:r.winner,isJudge,me:me?.id||null,
    players:r.players.map(p=>({id:p.id,name:p.name,alive:p.alive,revealed:p.revealed,role:isJudge||finished||p.id===me?.id||(me?.role==='wolf'&&p.role==='wolf')||p.revealed?p.role:null,acted:(isJudge||r.phase==='vote'||p.id===me?.id)&&r.actions[r.phase]?.[p.id]!==undefined})),
    logs:r.logs.filter(l=>isJudge||!l.private),eligible:r.players.filter(p=>(isJudge||p.id===me?.id)&&eligible(r,p)).map(p=>p.id),shooter:r.shooter||null};
  if(isJudge||me?.role==='witch'){result.potions=r.potions;result.knife=r.phase==='witch'&&r.potions.save?r.night.knife:null;}
  if(isJudge)result.checks=r.checks;
  else if(me?.role==='seer')result.checks={[me.id]:r.checks[me.id]||[]};
  return result;
}
