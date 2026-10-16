using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Steamworks;

// Steam is optional. All calls and callbacks stay on the WinForms UI thread.
// Only our two-member lobby may exchange bounded, reliable game messages.
internal sealed class SteamBridge : IDisposable {
    const string Game = "little-kingdoms-steam-test";
    const string Protocol = "1";
    const int Channel = 27109, MaxBytes = 24576;
    readonly Action<object> emit;
    readonly Timer timer = new Timer { Interval = 25 };
    bool initialized, busy, locked;
    int generation;
    DateTime operationStarted;
    CSteamID lobby, originalHost, peer;
    Callback<LobbyChatUpdate_t> membership;
    Callback<LobbyDataUpdate_t> dataUpdate;
    Callback<SteamNetworkingMessagesSessionRequest_t> sessionRequest;
    Callback<SteamNetworkingMessagesSessionFailed_t> sessionFailed;
    Callback<GameLobbyJoinRequested_t> inviteRequested;
    CallResult<LobbyCreated_t> created;
    CallResult<LobbyEnter_t> entered;

    internal SteamBridge(Action<object> send) { emit=send; timer.Tick+=delegate { Pump(); }; }
    internal object Handle(string command, Dictionary<string,object> args) {
        if(command=="steamInit")return Initialize();
        if(!initialized)throw new InvalidOperationException("Start Steam, sign in, then press Connect Steam.");
        if(command=="steamStatus")return Status();
        if(command=="steamCreate") {
            BeginOperation(); int request=generation;
            created=CallResult<LobbyCreated_t>.Create(delegate(LobbyCreated_t result,bool failed) {
                if(request!=generation){if(!failed&&result.m_eResult==EResult.k_EResultOK)SteamMatchmaking.LeaveLobby(new CSteamID(result.m_ulSteamIDLobby));return;}
                busy=false;
                if(failed||result.m_eResult!=EResult.k_EResultOK){Error("Steam could not create the lobby. Retry shortly.");return;}
                lobby=new CSteamID(result.m_ulSteamIDLobby);originalHost=SteamUser.GetSteamID();
                if(!SteamMatchmaking.SetLobbyData(lobby,"lk_game",Game)||!SteamMatchmaking.SetLobbyData(lobby,"lk_protocol",Protocol)||!SteamMatchmaking.SetLobbyData(lobby,"lk_host",originalHost.ToString())){Leave();Error("Steam lobby setup failed. Retry shortly.");return;}
                SteamMatchmaking.SetLobbyJoinable(lobby,true);EmitLobby();
            });
            created.Set(SteamMatchmaking.CreateLobby(ELobbyType.k_ELobbyTypeFriendsOnly,2));return new {ok=true};
        }
        if(command=="steamJoin") {
            CSteamID target=ParseID(Get(args,"lobby"));if(!target.IsLobby())throw new ArgumentException("Enter the complete Steam lobby ID.");
            BeginOperation();int request=generation;
            entered=CallResult<LobbyEnter_t>.Create(delegate(LobbyEnter_t result,bool failed) {
                CSteamID joined=new CSteamID(result.m_ulSteamIDLobby);
                if(request!=generation){if(!failed)SteamMatchmaking.LeaveLobby(joined);return;}
                busy=false;
                if(failed||result.m_EChatRoomEnterResponse!=1){Error("Cannot join this Steam lobby. Check Steam friendship, its ID and open seat.");return;}
                CSteamID host;
                if(SteamMatchmaking.GetLobbyData(joined,"lk_game")!=Game||SteamMatchmaking.GetLobbyData(joined,"lk_protocol")!=Protocol||!TryID(SteamMatchmaking.GetLobbyData(joined,"lk_host"),out host)||host!=SteamMatchmaking.GetLobbyOwner(joined)||SteamMatchmaking.GetNumLobbyMembers(joined)>2){SteamMatchmaking.LeaveLobby(joined);Error("This lobby is not a compatible Little Kingdoms test room.");return;}
                lobby=joined;originalHost=host;EmitLobby();
            });
            entered.Set(SteamMatchmaking.JoinLobby(target));return new {ok=true};
        }
        if(command=="steamLeave"){Leave();return new {ok=true};}
        if(command=="steamSend") {
            CSteamID target=ParseID(Get(args,"peer"));
            if(!AllowedPeer(target))throw new InvalidOperationException("Your Steam rival is no longer in this room.");
            string payload=Get(args,"payload");byte[] bytes=Encoding.UTF8.GetBytes(payload);
            if(bytes.Length==0||bytes.Length>MaxBytes)throw new ArgumentException("Steam game message exceeds its size limit.");
            var identity=new SteamNetworkingIdentity();identity.SetSteamID(target);
            IntPtr memory=Marshal.AllocHGlobal(bytes.Length);
            try{Marshal.Copy(bytes,0,memory,bytes.Length);var result=SteamNetworkingMessages.SendMessageToUser(ref identity,memory,(uint)bytes.Length,Constants.k_nSteamNetworkingSend_ReliableNoNagle,Channel);if(result!=EResult.k_EResultOK)throw new InvalidOperationException("Steam could not send this message. Reconnecting…");}
            finally{Marshal.FreeHGlobal(memory);}return new {ok=true};
        }
        if(command=="steamFriends") {
            var friends=new List<object>();int count=SteamFriends.GetFriendCount(EFriendFlags.k_EFriendFlagImmediate);
            for(int i=0;i<count&&friends.Count<150;i++){var friend=SteamFriends.GetFriendByIndex(i,EFriendFlags.k_EFriendFlagImmediate);if(SteamFriends.GetFriendPersonaState(friend)!=EPersonaState.k_EPersonaStateOffline)friends.Add(new {id=friend.ToString(),name=CleanName(SteamFriends.GetFriendPersonaName(friend))});}
            return new {ok=true,friends=friends};
        }
        if(command=="steamInvite") {
            if(lobby==CSteamID.Nil)throw new InvalidOperationException("Create a Steam lobby first.");
            var friend=ParseID(Get(args,"friend"));if(!SteamFriends.HasFriend(friend,EFriendFlags.k_EFriendFlagImmediate))throw new ArgumentException("Choose a Steam friend from the list.");
            if(!SteamMatchmaking.InviteUserToLobby(lobby,friend))throw new InvalidOperationException("Steam could not send the invitation.");return new {ok=true};
        }
        throw new ArgumentException("Unknown Steam operation.");
    }
    object Initialize() {
        if(initialized)return Status();
        // AppID 480 is deliberately restricted to this development package.
        string error;
        if(SteamAPI.InitEx(out error)!=ESteamAPIInitResult.k_ESteamAPIInitResult_OK)return new {ok=false,error="Start Steam and sign in, then retry. This test build uses Spacewar (AppID 480)."};
        if(SteamUtils.GetAppID().m_AppId!=480){SteamAPI.Shutdown();return new {ok=false,error="This test build requires Spacewar AppID 480."};}
        initialized=true;SteamNetworkingUtils.InitRelayNetworkAccess();
        membership=Callback<LobbyChatUpdate_t>.Create(delegate(LobbyChatUpdate_t update){if(update.m_ulSteamIDLobby==lobby.m_SteamID)EmitLobby();});
        dataUpdate=Callback<LobbyDataUpdate_t>.Create(delegate(LobbyDataUpdate_t update){if(update.m_ulSteamIDLobby==lobby.m_SteamID)EmitLobby();});
        sessionRequest=Callback<SteamNetworkingMessagesSessionRequest_t>.Create(delegate(SteamNetworkingMessagesSessionRequest_t request){var identity=request.m_identityRemote;if(AllowedPeer(identity.GetSteamID()))SteamNetworkingMessages.AcceptSessionWithUser(ref identity);else SteamNetworkingMessages.CloseSessionWithUser(ref identity);});
        sessionFailed=Callback<SteamNetworkingMessagesSessionFailed_t>.Create(delegate(SteamNetworkingMessagesSessionFailed_t failure){if(AllowedPeer(failure.m_info.m_identityRemote.GetSteamID()))emit(new {type="connection",connected=false});});
        inviteRequested=Callback<GameLobbyJoinRequested_t>.Create(delegate(GameLobbyJoinRequested_t invite){emit(new {type="invite",lobby=invite.m_steamIDLobby.ToString()});});
        timer.Start();return Status();
    }
    object Status(){return new {ok=true,initialized=initialized,id=SteamUser.GetSteamID().ToString(),name=CleanName(SteamFriends.GetPersonaName()),appId=480};}
    void BeginOperation(){if(busy||lobby!=CSteamID.Nil)throw new InvalidOperationException("Leave your current Steam room before opening another.");busy=true;operationStarted=DateTime.UtcNow;generation++;}
    bool AllowedPeer(CSteamID target){if(lobby==CSteamID.Nil||target==SteamUser.GetSteamID()||target==CSteamID.Nil||SteamMatchmaking.GetNumLobbyMembers(lobby)!=2)return false;if(SteamMatchmaking.GetLobbyOwner(lobby)!=originalHost)return false;for(int i=0;i<2;i++)if(SteamMatchmaking.GetLobbyMemberByIndex(lobby,i)==target)return true;return false;}
    void EmitLobby(){
        if(lobby==CSteamID.Nil)return;
        var members=new List<object>();CSteamID next=CSteamID.Nil;
        int count=SteamMatchmaking.GetNumLobbyMembers(lobby);
        for(int i=0;i<count&&i<2;i++){var member=SteamMatchmaking.GetLobbyMemberByIndex(lobby,i);members.Add(new {id=member.ToString(),name=CleanName(SteamFriends.GetFriendPersonaName(member))});if(member!=SteamUser.GetSteamID())next=member;}
        if(peer!=CSteamID.Nil&&peer!=next){var old=new SteamNetworkingIdentity();old.SetSteamID(peer);SteamNetworkingMessages.CloseSessionWithUser(ref old);}peer=next;
        bool hostPresent=SteamMatchmaking.GetLobbyOwner(lobby)==originalHost;
        if(!locked&&SteamUser.GetSteamID()==originalHost&&count==2){locked=true;SteamMatchmaking.SetLobbyJoinable(lobby,false);}
        emit(new {type="lobby",lobby=lobby.ToString(),host=originalHost.ToString(),hostPresent=hostPresent,members=members});
    }
    void Pump(){
        if(!initialized)return;
        try{
            SteamAPI.RunCallbacks();
            if(busy&&(DateTime.UtcNow-operationStarted).TotalSeconds>25){generation++;busy=false;Error("Steam lobby request timed out. Retry shortly.");}
            var pointers=new IntPtr[16];int count=SteamNetworkingMessages.ReceiveMessagesOnChannel(Channel,pointers,pointers.Length);
            for(int i=0;i<count;i++){
                try{var message=SteamNetworkingMessage_t.FromIntPtr(pointers[i]);var from=message.m_identityPeer.GetSteamID();if(message.m_cbSize<=0||message.m_cbSize>MaxBytes||!AllowedPeer(from))continue;byte[] bytes=new byte[message.m_cbSize];Marshal.Copy(message.m_pData,bytes,0,bytes.Length);emit(new {type="packet",from=from.ToString(),payload=new UTF8Encoding(false,true).GetString(bytes)});}
                catch(DecoderFallbackException){}
                finally{SteamNetworkingMessage_t.Release(pointers[i]);}
            }
        }catch(Exception){Error("Steam connection interrupted. Check that Steam is running.");}
    }
    void Error(string message){emit(new {type="error",error=message});}
    void Leave(){generation++;busy=false;locked=false;if(lobby!=CSteamID.Nil){if(SteamUser.GetSteamID()==originalHost)SteamMatchmaking.SetLobbyJoinable(lobby,false);SteamMatchmaking.LeaveLobby(lobby);}if(peer!=CSteamID.Nil){var identity=new SteamNetworkingIdentity();identity.SetSteamID(peer);SteamNetworkingMessages.CloseSessionWithUser(ref identity);}lobby=CSteamID.Nil;peer=CSteamID.Nil;originalHost=CSteamID.Nil;}
    static string Get(Dictionary<string,object> args,string name){object value;return args.TryGetValue(name,out value)?value as string??"":"";}
    static bool TryID(string text,out CSteamID id){ulong value;if(text!=null&&text.Length>=17&&text.Length<=20&&System.Text.RegularExpressions.Regex.IsMatch(text,"^[0-9]+$")&&UInt64.TryParse(text,out value)){id=new CSteamID(value);return id.IsValid();}id=CSteamID.Nil;return false;}
    static CSteamID ParseID(string text){CSteamID id;if(!TryID(text,out id))throw new ArgumentException("Enter the complete numeric Steam ID.");return id;}
    static string CleanName(string name){if(String.IsNullOrWhiteSpace(name))return "Steam commander";var builder=new StringBuilder();foreach(char c in name){if(!Char.IsControl(c))builder.Append(c);if(builder.Length>=40)break;}return builder.ToString();}
    public void Dispose(){timer.Stop();if(initialized){Leave();if(membership!=null)membership.Dispose();if(dataUpdate!=null)dataUpdate.Dispose();if(sessionRequest!=null)sessionRequest.Dispose();if(sessionFailed!=null)sessionFailed.Dispose();if(inviteRequested!=null)inviteRequested.Dispose();if(created!=null)created.Dispose();if(entered!=null)entered.Dispose();SteamAPI.Shutdown();initialized=false;}timer.Dispose();}
}
