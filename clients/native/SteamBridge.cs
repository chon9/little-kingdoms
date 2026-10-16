using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Steamworks;

// Exact-origin bridge. Only bounded messages between members of our own
// compatible 2/4-player lobby may reach SteamNetworkingMessages.
internal sealed class SteamBridge : IDisposable {
    const string Game="little-kingdoms",Protocol="2";
    const int Channel=27109,MaxBytes=24576;
    readonly Action<object> emit;
    readonly Timer timer=new Timer {Interval=25};
    readonly HashSet<ulong> peers=new HashSet<ulong>();
    bool initialized,busy,locked,quick;
    int generation,capacity=2;
    string mode="duel";
    DateTime operationStarted,nextSearch;
    CSteamID lobby,originalHost;
    Callback<LobbyChatUpdate_t> membership;
    Callback<LobbyDataUpdate_t> dataUpdate;
    Callback<SteamNetworkingMessagesSessionRequest_t> sessionRequest;
    Callback<SteamNetworkingMessagesSessionFailed_t> sessionFailed;
    Callback<GameLobbyJoinRequested_t> inviteRequested;
    CallResult<LobbyCreated_t> created;
    CallResult<LobbyEnter_t> entered;
    CallResult<LobbyMatchList_t> found;
    internal SteamBridge(Action<object> send){emit=send;timer.Tick+=delegate{Pump();};}
    internal object Handle(string command,Dictionary<string,object> args){
        if(command=="steamInit")return Initialize();
        if(!initialized)throw new InvalidOperationException("Start Steam, sign in, then press Connect Steam.");
        if(command=="steamStatus")return Status();
        if(command=="steamCreate"||command=="steamQuick"||command=="steamJoin"){
            string requested=Get(args,"mode");if(requested=="")requested="duel";if(requested!="duel"&&requested!="teams")throw new ArgumentException("Choose 1v1 or 2v2.");
            if(command=="steamQuick"&&requested!="duel")throw new ArgumentException("Quick Match finds 1v1 duels. Host a private lobby for 2v2.");
            CSteamID target=CSteamID.Nil;if(command=="steamJoin"){target=ParseID(Get(args,"lobby"));if(!target.IsLobby())throw new ArgumentException("Enter the complete Steam lobby ID.");}
            BeginOperation();mode=requested;capacity=mode=="teams"?4:2;quick=command=="steamQuick";
            if(command=="steamQuick")Search(generation);
            else if(command=="steamCreate")Create(generation);
            else Join(target,generation,false);
            return new {ok=true};
        }
        if(command=="steamLeave"){Leave();return new {ok=true};}
        if(command=="steamSend"){
            var target=ParseID(Get(args,"peer"));if(!AllowedPeer(target))throw new InvalidOperationException("Your Steam rival is no longer in this room.");
            byte[] bytes=Encoding.UTF8.GetBytes(Get(args,"payload"));if(bytes.Length==0||bytes.Length>MaxBytes)throw new ArgumentException("Steam game message exceeds its size limit.");
            var identity=new SteamNetworkingIdentity();identity.SetSteamID(target);IntPtr memory=Marshal.AllocHGlobal(bytes.Length);
            try{Marshal.Copy(bytes,0,memory,bytes.Length);var result=SteamNetworkingMessages.SendMessageToUser(ref identity,memory,(uint)bytes.Length,Constants.k_nSteamNetworkingSend_ReliableNoNagle|Constants.k_nSteamNetworkingSend_AutoRestartBrokenSession,Channel);if(result!=EResult.k_EResultOK)throw new InvalidOperationException("Steam could not send this message. Reconnecting…");}finally{Marshal.FreeHGlobal(memory);}return new {ok=true};
        }
        if(command=="steamFriends"){
            var friends=new List<object>();int count=SteamFriends.GetFriendCount(EFriendFlags.k_EFriendFlagImmediate);for(int i=0;i<count&&friends.Count<150;i++){var friend=SteamFriends.GetFriendByIndex(i,EFriendFlags.k_EFriendFlagImmediate);if(SteamFriends.GetFriendPersonaState(friend)!=EPersonaState.k_EPersonaStateOffline)friends.Add(new {id=friend.ToString(),name=CleanName(SteamFriends.GetFriendPersonaName(friend))});}return new {ok=true,friends=friends};
        }
        if(command=="steamInvite"){
            if(lobby==CSteamID.Nil)throw new InvalidOperationException("Create a Steam lobby first.");var friend=ParseID(Get(args,"friend"));if(!SteamFriends.HasFriend(friend,EFriendFlags.k_EFriendFlagImmediate))throw new ArgumentException("Choose a Steam friend from the list.");if(!SteamMatchmaking.InviteUserToLobby(lobby,friend))throw new InvalidOperationException("Steam could not send the invitation.");return new {ok=true};
        }
        throw new ArgumentException("Unknown Steam operation.");
    }
    void Create(int request){
        created=CallResult<LobbyCreated_t>.Create(delegate(LobbyCreated_t result,bool failed){
            if(request!=generation){if(!failed&&result.m_eResult==EResult.k_EResultOK)SteamMatchmaking.LeaveLobby(new CSteamID(result.m_ulSteamIDLobby));return;}
            busy=false;if(failed||result.m_eResult!=EResult.k_EResultOK){quick=false;Error("Steam could not create the lobby. Retry shortly.");return;}
            lobby=new CSteamID(result.m_ulSteamIDLobby);originalHost=SteamUser.GetSteamID();
            bool ok=SteamMatchmaking.SetLobbyData(lobby,"lk_game",Game)&&SteamMatchmaking.SetLobbyData(lobby,"lk_protocol",Protocol)&&SteamMatchmaking.SetLobbyData(lobby,"lk_host",originalHost.ToString())&&SteamMatchmaking.SetLobbyData(lobby,"lk_mode",mode)&&SteamMatchmaking.SetLobbyData(lobby,"lk_quick",quick?"1":"0")&&SteamMatchmaking.SetLobbyData(lobby,"lk_phase","waiting");
            if(!ok){Leave();Error("Steam lobby setup failed. Retry shortly.");return;}SteamMatchmaking.SetLobbyJoinable(lobby,true);nextSearch=DateTime.UtcNow.AddSeconds(2);EmitLobby();
        });created.Set(SteamMatchmaking.CreateLobby(quick?ELobbyType.k_ELobbyTypePublic:ELobbyType.k_ELobbyTypeFriendsOnly,capacity));
    }
    void Search(int request){
        busy=true;operationStarted=DateTime.UtcNow;
        SteamMatchmaking.AddRequestLobbyListStringFilter("lk_game",Game,ELobbyComparison.k_ELobbyComparisonEqual);
        SteamMatchmaking.AddRequestLobbyListStringFilter("lk_protocol",Protocol,ELobbyComparison.k_ELobbyComparisonEqual);
        SteamMatchmaking.AddRequestLobbyListStringFilter("lk_mode",mode,ELobbyComparison.k_ELobbyComparisonEqual);
        SteamMatchmaking.AddRequestLobbyListStringFilter("lk_quick","1",ELobbyComparison.k_ELobbyComparisonEqual);
        SteamMatchmaking.AddRequestLobbyListStringFilter("lk_phase","waiting",ELobbyComparison.k_ELobbyComparisonEqual);
        SteamMatchmaking.AddRequestLobbyListFilterSlotsAvailable(1);SteamMatchmaking.AddRequestLobbyListDistanceFilter(ELobbyDistanceFilter.k_ELobbyDistanceFilterWorldwide);SteamMatchmaking.AddRequestLobbyListResultCountFilter(20);
        found=CallResult<LobbyMatchList_t>.Create(delegate(LobbyMatchList_t result,bool failed){
            if(request!=generation)return;busy=false;if(locked)return;
            if(failed){if(lobby==CSteamID.Nil){quick=false;Error("Steam Quick Match search failed. Retry shortly.");}else nextSearch=DateTime.UtcNow.AddSeconds(4);return;}
            CSteamID best=CSteamID.Nil;
            for(int i=0;i<(int)result.m_nLobbiesMatching;i++){var candidate=SteamMatchmaking.GetLobbyByIndex(i);if(candidate==lobby)continue;if(lobby!=CSteamID.Nil&&candidate.m_SteamID>=lobby.m_SteamID)continue;if(best==CSteamID.Nil||candidate.m_SteamID<best.m_SteamID)best=candidate;}
            if(best!=CSteamID.Nil){
                // Concurrent queue creators converge on the lower lobby ID. A
                // room with an opponent is locked before it can migrate.
                if(lobby!=CSteamID.Nil){if(SteamMatchmaking.GetNumLobbyMembers(lobby)!=1){EmitLobby();return;}SteamMatchmaking.SetLobbyJoinable(lobby,false);SteamMatchmaking.SetLobbyData(lobby,"lk_phase","closed");SteamMatchmaking.LeaveLobby(lobby);lobby=CSteamID.Nil;emit(new {type="matchmaking",phase="searching"});}
                busy=true;operationStarted=DateTime.UtcNow;Join(best,request,true);
            }else if(lobby==CSteamID.Nil){busy=true;operationStarted=DateTime.UtcNow;Create(request);}else nextSearch=DateTime.UtcNow.AddSeconds(2);
        });found.Set(SteamMatchmaking.RequestLobbyList());
    }
    void Join(CSteamID target,int request,bool matchmaking){
        entered=CallResult<LobbyEnter_t>.Create(delegate(LobbyEnter_t result,bool failed){
            var joined=new CSteamID(result.m_ulSteamIDLobby);if(request!=generation){if(!failed)SteamMatchmaking.LeaveLobby(joined);return;}busy=false;
            if(failed||result.m_EChatRoomEnterResponse!=1){if(matchmaking){busy=true;Create(request);}else Error("Cannot join this Steam lobby. Check Steam friendship, its ID and open seat.");return;}
            CSteamID host;bool compatible=SteamMatchmaking.GetLobbyData(joined,"lk_game")==Game&&SteamMatchmaking.GetLobbyData(joined,"lk_protocol")==Protocol&&SteamMatchmaking.GetLobbyData(joined,"lk_mode")==mode&&TryID(SteamMatchmaking.GetLobbyData(joined,"lk_host"),out host)&&host==SteamMatchmaking.GetLobbyOwner(joined)&&SteamMatchmaking.GetNumLobbyMembers(joined)<=capacity;
            if(!compatible){SteamMatchmaking.LeaveLobby(joined);if(matchmaking){busy=true;Create(request);}else Error("This lobby is not compatible. Check 1v1 or 2v2 and update both clients.");return;}
            lobby=joined;originalHost=SteamMatchmaking.GetLobbyOwner(joined);quick=SteamMatchmaking.GetLobbyData(joined,"lk_quick")=="1";EmitLobby();
        });entered.Set(SteamMatchmaking.JoinLobby(target));
    }
    object Initialize(){
        if(initialized)return Status();string error;
        if(SteamAPI.InitEx(out error)!=ESteamAPIInitResult.k_ESteamAPIInitResult_OK)return new {ok=false,error="Start Steam and sign in, then retry."};
        if(SteamUtils.GetAppID().m_AppId!=480){SteamAPI.Shutdown();return new {ok=false,error="This development build requires AppID 480."};}
        initialized=true;SteamNetworkingUtils.InitRelayNetworkAccess();
        membership=Callback<LobbyChatUpdate_t>.Create(delegate(LobbyChatUpdate_t update){if(update.m_ulSteamIDLobby==lobby.m_SteamID)EmitLobby();});
        dataUpdate=Callback<LobbyDataUpdate_t>.Create(delegate(LobbyDataUpdate_t update){if(update.m_ulSteamIDLobby==lobby.m_SteamID)EmitLobby();});
        sessionRequest=Callback<SteamNetworkingMessagesSessionRequest_t>.Create(delegate(SteamNetworkingMessagesSessionRequest_t request){var identity=request.m_identityRemote;if(AllowedPeer(identity.GetSteamID()))SteamNetworkingMessages.AcceptSessionWithUser(ref identity);else SteamNetworkingMessages.CloseSessionWithUser(ref identity);});
        sessionFailed=Callback<SteamNetworkingMessagesSessionFailed_t>.Create(delegate(SteamNetworkingMessagesSessionFailed_t failure){if(AllowedPeer(failure.m_info.m_identityRemote.GetSteamID()))emit(new {type="connection",from=failure.m_info.m_identityRemote.GetSteamID().ToString(),connected=false});});
        inviteRequested=Callback<GameLobbyJoinRequested_t>.Create(delegate(GameLobbyJoinRequested_t invite){emit(new {type="invite",lobby=invite.m_steamIDLobby.ToString(),mode=SteamMatchmaking.GetLobbyData(invite.m_steamIDLobby,"lk_mode")});});timer.Start();return Status();
    }
    object Status(){return new {ok=true,initialized=initialized,id=SteamUser.GetSteamID().ToString(),name=CleanName(SteamFriends.GetPersonaName()),appId=480};}
    void BeginOperation(){if(busy||lobby!=CSteamID.Nil)throw new InvalidOperationException("Leave your current Steam room before opening another.");busy=true;operationStarted=DateTime.UtcNow;generation++;locked=false;}
    bool AllowedPeer(CSteamID target){if(lobby==CSteamID.Nil||target==SteamUser.GetSteamID()||target==CSteamID.Nil)return false;int count=SteamMatchmaking.GetNumLobbyMembers(lobby);if(count<2||count>capacity||SteamMatchmaking.GetLobbyOwner(lobby)!=originalHost)return false;for(int i=0;i<count;i++)if(SteamMatchmaking.GetLobbyMemberByIndex(lobby,i)==target)return true;return false;}
    void EmitLobby(){
        if(lobby==CSteamID.Nil)return;var members=new List<object>();var current=new HashSet<ulong>();int count=SteamMatchmaking.GetNumLobbyMembers(lobby);
        for(int i=0;i<count&&i<capacity;i++){var member=SteamMatchmaking.GetLobbyMemberByIndex(lobby,i);members.Add(new {id=member.ToString(),name=CleanName(SteamFriends.GetFriendPersonaName(member))});if(member!=SteamUser.GetSteamID())current.Add(member.m_SteamID);}
        foreach(ulong old in peers)if(!current.Contains(old)){var identity=new SteamNetworkingIdentity();identity.SetSteamID64(old);SteamNetworkingMessages.CloseSessionWithUser(ref identity);}peers.Clear();foreach(ulong id in current)peers.Add(id);
        if(!locked&&SteamUser.GetSteamID()==originalHost&&count==capacity){locked=true;SteamMatchmaking.SetLobbyJoinable(lobby,false);SteamMatchmaking.SetLobbyData(lobby,"lk_phase","playing");}
        emit(new {type="lobby",lobby=lobby.ToString(),host=originalHost.ToString(),hostPresent=SteamMatchmaking.GetLobbyOwner(lobby)==originalHost,members=members,mode=mode,quick=quick});
    }
    void Pump(){
        if(!initialized)return;try{SteamAPI.RunCallbacks();if(busy&&(DateTime.UtcNow-operationStarted).TotalSeconds>25){generation++;busy=false;quick=false;Error("Steam lobby request timed out. Retry shortly.");}
            if(quick&&!locked&&!busy&&lobby!=CSteamID.Nil&&SteamUser.GetSteamID()==originalHost&&SteamMatchmaking.GetNumLobbyMembers(lobby)==1&&DateTime.UtcNow>=nextSearch)Search(generation);
            var pointers=new IntPtr[32];int count=SteamNetworkingMessages.ReceiveMessagesOnChannel(Channel,pointers,pointers.Length);for(int i=0;i<count;i++){try{var message=SteamNetworkingMessage_t.FromIntPtr(pointers[i]);var from=message.m_identityPeer.GetSteamID();if(message.m_cbSize<=0||message.m_cbSize>MaxBytes||!AllowedPeer(from))continue;byte[] bytes=new byte[message.m_cbSize];Marshal.Copy(message.m_pData,bytes,0,bytes.Length);emit(new {type="packet",from=from.ToString(),payload=new UTF8Encoding(false,true).GetString(bytes)});}catch(DecoderFallbackException){}finally{SteamNetworkingMessage_t.Release(pointers[i]);}}
        }catch(Exception){Error("Steam connection interrupted. Check that Steam is running.");}
    }
    void Error(string message){emit(new {type="error",error=message});}
    void Leave(){generation++;busy=false;quick=false;locked=false;if(lobby!=CSteamID.Nil){if(SteamUser.GetSteamID()==originalHost){SteamMatchmaking.SetLobbyJoinable(lobby,false);SteamMatchmaking.SetLobbyData(lobby,"lk_phase","closed");}SteamMatchmaking.LeaveLobby(lobby);}foreach(ulong id in peers){var identity=new SteamNetworkingIdentity();identity.SetSteamID64(id);SteamNetworkingMessages.CloseSessionWithUser(ref identity);}peers.Clear();lobby=CSteamID.Nil;originalHost=CSteamID.Nil;}
    static string Get(Dictionary<string,object> args,string name){object value;return args.TryGetValue(name,out value)?value as string??"":"";}
    static bool TryID(string text,out CSteamID id){ulong value;if(text!=null&&text.Length>=17&&text.Length<=20&&System.Text.RegularExpressions.Regex.IsMatch(text,"^[0-9]+$")&&UInt64.TryParse(text,out value)){id=new CSteamID(value);return id.IsValid();}id=CSteamID.Nil;return false;}
    static CSteamID ParseID(string text){CSteamID id;if(!TryID(text,out id))throw new ArgumentException("Enter the complete numeric Steam ID.");return id;}
    static string CleanName(string name){if(String.IsNullOrWhiteSpace(name))return "Steam commander";var builder=new StringBuilder();foreach(char c in name){if(!Char.IsControl(c))builder.Append(c);if(builder.Length>=40)break;}return builder.ToString();}
    public void Dispose(){timer.Stop();if(initialized){Leave();if(membership!=null)membership.Dispose();if(dataUpdate!=null)dataUpdate.Dispose();if(sessionRequest!=null)sessionRequest.Dispose();if(sessionFailed!=null)sessionFailed.Dispose();if(inviteRequested!=null)inviteRequested.Dispose();if(created!=null)created.Dispose();if(entered!=null)entered.Dispose();if(found!=null)found.Dispose();SteamAPI.Shutdown();initialized=false;}timer.Dispose();}
}
