import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=process.cwd();
const web=path.join(root,'deploy/web');
rmSync(web,{recursive:true,force:true});mkdirSync(web,{recursive:true});cpSync(path.join(root,'dist'),web,{recursive:true});
const entries=[];
function collect(dir){for(const entry of readdirSync(path.join(root,dir),{withFileTypes:true})){const name=dir+'/'+entry.name;if(entry.isDirectory())collect(name);else entries.push(name);}}
collect('deploy/web');collect('server');entries.push('package.json');
writeFileSync(path.join(root,'deploy/artifacts.sha256'),entries.sort().map(p=>createHash('sha256').update(readFileSync(path.join(root,p))).digest('hex')+'  '+p+'\n').join(''));
console.log('Deployment web assets and SHA-256 manifest refreshed. Commit them with the source.');
