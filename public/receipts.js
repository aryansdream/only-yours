export function receiptState(message){if(message.failed)return {text:'!',label:'Not sent',blue:false};if(message.read)return {text:'✓✓',label:'Read',blue:true};if(message.delivered)return {text:'✓✓',label:'Delivered',blue:false};if(message.sent)return {text:'✓',label:'Sent',blue:false};return {text:'◷',label:'Waiting to send',blue:false}}
export function markSeen(message,at=Date.now()){
 if(!message.readAt){const proposed=Number(at);message.readAt=Number.isFinite(proposed)&&proposed>0&&proposed>=(message.time||0)-300000?Math.min(proposed,Date.now()):Date.now()}
 if(message.disappearAfter>0&&!message.expires)message.expires=message.readAt+Math.min(message.disappearAfter,7*86400000);
 return message;
}
export function applyReceipt(message,type,at=Date.now()){if(type==='read'||type==='opened'){message.failed=false;message.read=true;message.delivered=true;message.sent=true;markSeen(message,at)}else if(type==='receipt'){message.failed=false;message.delivered=true;message.sent=true}return message}
