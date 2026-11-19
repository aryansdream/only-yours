package love.onlyyours;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;

/** Foreground lifetime only. WebView/WebRTC owns media capture and audio focus. */
public class CallService extends Service {
 public static final CallSessionState state=new CallSessionState();
 public interface EndListener {void onEnded(String id,String reason);}
 public static volatile EndListener ended;
 private String ownedId="";
 private PowerManager.WakeLock wake;
 @Override public IBinder onBind(Intent i){return null;}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  if(intent==null){stopSelfResult(startId);return START_NOT_STICKY;}
  String id=intent.getStringExtra("callId");
  if(id==null||!state.owns(id))return START_NOT_STICKY;
  if("end".equals(intent.getAction())||"release".equals(intent.getAction())){finishCall(id,"end".equals(intent.getAction())?"notification":"released","end".equals(intent.getAction()));stopSelfResult(startId);return START_NOT_STICKY;}
  ownedId=id;boolean video=intent.getBooleanExtra("video",false);
  try{
   NotificationManager nm=getSystemService(NotificationManager.class);
   nm.createNotificationChannel(new NotificationChannel("calls","Ongoing private call",NotificationManager.IMPORTANCE_LOW));
   PendingIntent open=PendingIntent.getActivity(this,21,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
   PendingIntent end=PendingIntent.getService(this,22,new Intent(this,CallService.class).setAction("end").putExtra("callId",id),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
   Notification n=new Notification.Builder(this,"calls").setSmallIcon(android.R.drawable.sym_call_incoming).setContentTitle("Only Yours · private call").setContentText(video?"Video call active · tap to return":"Voice call active · tap to return").setContentIntent(open).setCategory(Notification.CATEGORY_CALL).setVisibility(Notification.VISIBILITY_PRIVATE).setOngoing(true).setOnlyAlertOnce(true).addAction(new Notification.Action.Builder(null,"End call",end).build()).build();
   startForeground(21,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE|(video?ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA:0));
   if(!state.activate(id)){stopSelfResult(startId);return START_NOT_STICKY;}
  }catch(SecurityException e){state.finish(id,"permissions",true);stopSelfResult(startId);return START_NOT_STICKY;}
  catch(Exception e){state.finish(id,"background-service-unavailable",true);stopSelfResult(startId);return START_NOT_STICKY;}
  // WebRTC owns audio routing and focus; this service only holds call lifetime.
  // Optional wake-lock failure must not terminate a working foreground call.
  try{if(wake==null){wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"onlyyours:call");wake.acquire();}}catch(Exception ignored){}
  return START_NOT_STICKY;
 }
 private void finishCall(String id,String reason,boolean notify){if(!state.finish(id,reason,false))return;if(notify){EndListener callback=ended;if(callback!=null)new Handler(Looper.getMainLooper()).post(()->callback.onEnded(id,reason));}stopForeground(STOP_FOREGROUND_REMOVE);}
 @Override public void onTaskRemoved(Intent intent){finishCall(ownedId,"task-removed",true);stopSelf();super.onTaskRemoved(intent);}
 @Override public void onDestroy(){finishCall(ownedId,"service-stopped",true);if(wake!=null&&wake.isHeld())wake.release();super.onDestroy();}
}
