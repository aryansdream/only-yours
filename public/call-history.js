export function recordCall(vault,event){
 if(!event||typeof event.id!=='string'||event.id.length>80||!['incoming','outgoing'].includes(event.direction))return null;
 const id='call:'+event.id;if(vault.deletedMessageIds?.includes(id))return null;
 let message=vault.messages.find(m=>m.id===id),previous=message?.call;
 const connectedAt=previous?.connectedAt||Number(event.connectedAt)||0;
 const answeredAt=previous?.answeredAt||Number(event.answeredAt)||0;
 const endedAt=previous?.endedAt||Number(event.endedAt)||0;
 const status=connectedAt?(endedAt?'completed':'connected'):endedAt?(previous?.status==='declined'||event.status==='declined'?'declined':answeredAt?'failed':event.direction==='incoming'?'missed':event.status==='busy'?'busy':'unanswered'):'ringing';
 const call={id:event.id,direction:event.direction,video:!!event.video,startedAt:previous?.startedAt||Number(event.startedAt)||Date.now(),connectedAt,answeredAt,endedAt,status};
 const kind=call.video?'video':'voice';const label=status==='missed'?'Missed '+kind+' call':status==='declined'?'Declined '+kind+' call':status==='failed'?"Couldn’t connect · "+kind+' call':status==='busy'?'Busy · '+kind+' call':status==='unanswered'?'No answer · '+kind+' call':status==='completed'?(call.direction==='incoming'?'Incoming ':'Outgoing ')+kind+' call':status==='connected'?'In '+kind+' call':(call.direction==='incoming'?'Incoming ':'Outgoing ')+kind+' call…';
 if(!message){message={id,time:call.startedAt,mine:event.direction==='outgoing'};vault.messages.push(message)}message.call=call;message.text=label;return message;
}
export function hasEndedCall(vault,id){const key='call:'+id;return !!vault?.deletedMessageIds?.includes(key)||!!vault?.messages.find(m=>m.id===key&&m.call?.endedAt)}
