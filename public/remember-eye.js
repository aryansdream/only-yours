let timer,waiting=false;
/** Show a received nudge once the person's app is visible. */
export function receiveRememberEye(){
 if(document.visibilityState==='visible'){waiting=false;showRememberEye();return}
 if(waiting)return;
 waiting=true;
 document.addEventListener('visibilitychange',function reveal(){
  if(document.visibilityState!=='visible')return;
  document.removeEventListener('visibilitychange',reveal);
  if(waiting){waiting=false;showRememberEye()}
 });
}
export function showRememberEye(){
 let screen=document.getElementById('remember-eye');
 if(!screen){
  screen=document.createElement('div');screen.id='remember-eye';screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','A little reminder from your person');screen.tabIndex=-1;
  screen.innerHTML='<div class="remember-eye-sparkle" aria-hidden="true">✧ &nbsp; ♡ &nbsp; ✧</div><div class="remember-eye-art" aria-hidden="true"><span class="remember-eye-cheek left"></span><div class="remember-eye-lid"><div class="remember-eye-iris"><span class="remember-eye-shine"></span></div></div><span class="remember-eye-cheek right"></span></div><p>Your person is thinking of you</p><small>Remember me ♡</small><button type="button" aria-label="Close reminder">×</button>';
  document.body.append(screen);screen.querySelector('button').onclick=()=>screen.remove();screen.onclick=e=>{if(e.target===screen)screen.remove()};screen.onkeydown=e=>{if(e.key==='Escape')screen.remove()};
 }
 clearTimeout(timer);screen.classList.remove('remember-eye-active');void screen.offsetWidth;screen.classList.add('remember-eye-active');screen.focus();timer=setTimeout(()=>screen.remove(),4200);
}
