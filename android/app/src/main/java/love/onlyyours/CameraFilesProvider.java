package love.onlyyours;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Camera writes only temporary app-private capture files granted for that intent. */
public class CameraFilesProvider extends ContentProvider {
 @Override public boolean onCreate(){return true;}
 private File file(Uri uri)throws FileNotFoundException{if(!"love.onlyyours.camera".equals(uri.getAuthority())||uri.getPathSegments().size()!=2||!"image".equals(uri.getPathSegments().get(0)))throw new FileNotFoundException();String name=uri.getLastPathSegment();if(name==null||!name.matches("photo-[0-9a-f-]{36}\\.jpg"))throw new FileNotFoundException();return new File(new File(getContext().getCacheDir(),"camera"),name);}
 @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{return ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.parseMode(mode));}
 @Override public String getType(Uri uri){try{file(uri);return "image/jpeg";}catch(Exception e){return null;}}
 @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){try{File f=file(uri);String[] cols=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;MatrixCursor c=new MatrixCursor(cols);Object[] row=new Object[cols.length];for(int i=0;i<cols.length;i++)row[i]=OpenableColumns.DISPLAY_NAME.equals(cols[i])?f.getName():OpenableColumns.SIZE.equals(cols[i])?f.length():null;c.addRow(row);return c;}catch(Exception e){return null;}}
 @Override public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
 @Override public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
 @Override public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}
