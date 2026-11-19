// Keep the existing IME session alive: a send-button press must not move focus.
export function bindComposerFocus(form,input){
 const send=form.querySelector('.send');
 const hold=e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault()};
 send.addEventListener('pointerdown',hold);
 // Older Android WebViews may dispatch compatibility mouse events as well.
 send.addEventListener('mousedown',hold);
 const focus=()=>input.focus({preventScroll:true});
 form.addEventListener('submit',focus);
 return ()=>{send.removeEventListener('pointerdown',hold);send.removeEventListener('mousedown',hold);form.removeEventListener('submit',focus)};
}
