package love.onlyyours;

/** Session fencing independent of Android, also exercised by the JVM regression test. */
public final class CallSessionState {
 private String id="",phase="idle",reason="";
 public synchronized boolean begin(String next){if(next==null||!next.matches("[a-zA-Z0-9_-]{1,80}"))return false;if((phase.equals("active")||phase.equals("starting"))&&!id.equals(next))return false;id=next;phase="starting";reason="";return true;}
 public synchronized boolean activate(String current){if(!id.equals(current)||!phase.equals("starting"))return false;phase="active";return true;}
 public synchronized boolean finish(String current,String why,boolean failed){if(!id.equals(current)||(!phase.equals("active")&&!phase.equals("starting")))return false;phase=failed?"failed":"ended";reason=why;return true;}
 public synchronized boolean isActive(){return phase.equals("active");}
 public synchronized boolean owns(String current){return id.equals(current);}
 public synchronized String[] snapshot(){return new String[]{id,phase,reason};}
}
