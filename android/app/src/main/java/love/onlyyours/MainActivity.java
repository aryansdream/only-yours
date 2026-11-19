package love.onlyyours;

import android.app.*;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.biometrics.BiometricManager;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;

/** Android 11+ host. HTTPS relay URL is configured on first launch. */
public class MainActivity extends Activity {
 private WebView web;
 private TextView cover;
 private android.widget.FrameLayout frame;
 private volatile boolean unlocked=false;
 private boolean prompting=false;
 private volatile boolean picking=false;
 private volatile boolean foreground=false;
 private DeviceLogin deviceLogin;
 private volatile String unlockedSavedLogin="";
 private volatile String pendingRemember=null;
 private VaultMigration migration;
 private static final String APP_ORIGIN="https://only-yours-app-private.vercel.app";
 private static final String PREVIOUS_ORIGIN="https://only-yours-aryan-shreya.vercel.app";
 private PermissionRequest mediaPermission;
 private volatile String origin;
 private ValueCallback<Uri[]> upload;
 private Uri[] pendingFiles;
 private byte[] pendingSave;
 private Uri cameraUri;
 private java.io.File cameraFile;
 private String pendingShareId,pendingShareCall;
 private volatile boolean framePending=false;
 private CancellationSignal signal;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  clearCameraCache();
  deviceLogin=new DeviceLogin(this);
  migration=new VaultMigration(this);
  getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,WindowManager.LayoutParams.FLAG_SECURE);
  frame=new android.widget.FrameLayout(this);
  frame.setBackgroundColor(0xfffbf7f4);
  frame.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
  cover=new TextView(this);cover.setText("♡\nOnly Yours\nYour little world is locked.");cover.setGravity(Gravity.CENTER);cover.setTextSize(25);cover.setTextColor(0xff81324b);cover.setBackgroundColor(0xfffbf7f4);
  frame.addView(cover,new android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(frame);
  cover.setOnClickListener(v->authenticate());
  if(LoveNotifications.handleIntent(this,getIntent())){setShowWhenLocked(true);setTurnScreenOn(true);}
 }
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(LoveNotifications.handleIntent(this,intent)){setShowWhenLocked(true);setTurnScreenOn(true);if(unlocked&&web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('onlyyours:notification-action'))",null);else authenticate();}}
 @Override protected void onStart(){super.onStart();foreground=true;if(!picking)authenticate();}
 @Override protected void onResume(){super.onResume();if(web!=null&&!picking&&!prompting&&unlocked)web.postDelayed(()->{if(unlocked&&!prompting)web.evaluateJavascript("window.dispatchEvent(new Event('onlyyours:unlocked'))",null);},150);}
 private void savedUnlock(boolean force){runOnUiThread(()->{if(prompting||isFinishing())return;if(force){unlocked=false;unlockedSavedLogin="";web.setVisibility(View.INVISIBLE);cover.setVisibility(View.VISIBLE);}if(unlocked)showApp();else authenticate();});}
 private void authenticate(){
  if(prompting||unlocked||isFinishing())return;
  KeyguardManager kg=(KeyguardManager)getSystemService(KEYGUARD_SERVICE);
  if(!kg.isDeviceSecure()){
   cover.setText("Set a phone PIN, pattern or password first.\nTap here after setting it.");return;
  }
  deviceLogin.prepare();
  prompting=true;signal=new CancellationSignal();
  new BiometricPrompt.Builder(this).setTitle("Open Only Yours").setSubtitle("Just your little world")
   .setAllowedAuthenticators(BiometricManager.Authenticators.DEVICE_CREDENTIAL | BiometricManager.Authenticators.BIOMETRIC_STRONG)
   .build().authenticate(signal,getMainExecutor(),new BiometricPrompt.AuthenticationCallback(){
    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r){prompting=false;unlocked=true;if(pendingRemember!=null){deviceLogin.save(pendingRemember);pendingRemember=null;}unlockedSavedLogin=deviceLogin.restore();showApp();}
    @Override public void onAuthenticationError(int code,CharSequence message){prompting=false;pendingRemember=null;cover.setText("Only Yours is locked.\nTap to try again.");}
   });
 }
 private void showApp(){
  if(web!=null){web.setVisibility(View.VISIBLE);cover.setVisibility(View.GONE);web.evaluateJavascript("window.dispatchEvent(new Event(\"onlyyours:unlocked\"))",null);deliverFiles();return;}
  origin=getPreferences(0).getBoolean("migrated-private-address-v1",false)?APP_ORIGIN:PREVIOUS_ORIGIN;
  createWeb();
 }

 private void createWeb(){
  web=new WebView(this);web.setBackgroundColor(0xfffbf7f4);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setMediaPlaybackRequiresUserGesture(false);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  web.addJavascriptInterface(new NativeBridge(),"OnlyYoursNative");
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){Uri u=r.getUrl();if("https://github.com/aryansdream".equals(u.toString())){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;}return !origin.equals(u.getScheme()+"://"+u.getAuthority());}
   @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler h,android.net.http.SslError e){h.cancel();}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{
    Uri u=request.getOrigin();if(!unlocked||!origin.equals(u.getScheme()+"://"+u.getAuthority())){request.deny();return;}
    java.util.ArrayList<String> missing=new java.util.ArrayList<>();
    for(String resource:request.getResources()){
     String permission=PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)?"android.permission.RECORD_AUDIO":PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)?"android.permission.CAMERA":null;
     if(permission==null){request.deny();return;}
     if(checkSelfPermission(permission)!=android.content.pm.PackageManager.PERMISSION_GRANTED&&!missing.contains(permission))missing.add(permission);
    }
    if(missing.isEmpty())request.grant(request.getResources());else{if(mediaPermission!=null)mediaPermission.deny();mediaPermission=request;requestPermissions(missing.toArray(new String[0]),10);}
   });}
   @Override public void onPermissionRequestCanceled(PermissionRequest request){runOnUiThread(()->{if(mediaPermission==request)mediaPermission=null;});}

   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){
    if(upload!=null)upload.onReceiveValue(null);upload=cb;picking=true;
    if(params.isCaptureEnabled()){boolean image=false;for(String type:params.getAcceptTypes())if(type!=null&&type.startsWith("image/"))image=true;if(image){if(checkSelfPermission("android.permission.CAMERA")!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.CAMERA"},13);else launchCamera();return true;}}
    try{startActivityForResult(params.createIntent(),7);return true;}catch(Exception e){picking=false;upload=null;cb.onReceiveValue(null);return true;}
   }
  });
  frame.addView(web,0,new android.widget.FrameLayout.LayoutParams(-1,-1));cover.setVisibility(View.GONE);web.loadUrl(origin+(origin.equals(PREVIOUS_ORIGIN)?"/migrate":""));
 }
 private void clearCameraCache(){java.io.File[] captures=new java.io.File(getCacheDir(),"camera").listFiles();if(captures!=null)for(java.io.File file:captures)if(file.getName().matches("photo-[0-9a-f-]{36}\\.jpg"))file.delete();}
 private void launchCamera(){try{java.io.File dir=new java.io.File(getCacheDir(),"camera");dir.mkdirs();java.io.File[] previous=dir.listFiles();if(previous!=null)for(java.io.File old:previous)if(old.lastModified()<System.currentTimeMillis()-900000)old.delete();cameraFile=new java.io.File(dir,"photo-"+java.util.UUID.randomUUID()+".jpg");cameraFile.createNewFile();cameraUri=Uri.parse("content://love.onlyyours.camera/image/"+cameraFile.getName());Intent i=new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);i.putExtra(android.provider.MediaStore.EXTRA_OUTPUT,cameraUri);i.setClipData(ClipData.newRawUri("Only Yours photo",cameraUri));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);startActivityForResult(i,14);}catch(Exception e){picking=false;if(upload!=null){upload.onReceiveValue(null);upload=null;}Toast.makeText(this,"Could not open the camera. Choose a photo instead.",Toast.LENGTH_LONG).show();}}
 private void startAlerts(){PushRegistration.start(this);if(LoveAlerts.session==null)return;Intent i=new Intent(this,LoveAlerts.class);startForegroundService(i);}
 public class NativeBridge {
  @JavascriptInterface public boolean isCallActive(){return CallService.state.isActive();}
  @JavascriptInterface public String callServiceStatus(){try{String[] state=CallService.state.snapshot();return new org.json.JSONObject().put("id",state[0]).put("state",state[1]).put("reason",state[2]).toString();}catch(Exception e){return "{}";}}
  @JavascriptInterface public boolean beginCallSession(String id,boolean video){if(!unlocked||!foreground||!CallService.state.begin(id))return false;runOnUiThread(()->{if(!foreground||!unlocked){CallService.state.finish(id,"foreground-required",true);return;}CallService.ended=(callId,reason)->{if(web!=null){try{String detail=new org.json.JSONObject().put("id",callId).put("reason",reason).toString();web.evaluateJavascript("window.dispatchEvent(new CustomEvent('onlyyours:end-call',{detail:"+detail+"}))",null);}catch(Exception ignored){}}};try{startForegroundService(new Intent(MainActivity.this,CallService.class).putExtra("callId",id).putExtra("video",video));}catch(SecurityException e){CallService.state.finish(id,"permissions",true);}catch(Exception e){CallService.state.finish(id,"background-service-unavailable",true);}});return true;}
  @JavascriptInterface public void finishCallSession(String id){runOnUiThread(()->{if(!CallService.state.owns(id))return;CallService.state.finish(id,"released",false);stopService(new Intent(MainActivity.this,CallService.class));});}
  @JavascriptInterface public boolean beginScreenShare(String id,String callId){if(!unlocked||!foreground||!CallService.state.isActive()||!CallService.state.owns(callId)||!ScreenShareService.state.begin(id))return false;runOnUiThread(()->{pendingShareId=id;pendingShareCall=callId;picking=true;try{startActivityForResult(getSystemService(android.media.projection.MediaProjectionManager.class).createScreenCaptureIntent(),15);}catch(Exception e){picking=false;ScreenShareService.state.finish(id,"permission-unavailable",true);}});return true;}
  @JavascriptInterface public String screenShareStatus(){try{String[] v=ScreenShareService.state.snapshot();return new org.json.JSONObject().put("id",v[0]).put("state",v[1]).put("reason",v[2]).toString();}catch(Exception e){return "{}";}}
  @JavascriptInterface public void stopScreenShare(String id){runOnUiThread(()->{if(!ScreenShareService.state.owns(id))return;ScreenShareService.state.finish(id,"released",false);stopService(new Intent(MainActivity.this,ScreenShareService.class));});}
  @JavascriptInterface public void releaseCameraCapture(){runOnUiThread(()->{if(!picking)clearCameraCache();});}
  @JavascriptInterface public boolean isChoosingFile(){return picking;}
  @JavascriptInterface public boolean stageVaultMigration(String payload){return unlocked&&PREVIOUS_ORIGIN.equals(origin)&&migration.stage(payload);}
  @JavascriptInterface public void openNewApp(){if(!unlocked||!PREVIOUS_ORIGIN.equals(origin)||migration.read().isEmpty())return;runOnUiThread(()->{origin=APP_ORIGIN;web.loadUrl(APP_ORIGIN);});}
  @JavascriptInterface public String stagedVaultMigration(){return unlocked&&APP_ORIGIN.equals(origin)?migration.read():"";}
  @JavascriptInterface public void completeVaultMigration(){if(!unlocked||!APP_ORIGIN.equals(origin))return;getPreferences(0).edit().putBoolean("migrated-private-address-v1",true).commit();migration.complete();}

  @JavascriptInterface public boolean rememberLogin(String payload){if(!unlocked||payload==null||payload.length()>=3000)return false;boolean saved=deviceLogin.save(payload);if(saved)unlockedSavedLogin=deviceLogin.restore();else if("auth_required".equals(deviceLogin.status())||"key_invalid".equals(deviceLogin.status())){if("key_invalid".equals(deviceLogin.status()))deviceLogin.replaceInvalidatedKey();pendingRemember=payload;savedUnlock(true);}return saved;}
  @JavascriptInterface public String restoreLogin(){if(!unlocked)return "";if(!unlockedSavedLogin.isEmpty())return unlockedSavedLogin;unlockedSavedLogin=deviceLogin.restore();return unlockedSavedLogin;}
  @JavascriptInterface public String savedLoginStatus(){return unlocked?deviceLogin.status():"locked";}
  @JavascriptInterface public void requestSavedUnlock(boolean force){savedUnlock(force);}
  @JavascriptInterface public boolean hasSavedLogin(){return deviceLogin.exists();}
  @JavascriptInterface public void forgetLogin(){PushRegistration.forget(MainActivity.this);unlockedSavedLogin="";pendingRemember=null;deviceLogin.forget();LoveAlerts.session=null;runOnUiThread(()->stopService(new Intent(MainActivity.this,LoveAlerts.class)));}
  @JavascriptInterface public void lockScreen(){runOnUiThread(()->{unlocked=false;unlockedSavedLogin="";if(web!=null)web.setVisibility(View.INVISIBLE);cover.setText("♡\nOnly Yours\nTap to unlock your little world.");cover.setVisibility(View.VISIBLE);});}

  @JavascriptInterface public void setSession(String token){if(token==null||!token.matches("[a-f0-9]{48}"))return;LoveAlerts.session=token;PushRegistration.session(MainActivity.this,token);runOnUiThread(()->{if(getPreferences(0).getBoolean("alerts",false))startAlerts();});}
  @JavascriptInterface public void enableAlerts(){runOnUiThread(()->{getPreferences(0).edit().putBoolean("alerts",true).apply();if(Build.VERSION.SDK_INT>=33&&checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},9);else startAlerts();});}
  @JavascriptInterface public void setPushPair(String partner,long epoch){if(unlocked)PushRegistration.pair(MainActivity.this,partner,epoch);}
  @JavascriptInterface public String pushStatus(){return PushRegistration.status(MainActivity.this);}
  @JavascriptInterface public void setChatVisible(boolean visible){LoveNotifications.chatVisible=visible&&foreground&&unlocked;}
  @JavascriptInterface public void notifyMessage(String id,boolean nudge){if(getPreferences(0).getBoolean("alerts",false))LoveNotifications.message(MainActivity.this,id,nudge);}
  @JavascriptInterface public void notifyIncomingCall(String id,boolean video){if(getPreferences(0).getBoolean("alerts",false))LoveNotifications.incoming(MainActivity.this,id,video,System.currentTimeMillis());}
  @JavascriptInterface public void clearIncomingCall(String id){LoveNotifications.clearCall(MainActivity.this,id);}
  @JavascriptInterface public String consumeCallAction(){return unlocked?LoveNotifications.consumeAction(MainActivity.this):"";}
  @JavascriptInterface public void notifyLove(){if(getPreferences(0).getBoolean("alerts",false))LoveAlerts.alert(MainActivity.this);}
  @JavascriptInterface public void saveAttachment(String name,String type,String data){if(data==null||data.length()>6000000)return;try{pendingSave=android.util.Base64.decode(data,android.util.Base64.DEFAULT);}catch(Exception e){return;}runOnUiThread(()->{picking=true;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(type==null?"application/octet-stream":type);i.putExtra(Intent.EXTRA_TITLE,name==null?"attachment":name.replaceAll("[/\\\\]","_"));try{startActivityForResult(i,11);}catch(Exception e){pendingSave=null;picking=false;}});}
  @JavascriptInterface public void kiss(){android.os.Vibrator v=(android.os.Vibrator)getSystemService(VIBRATOR_SERVICE);if(v!=null)v.vibrate(android.os.VibrationEffect.createWaveform(new long[]{0,40,70,40},-1));}
  @JavascriptInterface public void hug(){android.os.Vibrator v=(android.os.Vibrator)getSystemService(VIBRATOR_SERVICE);if(v!=null)v.vibrate(android.os.VibrationEffect.createWaveform(new long[]{0,80,100,180,120,80},-1));}
 }
 @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] result){super.onRequestPermissionsResult(request,permissions,result);if(request==13){if(result.length>0&&result[0]==android.content.pm.PackageManager.PERMISSION_GRANTED)launchCamera();else{picking=false;if(upload!=null){upload.onReceiveValue(null);upload=null;}}return;}if(request==10){PermissionRequest pending=mediaPermission;mediaPermission=null;if(pending==null)return;boolean allowed=unlocked;for(String resource:pending.getResources()){String permission=PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)?"android.permission.RECORD_AUDIO":"android.permission.CAMERA";allowed=allowed&&checkSelfPermission(permission)==android.content.pm.PackageManager.PERMISSION_GRANTED;}if(allowed)pending.grant(pending.getResources());else pending.deny();return;}if(request==9&&result.length>0&&result[0]==android.content.pm.PackageManager.PERMISSION_GRANTED)startAlerts();}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==15){picking=false;String id=pendingShareId,callId=pendingShareCall;pendingShareId=pendingShareCall=null;if(result!=RESULT_OK||data==null||id==null||!ScreenShareService.state.owns(id)||!ScreenShareService.state.snapshot()[1].equals("starting")||!CallService.state.isActive()||!CallService.state.owns(callId)){if(id!=null)ScreenShareService.state.finish(id,"permission-denied",true);return;}ScreenShareService.sink=new ScreenShareService.Sink(){public void frame(String shareId,String jpeg,int width,int height){if(web==null||framePending||jpeg.length()>1500000)return;framePending=true;web.post(()->{try{if(web==null){framePending=false;return;}String detail=new org.json.JSONObject().put("id",shareId).put("data",jpeg).put("width",width).put("height",height).toString();web.evaluateJavascript("window.dispatchEvent(new CustomEvent('onlyyours:screen-frame',{detail:"+detail+"}))",v->framePending=false);}catch(Exception e){framePending=false;}});}public void ended(String shareId){if(web!=null)web.evaluateJavascript("window.dispatchEvent(new CustomEvent('onlyyours:screen-ended',{detail:"+org.json.JSONObject.quote(shareId)+"}))",null);}};try{startForegroundService(new Intent(this,ScreenShareService.class).putExtra("shareId",id).putExtra("result",result).putExtra("data",data));}catch(Exception e){ScreenShareService.state.finish(id,"capture-unavailable",true);}if(!unlocked)authenticate();return;}if(request==14){picking=false;pendingFiles=result==RESULT_OK&&cameraFile!=null&&cameraFile.length()>0?new Uri[]{cameraUri}:null;if(cameraUri!=null)revokeUriPermission(cameraUri,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);if(pendingFiles==null&&cameraFile!=null)cameraFile.delete();cameraUri=null;cameraFile=null;if(unlocked)deliverFiles();else authenticate();return;}if(request==11){picking=false;byte[] bytes=pendingSave;pendingSave=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&bytes!=null){new Thread(()->{try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(bytes);}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"Could not save attachment",Toast.LENGTH_SHORT).show());}}).start();}return;}if(request==7){pendingFiles=WebChromeClient.FileChooserParams.parseResult(result,data);picking=false;if(unlocked)deliverFiles();else authenticate();}}
 private void deliverFiles(){if(upload!=null){upload.onReceiveValue(pendingFiles);upload=null;pendingFiles=null;}}
 @Override protected void onStop(){super.onStop();LoveNotifications.chatVisible=false;foreground=false;if(picking){unlocked=false;unlockedSavedLogin="";cover.setVisibility(View.VISIBLE);return;}unlocked=false;unlockedSavedLogin="";if(CallService.state.isActive()){cover.setVisibility(View.VISIBLE);return;}if(web!=null){web.evaluateJavascript("window.dispatchEvent(new Event('onlyyours:native-lock'))",null);web.setVisibility(View.INVISIBLE);}cover.setVisibility(View.VISIBLE);}
 @Override protected void onDestroy(){String[] shareState=ScreenShareService.state.snapshot();ScreenShareService.state.finish(shareState[0],"activity-destroyed",false);ScreenShareService.sink=null;stopService(new Intent(this,ScreenShareService.class));String[] callState=CallService.state.snapshot();CallService.state.finish(callState[0],"activity-destroyed",false);CallService.ended=null;stopService(new Intent(this,CallService.class));if(signal!=null)signal.cancel();if(web!=null)web.destroy();super.onDestroy();}
}
