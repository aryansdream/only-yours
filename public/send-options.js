// A hold opens options; its release must never submit the regular message.
export function bindSendHold(button,onHold,{delay=500,schedule=setTimeout,cancel=clearTimeout}={}){
 let timer=null,start=null,held=false;
 const clear=()=>{if(timer!==null)cancel(timer);timer=null};
 const down=e=>{if(button.disabled||e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;clear();held=false;start={x:e.clientX,y:e.clientY,id:e.pointerId};button.setPointerCapture?.(e.pointerId);timer=schedule(()=>{timer=null;if(!start)return;held=true;onHold()},delay)};
 const move=e=>{if(start&&e.pointerId===start.id&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>12){clear();start=null}};
 const end=()=>{clear();start=null};
 const click=e=>{if(!held)return;held=false;e.preventDefault();e.stopImmediatePropagation()};
 const context=e=>{e.preventDefault()};
 const key=e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();onHold()}};
 const events={pointerdown:down,pointermove:move,pointerup:end,pointercancel:end,lostpointercapture:end,contextmenu:context,keydown:key};
 for(const [name,fn]of Object.entries(events))button.addEventListener(name,fn);button.addEventListener('click',click,true);
 return ()=>{end();for(const [name,fn]of Object.entries(events))button.removeEventListener(name,fn);button.removeEventListener('click',click,true)};
}
export function bindGiftMenu({form,input,menu,onGift,onEmpty=()=>{}}){
 const send=form.querySelector('.send'),gift=menu.querySelector('#send-gift'),closeButton=menu.querySelector('#cancel-send-gift'),duration=menu.querySelector('#gift-duration');
 const close=()=>{menu.hidden=true;send.setAttribute('aria-expanded','false')};
 const open=()=>{if(!input.value.trim()){onEmpty();return}menu.hidden=false;send.setAttribute('aria-expanded','true')};
 bindSendHold(send,open);
 for(const button of [gift,closeButton])button.addEventListener('pointerdown',e=>e.preventDefault());
 closeButton.onclick=()=>{close();input.focus({preventScroll:true})};
 gift.onclick=()=>{const text=input.value.trim();close();input.focus({preventScroll:true});if(text)onGift(text,Number(duration.value),Number(menu.querySelector('#gift-limit').value))};
 form.addEventListener('submit',close);
 menu.ownerDocument.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!send.contains(e.target))close()});
 menu.ownerDocument.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
 menu.ownerDocument.addEventListener('visibilitychange',()=>{if(menu.ownerDocument.hidden)close()});
 close();return {close};
}
