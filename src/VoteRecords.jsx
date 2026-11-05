import React, {useState} from 'react';
import {ArrowRight, Gavel} from 'lucide-react';
import Modal from './Modal.jsx';
import './VoteRecords.css';

const statusText={abstained:'弃票',dead:'已出局', 'no-vote':'无投票权'};
function outcomeText(record){
  if(record.outcome==='tie')return '最高票平票，本轮无人被放逐';
  if(record.outcome==='all-abstained')return '全员弃票，本轮无人被放逐';
  if(record.outcome==='idiot-revealed')return `${record.target} 号白痴翻牌免死，失去投票权`;
  return `${record.target} 号被放逐`;
}
function VoteMatrix({record}){
  return <div className="vote-matrix"><table><caption>行是投票人，列是被投票人；金色圆点表示投给该座位。</caption><thead><tr><th scope="col">投票人 ↓ / 目标 →</th>{record.ballots.map(player=><th scope="col" key={player.seat} title={player.name}>{player.seat} 号</th>)}</tr></thead><tbody>{record.ballots.map(player=><tr key={player.seat}><th scope="row"><strong>{player.seat} 号</strong><span>{player.name}</span></th>{player.status==='voted'?record.ballots.map(target=><td key={target.seat} className={player.target===target.seat?'vote-mark':''}>{player.target===target.seat?<span aria-label={`${player.seat} 号投给 ${target.seat} 号`}>●</span>:<span aria-hidden="true">—</span>}</td>):<td colSpan={record.ballots.length} className="vote-no-ballot">{statusText[player.status]}</td>}</tr>)}</tbody><tfoot><tr><th scope="row">得票数</th>{record.ballots.map(player=><td key={player.seat}>{record.totals.find(total=>total.seat===player.seat)?.votes||0}</td>)}</tr></tfoot></table></div>;
}
function VoteList({record}){
  return <ol className="vote-mobile-list">{record.ballots.map(player=><li key={player.seat}><span className="vote-seat">{player.seat}</span><span className="vote-name">{player.name}</span><ArrowRight size={16} aria-hidden="true"/>{player.status==='voted'?<span className="vote-target"><strong>{player.target} 号</strong><small>{record.ballots.find(target=>target.seat===player.target)?.name}</small></span>:<span className="vote-target vote-status">{statusText[player.status]}</span>}</li>)}</ol>;
}
export default function VoteRecords({room,onClose}){
  const [day,setDay]=useState(null);
  const records=room.voteRecords||[];
  const record=records.find(item=>item.day===day)||records.at(-1);
  const cast=record?.ballots.filter(player=>player.status==='voted').length||0;
  const abstained=record?.ballots.filter(player=>player.status==='abstained').length||0;
  return <Modal title="投票记录" className="vote-dialog" onClose={onClose}><div className="vote-toolbar"><p className="muted">第 {room.round||1} 局 · 仅展示已结算的公开投票</p>{record&&<label>查看日期<select aria-label="查看投票日期" value={record.day} onChange={event=>setDay(Number(event.target.value))}>{records.map(item=><option key={item.day} value={item.day}>第 {item.day} 天</option>)}</select></label>}</div>
    {!record?<div className="vote-empty"><Gavel size={36} strokeWidth={1}/><h3>投票结算后，记录会出现在这里</h3><p>所有人提交后，由法官结算才会公开。<br/>投票进行中不会显示任何人的选择。</p></div>:<><section className="vote-result" aria-label="本次投票结果"><div><h3>第 {record.day} 天 · {outcomeText(record)}</h3><p>{cast} 票投给玩家 · {abstained} 人弃票</p></div><Gavel size={24}/></section><div className="vote-totals" aria-label="得票汇总">{record.totals.map(total=><div key={total.seat}><span>{total.seat} 号</span><meter min="0" max={Math.max(1,cast)} value={total.votes} aria-label={`${total.seat} 号得票`}/><strong>{total.votes} 票</strong></div>)}</div><VoteMatrix record={record}/><VoteList record={record}/></>}
    <p className="vote-footnote">房间创建时已开启，整场保持一致。同房间开始下一局后，投票记录重新记录；积分继续保留。</p>
  </Modal>;
}
