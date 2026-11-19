let timer;
/** A short full-screen nudge, dismissed automatically or with a tap/Escape. */
export function showRememberEye(){
 let screen=document.getElementById('remember-eye');
 if(!screen){screen=document.createElement('div');screen.id='remember-eye';screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label','Remember me');screen.tabIndex=-1;screen.innerHTML='<div class="remember-eye-art" aria-hidden="true"><div class="remember-eye-lid"><div class="remember-eye-iris"><div class="remember-eye-pupil"></div></div></div></div><p>Remember me ♡</p><button type="button" aria-label="Close Remember me">×</button>';document.body.append(screen);screen.querySelector('button').onclick=()=>screen.remove();screen.onclick=e=>{if(e.target===screen)screen.remove()};screen.onkeydown=e=>{if(e.key==='Escape')screen.remove()}}
 clearTimeout(timer);screen.classList.remove('remember-eye-active');void screen.offsetWidth;screen.classList.add('remember-eye-active');screen.focus();timer=setTimeout(()=>screen.remove(),3800);
}
