import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
process.env.DB_PATH=':memory:';process.env.NODE_ENV='test';
const {server}=await import('./server.mjs');
const {handleAPI}=await import('./server.mjs');
async function request(path,b={},token){if(path==='send')b={relayAllowed:true,...b};const response=await handleAPI(new Request('http://localhost/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(b)}));return {status:response.status,body:await response.json()}}
const enc=new TextEncoder(),dec=new TextDecoder();
async function identity(id){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);const r=await request('register',{id,password:'a-very-good-password',pub});assert.equal(r.status,200);return {id,pair,pub,token:r.body.token}}
async function secret(a,b){return crypto.subtle.deriveKey({name:'ECDH',public:b.pair.publicKey},a.pair.privateKey,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
test('only one partner, encryption, ciphertext queue and delete after ack',async()=>{
const a=await identity('aryan'),b=await identity('shreya'),c=await identity('other');
assert.equal((await request('me')).status,401);
assert.equal((await request('login',{id:a.id,password:'wrong-password'})).status,401);
const bm=(await request('me',{},b.token)).body;
assert.equal((await request('pair',{code:bm.code},a.token)).status,200);
assert.equal((await request('pair',{code:bm.code},c.token)).status,400);
const cm=(await request('me',{},c.token)).body;
assert.equal((await request('pair',{code:cm.code},a.token)).status,409);
const am=(await request('me',{},a.token)).body;
assert.equal(am.partner,'shreya');assert.equal((await request('me',{},b.token)).body.partner,'aryan');
const ka=await secret(a,b),kb=await secret(b,a),kc=await secret(c,a),iv=crypto.getRandomValues(new Uint8Array(12));
const aad=enc.encode('aryan|shreya');const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},ka,enc.encode('love you'));
assert.equal(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},kb,cipher)),'love you');
await assert.rejects(crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},kc,cipher));
const corrupt=new Uint8Array(cipher);corrupt[0]^=1;await assert.rejects(crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},kb,corrupt));
const payload=JSON.stringify({iv:Buffer.from(iv).toString('base64'),data:Buffer.from(cipher).toString('base64')});
assert.equal((await request('send',{id:'m1',epoch:am.epoch,payload},a.token)).status,200);
assert.equal((await request('receive',{},c.token)).body.messages.length,0);
const incoming=(await request('receive',{},b.token)).body.messages;assert.equal(incoming.length,1);assert.ok(!JSON.stringify(incoming).includes('love you'));
await request('ack',{ids:['m1']},c.token);assert.equal((await request('receive',{},b.token)).body.messages.length,1);
await request('ack',{ids:['m1']},b.token);assert.equal((await request('receive',{},b.token)).body.messages.length,0);
await request('send',{id:'m2',epoch:am.epoch,payload},a.token);
assert.equal((await request('unpair',{confirm:'wrong'},a.token)).status,409);
assert.equal((await request('unpair',{confirm:'shreya'},a.token)).status,200);
assert.equal((await request('receive',{},b.token)).body.messages.length,0);
assert.equal((await request('me',{},b.token)).body.partner,null);
assert.equal((await request('send',{id:'m3',epoch:am.epoch,payload},a.token)).status,409);
assert.equal((await request('signal',{epoch:am.epoch,payload:'old-signal'},a.token)).status,409);
assert.equal((await request('unpair',{confirm:'shreya',epoch:am.epoch},a.token)).body.alreadyDisconnected,true);
await request('pair',{code:(await request('me',{},b.token)).body.code},a.token);
assert.equal((await request('unpair',{confirm:'shreya',epoch:am.epoch},a.token)).status,409);
assert.equal((await request('me',{},b.token)).body.partner,'aryan');
});
test('password vault encryption rejects wrong password',async()=>{
const salt=crypto.getRandomValues(new Uint8Array(16));
async function key(p){const raw=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
const k=await key('correct-password'),bad=await key('incorrect-password'),iv=crypto.getRandomValues(new Uint8Array(12));
const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode('private key and history'));await assert.rejects(crypto.subtle.decrypt({name:'AES-GCM',iv},bad,ct));
});
test('live stream wakes on pairing and encrypted signaling',async()=>{
const a=await identity('live_a'),b=await identity('live_b');
const abort=new AbortController();const stream=await handleAPI(new Request('http://localhost/api/events',{headers:{Authorization:'Bearer '+b.token},signal:abort.signal}));assert.equal(stream.status,200);const reader=stream.body.getReader();assert.ok(dec.decode((await reader.read()).value).includes('changed'));
const code=(await request('me',{},b.token)).body.code;await request('pair',{code},a.token);assert.ok(dec.decode((await reader.read()).value).includes('changed'));
const epoch=(await request('me',{},a.token)).body.epoch;await request('signal',{epoch,payload:'encrypted-offer'},a.token);const signals=(await request('signals',{},b.token)).body.messages;assert.equal(signals.length,1);assert.equal(signals[0].payload,'encrypted-offer');assert.equal((await request('signals',{},a.token)).body.messages.length,0);await request('signal-ack',{ids:signals.map(s=>s.id)},b.token);assert.equal((await request('signals',{},b.token)).body.messages.length,0);abort.abort();await reader.cancel();
});
test('expired envelopes are rejected and ciphertext queues are invisible to another account',async()=>{
const a=await identity('expiry_a'),b=await identity('expiry_b');await request('pair',{code:(await request('me',{},b.token)).body.code},a.token);const epoch=(await request('me',{},a.token)).body.epoch;
assert.equal((await request('send',{id:'expired',epoch,payload:'ciphertext',expires:Date.now()-1},a.token)).status,410);
assert.equal((await request('send',{id:'fresh',epoch,payload:'ciphertext',expires:Date.now()+60000},a.token)).status,200);
assert.equal((await request('status',{},b.token)).body.pending,'fresh');
});
test('WebRTC uses a separate media channel and acknowledges complete frames',async()=>{
const {DirectLink}=await import('./public/transport.js');const state=[];const link=new DirectLink({signal:async()=>{},onMessage:async()=>{},onState:(...s)=>state.push(s)});
let main=0,media=0;
const fake=(isMedia)=>({readyState:'open',bufferedAmount:0,send(raw){const f=JSON.parse(raw);if(isMedia)media++;else main++;if(f.chunk&&f.i===f.n-1)queueMicrotask(()=>link.pending.get(f.id)?.(true))},close(){}});
link.channel=fake(false);link.mediaChannel=fake(true);
assert.equal(await link.send({id:'text',payload:'hello'}),true);assert.equal(main,1);assert.equal(media,0);
assert.equal(await link.send({id:'photo',payload:'x'.repeat(100000)}),true);assert.ok(media>1);assert.equal(main,1);
link.close();
});
test('public frontend Origin is allowed without allowing arbitrary origins',async()=>{
const prev=process.env.PUBLIC_ORIGIN;process.env.PUBLIC_ORIGIN='https://only-yours-aryan-shreya.vercel.app';
async function login(origin){return handleAPI(new Request('https://backend.example/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({id:'origin_probe',password:'probe-password'})}))}
try{assert.equal((await login('https://only-yours-aryan-shreya.vercel.app')).status,401);assert.equal((await login('https://untrusted.example')).status,403)}finally{if(prev===undefined)delete process.env.PUBLIC_ORIGIN;else process.env.PUBLIC_ORIGIN=prev}
});
test('remembered sessions last beyond one day, ordinary sessions expire, and logout revokes access',async()=>{
const a=await identity('remember_a'),b=await identity('remember_b');const initial=Date.now(),now=Date.now;
assert.equal((await request('remember',{},a.token)).status,200);
try{Date.now=()=>initial+2*86400000;assert.equal((await request('me',{},a.token)).status,200);assert.equal((await request('me',{},b.token)).status,401);assert.equal((await request('logout',{},a.token)).status,200);assert.equal((await request('me',{},a.token)).status,401)}finally{Date.now=now}
assert.equal((await request('remember')).status,401);
});
test('receipt states distinguish server acceptance, delivery and actual read without downgrading',async()=>{
const {receiptState,applyReceipt}=await import('./public/receipts.js');const m={};assert.equal(receiptState(m).label,'Waiting to send');m.sent=true;assert.deepEqual(receiptState(m),{text:'✓',label:'Sent',blue:false});applyReceipt(m,'receipt');assert.equal(receiptState(m).label,'Delivered');assert.equal(receiptState(m).blue,false);applyReceipt(m,'read');assert.equal(receiptState(m).blue,true);applyReceipt(m,'receipt');assert.equal(receiptState(m).label,'Read');
});
test('call capture begins only on outgoing start or explicit incoming answer, and hangup stops tracks',async()=>{
const {LoveCall}=await import('./public/calls.js');let mediaCount=0;const signals=[],states=[],tracks=[];
function media(){mediaCount++;const audio={kind:'audio',enabled:true,stop(){this.stopped=true}},video={kind:'video',enabled:true,stop(){this.stopped=true}};tracks.push(audio,video);return Promise.resolve({getTracks:()=>[audio,video],getAudioTracks:()=>[audio],getVideoTracks:()=>[video]})}
function rtc(){return {addTrack(){},async createOffer(){return {type:'offer',sdp:'test-offer'}},async createAnswer(){return {type:'answer',sdp:'test-answer'}},async setLocalDescription(d){this.localDescription={...d,toJSON:()=>d}},async setRemoteDescription(d){this.remoteDescription=d},async addIceCandidate(){},close(){this.closed=true}}}
const call=new LoveCall({signal:async s=>signals.push(s),state:s=>states.push(s),local(){},remote(){},rtc,media});
await call.receive({kind:'offer',id:'incoming-call',video:true,description:{type:'offer',sdp:'offer'},time:Date.now()});assert.equal(mediaCount,0);assert.equal(call.phase,'incoming');await call.answer();assert.equal(mediaCount,1);assert.ok(signals.some(s=>s.kind==='answer'));assert.equal(call.toggleAudio(),false);assert.equal(call.toggleAudio(),true);assert.equal(call.toggleVideo(),false);await call.end();assert.ok(tracks.every(t=>t.stopped));assert.equal(call.id,null);
await call.start(false);assert.equal(mediaCount,2);assert.ok(signals.some(s=>s.kind==='offer'));await call.end();assert.ok(tracks.every(t=>t.stopped));
});
test('disappearing timers start on actual seen event and cannot be restarted by later receipts',async()=>{
const {markSeen,applyReceipt}=await import('./public/receipts.js');const now=Date.now();const receiver={id:'vanish',time:now-20000,disappearAfter:10000,expires:0};const sender={...receiver,mine:true,sent:true};assert.equal(receiver.expires,0);applyReceipt(sender,'receipt');assert.equal(sender.expires,0);markSeen(receiver,now);assert.equal(receiver.expires,now+10000);applyReceipt(sender,'read',receiver.readAt);assert.equal(sender.expires,receiver.expires);applyReceipt(sender,'read',now+5000);assert.equal(sender.expires,now+10000);applyReceipt(sender,'receipt');assert.equal(sender.expires,now+10000);const permanent={time:now,expires:0};markSeen(permanent,now);assert.equal(permanent.expires,0);
});
test('encrypted device transfer validates envelopes and never overwrites another account',async()=>{
const {validateTransfer,importDecision}=await import('./public/vault-transfer.js');const salt=Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');const iv=crypto.getRandomValues(new Uint8Array(12));const k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode('encrypted device history'));
const transfer=validateTransfer({version:1,metadata:{id:'transfer_user',salt},box:{iv:Buffer.from(iv).toString('base64'),data:Buffer.from(ciphertext).toString('base64')},theme:'dark',password:'never copy this'});assert.equal('password'in transfer,false);assert.equal(importDecision(null,transfer),'import');assert.equal(importDecision(transfer.metadata,transfer),'keep-current');assert.throws(()=>importDecision({id:'another_user',salt},transfer),/not overwritten/);assert.throws(()=>validateTransfer({version:1,metadata:{id:'bad name',salt},box:transfer.box}));assert.equal(importDecision(null,{empty:true}),'empty');
});
test('new public address and explicit compatibility address are accepted; other origins are rejected',async()=>{
const a=process.env.PUBLIC_ORIGIN,b=process.env.COMPATIBLE_ORIGINS;process.env.PUBLIC_ORIGIN='https://only-yours-app-private.vercel.app';process.env.COMPATIBLE_ORIGINS='https://previous.example';
async function login(origin){return handleAPI(new Request('https://backend.example/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({id:'domain_probe',password:'invalid-password'})}))}
try{assert.equal((await login(process.env.PUBLIC_ORIGIN)).status,401);assert.equal((await login('https://previous.example')).status,401);assert.equal((await login('https://previous.example.attacker.test')).status,403)}finally{if(a===undefined)delete process.env.PUBLIC_ORIGIN;else process.env.PUBLIC_ORIGIN=a;if(b===undefined)delete process.env.COMPATIBLE_ORIGINS;else process.env.COMPATIBLE_ORIGINS=b}
});
test('saved local login survives network failures and renewal failures without asking for password',async()=>{
const {resumeDeviceSession}=await import('./public/login-resume.js');const events=[];
const deps={unlockLocal:async()=>events.push('decrypted'),openLocal:async()=>events.push('opened'),connect:async()=>{throw TypeError('Failed to fetch')},renew:async()=>events.push('renewed'),expired:async()=>events.push('password'),offline:async()=>events.push('offline')};
assert.equal(await resumeDeviceSession(deps),'offline');assert.deepEqual(events,['decrypted','opened','offline']);events.length=0;
assert.equal(await resumeDeviceSession({...deps,connect:async()=>events.push('connected'),renew:async()=>{throw Error('temporary renewal error')}}),'online');assert.deepEqual(events,['decrypted','opened','connected']);
});
test('revoked sessions require reauthentication while corrupted local vaults never open',async()=>{
const {resumeDeviceSession}=await import('./public/login-resume.js');const events=[];const deps={unlockLocal:async()=>events.push('decrypted'),openLocal:async()=>events.push('opened'),connect:async()=>{throw Object.assign(Error('Revoked'),{status:401})},renew:async()=>{},expired:async()=>events.push('password'),offline:async()=>events.push('offline')};assert.equal(await resumeDeviceSession(deps),'expired');assert.deepEqual(events,['decrypted','opened','password']);events.length=0;await assert.rejects(resumeDeviceSession({...deps,unlockLocal:async()=>{throw Error('Vault authentication failed')}}));assert.deepEqual(events,[]);
});

test('large camera photos resize before encryption and preserve aspect ratio',async()=>{
const {prepareAttachment,fittedSize}=await import('./public/attachments.js');assert.deepEqual(fittedSize(4000,3000),{width:1600,height:1200});let closed=false,attempts=0;
const result=await prepareAttachment(new File([new Uint8Array(5*1024*1024)],'camera.png',{type:'image/png'}),{decode:async()=>({width:4000,height:3000,close(){closed=true}}),encode:async(image,size,quality)=>{assert.equal(size.width,1600);attempts++;return new Blob([new Uint8Array(attempts===1?1100000:800000)],{type:'image/jpeg'})}});
assert.equal(result.type,'image/jpeg');assert.equal(result.name,'camera.jpg');assert.equal(result.size,800000);assert.equal(closed,true);
await assert.rejects(prepareAttachment(new File([new Uint8Array(3*1024*1024)],'large.pdf',{type:'application/pdf'})),/larger than 2 MB/);
});
test('call quality prioritises audio on poor connections and restarts ICE',async()=>{
const {LoveCall}=await import('./public/calls.js');const sent=[],parameters={};let restart;const c=new LoveCall({signal:async x=>sent.push(x),state:()=>{},remote:()=>{},local:()=>{}});
c.id='weak-call';c.video=true;c.initiator=true;c.pc={signalingState:'stable',connectionState:'failed',getSenders:()=>['audio','video'].map(kind=>({track:{kind},getParameters:()=>({encodings:[{}]}),setParameters:async p=>{parameters[kind]=p.encodings[0]}})),getStats:async()=>new Map([['pair',{type:'candidate-pair',state:'succeeded',nominated:true,availableOutgoingBitrate:60000,currentRoundTripTime:.8}]]),createOffer:async options=>{restart=options.iceRestart;return {type:'offer',sdp:'restart'}},setLocalDescription:async()=>{},localDescription:{toJSON:()=>({type:'offer',sdp:'restart'})},close(){}};
await c.checkQuality();assert.equal(parameters.video.active,false);assert.equal(parameters.audio.maxBitrate,16000);await c.recover();assert.equal(restart,true);assert.equal(sent[0].restart,true);assert.equal(parameters.video.maxBitrate,70000);c.reset();
});
test('relay settings require authentication and credentials stay server side',async()=>{
assert.equal((await request('rtc-config')).status,401);const a=await identity('rtc_config');process.env.TURN_URLS='turns:relay.example:443?transport=tcp';process.env.TURN_SECRET='test-only-secret';
try{const r=await request('rtc-config',{},a.token);assert.equal(r.status,200);assert.equal(r.body.hasRelay,true);assert.equal(r.body.iceServers[1].urls[0],process.env.TURN_URLS);assert.ok(r.body.iceServers[1].credential);assert.ok(!JSON.stringify(r.body).includes(process.env.TURN_SECRET))}finally{delete process.env.TURN_URLS;delete process.env.TURN_SECRET}
});

test('background call lifecycle acquires after permission and releases on hangup or failure',async()=>{
const {LoveCall}=await import('./public/calls.js');const events=[];const track={kind:'audio',stop(){events.push('stop')}};const stream={getTracks:()=>[track]};const c=new LoveCall({signal:async()=>{},state:()=>{},local:()=>{},remote:()=>{},media:async()=>{events.push('permission');return stream},acquire:async()=>{events.push('foreground-service')},release:()=>events.push('release'),rtc:()=>({addTrack(){},setLocalDescription:async()=>{},createOffer:async()=>({type:'offer'}),localDescription:{toJSON:()=>({type:'offer'})},close(){events.push('close')}})});
await c.start(false);assert.deepEqual(events.slice(0,2),['permission','foreground-service']);await c.end();assert.ok(events.includes('stop'));assert.equal(events.at(-1),'release');
const failure=new LoveCall({signal:async()=>{},state:()=>{},local:()=>{},remote:()=>{},media:async()=>stream,acquire:async()=>{throw Error('service denied')},release:()=>events.push('failed-release')});await assert.rejects(failure.start(true),/service denied/);assert.equal(failure.stream,null);assert.equal(events.at(-1),'failed-release');
});

test('photos never fall back to server storage, including uncertain direct delivery',async()=>{
const {deliverEnvelope}=await import('./public/device-storage.js');let relays=0;const pending={id:'photo',payload:'encrypted',relayAllowed:false};
assert.equal(await deliverEnvelope(pending,{sendDirect:async()=>false,sendRelay:async()=>relays++}),'waiting-on-device');assert.equal(relays,0);
assert.equal(await deliverEnvelope({...pending,relayAllowed:undefined},{sendDirect:async()=>false,sendRelay:async()=>relays++}),'waiting-on-device');assert.equal(relays,0);
assert.equal(await deliverEnvelope(pending,{sendDirect:async()=>true,sendRelay:async()=>relays++}),'direct');assert.equal(relays,0);
assert.equal(await deliverEnvelope({...pending,relayAllowed:true},{sendDirect:async()=>false,sendRelay:async()=>relays++}),'relay');assert.equal(relays,1);
});
test('local chat and keepsake deletion removes files and pending sends without changing another device',async()=>{
const {deleteLocalMessages}=await import('./public/device-storage.js');const local={messages:[{id:'photo',file:{data:'private-photo'}},{id:'text',text:'hi',reply:{id:'photo',text:'private caption'}}],outbox:[{id:'photo',payload:'sealed-photo'}]};const receiver=structuredClone(local);
deleteLocalMessages(local,['photo']);assert.equal(local.messages.length,1);assert.equal(local.messages[0].reply.text,'Message deleted on this device');assert.equal(local.outbox.length,0);assert.ok(local.deletedMessageIds.includes('photo'));assert.equal(receiver.messages[0].file.data,'private-photo');assert.ok(!JSON.stringify(local).includes('private-photo'));
deleteLocalMessages(local,local.messages.map(m=>m.id));assert.equal(local.messages.length,0);assert.equal(local.outbox.length,0);assert.equal(receiver.messages.length,2);
});
test('server rejects device-only media and queued-media recovery is scoped to the sender',async()=>{
const a=await identity('private_media_a'),b=await identity('private_media_b');await request('pair',{code:(await request('me',{},b.token)).body.code},a.token);const epoch=(await request('me',{},a.token)).body.epoch;
assert.equal((await request('send',{id:'no-photo',epoch,payload:'ciphertext',relayAllowed:false},a.token)).status,400);assert.equal((await request('receive',{},b.token)).body.messages.length,0);
await request('send',{id:'old-media',epoch,payload:'old-encrypted-content'},a.token);assert.equal((await request('queued-media',{ids:['old-media']},b.token)).body.messages.length,0);assert.equal((await request('queued-media',{ids:['old-media']},a.token)).body.messages.length,1);
await request('withdraw-media',{ids:['old-media']},b.token);assert.equal((await request('receive',{},b.token)).body.messages.length,1);await request('withdraw-media',{ids:['old-media']},a.token);assert.equal((await request('receive',{},b.token)).body.messages.length,0);
});

test('swipe reply selects once, preserves scrolling, ignores taps and cancels safely',async()=>{
 const {bindSwipeReply}=await import('./public/swipe-reply.js');const handlers=new Map(),replies=[],classes=new Set(),styles=new Map();let selected='';
 const bubble={isConnected:true,dataset:{messageId:'message-1'},style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)},classList:{add:c=>classes.add(c),remove:(...cs)=>cs.forEach(c=>classes.delete(c)),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}};
 const target={closest:s=>s.startsWith('.bubble')?bubble:null},button={closest:s=>s.startsWith('.bubble')?bubble:{}};
 const list={ownerDocument:{getSelection:()=>({toString:()=>selected})},contains:b=>b===bubble,setPointerCapture:()=>{},addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n)};
 const unbind=bindSwipeReply(list,id=>replies.push(id));const emit=(type,x,y,extra={})=>handlers.get(type)?.({pointerId:1,clientX:x,clientY:y,button:0,isPrimary:true,target,cancelable:true,preventDefault(){},stopPropagation(){},...extra});
 emit('pointerdown',0,0);emit('pointermove',72,4);assert.ok(classes.has('reply-ready'));emit('pointerup',72,4);emit('pointerup',72,4);assert.deepEqual(replies,['message-1']);assert.equal(styles.size,0);
 for(const [dx,dy] of [[12,0],[70,60],[0,90]]){emit('pointerdown',0,0);emit('pointermove',dx,dy);emit('pointerup',dx,dy)}assert.equal(replies.length,1);
 emit('pointerdown',0,0);emit('pointermove',80,0);emit('pointercancel',80,0);emit('pointerup',80,0);assert.equal(replies.length,1);
 emit('pointerdown',0,0,{target:button});emit('pointermove',80,0);emit('pointerup',80,0);assert.equal(replies.length,1);
 selected='selected text';emit('pointerdown',0,0);emit('pointermove',80,0);emit('pointerup',80,0);assert.equal(replies.length,1);selected='';
 emit('pointerdown',0,0);bubble.isConnected=false;emit('pointermove',80,0);emit('pointerup',80,0);assert.equal(replies.length,1);unbind();assert.equal(handlers.size,0);
});

test('missed calls deduplicate, connected calls stay answered, and local deletion survives delayed results',async()=>{
const {recordCall,hasEndedCall}=await import('./public/call-history.js');const {deleteLocalMessages}=await import('./public/device-storage.js');const v={messages:[],outbox:[]};const start={id:'missed-1',direction:'incoming',video:true,startedAt:1000,connectedAt:0,endedAt:0};
recordCall(v,start);recordCall(v,{...start,endedAt:2000});assert.equal(v.messages.length,1);assert.equal(v.messages[0].text,'Missed video call');assert.equal(hasEndedCall(v,'missed-1'),true);recordCall(v,start);assert.equal(v.messages[0].call.status,'missed');
recordCall(v,{...start,id:'answered',video:false,connectedAt:1500,endedAt:2500});recordCall(v,{...start,id:'answered',video:false,endedAt:2600});assert.equal(v.messages[1].call.status,'completed');
const f={messages:[],outbox:[]};recordCall(f,{...start,answeredAt:1200,endedAt:2000});assert.equal(f.messages[0].call.status,'failed');
v.pendingCallResults=[{call:{id:'missed-1'}}];v.outbox=[{id:'summary',localCallId:'call:missed-1'}];deleteLocalMessages(v,['call:missed-1']);assert.equal(v.pendingCallResults.length,0);assert.equal(v.outbox.length,0);recordCall(v,{...start,endedAt:2000});assert.equal(v.messages.length,1);assert.equal(hasEndedCall(v,'missed-1'),true);
});
test('unanswered incoming calls generate history and final calls cannot ring again',async()=>{
const {LoveCall}=await import('./public/calls.js');const {recordCall,hasEndedCall}=await import('./public/call-history.js');const v={messages:[],outbox:[]};let incoming=0;const c=new LoveCall({signal:async()=>{},state:s=>{if(s.phase==='incoming')incoming++},local:()=>{},remote:()=>{},history:event=>recordCall(v,event),isFinal:id=>hasEndedCall(v,id)});const offer={kind:'offer',id:'missed-live',video:false,description:{type:'offer',sdp:'test'},time:Date.now()};await c.receive(offer);assert.equal(incoming,1);await c.receive({kind:'end',id:offer.id,time:Date.now()});assert.equal(v.messages[0].call.status,'missed');assert.equal(c.id,null);await c.receive(offer);assert.equal(incoming,1);
await c.receive({...offer,id:'stale-offer',time:Date.now()-65000});assert.equal(v.messages[1].call.status,'missed');assert.equal(incoming,1);c.reset();
});

test('native startup failures fall back to foreground and legacy callbacks cannot hang up a call',async()=>{
 const {acquireNativeCall,nativeCallAction}=await import('./public/native-call.js');let starts=0;const released=[];
 const good={beginCallSession:(id,video)=>{assert.equal(id,'current');assert.equal(video,true);starts++;return true},callServiceStatus:()=>JSON.stringify({id:'current',state:'active'}),finishCallSession:id=>released.push(id)};
 assert.deepEqual(await acquireNativeCall(good,true,'current',{sleep:async()=>{}}),{background:true});assert.equal(starts,1);
 const failed={...good,callServiceStatus:()=>JSON.stringify({id:'current',state:'failed',reason:'permissions'})};
 assert.deepEqual(await acquireNativeCall(failed,true,'current',{sleep:async()=>{}}),{background:false,reason:'permissions'});assert.deepEqual(released,['current']);
 await assert.rejects(acquireNativeCall(failed,true,'current',{sleep:async()=>{},visible:()=>false}),/Reopen the app/);
 let legacyStarts=0;assert.equal((await acquireNativeCall({beginCall(){legacyStarts++}},true,'current')).reason,'update-required');assert.equal(legacyStarts,0);
 assert.equal(nativeCallAction(undefined,'current'),'ignore');assert.equal(nativeCallAction({id:'previous',reason:'notification'},'current'),'ignore');
 assert.equal(nativeCallAction({id:'current',reason:'service-stopped'},'current'),'foreground-only');assert.equal(nativeCallAction({id:'current',reason:'notification'},'current'),'end');
});
test('native service cleanup is scoped to the call that acquired it',async()=>{
 const {LoveCall}=await import('./public/calls.js');const acquired=[],released=[];const stream={getTracks:()=>[{kind:'audio',stop(){}}]};const c=new LoveCall({signal:async()=>{},state:()=>{},local:()=>{},remote:()=>{},media:async()=>stream,acquire:async(video,id)=>acquired.push(id),release:id=>released.push(id),rtc:()=>({addTrack(){},createOffer:async()=>({type:'offer'}),setLocalDescription:async()=>{},localDescription:{toJSON:()=>({type:'offer'})},close(){}})});
 await c.start(false);const id=c.id;assert.equal(acquired[0],id);await c.end();assert.equal(released[0],id);assert.equal(c.id,null);
});

test('a cancelled call finishing native acquisition cannot reset a newer call',async()=>{
 const {LoveCall}=await import('./public/calls.js');let finishAcquire,entered;const acquiring=new Promise(r=>entered=r);let acquisitions=0;const tracks=[];
 const c=new LoveCall({signal:async()=>{},state:()=>{},local:()=>{},remote:()=>{},media:async()=>{const t={kind:'audio',stopped:false,stop(){this.stopped=true}};tracks.push(t);return {getTracks:()=>[t]}},acquire:async()=>{if(++acquisitions===1){entered();await new Promise(r=>finishAcquire=r)}},rtc:()=>({addTrack(){},createOffer:async()=>({type:'offer'}),setLocalDescription:async()=>{},localDescription:{toJSON:()=>({type:'offer'})},close(){}})});
 const first=c.start(false).catch(e=>e);await acquiring;await c.end();await c.start(false);const current=c.id;finishAcquire();const error=await first;assert.equal(error.cancelled,true);assert.equal(c.id,current);assert.equal(tracks[1].stopped,false);await c.end();
});
test('late hangup signaling does not dismiss a newer call',async()=>{
 const {LoveCall}=await import('./public/calls.js');const states=[];let finishEnd;let delayed=true;const c=new LoveCall({signal:async s=>{if(s.kind==='end'&&delayed){delayed=false;await new Promise(r=>finishEnd=r)}},state:s=>states.push(s),local:()=>{},remote:()=>{},media:async()=>({getTracks:()=>[{kind:'audio',stop(){}}]}),rtc:()=>({addTrack(){},createOffer:async()=>({type:'offer'}),setLocalDescription:async()=>{},localDescription:{toJSON:()=>({type:'offer'})},close(){}})});
 await c.start(false);const ending=c.end();await c.start(false);const current=c.id;finishEnd();await ending;assert.equal(c.id,current);assert.equal(states.at(-1).phase,'outgoing');await c.end();
});

test('duplicate direct and relay copies share durable storage and retry cleanly after failure',async()=>{
 const {receiveOnce}=await import('./public/receive-once.js');let saved,started=0;const receive=receiveOnce(async()=>{started++;await new Promise(r=>saved=r);return 'stored'});const one=receive({id:'same'}),two=receive({id:'same'});assert.equal(one,two);await Promise.resolve();assert.equal(started,1);let ack=false;two.then(()=>ack=true);assert.equal(ack,false);saved();assert.equal(await one,'stored');assert.equal(await two,'stored');assert.equal(ack,true);
 let attempts=0;const retry=receiveOnce(async()=>{if(!attempts++)throw Error('disk full');return 'ok'});await assert.rejects(retry({id:'retry'}),/disk full/);assert.equal(await retry({id:'retry'}),'ok');
});
test('a stale text channel falls back without the previous two-second wait and media cannot block text',async()=>{
 const {DirectLink}=await import('./public/transport.js');const link=new DirectLink({signal:async()=>{},onMessage:async()=>{},onState:()=>{}});let frames=0;link.channel={readyState:'open',bufferedAmount:0,send(){frames++},close(){}};const started=performance.now();assert.equal(await link.send({id:'slow',payload:'text',relayAllowed:true}),false);assert.ok(performance.now()-started<1500);assert.equal(await link.send({id:'photo-small',payload:'small photo',relayAllowed:false}),false);assert.equal(frames,1);link.close();
});
test('message reads use two database round trips and expired content remains hidden',async()=>{
 const {localDB}=await import('./db.mjs');const {createAPI}=await import('./core.mjs');const raw=await localDB(':memory:');let queries=[];const db={...raw,q:async(sql,...p)=>{queries.push(sql);return raw.q(sql,...p)}};const api=createAPI(db);const request=async(path,body={},token)=>{const r=await api(new Request('http://localhost/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}};const identity=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);const pub=await crypto.subtle.exportKey('jwk',identity.publicKey);const created=await request('register',{id:'query_budget',password:'a-very-good-password',pub});const token=created.body.token;await raw.q('INSERT INTO queue VALUES(?,?,?,?,?,?)','expired-record','peer','query_budget',0,'ciphertext',Date.now()-1);queries=[];const received=await request('receive',{},token);assert.equal(received.status,200);assert.deepEqual(received.body.messages,[]);assert.equal(queries.length,2);assert.ok(queries.every(sql=>!sql.startsWith('DELETE')));queries=[];assert.equal((await request('me',{},token)).status,200);assert.equal(queries.length,1);
});
test('minimizing and restoring a call preserves its video elements and media object',async()=>{
 const {createCallView}=await import('./public/call-view.js');const classes=new Set(),video={srcObject:{privateStream:true}},dialog={open:true,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},close(){this.open=false},show(){this.open=true;this.modal=false},showModal(){this.open=true;this.modal=true},video};let chatting=0;const view=createCallView(dialog,{onChat:()=>chatting++});const stream=video.srcObject;view.minimize();assert.equal(view.isMinimized(),true);assert.equal(chatting,1);assert.equal(dialog.modal,false);assert.equal(video.srcObject,stream);view.expand();assert.equal(dialog.modal,true);assert.equal(video.srcObject,stream);view.reset();assert.equal(dialog.open,false);
});
test('typing expires, stops explicitly, and rejects stale presence',async()=>{
 const {TypingIndicator}=await import('./public/typing.js');let now=10000,timer;const changes=[];const state=new TypingIndicator(active=>changes.push(active),{now:()=>now,schedule:fn=>{timer=fn;return 1},cancel:()=>{}});state.update({active:true,at:now});assert.equal(state.active(),true);now+=1000;state.update({active:true,at:now});timer();assert.equal(state.active(),false);state.update({active:true,at:now-6000});assert.equal(state.active(),false);state.update({active:true,at:now});state.update({active:false,at:now});assert.equal(state.active(),false);assert.equal(changes.at(-1),false);
});
test('notification hints exclude plaintext and media and remain scoped to the paired recipient',async()=>{
 const {messageNotice,callNotice,readNotice}=await import('./public/notices.js');const now=Date.now();assert.equal(messageNotice({id:'photo',time:now,file:{data:'private-photo'}}),undefined);const n=messageNotice({id:'nudge',time:now,nudge:true,text:'private text'});assert.equal(n.kind,'nudge');assert.ok(!JSON.stringify(n).includes('private'));const call=callNotice({kind:'offer',id:'call',video:true,time:now,description:{sdp:'private SDP'}});assert.ok(!JSON.stringify(call).includes('SDP'));assert.equal(readNotice(JSON.stringify({notice:call}),now).phase,'ringing');assert.equal(readNotice(JSON.stringify({notice:call}),now+95000),null);
 const a=await identity('alert_a'),b=await identity('alert_b'),other=await identity('alert_other');await request('pair',{code:(await request('me',{},b.token)).body.code},a.token);const epoch=(await request('me',{},a.token)).body.epoch;await request('send',{id:'nudge-alert',epoch,payload:JSON.stringify({iv:'encrypted',data:'ciphertext',notice:{...n,id:'nudge-alert'}})},a.token);assert.equal((await request('alerts',{},other.token)).body.messages.length,0);const inbox=await request('alerts',{},b.token);assert.equal(inbox.body.messages[0].kind,'nudge');assert.ok(!JSON.stringify(inbox.body).includes('ciphertext'));assert.equal((await request('alerts')).status,401);
});
test('screen sharing replaces only the video track and stopping restores the camera without hanging up',async()=>{
 const {LoveCall}=await import('./public/calls.js');const changed=[],signals=[];let stopped=false;const audio={kind:'audio',stop(){throw Error('microphone stopped')}},camera={kind:'video'},screen={kind:'video'};const source={stream:{getVideoTracks:()=>[screen]},stop(){stopped=true}};const c=new LoveCall({signal:async s=>signals.push(s),state:()=>{},local:()=>{},remote:()=>{}});c.id='screen-call';c.video=true;c.phase='connected';c.pc={getSenders:()=>[]};c.stream={getVideoTracks:()=>[camera],getTracks:()=>[audio,camera]};c.videoSender={replaceTrack:async t=>changed.push(t)};await c.startScreenShare(async()=>source);assert.equal(changed[0],screen);assert.equal(c.id,'screen-call');assert.equal(signals[0].active,true);await c.stopScreenShare();assert.equal(changed[1],camera);assert.equal(stopped,true);assert.equal(c.id,'screen-call');assert.equal(signals.at(-1).active,false);
});

test('a reloaded peer can recover an unanswered direct offer without waiting for ICE failure',async()=>{
 const {DirectLink}=await import('./public/transport.js');const sent=[];const link=new DirectLink({signal:async s=>sent.push(s),onMessage:()=>{},onState:()=>{}});link.id='a';link.partner='b';link.negotiation='current-offer';link.pc={signalingState:'have-local-offer',localDescription:{toJSON:()=>({type:'offer',sdp:'encrypted-by-caller'})},close(){}};await link.receiveSignal({hello:true});assert.equal(sent.length,1);assert.equal(sent[0].negotiation,'current-offer');assert.equal(sent[0].description.type,'offer');link.close();
});
test('swipe reply supports either direction and reports gesture ownership until release',async()=>{
 const {bindSwipeReply}=await import('./public/swipe-reply.js');const handlers=new Map(),events=[],replies=[],classes=new Set();const bubble={isConnected:true,dataset:{messageId:'swipe'},style:{setProperty(){},removeProperty(){}},classList:{add:c=>classes.add(c),remove:(...cs)=>cs.forEach(c=>classes.delete(c)),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}};const target={closest:s=>s.startsWith('.bubble')?bubble:null};const list={ownerDocument:{getSelection:()=>({toString:()=>''})},contains:()=>true,setPointerCapture(){},addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n)};bindSwipeReply(list,id=>replies.push(id),{onGesture:on=>events.push(on)});const event=(name,x,y,t)=>handlers.get(name)({pointerId:1,button:0,isPrimary:true,target,clientX:x,clientY:y,timeStamp:t,cancelable:true,preventDefault(){},stopPropagation(){}});event('pointerdown',100,0,0);event('pointermove',35,4,100);assert.equal(classes.has('reply-left'),true);event('pointerup',35,4,110);assert.deepEqual(replies,['swipe']);assert.deepEqual(events,[true,false]);event('pointerdown',0,0,200);event('pointermove',12,8,240);event('pointerup',12,8,250);assert.equal(replies.length,1);
});

test('Send retains composer focus without cancelling the click or submission',async()=>{
 const {bindComposerFocus}=await import('./public/composer-focus.js');const handlers=new Map(),buttons=new Map();let focused=0;const input={focus:opts=>{assert.equal(opts.preventScroll,true);focused++}};const send={addEventListener:(k,f)=>buttons.set(k,f),removeEventListener:k=>buttons.delete(k)};const form={querySelector:()=>send,addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k)};const dispose=bindComposerFocus(form,input);let prevented=false;buttons.get('pointerdown')({button:0,preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(buttons.has('click'),false);handlers.get('submit')();assert.equal(focused,1);dispose();assert.equal(handlers.size+buttons.size,0);
});
test('in-app camera cancels late permission acquisition and releases owned tracks on close',async()=>{
 const {createCamera}=await import('./public/camera.js');const handlers=new Map(),nodes=new Map();for(const id of ['#camera-preview','#camera-status','#capture-camera','#retake-camera','#use-camera','#flip-camera','#close-camera'])nodes.set(id,{classList:{toggle(){}},play:async()=>{},pause(){}});const dialog={open:false,ownerDocument:{addEventListener(){}},querySelector:s=>nodes.get(s),addEventListener:(k,f)=>handlers.set(k,f),showModal(){this.open=true},close(){this.open=false;handlers.get('close')?.()}};let resolve,stopped=0;const stream={getTracks:()=>[{stop(){stopped++}}]};const camera=createCamera({dialog,onPhoto:()=>{},mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});const opening=camera.open();camera.close();resolve(stream);await opening;assert.equal(stopped,1);assert.equal(nodes.get('#camera-preview').srcObject,null);assert.equal(dialog.open,false);
});

test('view-once gifts size by text length, bound reading time and cannot be reopened',async()=>{
 const {giftSize,giftSeconds,consumeGift}=await import('./public/view-once.js');assert.equal(giftSize('hi'),'small');assert.equal(giftSize('x'.repeat(100)),'medium');assert.equal(giftSize('x'.repeat(300)),'large');assert.equal(giftSeconds('hi'),10);assert.equal(giftSeconds('word '.repeat(1000)),60);assert.equal(giftSeconds('hi',30),30);assert.equal(giftSeconds('hi',-1),10);const m={id:'gift',once:true,text:'Private gift',mine:false,giftDuration:10};const vault={messages:[m],deletedMessageIds:[]};assert.deepEqual(consumeGift(vault,'gift'),{file:undefined,text:'Private gift',seconds:10,remaining:0,limit:1});assert.equal(vault.messages.length,0);assert.equal(m.text,'');assert.equal(m.opened,true);assert.deepEqual(vault.deletedMessageIds,['gift']);assert.equal(consumeGift(vault,'gift'),null);assert.equal(consumeGift({messages:[{id:'mine',mine:true,once:true,text:'mine'}]},'mine'),null);
});

test('holding Send opens gift options once and consumes the release click; tapping stays a normal send',async()=>{
 const {bindSendHold}=await import('./public/send-options.js');const handlers=new Map();let pending=null,opened=0,cancelled=0;const button={addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n),setPointerCapture(){}};const dispose=bindSendHold(button,()=>opened++,{schedule:fn=>{pending=fn;return 1},cancel:()=>{pending=null;cancelled++}});const down={button:0,isPrimary:true,pointerId:1,clientX:10,clientY:10};handlers.get('pointerdown')(down);handlers.get('pointerup')();assert.equal(pending,null);let blocked=0;const click={preventDefault(){blocked++},stopImmediatePropagation(){blocked++}};handlers.get('click')(click);assert.equal(blocked,0);assert.equal(opened,0);handlers.get('pointerdown')(down);pending();assert.equal(opened,1);handlers.get('pointerup')();handlers.get('click')(click);assert.equal(blocked,2);handlers.get('pointerdown')(down);handlers.get('pointerup')();handlers.get('click')(click);assert.equal(blocked,2);handlers.get('pointerdown')(down);handlers.get('pointermove')({...down,clientX:50});assert.equal(pending,null);handlers.get('pointercancel')();assert.equal(opened,1);handlers.get('keydown')({key:'F10',shiftKey:true,preventDefault(){}});assert.equal(opened,2);dispose();assert.equal(handlers.size,0);assert.ok(cancelled>0);
});

test('photos, voice and wrapped text allow two durable opens and remove content on the last one',async()=>{
 const {consumeGift}=await import('./public/view-once.js');for(const payload of [{text:'wrapped gift',gift:true},{text:'',file:{type:'image/jpeg',data:'localphoto'}},{text:'',voice:true,file:{type:'audio/webm',data:'localvoice'}}]){const vault={messages:[{id:'limited',once:true,playLimit:2,...payload}]};const first=consumeGift(vault,'limited');assert.equal(first.remaining,1);assert.equal(vault.messages.length,1);assert.equal(vault.messages[0].viewsUsed,1);const resumed=JSON.parse(JSON.stringify(vault));const second=consumeGift(resumed,'limited');assert.equal(second.remaining,0);assert.equal(resumed.messages.length,0);assert.deepEqual(resumed.deletedMessageIds,['limited']);assert.equal(consumeGift(resumed,'limited'),null)}});
test('unlimited wrapped gifts reopen without consumption and limited sender copies cannot open',async()=>{
 const {consumeGift}=await import('./public/view-once.js');const m={id:'forever',gift:true,playLimit:0,text:'keep me'},vault={messages:[m]};for(let i=0;i<4;i++){const content=consumeGift(vault,m.id);assert.equal(content.remaining,null);assert.equal(content.text,'keep me')}assert.equal(vault.messages.length,1);assert.equal(m.viewsUsed,undefined);assert.equal(consumeGift({messages:[{...m,mine:true,once:true,playLimit:2}]},m.id),null);
});
test('voice recording releases the microphone and supplies a complete in-memory file after Stop',async()=>{
 const {createVoiceRecorder}=await import('./public/voice.js');let stopped=0,ready,rec,interval;class Recorder{static isTypeSupported(t){return t.startsWith('audio/webm')}constructor(stream,opts){this.mimeType=opts.mimeType;this.state='inactive';rec=this}start(){this.state='recording'}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['audio'],{type:this.mimeType})});this.onstop()})}}const r=createVoiceRecorder({Recorder,mediaDevices:{getUserMedia:async opts=>{assert.equal(opts.video,false);return {getTracks:()=>[{stop(){stopped++}}]}}},schedule:fn=>{interval=fn;return 1},cancel:()=>{},onReady:f=>ready=f});await r.start();assert.equal(rec.state,'recording');r.stop();await Promise.resolve();assert.equal(stopped,1);assert.equal(ready.type,'audio/webm');assert.equal(ready.size,5);assert.equal(rec.state,'inactive');r.cancel();assert.equal(stopped,1);
});
test('cancelled voice permission requests discard late streams without starting recording',async()=>{
 const {createVoiceRecorder}=await import('./public/voice.js');let resolve,stopped=0;const r=createVoiceRecorder({Recorder:class{},mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)},onReady:()=>assert.fail('cancelled audio was exposed')});const start=r.start();r.cancel();resolve({getTracks:()=>[{stop(){stopped++}}]});await start;assert.equal(stopped,1);
});
test('recording stops at two minutes and cancellation discards completed chunks',async()=>{
 const {createVoiceRecorder}=await import('./public/voice.js');let clock=0,interval,ready=0,stopped=0;class Recorder{static isTypeSupported(){return true}constructor(){this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['audio'])});this.onstop()})}}const r=createVoiceRecorder({Recorder,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++}}]})},now:()=>clock,schedule:f=>{interval=f;return 1},cancel:()=>{},onReady:()=>ready++});await r.start();clock=120000;interval();await Promise.resolve();assert.equal(ready,1);assert.equal(stopped,1);await r.start();r.cancel();await Promise.resolve();assert.equal(ready,1);assert.equal(stopped,2);
});

