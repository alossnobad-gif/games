import React, {useId, useState} from 'react';
import {Gavel} from 'lucide-react';
import Modal from './Modal.jsx';
import './VoteRecords.css';

const statusText={abstained:'弃票',dead:'已出局', 'no-vote':'无投票权'};
function outcomeText(record){
  if(record.outcome==='tie')return '最高票平票，本轮无人被放逐';
  if(record.outcome==='all-abstained')return '全员弃票，本轮无人被放逐';
  if(record.outcome==='idiot-revealed')return `${record.target} 号白痴翻牌免死，失去投票权`;
  return `${record.target} 号被放逐`;
}
function VoteGroup({target,voters,leading}) {
  const markerId=useId().replace(/:/g,'');
  const height=Math.max(96,voters.length*56-8);
  const offset=(height-(voters.length*56-8))/2;
  return <section className={`vote-flow-group ${leading?'vote-flow-leading':''}`} aria-label={`${target.seat} 号得 ${voters.length} 票`} style={{height}}>
    <ol className="vote-flow-voters">{voters.map(player=><li key={player.seat} title={player.name}><span className="vote-flow-seat">{player.seat}</span><span className="vote-flow-name">{player.name}</span><span className="vote-sr-only">投给 {target.seat} 号</span></li>)}</ol>
    <svg className="vote-flow-lines" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true"><defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 10 5 L 0 10 Z" fill="currentColor"/></marker></defs>{voters.map((player,index)=>{
      const from=offset+24+index*56;
      const to=height/2+(index-(voters.length-1)/2)*Math.min(7,44/voters.length);
      return <path key={player.seat} d={`M 0 ${from} C 42 ${from}, 58 ${to}, 98 ${to}`} markerEnd={`url(#${markerId})`} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>;
    })}</svg>
    <div className="vote-flow-target"><span className="vote-flow-seat">{target.seat}</span><span className="vote-flow-name" title={target.name}>{target.name}</span><div className="vote-flow-count"><strong>{voters.length}</strong><span>票</span></div></div>
  </section>;
}
function VoteFlow({record}) {
  const groups=record.ballots.filter(player=>player.status==='voted').reduce((map,player)=>{
    if(!map.has(player.target))map.set(player.target,[]);
    map.get(player.target).push(player);
    return map;
  },new Map());
  const targets=[...groups].map(([seat,voters])=>({target:record.ballots.find(player=>player.seat===seat),voters})).sort((a,b)=>b.voters.length-a.voters.length||a.target.seat-b.target.seat);
  return <div className="vote-flow"><div className="vote-flow-head"><span>投票人</span><span>被投票人 · 按得票数排序</span></div>
    {targets.length?targets.map(({target,voters},index)=><VoteGroup key={target.seat} target={target} voters={voters} leading={index===0}/>):<p className="vote-flow-no-target">本轮没有玩家获得投票。</p>}
    <div className="vote-flow-others">{Object.entries(statusText).map(([status,label])=>{
      const players=record.ballots.filter(player=>player.status===status);
      return players.length?<section key={status} aria-label={label}><h4>{label}<span>{players.length} 人</span></h4><ul>{players.map(player=><li key={player.seat}><span>{player.seat} 号</span>{player.name}</li>)}</ul></section>:null;
    })}</div>
  </div>;
}
export default function VoteRecords({room,onClose}){
  const [day,setDay]=useState(null);
  const records=room.voteRecords||[];
  const record=records.find(item=>item.day===day)||records.at(-1);
  const cast=record?.ballots.filter(player=>player.status==='voted').length||0;
  const abstained=record?.ballots.filter(player=>player.status==='abstained').length||0;
  return <Modal title="投票记录" className="vote-dialog" onClose={onClose}><div className="vote-toolbar"><p className="muted">第 {room.round||1} 局 · 仅展示已结算的公开投票</p>{record&&<label>查看日期<select aria-label="查看投票日期" value={record.day} onChange={event=>setDay(Number(event.target.value))}>{records.map(item=><option key={item.day} value={item.day}>第 {item.day} 天</option>)}</select></label>}</div>
    {!record?<div className="vote-empty"><Gavel size={36} strokeWidth={1}/><h3>投票结算后，记录会出现在这里</h3><p>所有人提交后，由法官结算才会公开。<br/>投票进行中不会显示任何人的选择。</p></div>:<><section className="vote-result" aria-label="本次投票结果"><div><h3>第 {record.day} 天 · {outcomeText(record)}</h3><p>{cast} 票投给玩家 · {abstained} 人弃票</p></div><Gavel size={24}/></section><VoteFlow key={record.day} record={record}/></>}
    <p className="vote-footnote">房间创建时已开启，整场保持一致。同房间开始下一局后，投票记录重新记录；积分继续保留。</p>
  </Modal>;
}
