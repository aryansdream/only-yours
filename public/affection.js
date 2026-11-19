let timer;
export function closeAffection(){const d=document.querySelector('#burst');clearTimeout(timer);d?.classList.remove('animate');if(d?.open)d.close();window.dispatchEvent(new Event('onlyyours:affection-closed'))}
export function showAffection(kind='hug'){
 const d=document.querySelector('#burst');if(!d)return;const kiss=kind==='kiss';d.classList.toggle('kiss-mode',kiss);d.querySelector('h2').textContent=kiss?'A little kiss, just for you.':'Right here. Holding you.';d.querySelector('.affection-caption').textContent=kiss?'Across every little distance. A kiss from your person.':'Close your eyes for a moment. This hug is just for you.';d.querySelector('.hug-heart').textContent=kiss?'♥':'♥';if(!d.open)d.showModal();d.classList.add('animate');
 try{if(kiss&&window.OnlyYoursNative?.kiss)window.OnlyYoursNative.kiss();else if(window.OnlyYoursNative?.hug)window.OnlyYoursNative.hug();else navigator.vibrate?.(kiss?[40,70,40]:[80,100,180,120,80])}catch{}
 clearTimeout(timer);timer=setTimeout(closeAffection,12000)
}
export function bindAffection(){const d=document.querySelector('#burst');d?.querySelector('#close-hug')?.addEventListener('click',closeAffection);d?.querySelector('#replay-affection')?.addEventListener('click',()=>{d.classList.remove('animate');requestAnimationFrame(()=>showAffection(d.classList.contains('kiss-mode')?'kiss':'hug'))});d?.addEventListener('cancel',closeAffection)}
