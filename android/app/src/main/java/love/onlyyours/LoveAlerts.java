package love.onlyyours;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import org.json.*;
import java.net.*;
import java.io.*;

/** Generic alerts only. Never receives private keys or decrypts message content. */
public class LoveAlerts extends Service {
 public static volatile String session;
 public static final String ORIGIN="https://only-yours-app-private.vercel.app";
 private volatile boolean active;
 private Thread worker;
 public static void channels(Context c){LoveNotifications.channels(c);NotificationManager n=c.getSystemService(NotificationManager.class);n.createNotificationChannel(new NotificationChannel("connection","Private connection",NotificationManager.IMPORTANCE_LOW));n.createNotificationChannel(new NotificationChannel("love","A little love",NotificationManager.IMPORTANCE_DEFAULT));}
 public static Notification notification(Context c,String title,String body,String channel){Intent i=new Intent(c,MainActivity.class);PendingIntent p=PendingIntent.getActivity(c,0,i,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);return new Notification.Builder(c,channel).setSmallIcon(android.R.drawable.btn_star_big_on).setContentTitle(title).setContentText(body).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(p).setAutoCancel(true).build();}
 public static void alert(Context c){channels(c);try{c.getSystemService(NotificationManager.class).notify(18,notification(c,"Only Yours","A little love is waiting ♡","love"));}catch(SecurityException ignored){}}
 @Override public IBinder onBind(Intent i){return null;}
 @Override public int onStartCommand(Intent intent,int flags,int startId){channels(this);if(session==null){stopSelf();return START_NOT_STICKY;}Notification n=notification(this,"Only Yours","Private message alerts are connected","connection");if(Build.VERSION.SDK_INT>=34)startForeground(17,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);else startForeground(17,n);if(!active){active=true;worker=new Thread(this::loop,"only-yours-alerts");worker.start();}return START_NOT_STICKY;}
 private void loop(){while(active&&session!=null){try{HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+"/api/events").openConnection();c.setRequestProperty("Authorization","Bearer "+session);c.setConnectTimeout(15000);c.setReadTimeout(45000);if(c.getResponseCode()==401){session=null;break;}try(BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream()))){String line;while(active&&(line=r.readLine())!=null)if(line.startsWith("data:"))alerts();}finally{c.disconnect();}}catch(Exception ignored){}try{Thread.sleep(1500);}catch(InterruptedException e){break;}}stopSelf();}
 private void alerts()throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+"/api/alerts").openConnection();c.setRequestMethod("POST");c.setRequestProperty("Authorization","Bearer "+session);c.setRequestProperty("Content-Type","application/json");c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setDoOutput(true);c.getOutputStream().write("{}".getBytes("UTF-8"));try(InputStream in=c.getInputStream()){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[2048];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>100000)throw new IOException("Alert data too large");}JSONObject value=new JSONObject(out.toString("UTF-8"));JSONArray messages=value.optJSONArray("messages"),calls=value.optJSONArray("calls");if(messages!=null)for(int i=messages.length()-1;i>=0;i--){JSONObject m=messages.getJSONObject(i);LoveNotifications.message(this,m.getString("id"),"nudge".equals(m.optString("kind")));}if(calls!=null)for(int i=0;i<calls.length();i++){JSONObject call=calls.getJSONObject(i);String id=call.getString("id");if("ended".equals(call.optString("phase")))LoveNotifications.clearCall(this,id);else LoveNotifications.incoming(this,id,call.optBoolean("video"),call.optLong("at"));}}finally{c.disconnect();}}
 @Override public void onDestroy(){active=false;if(worker!=null)worker.interrupt();super.onDestroy();}
}
