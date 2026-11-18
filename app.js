import {icon,escapeHTML as e,money,prettyTime,statusText,serviceName} from './icons.js?v=28';
import * as data from './data.js?v=28';
import {openPicker,gps,navigationUrl,googleEmbed,hasGoogleKey,trackingRouteUrl,showFleetMap} from './maps.js?v=28';
const cfg=window.RUTAYA_CONFIG||{};
const page=document.body.dataset.page||'cliente';
const root=document.getElementById('app');
const base=new URL('./',import.meta.url);
const url=path=>new URL(path,base).href;
const model={view:'inicio',orders:[],zones:[],store:null,knownStores:[],draft:{},businessDraft:{},showForm:false,service:'shop',auth:null,registration:false,user:null,profile:null,loading:true,error:null,track:null,courierGps:null,gpsWatch:null,gpsError:null,gpsLastSentAt:null,shareAdminLocation:false,gpsWakeLock:null,sending:false,poll:null,businessTrackingToken:null,businessTrackingData:null,couriers:[],courierMapOrderId:null,courierMapStage:'pickup',invitation:null,recipientStep:1,inviteDraft:{delivery_mode:'normal',paid:true},invites:[],inviteShareUrl:null,inviteBusy:false,manageOrderId:null,manageAction:null,adminHistoryId:null,adminHistoryItems:[],adminOrderFilter:'active',adminZones:[],fleet:[],fleetMap:null,stats:{},statsDays:30,cash:{},payouts:[],supportCases:[],verifications:[],deliveryOtpOrderId:null,supportOrderId:null,guestSupport:false,courierRatings:[],routeGroups:[],routeGroupIndex:null,desktopAlerts:false,authResetEmail:'',passwordRecovery:new URLSearchParams(location.search).has('rutaya_recovery')||location.hash.includes('type=recovery')};
let toastTimer;


