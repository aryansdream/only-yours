package love.onlyyours;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Device-only credential wrapping. The wrapping key requires recent strong system authentication. */
final class DeviceLogin {
 private static final String ALIAS="only_yours_saved_login_v1";
 private final android.content.SharedPreferences prefs;
 private String status="missing";
 DeviceLogin(Context c){prefs=c.getSharedPreferences("device-login",Context.MODE_PRIVATE);}
 private SecretKey key(boolean create)throws Exception{
  KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
  if(ks.containsAlias(ALIAS))return (SecretKey)ks.getKey(ALIAS,null);
  if(!create)throw new IllegalStateException("Saved login key missing");
  KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
  g.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
   .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
   .setUserAuthenticationRequired(true)
   .setUserAuthenticationParameters(300,KeyProperties.AUTH_DEVICE_CREDENTIAL|KeyProperties.AUTH_BIOMETRIC_STRONG)
   .build());return g.generateKey();
 }
 synchronized void prepare(){try{key(true);}catch(Exception e){status="key_unavailable";}}
 synchronized void replaceInvalidatedKey(){try{KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);k.deleteEntry(ALIAS);key(true);}catch(Exception e){status=failure(e);}}
 synchronized String status(){return status;}
 private String failure(Exception e){for(Throwable t=e;t!=null;t=t.getCause()){if(t instanceof android.security.keystore.UserNotAuthenticatedException)return "auth_required";if(t instanceof android.security.keystore.KeyPermanentlyInvalidatedException)return "key_invalid";}return "unavailable";}
 synchronized boolean save(String payload){try{
  JSONObject input=new JSONObject(payload);String id=input.getString("id"),token=input.getString("token"),raw=input.getString("key"),salt=input.getString("salt");
  if(!id.matches("[a-zA-Z0-9_-]{3,32}")||!token.matches("[a-f0-9]{48}")||Base64.decode(raw,Base64.DEFAULT).length!=32||Base64.decode(salt,Base64.DEFAULT).length!=16)return false;
  JSONObject clean=new JSONObject();clean.put("id",id);clean.put("token",token);clean.put("key",raw);clean.put("salt",salt);
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key(true));
  byte[] ciphertext=c.doFinal(clean.toString().getBytes("UTF-8"));
  boolean committed=prefs.edit().putString("iv",Base64.encodeToString(c.getIV(),Base64.NO_WRAP)).putString("box",Base64.encodeToString(ciphertext,Base64.NO_WRAP)).commit();status=committed?"ok":"unavailable";return committed;
 }catch(Exception e){status=failure(e);return false;}}
 synchronized String restore(){try{
  String iv=prefs.getString("iv",null),box=prefs.getString("box",null);if(iv==null||box==null){status="missing";return "";}
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,Base64.decode(iv,Base64.DEFAULT)));
  String restored=new String(c.doFinal(Base64.decode(box,Base64.DEFAULT)),"UTF-8");status="ok";return restored;
 }catch(Exception e){status=failure(e);return "";}}
 synchronized boolean exists(){return prefs.contains("box");}
 synchronized void forget(){status="missing";prefs.edit().clear().commit();try{KeyStore k=KeyStore.getInstance("AndroidKeyStore");k.load(null);k.deleteEntry(ALIAS);}catch(Exception ignored){}}
}
