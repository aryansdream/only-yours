/** A network interruption must not invalidate a successfully decrypted local vault. */
export async function resumeDeviceSession({unlockLocal,openLocal,connect,renew,expired,offline}){
 await unlockLocal();
 await openLocal();
 try{await connect()}catch(error){if(error?.status===401){await expired(error);return 'expired'}await offline(error);return 'offline'}
 try{await renew()}catch{/* A renewal failure is retried later; it is not a password failure. */}
 return 'online';
}
