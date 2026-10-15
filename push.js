const PUSH_API='https://brigada-push.egor-novoselisev.workers.dev';
let pushBusy=false;
function supportsPush(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
async function pushRequest(path,body){if(!cloudUser)throw Error('Сначала войдите');const token=await cloudUser.getIdToken();const r=await fetch(PUSH_API+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Сервер уведомлений недоступен');return r.json();}
function decodePushKey(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function pushRegistration(){await navigator.serviceWorker.register('./sw.js');return navigator.serviceWorker.ready;}
async function syncPushState(){
 if(!supportsPush()){$('pushToggle').textContent='Push недоступны';return;}
 try{const registration=await pushRegistration();const subscription=await registration.pushManager.getSubscription();$('pushToggle').textContent=subscription?'🔔 Уведомления включены':'🔔 Включить уведомления';if(subscription&&cloudUser)await pushRequest('/subscribe',{subscription:subscription.toJSON()});await flushPushOutbox();}catch{} 
 if(location.hash==='#tasks')$('tasksNav').click();
}
$('pushToggle').addEventListener('click',async()=>{
 if(pushBusy)return;if(!supportsPush()){toast('Этот браузер не поддерживает push. На iPhone добавьте сайт на главный экран.');return;}
 pushBusy=true;$('pushToggle').disabled=true;
 try{
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Уведомления запрещены. Разрешите их в настройках сайта браузера.');
 const registration=await pushRegistration();let subscription=await registration.pushManager.getSubscription();
 if(subscription){await pushRequest('/unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();toast('Уведомления отключены');}
 else{const response=await fetch(PUSH_API+'/key');if(!response.ok)throw Error('Не удалось получить ключ уведомлений');const {publicKey}=await response.json();subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodePushKey(publicKey)});try{await pushRequest('/subscribe',{subscription:subscription.toJSON()});}catch(error){await subscription.unsubscribe();throw error;}toast('Уведомления о новых заданиях включены');}
 await syncPushState();
 }catch(error){toast(error.message);}finally{pushBusy=false;$('pushToggle').disabled=false;}
});
function outboxKey(){return 'brigada-push-outbox-'+cloudUser?.uid;}
async function queueTaskPush(taskId){if(!cloudUser)return;const key=outboxKey();const ids=JSON.parse(localStorage.getItem(key)||'[]');localStorage.setItem(key,JSON.stringify([...new Set([...ids,taskId])]));await flushPushOutbox();}
let flushingPush=false;
async function flushPushOutbox(){if(flushingPush||!cloudUser||!navigator.onLine)return;flushingPush=true;const key=outboxKey();try{const ids=JSON.parse(localStorage.getItem(key)||'[]');for(const id of ids){await pushRequest('/notify',{taskId:id});const pending=JSON.parse(localStorage.getItem(key)||'[]');localStorage.setItem(key,JSON.stringify(pending.filter(value=>value!==id)));}}catch{toast('Задание сохранено. Отправка push повторится при подключении.');}finally{flushingPush=false;}}
window.addEventListener('online',()=>{syncPushState();});
navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='OPEN_TASKS')$('tasksNav').click();});
$('logoutBtn').addEventListener('click',async event=>{event.stopImmediatePropagation();try{if(supportsPush()){const registration=await navigator.serviceWorker.getRegistration();const subscription=await registration?.pushManager.getSubscription();if(subscription){try{await pushRequest('/unsubscribe',{endpoint:subscription.endpoint});}finally{await subscription.unsubscribe();}}}}catch{toast('Не удалось отключить push на сервере. Отключите уведомления сайта в настройках браузера.');}finally{await cloudAuth.signOut();}},true);
