// Public, browser-safe role metadata. Abilities remain authoritative in game.js.
export const ROLE_DEFINITIONS = Object.freeze({
  wolf:{label:'狼人',team:'wolf',category:'wolf',nightPhase:'wolf',artIndex:0,awardTitle:'狼王',description:'藏身于人群之中，与同伴一起，等待黑夜降临。每晚共同选择一名袭击目标。'},
  seer:{label:'预言家',team:'good',category:'god',nightPhase:'seer',artIndex:1,awardTitle:'神眼预言家',description:'穿透迷雾，寻找真相。每晚查验一名玩家，得知对方是否属于狼人阵营。'},
  witch:{label:'女巫',team:'good',category:'god',nightPhase:'witch',artIndex:2,awardTitle:'灵药女巫',description:'一瓶解药，一瓶毒药。每晚最多使用一瓶，解药仅首夜可自救。'},
  hunter:{label:'猎人',team:'good',category:'god',artIndex:3,awardTitle:'神枪猎人',description:'最后一声枪响，也能改变命运。出局后可带走一名玩家，被毒杀时不能开枪。'},
  idiot:{label:'白痴',team:'good',category:'god',artIndex:5,awardTitle:'不屈白痴',description:'看似糊涂，却有自己的生存之道。首次被放逐翻牌免死并失去投票权。'},
  villager:{label:'平民',team:'good',category:'villager',artIndex:4,awardTitle:'平民之光',description:'没有特殊技能，但你的观察与每一票，都是照亮黑夜的力量。'},
});
export const DEFAULT_RULESET_ID='classic12';
export const BOARD_PRESETS = Object.freeze({
  classic12:{id:'classic12',version:1,label:'12 人预女猎白',playerCount:12,roles:{wolf:4,seer:1,witch:1,hunter:1,idiot:1,villager:4}},
});
export function getPreset(id=DEFAULT_RULESET_ID){
  if(!Object.hasOwn(BOARD_PRESETS,id))throw new Error('暂不支持该角色板型');
  return BOARD_PRESETS[id];
}
export function presetRoles(id=DEFAULT_RULESET_ID){
  return Object.entries(getPreset(id).roles).flatMap(([role,count])=>Array(count).fill(role));
}
