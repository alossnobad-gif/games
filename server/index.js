import { randomUUID, createHash } from 'node:crypto';
import { settle, leaderboard } from './ranking.js';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoom, addPlayer, fillDemo, start, advance, action, view } from './game.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const versionFile=path.resolve(root,'../RELEASE_SHA');
const version=existsSync(versionFile)?readFileSync(versionFile,'utf8').trim():'development';
const data=process.env.DATA_DIR||path.resolve(root,'../../games-data');
mkdirSync(data,{recursive:true,mode:0o700});
const file=path.join(data,'rooms.json');
const rooms=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
function save(){writeFileSync(file+'.tmp',JSON.stringify(rooms),{mode:0o600});renameSync(file+'.tmp',file);}
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/health')return reply(res,200,{ok:true,version});
    if(url.pathname.startsWith('/api/')){
      // Keep HTTP Basic authentication available to the reverse proxy.
      const token=req.headers['x-moonveil-token']||req.headers.authorization?.replace(/^Bearer /,'');
      if(req.method==='POST'){
        if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(res,415,{error:'需要 JSON 请求'});
        // Require same-origin browser mutations. CLI tests may omit Origin.
        if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return reply(res,403,{error:'跨站请求被拒绝'});
        let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return reply(res,413,{error:'请求过大'});}
        const b=JSON.parse(body||'{}');
        if(url.pathname==='/api/rooms'){
          // Bound room count and persistent storage for a small single-process server.
          if(Object.keys(rooms).length>=200)return reply(res,429,{error:'房间数量已达上限，请联系管理员'});
          let r=createRoom(Boolean(b.demo));while(rooms[r.id])r=createRoom(Boolean(b.demo));rooms[r.id]=r;save();return reply(res,201,{id:r.id,token:r.judge});
        }
        const match=url.pathname.match(/^\/api\/rooms\/(\d{6})\/(join|command)$/);
        if(!match)return reply(res,404,{error:'接口不存在'});
        const r=rooms[match[1]];if(!r)return reply(res,404,{error:'房间不存在'});
        if(match[2]==='join'){
          const profileToken=typeof b.profileToken==='string'&&/^[0-9a-f-]{36}$/i.test(b.profileToken)?b.profileToken:randomUUID();
          const profileId=createHash('sha256').update(profileToken).digest('hex');
          if(r.players.some(p=>p.profileId===profileId))return reply(res,409,{error:'此玩家档案已在本房间入座，请使用原来的房间凭证'});
          const p=addPlayer(r,b.name);p.profileId=profileId;save();return reply(res,200,{id:r.id,token:p.token,seat:p.id,profileToken});
        }
        const judge=token===r.judge,player=r.players.find(p=>p.token===token);
        if(!judge&&!player)return reply(res,403,{error:'凭证无效'});
        // Transactional command: failed actions never leave partial mutations.
        const next=structuredClone(r);
        if(b.command==='action')action(next,judge?b.actor:player.id,b.target,b.kind);
        else if(!judge)return reply(res,403,{error:'仅法官可执行此操作'});
        else if(b.command==='start')start(next);
        else if(b.command==='next')advance(next);
        else if(b.command==='fill'){fillDemo(next);next.unranked=true;}
        else return reply(res,400,{error:'未知操作'});
        settle(next);rooms[r.id]=next;save();return reply(res,200,{ok:true});
      }
      if(req.method==='GET'){
        if(url.pathname==='/api/leaderboard')return reply(res,200,leaderboard(rooms));
        const m=url.pathname.match(/^\/api\/rooms\/(\d{6})$/);if(!m||!rooms[m[1]])return reply(res,404,{error:'房间不存在'});
        return reply(res,200,view(rooms[m[1]],token,url.searchParams.get('preview')));
      }
      return reply(res,405,{error:'不支持的请求方式'});
    }
    const decoded=decodeURIComponent(url.pathname),p=path.resolve(root,'.'+decoded);
    if(!p.startsWith(root+path.sep)&&p!==root)return reply(res,403,{error:'禁止访问'});
    const actual=existsSync(p)&&statSync(p).isFile()?p:path.join(root,'index.html');
    if(!existsSync(actual))return reply(res,503,{error:'请先执行 npm run build'});
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':mime[path.extname(actual)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':actual.endsWith('.html')?'no-cache':'public, max-age=3600'});createReadStream(actual).pipe(res);
  }catch(e){reply(res,400,{error:e instanceof SyntaxError?'请求数据格式错误':e.message});}
});
server.listen(Number(process.env.PORT||3201),process.env.HOST||'127.0.0.1',()=>console.log(`月隐镇服务已启动，端口 ${process.env.PORT||3201}`));
