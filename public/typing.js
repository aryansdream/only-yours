/** Ephemeral presence only: no typed content or chat-history entries. */
export class TypingIndicator {
 constructor(change,{now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}){Object.assign(this,{change,now,schedule,cancel});this.until=0}
 update(packet){if(!packet||typeof packet.active!=='boolean')return;const at=Number(packet.at);if(!Number.isFinite(at)||Math.abs(this.now()-at)>5000)return;this.cancel(this.timer);this.until=packet.active?this.now()+3000:0;this.change(this.active());if(packet.active)this.timer=this.schedule(()=>{this.until=0;this.change(false)},3000)}
 active(){return this.until>this.now()}
 clear(){this.cancel(this.timer);this.until=0;this.change(false)}
}
