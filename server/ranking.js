const roles={wolf:'狼王',seer:'神眼预言家',witch:'灵药女巫',hunter:'神枪猎人',idiot:'不屈白痴',villager:'平民之光'};
export function settle(room){
  if(room.phase!=='end'||room.result)return;
  const counted=room.scoringVersion===1&&!room.demo&&!room.unranked&&room.players.length===12&&room.players.every(p=>p.profileId)&&new Set(room.players.map(p=>p.profileId)).size===12;
  room.result={counted,players:counted?room.players.map(p=>{
    const won=(p.role==='wolf')===(room.winner==='狼人阵营');
    const bonus=Math.max(-3,Math.min(3,room.performance[p.id]||0));
    return {profileId:p.profileId,name:p.name,seat:p.id,role:p.role,won,bonus,points:3+(won?7:0)+bonus};
  }):[]};
}
export function leaderboard(rooms){
  const totals=new Map();let games=0;
  for(const room of Object.values(rooms)){
    if(!room.result?.counted)continue;games++;
    for(const p of room.result.players){
      let row=totals.get(p.profileId);
      if(!row){row={id:p.profileId.slice(0,12),name:p.name,points:0,games:0,wins:0,roles:{}};totals.set(p.profileId,row);}
      row.points+=p.points;row.games++;row.wins+=Number(p.won);
      const role=row.roles[p.role]??={games:0,wins:0};role.games++;role.wins+=Number(p.won);
    }
  }
  const rows=[...totals.values()].sort((a,b)=>b.points-a.points||b.wins/b.games-a.wins/a.games||b.wins-a.wins||a.id.localeCompare(b.id));
  rows.forEach((r,i)=>{const prev=rows[i-1];r.rank=prev&&r.points===prev.points&&r.wins/r.games===prev.wins/prev.games&&r.wins===prev.wins?prev.rank:i+1;});
  const awards=Object.entries(roles).map(([role,title])=>{
    const eligible=rows.filter(r=>r.roles[role]?.games>=3&&r.roles[role].wins>0).sort((a,b)=>b.roles[role].wins-a.roles[role].wins||b.roles[role].wins/b.roles[role].games-a.roles[role].wins/a.roles[role].games);
    const best=eligible[0]?.roles[role];
    return {role,title,winners:eligible.filter(r=>r.roles[role].wins===best?.wins&&r.roles[role].wins/r.roles[role].games===best.wins/best.games).map(r=>({id:r.id,name:r.name,...r.roles[role]}))};
  });
  return {games,rows,awards};
}
