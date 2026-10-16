const {app,BrowserWindow,protocol,net,ipcMain}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
app.whenReady().then(()=>{
  ipcMain.handle('kingdoms:display',(event,command)=>{
    const frame=event.senderFrame,url=frame&&new URL(frame.url);
    if(!url||url.protocol!=='app:'||url.hostname!=='kingdoms')throw new Error('Untrusted display request');
    const win=BrowserWindow.fromWebContents(event.sender);if(!win)throw new Error('No game window');
    if(command==='toggle')win.setFullScreen(!win.isFullScreen());else if(command==='exit')win.setFullScreen(false);else if(command!=='read')throw new Error('Unknown display command');
    return{fullscreen:win.isFullScreen(),width:win.getBounds().width,height:win.getBounds().height};
  });
  const root=path.resolve(__dirname,'../www');
  protocol.handle('app',request=>{
    const url=new URL(request.url);
    if(url.host!=='kingdoms')return new Response('Not found',{status:404});
    let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}
    const file=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
    if(!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
    return net.fetch(pathToFileURL(file).toString());
  });
  function createWindow(){
    const win=new BrowserWindow({title:'Little Kingdoms · Shu & Wei',icon:path.join(root,'assets/icon-512.png'),width:1280,height:800,minWidth:720,minHeight:540,show:process.env.KINGDOMS_QA!=='1',backgroundColor:'#142c29',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:process.env.KINGDOMS_QA!=='1'}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{const destination=new URL(url);if(destination.protocol!=='app:'||destination.hostname!=='kingdoms')event.preventDefault();});
    win.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(contents.getURL().startsWith('app://kingdoms/')&&permission==='fullscreen'));
    win.webContents.on('before-input-event',(event,input)=>{if(input.type!=='keyDown')return;if(input.key==='F11'||input.key==='Enter'&&input.alt){event.preventDefault();win.setFullScreen(!win.isFullScreen());}else if(input.key==='Escape'&&win.isFullScreen())win.setFullScreen(false);});
    win.loadURL('app://kingdoms/');
  }
  createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
