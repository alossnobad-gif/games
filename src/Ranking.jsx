import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crown, RefreshCw, X } from 'lucide-react';
import './Ranking.css';

const winRate = player => player.games ? `${Math.round(player.wins / player.games * 100)}%` : '—';

function PlayerName({player}) {
  return <span className="rank-player"><strong>{player.name}</strong><small>#{player.id}</small></span>;
}

function EmptyRanking() {
  return <div className="rank-empty"><Crown size={38} strokeWidth={1}/><h3>第一段传奇，等你写下</h3><p>邀请 12 位玩家完成一场真实对局，<br/>就能在这里看到大家的成绩。</p><small>演示对局不计入排行榜</small></div>;
}

function Awards({awards}) {
  return <div className="rank-awards">{awards.map(award => <article key={award.role}>
    <Crown size={22} strokeWidth={1.4}/><div><h3>{award.title}</h3>{award.winners.length ? award.winners.map(player => <div className="rank-award-winner" key={player.id}><PlayerName player={player}/><span>{player.wins} 胜 / {player.games} 局</span></div>) : <p className="muted">虚位以待</p>}</div>
  </article>)}</div>;
}

function DesktopRanking({data}) {
  return <div className="rank-desktop-layout"><section className="rank-board" aria-labelledby="desktop-score-title">
    <div className="rank-section-heading"><h3 id="desktop-score-title">积分排行榜</h3><span>按积分、胜率、胜场排序 · 同分并列</span></div>
    {data.rows.length ? <table className="rank-desktop-table"><thead><tr><th scope="col">名次</th><th scope="col">玩家 / 档案</th><th scope="col">累计积分</th><th scope="col">胜场 / 对局</th><th scope="col">胜率</th></tr></thead><tbody>{data.rows.map(player => <tr key={player.id} className={player.rank <= 3 ? 'rank-leading' : ''}>
      <td><span className={`rank-number place-${player.rank}`}>{String(player.rank).padStart(2,'0')}</span></td><th scope="row"><PlayerName player={player}/></th><td className="rank-points">{player.points}</td><td>{player.wins}<span className="muted"> / {player.games}</span></td><td>{winRate(player)}</td>
    </tr>)}</tbody></table> : <EmptyRanking/>}
  </section><aside className="rank-honors" aria-labelledby="desktop-awards-title"><div className="rank-section-heading"><h3 id="desktop-awards-title">单项荣誉</h3></div><p className="rank-section-note">角色至少 3 局且有 1 胜，即可参与评选。</p><Awards awards={data.awards}/></aside></div>;
}

function MobileRanking({data}) {
  const [tab,setTab] = useState('scores');
  function handleTabKeys(event) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'scores' : event.key === 'End' ? 'awards' : tab === 'scores' ? 'awards' : 'scores';
    setTab(next);
    document.getElementById(next === 'scores' ? 'rank-scores-tab' : 'rank-awards-tab').focus();
  }
  return <><div onKeyDown={handleTabKeys} className="rank-mobile-tabs" role="tablist" aria-label="榜单类型">
    <button id="rank-scores-tab" role="tab" tabIndex={tab === 'scores' ? 0 : -1} aria-selected={tab === 'scores'} aria-controls="rank-mobile-panel" onClick={() => setTab('scores')}>积分排行</button>
    <button id="rank-awards-tab" role="tab" tabIndex={tab === 'awards' ? 0 : -1} aria-selected={tab === 'awards'} aria-controls="rank-mobile-panel" onClick={() => setTab('awards')}>单项荣誉</button>
  </div><section id="rank-mobile-panel" role="tabpanel" aria-labelledby={tab === 'scores' ? 'rank-scores-tab' : 'rank-awards-tab'}>
    {tab === 'scores' ? <>{data.rows.length ? <><p className="rank-section-note">按积分、胜率、胜场排序 · 同分并列</p><ol className="rank-mobile-list">{data.rows.map(player => <li key={player.id}><span className={`rank-number place-${player.rank}`}>{String(player.rank).padStart(2,'0')}</span><div className="rank-mobile-player"><PlayerName player={player}/><span className="rank-mobile-record">{player.wins} 胜 / {player.games} 局 <i>·</i> 胜率 {winRate(player)}</span></div><span className="rank-mobile-score"><strong>{player.points}</strong><small>积分</small></span></li>)}</ol></> : <EmptyRanking/>}</> : <><p className="rank-section-note">角色至少 3 局且有 1 胜，即可参与评选。</p><Awards awards={data.awards}/></>}
  </section></>;
}

