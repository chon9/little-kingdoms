import {cp,mkdir,writeFile,readFile,rename,access} from 'node:fs/promises';
import path from 'node:path';
const {version}=JSON.parse(await readFile('clients/package.json','utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Client version must be a release version.');
const destination=path.resolve(`clients/releases/LittleKingdoms-${version}-win32-x64`);
try{await access(destination);throw new Error('This release directory already exists. Use a new version to preserve it.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(destination,{recursive:true});
await cp('clients/node_modules/electron/dist',destination,{recursive:true});
await rename(path.join(destination,'electron.exe'),path.join(destination,'LittleKingdoms.exe'));
const app=path.join(destination,'resources/app');await mkdir(app,{recursive:true});
await cp('clients/www',path.join(app,'www'),{recursive:true});await cp('clients/desktop',path.join(app,'desktop'),{recursive:true});
await writeFile(path.join(app,'package.json'),JSON.stringify({name:'little-kingdoms',version,main:'desktop/main.cjs'}));
await writeFile(path.join(destination,'START-HERE.txt'),'Run LittleKingdoms.exe. Keep all files in this folder together.\r\nBots and pass-and-play work offline. Online duels connect to the hosted game server.\r\nThis development release is unsigned; it has not been submitted to an app store.\r\n');
console.log('Packaged Windows client: '+destination);
