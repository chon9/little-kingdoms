export const messages={
 'My skill rank →':'我的棋力段位 →','This rival is too far below your rating. Try a stronger opponent.':'此对手的棋力远低于你，请挑战更强的对手。',
 'SKILL RANK':'棋力段位','SKILL RATING':'棋力分','RANK PROMOTION':'晋级成功','RANK DEMOTION':'段位下降','Win recorded':'胜局已记录','Defeat recorded':'败局已记录','Skill rating unchanged':'棋力分未变动',
 'Same-device practice, empty games and interrupted Steam matches do not change rank.':'本机练习、空局及意外中断的 Steam 对局不影响段位。',
 'View skill rank and rating':'查看棋力段位与积分','THE WAY OF THE COMMANDER':'主公的棋力之路','Your skill. Your rank.':'凭棋力，定段位。','Ranked wins':'排位胜局','Ranked defeats':'排位败局','Best rank':'最高段位','Rank journey':'晋级之路','Recent ranked battles':'最近排位对局','Starting rank':'起始段位','Highest rank reached. Keep defending your rating.':'已达最高段位，继续捍卫你的棋力分。','How rating works':'棋力分计算说明','Back to collection →':'返回武将收藏 →','Ranked AI battles':'人机排位','PvP':'玩家对战','2v2':'2对2',
 'AI and online PvP change this rating. Stronger opponents give larger gains; losing to weaker opponents costs more. Easy AI wins give progressively smaller gains. Same-device pass & play is practice.':'人机与在线对战均影响棋力分。战胜强敌加分更多，输给弱敌扣分更多。反复战胜低难度电脑的收益会越来越小。本机轮流对战属于练习。',
 'Higher ranks need both the rating threshold and enough ranked games. Losses can demote your current rank. Commander XP, levels and unlocked cosmetics never decrease.':'越高的段位，要求越高的棋力分和更多排位对局。败局可能导致降级；主公经验、等级与已解锁外观不会减少。',
 'Elo expectation uses a 400-point scale. Adjustment: 48 for your first 20 games, then 32; at 1 dan strength it becomes 24, and at 6 dan strength 16. AI levels use fixed benchmarks from 800 to 2600. In 2v2, the two teams’ average ratings determine the expectation.':'采用埃洛预期胜率，分差标度为400。前20局调整系数为48，之后为32；达到初段分数后为24，六段分数后为16。各电脑难度的固定基准分为800至2600。2对2根据双方队伍平均棋力分计算预期胜率。',
 'Resigning or explicitly abandoning a started rated battle counts as a defeat. Wins require at least three deployed castles and participation from both colors. Every match is recorded once. Old results are not backfilled.':'已落子后认输或主动放弃排位对局，按败局扣分。胜局需双方均有落子，且总共至少部署三座城堡。每场只结算一次，旧版本战绩不补计。',
 'This is a device-saved Little Kingdoms skill estimate, not a server-verified competitive ladder or an official Go rank. It does not sync between devices. Online win/loss verification remains separate.':'此段位为保存在本设备的小小王国棋力估计，并非服务器认证的竞技天梯或正式围棋段位，不跨设备同步。服务器验证的在线胜负记录独立保留。',
 'Ranked battles have no undo. Turn off Ranked AI battles in Settings for practice.':'排位不允许悔棋。在设置中关闭“人机排位”，即可开始练习。','Ranked AI setting applies to your next battle.':'人机排位设置将在下一局生效。','Ranked defeat recorded. Your rating decreased.':'已记录排位败局，棋力分已扣除。',
 'Start again with the same general, difficulty and kingdom. This unfinished match gives no XP. Restarting a ranked battle after a move records a defeat.':'以相同武将、难度和阵营重新开局。未完成的对局不发放经验。已落子后重开排位，将按败局扣分。',
 'Your current battle will end on this device. Abandoning a ranked battle after a move records a defeat.':'本设备的当前对局将结束。已落子后放弃排位，将按败局扣分。',
 'Leaving a started battle records a ranked defeat. Your rival can leave and host another room.':'已落子后离开将记录排位败局。对手可离开并重新创建房间。'
};
export const patterns=[
 ['^Next: (.+) · Win to confirm promotion$','下一段位：$1 · 再胜一局确认晋级'],
 ['^(\\d+) Kyu$','$1级'],['^(\\d+) Dan$','$1段'],
 ['^LV\\. (\\d+) · (\\d+)K$','$1级 · $2级棋力'],['^LV\\. (\\d+) · (\\d+)D$','$1级 · $2段棋力'],
 ['^([\\d.]+) rating · (\\d+) ranked games$','棋力分 $1 · $2 场排位'],
 ['^Next: (.+) · ([\\d.]+) rating to gain · (\\d+) games to play$','下一段位：$1 · 还需 $2 棋力分 · 还需 $3 场排位'],
 ['^([\\d.]+) rating$','$1 棋力分'],['^(\\d+) ranked games$','$1 场排位']
];
