package love.onlyyours;
import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import org.json.JSONObject;
/** Temporary app-private ciphertext handoff between old and new WebView origins. */
final class VaultMigration {
 private final AtomicFile file;
 VaultMigration(Context context){file=new AtomicFile(new File(context.getFilesDir(),"encrypted-vault-migration.json"));}
 synchronized boolean stage(String payload){FileOutputStream out=null;try{
  if(payload==null||payload.length()>65000000)return false;JSONObject p=new JSONObject(payload);if(p.getInt("version")!=1)return false;
  if(!p.optBoolean("empty")){JSONObject m=p.getJSONObject("metadata"),b=p.getJSONObject("box");if(!m.getString("id").matches("[a-zA-Z0-9_-]{3,32}")||!m.has("salt")||!b.has("iv")||!b.has("data"))return false;}
  out=file.startWrite();out.write(payload.getBytes("UTF-8"));file.finishWrite(out);return true;
 }catch(Exception e){if(out!=null)file.failWrite(out);return false;}}
 synchronized String read(){try{return new String(file.readFully(),"UTF-8");}catch(Exception e){return "";}}
 synchronized void complete(){file.delete();}
}
