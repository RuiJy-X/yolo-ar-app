import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {setupTransport,dir,seekApp,settle} from './app-transport.mjs';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const p=await b.newPage({viewport:{width:1440,height:810}});
await setupTransport(p,{complete:true,progress:100});
await p.goto('http://127.0.0.1:5174/library');await p.getByText('Video Analysis',{exact:true}).waitFor();
await p.locator('input[type=file]').setInputFiles({name:'Recorded aerial survey.mp4',mimeType:'video/mp4',buffer:readFileSync(path.join(dir,'source.mp4'))});
await p.getByRole('button',{name:'Analyze',exact:true}).click();await p.getByRole('button',{name:'Logs',exact:true}).waitFor();await p.waitForFunction(()=>document.querySelector('video')?.readyState>=3);await settle(p);
await p.getByRole('button',{name:'Overlay On',exact:true}).click();await p.getByRole('button',{name:'Toggle layers',exact:true}).click();await p.getByRole('button',{name:'Unknown',exact:true}).click();await seekApp(p,110/59.94);
await p.locator('summary').filter({hasText:'Waving'}).click();await p.getByRole('button',{name:'Focus Person #28 on video',exact:true}).first().click();await settle(p);
const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','15','-preset','fast','-threads','2',path.join(dir,'person-app.mp4')],{stdio:['pipe','inherit','inherit']});const done=new Promise((r,j)=>ff.on('close',c=>c?j(Error('ffmpeg '+c)):r()));
for(let i=0;i<99;i++){
 if(i===6){const loc=p.getByRole('button',{name:'P#28',exact:true});const bb=await loc.boundingBox();await loc.click();await settle(p);const keys=JSON.parse(readFileSync(path.join(dir,'cursor-keys.json')));keys.recorded.push({t:20.2,x:bb.x+bb.width/2,y:bb.y+bb.height/2,click:true});keys.recorded.sort((a,b)=>a.t-b.t);writeFileSync(path.join(dir,'cursor-keys.json'),JSON.stringify(keys));await p.screenshot({path:path.join(dir,'10-person-details.png')});const ev=JSON.parse(readFileSync(path.join(dir,'capture-evidence.json')));ev.screens=ev.screens.map(s=>s.name==='10-person-details'?{name:s.name,text:null}:s);ev.screens.find(s=>s.name==='10-person-details').text=await p.locator('body').innerText();writeFileSync(path.join(dir,'capture-evidence.json'),JSON.stringify(ev,null,2));}
 const buf=await p.screenshot({type:'jpeg',quality:95,animations:'disabled'});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
}
ff.stdin.end();await done;await b.close();console.log('Captured actual Person tab.');
