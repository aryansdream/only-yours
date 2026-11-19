/** Only a matching, explicit native action can terminate a visible call. */
export function nativeCallAction(detail,currentId){
 if(!currentId||!detail||detail.id!==currentId)return 'ignore';
 if(['notification','task-removed'].includes(detail.reason))return 'end';
 return 'foreground-only';
}
export async function acquireNativeCall(native,video,id,{sleep=ms=>new Promise(r=>setTimeout(r,ms)),visible=()=>true}={}){
 if(!native)return {background:false,browser:true};
 if(typeof native.beginCallSession!=='function'||typeof native.callServiceStatus!=='function')return {background:false,reason:'update-required'};
 if(!native.beginCallSession(id,video))throw Error('Return to the app and unlock it before starting a call.');
 for(let i=0;i<60;i++){
  await sleep(50);let status;try{status=JSON.parse(native.callServiceStatus())}catch{continue}
  if(status.id!==id)continue;
  if(status.state==='active')return {background:true};
  if(['failed','ended'].includes(status.state)){
   native.finishCallSession?.(id);
   if(!visible())throw Error('Android could not keep the call active in background. Reopen the app to call.');
   return {background:false,reason:status.reason||'background-service-unavailable'};
  }
 }
 native.finishCallSession?.(id);
 if(!visible())throw Error('Background calling did not start. Reopen the app to call.');
 return {background:false,reason:'service-timeout'};
}
