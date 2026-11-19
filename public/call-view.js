/** Keep the same video elements and streams when moving between call and chat. */
export function createCallView(dialog,{onChat=()=>{},onExpand=()=>{}}={}){
 const clearPosition=()=>{for(const key of ['left','right','top'])dialog.style?.removeProperty(key)};
 const handle=dialog.querySelector?.('#call-drag');
 if(handle){let drag=null;const position=(x,y)=>{const r=dialog.getBoundingClientRect();dialog.style.left=Math.max(8,Math.min(innerWidth-r.width-8,x))+'px';dialog.style.right='auto';dialog.style.top=Math.max(8,Math.min(innerHeight-r.height-80,y))+'px'};handle.addEventListener('pointerdown',event=>{if(!dialog.classList.contains('minimized'))return;const r=dialog.getBoundingClientRect();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:r.left,top:r.top};handle.setPointerCapture(event.pointerId);event.preventDefault()});handle.addEventListener('pointermove',event=>{if(drag?.id===event.pointerId){position(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);event.preventDefault()}});for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,()=>drag=null);window.addEventListener('resize',()=>{if(dialog.open&&dialog.classList.contains('minimized')){const r=dialog.getBoundingClientRect();position(r.left,r.top)}})}
 return {
  minimize(){if(!dialog.open)return;dialog.close();clearPosition();dialog.classList.add('minimized');dialog.show();onChat()},
  expand(){if(!dialog.open||!dialog.classList.contains('minimized'))return;dialog.close();clearPosition();dialog.classList.remove('minimized');dialog.showModal();onExpand()},
  reset(){if(dialog.open)dialog.close();clearPosition();dialog.classList.remove('minimized')},
  isMinimized(){return dialog.open&&dialog.classList.contains('minimized')}
 };
}