function gpsElapsed(iso){
 if(!iso)return 'sin actualización';
 const seconds=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/1000));
 if(!Number.isFinite(seconds))return 'sin actualización';
 if(seconds<20)return 'hace unos segundos';
 if(seconds<60)return 'hace '+seconds+' segundos';
 const min=Math.floor(seconds/60);
 return min===1?'hace 1 minuto':'hace '+min+' minutos';
}
function gpsLiveBadge(loc){
 if(!loc?.updated_at)return '<span class="gps-pill gps-awaiting">Esperando GPS</span>';
 const age=Date.now()-new Date(loc.updated_at).getTime();
 if(!Number.isFinite(age)||age>90000)return '<span class="gps-pill gps-delayed">Señal demorada</span>';
 return '<span class="gps-pill gps-live">GPS reciente</span>';
}
function courierGpsCard(){
 const active=model.orders.some(o=>o.courier_id===model.user?.id&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
 const running=model.gpsWatch!=null;
 const sharing=running&&(active||model.shareAdminLocation)&&Boolean(model.gpsLastSentAt);
 const status=sharing?'Última posición enviada '+gpsElapsed(model.gpsLastSentAt)+'.':
 running?(active||model.shareAdminLocation?'GPS activado, esperando señal precisa o conexión.':'GPS activo, sin servicio ni permiso para compartir con Administración.'):
 model.shareAdminLocation?'Autorizaste a Administración, pero el GPS está apagado. Pulsa Activar mi GPS.':
 'GPS apagado. Actívalo para compartir mientras haces entregas.';
 const accuracy=model.courierGps?.accuracy;
 const warning=Number.isFinite(accuracy)&&accuracy>100?'<div class="gps-warning">Precisión de '+Math.round(accuracy)+' metros. Activa Ubicación precisa (máximo 100 m).</div>':'';
 return '<div class="card courier-gps-card"><div class="inline-between"><div><h3>'+icon('crosshair',18)+' Seguimiento GPS</h3><p>'+e(status)+'</p></div>'+
 '<span class="gps-pill '+(sharing?'gps-live':running?'gps-awaiting':'gps-off')+'">'+(sharing?'Transmitiendo':running?'GPS preparado':'Apagado')+'</span></div>'+
 (model.gpsError?'<div class="gps-warning">'+e(model.gpsError)+'</div>':'')+warning+
 '<div class="order-actions"><button class="button '+(running?'outline':'primary')+' small" data-act="'+(running?'stopCourierGps':'courierGps')+'">'+icon('crosshair',17)+' '+(running?'Detener GPS':'Activar mi GPS')+'</button>'+
 (running?'<button class="button tonal small" data-act="courierGps">'+icon('navigation',17)+' Actualizar ubicación</button>':'')+'</div>'+
 '<div class="gps-admin-sharing"><div><b>Ubicación para Administración</b><small>'+(
 model.shareAdminLocation?'Autorizada: Administración podrá ver mi última posición mientras RutaYa esté abierta y el GPS transmita, aunque no tenga pedidos.':
 'Desactivada: cuando no tenga pedidos, mi ubicación NO se comparte con Administración.'
 )+'</small></div>'+
 '<button class="button '+(model.shareAdminLocation?'outline':'primary')+' small" data-act="toggleAdminGpsShare">'+icon(model.shareAdminLocation?'close':'check',16)+' '+(model.shareAdminLocation?'Dejar de compartir':'Compartir con Administración')+'</button></div>'+
 '<p class="field-help">Durante un servicio activo se comparte la última ubicación con el seguimiento del pedido. Puedes detener el GPS cuando quieras. Si bloqueas el celular o cierras RutaYa, la transmisión puede interrumpirse.</p></div>';
}

function scheduleSelector(d){return '<label for="schedule-when">¿Deseas programar el domicilio? (opcional)</label>'+
 '<input id="schedule-when" name="scheduled_at" type="datetime-local" value="'+e(d.scheduled_at||'')+'">'+
 '<p class="field-help">Si lo dejas vacío, el pedido seguirá el horario normal de su modalidad. Puedes programarlo desde dentro de 30 minutos hasta 30 días después; los Enrutados respetan su horario de salida.</p>'}

function modeName(v){return ({routed:'Enrutado',normal:'Normal',urgent:'Urgente'})[v]||'Normal'}
function orderStatusText(o){return o.status==='pending'&&o.delivery_mode==='routed'&&o.dispatch_after&&Date.parse(o.dispatch_after)>Date.now()?'Programado para la tarde':statusText(o.status)}
function scheduledTime(v){if(!v)return 'Por confirmar';try{return new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}catch{return 'Por confirmar'}}
function modeInfo(o){const v=o.delivery_mode||'normal';const msg=v==='routed'?'Programado para despacho desde '+scheduledTime(o.dispatch_after)+'. Sin hora de entrega garantizada.':v==='urgent'?'Prioridad en la lista de repartidores. Sujeto a disponibilidad.':'Entrega estándar según disponibilidad.';const schedule=o.dispatch_after&&Date.parse(o.dispatch_after)>Date.now()+900000?' · Programado desde '+scheduledTime(o.dispatch_after):'';return '<div class="mode-summary mode-'+e(v)+'"><b>'+icon(v==='routed'?'route':v==='urgent'?'navigation':'truck',17)+' '+e(modeName(v))+'</b><small>'+e(msg+schedule)+'</small></div>'}
function modeSelector(d){const v=d.delivery_mode||'normal';const opts=[['routed','route','Enrutado','−$1.000','Pedidos antes de las 12 m. habilitados desde las 2 p. m.; después del corte, al día siguiente.'],['normal','truck','Normal','Tarifa base','Servicio disponible según los repartidores.'],['urgent','navigation','Urgente','+$1.500','Prioridad alta entre los pedidos disponibles.']];return '<fieldset class="delivery-choice"><legend>Modalidad de entrega</legend><div class="mode-grid">'+opts.map(o=>'<label class="mode-tile '+(v===o[0]?'selected':'')+'"><input type="radio" name="delivery_mode" value="'+o[0]+'" '+(v===o[0]?'checked':'')+'><span class="mode-tile-title">'+icon(o[1],19)+'<b>'+o[2]+'</b><strong>'+o[3]+'</strong></span><small>'+o[4]+'</small></label>').join('')+'</div><p class="mode-hint">El enrutado es programado; la optimización automática de varias paradas todavía no está activa.</p></fieldset>'}
function trackingLink(o){return url('seguimiento/?token='+encodeURIComponent(o.tracking_token||''))}
function whatsappTrackingUrl(o){const raw=String(o.recipient_phone||'').replace(/\D/g,'');const to=raw.length===10&&raw.startsWith('3')?'57'+raw:raw.length===12&&raw.startsWith('57')?raw:'';const brand=o.source==='business'?(model.store?.name||'Tu negocio'):'RutaYa';const message='Hola, '+(o.recipient_name||'')+'. '+brand+' te comparte el seguimiento de tu domicilio RutaYa: '+trackingLink(o)+'. Puedes ver su estado y la última ubicación reportada cuando el repartidor active el GPS.';return 'https://wa.me/'+to+'?text='+encodeURIComponent(message)}
function businessShareActions(o){const token=e(o.tracking_token||'');return '<button class="button tonal small" data-act="trackBusiness" data-token="'+token+'">'+icon('navigation',17)+' Ver domiciliario</button><a class="button primary small" href="'+e(whatsappTrackingUrl(o))+'" target="_blank" rel="noopener noreferrer">'+icon('phone',17)+' WhatsApp clienta</a><button class="button outline small" data-act="copyTrack" data-token="'+token+'">'+icon('copy',17)+' Copiar enlace</button>'}
function businessTrackingPanel(o){const t=model.businessTrackingToken===o.tracking_token?model.businessTrackingData:null;const loc=t?.courier_location;const hasGps=loc?.lat!=null&&loc?.lng!=null;const route=hasGps?trackingRouteUrl(loc,{lat:o.dropoff_lat,lng:o.dropoff_lng}):null;const map=hasGps?'<div class="map-preview"><iframe loading="lazy" title="Última posición del domiciliario" src="'+e(googleEmbed(loc))+'"></iframe></div><small>Señal '+e(gpsElapsed(loc.updated_at))+' · Precisión aprox. '+Math.round(loc.accuracy||0)+' m. Se actualiza mientras el repartidor comparte GPS. <a href="'+e(navigationUrl(loc))+'" target="_blank" rel="noopener">Abrir punto GPS en Google Maps</a>'+(route?'<a class="button tonal small" style="margin:8px 0" href="'+e(route)+'" target="_blank" rel="noopener">Ver trayecto hacia la clienta</a>':'')+'</small>':'<div class="map-preview"><div class="map-fallback">'+icon('crosshair',32)+'<b>Esperando ubicación</b><small>La posición aparecerá cuando el repartidor acepte y active su GPS.</small></div></div>';return '<section class="card business-live"><div class="inline-between"><h3>Seguimiento de '+e(o.recipient_name||'la entrega')+'</h3><button class="iconbtn" data-act="closeBusinessTrack" aria-label="Cerrar">'+icon('close')+'</button></div><span class="badge">'+e(orderStatusText({...o,status:t?.status||o.status}))+'</span>'+modeInfo(o)+map+'<div class="order-actions"><a class="button outline small" href="'+e(trackingLink(o))+'" target="_blank" rel="noopener">'+icon('external',17)+' Abrir seguimiento</a><a class="button primary small" href="'+e(whatsappTrackingUrl(o))+'" target="_blank" rel="noopener noreferrer">'+icon('phone',17)+' Enviar a clienta</a></div></section>'}


function courierApplicationPage(){
 const p=model.profile||{};
 const pending=p.role==='courier'&&!p.approved;
 const cannotApply=p.role==='business'||p.role==='admin'||p.is_admin;
 const heading=pending?'Tu solicitud está en revisión':'Inscríbete como domiciliario';
 const status=pending?'<div class="hint">'+icon('clock',19)+' Ya recibimos tu solicitud. Solo podrás tomar domicilios cuando RutaYa te apruebe.</div>':'';
 const form=cannotApply?'<div class="notice">'+icon('info',18)+' Esta cuenta pertenece a un negocio o administración. Para repartir, crea una cuenta personal diferente.</div>':
 '<div class="card"><h2>'+ (pending?'Actualizar mis datos':'Solicitar acceso') +'</h2><p>Regístrate con tu nombre real. Un administrador revisará tu solicitud antes de habilitarte.</p><label for="courier-phone">Celular de contacto</label><input id="courier-phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" placeholder="3XXXXXXXXX"><label for="courier-vehicle">¿En qué vehículo repartirás?</label><select id="courier-vehicle"><option value="moto">Moto</option><option value="bicicleta">Bicicleta</option><option value="carro">Carro</option></select><div class="space"><button class="button primary wide" data-act="applyCourier">'+icon('check',17)+' '+(pending?'Actualizar solicitud':'Enviar solicitud de ingreso')+'</button></div><p class="field-help">RutaYa nunca te pedirá pagar para crear tu cuenta. El administrador debe verificar tu identidad y documentos antes de aprobarte para trabajar.</p></div>';
 return '<div class="pagehead"><h1>'+heading+'</h1></div>'+status+'<div class="card soft"><div class="inline">'+icon('user',21)+' <strong>'+e(p.display_name||'Tu cuenta')+'</strong></div><p>'+e(model.user?.email||'')+'</p><button class="button outline small" data-act="checkCourierApproval">'+icon('checkCircle',16)+' Comprobar si ya me aprobaron</button></div>'+form+'<div class="card"><p>¿Ya tienes cuenta habilitada? Ingresa con el correo registrado en RutaYa.</p><button class="button outline" data-act="signout">'+icon('logout',17)+' Cambiar de cuenta</button></div>';
}
function adminCourierPage(){
 const list=model.couriers||[];
 const waiting=list.filter(c=>!c.approved).length;
 const cards=list.map(c=>'<article class="card courier-admin-card"><div class="inline-between"><div><b>'+e(c.display_name||'Sin nombre')+'</b><small class="block-small">'+e(c.email||'')+'</small></div><span class="badge '+(c.approved?'green':'')+'">'+(c.approved?'Aprobado':'Pendiente')+'</span></div><div class="courier-detail">'+icon('phone',16)+' <span>'+e(c.phone||'')+'</span><span>·</span>'+icon('truck',16)+' <span>'+e(c.vehicle||'')+'</span></div><p class="field-help">Solicitud: '+e(prettyTime(c.applied_at))+'</p>'+(model.courierRatings.find(x=>x.courier_id===c.user_id)?.ratings?'<p class="field-help">Calificación: '+e(model.courierRatings.find(x=>x.courier_id===c.user_id).average_rating)+' / 5 ('+e(model.courierRatings.find(x=>x.courier_id===c.user_id).ratings)+' reseñas)</p>':'')+verificationControls(c)+'<div class="order-actions"><button class="button '+(c.approved?'outline':'primary')+' small" data-act="reviewCourier" data-user="'+e(c.user_id)+'" data-approve="'+(!c.approved)+'">'+icon(c.approved?'alert':'check',17)+' '+(c.approved?'Suspender acceso':'Aprobar domiciliario')+'</button></div></article>').join('');
 return '<div class="pagehead"><div><span class="eyebrow" style="color:var(--purple)">GESTIÓN DE REPARTO</span><h1>Domiciliarios</h1></div></div><div class="card soft"><h2>Agrega un domiciliario</h2><p>Envía este enlace para que el repartidor cree una cuenta y solicite acceso. Solo podrás habilitarlo tú desde este panel.</p><button class="button primary wide" data-act="copyCourierInvite">'+icon('copy',17)+' Copiar enlace de registro</button><a class="button outline wide space" href="'+e(url('repartidores/'))+'" target="_blank" rel="noopener">'+icon('external',17)+' Ver página de registro</a></div><div class="inline-between space"><h2>Solicitudes</h2><span class="badge">'+waiting+' por aprobar</span></div>'+ (list.length?cards:empty('Sin solicitudes todavía','Comparte el enlace con el primer domiciliario para comenzar.','user'))+'<div class="hint">'+icon('shield',19)+' Antes de aprobar, confirma personalmente la identidad, documentación, licencia cuando aplique y condiciones de servicio. Aprobar habilita el acceso a pedidos.</div>';
}



function changedOrderNotice(before,after){
 if(!before.length||model.sending)return null;
 const old=new Map(before.map(o=>[o.id,o.status]));
 const updates=after.filter(o=>old.has(o.id)&&old.get(o.id)!==o.status);
 const added=after.filter(o=>!old.has(o.id)&&o.status==='pending');
 if(updates.length)return updates.length===1?'Un pedido cambió a: '+statusText(updates[0].status)+'.':updates.length+' pedidos cambiaron de estado.';
 if(added.length&&['negocios','repartidores','admin'].includes(page))
  return added.length===1?'Nuevo domicilio disponible.':added.length+' nuevos domicilios disponibles.';
 return null;
}
function orderUpdateNotice(message){
 if(!message)return;
 if(!document.hidden)notify(message);
 if(model.desktopAlerts&&'Notification' in window&&Notification.permission==='granted'&&document.hidden){
  try{new Notification('RutaYa',{body:message,tag:'rutaya-order-update'})}catch(err){console.warn(err)}
 }
}


function deliveryInviteUrl(token){return url('confirmar/?token='+encodeURIComponent(token))}
function inviteWhatsAppText(link){
 return '¡Hola! 😊 '+(model.store?.name||'La tienda')+' necesita confirmar dónde entregar tu pedido.\n'+
 'Entra a este enlace y sigue 3 pasos fáciles: tu nombre, tu dirección y confirmar.\n'+link+
 '\nNo necesitas registrarte. El enlace dura 48 horas.';
}
function invitationStatus(i){
 if(i.revoked_at)return 'Desactivado';
 if(i.completed_at)return 'Datos recibidos';
 if(new Date(i.expires_at).getTime()<=Date.now())return 'Vencido';
 return 'Esperando clienta';
}
function inviteShareCard(){
 if(!model.inviteShareUrl)return '';
 const link=model.inviteShareUrl;
 return '<section class="card invite-share"><h3>'+icon('check',20)+' Enlace listo para enviar</h3>'+
 '<p>Envíalo por WhatsApp a la clienta. Ella completará sus datos, sin crear cuenta. Después se generará el pedido para el repartidor.</p>'+
 '<div class="invite-url">'+e(link)+'</div>'+
 '<div class="order-actions"><a class="button primary small" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text='+encodeURIComponent(inviteWhatsAppText(link))+'">'+icon('phone',17)+' Compartir por WhatsApp</a>'+
 '<button class="button outline small" data-act="copyInvite" data-link="'+e(link)+'">'+icon('copy',17)+' Copiar enlace</button></div></section>';
}
function businessInvitations(){
 const recent=(model.invites||[]).slice(0,12);
 if(!recent.length)return '';
 return '<section class="spaced"><div class="section-title"><h2>Enlaces de entrega</h2></div>'+
 recent.map(i=>{
  const state=invitationStatus(i),pending=state==='Esperando clienta',link=deliveryInviteUrl(i.token);
  return '<article class="card invite-item"><div class="inline-between"><strong>'+e(i.items_description)+'</strong><span class="badge '+(i.completed_at?'green':'')+'">'+e(state)+'</span></div>'+
  '<p class="field-help">'+(i.completed_at?'La clienta ya envió los datos. El pedido está en la sección Entregas.':pending?'Disponible hasta '+e(scheduledTime(i.expires_at)):state==='Vencido'?'Este enlace venció después de 48 horas.':'Ya no se puede completar.')+'</p>'+
  (pending?'<div class="order-actions"><a class="button tonal small" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text='+encodeURIComponent(inviteWhatsAppText(link))+'">'+icon('phone',17)+' WhatsApp</a>'+
  '<button class="button outline small" data-act="copyInvite" data-link="'+e(link)+'">'+icon('copy',17)+' Copiar</button>'+
  '<button class="button outline small" data-act="revokeInvite" data-token="'+e(i.token)+'">'+icon('close',16)+' Desactivar</button></div>':'')+
  '</article>';
 }).join('')+'</section>';
}
function inviteFormContent(){
 const d=model.inviteDraft;
 return '<div class="hint">'+icon('info',18)+' Tú describes el paquete y seleccionas el servicio. La clienta escribirá su nombre, celular y dirección desde el enlace.</div>'+
 '<label for="invite-detail">¿Qué vas a entregar?</label>'+
 '<input id="invite-detail" name="items_description" maxlength="1000" placeholder="Ej. Set de esmaltes y lámpara" value="'+e(d.items_description||'')+'">'+
 '<label for="invite-paid">¿El producto ya está pagado?</label>'+
 '<select id="invite-paid" name="paid"><option value="true" '+(d.paid!==false?'selected':'')+'>Sí, ya pagó</option>'+
 '<option value="false" '+(d.paid===false?'selected':'')+'>No, la clienta debe pagar al recibir</option></select>'+
 (d.paid===false?'<label for="invite-amount">Valor pendiente del producto (COP)</label><input id="invite-amount" name="amount_to_collect" type="number" min="1" max="100000000" value="'+e(d.amount_to_collect||'')+'">':'')+
 modeSelector(d)+
 '<p class="field-help">El precio del domicilio se calculará cuando la clienta seleccione su zona. Los Enrutados tienen horario de despacho programado.</p>';
}


function recipientInvitationPage(){
 const i=model.invitation;
 if(!i)return '<div class="card"><h2>Enlace no encontrado</h2><p>Pídele a la tienda que te envíe un enlace nuevo.</p></div>';
 if(i.status==='completed')return '<div class="card recipient-success">'+icon('check',40)+'<h1>¡Listo! Recibimos tus datos</h1>'+
 '<p>'+e(i.business_name||'La tienda')+' ya tiene tu dirección. Puedes consultar aquí cómo va tu pedido.</p>'+
 (i.tracking_token?'<a class="button primary wide" href="'+e(url('seguimiento/?token='+encodeURIComponent(i.tracking_token)))+'">'+icon('route',18)+' Ver mi domicilio</a>':'')+'</div>';
 if(i.status==='revoked'||i.status==='expired')return '<div class="card"><h1>Este enlace ya no funciona</h1><p>'+
 e(i.status==='expired'?'El enlace venció.':'La tienda lo desactivó.')+' Pide a la tienda uno nuevo.</p></div>';
 const d=model.draft;
 const step=Math.min(3,Math.max(1,model.recipientStep||1));
 const options=model.zones.map(z=>'<option value="'+e(z.name)+'" '+(d.dropoff_zone===z.name?'selected':'')+'>'+
 e(z.name)+(z.is_example===false?'':' (precio por confirmar)')+'</option>').join('');
 const phone=String(d.recipient_phone||'').replace(/\D/g,'');
 const address=d.dropoff?.address||'';
 const summary='<div class="recipient-summary"><div><span>Recibe</span><b>'+e(d.recipient_name||'—')+'</b></div>'+
 '<div><span>Celular</span><b>'+e(phone||'—')+'</b></div>'+
 '<div><span>Dirección</span><b>'+e(address||'Sin confirmar')+'</b></div>'+
 '<button type="button" class="button outline small" data-act="recipientEditAddress">'+icon('pin',15)+' Cambiar dirección</button></div>';
 const formHead='<div class="recipient-progress" aria-label="Paso '+step+' de 3"><div class="recipient-progress-text"><strong>Paso '+step+' de 3</strong><span>'+
 (step===1?'Tus datos':step===2?'Tu dirección':'Confirmar entrega')+'</span></div>'+
 '<div class="recipient-progress-bars"><i class="'+(step>=1?'done':'')+'"></i><i class="'+(step>=2?'done':'')+'"></i><i class="'+(step>=3?'done':'')+'"></i></div></div>';
 const step1='<h2>¿Quién va a recibir?</h2><p class="recipient-step-intro">Solo necesitamos tu nombre y número de celular.</p>'+
 '<label for="invite-recipient-name">Tu nombre y apellido</label>'+
 '<input id="invite-recipient-name" name="recipient_name" autocomplete="name" maxlength="180" placeholder="Ej. María López" value="'+e(d.recipient_name||'')+'">'+
 '<label for="invite-recipient-phone">Tu número de celular</label>'+
 '<input id="invite-recipient-phone" type="tel" name="recipient_phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="Ej. 300 123 4567" value="'+e(d.recipient_phone||'')+'">'+
 '<button type="button" class="button primary wide recipient-next" data-act="recipientNext">'+icon('chevron',18)+' Siguiente: mi dirección</button>';
 const step2='<h2>¿A dónde llevamos tu pedido?</h2><p class="recipient-step-intro">Lo más fácil es usar la ubicación de tu celular. Si estás en otro lugar, también puedes señalar tu casa en el mapa.</p>'+
 pickerButton('dropoff','Marca el lugar de entrega',d)+
 (d.dropoff?'<div class="recipient-location-ok">'+icon('check',19)+' <span><b>Dirección guardada</b><small>'+e(address)+'</small></span></div>':'')+
 '<p class="recipient-step-tip">Al tocar el botón podrás elegir <b>Usar mi ubicación</b> o <b>Marcar en el mapa</b>.</p>'+
 '<details class="recipient-help"><summary>¿No funciona la ubicación?</summary><p>Si abriste el enlace dentro de WhatsApp, abre el menú y elige Chrome o Safari. También puedes <button type="button" class="recipient-copy-link" data-act="copyRecipientLink">copiar este enlace</button> para abrirlo en tu navegador.</p></details>'+
 '<div class="recipient-step-actions"><button type="button" class="button outline" data-act="recipientBack">Anterior</button>'+
 (d.dropoff?'<button type="button" class="button primary" data-act="recipientNext">Siguiente</button>':'')+'</div>';
 const fee=data.estimateFee(model.zones,d.dropoff_zone,i.delivery_mode);
 const step3='<h2>Revisa antes de enviar</h2><p class="recipient-step-intro">Así sabrá el domiciliario a dónde llevar tu pedido.</p>'+
 summary+
 '<label for="invite-dropoff-zone">¿En qué sector o zona está tu dirección?</label>'+
 '<select id="invite-dropoff-zone" name="dropoff_zone"><option value="">Elige tu zona</option>'+options+'</select>'+
 '<p class="field-help">Si no sabes qué zona elegir, pregunta a la tienda antes de enviar.</p>'+
 '<div class="recipient-fee"><span>Precio del domicilio</span><strong>'+money(fee)+'</strong>'+
 '<small>'+e(zoneEstimateNote(d.dropoff_zone))+'</small></div>'+
 '<label for="invite-delivery-notes">¿Cómo reconocer tu casa? (opcional)</label>'+
 '<textarea id="invite-delivery-notes" name="delivery_notes" maxlength="500" rows="2" placeholder="Ej. Portón negro, segundo piso">'+e(d.delivery_notes||'')+'</textarea>'+
 '<p class="field-help">Al enviar, la tienda recibirá estos datos para crear tu domicilio. No necesitas registrarte.</p>'+
 '<div class="recipient-step-actions"><button type="button" class="button outline" data-act="recipientBack">Anterior</button>'+
 '<button type="button" class="button primary" data-act="completeInvite">'+icon('check',18)+' Enviar mis datos</button></div>';
 return '<div class="recipient-head"><span class="eyebrow">RUTAYA · ENTREGA A DOMICILIO</span><h1>¡Hola! Completa tu entrega</h1>'+
 '<p>Son <b>3 pasos sencillos</b>. No necesitas crear una cuenta.</p></div>'+
 '<div class="recipient-order-summary">'+icon('package',19)+' <span><b>'+e(i.business_name||'Tu tienda')+'</b>'+
 '<small>'+e(i.items_description)+'</small>'+
 '<small>'+(i.paid?'Producto pagado':'Pago del producto al recibir: '+money(i.amount_to_collect))+'</small></span></div>'+
 '<section class="card recipient-form recipient-flow" aria-label="Formulario de entrega">'+formHead+
 (step===1?step1:step===2?step2:step3)+'</section>';
}

function orderSupportButton(o,role){
 if(!model.user||role==='admin')return '';
 if(role==='repartidores'&&o.courier_id!==model.user.id)return '';
 return '<button class="button outline small" data-act="openSupport" data-id="'+e(o.id)+'">'+icon('alert',16)+' Pedir ayuda</button>';
}
function supportOrderModal(){
 const o=model.orders.find(p=>p.id===model.supportOrderId);
 if(!o)return '';
 return modal('Reportar problema del domicilio',
 '<p>Cuenta qué ocurrió. Administración revisará el caso; si es una urgencia de seguridad, contacta directamente los servicios de emergencia.</p>'+
 '<p class="field-help">'+e(o.items_description)+'</p>'+
 '<label for="support-message">Describe el problema</label><textarea id="support-message" rows="4" maxlength="800" placeholder="Ej. La dirección no coincide o no puedo contactar al destinatario."></textarea>',
 '<button class="button outline" data-act="closeSupport">Volver</button>'+
 '<button class="button primary" data-act="submitSupport">Enviar reporte</button>');
}
function deliveryCodeModal(){
 const o=model.orders.find(x=>x.id===model.deliveryOtpOrderId);
 if(!o)return '';
 return modal('Confirmar entrega con código',
 '<p>Solicita a la clienta los <strong>seis números</strong> que aparecen en su enlace de seguimiento. Confirma la entrega únicamente después de entregarle el paquete.</p>'+
 '<label for="delivery-otp">Código de la clienta</label>'+
 '<input id="delivery-otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" pattern="[0-9]{6}">'+
 '<p class="field-help">RutaYa verificará el código y que estés a máximo 200 metros del destino con buena señal GPS.</p>',
 '<button class="button outline" data-act="closeOtp">Volver</button>'+
 '<button class="button primary" data-act="confirmOtp">Confirmar entrega</button>');
}
function payoutSet(o){
 const p=model.payouts.find(x=>x.order_id===o.id);
 return '<div class="finance-payout"><div><b>'+e(o.items_description)+'</b><small>Tarifa domicilio '+money(o.fee)+
 ' · Pago repartidor '+(p?money(p.amount):'sin definir')+(p?.paid_at?' · Pagado':' · Pendiente')+'</small></div>'+
 '<div class="order-actions"><input id="payout-'+e(o.id)+'" type="number" min="0" max="1000000" placeholder="Pago COP" value="'+e(p?.amount??'')+'" '+(p?.paid_at?'disabled':'')+'>'+
 '<button class="button tonal small" data-act="setPayout" data-id="'+e(o.id)+'" '+(p?.paid_at?'disabled':'')+'>Guardar</button>'+
 '<button class="button primary small" data-act="markPayoutPaid" data-id="'+e(o.id)+'" '+(p?.paid_at?'disabled':'')+'>Marcar pagado</button></div></div>';
}
function courierCashPage(){
 const c=model.cash||{};
 return '<div class="pagehead"><h1>Mi caja de domicilios</h1></div>'+
 '<div class="card soft"><h3>Resumen de entregas completadas</h3><div class="stats">'+
 '<div class="stat"><div class="num">'+(c.delivered??0)+'</div><small>Entregas</small></div>'+
 '<div class="stat"><div class="num">'+money(c.gross_delivery_fees??0)+'</div><small>Tarifas brutas</small></div></div>'+
 '<p>Pagos reconocidos por administración: <b>'+money(c.approved_payouts??0)+'</b></p>'+
 '<p>Pagos ya registrados como entregados: <b>'+money(c.paid_payouts??0)+'</b></p>'+
 '<p>Pagos pendientes: <b>'+money(c.unpaid_payouts??0)+'</b></p>'+
 '<p>Dinero de productos por conciliar: <b>'+money(c.cash_products_to_reconcile??0)+'</b></p>'+
 '<p class="field-help">Las tarifas brutas no son tu ganancia neta. Los valores pendientes de producto no son ingresos tuyos. Administración definirá y confirmará cada pago.</p></div>'+
 '<div class="card"><h3>Pagos registrados</h3>'+
 (model.payouts.length?model.payouts.map(p=>'<div class="inline-between payout-row"><span>'+e(String(p.order_id).slice(0,8))+' · '+e(p.paid_at?'Pagado':'Pendiente')+'</span><b>'+money(p.amount)+'</b></div>').join(''):
 '<p class="field-help">Todavía no hay pagos individuales registrados.</p>')+'</div>';
}
function adminStatsPage(){
 const stats=model.stats||{},days=model.statsDays||30;
 return '<div class="pagehead"><h1>Estadísticas y caja</h1></div>'+
 '<div class="admin-order-filter">'+[7,30,90].map(x=>'<button class="button small '+(days===x?'primary':'outline')+'" data-act="statsRange" data-days="'+x+'">'+x+' días</button>').join('')+'</div>'+
 '<div class="stats"><div class="stat"><div class="num">'+(stats.orders??0)+'</div><small>Pedidos</small></div>'+
 '<div class="stat"><div class="num">'+(stats.delivered??0)+'</div><small>Entregados</small></div>'+
 '<div class="stat"><div class="num">'+(stats.cancelled??0)+'</div><small>Cancelados</small></div></div>'+
 '<div class="card"><h3>Movimiento económico</h3><p>Tarifas de domicilios entregados: <b>'+money(stats.fees_delivered??0)+'</b></p>'+
 '<p>Tarifas solicitadas en el período: <b>'+money(stats.fees_requested??0)+'</b></p>'+
 '<p>Productos pendientes de conciliar: <b>'+money(stats.product_cash_to_collect??0)+'</b></p>'+
 '<p>Promedio de duración de entregas: <b>'+(stats.average_delivery_minutes??'—')+' minutos</b></p>'+
 '<p class="field-help">Son montos operativos y no representan utilidades, ingresos recibidos ni dinero ya pagado. Las tarifas base siguen siendo de prueba hasta que las confirmes.</p></div>'+
 '<div class="card"><h3>Pagos a domiciliarios</h3>'+
 '<p>Define cuánto corresponde a cada repartidor y marca pagado únicamente cuando realmente lo hayas liquidado.</p>'+
 (model.orders.filter(o=>o.status==='delivered'&&o.courier_id).slice(0,40).map(payoutSet).join('')||
 '<p class="field-help">Aún no hay entregas con repartidor para liquidar.</p>')+
 '</div>';
}
function adminSupportPage(){
 const cases=model.supportCases||[];
 return '<div class="pagehead"><h1>Ayuda y novedades</h1></div>'+
 '<div class="card soft"><p>Reportes de los negocios, clientes y repartidores. Cada caso pertenece a un pedido y queda registrado. La resolución del caso no cancela el pedido automáticamente.</p></div>'+
 (cases.length?cases.map(c=>'<div class="card"><div class="inline-between"><b>Pedido '+e(String(c.order_id).slice(0,8))+'</b><span class="badge">'+e(c.status==='open'?'Pendiente':'Resuelto')+'</span></div>'+
 '<p>'+e(c.message)+'</p><small>'+e(prettyTime(c.created_at))+'</small>'+
 (c.status==='open'?'<div class="order-actions"><button class="button primary small" data-act="resolveSupport" data-case="'+e(c.id)+'">Marcar solucionado</button></div>':'')+'</div>').join(''):
 empty('Sin reportes por ahora','Cuando alguien pida ayuda, aparecerá aquí.','clipboard'));
}
function verificationControls(c){
 const v=model.verifications.find(x=>x.user_id===c.user_id)||{};
 return '<div class="courier-checks"><b>Revisión para aprobar</b>'+
 '<label><input type="checkbox" id="verify-id-'+e(c.user_id)+'" '+(v.identity_checked?'checked':'')+'> Identidad y documento verificados fuera de RutaYa</label>'+
 '<label><input type="checkbox" id="verify-vehicle-'+e(c.user_id)+'" '+(v.vehicle_checked?'checked':'')+'> Vehículo y licencia revisados, si aplica</label>'+
 '<input type="text" id="verify-notes-'+e(c.user_id)+'" maxlength="400" placeholder="Observaciones internas (sin números de documento)" value="'+e(v.verification_notes||'')+'">'+
 '<button class="button outline small" data-act="verifyCourier" data-user="'+e(c.user_id)+'">Guardar verificaciones</button>'+
 '<p class="field-help">No subas documentos de identidad por este formulario: aún no se ha habilitado un almacenamiento privado específico.</p></div>';
}
function approximateRoute(orders){
 if(!orders.length)return '';
 const first=orders[0];
 const pending=[...orders],sorted=[];
 let last={lat:first.pickup_lat,lng:first.pickup_lng};
 while(pending.length){
  let idx=0,best=Infinity;
  pending.forEach((p,i)=>{
   const d=data.distance(last,{lat:p.dropoff_lat,lng:p.dropoff_lng});
   if(d<best){best=d;idx=i}
  });
  const next=pending.splice(idx,1)[0];sorted.push(next);
  last={lat:next.dropoff_lat,lng:next.dropoff_lng};
 }
 const params=new URLSearchParams({api:'1',origin:first.pickup_lat+','+first.pickup_lng,
 destination:sorted.at(-1).dropoff_lat+','+sorted.at(-1).dropoff_lng,travelmode:'driving'});
 if(sorted.length>1)params.set('waypoints',sorted.slice(0,-1).map(x=>x.dropoff_lat+','+x.dropoff_lng).join('|'));
 return 'https://www.google.com/maps/dir/?'+params.toString();
}
function routedGroups(){
 const grouped=new Map();
 model.orders.filter(o=>o.delivery_mode==='routed'&&o.status==='pending'&&Date.parse(o.dispatch_after)<=Date.now()&&o.business_id).forEach(o=>{
  const key=[o.business_id,o.pickup_address,o.dropoff_zone].join('::');
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(o);
 });
 return [...grouped.values()].filter(g=>g.length>=2).map(g=>g.slice(0,4));
}
function adminRouteGroups(){
 const groups=routedGroups();
 model.routeGroups=groups;
 return '<div class="card"><h3>Enrutados por sector</h3><p>RutaYa propone agrupar entregas pendientes del mismo negocio y zona. El orden de paradas se aproxima por distancia en línea recta; Google Maps calcula las calles al abrirlo.</p>'+
 (groups.length?groups.map((g,i)=>'<div class="route-group"><b>'+e(g[0].dropoff_zone)+' · '+g.length+' entregas</b>'+
 '<p>'+g.map(o=>e(o.dropoff_address)).join(' · ')+'</p>'+
 '<a class="button outline small" target="_blank" rel="noopener noreferrer" href="'+e(approximateRoute(g))+'">'+icon('route',16)+' Abrir recorrido en Google Maps</a>'+
 '<button class="button primary small" data-act="assignGroup" data-index="'+i+'">Asignar juntas</button></div>').join(''):
 '<p class="field-help">No hay grupos de dos o más Enrutados listos para despachar.</p>')+
 '<p class="field-help">La agrupación es una sugerencia operativa, no una optimización garantizada del tráfico ni un tiempo de llegada.</p></div>';
}
function adminFleetPage(){
 const list=model.fleet||[];
 const located=list.filter(c=>c.lat!=null&&c.lng!=null&&c.seen_at);
 const available=list.filter(c=>!c.active_orders).length;
 return '<div class="pagehead"><h1>Mapa de domiciliarios</h1></div>'+
 '<div class="card"><div class="inline-between"><b>'+list.length+' domiciliarios aprobados</b>'+
 '<button class="button outline small" data-act="refreshFleet">'+icon('crosshair',16)+' Actualizar</button></div>'+
 '<button class="button outline small" data-act="copyGpsInstructions">'+icon('copy',16)+' Copiar instrucciones para repartidores</button>'+
 '<div class="fleet-metrics"><span>'+located.length+' con GPS reciente</span><span>'+available+' sin pedido activo</span></div>'+
 '<div id="rutaya-fleet-map" class="fleet-map"></div>'+
 (located.length?'<p class="field-help">Pulsa un marcador para ver el domiciliario. El mapa se actualiza mientras tengas abierta Administración.</p>':
 '<p class="gps-warning">No hay posiciones GPS recientes. Los repartidores deben abrir RutaYa Repartidores, activar su GPS y, si están disponibles, autorizar «Compartir con Administración».</p>')+
 '<p class="field-help">Las ubicaciones desaparecen del mapa cuando pasan más de dos minutos sin señal. No se puede activar a distancia el GPS de otro celular.</p></div>'+
 (list.length?list.map(c=>{
 const hasGps=c.lat!=null&&c.lng!=null&&c.seen_at!=null;
 const state=c.active_orders>0?'En reparto':hasGps?'Disponible con GPS':c.sharing_enabled?'Autorizó compartir, sin señal reciente':'Disponible sin GPS';
 return '<div class="card fleet-courier"><div class="inline-between"><b>'+e(c.name||'Domiciliario')+'</b>'+
 '<span class="gps-pill '+(hasGps?'gps-live':'gps-off')+'">'+e(state)+'</span></div>'+
 '<p>'+c.active_orders+' servicios activos · '+e(hasGps?'GPS actualizado '+gpsElapsed(c.seen_at):c.sharing_enabled?'Activa GPS en su celular para verlo aquí':'Sin ubicación compartida')+'</p>'+
 (hasGps?'<a class="button outline small" target="_blank" rel="noopener noreferrer" href="'+e(navigationUrl({lat:c.lat,lng:c.lng}))+'">'+icon('pin',16)+' Ver última posición en Google Maps</a>':'')+
 '</div>'
 }).join(''):empty('Todavía no hay domiciliarios aprobados','Aprueba al primero en la sección Equipo para mostrarlo aquí.','user'))+
 adminRouteGroups();
}

function routeGroupModal(){
 const group=model.routeGroups[model.routeGroupIndex];
 if(!group)return '';
 const choices=model.couriers.filter(c=>c.approved);
 return modal('Asignar Enrutados juntos',
 '<p>'+group.length+' pedidos del sector '+e(group[0].dropoff_zone)+'. Deben estar listos físicamente en el mismo negocio.</p>'+
 '<label for="route-driver">Domiciliario aprobado</label><select id="route-driver">'+
 '<option value="">Selecciona un repartidor</option>'+
 choices.map(c=>'<option value="'+e(c.user_id)+'">'+e(c.display_name||c.email||'Domiciliario')+'</option>').join('')+'</select>'+
 '<label for="route-reason">Nota de asignación</label><textarea id="route-reason" rows="2" maxlength="180" placeholder="Ej. Ruta enrutada de la tarde, paquetes preparados en Bella Shop."></textarea>'+
 '<p class="field-help">El sistema asignará los '+group.length+' pedidos juntos, siempre que sigan disponibles y el repartidor tenga capacidad. Google Maps calculará las calles y el orden de paradas es una sugerencia.</p>',
 '<button class="button outline" data-act="closeGroup">Volver</button>'+
 '<button class="button primary" data-act="confirmGroup">Asignar ruta</button>');
}


function guestSupportModal(){
 return modal('Avisar de un problema',
 '<p>Describe qué está pasando con tu domicilio. RutaYa enviará el reporte a Administración.</p>'+
 '<label for="guest-support-message">¿Qué ocurrió?</label>'+
 '<textarea id="guest-support-message" rows="4" maxlength="800" placeholder="Ej. El repartidor no encuentra la dirección."></textarea>',
 '<button class="button outline" data-act="closeGuestSupport">Volver</button>'+
 '<button class="button primary" data-act="submitGuestSupport">Enviar reporte</button>');
}
function recipientFeedback(o){
 return '<div class="card recipient-feedback"><h3>¿Necesitas ayuda?</h3><p class="field-help">Puedes reportar un problema sin iniciar sesión. Guarda tu enlace y no lo compartas con desconocidos.</p>'+
 '<button class="button outline small" data-act="guestSupport">'+icon('alert',17)+' Reportar problema</button></div>'+
 (o.status==='delivered'?'<div class="card recipient-feedback"><h3>Califica la entrega</h3>'+
 (o.rated?'<p>Gracias, ya registramos tu calificación.</p>':
 '<p>¿Cómo estuvo tu experiencia?</p><label for="recipient-stars">Calificación</label>'+
 '<select id="recipient-stars"><option value="">Selecciona estrellas</option>'+
 [1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+' de 5 estrellas</option>').join('')+'</select>'+
 '<label for="recipient-review">Comentario opcional</label><textarea id="recipient-review" rows="2" maxlength="350" placeholder="¿Cómo llegó tu pedido?"></textarea>'+
 '<button class="button primary small" data-act="submitRating">'+icon('check',16)+' Enviar calificación</button>')+'</div>':'');
}

function isAdmin(){return Boolean(model.profile?.is_admin||model.profile?.role==='admin')}
function inactiveMinutes(o){return Math.max(0,Math.floor((Date.now()-new Date(o.updated_at||o.created_at).getTime())/60000))}
function stalled(o){
 if(['delivered','cancelled'].includes(o.status))return false;
 if(o.status==='pending'&&o.dispatch_after&&Date.parse(o.dispatch_after)>Date.now())return false;
 const mins={pending:30,accepted:25,at_pickup:20,picked_up:45,at_dropoff:20}[o.status]??30;
 return inactiveMinutes(o)>=mins;
}
function stalledNote(o){
 if(!stalled(o))return '';
 return '<div class="stall-note">'+icon('alert',17)+' <span>Sin cambios hace '+inactiveMinutes(o)+' min. Revisa el servicio con la otra persona. No se cancelará automáticamente.</span></div>';
}
function orderManageButtons(o,role){
 const buttons=[];
 const canCancel=!['delivered','cancelled'].includes(o.status)&&(
  isAdmin()&&role==='admin'
  ||role==='negocios'&&['pending','accepted','at_pickup'].includes(o.status)
  ||role==='cliente'&&o.status==='pending');
 if(canCancel)buttons.push('<button class="button outline small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="cancel">'+icon('close',16)+' Cancelar</button>');
 if(role==='repartidores'&&['accepted','at_pickup'].includes(o.status)&&o.courier_id===model.user?.id)
  buttons.push('<button class="button outline small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="release">'+icon('arrowLeft',16)+' Liberar servicio</button>');
 if(role==='admin'&&isAdmin()&&['pending','accepted','at_pickup','picked_up','at_dropoff'].includes(o.status))
  buttons.push('<button class="button primary small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="assign">'+icon('user',16)+' '+(o.courier_id?'Cambiar repartidor':'Asignar repartidor')+'</button>');
 if(role==='admin'&&isAdmin()&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status))
  buttons.push('<button class="button tonal small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="adminRelease">'+icon('route',16)+' Liberar pedido</button>');
 return buttons.join('');
}
function manageOrderModal(){
 const o=model.orders.find(x=>x.id===model.manageOrderId);
 if(!o)return '';
 const operation=model.manageAction;
 const isCancel=operation==='cancel',isRelease=operation==='release',isAssign=operation==='assign',isAdminRelease=operation==='adminRelease';
 const title=isCancel?'Cancelar domicilio':isRelease?'Liberar servicio':isAdminRelease?'Liberar pedido desde administración':isAssign?'Asignar o cambiar repartidor':'Gestionar pedido';
 const afterPickup=isAdmin()&&['picked_up','at_dropoff'].includes(o.status);
 const description=isCancel?(afterPickup?'Este pedido YA FUE RECOGIDO. La cancelación detendrá el servicio en RutaYa, pero NO devuelve el paquete, no reembolsa dinero ni avisa automáticamente al domiciliario. Contacta al repartidor y a la clienta para acordar la devolución.':'El pedido pasará a cancelado y ya no se podrá aceptar. Esta acción queda registrada en el historial.'):
  isRelease?'El domicilio regresará a la lista de disponibles para que otro repartidor pueda tomarlo.':isAdminRelease?(afterPickup?'Primero recupera físicamente el paquete. Una vez recuperado podrás liberar el pedido para que otro repartidor lo tome.':'El pedido volverá a disponibles, sin repartidor asignado.'):isAssign?(afterPickup?'Solo puedes cambiarlo si el NUEVO repartidor ya recibió físicamente el paquete. El pedido conservará la etapa de recogido.':'Selecciona un domiciliario aprobado. El cambio se registrará en el historial.'):'Gestión manual de pedido';
 return modal(title,'<p>'+description+'</p><p><strong>'+e(o.items_description)+'</strong></p>'+(isAssign?'<label for="ry-manage-courier">Domiciliario aprobado</label><select id="ry-manage-courier"><option value="">Selecciona un repartidor</option>'+model.couriers.filter(x=>x.approved).map(c=>'<option value="'+e(c.user_id)+'">'+e(c.display_name||c.email||'Domiciliario')+'</option>').join('')+'</select>':'')+(afterPickup&&(isAssign||isAdminRelease)?'<label class="admin-custody"><input type="checkbox" id="ry-custody-confirm"> '+(isAdminRelease?'Confirmo que recuperé físicamente el paquete antes de liberarlo.':'Confirmo que el nuevo repartidor recibió físicamente el paquete.')+'</label>':'')+'<label for="ry-manage-reason">Motivo del cambio</label><textarea id="ry-manage-reason" rows="3" maxlength="200" placeholder="Ej. El cliente cambió de planes / el domiciliario no puede continuar" required></textarea><p class="field-help">Este cambio quedará registrado. Confirma primero con las personas involucradas.</p>',
 '<button class="button outline" data-act="closeManage">Volver</button><button class="button '+(isCancel?'danger':'primary')+'" data-act="confirmManage" data-id="'+e(o.id)+'">'+icon('check',17)+' '+(afterPickup?'Cancelar pedido recogido':isCancel?'Cancelar pedido':'Confirmar')+'</button>');
}
function adminHistoryPanel(o){
 const history=model.adminHistoryItems||[];
 return '<div class="admin-history"><div class="inline-between"><strong>Historial del domicilio</strong>'+
 '<button class="button ghost small" data-act="closeAdminHistory">'+icon('close',16)+' Cerrar</button></div>'+
 (history.length?'<ol>'+history.map(h=>'<li><b>'+e(prettyTime(h.occurred_at))+'</b> · '+e(h.event||'Movimiento')+'</li>').join('')+'</ol>':
 '<p class="field-help">Aún no hay movimientos registrados.</p>')+'</div>';
}
function adminOrderCard(o){
 const active=!['delivered','cancelled'].includes(o.status);
 return '<article class="order">'+
 '<div class="inline-between"><strong>'+e(o.items_description)+'</strong><span class="badge '+(o.status==='delivered'?'green':'')+'">'+e(orderStatusText(o))+'</span></div>'+
 '<div class="admin-order-meta"><span>'+e(o.source==='business'?'Negocio':'Cliente')+'</span><span>'+e(modeName(o.delivery_mode))+'</span><span>'+e(prettyTime(o.created_at))+'</span></div>'+
 '<p>'+e(o.pickup_address)+' → '+e(o.dropoff_address)+'</p>'+
 stalledNote(o)+
 (o.recipient_phone?'<p class="field-help">Contacto destinatario: <a href="tel:'+e(String(o.recipient_phone).replace(/[^\d+]/g,''))+'">'+e(o.recipient_phone)+'</a></p>':'')+
 '<div class="field-line space"><input id="fee-'+e(o.id)+'" type="number" min="0" max="1000000" value="'+e(o.fee??'')+'" placeholder="Tarifa COP" '+(active?'':'disabled')+'><button class="button tonal small" data-act="setFee" data-id="'+e(o.id)+'" '+(active?'':'disabled title="Solo activos"')+'>Guardar tarifa</button></div>'+
 '<div class="order-actions">'+orderManageButtons(o,'admin')+
 '<a class="button outline small" target="_blank" rel="noopener noreferrer" href="'+e(trackingLink(o))+'">'+icon('navigation',16)+' Ver GPS / seguimiento</a>'+
 '<button class="button outline small" data-act="copyTrack" data-token="'+e(o.tracking_token)+'">'+icon('copy',16)+' Copiar enlace clienta</button>'+
 '<button class="button outline small" data-act="adminHistory" data-id="'+e(o.id)+'">'+icon('clock',16)+' Historial</button></div>'+
 (model.adminHistoryId===o.id?adminHistoryPanel(o):'')+'</article>';
}

