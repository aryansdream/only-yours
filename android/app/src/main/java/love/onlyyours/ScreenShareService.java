package love.onlyyours;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.graphics.*;
import android.hardware.display.*;
import android.media.*;
import android.media.projection.*;
import android.os.*;
import android.util.*;
import java.io.*;

/** Consent-scoped capture. Frames stay in memory and are sent to WebRTC, never uploaded. */
public class ScreenShareService extends Service {
 public static final CallSessionState state=new CallSessionState();
 public interface Sink {void frame(String id,String jpeg,int width,int height);void ended(String id);}
 public static volatile Sink sink;
 private String owned="";
 private HandlerThread thread;
 private Handler handler;
 private MediaProjection projection;
 private VirtualDisplay display;
 private ImageReader reader;
 private Bitmap padded,output;
 private int width,height,dpi;
 private long lastFrame;
 private boolean cleaned;
 @Override public IBinder onBind(Intent i){return null;}
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  if(intent==null){stopSelfResult(startId);return START_NOT_STICKY;}
  String id=intent.getStringExtra("shareId");if(id==null||!state.owns(id))return START_NOT_STICKY;
  if("stop".equals(intent.getAction())){finish("stopped");stopSelfResult(startId);return START_NOT_STICKY;}
  if(thread!=null)return START_NOT_STICKY;owned=id;
  try{NotificationManager nm=getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel("screen","Screen sharing",NotificationManager.IMPORTANCE_LOW));PendingIntent stop=PendingIntent.getService(this,23,new Intent(this,ScreenShareService.class).setAction("stop").putExtra("shareId",id),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);PendingIntent open=PendingIntent.getActivity(this,24,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);Notification n=new Notification.Builder(this,"screen").setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("Only Yours · sharing your screen").setContentText("Your person can see the shared screen").setContentIntent(open).setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE).addAction(new Notification.Action.Builder(null,"Stop sharing",stop).build()).build();startForeground(23,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
   final int result=intent.getIntExtra("result",Activity.RESULT_CANCELED);final Intent data=intent.getParcelableExtra("data");thread=new HandlerThread("only-yours-screen");thread.start();handler=new Handler(thread.getLooper());handler.post(()->initialize(result,data));
  }catch(Exception e){state.finish(owned,"capture-unavailable",true);stopSelfResult(startId);}
  return START_NOT_STICKY;
 }
 private void initialize(int result,Intent data){try{if(!state.owns(owned)||!state.snapshot()[1].equals("starting")){stopSelf();return;}MediaProjectionManager manager=getSystemService(MediaProjectionManager.class);projection=manager.getMediaProjection(result,data);if(projection==null)throw new IllegalStateException();DisplayMetrics metrics=getResources().getDisplayMetrics();dpi=metrics.densityDpi;Rect bounds=getSystemService(android.view.WindowManager.class).getMaximumWindowMetrics().getBounds();size(bounds.width(),bounds.height());projection.registerCallback(new MediaProjection.Callback(){@Override public void onStop(){finish("system-stopped");stopSelf();}@Override public void onCapturedContentResize(int w,int h){if(display!=null)resize(w,h);}},handler);display=projection.createVirtualDisplay("Only Yours screen",width,height,dpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader.getSurface(),null,handler);if(!state.activate(owned))stopSelf();}catch(Exception e){state.finish(owned,"capture-unavailable",true);stopSelf();}}
 private void size(int w,int h){float scale=Math.min(1f,960f/Math.max(w,h));width=Math.max(2,(Math.round(w*scale)/2)*2);height=Math.max(2,(Math.round(h*scale)/2)*2);reader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2);reader.setOnImageAvailableListener(this::frame,handler);}
 private void resize(int w,int h){try{int oldW=width,oldH=height;float scale=Math.min(1f,960f/Math.max(w,h));if(oldW==(Math.max(2,(Math.round(w*scale)/2)*2))&&oldH==(Math.max(2,(Math.round(h*scale)/2)*2)))return;ImageReader old=reader;size(w,h);display.resize(width,height,dpi);display.setSurface(reader.getSurface());old.close();if(padded!=null){padded.recycle();padded=null;}if(output!=null){output.recycle();output=null;}}catch(Exception e){finish("resize-failed");stopSelf();}}
 private void frame(ImageReader source){try(Image image=source.acquireLatestImage()){if(image==null||!state.isActive()||!state.owns(owned)||SystemClock.elapsedRealtime()-lastFrame<200)return;lastFrame=SystemClock.elapsedRealtime();Image.Plane plane=image.getPlanes()[0];int paddedWidth=width+(plane.getRowStride()-plane.getPixelStride()*width)/plane.getPixelStride();if(padded==null||padded.getWidth()!=paddedWidth||padded.getHeight()!=height){if(padded!=null)padded.recycle();padded=Bitmap.createBitmap(paddedWidth,height,Bitmap.Config.ARGB_8888);}plane.getBuffer().rewind();padded.copyPixelsFromBuffer(plane.getBuffer());if(output==null)output=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);new Canvas(output).drawBitmap(padded,new Rect(0,0,width,height),new Rect(0,0,width,height),null);ByteArrayOutputStream bytes=new ByteArrayOutputStream();output.compress(Bitmap.CompressFormat.JPEG,55,bytes);Sink listener=sink;if(listener!=null)listener.frame(owned,Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP),width,height);}catch(Exception ignored){}}
 private void finish(String why){if(state.finish(owned,why,false)){Sink listener=sink;if(listener!=null)new Handler(Looper.getMainLooper()).post(()->listener.ended(owned));}}
 @Override public void onDestroy(){finish("service-stopped");if(handler!=null)handler.post(()->{if(cleaned)return;cleaned=true;if(display!=null)display.release();if(reader!=null)reader.close();if(projection!=null)projection.stop();if(padded!=null)padded.recycle();if(output!=null)output.recycle();thread.quitSafely();});super.onDestroy();}
}
