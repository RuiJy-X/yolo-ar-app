import { readFileSync } from 'node:fs';
import path from 'node:path';

export const dir=path.resolve('actual-ui');
export const stored=JSON.parse(readFileSync(path.join(dir,'analysis.json')));
export const analysis=stored.analysis_summary ?? stored;
export const meta=JSON.parse(readFileSync(path.join(dir,'meta.json')));
export const fps=stored.fps;
export const detections=Object.values(analysis.grouped_detections).flat();
export const byFrame=new Map();
for(const d of detections){if(!byFrame.has(d.frame_number))byFrame.set(d.frame_number,[]);byFrame.get(d.frame_number).push(d);}
export const telemetry={connected:true,is_flying:true,battery:82,height:180,flight_time:24,temperature:31,last_error:null};
const video=readFileSync(path.join(dir,'annotated.mp4')),source=readFileSync(path.join(dir,'source.mp4'));
export const result={type:'video_inference',output_video_url:'/annotated.mp4',source_video_url:'/source.mp4',output_download_url:'/annotated.mp4',frames_processed:326,total_frames:326,people_instances_detected:detections.length,tracks_created:36,fps,duration_seconds:5.439,processing_seconds:43.619,output_codec:'mp4v',resolution:{width:1920,height:1080},analysis_summary:analysis};
export const history={...meta,videoUrl:'/annotated.mp4',sourceVideoUrl:'/source.mp4',analysis:stored};

export async function setupTransport(page,state){
 const allowed=[];
 await page.route('http://localhost:8000/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  allowed.push({method:req.method(),path:p});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(p.endsWith('.mp4')){
   const body=p.includes('source')?source:video,range=req.headers().range?.match(/bytes=(\d+)-(\d*)/);
   if(range){const start=+range[1],end=range[2]?Math.min(+range[2],body.length-1):body.length-1;return route.fulfill({status:206,body:body.subarray(start,end+1),contentType:'video/mp4',headers:{...headers,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${body.length}`,'Content-Length':String(end-start+1)}});}
   return route.fulfill({body,contentType:'video/mp4',headers:{...headers,'Accept-Ranges':'bytes'}});
  }
  let json={};
  if(p==='/api/infer-video'&&req.method()==='POST')json={job_id:'capture-replay'};
  else if(p.startsWith('/api/infer-video/capture-replay'))json=state.complete?{status:'completed',progress_percent:100,result}:{status:'processing',progress_percent:state.progress??30,progress_message:'Processing recorded video...',frame_index:Math.round(326*(state.progress??30)/100),total_frames:326};
  else if(p.startsWith('/api/history/'))json={...history,filename:state.savedName??meta.filename};
  else if(p==='/api/history'&&req.method()==='POST')json={...history,filename:state.savedName??'Recorded analysis'};
  else if(p==='/api/history')json=[history];
  else if(p==='/api/tello/status')json=telemetry;
  else if(p==='/api/tello/connect')json={success:true,telemetry};
  else if(p==='/api/upload-realtime-session')json={annotated_filename:'replay.mp4',source_filename:'replay-source.mp4'};
  else if(p==='/analyze-video')json=analysis;
  else if(p.includes('health'))json={status:'ok'};
  else if(p==='/api/tello/command')throw new Error('Flight commands are deliberately blocked in capture.');
  return route.fulfill({json,headers});
 });
 const sockets=[];
 await page.routeWebSocket(/localhost:8000/,ws=>{sockets.push(ws);ws.onMessage(()=>{});});
 return {allowed,sockets};
}

export function makePacket(seconds,frameIndex,forceWave=false){
 const sourceFrame=Math.max(1,Math.min(325,Math.round(seconds*fps)+1));
 const ds=byFrame.get(sourceFrame)??[];
 const persons=ds.map(d=>({person_id:d.person_id,action:{label:d.action_label,confidence:d.confidence},bbox:d.bbox,keypoints:d.keypoints,all_scores:d.all_scores}));
 // For the alert demonstration, replay real consecutive waving detections from the stored session.
 const waving=analysis.grouped_detections.Waving[frameIndex%analysis.grouped_detections.Waving.length];
 const best=forceWave?{label:waving.action_label,confidence:waving.confidence}:persons.reduce((a,p)=>p.action.confidence>a.confidence?p.action:a,{label:'Unknown',confidence:0});
 const payload={type:'inference',frame_index:frameIndex+1,detection:persons.length>0,action:best,persons:forceWave?[{person_id:waving.person_id,action:best,bbox:waving.bbox,keypoints:waving.keypoints,all_scores:waving.all_scores}]:persons,tello_telemetry:telemetry};
 const jpgIndex=Math.max(1,Math.min(163,Math.floor(seconds*30)+1));
 const jpg=readFileSync(path.join(dir,'jpeg',String(jpgIndex).padStart(4,'0')+'.jpg'));
 const j=Buffer.from(JSON.stringify(payload)),head=Buffer.alloc(4);head.writeUInt32BE(j.length);
 return Buffer.concat([head,j,jpg]);
}

export async function seekApp(page,time){
 await page.evaluate(async time=>{
  const v=document.querySelector('video');if(!v)return;v.pause();
  if(Math.abs(v.currentTime-time)>.002){await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=time;});}
  v.dispatchEvent(new Event('timeupdate',{bubbles:true}));
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 },time);
}

export async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