function notify(message){document.querySelector('.toast')?.remove();const n=document.createElement('div');n.className='toast';n.setAttribute('role','status');n.textContent=message;document.body.append(n);clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.remove(),4600)}
function hideBtn(v,label,ico){return `<button class="button ${v?'primary':'outline'}" data-act="${e(label)}">${icon(ico,17)} ${e(label)}</button>`}
function modeBanner(){return !data.isLive?`<div class="notice">${icon('info',17)} <span><strong>Vista de prueba:</strong> tus pedidos solo aparecen en este navegador. Los enlaces de seguimiento no funcionan en otro celular hasta conectar la base de datos.</span></div>`:''}
function logo(){return `<a class="logo" href="${url('')}" aria-label="RutaYa inicio"><span class="logo-symbol">${icon('logo',25)}</span><span>Ruta<b>Ya</b></span></a>`}
function header(){const heading={cliente:'Tu ciudad en movimiento',negocios:'Panel de negocios',repartidores:'RutaYa Repartidor',seguimiento:'Seguimiento de entrega',admin:'Administración'}[page];return `<header class="topbar"><div class="toprow">${logo()}<div class="top-actions"><div class="city">${icon('pin',15)} Popayán <span class="desktop-link">· Cauca</span></div>${page==='cliente'?`<button class="iconbtn" data-act="nav" data-view="cuenta" title="Mi cuenta">${icon('user')}</button>`:''}${page==='repartidores'?`<button class="iconbtn" data-act="courierGps" title="Activar ubicación">${icon('crosshair')}</button>`:''}</div></div></header>`}
function footer(){return `<footer class="footer">RutaYa · Hecho para conectar Popayán <div style="margin-top:8px"><a href="${url('')}">Clientes</a><a href="${url('negocios/')}">Negocios</a><a href="${url('repartidores/')}">Domiciliarios</a><a href="${url('admin/')}">Administración</a></div><small>Las tarifas y condiciones deben confirmarse antes de iniciar el servicio.</small></footer>`}
function bottomNav(){const items=page==='cliente'?[['inicio','home','Inicio'],['pedidos','clipboard','Mis pedidos'],['cuenta','user','Cuenta']]:page==='negocios'?[['inicio','home','Panel'],['pedidos','clipboard','Pedidos'],['cuenta','shop','Mi tienda']]:page==='repartidores'?[['inicio','home','Inicio'],['pedidos','route','Mis entregas'],['cuenta','user','Mi perfil']]:page==='admin'?[['inicio','clipboard','Pedidos'],['mapa','pin','Mapa'],['reportes','card','Caja'],['domiciliarios','user','Equipo'],['cuenta','settings','Ajustes']]:[];return items.length?`<nav class="nav-bottom" aria-label="Navegación principal"><div class="nav-inner">${items.map(([v,i,label])=>`<button data-act="nav" data-view="${v}" class="${model.view===v?'active':''}">${icon(i,21)}${label}</button>`).join('')}</div></nav>`:''}

