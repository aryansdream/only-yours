/** No network access: device-local deletion and delivery policy. */
export function deleteLocalMessages(vault,ids){
 const remove=new Set(ids),deleted=new Set(vault.deletedMessageIds||[]);
 for(const id of remove)deleted.add(id);
 vault.deletedMessageIds=[...deleted];
 vault.messages=vault.messages.filter(m=>!remove.has(m.id));
 vault.outbox=vault.outbox.filter(m=>!remove.has(m.id)&&!remove.has(m.localCallId));
 if(vault.pendingCallResults)vault.pendingCallResults=vault.pendingCallResults.filter(m=>!remove.has('call:'+m.call.id));
 for(const m of vault.messages)if(m.reply&&remove.has(m.reply.id))m.reply={id:m.reply.id,text:'Message deleted on this device'};
}
export async function deliverEnvelope(envelope,{sendDirect,sendRelay,onDispatched}){
 const direct=await sendDirect(envelope,onDispatched);
 if(direct)return 'direct';
 if(envelope.relayAllowed!==true)return 'waiting-on-device';
 await sendRelay(envelope);return 'relay';
}
