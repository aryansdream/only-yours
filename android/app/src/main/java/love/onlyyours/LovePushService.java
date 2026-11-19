package love.onlyyours;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
public final class LovePushService extends FirebaseMessagingService {
 @Override public void onNewToken(String token){PushRegistration.token(this,token);}
 @Override public void onMessageReceived(RemoteMessage message){java.util.Map<String,String> d=message.getData();String id=d.get("id"),kind=d.get("kind");if(id==null||!id.matches("[a-zA-Z0-9_-]{1,80}")||!("nudge".equals(kind)||"message".equals(kind)||"call".equals(kind)))return;long at;try{at=Long.parseLong(d.get("at"));}catch(Exception e){return;}long now=System.currentTimeMillis();if(at>now+60000||at<now-("call".equals(kind)?60000:300000))return;if(!PushRegistration.verify(this,d))return;if("call".equals(kind)){if("ended".equals(d.get("phase")))LoveNotifications.clearCall(this,id);else if("ringing".equals(d.get("phase")))LoveNotifications.incoming(this,id,"true".equals(d.get("video")),at);}else LoveNotifications.message(this,id,"nudge".equals(kind));}
}