function friendlyBusinessOrderCard(o){
 const done=['cancelled','delivered'].includes(o.status);
 const token=e(o.tracking_token||'');
 return '<article class="card ry-friendly-order" data-order="'+e(o.id)+'">'+
 '<div class="inline-between"><span class="badge '+(o.status==='delivered'?'green':o.status==='cancelled'?'red':'gray')+'">'+
 e(orderStatusText(o))+'</span><small>'+e(prettyTime(o.created_at))+'</small></div>'+
 '<h3>'+e(o.recipient_name||'Entrega a clienta')+'</h3>'+
 '<p class="ry-friendly-destination">'+icon('pin',16)+' '+e(o.dropoff_address||'Dirección por confirmar')+'</p>'+
 '<p class="field-help">'+e(o.items_description||'Pedido')+'</p>'+
 '<div class="ry-primary-order-actions">'+
 '<a class="button primary" href="'+e(whatsappTrackingUrl(o))+'" target="_blank" rel="noopener noreferrer">'+
 icon('phone',17)+' Enviar seguimiento por WhatsApp</a>'+
 (!done?'<button class="button tonal" data-act="trackBusiness" data-token="'+token+'">'+icon('navigation',17)+' Ver cómo va el domicilio</button>':'')+
 '</div>'+
 (model.businessTrackingToken===o.tracking_token?businessTrackingPanel(o):'')+
 '<details class="ry-more-actions" data-persist="business-'+e(o.id)+'"><summary>Detalles y otras opciones</summary>'+
 '<div class="ry-extra-detail"><p><b>Recoger en:</b> '+e(o.pickup_address||'Negocio')+'</p>'+
 '<p><b>Modalidad:</b> '+e(modeName(o.delivery_mode||'normal'))+' · <b>Tarifa:</b> '+money(o.fee)+'</p>'+
 (Number(o.amount_to_collect)>0?'<p><b>Pago del producto pendiente:</b> '+money(o.amount_to_collect)+'</p>':'')+
 '<div class="order-actions"><button class="button outline small" data-act="copyTrack" data-token="'+token+'">'+icon('copy',15)+' Copiar enlace</button>'+
 orderManageButtons(o,'negocios')+orderSupportButton(o,'negocios')+'</div></div></details></article>';
}