test('push registration requires a session, binds the device owner, and verifies the current pair',async()=>{
 const a=await identity('push-owner'),b=await identity('push-peer'),other=await identity('push-other');const device='test-installation-123456';assert.equal((await request('push/register',{installation:device,token:'a'.repeat(40)})).status,401);assert.equal((await request('push/register',{installation:device,token:'a'.repeat(40)},a.token)).status,200);assert.equal((await request('push/register',{installation:device,token:'b'.repeat(40)},other.token)).status,409);const bm=(await request('me',{},b.token)).body;await request('pair',{code:bm.code},a.token);const am=(await request('me',{},a.token)).body;assert.equal((await request('push/verify',{partner:b.id,epoch:am.epoch},a.token)).status,200);assert.equal((await request('push/verify',{partner:other.id,epoch:am.epoch},a.token)).status,409);assert.equal((await request('push/nudge',{id:'nudge-test-unique',epoch:am.epoch},a.token)).body.status,'unconfigured');assert.equal((await request('push/nudge',{id:'nudge-test-unique',epoch:am.epoch},a.token)).body.status,'duplicate');await request('unpair',{confirm:b.id,epoch:am.epoch},a.token);assert.equal((await request('push/verify',{partner:b.id,epoch:am.epoch},a.token)).status,409);
});
test('push delivery contains routing hints only and caches its short-lived OAuth token',async()=>{
 const {createPushSender}=await import('./push.mjs');const {generateKeyPairSync}=await import('node:crypto');const pair=generateKeyPairSync('rsa',{modulusLength:2048});const credentials=JSON.stringify({project_id:'only-yours-test',client_email:'push@test.example',private_key:pair.privateKey.export({type:'pkcs8',format:'pem'})});let auth=0;const messages=[];const p=createPushSender({credentials:()=>credentials,fetcher:async(url,options)=>{if(url.includes('oauth2')){auth++;return Response.json({access_token:'short-lived',expires_in:3600})}messages.push(JSON.parse(options.body));return Response.json({name:'push/test'})}});assert.equal(p.configured(),true);await p.send('device-token',{id:'nudge1',kind:'nudge',at:100,partner:'paired',epoch:2,text:'never include me',file:'private-media'});await p.send('device-token',{id:'nudge2',kind:'nudge',at:101,epoch:2});assert.equal(auth,1);assert.equal(messages[0].message.android.priority,'HIGH');assert.equal(messages[0].message.data.epoch,'2');assert.equal(messages[0].message.data.text,undefined);assert.equal(messages[0].message.data.file,undefined);const missing=createPushSender({credentials:()=>'',fetcher:()=>assert.fail('unconfigured push requested network')});assert.equal((await missing.send('token',{})).status,'unconfigured');
});
