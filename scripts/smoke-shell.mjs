import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
let socket;
try {
  let page;
  for (let i=0;i<180;i++) {
    try { page = (await (await fetch("http://127.0.0.1:19222/json", {signal:AbortSignal.timeout(3000)})).json()).find(p=>p.type==="page" && p.url.startsWith("http://127.0.0.1:8000")); } catch {}
    if (page) break;
    await sleep(1000);
  }
  if (!page) throw new Error("Packaged window did not load local frontend");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  await sleep(2000);
  const response = new Promise(resolve=>socket.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id===1)resolve(m);}));
  socket.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"JSON.stringify({url:location.href,text:document.body.innerText,rendered:document.querySelector('#root')?.children.length})",returnByValue:true}}));
  const result=JSON.parse((await response).result.result.value);
  if (!result.rendered) throw new Error("React did not render");
  fs.writeFileSync("desktop-build/shell-smoke.json",JSON.stringify(result,null,2));
  console.log("PASS: packaged Electron started its backend and rendered the bundled React UI",result.url);
  socket.send(JSON.stringify({id:2,method:"Runtime.evaluate",params:{expression:"window.close()"}}));
  await sleep(3000);
} finally {
  socket?.close();
}
