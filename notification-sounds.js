// Sonidos originales de interfaz: no usan archivos externos ni requieren permisos de notificación.
// Nunca reproducir una alerta histórica al abrir la página por primera vez.
const NEW_ORDER_ROLES=new Set(['admin','negocios','repartidores']);
const STATUS_KIND={
 accepted:'assigned',
 at_pickup:'at_pickup',
 picked_up:'on_way',
 at_dropoff:'arrived',
 delivered:'delivered',
 cancelled:'cancelled'
};
const STATUS_PRIORITY={new:9,assigned:6,at_pickup:3,on_way:5,arrived:7,delivered:8,cancelled:7};

export function orderAlert(before,after,role,userId,ready=true){
 if(!ready)return null;
 const old=new Map((before||[]).map(o=>[o.id,o]));
 const alerts=[];
 for(const item of after||[]){
  const previous=old.get(item.id);
  if(!previous){
   if(item.status==='pending'&&NEW_ORDER_ROLES.has(role))
    alerts.push({kind:'new',orderId:item.id});
   else if(role==='repartidores'&&userId&&item.courier_id===userId&&
     item.status!=='pending'&&item.status!=='delivered'&&item.status!=='cancelled')
    alerts.push({kind:'assigned',orderId:item.id});
   continue;
  }
  if(previous.status!==item.status&&STATUS_KIND[item.status])
   alerts.push({kind:STATUS_KIND[item.status],orderId:item.id});
  else if(role==='repartidores'&&userId&&previous.courier_id!==item.courier_id&&item.courier_id===userId)
   alerts.push({kind:'assigned',orderId:item.id});
 }
 if(!alerts.length)return null;
 alerts.sort((a,b)=>(STATUS_PRIORITY[b.kind]||0)-(STATUS_PRIORITY[a.kind]||0));
 return {...alerts[0],count:alerts.length};
}

export function trackingAlert(before,after){
 if(!before||!after||before.status===after.status)return null;
 const kind=STATUS_KIND[after.status];
 return kind?{kind,orderId:after.id||null,count:1}:null;
}

export function alertText(alert,role='cliente'){
 if(!alert)return '';
 const courier=role==='repartidores';
 const texts={
  new:'¡Hay un domicilio nuevo!',
  assigned:courier?'Te asignaron un domicilio.':'¡Domiciliario asignado!',
  at_pickup:'El domiciliario llegó al negocio.',
  on_way:courier?'Pedido recogido. Continúa hacia el destino.':'¡Tu domicilio ya va en camino!',
  arrived:courier?'Llegaste al destino.':'¡El domiciliario llegó al destino!',
  delivered:'¡Domicilio entregado!',
  cancelled:'El domicilio fue cancelado.'
 };
 const label=texts[alert.kind]||'Actualización de domicilio.';
 return alert.count>1?label+' ('+alert.count+' cambios)':label;
}

// Web Audio: notas originales muy cortas y volumen suave. Sin reproducción continua.
const PATTERNS={
 test:[[690,0,.09],[870,.11,.12]],
 new:[[740,0,.11],[920,.14,.16]],
 assigned:[[550,0,.10],[740,.12,.12]],
 at_pickup:[[650,0,.12]],
 on_way:[[570,0,.09],[770,.105,.13]],
 arrived:[[920,0,.1],[790,.13,.16]],
 delivered:[[650,0,.07],[820,.09,.08],[1040,.2,.17]],
 cancelled:[[490,0,.14],[390,.16,.16]]
};

export function createSoundPlayer(target=globalThis){
 let context=null;
 const supported=()=>Boolean(target.AudioContext||target.webkitAudioContext);
 const ready=()=>context?.state==='running';
 function unlock(){
  if(!supported())return Promise.resolve(false);
  try{
   if(!context){
    const Context=target.AudioContext||target.webkitAudioContext;
    context=new Context();
   }
   if(ready())return Promise.resolve(true);
   // Solo se invoca al tocar la pantalla o usar el teclado.
   const result=context.resume();
   return Promise.resolve(result).then(()=>ready()).catch(()=>false);
  }catch(err){return Promise.resolve(false)}
 }
 function play(kind){
  if(!ready())return false;
  const notes=PATTERNS[kind]||PATTERNS.test;
  const now=context.currentTime+.018;
  try{
   for(const [frequency,delay,duration] of notes){
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='sine';oscillator.frequency.value=frequency;
    oscillator.connect(gain);gain.connect(context.destination);
    const start=now+delay,end=start+duration;
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(.11,start+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,end);
    oscillator.start(start);oscillator.stop(end+.015);
   }
   return true;
  }catch(err){return false}
 }
 return {supported,ready,unlock,play};
}
