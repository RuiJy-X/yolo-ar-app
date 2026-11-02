from pathlib import Path
import base64
import json

here=Path(__file__).resolve().parent
root=here.parent.parent
template=(here/'demo.template.html').read_text(encoding='utf-8')
start=template.index('function nav(')
end=template.index('window.buildAudio=',start)
replacement=r'''
const recVideo=document.createElement('video'),liveVideo=document.createElement('video');
for(const v of [recVideo,liveVideo]){v.muted=true;v.preload='auto';v.playsInline=true;v.style.display='none';document.body.append(v);}
recVideo.src='data:video/mp4;base64,__REC_VIDEO__';liveVideo.src='data:video/mp4;base64,__LIVE_VIDEO__';
const captureKeys=__CURSOR_KEYS__;
function camera(px,py,z){c.translate(960-px*z,540-py*z);c.scale(z,z);}
function capturedCursor(t,keys){let prev={t:0,x:720,y:430};for(const key of keys){if(t<key.t){const k=ease(seg(t,Math.max(prev.t+.15,key.t-.85),key.t-.12));cursor(lerp(prev.x,key.x,k),lerp(prev.y,key.y,k));return;}prev=key;}const click=keys.reduce((a,k)=>Math.max(a,k.click?clickAt(t,k.t):0),0);cursor(prev.x,prev.y,click);}
function recorded(t){
 const z=kf([[0,1.12],[2.6,1.12],[3.2,1.02],[5.8,1.02],[7,1.72],[9,1.72],[10.6,1.02],[11,1.02],[14,1.45],[16.5,1.45],[18.5,1.7],[22.5,1.7],[24.4,1.02],[28.4,1.02]])(t);
 const px=kf([[0,610],[2.6,610],[3.2,720],[5.8,720],[7,1115],[9,1115],[10.6,720],[11,720],[14,750],[16.5,750],[18.5,1115],[22.5,1115],[24.4,720]])(t);
 const py=kf([[0,380],[3.2,405],[11,405],[14,655],[16.5,655],[18.5,340],[22.5,340],[24.4,405]])(t);
 c.save();camera(px,py,z);c.drawImage(recVideo,0,0,1440,810);capturedCursor(t,captureKeys.recorded);c.restore();
}
function live(t){
 const z=kf([[0,1.04],[1.5,1.04],[2.6,1.35],[3.2,1.35],[4,1.04],[7,1.04],[8.3,1.13],[9.5,1.22],[11.6,1.04]])(t);
 const px=kf([[0,720],[1.5,720],[2.6,1100],[3.2,1100],[4,720],[8.3,720],[9.5,1010],[11.6,720]])(t);
 const py=kf([[0,405],[7,405],[8.3,435],[9.5,295],[11.6,405]])(t);
 c.save();camera(px,py,z);c.drawImage(liveVideo,0,0,1440,810);capturedCursor(t,captureKeys.live);c.restore();
 text('Recorded feed replay',1848,1040,15,C.muted,400,'right');
}
async function prepareVideo(v,t){const target=Math.min(Math.max(0,t),v.duration-.034);if(Math.abs(v.currentTime-target)>.001){await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=target;});}await new Promise(r=>requestAnimationFrame(r));}
window.seek=async function(raw){const t=((raw%60)+60)%60;
 if(t>=7.95&&t<19.3)await prepareVideo(recVideo,t-7.95);
 else if(t>=22&&t<36.3)await prepareVideo(recVideo,t-22+14);
 else if(t>=40&&t<52.3)await prepareVideo(liveVideo,t-40);
 c.reset();c.globalAlpha=1;c.filter='none';c.fillStyle=C.bg;c.fillRect(0,0,1920,1080);
 layer(t,0,1.9,u=>text('Introducing',960,540+8*(1-ease(seg(u,0,.8))),29,C.ink,400,'center'));
 layer(t,1.5,5.25,u=>brand(u));
 layer(t,4.95,8.25,u=>title(u,'Understand the ','action',' in every frame.'));
 layer(t,7.95,19.3,u=>recorded(u));
 layer(t,19,22.3,u=>title(u,'Find the moment. ','Follow the person.',''));
 layer(t,22,36.3,u=>recorded(u+14));
 layer(t,36,40.3,u=>title(u,'See it ','live.',' Stay aware.'));
 layer(t,40,52.3,u=>live(u));
 layer(t,52,57.3,u=>{brandBg(u);title(u,'From footage to ','insight.','');});
 layer(t,57,60.4,u=>brand(u,true));
};
'''
template=template[:start]+replacement+template[end:]
ready=template.index('window.ready=Promise.all')
template=template[:ready]+r'''
const waitVideo=v=>new Promise(resolve=>{if(v.readyState>=2)resolve();else v.addEventListener('loadeddata',resolve,{once:true});});
window.ready=Promise.all([logo.decode(),wordmark.decode(),document.fonts.load('400 28px Inter'),document.fonts.load('600 20px Inter'),waitVideo(recVideo),waitVideo(liveVideo)]).then(async()=>{await seek(0);if(!renderMode)(async function loop(){const t=now();await seek(t);scrub.value=t;document.querySelector('#time').textContent=`0:${Math.floor(t).toString().padStart(2,'0')} / 1:00`;requestAnimationFrame(loop);})();});
</script></html>
'''
template=template.replace('<title>Skysight — product demo</title>','<title>Skysight — actual application UI</title>')
template=template.replace('8–11 Upload Video, courtyard.mp4, Analyze / clicks;', '8–11 Actual app: Upload Video, recorded aerial survey, Analyze / clicks;')
template=template.replace('22–27 action timeline scrub / click;', '22–27 Actual layered action timeline, segment selection and frame details / click;')
template=template.replace('27–32 Person pane / click;', '27–32 Actual Person pane and Overview / click;')
template=template.replace('32–36 full analysis, Save / confirmation;', '32–36 Actual Save Project dialog / confirmation;')
(here/'demo.actual-ui.template.html').write_text(template,encoding='utf-8')
assets={
 '__FONT__':root/'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
 '__LOGO__':root/'src/assets/skysightlogo.png',
 '__WORDMARK__':root/'src/assets/skysightbrand.png',
 '__REC_VIDEO__':here/'actual-ui/recorded-app.mp4',
 '__LIVE_VIDEO__':here/'actual-ui/live-app.mp4',
}
template=template.replace('__CURSOR_KEYS__',(here/'actual-ui/cursor-keys.json').read_text(encoding='utf-8'))
for token,file in assets.items():template=template.replace(token,base64.b64encode(file.read_bytes()).decode())
(here/'demo.html').write_text(template,encoding='utf-8')
print('Built demo.html with unmodified-app screen captures, supplied logos and embedded font. Size:',round(len(template)/1024/1024,1),'MB')
