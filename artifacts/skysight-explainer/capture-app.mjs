import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { setupTransport,seekApp,settle,makePacket,dir,meta } from './app-transport.mjs';

const FPS=30;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-video-capture=${path.join(dir,'camera.y4m')}`]});
const context=await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1,permissions:['camera'],locale:'en-US'});
const errors=[],cursorKeys={recorded:[],live:[]},evidence=[];
const state={complete:false,progress:35};
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const transport=await setupTransport(page,state);
let activeClip='recorded';
async function click(locator,t){const box=await locator.boundingBox();if(!box)throw Error('No visible target at '+t);cursorKeys[activeClip].push({t,x:box.x+box.width/2,y:box.y+box.height/2,click:true});await locator.click();await settle(page);}
async function shot(name){await page.screenshot({path:path.join(dir,name+'.png')});evidence.push({name,text:(await page.locator('body').innerText()).slice(0,6000)});}
function encoder(name){const p=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(FPS),'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','15','-preset','fast','-threads','2','-movflags','+faststart',path.join(dir,name+'.mp4')],{stdio:['pipe','inherit','inherit']});return{p,done:new Promise((resolve,reject)=>p.on('close',code=>code?reject(Error('ffmpeg '+code)):resolve()))};}
async function push(e){const buf=await page.screenshot({type:'jpeg',quality:95,animations:'disabled'});if(!e.p.stdin.write(buf))await new Promise(r=>e.p.stdin.once('drain',r));}
async function end(e){e.p.stdin.end();await e.done;}

await page.goto('http://127.0.0.1:5174/library');await page.getByText('Video Analysis',{exact:true}).waitFor();await settle(page);await shot('01-upload');
const rec=encoder('recorded-app');
for(let frame=0;frame<Math.ceil(28.4*FPS);frame++){
 const t=frame/FPS;
 if(frame===33){const loc=page.getByRole('button',{name:'Upload Video',exact:true});const bb=await loc.boundingBox();cursorKeys.recorded.push({t,x:bb.x+bb.width/2,y:bb.y+bb.height/2,click:true});await page.locator('input[type=file]').setInputFiles({name:'Recorded aerial survey.mp4',mimeType:'video/mp4',buffer:readFileSync(path.join(dir,'source.mp4'))});await page.waitForFunction(()=>document.querySelector('video')?.readyState>=3);await settle(page);await shot('02-file-loaded');}
 if(frame===90){await click(page.getByRole('button',{name:'Analyze',exact:true}),t);await page.getByText('Processing recorded video...',{exact:true}).waitFor();await shot('03-processing');}
 if(frame===129)state.progress=70;
 if(frame===162){state.complete=true;await page.getByRole('button',{name:'Logs',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=3);await settle(page);await seekApp(page,1.85);await shot('04-real-results');}
 if(frame===183){await click(page.getByRole('button',{name:'Overlay On',exact:true}),t);}
 if(frame===207){await click(page.locator('summary').filter({hasText:'Walking'}),t);await shot('05-log-cards');}
 if(frame===255){await click(page.locator('summary').filter({hasText:'Walking'}),t);await click(page.locator('summary').filter({hasText:'Waving'}),t+.1);await shot('06-waving-episodes');}
 if(frame===420){await click(page.getByRole('button',{name:'Toggle layers',exact:true}),t);await seekApp(page,.8);await shot('07-layered-timeline');}
 if(frame===444){await click(page.getByRole('button',{name:'Unknown',exact:true}),t);}
 if(frame===489){await click(page.getByRole('button',{name:/Waving · P28/}).first(),t);await shot('08-timeline-selection');}
 if(frame===552){await click(page.getByRole('button',{name:/Frame #/}).first(),t);await shot('09-frame-details');}
 if(frame===585){await click(page.getByRole('button',{name:'Logs',exact:true}),t);const s=page.locator('summary').filter({hasText:'Waving'});if(!await s.evaluate(e=>e.parentElement.open))await click(s,t+.1);}
 if(frame===600){await click(page.getByRole('button',{name:'Focus Person #28 on video',exact:true}).first(),t);await click(page.getByRole('button',{name:'P#28',exact:true}),t+.2);await shot('10-person-details');}
 if(frame===699){await click(page.getByRole('button',{name:'Overview',exact:true}),t);await shot('11-overview');}
 if(frame===750){await click(page.getByRole('button',{name:'Save',exact:true}),t);await shot('12-save-dialog');}
 if(frame>=765&&frame<795){const full='Recorded aerial survey';await page.getByPlaceholder('Enter a name for your project').fill(full.slice(0,Math.min(full.length,Math.floor((frame-765)*full.length/25)+1)));}
 if(frame===801){state.savedName='Recorded aerial survey';await click(page.getByRole('button',{name:'Save',exact:true}).last(),t);await shot('13-saved');}
 if(t>=5.4&&t<14){await seekApp(page,Math.min(5.15,1.85+(t-5.4)*.37));}
 await push(rec);
 if(frame%90===0)console.log('Recorded app',frame+'/'+Math.ceil(28.4*FPS));
}
await end(rec);

activeClip='live';
await page.goto('http://127.0.0.1:5174/realtime?mode=webcam');await page.getByRole('button',{name:'Open Camera',exact:true}).waitFor();await settle(page);await shot('14-webcam-idle');
const live=encoder('live-app');let drone=false;
for(let frame=0;frame<Math.ceil(12.4*FPS);frame++){
 const t=frame/FPS;
 if(frame===21){await click(page.getByRole('button',{name:'Open Camera',exact:true}),t);await page.getByRole('button',{name:'Stop Camera',exact:true}).waitFor();await settle(page);}
 if(frame>=22){const sourceTime=drone?1.83+Math.min(1.35,(t-5.4)*.22):.8+(t%4)*.75;const packet=makePacket(Math.min(5.2,sourceTime),frame,t>=8.1);for(const ws of transport.sockets){if(ws.url().includes('/ws/')&&!ws.url().includes('/control')){try{ws.send(packet);}catch{}}}}
 if(frame===33){await shot('15-webcam-active');}
 if(frame===123){await click(page.getByRole('button',{name:'Realtime',exact:true}),t);await shot('16-realtime-menu');}
 if(frame===162){await click(page.getByRole('link',{name:'Drone View',exact:true}),t);await page.getByText('TELLO CONNECTED',{exact:true}).waitFor();await settle(page);drone=true;await shot('17-drone-panel');}
 if(frame===292){await shot('18-waving-alert');}
 if(frame===318){const alerts=page.getByRole('button').filter({hasText:'Waving Alerts'});if(await alerts.count())await click(alerts.first(),t);await shot('19-expanded-live-alert');}
 await push(live);
 if(frame%90===0)console.log('Live app',frame+'/'+Math.ceil(12.4*FPS));
}
await end(live);
writeFileSync(path.join(dir,'cursor-keys.json'),JSON.stringify(cursorKeys));
writeFileSync(path.join(dir,'capture-evidence.json'),JSON.stringify({source:'Unmodified React app at http://127.0.0.1:5174',viewport:{width:1440,height:810},fps:FPS,historyId:meta.id,transport:'Read-only stored-session replay; live telemetry is demonstration data. All backend HTTP and WebSocket requests intercepted in the capture browser. No hardware connection or app source modification.',browserErrors:errors,screens:evidence,requests:transport.allowed},null,2));
await browser.close();
console.log('Actual application capture complete. Browser errors:',errors.length);
if(errors.length)process.exit(1);
