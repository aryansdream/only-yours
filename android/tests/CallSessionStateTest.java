package love.onlyyours;
public class CallSessionStateTest {
 private static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 public static void main(String[] args){
  CallSessionState s=new CallSessionState();
  check(!s.begin("bad id"),"Invalid call IDs must not start a service");
  check(s.begin("first"),"Start first call");check(s.activate("first"),"First call active");
  check(!s.begin("second"),"A second call cannot replace an active service");
  check(s.finish("first","released",false),"Release first call");
  check(s.begin("second"),"Start second call");check(s.activate("second"),"Second call active");
  check(!s.finish("first","notification",false),"Stale notification cannot end second call");
  check(!s.activate("first"),"Stale service cannot become active");check(s.isActive(),"Second call stays active");
  check(s.finish("second","permissions",true),"Report explicit failure");check(!s.isActive(),"Failed service not active");
  check(!s.activate("second"),"Delayed start cannot resurrect a failed service");
  check(s.snapshot()[1].equals("failed")&&s.snapshot()[2].equals("permissions"),"Preserve accurate diagnostics");
  check(s.begin("third")&&s.activate("third"),"Call can retry after failure");
  check(s.finish("third","notification",false),"Current notification ends its call");
  System.out.println("Native call session regression checks passed");
 }
}
