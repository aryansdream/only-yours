/** Encrypted vault envelopes only; this module never accepts plaintext private keys. */
export function validateTransfer(input){
 if(!input||input.version!==1)throw Error('Unsupported device backup');
 if(input.empty===true)return {version:1,empty:true};
 const {metadata,box}=input;
 if(!metadata||!/^[a-zA-Z0-9_-]{3,32}$/.test(metadata.id)||typeof metadata.salt!=='string'||!/^[A-Za-z0-9+/]{22}==$/.test(metadata.salt))throw Error('Invalid device identity');
 if(!box||typeof box.iv!=='string'||!/^[A-Za-z0-9+/]{16}$/.test(box.iv)||typeof box.data!=='string'||box.data.length<24||box.data.length>64000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(box.data))throw Error('Invalid encrypted vault');
 return {version:1,metadata:{id:metadata.id,salt:metadata.salt},box:{iv:box.iv,data:box.data},theme:['light','dark'].includes(input.theme)?input.theme:null};
}
export function importDecision(existing,incoming){if(incoming.empty)return 'empty';if(!existing)return 'import';if(existing.id===incoming.metadata.id&&existing.salt===incoming.metadata.salt)return 'keep-current';throw Error('This device already has another account. Its history was not overwritten.')}
