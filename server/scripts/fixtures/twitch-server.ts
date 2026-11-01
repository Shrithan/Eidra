// Development test fixture only. Never imported by the production entrypoint.
process.env.TWITCH_CLIENT_ID='fixture-client';process.env.TWITCH_CLIENT_SECRET='fixture-secret';process.env.SESSION_SECRET='fixture-persistent-secret';
const network=globalThis.fetch;let refreshes=0;
globalThis.fetch=async(input:any,init?:RequestInit)=>{
  const url=String(input);
  if(url.startsWith('http://localhost:2567'))return network(input,init);
  if(url==='https://id.twitch.tv/oauth2/token'){
    if(String(init?.body).includes('grant_type=refresh_token'))refreshes++;
    return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});
  }
  if(url==='https://id.twitch.tv/oauth2/validate')return Response.json({user_id:'fixture999',client_id:'fixture-client',scopes:['user:read:chat','user:write:chat']});
  if(url.includes('/helix/users'))return Response.json({data:[{id:'fixture999',login:'watchworld_fixture',display_name:'WatchworldFixture',profile_image_url:''}]});
  if(url.includes('/helix/streams'))return Response.json({data:[{id:'live-fixture999',user_id:'fixture999',user_login:'watchworld_fixture',user_name:'WatchworldFixture',title:'Integration fixture stream',game_name:'Just Chatting',viewer_count:42,language:'en',thumbnail_url:''}]});
  if(url.includes('/helix/chat/messages'))return Response.json({data:[{is_sent:true}]});
  throw new Error('External networking disabled by test fixture');
};
const {app}=await import('../../src/index.js');
const {services}=await import('../../src/theater.js');services.subscribe=()=>()=>{};
app.get('/__test/status',(_req,res)=>res.json({refreshes}));
app.get('/__test/login',async(_req,res)=>{
  const start=await fetch('http://localhost:2567/auth/twitch',{redirect:'manual'});
  const state=new URL(start.headers.get('location')!).searchParams.get('state')!;
  const cookie=start.headers.get('set-cookie')!.split(';')[0];
  const finish=await fetch('http://localhost:2567/auth/twitch/callback?'+new URLSearchParams({state,code:'fixture-code'}),{redirect:'manual',headers:{Cookie:cookie}});
  res.setHeader('Set-Cookie',finish.headers.get('set-cookie')!);res.redirect('http://localhost:5173/');
});
process.send?.({ready:true});