function newOrderCard(order,role){if(role==='negocios')return friendlyBusinessOrderCard(order);let token=order.tracking_token;let active=!['delivered','cancelled'].includes(order.status);let statusClass=order.status==='delivered'?'green':order.status==='cancelled'?'red':'gray';let shop=order.pickup_name||order.shop_name||'Punto de recogida';let me=role==='repartidores';return `<article class="order" data-order="${e(order.id)}"><div class="order-head"><span class="badge ${statusClass}"><span class="status-dot"></span>${e(orderStatusText(order))}</span><small>${prettyTime(order.created_at)}</small></div><h3>${e(serviceName(order.service))}</h3>${modeInfo(order)}<p style="font-size:13px;margin:4px 0">${e(order.items_description)}</p><div class="route-line"><span class="circle">${icon('shop',14)}</span><div class="route-detail"><b>Recoger ${order.pickup_name?'en '+e(order.pickup_name):''}</b><small>${e(order.pickup_address)}</small></div></div><div class="route-line drop"><span class="circle">${icon('pin',15)}</span><div class="route-detail"><b>Entregar</b><small>${e(order.dropoff_address)}</small></div></div><div class="inline-between space"><div><small>Tarifa de domicilio</small><div style="font-size:17px;font-weight:900;color:var(--purple)">${money(order.fee)}</div></div>${order.amount_to_collect>0?`<div><small>Pendiente por producto</small><div style="font-weight:900">${money(order.amount_to_collect)}</div></div>`:''}</div>${stalledNote(order)}<div class="order-actions">${me?courierActions(order):role==='negocios'?businessShareActions(order):`<a class="button tonal small" href="${url('seguimiento/?token='+encodeURIComponent(token))}">${icon('route',17)} Ver seguimiento</a><button class="button outline small" data-act="copyTrack" data-token="${e(token)}">${icon('copy',17)} Compartir</button>`}${me?'':orderManageButtons(order,role)+orderSupportButton(order,role)}</div>${me?courierMapPanel(order):''}${role==='negocios'&&model.businessTrackingToken===token?businessTrackingPanel(order):''}</article>`}
function courierMapPanel(o){
 if(model.courierMapOrderId!==o.id)return '';
 const pickup=model.courierMapStage!=='dropoff';
 const place=pickup?{lat:o.pickup_lat,lng:o.pickup_lng,address:o.pickup_address}:{lat:o.dropoff_lat,lng:o.dropoff_lng,address:o.dropoff_address};
 const title=pickup?'Punto de recogida':'Dirección del cliente';
 return '<section class="courier-map-panel"><div class="inline-between"><h4>'+e(title)+'</h4><button class="iconbtn" data-act="closeCourierMap" title="Cerrar mapa" aria-label="Cerrar mapa">'+icon('close',18)+'</button></div>'+
 '<p>'+e(place.address||'Dirección del pedido')+'</p>'+
 '<div class="map-preview"><iframe loading="lazy" title="'+e(title)+' en el mapa" referrerpolicy="no-referrer-when-downgrade" src="'+e(googleEmbed(place))+'"></iframe></div>'+
 '<div class="order-actions"><a class="button primary" target="_blank" rel="noopener" href="'+e(navigationUrl(place))+'">'+icon('navigation',18)+' Iniciar ruta en Google Maps</a></div>'+
 '<small>El mapa muestra el destino. Google Maps calculará la ruta por calles desde tu ubicación al abrirlo.</small></section>';
}
function courierActions(o){
 const pending=o.status==='pending';
 const done=['delivered','cancelled'].includes(o.status);
 const pickup=['pending','accepted','at_pickup'].includes(o.status);
 const next={accepted:['at_pickup','Ya llegué al negocio'],at_pickup:['picked_up','Ya recogí el pedido'],
  picked_up:['at_dropoff','Ya llegué a la dirección'],at_dropoff:['delivered','Entregar con código']}[o.status];
 const pickupPlace={lat:o.pickup_lat,lng:o.pickup_lng,address:o.pickup_address};
 const dropPlace={lat:o.dropoff_lat,lng:o.dropoff_lng,address:o.dropoff_address};
 const link=(place,label,primary)=>'<a class="button '+(primary?'primary':'outline')+' small courier-nav-btn" href="'+
  e(navigationUrl(place))+'" target="_blank" rel="noopener noreferrer">'+icon('navigation',18)+' '+label+'</a>';
 const preview=(stage)=>'<button class="button outline small" data-act="courierMap" data-id="'+e(o.id)+'" data-stage="'+stage+'">'+icon('pin',17)+' Ver destino en el mapa</button>';
 if(done)return '';
 if(pending)return '<button class="button primary wide" data-act="claim" data-id="'+e(o.id)+'">'+icon('check',18)+' Aceptar este domicilio</button>'+
  '<details class="ry-more-actions" data-persist="courier-'+e(o.id)+'"><summary>Ver las rutas antes de aceptar</summary>'+
  '<div class="order-actions">'+link(pickupPlace,'Ir a recoger',false)+link(dropPlace,'Ver dirección de entrega',false)+'</div></details>';
 return '<div class="ry-courier-next"><span class="ry-next-label">QUÉ HACER AHORA</span><strong>'+e(
  o.status==='accepted'?'Ve al negocio y recoge el pedido':o.status==='at_pickup'?'Recoge el paquete en el negocio':
  o.status==='picked_up'?'Lleva el pedido al cliente':'Entrega el paquete y pide el código'
 )+'</strong>'+
 '<div class="ry-next-actions">'+link(pickup?pickupPlace:dropPlace,pickup?'Cómo llegar al negocio':'Cómo llegar al cliente',true)+
 (next?'<button class="button tonal" data-act="'+(next[0]==='delivered'?'deliveryOtp':'progress')+
 '" data-id="'+e(o.id)+'" data-next="'+next[0]+'">'+icon('check',17)+' '+next[1]+'</button>':'')+'</div></div>'+
 '<details class="ry-more-actions" data-persist="courier-'+e(o.id)+'"><summary>Otras rutas y opciones</summary>'+
 '<div class="order-actions">'+link(pickupPlace,'Ver ruta al negocio',false)+link(dropPlace,'Ver ruta al cliente',false)+
 preview(pickup?'pickup':'dropoff')+orderManageButtons(o,'repartidores')+orderSupportButton(o,'repartidores')+'</div></details>';
}
function empty(heading,desc,ico='clipboard'){return `<div class="empty">${icon(ico,31)}<b>${e(heading)}</b><small>${e(desc)}</small></div>`}
function clientHome(){return `<div class="hero"><span class="eyebrow">ENTREGAS EN POPAYÁN</span><h1>Lo que necesitas, <br> hasta donde estés.</h1><p>Una compra, un encargo o un paquete. Elige el servicio y te ayudamos a moverlo.</p><div class="illustration">${icon('logo',155)}</div></div><section class="spaced"><div class="section-title"><h2>¿Qué hacemos hoy?</h2></div><div class="services"><button class="service" data-act="service" data-service="shop"><span class="ico-wrap">${icon('bag',27)}</span><b>Comprar</b><small>Encarga productos de cualquier tienda</small></button><button class="service" data-act="service" data-service="pickup"><span class="ico-wrap">${icon('receipt',27)}</span><b>Recoger</b><small>Traemos tu compra ya preparada</small></button><button class="service" data-act="service" data-service="parcel"><span class="ico-wrap">${icon('box',27)}</span><b>Enviar</b><small>Envía un paquete de un punto a otro</small></button></div></section><section class="spaced"><div class="section-title"><h2>Tus pedidos</h2><button class="button ghost small" data-act="nav" data-view="pedidos">Ver todos ${icon('chevron',15)}</button></div>${model.orders.filter(o=>o.source==='customer').length?model.orders.filter(o=>o.source==='customer').slice(0,2).map(o=>newOrderCard(o,'cliente')).join(''):empty('Aquí aparecerán tus pedidos','Solicita tu primer servicio para empezar.','box')}</section><div class="card soft" style="margin-top:15px"><div class="inline">${icon('shield',25)} <h3 style="margin:0">Tu pedido, paso a paso</h3></div><p>Desde el momento en que el domiciliario acepta hasta que confirma la entrega. Comparte el enlace de seguimiento cuando el servicio esté conectado.</p></div>`}
function clientOrders(){let orders=model.orders.filter(x=>x.source==='customer');return `<div class="pagehead"><h1>Mis pedidos</h1></div>${orders.length?orders.map(x=>newOrderCard(x,'cliente')).join(''):empty('No tienes pedidos','Puedes pedir una compra, una recogida o un envío.')}<button class="button primary wide" data-act="service" data-service="shop">${icon('bag')} Solicitar servicio</button>`}
function accountView(){return `<div class="pagehead"><h1>Tu cuenta</h1></div><div class="card"><div class="auth-label">${icon('shield',20)} <strong>${data.isLive?(model.user?'Sesión iniciada':'Acceso a tu cuenta'):'Modo demostración'}</strong></div><p>${model.user?.email&&data.isLive?e(model.user.email):'Inicia sesión para consultar tus pedidos desde cualquier celular.'}</p>${data.isLive?(model.user?`<div class="account-actions"><button data-act="showChangePassword" class="button outline">${icon('settings',17)} Cambiar contraseña</button><button data-act="signout" class="button outline">${icon('logout',17)} Cerrar sesión</button></div>`:`<button data-act="openAuth" class="button primary">${icon('user',17)} Iniciar sesión o registrarme</button>`):`<p>La aplicación está lista para conectar autenticación y pedidos entre celulares mediante Supabase.</p>`}</div><div class="card"><h3>Otras formas de usar RutaYa</h3><div class="mini-tabs"><a href="${url('negocios/')}">${icon('shop',16)} Soy negocio</a><a href="${url('repartidores/')}">${icon('truck',16)} Soy domiciliario</a></div>${model.profile?.is_admin?`<a class="button outline wide space" href="${url('admin/')}">${icon('settings',17)} Administrar RutaYa y domiciliarios</a>`:''}</div>${model.user&&data.isLive?'<div class="card"><h3>Avisos de tus pedidos</h3><p>Te avisamos dentro de RutaYa cuando cambie un pedido. Si el navegador lo permite, puedes recibir avisos mientras la página permanezca abierta.</p><button class="button outline" data-act="enableAlerts">'+icon('info',17)+' Activar avisos del navegador</button></div>':''}`}
function storeCard(){const s=model.store;return `<div class="card"><div class="inline-between"><div><span class="badge">${icon('shop',15)} Comercios</span><h2 style="margin-top:10px">${e(s?.name||'Configura tu negocio')}</h2><p>${e(s?.address||'Registra el punto exacto de recogida para que tus clientes te encuentren por nombre.')}</p></div><span style="color:var(--purple)">${icon('shop',32)}</span></div><div class="inline-between" style="margin-top:12px"><span class="badge ${s?.lat!=null?'green':'red'}">${s?.lat!=null?'Ubicación guardada':'Falta ubicación GPS'}</span><button class="button tonal small" data-act="editStore">${icon('settings',15)} Configurar tienda</button></div></div>`}
function businessHome(){
 const orders=model.orders.filter(o=>o.source==='business');
 const active=orders.filter(o=>!['delivered','cancelled'].includes(o.status));
 const done=orders.filter(o=>['delivered','cancelled'].includes(o.status));
 const configured=model.store?.lat!=null&&model.store?.lng!=null;
 return '<div class="pagehead ry-simple-title"><span class="eyebrow">RUTAYA PARA NEGOCIOS</span><h1>¿Qué necesitas hacer hoy?</h1>'+
 '<p>Elige una opción para enviar un pedido. No necesitas llenar todo de una vez.</p></div>'+
 (!configured?'<div class="ry-setup-notice">'+icon('pin',20)+' <div><b>Primero registra dónde queda tu tienda</b>'+
 '<p>Solo necesitas hacerlo una vez.</p><button class="button primary" data-act="editStore">Registrar mi negocio</button></div></div>':'')+
 inviteShareCard()+
 '<div class="ry-action-grid"><div class="ry-action-tile primary-tile">'+icon('phone',25)+
 '<h2>Que la clienta ponga su dirección</h2><p>Envía un enlace por WhatsApp. Ella escribe sus datos y confirma su casa.</p>'+
 '<button class="button primary wide" data-act="inviteForm" '+(configured?'':'disabled')+'>Crear enlace para la clienta</button></div>'+
 '<div class="ry-action-tile">'+icon('truck',25)+
 '<h2>Yo tengo los datos de entrega</h2><p>Escribe tú la dirección y solicita el domicilio directamente.</p>'+
 '<button class="button outline wide" data-act="businessForm" '+(configured?'':'disabled')+'>Crear domicilio</button></div></div>'+
 '<div class="section-title spaced"><h2>Pedidos en curso ('+active.length+')</h2>'+
 '<button class="button ghost small" data-act="nav" data-view="pedidos">Ver todos '+icon('chevron',15)+'</button></div>'+
 (active.length?active.slice(0,3).map(friendlyBusinessOrderCard).join(''):
 empty('Todo al día','Cuando tengas un domicilio activo, aparecerá aquí.'))+
 '<details class="ry-more-section" data-persist="business-links"><summary>Enlaces enviados y pendientes ('+
 (model.invites||[]).filter(i=>invitationStatus(i)==='Esperando clienta').length+')</summary>'+
 businessInvitations()+'</details>'+
 '<details class="ry-more-section" data-persist="business-summary"><summary>Resumen de mi negocio</summary>'+
 '<div class="stats"><div class="stat"><div class="num">'+orders.length+'</div><small>Pedidos</small></div>'+
 '<div class="stat"><div class="num">'+done.filter(o=>o.status==='delivered').length+'</div><small>Entregados</small></div>'+
 '</div>'+storeCard()+
 (model.profile?.is_admin?'<a class="button outline small" href="'+e(url('admin/'))+'">Abrir Administración</a>':'')+
 '</details>';
}
function businessOrders(){
 const orders=model.orders.filter(o=>o.source==='business');
 const active=orders.filter(o=>!['delivered','cancelled'].includes(o.status));
 const done=orders.filter(o=>['delivered','cancelled'].includes(o.status));
 return '<div class="pagehead ry-simple-title"><h1>Mis domicilios</h1><p>Aquí puedes consultar cada entrega y compartir su seguimiento.</p></div>'+
 '<button class="button primary wide ry-top-create" data-act="inviteForm">'+icon('phone',17)+' Crear enlace para una clienta</button>'+
 '<div class="section-title spaced"><h2>En curso ('+active.length+')</h2></div>'+
 (active.length?active.map(friendlyBusinessOrderCard).join(''):empty('Sin domicilios en curso','Cuando solicites uno, aparecerá aquí.'))+
 '<details class="ry-more-section" data-persist="business-finished"><summary>Historial ('+done.length+')</summary>'+
 (done.length?done.map(friendlyBusinessOrderCard).join(''):'<p class="field-help">Todavía no hay entregas finalizadas.</p>')+
 '</details>'+
 '<details class="ry-more-section" data-persist="business-other-links"><summary>Enlaces de clientas</summary>'+businessInvitations()+'</details>';
}
function courierGpsQuick(){
 const running=model.gpsWatch!=null;
 const active=model.orders.some(o=>o.courier_id===model.user?.id&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
 const transmitted=running&&(active||model.shareAdminLocation)&&model.gpsLastSentAt;
 return '<section class="card ry-gps-quick"><div class="ry-gps-quick-info">'+
 '<div class="ry-gps-icon">'+icon('crosshair',20)+'</div><div><b>'+(!running?'GPS apagado':transmitted?'GPS compartiendo ubicación':'GPS encendido')+'</b>'+
 '<p>'+(!running?'Enciéndelo antes de comenzar a repartir.':
 transmitted?'Ubicación enviada '+gpsElapsed(model.gpsLastSentAt):
 'Está listo. Si aceptas un pedido, comenzará a compartir la ubicación.')+'</p></div></div>'+
 '<div class="ry-gps-quick-actions">'+
 '<button class="button '+(running?'outline':'primary')+' small" data-act="'+(running?'stopCourierGps':'courierGps')+'">'+
 icon('crosshair',16)+' '+(running?'Detener GPS':'Activar GPS')+'</button>'+
 '<button class="button ghost small" data-act="nav" data-view="cuenta">Opciones de GPS</button></div>'+
 (model.gpsError?'<p class="gps-warning">'+e(model.gpsError)+'</p>':'')+'</section>';
}
function courierHome(){
 const own=model.orders.filter(o=>o.courier_id===model.user?.id&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
 const available=model.orders.filter(o=>o.status==='pending').sort((a,b)=>
  ({urgent:0,normal:1,routed:2}[a.delivery_mode||'normal']??1)-({urgent:0,normal:1,routed:2}[b.delivery_mode||'normal']??1)||
  new Date(a.created_at)-new Date(b.created_at));
 return '<div class="pagehead ry-simple-title"><span class="eyebrow">RUTAYA REPARTIDOR</span>'+
 '<h1>'+ (own.length?'Tienes '+own.length+' entrega'+(own.length===1?'':'s')+' en curso':'¿Listo para repartir?')+'</h1>'+
 '<p>'+ (own.length?'Sigue el siguiente paso de cada domicilio.':
 'Activa tu GPS y elige un domicilio disponible.')+'</p></div>'+
 courierGpsQuick()+
 (own.length?'<div class="section-title spaced"><h2>Qué debes entregar ahora</h2></div>'+
 own.slice(0,3).map(o=>newOrderCard(o,'repartidores')).join('')+
 (own.length>3?'<button class="button outline wide" data-act="nav" data-view="pedidos">Ver mis otras entregas</button>':''):'')+
 '<div class="section-title spaced"><h2>Domicilios disponibles ('+available.length+')</h2>'+
 (own.length?'<button class="button ghost small" data-act="nav" data-view="pedidos">Mis entregas</button>':'')+'</div>'+
 (available.length?available.slice(0,8).map(o=>newOrderCard(o,'repartidores')).join(''):
 empty('No hay nuevos domicilios','Cuando aparezca uno, podrás aceptarlo aquí.','clipboard'))+
 (available.length>8?'<p class="field-help">Mostrando los primeros ocho domicilios disponibles.</p>':'');
}
function courierOrders(){
 const orders=model.orders.filter(o=>o.courier_id===model.user?.id);
 const active=orders.filter(o=>['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
 const done=orders.filter(o=>['cancelled','delivered'].includes(o.status));
 return '<div class="pagehead ry-simple-title"><h1>Mis entregas</h1>'+
 '<p>Entra a cada domicilio y sigue el botón que dice qué hacer ahora.</p></div>'+
 courierGpsQuick()+
 (active.length>1?'<div class="card ry-multi-route"><b>¿Llevas varios pedidos?</b><p>Abre todas las paradas en Google Maps para planear la ruta.</p>'+
 '<a class="button outline small" href="'+e(approximateRoute(active.slice(0,5)))+'" target="_blank" rel="noopener noreferrer">'+
 icon('route',17)+' Ver mi recorrido</a></div>':'')+
 '<div class="section-title spaced"><h2>En curso ('+active.length+')</h2></div>'+
 (active.length?active.map(o=>newOrderCard(o,'repartidores')).join(''):
 empty('Sin entregas activas','Puedes aceptar un nuevo domicilio en Inicio.'))+
 '<details class="ry-more-section" data-persist="courier-history"><summary>Entregas finalizadas ('+done.length+')</summary>'+
 (done.length?done.slice(0,12).map(o=>newOrderCard(o,'repartidores')).join(''):
 '<p class="field-help">Aquí aparecerán tus entregas anteriores.</p>')+
 '</details>';
}
function courierAccount(){
 return '<div class="pagehead ry-simple-title"><h1>Mi perfil</h1><p>Configura el GPS, tus datos y consulta tus pagos.</p></div>'+
 '<button class="button outline wide ry-top-create" data-act="nav" data-view="caja">'+icon('card',17)+' Ver mi caja y ganancias</button>'+
 courierGpsCard()+'<details class="ry-more-section" data-persist="courier-account">'+
 '<summary>Mis datos y configuración</summary>'+accountView()+'</details>';
}

function adminHome(){
 const delayed=model.orders.filter(stalled);
 const active=model.orders.filter(o=>!['cancelled','delivered'].includes(o.status));
 const done=model.orders.filter(o=>['cancelled','delivered'].includes(o.status));
 const shown=model.adminOrderFilter==='all'?model.orders:model.adminOrderFilter==='done'?done:active;
 return '<div class="pagehead"><h1>Panel administrativo</h1></div>'+
 '<div class="stats"><div class="stat"><div class="num">'+model.orders.length+'</div><small>Pedidos</small></div>'+
 '<div class="stat"><div class="num">'+model.orders.filter(o=>o.status==='pending').length+'</div><small>Disponibles</small></div>'+
 '<div class="stat"><div class="num">'+delayed.length+'</div><small>Para revisar</small></div></div>'+
 (delayed.length?'<div class="card notice-card"><h3>'+icon('alert',20)+' Servicios con retraso</h3><p>Hay '+delayed.length+' servicios sin actualización reciente. Revisa cada caso; RutaYa no cancela ni reasigna pedidos automáticamente.</p></div>':'')+
 '<div class="ops-shortcuts"><button class="button outline small" data-act="nav" data-view="mapa">'+icon('pin',16)+' Ver mapa</button>'+
 '<button class="button outline small" data-act="nav" data-view="reportes">'+icon('card',16)+' Estadísticas y pagos</button>'+
 '<button class="button outline small" data-act="nav" data-view="soporte">'+icon('alert',16)+' Reportes y ayuda</button>'+
 '<button class="button outline small" data-act="nav" data-view="pedidos">'+icon('settings',16)+' Tarifas por zona</button></div>'+
 '<div class="card soft"><div class="inline-between"><div><h2>Domiciliarios</h2><p>Invita y aprueba a quienes pueden trabajar.</p></div><button class="button primary small" data-act="nav" data-view="domiciliarios">Gestionar</button></div></div>'+
 '<div class="section-title spaced"><h2>Gestionar pedidos</h2></div>'+
 '<p class="field-help">Aquí puedes cancelar cualquier pedido activo, incluso si el repartidor lo recogió, indicando el motivo.</p>'+
 '<div class="admin-order-filter"><button class="button small '+(model.adminOrderFilter==='active'?'primary':'outline')+'" data-act="adminFilter" data-filter="active">Activos ('+active.length+')</button>'+
 '<button class="button small '+(model.adminOrderFilter==='done'?'primary':'outline')+'" data-act="adminFilter" data-filter="done">Finalizados ('+done.length+')</button>'+
 '<button class="button small '+(model.adminOrderFilter==='all'?'primary':'outline')+'" data-act="adminFilter" data-filter="all">Todos</button></div>'+
 (shown.length?shown.map(adminOrderCard).join(''):empty('No hay pedidos en esta sección','Selecciona otro filtro para verlos.'))+
 '<p class="field-help">Puedes editar el valor de cualquier domicilio activo; los cambios se registran. Los pedidos finalizados son históricos.</p>';
}
function adminRates(){
 const zs=model.adminZones.length?model.adminZones:model.zones.map(z=>({...z,active:true,is_example:true}));
 return '<div class="pagehead"><h1>Tarifas por zona</h1></div>'+
 '<div class="card soft"><h3>Configura precios reales</h3><p>Los precios actuales pueden ser ejemplos. Escribe el valor aprobado por RutaYa y guárdalo por zona. Las modalidades ajustan ese precio automáticamente: Enrutado −$1.000, Normal base, Urgente +$1.500.</p><p class="field-help">La app no conoce todavía límites geográficos verificables de cada barrio: cliente o negocio selecciona la zona y el administrador debe comprobarla antes de operar.</p></div>'+
 '<div class="card"><h2>Zonas configuradas</h2>'+
 zs.map((z,i)=>'<div class="zone-admin-item">'+
 '<label for="zone-name-'+i+'">Nombre de la zona</label><input id="zone-name-'+i+'" value="'+e(z.name)+'" '+(z.name?'readonly':'')+' placeholder="Nombre de zona" maxlength="80">'+
 '<label for="zone-fee-'+i+'">Tarifa base (COP)</label><input id="zone-fee-'+i+'" type="number" min="0" max="100000" value="'+e(z.fee)+'">'+
 '<div class="zone-check"><label><input id="zone-active-'+i+'" type="checkbox" '+(z.active!==false?'checked':'')+'> Zona activa</label></div>'+
 '<div class="zone-check"><label><input id="zone-real-'+i+'" type="checkbox" '+(z.is_example===false?'checked':'')+'> Confirmo que es una tarifa real aprobada</label></div>'+
 '<p class="field-help">'+(z.is_example===false?'Precio marcado como real':'Tarifa de ejemplo (aún no confirmada)')+'</p>'+
 '<button class="button tonal small" data-act="saveZone" data-index="'+i+'">'+icon('check',16)+' Guardar esta zona</button></div>').join('')+
 '<button class="button outline wide space" data-act="addZone">'+icon('check',16)+' Agregar zona</button></div>'+
 '<div class="hint">'+icon('shield',18)+' Los cambios aplican a pedidos nuevos. Los ya creados conservan su valor, salvo ajuste administrativo permitido.</div>';
}
function adminSettings(){return `<div class="pagehead"><h1>Configuración</h1></div><div class="card"><h3>Estado de RutaYa</h3><p>${e(data.mode())}</p><p>Google Maps: ${hasGoogleKey()?'Clave configurada':'Pendiente de conectar API'}</p><p>Supabase: ${data.isLive?'Configurado':'Pendiente'}</p><button class="button outline small" data-act="enableAlerts">${icon('info',17)} Activar avisos mientras la página esté abierta</button><div class="ops-shortcuts"><button class="button outline small" data-act="nav" data-view="pedidos">Editar tarifas</button><button class="button outline small" data-act="nav" data-view="soporte">Reportes de ayuda</button></div></div>`}
function trackSteps(status){
 if(status==='cancelled')return '<div class="tracking-cancelled">'+icon('close',24)+' <div><b>Pedido cancelado</b><small>Este servicio ya no está disponible para reparto. Contacta al negocio si necesitas solicitar uno nuevo.</small></div></div>';
 const steps=[['pending','Solicitud recibida'],['accepted','Domiciliario asignado'],['at_pickup','Llegó al local'],['picked_up','Pedido recogido'],['at_dropoff','Llegó a tu dirección'],['delivered','Entrega confirmada']];
 const idx=steps.findIndex(x=>x[0]===status);
 return '<div class="timeline">'+steps.map(([id,title],i)=>'<div class="timeline-step '+(idx>i?'done':idx===i?'current':'')+'"><span class="step-icon">'+icon(idx>i?'check':'clock',18)+'</span><div><b>'+title+'</b><small>'+(idx>i?'Completado':idx===i?'En curso':'Pendiente')+'</small></div></div>').join('')+'</div>';
}
function trackingPage(){const o=model.track;const token=new URLSearchParams(location.search).get('token');if(!token)return `<div class="card"><h2>¿Quieres consultar un pedido?</h2><p>Abre el enlace individual que recibiste cuando se creó tu domicilio.</p><a href="${url('')}" class="button primary">Ir al inicio</a></div>`;if(!o)return `<div class="card">${empty('Pedido no encontrado','Si el enlace llegó desde otro celular y estamos en modo de demostración, todavía no se comparte entre dispositivos.','search')}</div>`;const loc=o.courier_location;const codeHtml=o.delivery_code?'<div class="delivery-code-card"><span>Código de entrega</span><strong>'+e(o.delivery_code)+'</strong><small>Comparte estos seis números con el domiciliario solo cuando recibas tu paquete.</small></div>':'';const tracked=loc?.lat!=null&&loc?.lng!=null;const route=tracked?trackingRouteUrl(loc,{lat:o.dropoff_lat,lng:o.dropoff_lng}):null;return `<div class="pagehead"><div><span class="eyebrow" style="color:var(--purple)">ENLACE DE SEGUIMIENTO</span><h1 class="tracking-title">Sigue tu domicilio</h1></div></div><div class="card"><span class="badge ${o.status==='delivered'?'green':'gray'}">${icon('clock',15)} ${e(orderStatusText(o))}</span><h2 style="margin-top:16px">${e(serviceName(o.service))}</h2>${modeInfo(o)}<p>${e(o.items_description||'Entrega RutaYa')}</p><div class="inline-between"><small>Tarifa del domicilio</small><strong class="big-price">${money(o.fee)}</strong></div></div>${codeHtml}<div class="split"><div class="card"><div class="inline-between"><h2>Ubicación del domiciliario</h2>${gpsLiveBadge(loc)}${icon('navigation',22)}</div>${tracked?`<div class="map-preview"><iframe loading="lazy" title="Ubicación del domiciliario en Google Maps" src="${googleEmbed(loc)}"></iframe></div><div class="driver-location space">${icon('crosshair',20)}<div><b>Última posición reportada</b><small>Señal ${gpsElapsed(loc.updated_at)} · Precisión aprox.: ${Math.round(loc.accuracy||0)} m</small><p><a class="link" href="${e(navigationUrl(loc))}" target="_blank" rel="noopener">Abrir punto GPS en Google Maps ${icon('external',15)}</a>${route?`<a class="button tonal small" style="margin-top:8px" href="${e(route)}" target="_blank" rel="noopener">${icon('route',17)} Ver ruta desde el domiciliario hasta mi dirección</a>`:''}</p></div></div>`:`<div class="map-preview"><div class="map-fallback">${icon('route',38)}<b>${o.status==='delivered'?'Servicio entregado':o.status==='cancelled'?'Servicio cancelado':o.status==='pending'?'Esperando domiciliario':'Esperando señal GPS'}</b><small>${o.status==='delivered'?'La entrega finalizó; el mapa deja de mostrar la ubicación del repartidor.':o.status==='cancelled'?'El reparto ya no está activo.':o.status==='pending'?'La ubicación aparecerá cuando un repartidor acepte y active su GPS desde el panel de RutaYa.':'El repartidor debe tener su página abierta y compartir ubicación. Si no hay señal reciente, no mostramos posiciones antiguas.'}</small></div></div>${recipientFeedback(o)}`}<p class="field-help">${tracked?'El marcador se actualiza automáticamente mientras el repartidor tenga GPS y RutaYa abierta. Si bloquea el celular o pierde señal, puede detenerse. No mostramos rutas ni tiempos inventados.':'Estado actualizado: ${prettyTime(o.updated_at||o.created_at)}. Sin una posición GPS reciente disponible.'}</p></div><div class="card"><h2>Estado de la entrega</h2>${trackSteps(o.status)}<p class="field-help">Última actualización: ${prettyTime(o.updated_at||o.created_at)}</p><div class="divider"></div><div class="route-line"><span class="circle">${icon('shop',14)}</span><div class="route-detail"><b>Recogida</b><small>${e(o.pickup_address)}</small></div></div><div class="route-line drop"><span class="circle">${icon('pin',14)}</span><div class="route-detail"><b>Entrega</b><small>${e(o.dropoff_address)}</small></div></div></div></div><div class="hint">${icon('info',18)} La hora estimada de llegada y las paradas previas se mostrarán cuando conectemos un servicio de rutas y la asignación real. No incluimos una ETA ficticia.</div>`}
function modal(title,body,footer=''){return `<div class="modal-back" role="presentation" data-modal="true"><section class="modal" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="modal-head"><h2>${e(title)}</h2><button data-act="closeModal" class="iconbtn" aria-label="Cerrar">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-foot">${footer}</div>`:''}</section></div>`}

function recentPlacesFor(field){
 const all=model.orders.filter(o=>page==='negocios'?o.source==='business':o.source==='customer');
 const seen=new Set();
 const out=[];
 for(const o of all){
  const pickup=field==='pickup';
  const address=pickup?o.pickup_address:o.dropoff_address;
  const lat=pickup?o.pickup_lat:o.dropoff_lat;
  const lng=pickup?o.pickup_lng:o.dropoff_lng;
  const key=String(address||'').trim().toLocaleLowerCase('es');
  if(!key||seen.has(key)||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))continue;
  seen.add(key);
  out.push({address,lat:Number(lat),lng:Number(lng)});
  if(out.length>=4)break;
 }
 return out;
}
function zoneEstimateNote(name){
 const z=model.zones.find(x=>x.name===name);
 if(!z)return 'Selecciona la zona según el barrio de entrega. RutaYa aún no determina automáticamente los límites de cada zona.';
 return z.is_example===false?'Tarifa indicada como real por administración. Verifica que la zona corresponda a tu dirección.':
 'Esta zona todavía tiene una tarifa de prueba; confirma el precio con RutaYa antes de realizar un servicio comercial.';
}

function pickerButton(field,label,draft){const p=draft[field];const simple=page==='confirmar'&&field==='dropoff';return `<label>${e(label)}</label><button type="button" class="pick-button" data-act="pick" data-field="${field}">${icon('pin',23)}<span class="pick-text"><strong>${simple?(p?'Cambiar mi dirección':'Poner mi dirección'):(p?'Ubicación confirmada':'Elegir ubicación')}</strong><small>${e(p?.address||(simple?'Usa GPS o marca tu casa en el mapa':'Buscar una dirección, elegir una anterior o usar GPS'))}</small></span>${icon('chevron',19)}</button>`}
function formContent(){const d=model.draft;const service=model.service;const fields={shop:['¿Qué necesitas comprar?','Ej. Dos rollos de papel en el D1'],pickup:['¿Qué pedido deben recoger?','Ej. Pedido de Bella Shop a nombre de María'],parcel:['¿Qué vas a enviar?','Ej. Una carpeta de documentos']}[service];const zones=model.zones.map(z=>`<option value="${e(z.name)}" ${d.dropoff_zone===z.name?'selected':''}>${e(z.name)}${z.is_example===false?'':' · prueba'}</option>`).join('');return `<div class="hint">${icon('info',18)} ${service==='shop'?'Para comprar productos, acuerda el pago por adelantado antes de enviar al domiciliario. No hemos habilitado cobros electrónicos.':service==='pickup'?'Si ya pagaste tu compra, indícanos el nombre de la persona que la hizo.':'El paquete debe estar listo y protegido para transportarlo.'}</div><label for="detail">${fields[0]}</label><textarea id="detail" name="items_description" placeholder="${fields[1]}">${e(d.items_description||'')}</textarea>${pickerButton('pickup','1. ¿Dónde recogemos?',d)}${pickerButton('dropoff','2. ¿Dónde entregamos?',d)}${service==='pickup'?`<label for="shopper-name">¿A nombre de quién está el pedido?</label><input id="shopper-name" name="shopper_name" placeholder="Nombre y apellido" value="${e(d.shopper_name||'')}">`:''}<label for="recipient-name">¿Quién recibe?</label><input id="recipient-name" name="recipient_name" placeholder="Nombre del destinatario" value="${e(d.recipient_name||'')}"><label for="recipient-phone">Teléfono de contacto</label><input type="tel" id="recipient-phone" name="recipient_phone" placeholder="Celular del destinatario" value="${e(d.recipient_phone||'')}">${service==='pickup'?`<label>¿El producto ya está pagado?</label><select name="paid"><option value="true" ${d.paid!==false?'selected':''}>Sí, está pagado</option><option value="false" ${d.paid===false?'selected':''}>No, falta cancelar</option></select>${d.paid===false?`<label>Valor por pagar en la tienda (COP)</label><input type="number" min="0" name="amount_to_collect" value="${e(d.amount_to_collect||'')}">`:''}`:''}<label>Zona de entrega (tarifa)</label><select name="dropoff_zone"><option value="">Selecciona zona para estimar</option>${zones}</select>${modeSelector(d)}${scheduleSelector(d)}<div class="location-card space"><div class="inline-between"><span>Tarifa de domicilio</span><strong class="big-price">${money(data.estimateFee(model.zones,d.dropoff_zone,d.delivery_mode||'normal'))}</strong></div><small>${e(zoneEstimateNote(d.dropoff_zone))}</small></div><label>Indicaciones (opcional)</label><input name="delivery_notes" placeholder="Casa de portón negro, segundo piso..." value="${e(d.delivery_notes||'')}">`}
function businessFormContent(){const d=model.businessDraft;const s=model.store;return `<div class="hint">${icon('shop',18)} Recogeremos el pedido en <strong>${e(s?.name||'tu negocio')}</strong>: ${e(s?.address||'primero registra su ubicación.')}</div><label>¿Qué se entrega?</label><input name="items_description" placeholder="Ej. Set de esmaltes y lámpara" value="${e(d.items_description||'')}">${pickerButton('dropoff','Dirección del cliente',d)}<label>Nombre del destinatario</label><input name="recipient_name" value="${e(d.recipient_name||'')}" placeholder="Ej. Ana Rodríguez"><label>Teléfono de contacto</label><input type="tel" name="recipient_phone" value="${e(d.recipient_phone||'')}" placeholder="Celular"><label>¿El producto está pagado?</label><select name="paid"><option value="true" ${d.paid!==false?'selected':''}>Sí, ya pagó</option><option value="false" ${d.paid===false?'selected':''}>No, falta cobrar</option></select>${d.paid===false?`<label>Valor pendiente de cobrar (COP)</label><input type="number" name="amount_to_collect" min="0" value="${e(d.amount_to_collect||'')}">`:''}<label>Zona de entrega (tarifa de RutaYa)</label><select name="dropoff_zone"><option value="">Selecciona zona</option>${model.zones.map(z=>`<option value="${e(z.name)}" ${d.dropoff_zone===z.name?'selected':''}>${e(z.name)}${z.is_example===false?'':' · prueba'}</option>`).join('')}</select>${modeSelector(d)}${scheduleSelector(d)}<div class="location-card space"><div class="inline-between"><span>Tarifa estimada</span><strong class="big-price">${money(data.estimateFee(model.zones,d.dropoff_zone,d.delivery_mode||'normal'))}</strong></div><small>${e(zoneEstimateNote(d.dropoff_zone))}</small></div><label>Notas para la entrega</label><input name="delivery_notes" value="${e(d.delivery_notes||'')}" placeholder="Ej. Tocar el timbre del apartamento 202">`}
function storeModal(){const s=model.store||{};return modal('Ubicación del negocio',`<p>Guarda una sola vez el punto exacto de Bella Shop. Luego los clientes podrán encontrarla por nombre en el selector de recogida.</p><label>Nombre del negocio</label><input id="store-name" value="${e(s.name||'Bella Shop')}"><label>Dirección de referencia</label><input id="store-address" value="${e(s.address||'')}" placeholder="Barrio, carrera y número"><div class="space"><button class="pick-button" data-act="pickStore">${icon('pin',22)} <span class="pick-text"><strong>${s.lat!=null?'Punto GPS guardado':'Seleccionar punto del negocio'}</strong><small>${e(s.address||'Abrir selector de ubicación')}</small></span>${icon('chevron',18)}</button></div><small>Recomendamos configurar el local estando físicamente allí y usando tu GPS.</small>`,`<button class="button outline" data-act="closeModal">Cancelar</button><button class="button primary" data-act="saveStore">Guardar tienda</button>`)}
function authModal(){
 if(model.auth==='reset')return modal('Recuperar contraseña',
 '<p>Escribe el correo con el que creaste tu cuenta. Te enviaremos un enlace para cambiar la contraseña.</p>'+
 '<label for="reset-email">Correo electrónico</label><input id="reset-email" type="email" autocomplete="email" placeholder="correo@ejemplo.com" value="'+e(model.authResetEmail||'')+'">'+
 '<p class="field-help">Si el correo está registrado, recibirás las instrucciones. Revisa también Spam.</p>',
 '<button class="button outline" data-act="openAuth">Volver</button><button class="button primary" data-act="sendReset">Enviar enlace</button>');
 if(model.auth==='password')return modal('Establecer contraseña',
 '<p>Elige una contraseña nueva de al menos 8 caracteres.</p><label for="new-password">Nueva contraseña</label>'+
 '<input id="new-password" type="password" autocomplete="new-password" minlength="8">'+
 '<label for="new-password-confirm">Repite la contraseña</label><input id="new-password-confirm" type="password" autocomplete="new-password" minlength="8">',
 '<button class="button outline" data-act="closeModal">Cerrar</button><button class="button primary" data-act="savePassword">Guardar contraseña</button>');
 return modal(model.registration?'Crear cuenta':'Ingresar a RutaYa',`<p>${page==='cliente'?'Accede para crear y consultar tus pedidos desde cualquier dispositivo.':page==='repartidores'?'Regístrate como domiciliario para enviar una solicitud que deberá aprobar RutaYa.':'Este panel requiere una cuenta de negocio o administrador previamente autorizada.'}</p>${model.registration?'<label>Tu nombre</label><input id="auth-name" autocomplete="name" placeholder="Nombre completo">':''}<label>Correo electrónico</label><input id="auth-email" type="email" autocomplete="email" placeholder="correo@ejemplo.com"><label>Contraseña</label><input id="auth-pass" type="password" autocomplete="current-password" placeholder="Mínimo 6 caracteres"><p><button class="button ghost small" data-act="forgotPassword">¿Olvidaste tu contraseña?</button></p>${(page==='cliente'||page==='repartidores')?`<p><button class="button ghost small" data-act="toggleRegistration">${model.registration?'Ya tengo cuenta · Iniciar sesión':'Crear una cuenta nueva'}</button></p>`:'<p class="field-help">Las cuentas de negocio y reparto deben ser aprobadas por administración.</p>'}`,`<button class="button primary wide" data-act="submitAuth">${model.registration?'Registrarme':'Iniciar sesión'}</button>`)}

async function activateCourierGps(){
 if(page!=='repartidores')throw Error('Solo el repartidor puede activar su ubicación');
 if(!navigator.geolocation)throw Error('Este dispositivo no permite usar GPS.');
 if(model.gpsWatch!=null){
  const point=await gps();
  model.courierGps=point;
  const active=model.orders.some(o=>o.courier_id===model.user?.id&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
  if(point.accuracy>100)model.gpsError='El GPS tiene poca precisión ('+Math.round(point.accuracy)+' m). Activa Ubicación precisa.';
  else if(active||model.shareAdminLocation){await data.updateCourierLocation(point);model.gpsLastSentAt=new Date().toISOString();model.gpsError=null}
  else model.gpsError=null;
  render();notify((active||model.shareAdminLocation)&&point.accuracy<=100?'Ubicación enviada a RutaYa.':'GPS actualizado. Se enviará cuando tengas pedido activo o autorices a Administración.');
  return;
 }
 const point=await gps();
 model.courierGps=point;model.gpsError=null;model.gpsLastSentAt=null;
 let last=0;
 model.gpsWatch=navigator.geolocation.watchPosition(async pos=>{
  const p={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy};
  model.courierGps=p;
  if(Date.now()-last<12000)return;
  last=Date.now();
  const active=model.orders.some(o=>o.courier_id===model.user?.id&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
  if((active||model.shareAdminLocation)&&p.accuracy>100){model.gpsError='Precisión insuficiente: '+Math.round(p.accuracy)+' m. Activa Ubicación precisa.';}
  else if(active||model.shareAdminLocation){
   try{await data.updateCourierLocation(p);model.gpsLastSentAt=new Date().toISOString();model.gpsError=null}
   catch(err){model.gpsError='No se pudo enviar tu ubicación: '+err.message;}
  }
  if(!model.showForm&&!model.manageAction&&!document.hidden)render();
 },err=>{
  model.gpsError='No se recibió señal GPS. Revisa permisos de ubicación y conexión.';
  if(err.code===1&&model.gpsWatch!=null){navigator.geolocation.clearWatch(model.gpsWatch);model.gpsWatch=null;model.gpsLastSentAt=null;}
  if(!document.hidden)render();
 },{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
 const active=model.orders.some(o=>o.courier_id===model.user?.id&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
 if((active||model.shareAdminLocation)&&point.accuracy<=100){
  try{await data.updateCourierLocation(point);model.gpsLastSentAt=new Date().toISOString()}
  catch(err){model.gpsError='Error al transmitir ubicación: '+err.message}
 }else if(active||model.shareAdminLocation){model.gpsError='Ubicación imprecisa: '+Math.round(point.accuracy)+' m. Activa Ubicación precisa.'}
 notify('GPS activado. Comparte tu posición mientras mantengas RutaYa abierta.');
 render();

}
async function mountFleetMap(){
 const host=document.getElementById('rutaya-fleet-map');
 if(!host)return;
 if(model.fleetMap){try{model.fleetMap.destroy()}catch(err){console.warn(err)}model.fleetMap=null}
 try{
  const ready=await showFleetMap(host,model.fleet);
  if(host.isConnected&&model.view==='mapa')model.fleetMap=ready;
  else ready?.destroy();
 }catch(err){if(host.isConnected)host.textContent='No se pudo cargar el mapa. Comprueba la conexión e inténtalo de nuevo.';console.warn(err)}
}

function render(){if(model.loading){root.innerHTML=header()+`<main class="wrap header-space"><div class="card">Preparando RutaYa…</div></main>`;return}if(model.error){root.innerHTML=header()+`<main class="wrap header-space"><div class="notice">${e(model.error)}</div></main>`;return}if(page==='confirmar'){root.innerHTML=header()+`<main class="wrap header-space recipient-page">${recipientInvitationPage()}</main>`+footer();return}if(page==='seguimiento'){root.innerHTML=header()+`<main class="wrap header-space">${modeBanner()}${trackingPage()}</main>`+footer()+(model.guestSupport?guestSupportModal():'');return}let needsAuth=data.isLive&&!model.user&&page!=='cliente';let needsRole=data.isLive&&model.user&&page!=='cliente'&&page!=='seguimiento'&&page!=='repartidores'&&(page==='admin'?!(model.profile?.is_admin||model.profile?.role==='admin'):model.profile?.role!=='business');if(needsAuth||needsRole){root.innerHTML=header()+`<main class="wrap header-space"><div class="card" style="max-width:530px;margin:auto"><h2>${needsAuth?'Inicia sesión para continuar':'Acceso restringido'}</h2><p>${needsAuth?'Necesitas una cuenta RutaYa.':'Esta cuenta no tiene autorización para este panel. Contacta al administrador para asignar el rol correspondiente.'}</p><button class="button primary" data-act="${needsAuth?'openAuth':'signout'}">${needsAuth?'Ingresar o registrarme':'Cambiar de cuenta'}</button></div></main>`+(model.auth?authModal():'');return}if(page==='repartidores'&&data.isLive&&model.user&&(model.profile?.role!=='courier'||!model.profile?.approved)){root.innerHTML=header()+`<main class="wrap header-space">${courierApplicationPage()}</main>`+footer();return}let body='';if(page==='cliente')body=model.view==='pedidos'?clientOrders():model.view==='cuenta'?accountView():clientHome();else if(page==='negocios')body=model.view==='pedidos'?businessOrders():model.view==='cuenta'?storeCard()+accountView():businessHome();else if(page==='repartidores')body=model.view==='pedidos'?courierOrders():model.view==='caja'?courierCashPage():model.view==='cuenta'?courierAccount():courierHome();else if(page==='admin')body=model.view==='domiciliarios'?adminCourierPage():model.view==='mapa'?adminFleetPage():model.view==='reportes'?adminStatsPage():model.view==='soporte'?adminSupportPage():model.view==='pedidos'?adminRates():model.view==='cuenta'?adminSettings():adminHome();root.innerHTML=header()+`<main class="wrap with-nav header-space">${modeBanner()}${body}</main>`+footer()+bottomNav()+(model.showForm==='store'?storeModal():model.showForm==='invite'?modal('Enlace para la clienta',inviteFormContent(),`<button class="button outline" data-act="closeModal">Volver</button><button class="button primary" data-act="submitInvite">Crear enlace</button>`):model.showForm?(page==='negocios'?modal('Nueva entrega desde el negocio',businessFormContent(),`<button class="button outline" data-act="closeModal">Cancelar</button><button class="button primary" data-act="submitBusiness">Crear solicitud</button>`):modal('Solicitar '+serviceName(model.service).toLowerCase(),formContent(),`<button class="button outline" data-act="closeModal">Cancelar</button><button class="button primary" data-act="submitCustomer">Crear pedido</button>`)):'')+(model.auth?authModal():'')+(model.manageAction?manageOrderModal():'')+(model.deliveryOtpOrderId?deliveryCodeModal():'')+(model.supportOrderId?supportOrderModal():'')+(model.routeGroupIndex!=null?routeGroupModal():'');if(page==='admin'&&model.view==='mapa')mountFleetMap()}
async function refresh(){if(page==='confirmar')return;const before=model.orders;const next=await data.listOrders(page);const notice=changedOrderNotice(before,next);model.orders=next;if(page==='admin'&&(model.profile?.is_admin||model.profile?.role==='admin')){
 if(model.view==='mapa')model.fleet=await data.fleetLocations();
 if(model.view==='reportes'){model.stats=await data.adminStatistics(model.statsDays);model.payouts=await data.listCourierPayouts()}
 if(model.view==='soporte')model.supportCases=await data.listSupportCases();
 if(model.view==='domiciliarios'){model.couriers=await data.listCouriers();model.verifications=await data.listCourierVerification();model.courierRatings=await data.adminCourierRatings()}
}if(page==='negocios'&&model.user&&model.profile?.role==='business')model.invites=await data.listDeliveryInvitations();if(page==='repartidores'&&model.view==='caja'&&model.user){model.cash=await data.courierCashSummary();model.payouts=await data.listCourierPayouts()}if(page==='negocios'&&model.businessTrackingToken){try{model.businessTrackingData=await data.getTracking(model.businessTrackingToken)}catch(err){console.warn('No se pudo refrescar seguimiento',err)}}if(page==='seguimiento'){model.track=await data.getTracking(new URLSearchParams(location.search).get('token'))}render();if(!model.manageAction&&!model.showForm&&!model.auth)orderUpdateNotice(notice)}
async function initialize(){try{await data.init();if(page==='confirmar'){
 model.zones=await data.getZones();
 model.knownStores=await data.getPublicStores();
 const token=new URLSearchParams(location.search).get('token');
 model.invitation=token?await data.getDeliveryInvitation(token):null;
 model.loading=false;render();return;
}
 if(data.isLive&&page==='cliente'){
  data.getClient()?.auth.onAuthStateChange((event)=>{
   if(event==='PASSWORD_RECOVERY'){
    model.passwordRecovery=true;model.auth='password';model.loading=false;render();
   }
  });
 }model.user=await data.currentUser();model.profile=await data.profile();if(page==='repartidores'&&model.user&&model.profile?.role==='courier'&&model.profile?.approved)model.shareAdminLocation=await data.courierAdminLocationConsent();model.zones=await data.getZones();model.knownStores=await data.getPublicStores();if(page==='negocios'){model.store=await data.getStore();if(model.user&&model.profile?.role==='business')model.invites=await data.listDeliveryInvitations();}if(page==='admin'||page==='cliente'||page==='negocios'||page==='repartidores')model.orders=await data.listOrders(page);if(page==='admin'&&model.user&&(model.profile?.is_admin||model.profile?.role==='admin')){model.couriers=await data.listCouriers();model.verifications=await data.listCourierVerification();model.courierRatings=await data.adminCourierRatings();model.adminZones=await data.getAdminZones()}if(page==='seguimiento'){model.track=await data.getTracking(new URLSearchParams(location.search).get('token'));model.poll=setInterval(async()=>{try{model.track=await data.getTracking(new URLSearchParams(location.search).get('token'));render()}catch(err){console.warn(err)}},8500)}if(data.isLive&&model.user==null&&page!=='seguimiento'&&page!=='cliente')model.auth=true;if(page==='cliente'&&model.passwordRecovery&&model.user)model.auth='password';model.loading=false;render()}catch(err){console.error(err);model.error=err.message;model.loading=false;render()}}
function draftChange(el){
 const draft=page==='negocios'?(model.showForm==='invite'?model.inviteDraft:model.businessDraft):model.draft;
 if(!el.name)return;
 draft[el.name]=el.name==='paid'?el.value==='true':el.value;
 if(page==='confirmar'&&el.name==='dropoff_zone'){
  const label=document.querySelector('.recipient-fee strong');
  const note=document.querySelector('.recipient-fee small');
  if(label)label.textContent=money(data.estimateFee(model.zones,draft.dropoff_zone,model.invitation?.delivery_mode));
  if(note)note.textContent=zoneEstimateNote(draft.dropoff_zone);
  return;
 }
 if(el.name==='paid'||el.name==='dropoff_zone'||el.name==='delivery_mode')render()
}
root.addEventListener('input',ev=>{let t=ev.target;if(t.matches('.modal [name],.recipient-form [name]'))draftChange(t)});
root.addEventListener('change',ev=>{let t=ev.target;if(t.matches('.modal [name],.recipient-form [name]'))draftChange(t)});
root.addEventListener('click',async ev=>{const b=ev.target.closest('[data-act]');if(!b)return;const action=b.dataset.act;const id=b.dataset.id;try{if(action==='guestSupport'){
 if(page!=='seguimiento')throw Error('Acceso incorrecto');
 model.guestSupport=true;render();
}else if(action==='closeGuestSupport'){
 model.guestSupport=false;render();
}else if(action==='submitGuestSupport'){
 if(page!=='seguimiento')throw Error('Acceso incorrecto');
 const token=new URLSearchParams(location.search).get('token');
 const message=document.getElementById('guest-support-message')?.value.trim()||'';
 if(message.length<10)throw Error('Escribe al menos diez caracteres');
 b.disabled=true;await data.openGuestSupport(token,message);
 model.guestSupport=false;render();notify('Reporte enviado a Administración.');
}else if(action==='submitRating'){
 if(page!=='seguimiento'||model.track?.status!=='delivered')throw Error('Solo se califican pedidos entregados');
 const token=new URLSearchParams(location.search).get('token');
 const stars=Number(document.getElementById('recipient-stars')?.value);
 const comment=document.getElementById('recipient-review')?.value.trim()||'';
 if(!Number.isInteger(stars)||stars<1||stars>5)throw Error('Selecciona de una a cinco estrellas');
 b.disabled=true;await data.rateDelivery(token,stars,comment);
 model.track=await data.getTracking(token);render();notify('¡Gracias por compartir tu experiencia!');
}else if(action==='deliveryOtp'){
 if(page!=='repartidores')throw Error('Solo repartidores confirman entregas');
 model.deliveryOtpOrderId=id;render();
}else if(action==='closeOtp'){
 model.deliveryOtpOrderId=null;render();
}else if(action==='confirmOtp'){
 if(model.sending)return;
 const code=document.getElementById('delivery-otp')?.value.trim()||'';
 if(!/^[0-9]{6}$/.test(code))throw Error('Pide el código de seis dígitos a la clienta');
 const id=model.deliveryOtpOrderId;
 if(!id)throw Error('No hay pedido seleccionado');
 model.sending=true;b.disabled=true;
 try{
  const point=await gps();
  await data.confirmDelivery(id,code,point);
  model.deliveryOtpOrderId=null;
  await refresh();notify('Entrega verificada con código y ubicación GPS.');
 }finally{model.sending=false}
}else if(action==='openSupport'){
 if(!model.user)throw Error('Inicia sesión para pedir ayuda');
 model.supportOrderId=id;render();
}else if(action==='closeSupport'){
 model.supportOrderId=null;render();
}else if(action==='submitSupport'){
 const id=model.supportOrderId,content=document.getElementById('support-message')?.value.trim()||'';
 if(content.length<10)throw Error('Explica qué ocurre en al menos diez caracteres');
 b.disabled=true;await data.openSupportCase(id,content);
 model.supportOrderId=null;render();notify('Tu reporte se envió a Administración.');
}else if(action==='resolveSupport'){
 if(!isAdmin())throw Error('Solo administración puede resolver reportes');
 if(!confirm('¿Ya revisaste y solucionaste este problema?'))return;
 b.disabled=true;await data.resolveSupportCase(b.dataset.case);await refresh();notify('Reporte marcado como solucionado.');
}else if(action==='statsRange'){
 if(!isAdmin())throw Error('Acceso solo para administración');
 model.statsDays=Number(b.dataset.days);
 model.stats=await data.adminStatistics(model.statsDays);
 render();
}else if(action==='setPayout'||action==='markPayoutPaid'){
 if(!isAdmin())throw Error('Solo administración registra pagos');
 const value=document.getElementById('payout-'+id)?.value;
 const amount=Number(value);
 if(value==null||value===''||!Number.isInteger(amount)||amount<0||amount>1000000)throw Error('Indica el valor aprobado en pesos');
 const paid=action==='markPayoutPaid';
 if(paid&&!confirm('¿Confirmas que ya pagaste '+money(amount)+' a este domiciliario? Esta operación queda registrada.'))return;
 b.disabled=true;await data.recordCourierPayout(id,amount,paid);
 model.payouts=await data.listCourierPayouts();render();
 notify(paid?'Pago registrado como entregado.':'Valor de liquidación guardado.');
}else if(action==='verifyCourier'){
 if(!isAdmin())throw Error('Solo administración verifica documentos');
 const uid=b.dataset.user;
 const identity=document.getElementById('verify-id-'+uid)?.checked===true;
 const vehicle=document.getElementById('verify-vehicle-'+uid)?.checked===true;
 const notes=document.getElementById('verify-notes-'+uid)?.value.trim()||'';
 if((identity||vehicle)&&!confirm('¿Realmente revisaste estos documentos fuera de RutaYa? No marques algo que no comprobaste.'))return;
 b.disabled=true;await data.verifyCourier(uid,identity,vehicle,notes);
 model.verifications=await data.listCourierVerification();model.courierRatings=await data.adminCourierRatings();render();notify('Verificaciones guardadas.');
}else if(action==='copyGpsInstructions'){
 if(page!=='admin'||!isAdmin())throw Error('Solo Administración');
 const msg='Hola, para que RutaYa pueda mostrar tu ubicación en el mapa de Administración:\n'+
 '1. Entra a '+url('repartidores/')+' e inicia sesión con tu cuenta de domiciliario aprobada.\n'+
 '2. Busca Seguimiento GPS y pulsa Compartir con Administración.\n'+
 '3. Autoriza la ubicación precisa cuando tu celular lo solicite.\n'+
 '4. Mantén la página abierta. Puedes pulsar Dejar de compartir o Detener GPS cuando quieras.';
 try{await navigator.clipboard.writeText(msg);notify('Indicaciones copiadas para enviar al domiciliario.')}
 catch{prompt('Copia estas indicaciones y envíalas al domiciliario:',msg)}
}else if(action==='refreshFleet'){
 if(!isAdmin())throw Error('Solo administración puede ver el mapa de flota');
 await refresh();notify('Mapa actualizado con las últimas ubicaciones disponibles.');
}else if(action==='assignGroup'){
 if(!isAdmin())throw Error('Acceso solo para administración');
 model.routeGroupIndex=Number(b.dataset.index);render();
}else if(action==='closeGroup'){
 model.routeGroupIndex=null;render();
}else if(action==='confirmGroup'){
 if(!isAdmin())throw Error('Acceso solo para administración');
 const group=model.routeGroups[model.routeGroupIndex];
 if(!group||group.length<2)throw Error('El grupo dejó de estar disponible');
 const courier=document.getElementById('route-driver')?.value||'';
 const reason=document.getElementById('route-reason')?.value.trim()||'';
 if(!courier)throw Error('Selecciona un repartidor aprobado');
 if(reason.length<5)throw Error('Escribe una nota para la ruta');
 if(!confirm('¿Asignar '+group.length+' domicilios al mismo repartidor?'))return;
 b.disabled=true;await data.adminAssignRoute(group.map(o=>o.id),courier,reason);
 model.routeGroupIndex=null;await refresh();notify('Ruta asignada. El repartidor verá todos los pedidos.');
}else if(action==='adminFilter'){if(page!=='admin'||!isAdmin())throw Error('Acceso no autorizado');const v=b.dataset.filter;if(!['active','done','all'].includes(v))throw Error('Filtro inválido');model.adminOrderFilter=v;render()}else if(action==='nav'){if(data.isLive&&!model.user&&b.dataset.view==='pedidos'){model.auth=true;render();notify('Ingresa para ver tus pedidos.');return}model.view=b.dataset.view;if((page==='admin'||page==='repartidores')&&model.user){await refresh()}else render();window.scrollTo({top:0,behavior:'smooth'})}else if(action==='service'){if(data.isLive&&!model.user){model.auth=true;model.registration=true;render();notify('Regístrate o inicia sesión para pedir un domicilio.');return}model.service=b.dataset.service;model.draft=model.draft||{};model.showForm=true;render()}else if(action==='inviteForm'){
 if(model.store?.lat==null||model.store?.lng==null)throw Error('Registra primero la ubicación de tu negocio.');
 model.inviteDraft={paid:true,delivery_mode:'normal'};
 model.showForm='invite';render();
}else if(action==='submitInvite'){
 if(model.sending)return;
 const d=model.inviteDraft;
 if(!d.items_description||d.items_description.trim().length<3)throw Error('Describe qué se va a entregar.');
 if(d.paid===false&&(!Number.isInteger(Number(d.amount_to_collect))||Number(d.amount_to_collect)<=0))
  throw Error('Escribe el saldo pendiente del producto.');
 model.sending=true;b.disabled=true;
 try{
  const result=await data.createDeliveryInvitation(d);
  if(!result?.token)throw Error('No se generó el enlace. Inténtalo nuevamente.');
  model.inviteShareUrl=deliveryInviteUrl(result.token);
  model.inviteDraft={paid:true,delivery_mode:'normal'};
  model.showForm=false;
  await refresh();
  notify('Enlace creado. Compártelo para que la clienta escriba sus datos.');
 }finally{model.sending=false}
}else if(action==='copyInvite'){
 const link=b.dataset.link;
 if(!link||!link.startsWith(url('confirmar/')))throw Error('Enlace inválido');
 try{await navigator.clipboard.writeText(link);notify('Enlace copiado. Envíalo a la clienta.')}
 catch{prompt('Copia este enlace y envíalo por WhatsApp:',link)}
}else if(action==='revokeInvite'){
 const token=b.dataset.token;
 if(!confirm('¿Desactivar este enlace? La clienta ya no podrá enviar los datos con él.'))return;
 b.disabled=true;await data.revokeDeliveryInvitation(token);
 if(model.inviteShareUrl===deliveryInviteUrl(token))model.inviteShareUrl=null;
 await refresh();notify('Enlace desactivado.');
}else if(action==='recipientNext'){
 if(page!=='confirmar'||model.invitation?.status!=='pending')throw Error('Este enlace ya no está activo');
 const d=model.draft;
 if(model.recipientStep===1){
  if(String(d.recipient_name||'').trim().length<2)throw Error('Escribe tu nombre y apellido para continuar.');
  const phone=String(d.recipient_phone||'').replace(/\D/g,'');
  if(!/^(3\d{9}|573\d{9})$/.test(phone))throw Error('Escribe tu celular colombiano de diez números.');
  model.recipientStep=2;
 }else if(model.recipientStep===2){
  if(!d.dropoff||!Number.isFinite(Number(d.dropoff.lat))||!Number.isFinite(Number(d.dropoff.lng))||String(d.dropoff.address||'').trim().length<5)
   throw Error('Primero guarda la ubicación y la dirección de tu casa.');
  model.recipientStep=3;
 }
 render();
 document.querySelector('.recipient-flow')?.scrollIntoView({block:'start',behavior:'smooth'});
}else if(action==='recipientBack'){
 if(page!=='confirmar')return;
 model.recipientStep=Math.max(1,(model.recipientStep||1)-1);
 render();
 document.querySelector('.recipient-flow')?.scrollIntoView({block:'start',behavior:'smooth'});
}else if(action==='recipientEditAddress'){
 if(page!=='confirmar')return;
 model.recipientStep=2;render();
 document.querySelector('.recipient-flow')?.scrollIntoView({block:'start',behavior:'smooth'});
}else if(action==='copyRecipientLink'){
 if(page!=='confirmar')throw Error('Este botón solo funciona en el formulario de entrega');
 const link=location.href;
 try{await navigator.clipboard.writeText(link);notify('Enlace copiado. Abre Chrome o Safari y pégalo para usar GPS.')}
 catch{prompt('Copia este enlace para abrirlo en Chrome o Safari:',link)}
}else if(action==='completeInvite'){
 if(model.sending)return;
 if(page!=='confirmar'||model.invitation?.status!=='pending')throw Error('El enlace ya no está disponible.');
 const d=model.draft,token=new URLSearchParams(location.search).get('token');
 if(!d.recipient_name||d.recipient_name.trim().length<2)throw Error('Escribe tu nombre y apellido.');
 const phone=String(d.recipient_phone||'').replace(/\D/g,'');
 if(!/^(3\d{9}|573\d{9})$/.test(phone))throw Error('Escribe tu celular colombiano de 10 dígitos.');
 if(!d.dropoff||!Number.isFinite(Number(d.dropoff.lat))||!Number.isFinite(Number(d.dropoff.lng)))
  throw Error('Elige tu ubicación usando GPS, búsqueda o el mapa.');
 if(!d.dropoff_zone)throw Error('Selecciona la zona o sector donde recibirás el pedido.');
 if(!confirm('¿Confirmas que el celular, la dirección y el punto GPS son correctos? RutaYa creará tu domicilio.'))return;
 model.sending=true;b.disabled=true;
 try{
  const result=await data.completeDeliveryInvitation(token,{
   recipient_name:d.recipient_name.trim(),recipient_phone:phone,
   dropoff_address:d.dropoff.address,dropoff_lat:d.dropoff.lat,dropoff_lng:d.dropoff.lng,
   dropoff_zone:d.dropoff_zone,delivery_notes:d.delivery_notes||''
  });
  model.invitation={...model.invitation,status:'completed',tracking_token:result.tracking_token};
  render();notify('Datos enviados correctamente. Tu domicilio quedó registrado.');
 }finally{model.sending=false}
}else if(action==='businessForm'){if(model.store?.lat==null){notify('Primero configura la ubicación GPS de tu negocio.');model.showForm=false;model.view='cuenta';render();return}model.showForm=true;render()}else if(action==='closeModal'){model.showForm=false;model.auth=null;render()}else if(action==='pick'||action==='pickStore'){let isStore=action==='pickStore';if(isStore){model.store={...(model.store||{}),name:document.getElementById('store-name')?.value||'Bella Shop',address:document.getElementById('store-address')?.value||''}}let draft=page==='negocios'?model.businessDraft:model.draft;let field=b.dataset.field;let initial=isStore?(model.store?.lat!=null?{address:model.store.address,lat:model.store.lat,lng:model.store.lng}:null):draft[field]||null;let result=await openPicker({title:isStore?'Ubicación de mi negocio':field==='pickup'?'Punto de recogida':'Punto de entrega',starting:initial,knownStores:model.knownStores,recentPlaces:isStore?[]:recentPlacesFor(field),onSelect:null});if(result){if(isStore){model.store={...(model.store||{}),...result};}else{draft[field]=result;if(page==='confirmar'&&field==='dropoff')model.recipientStep=3;}render();}}else if(action==='editStore'){model.showForm='store';render()}else if(action==='saveStore'){const name=document.getElementById('store-name')?.value.trim(),address=document.getElementById('store-address')?.value.trim();if(!name||!address||model.store?.lat==null)throw Error('Indica el nombre, la dirección y el punto GPS de la tienda.');model.store=await data.saveStore({name,address,lat:model.store.lat,lng:model.store.lng});model.knownStores=await data.getPublicStores();model.showForm=false;notify('Ubicación del negocio guardada. Ahora se puede buscar por su nombre.');render()}else if(action==='submitCustomer'||action==='submitBusiness'){if(model.sending)return;model.sending=true;b.disabled=true;try{let bus=action==='submitBusiness',d=bus?model.businessDraft:model.draft;const p=bus?model.store:null;if(!d.items_description?.trim()||(!bus&&!d.pickup)||!d.dropoff)throw Error('Completa el detalle y selecciona los puntos de recogida y entrega en el mapa.');if(!d.recipient_name?.trim())throw Error('Falta el nombre del destinatario.');
const phoneDigits=String(d.recipient_phone||'').replace(/\D/g,'');
if(!/^3\d{9}$/.test(phoneDigits)&&!/^573\d{9}$/.test(phoneDigits))
 throw Error('Escribe el celular colombiano del destinatario (10 dígitos) para contacto y seguimiento.');if(!d.dropoff_zone)throw Error('Selecciona la zona de entrega para calcular la tarifa.');if(!bus&&model.service==='pickup'&&!d.shopper_name?.trim())throw Error('Indica a nombre de quién está el pedido.');if(d.paid===false&&!(Number(d.amount_to_collect)>0))throw Error('Debes indicar cuánto falta por pagar.');let input={source:bus?'business':'customer',service:bus?'business':model.service,items_description:d.items_description.trim(),pickup_name:bus?p.name:'',pickup_address:bus?p.address:d.pickup.address,pickup_lat:bus?p.lat:d.pickup.lat,pickup_lng:bus?p.lng:d.pickup.lng,dropoff_address:d.dropoff.address,dropoff_lat:d.dropoff.lat,dropoff_lng:d.dropoff.lng,dropoff_zone:d.dropoff_zone||'',recipient_name:d.recipient_name.trim(),recipient_phone:d.recipient_phone||'',shopper_name:bus?'':d.shopper_name||'',paid:d.paid!==false,amount_to_collect:d.paid===false?Math.round(+d.amount_to_collect):0,delivery_notes:d.delivery_notes||'',delivery_mode:d.delivery_mode||'normal',scheduled_at:d.scheduled_at?new Date(d.scheduled_at).toISOString():null};let order=await data.createOrder(input);model.showForm=false;if(bus)model.businessDraft={};else model.draft={};model.view='pedidos';await refresh();notify(bus?'¡Solicitud creada! Pulsa WhatsApp clienta para enviar el seguimiento.':'¡Pedido creado! Consulta su seguimiento en Mis pedidos.');}finally{model.sending=false}}else if(action==='trackBusiness'){model.businessTrackingToken=b.dataset.token;model.businessTrackingData=await data.getTracking(model.businessTrackingToken);render();document.querySelector('.business-live')?.scrollIntoView({behavior:'smooth',block:'nearest'})}else if(action==='closeBusinessTrack'){model.businessTrackingToken=null;model.businessTrackingData=null;render()}else if(action==='copyCourierInvite'){const link=url('repartidores/');const message='Regístrate como domiciliario en RutaYa: '+link+'\nCrea tu cuenta, envía tu solicitud y espera la aprobación para recibir servicios.';try{await navigator.clipboard.writeText(message);notify('Enlace de inscripción copiado. Envíalo por WhatsApp al domiciliario.')}catch{prompt('Copia y envía este enlace al repartidor:',message)}}else if(action==='applyCourier'){const phone=document.getElementById('courier-phone')?.value.trim();const vehicle=document.getElementById('courier-vehicle')?.value;if(!phone||!vehicle)throw Error('Indica tu celular y el tipo de vehículo.');b.disabled=true;await data.requestCourier(phone,vehicle);model.profile=await data.profile();render();notify('Solicitud enviada. La administración debe aprobarte antes de poder repartir.')}else if(action==='checkCourierApproval'){model.profile=await data.profile();if(model.profile?.role==='courier'&&model.profile.approved){model.orders=await data.listOrders('repartidores');model.shareAdminLocation=await data.courierAdminLocationConsent();notify('¡Tu cuenta ya está aprobada!')}else notify('Tu solicitud todavía está pendiente de aprobación.');render()}else if(action==='reviewCourier'){const userId=b.dataset.user;const approve=b.dataset.approve==='true';if(!model.profile?.is_admin&&!model.profile?.role==='admin')throw Error('No tienes autorización para aprobar domiciliarios.');if(!confirm(approve?'¿Aprobar a este domiciliario para recibir y aceptar pedidos en RutaYa? Comprueba primero su identidad.':'¿Suspender el acceso de este domiciliario a nuevos pedidos?'))return;b.disabled=true;await data.reviewCourier(userId,approve);model.couriers=await data.listCouriers();render();notify(approve?'Domiciliario aprobado y habilitado.':'Acceso del domiciliario suspendido.')}else if(action==='copyTrack'){let link=url('seguimiento/?token='+encodeURIComponent(b.dataset.token));try{await navigator.clipboard.writeText(link);notify('Enlace copiado. Compártelo con el cliente.')}catch{prompt('Copia el enlace de seguimiento:',link)}}else if(action==='courierGps'){
 await activateCourierGps();
}else if(action==='toggleAdminGpsShare'){
 if(page!=='repartidores'||!model.user||model.profile?.role!=='courier'||!model.profile?.approved)
  throw Error('Solo los repartidores aprobados pueden compartir ubicación');
 if(model.shareAdminLocation){
  await data.setCourierAdminLocationConsent(false);
  model.shareAdminLocation=false;
  const active=model.orders.some(o=>o.courier_id===model.user?.id&&['accepted','at_pickup','picked_up','at_dropoff'].includes(o.status));
  if(!active)model.gpsLastSentAt=null;
  render();notify('Ubicación para Administración desactivada cuando estás disponible.');
 }else{
  if(!confirm('¿Autorizas a Administración a consultar tu GPS reciente incluso mientras estás disponible y SIN pedidos? Debes mantener RutaYa abierta y puedes dejar de compartir en cualquier momento.'))return;
  // Solicitud de permiso desde la acción real del repartidor.
  const point=await gps();
  await data.setCourierAdminLocationConsent(true);
  model.shareAdminLocation=true;model.courierGps=point;
  if(model.gpsWatch==null){
   try{await activateCourierGps()}catch(err){model.gpsError='Permiso activado, pero no se inició GPS: '+err.message;render();notify(model.gpsError);return}
  }else if(point.accuracy<=100){
   await data.updateCourierLocation(point);model.gpsLastSentAt=new Date().toISOString();model.gpsError=null;render();
  }else{model.gpsError='Activa Ubicación precisa para poder transmitir a Administración.';render()}
  notify('Ahora Administración puede ver tu GPS reciente mientras mantengas RutaYa abierta.');
 }
}else if(action==='stopCourierGps'){
 if(page!=='repartidores')throw Error('Solo el repartidor puede detener su GPS');
 if(model.gpsWatch!=null)navigator.geolocation.clearWatch(model.gpsWatch);
 model.gpsWatch=null;model.courierGps=null;model.gpsLastSentAt=null;model.gpsError=null;model.shareAdminLocation=false;
 try{await data.stopCourierLocation()}catch(err){notify('GPS detenido en este celular; verifica que tu conexión permita borrar la última ubicación.');console.warn(err);render();return}
 render();notify('GPS detenido. La clienta ya no verá tu posición.');
}else if(action==='claim'){await data.claimOrder(id);await refresh();if(model.gpsWatch!=null&&model.courierGps?.accuracy<=100){try{await data.updateCourierLocation(model.courierGps);model.gpsLastSentAt=new Date().toISOString()}catch(err){model.gpsError=err.message}}notify('Servicio aceptado. '+(model.gpsWatch!=null?'Sigue compartiendo GPS mientras trabajas.':'Activa tu GPS para que la clienta vea tu ubicación.'));render()}else if(action==='courierMap'){model.courierMapOrderId=id;model.courierMapStage=b.dataset.stage==='dropoff'?'dropoff':'pickup';render();document.querySelector('.courier-map-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'})}else if(action==='closeCourierMap'){model.courierMapOrderId=null;render()}else if(action==='progress'){b.disabled=true;const location=await gps();await data.progressOrder(id,b.dataset.next,location);model.courierGps=location;await refresh();notify('Estado confirmado con GPS.')}else if(action==='adminHistory'){
 if(page!=='admin'||!isAdmin())throw Error('Acceso exclusivo de administración.');
 model.adminHistoryId=id;model.adminHistoryItems=await data.adminOrderHistory(id);render();
}else if(action==='closeAdminHistory'){
 model.adminHistoryId=null;model.adminHistoryItems=[];render();
}else if(action==='manageOrder'){
 const operation=b.dataset.operation;
 if(!['cancel','release','reassign','assign','adminRelease'].includes(operation))throw Error('Operación no válida');
 model.manageAction=operation;model.manageOrderId=id;render();
}else if(action==='closeManage'){
 model.manageAction=null;model.manageOrderId=null;render();
}else if(action==='confirmManage'){
 if(model.sending)return;
 const op=model.manageAction;
 const reason=document.getElementById('ry-manage-reason')?.value.trim()||'';
 if(reason.length<5)throw Error('Escribe un motivo de al menos cinco caracteres');
 const order=model.orders.find(x=>x.id===id);
 if(op==='cancel'&&isAdmin()&&['picked_up','at_dropoff'].includes(order?.status)){
  if(!confirm('ATENCIÓN: el paquete ya fue recogido. ¿Confirmas que quieres cancelar administrativamente? Deberás coordinar la devolución y cualquier pago directamente.'))return;
 }
 model.sending=true;b.disabled=true;
 try{
  if(op==='cancel')await data.cancelOrder(id,reason);
  else if(op==='release')await data.releaseOrder(id,reason);
  else if(op==='reassign')await data.reassignOrder(id,reason);
  else if(op==='adminRelease'){
   const pickup=['picked_up','at_dropoff'].includes(order?.status);
   const handover=document.getElementById('ry-custody-confirm')?.checked===true;
   if(pickup&&!handover)throw Error('Confirma que el paquete fue recuperado físicamente antes de liberarlo.');
   await data.adminReleaseOrder(id,reason,handover);
  }
  else if(op==='assign'){
   const courierId=document.getElementById('ry-manage-courier')?.value;
   if(!courierId)throw Error('Selecciona un domiciliario aprobado');
   const pickup=['picked_up','at_dropoff'].includes(order?.status);
   const handover=document.getElementById('ry-custody-confirm')?.checked===true;
   if(pickup&&!handover)throw Error('Confirma que el nuevo repartidor recibió físicamente el paquete.');
   await data.adminForceAssignOrder(id,courierId,reason,handover);
  }
  else throw Error('Operación inválida');
  model.manageAction=null;model.manageOrderId=null;
  await refresh();
  notify(op==='cancel'?'Pedido cancelado.':op==='release'?'Servicio liberado para otro domiciliario.':op==='assign'?'Domiciliario asignado o cambiado.':op==='adminRelease'?'Pedido liberado y disponible para otra asignación.':'Pedido devuelto a disponibles.');
 }finally{model.sending=false}
}else if(action==='setFee'){const raw=document.getElementById('fee-'+id).value;if(raw===''||+raw<0)throw Error('Escribe una tarifa válida.');await data.setOrderFee(id,Math.round(+raw));await refresh();notify('Tarifa actualizada.')}else if(action==='addZone'){
 if(!isAdmin())throw Error('Solo administración puede agregar zonas');
 model.adminZones.push({name:'',fee:0,active:true,is_example:true});
 render();
}else if(action==='saveZone'){
 if(!isAdmin())throw Error('Solo administración puede guardar tarifas');
 const i=Number(b.dataset.index);
 const name=document.getElementById('zone-name-'+i)?.value.trim();
 const raw=document.getElementById('zone-fee-'+i)?.value;
 const active=document.getElementById('zone-active-'+i)?.checked;
 const real=document.getElementById('zone-real-'+i)?.checked;
 const price=Number(raw);
 if(!name||name.length<2||raw==null||raw===''||!Number.isInteger(price)||price<0||price>100000)
  throw Error('Indica un nombre de zona y una tarifa válida en pesos');
 if(real&&!confirm('¿Confirmas que '+name+' tiene una tarifa COMERCIAL real aprobada de '+money(price)+'?'))return;
 b.disabled=true;
 await data.upsertZone(name,price,Boolean(active),!real);
 model.adminZones=await data.getAdminZones();
 model.zones=await data.getZones();
 render();notify(real?'Tarifa comercial guardada.':'Tarifa de prueba guardada.');
}else if(action==='enableAlerts'){
 if(!('Notification' in window)){notify('Los avisos internos funcionarán mientras RutaYa esté abierta. Tu navegador no admite notificaciones web.');return}
 const permission=await Notification.requestPermission();
 model.desktopAlerts=permission==='granted';
 notify(model.desktopAlerts?'Avisos del navegador habilitados mientras RutaYa esté abierta.':'Usaremos avisos dentro de RutaYa. Los avisos del navegador no están autorizados.');
}else if(action==='forgotPassword'){
 model.authResetEmail=document.getElementById('auth-email')?.value.trim()||'';
 model.auth='reset';model.registration=false;render();
}else if(action==='sendReset'){
 const email=document.getElementById('reset-email')?.value.trim()||'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Escribe un correo válido');
 b.disabled=true;await data.requestPasswordReset(email);
 model.auth=false;render();notify('Si el correo está registrado, recibirás un enlace. Revisa tu bandeja y Spam.');
}else if(action==='showChangePassword'){
 if(!model.user)throw Error('Inicia sesión para cambiar la contraseña');
 model.auth='password';render();
}else if(action==='savePassword'){
 const password=document.getElementById('new-password')?.value||'';
 const repeat=document.getElementById('new-password-confirm')?.value||'';
 if(password.length<8)throw Error('La contraseña debe tener al menos 8 caracteres');
 if(password!==repeat)throw Error('Las contraseñas no coinciden');
 b.disabled=true;await data.changePassword(password);
 model.auth=false;model.passwordRecovery=false;
 const fixedUrl=new URL(window.location.href);fixedUrl.searchParams.delete('rutaya_recovery');
 if(fixedUrl.hash.includes('type=recovery'))fixedUrl.hash='';
 history.replaceState(null,'',fixedUrl.href);
 render();notify('Contraseña actualizada correctamente.');
}else if(action==='openAuth'){model.registration=false;model.auth=true;render()}else if(action==='toggleRegistration'){model.registration=!model.registration;render()}else if(action==='submitAuth'){const email=document.getElementById('auth-email')?.value.trim(),password=document.getElementById('auth-pass')?.value;const name=document.getElementById('auth-name')?.value.trim();if(!email||!password)throw Error('Escribe correo y contraseña.');if(model.registration){await data.signUp(email,password,name);model.user=await data.currentUser();if(!model.user){model.registration=false;model.auth=true;render();notify('Registro recibido. Revisa tu correo para confirmar la cuenta y luego inicia sesión.');return}notify('¡Cuenta creada! Ya tienes tu sesión iniciada.')}else{await data.signIn(email,password);model.user=await data.currentUser();if(!model.user)throw Error('No se pudo iniciar sesión. Revisa tu correo o contraseña.');notify('¡Iniciaste sesión correctamente!')}model.profile=await data.profile();if(page==='repartidores'&&model.profile?.role==='courier'&&model.profile?.approved)model.shareAdminLocation=await data.courierAdminLocationConsent();model.auth=false;model.registration=false;model.orders=await data.listOrders(page);if(page==='negocios'){model.store=await data.getStore();model.invites=await data.listDeliveryInvitations();}if(page==='admin'&&(model.profile?.is_admin||model.profile?.role==='admin')){model.couriers=await data.listCouriers();model.verifications=await data.listCourierVerification();model.courierRatings=await data.adminCourierRatings();model.adminZones=await data.getAdminZones()}render()}else if(action==='signout'){if(model.gpsWatch!=null||model.shareAdminLocation){if(model.gpsWatch!=null)navigator.geolocation.clearWatch(model.gpsWatch);model.gpsWatch=null;try{await data.stopCourierLocation()}catch(err){console.warn('No se pudo revocar GPS por conexión:',err)}}model.shareAdminLocation=false;await data.signOut();model.user=null;model.profile=null;model.store=null;model.invites=[];model.inviteShareUrl=null;model.auth=true;render()}}catch(err){console.error(err);notify(err.message||'Ocurrió un error. Vuelve a intentar.');b.disabled=false}});
window.addEventListener('storage',()=>{if(!data.isLive)refresh().catch(console.error)});
window.addEventListener('rutaya-refresh',()=>{if(!data.isLive)refresh().catch(console.error)});
if(data.isLive){setInterval(()=>{if(page!=='seguimiento'&&!model.loading&&!model.error&&model.user&&!model.showForm&&!model.auth&&!model.manageAction&&!(page==='admin'&&model.view==='pedidos'))refresh().catch(()=>{})},12000)}
initialize();