(function(){
var N=NIMBUS, H=N.input.held, P=N.input.pressed, out=[];
function log(s){out.push(s)}
function fx(v){return v.toFixed(2)}
// A: run speed
N.loadScene(2); var w=N.world, p=w.player; N.tick(5); var x0=p.x; H.right=true; N.tick(50); H.right=false;
log('A run 1s dx='+fx(p.x-x0)+' vx='+fx(p.vx)+' grounded='+p.isGrounded+' anim='+p.anim);
N.tick(60); log('A2 stop after 1.2s vx='+fx(p.vx));
// B: single jump height
N.loadScene(2); w=N.world; p=w.player; N.tick(5); var y0=p.y, maxy=p.y; P.jump=true; for(var i=0;i<100;i++){N.tick(1); maxy=Math.max(maxy,p.y);} log('B jump height='+fx(maxy-y0)+' landed grounded='+p.isGrounded+' jumps='+p.jumpCounter);
// C: double jump
N.loadScene(2); w=N.world; p=w.player; N.tick(5); y0=p.y; maxy=p.y; P.jump=true; N.tick(20); P.jump=true; for(i=0;i<150;i++){N.tick(1); maxy=Math.max(maxy,p.y);} log('C double jump height='+fx(maxy-y0));
// D: dash
N.loadScene(2); w=N.world; p=w.player; N.tick(5); x0=p.x; P.dash=true; N.tick(10); log('D dash 0.2s dx='+fx(p.x-x0)+' dashing='+p.isDashing); N.tick(2); log('D2 after dash vx='+fx(p.vx)+' canDash='+p.canDash); N.tick(50); log('D3 canDash after cooldown='+p.canDash);
// F: umibozu contact damage
N.loadScene(2); w=N.world; p=w.player; var u=w.umibozu[0]; p.x=u.x+4*Math.sign(u.scale); p.y=u.y; N.tick(3); var hp=p.hc.health; N.tick(150); log('F umibozu: player hp '+hp+' -> '+p.hc.health+' umi charged='+(!u.canCharge||u.walkClip==='umibozu-charge'));
// G: melee kills umibozu (3 hits)
N.loadScene(2); w=N.world; p=w.player; u=w.umibozu[0]; u.canCharge=false; u.checkForPlayer=function(){return false};
var killed=false; for(var k=0;k<8 && !u.removed;k++){ var b=u.bounds(); p.x=b[0]-p.r-0.3; p.y=(b[1]+b[3])/2; p.vx=p.vy=0; if(p.scale<0)p.flip(); p.hc.isDamaged=false; p.animatingDamage=false; P.attack=true; N.tick(1); N.tick(30); }
N.tick(60); log('G melee: umibozu hp='+u.hc.health+' dead='+u.hc.isDead+' removed='+(w.umibozu.indexOf(u)<0));
// H: raven shoots
N.loadScene(2); w=N.world; p=w.player; var r=w.ravens[0]; p.x=r.x-6; p.y=r.y-3; p.gravityScale=0; p.vy=0; hp=p.hc.health; var maxB=0; for(i=0;i<150;i++){p.vy=0; p.vx=0; N.tick(1); maxB=Math.max(maxB,w.bullets.length);} log('H raven: max bullets='+maxB+' player hp '+hp+' -> '+p.hc.health);
// J: kill zone
N.loadScene(2); w=N.world; p=w.player; var kz=w.sc.kill[0]; p.x=(kz[0]+kz[2])/2+5; p.y=kz[3]+3; p.vx=0; p.vy=0; for(i=0;i<200 && N.scene===2;i++) N.tick(1); log('J fall into gap -> scene '+N.scene);
// K: oracle
N.loadScene(2); w=N.world; p=w.player; var o=w.sc.oracle[0]; p.x=(o[0]+o[2])/2; p.y=(o[1]+o[3])/2; N.tick(2); log('K oracle -> scene '+N.scene);
// L: boss: dash into Apollo 5 times
N.loadScene(4); w=N.world; p=w.player; var bs=w.boss; var dashes=0;
for(k=0;k<12 && N.scene===4;k++){ var bb=bs.bounds(); p.x=bb[0]-1.2; p.y=(bb[1]+bb[3])/2; p.vx=p.vy=0; p.gravityScale=1; if(p.scale<0)p.flip(); p.hc.isDamaged=false; p.animatingDamage=false; p.canDash=true; p.isDashing=false; P.dash=true; dashes++; N.tick(15); N.tick(60); }
log('L boss: dashes='+dashes+' boss hp='+(bs.hc.health)+' -> scene '+N.scene);
// M: boss bullets hurt
N.loadScene(4); w=N.world; p=w.player; hp=p.hc.health; N.tick(400); log('M boss 8s idle: player hp '+hp+' -> '+p.hc.health+' scene '+N.scene+' bullets='+w.bullets.length);
// N: wall cling + wall jump in level 2 (big block)
N.loadScene(3); w=N.world; p=w.player; N.tick(5); log('N level2 start grounded='+p.isGrounded+' at '+fx(p.x)+','+fx(p.y));
return out.join(' | ');
})()