export default function Ranking({onClose,roomId,token}) {
  const dialog = useRef(null);
  const [snapshot,setData] = useState(null);
  const [scope,setScope] = useState('all');
  const data = snapshot?.scope === scope ? snapshot : null;
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [revision,setRevision] = useState(0);
  const [mobile,setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change',update);
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    return () => { media.removeEventListener('change',update); document.body.style.overflow = previousOverflow; previous?.focus(); };
  },[]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    async function load() {
      try {
        const response = await fetch(scope === 'room' ? `/api/leaderboard?room=${encodeURIComponent(roomId)}` : '/api/leaderboard',{signal:controller.signal,headers:scope === 'room' ? {'X-Moonveil-Token':token} : {}});
        const next = await response.json();
        if (!response.ok) throw new Error(next.error || '排行榜读取失败');
        if(!controller.signal.aborted)setData({...next,scope});
      } catch (e) { if (!controller.signal.aborted) setError(e.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  },[revision,scope,roomId,token]);
  return <dialog className={`ranking-dialog ${mobile ? 'ranking-mobile' : 'ranking-desktop'}`} ref={dialog} aria-labelledby="ranking-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className="rank-header"><div className="rank-title-row">{mobile && <button className="icon-button rank-back" aria-label="返回游戏" onClick={onClose}><ArrowLeft size={22}/></button>}<h2 id="ranking-title">小镇荣誉榜</h2>{!mobile && <button className="icon-button" aria-label="关闭排行榜" onClick={onClose}><X size={22}/></button>}</div><div className="rank-toolbar"><p>{scope === 'room' ? `房间 ${roomId} · 历次对局累计` : '所有房间 · 历史累计'} <span>·</span> {data ? `${data.games} 局已结算` : '仅统计真实完整对局'}</p><button className="outline rank-refresh" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} className={loading ? 'rank-spinning' : ''}/>{loading ? '读取中' : '刷新榜单'}</button></div></header>
    <div className="rank-scope" role="group" aria-label="排名范围"><button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>历史总榜</button><button aria-pressed={scope === 'room'} disabled={!roomId || !token} onClick={() => setScope('room')}>本房间榜</button><span>{scope === 'room' ? '只累计本房间内已结算的真实对局' : '累计所有房间内已结算的真实对局'}</span></div>
    <div className="rank-content" aria-busy={loading}>
      {error && <div className="rank-error" role="alert"><span>{data ? '刷新失败，正在显示上次的榜单。' : '暂时无法读取排行榜。'}{error}</span><button className="text-button" onClick={() => setRevision(value => value + 1)} disabled={loading}>重试</button></div>}
      {!data && loading && <p className="rank-loading" role="status">正在读取排行榜…</p>}
      {data && (mobile ? <MobileRanking data={data}/> : <DesktopRanking data={data}/>)}
      <RankingRules/>
    </div>
  </dialog>;
}

function RankingRules() {
  return <details className="ranking-rules"><summary>积分、排名与评奖规则</summary><p>历史总榜累计所有房间的已结算对局；本房间榜只累计当前房间的已结算对局。同房间可以连续进行多局，两种榜单均保留此前积分；进行中的对局不计入。</p><p>每局参赛 3 分，阵营获胜 +7 分，无存活奖励。表现分合计限制在 −3 至 +3 分；胜者 7–13 分，败者 0–6 分。</p><p>好人每次投中狼人 +1；预言家首次查中每位狼人 +1（重复查验不加分）；女巫成功使用解药 +1，毒中狼人 +2、毒中好人 −2；猎人带走狼人 +2、好人 −2。狼人不设刀人奖励，依靠团队胜利得分；弃票、空刀、放弃技能不加减分。法官代操作按同一规则计算。</p><p>总榜按积分、胜率、胜场排序，完全相同并列。角色奖要求该角色至少 3 局且至少 1 胜，按角色胜场、角色胜率排序，同分并列。荣誉独立于总榜，不额外加分。</p><p>同一浏览器自动保留独立档案，跨房间累计；同名不合并。清除浏览器数据或换设备会建立新档案，暂不支持找回。昵称取该档案首个计分记录。同一档案每房间限一个座位。演示、补演示玩家、未结束和缺少行动数据的旧局不计分。榜单仅展示公开昵称与已结束对局统计，不公布正在进行的身份。</p></details>;
}
