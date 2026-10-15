import webpush from 'web-push';
const ORIGIN='https://enot3d.github.io';
const PROJECT='gaz-brigada';
const ADMIN='egor.novoselisev@gmail.com';
const APIKEY='AIzaSyD8c4BOZcK8Ggn1APNRIeuoTSrQnAUxA9g';
const BASE=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;
function unpack(value){if(value?.mapValue)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,unpack(v)]));if(value?.arrayValue)return(value.arrayValue.values||[]).map(unpack);for(const k of ['stringValue','booleanValue','integerValue'])if(k in(value||{}))return value[k];return null;}
function documentData(doc){return unpack({mapValue:{fields:doc.fields}});}
async function read(path,token){const response=await fetch(BASE+path,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw Error('Нет доступа к базе');return response.json();}
function response(data,status=200){return Response.json(data,{status,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Vary':'Origin','Cache-Control':'no-store'}});}
async function identity(request){const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token)throw Error('Требуется вход');const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${APIKEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});const user=(await r.json()).users?.[0];if(!user||user.disabled)throw Error('Недействительный вход');if(user.email!==ADMIN){const profile=documentData(await read('users/'+encodeURIComponent(user.email.split('@')[0]),token));if(!profile.active||profile.uid!==user.localId)throw Error('Доступ отключён');user.role=profile.role;}return{user,token};}
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function validSubscription(subscription){try{const u=new URL(subscription.endpoint);return u.protocol==='https:'&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host))&&typeof subscription.keys?.p256dh==='string'&&typeof subscription.keys?.auth==='string';}catch{return false;}}
export default {async fetch(request,env){
 if(request.headers.get('Origin')!==ORIGIN)return response({error:'Origin denied'},403);
 if(request.method==='OPTIONS')return response({});
 const path=new URL(request.url).pathname;
 if(path==='/key'&&request.method==='GET')return response({publicKey:env.VAPID_PUBLIC_KEY});
 try{
 const {user,token}=await identity(request);
 if(Number(request.headers.get('Content-Length'))>10000)return response({error:'Слишком большой запрос'},413);
 const body=await request.json();
 if(path==='/subscribe'&&request.method==='POST'){
  if(!validSubscription(body.subscription))return response({error:'Некорректная подписка'},400);
  const key='sub:'+await hash(body.subscription.endpoint);const previous=await env.PUSH.get(key,'json');if(previous&&previous.uid!==user.localId)return response({error:'Подписка принадлежит другому аккаунту'},403);
  await env.PUSH.put(key,JSON.stringify({subscription:body.subscription,uid:user.localId,email:user.email}),{expirationTtl:7776000});return response({ok:true});
 }
 if(path==='/unsubscribe'&&request.method==='POST'){
  const key='sub:'+await hash(String(body.endpoint));const item=await env.PUSH.get(key,'json');if(item?.uid===user.localId)await env.PUSH.delete(key);return response({ok:true});
 }
 if(path==='/notify'&&request.method==='POST'){
  if(user.email!==ADMIN&&!['foreman','setter'].includes(user.role))return response({error:'Недостаточно прав'},403);
  const assignments=documentData(await read('appData/assignments',token));const task=(assignments.items||[]).find(t=>t.id===body.taskId);
  if(!task||task.author!==user.email)return response({error:'Задание не найдено'},404);
  const id='sent:'+await hash(task.id);if(await env.PUSH.get(id))return response({ok:true,duplicate:true});
  const profiles=await read('users?pageSize=1000',token);const active=new Set([ADMIN,...(profiles.documents||[]).map(documentData).filter(p=>p.active!==false).map(p=>p.email||p.code+'@gezbrigada.local')]);
  const payload=JSON.stringify({title:'Бригада · новое задание',body:String(task.text).slice(0,150),tag:'task-'+task.id,url:'https://enot3d.github.io/GezBrigadaY/'});
  let sent=0,cursor;do{const page=await env.PUSH.list({prefix:'sub:',cursor,limit:100});for(const key of page.keys){const item=await env.PUSH.get(key.name,'json');if(!item||!active.has(item.email)||item.uid===user.localId)continue;try{await webpush.sendNotification(item.subscription,payload,{TTL:86400,vapidDetails:{subject:'mailto:'+ADMIN,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});sent++;}catch(error){if([404,410].includes(error.statusCode))await env.PUSH.delete(key.name);else throw error;}}cursor=page.list_complete?null:page.cursor;}while(cursor);
  await env.PUSH.put(id,'1',{expirationTtl:604800});return response({ok:true,sent});
 }
 return response({error:'Not found'},404);
 }catch(error){return response({error:'Не удалось выполнить запрос уведомлений'},400);}
}};
