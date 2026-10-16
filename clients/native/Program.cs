using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// A small Windows host. Game files stay local; the OS-shared Evergreen runtime
// supplies the renderer. The bridge exposes display controls and a bounded
// Steam test transport, only to this exact bundled origin.
internal sealed class GameWindow : Form {
    readonly WebView2 view = new WebView2();
    readonly bool qa = Environment.GetEnvironmentVariable("KINGDOMS_QA") == "1";
    readonly string data;
    bool fullscreen;
    Rectangle windowedBounds;
    FormWindowState windowedState;
    SteamBridge steam;
    const string Origin = "https://kingdoms.local";
    protected override bool ShowWithoutActivation { get { return qa; } }

    public GameWindow() {
        Text="Little Kingdoms · Shu & Wei";
        BackColor=Color.FromArgb(20,44,41);
        var work=Screen.PrimaryScreen.WorkingArea;
        ClientSize=new Size(Math.Min(1280,work.Width-80),Math.Min(800,work.Height-80)); MinimumSize=new Size(720,540);
        StartPosition=FormStartPosition.CenterScreen;
        data=qa ? (Environment.GetEnvironmentVariable("KINGDOMS_QA_PROFILE")??Path.Combine(Path.GetTempPath(),"LittleKingdoms-QA")) : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LittleKingdoms");
        Directory.CreateDirectory(data);
        var icon=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"LittleKingdoms.ico");
        if(File.Exists(icon))Icon=new Icon(icon);
        if(qa){Opacity=0;ShowInTaskbar=false;}
        Controls.Add(view); view.Dock=DockStyle.Fill;view.DefaultBackgroundColor=BackColor;
        Shown+=async(sender,args)=>{await Initialize();};
        FormClosing+=delegate {if(!qa)File.WriteAllText(Path.Combine(data,"display.txt"),fullscreen?"fullscreen":"windowed");};
        FormClosed+=delegate {if(steam!=null)steam.Dispose();};
    }
    async Task Initialize() {
        try {
            var options=new CoreWebView2EnvironmentOptions();
            if(qa)options.AdditionalBrowserArguments="--remote-debugging-port=9334 --disable-background-timer-throttling --disable-renderer-backgrounding";
            var environment=await CoreWebView2Environment.CreateAsync(null,Path.Combine(data,"WebView2"),options);
            await view.EnsureCoreWebView2Async(environment);
            var core=view.CoreWebView2;
            steam=new SteamBridge(payload=>{if(!IsDisposed)core.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(new {steamEvent=payload}));});
            core.SetVirtualHostNameToFolderMapping("kingdoms.local",Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"www"),CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.AreDefaultContextMenusEnabled=false;
            core.Settings.AreDevToolsEnabled=qa;
            core.Settings.AreBrowserAcceleratorKeysEnabled=false;
            core.Settings.IsStatusBarEnabled=false;
            core.Settings.IsZoomControlEnabled=false;
            core.Settings.IsGeneralAutofillEnabled=false;
            core.Settings.IsPasswordAutosaveEnabled=false;
            core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){Uri u;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out u)||u.GetLeftPart(UriPartial.Authority)!=Origin)e.Cancel=true;};
            core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
            core.DownloadStarting+=delegate(object sender,CoreWebView2DownloadStartingEventArgs e){e.Cancel=true;};
            core.PermissionRequested+=delegate(object sender,CoreWebView2PermissionRequestedEventArgs e){e.State=CoreWebView2PermissionState.Deny;};
            core.WebMessageReceived+=delegate(object sender,CoreWebView2WebMessageReceivedEventArgs e){
                Uri source;if(!Uri.TryCreate(e.Source,UriKind.Absolute,out source)||source.GetLeftPart(UriPartial.Authority)!=Origin)return;
                try {
                    var serializer=new JavaScriptSerializer();
                    if(e.WebMessageAsJson.Length>30000)return;
                    var message=serializer.Deserialize<System.Collections.Generic.Dictionary<string,object>>(e.WebMessageAsJson);
                    if(message==null)return;
                    var command=message.ContainsKey("command")?message["command"] as string:null;
                    var id=message.ContainsKey("id")?Convert.ToInt32(message["id"]):0;
                    if(command!=null&&command.StartsWith("steam",StringComparison.Ordinal)){
                        try{core.PostWebMessageAsJson(serializer.Serialize(new {id=id,result=steam.Handle(command,message)}));}
                        catch(Exception error){core.PostWebMessageAsJson(serializer.Serialize(new {id=id,result=new {ok=false,error=error is DllNotFoundException||error is BadImageFormatException?"Steam runtime is missing. Extract the complete Windows test ZIP.":error.Message}}));}
                        return;
                    }
                    if(command=="toggleFullscreen")SetFullscreen(!fullscreen);
                    else if(command=="exitFullscreen")SetFullscreen(false);
                    else if(command!="getDisplay")return;
                    core.PostWebMessageAsJson(serializer.Serialize(new{id=id,fullscreen=fullscreen,width=Bounds.Width,height=Bounds.Height,borderless=FormBorderStyle==FormBorderStyle.None}));
                }catch(ArgumentException){}catch(InvalidOperationException){}catch(FormatException){}catch(OverflowException){}catch(InvalidCastException){}
            };
            await core.AddScriptToExecuteOnDocumentCreatedAsync(@"
                (()=>{if(location.origin!=='https://kingdoms.local')return;
                  let id=0;const pending=new Map(),listeners=new Set();
                  chrome.webview.addEventListener('message',event=>{const response=event.data;if(response.steamEvent){for(const listener of listeners)try{listener(response.steamEvent);}catch{}return;}const entry=pending.get(response.id);if(entry){clearTimeout(entry.timer);pending.delete(response.id);entry.resolve(response.result||response);}});
                  const call=(command,args={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,timer:setTimeout(()=>{pending.delete(key);reject(new Error('Native control timed out'));},5000)});chrome.webview.postMessage({...args,command,id:key});});
                  Object.defineProperty(window,'kingdomsDesktop',{value:Object.freeze({platform:'windows-webview2',toggleFullscreen:()=>call('toggleFullscreen'),exitFullscreen:()=>call('exitFullscreen'),getDisplay:()=>call('getDisplay')})});
                  Object.defineProperty(window,'kingdomsSteam',{value:Object.freeze({init:()=>call('steamInit'),status:()=>call('steamStatus'),create:()=>call('steamCreate'),join:lobby=>call('steamJoin',{lobby}),leave:()=>call('steamLeave'),send:(peer,payload)=>call('steamSend',{peer,payload}),friends:()=>call('steamFriends'),invite:friend=>call('steamInvite',{friend}),on:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}})});
                  document.addEventListener('keydown',event=>{if(event.key==='F11'||event.key==='Enter'&&event.altKey){event.preventDefault();if(!event.repeat)call('toggleFullscreen').catch(()=>{});}else if(event.key==='Escape'&&!document.querySelector('dialog[open]'))call('exitFullscreen').catch(()=>{});});
                })();
            ");
            bool startFullscreen=!qa;
            var settings=Path.Combine(data,"display.txt");if(!qa&&File.Exists(settings))startFullscreen=File.ReadAllText(settings)=="fullscreen";
            if(startFullscreen)SetFullscreen(true);
            core.Navigate(Origin+"/index.html");
        }catch(Exception error){
            if(qa)File.WriteAllText(Path.Combine(data,"startup-error.txt"),error.ToString());
            else MessageBox.Show("Little Kingdoms needs the Microsoft Edge WebView2 Evergreen Runtime.\nDownload it from https://developer.microsoft.com/microsoft-edge/webview2/\n\n"+error.Message,"Little Kingdoms",MessageBoxButtons.OK,MessageBoxIcon.Information);
            Close();
        }
    }
    void SetFullscreen(bool enabled) {
        if(fullscreen==enabled)return;
        if(enabled){windowedBounds=Bounds;windowedState=WindowState;WindowState=FormWindowState.Normal;FormBorderStyle=FormBorderStyle.None;Bounds=Screen.FromControl(this).Bounds;}
        else{FormBorderStyle=FormBorderStyle.Sizable;Bounds=windowedBounds;WindowState=windowedState;}
        fullscreen=enabled;
    }
    [DllImport("user32.dll")]static extern bool SetProcessDPIAware();
    [STAThread] static void Main(){Directory.SetCurrentDirectory(AppDomain.CurrentDomain.BaseDirectory);SetProcessDPIAware();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new GameWindow());}
}
