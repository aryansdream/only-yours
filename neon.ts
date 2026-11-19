// Deployment uses the existing isolated branch and onlyyours database.
// Never put passwords or database URLs into frontend files.
import { defineConfig } from '@neon/config/v1';
export default defineConfig({functions:{onlyyours:{name:'Only Yours encrypted relay',source:'index.mjs'}},triggers:{'only-yours-expiry-cleanup':{type:'schedule',function:'onlyyours',cron:'*/5 * * * *',functionPath:'/internal/cleanup'}});
