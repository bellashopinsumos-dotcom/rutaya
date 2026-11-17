import {icon,escapeHTML as e,money,prettyTime,statusText,serviceName} from './icons.js?v=20';
import * as data from './data.js?v=20';
import {openPicker,gps,navigationUrl,googleEmbed,hasGoogleKey} from './maps.js?v=20';
const cfg=window.RUTAYA_CONFIG||{};
const page=document.body.dataset.page||'cliente';
const root=document.getElementById('app');
const base=new URL('./',import.meta.url);
const url=path=>new URL(path,base).href;
const model={view:'inicio',orders:[],zones:[],store:null,knownStores:[],draft:{},businessDraft:{},showForm:false,service:'shop',auth:null,registration:false,user:null,profile:null,loading:true,error:null,track:null,courierGps:null,gpsWatch:null,sending:false,poll:null,businessTrackingToken:null,businessTrackingData:null,couriers:[],courierMapOrderId:null,courierMapStage:'pickup',invitation:null,inviteDraft:{delivery_mode:'normal',paid:true},invites:[],inviteShareUrl:null,inviteBusy:false,manageOrderId:null,manageAction:null,adminZones:[],desktopAlerts:false,authResetEmail:'',passwordRecovery:new URLSearchParams(location.search).has('rutaya_recovery')||location.hash.includes('type=recovery')};
let toastTimer;

function modeName(v){return ({routed:'Enrutado',normal:'Normal',urgent:'Urgente'})[v]||'Normal'}
function orderStatusText(o){return o.status==='pending'&&o.delivery_mode==='routed'&&o.dispatch_after&&Date.parse(o.dispatch_after)>Date.now()?'Programado para la tarde':statusText(o.status)}
function scheduledTime(v){if(!v)return 'Por confirmar';try{return new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}catch{return 'Por confirmar'}}
function modeInfo(o){const v=o.delivery_mode||'normal';const msg=v==='routed'?'Programado para despacho desde '+scheduledTime(o.dispatch_after)+'. Sin hora de entrega garantizada.':v==='urgent'?'Prioridad en la lista de repartidores. Sujeto a disponibilidad.':'Entrega estándar según disponibilidad.';return '<div class="mode-summary mode-'+e(v)+'"><b>'+icon(v==='routed'?'route':v==='urgent'?'navigation':'truck',17)+' '+e(modeName(v))+'</b><small>'+e(msg)+'</small></div>'}
function modeSelector(d){const v=d.delivery_mode||'normal';const opts=[['routed','route','Enrutado','−$1.000','Pedidos antes de las 12 m. habilitados desde las 2 p. m.; después del corte, al día siguiente.'],['normal','truck','Normal','Tarifa base','Servicio disponible según los repartidores.'],['urgent','navigation','Urgente','+$1.500','Prioridad alta entre los pedidos disponibles.']];return '<fieldset class="delivery-choice"><legend>Modalidad de entrega</legend><div class="mode-grid">'+opts.map(o=>'<label class="mode-tile '+(v===o[0]?'selected':'')+'"><input type="radio" name="delivery_mode" value="'+o[0]+'" '+(v===o[0]?'checked':'')+'><span class="mode-tile-title">'+icon(o[1],19)+'<b>'+o[2]+'</b><strong>'+o[3]+'</strong></span><small>'+o[4]+'</small></label>').join('')+'</div><p class="mode-hint">El enrutado es programado; la optimización automática de varias paradas todavía no está activa.</p></fieldset>'}
function trackingLink(o){return url('seguimiento/?token='+encodeURIComponent(o.tracking_token||''))}
function whatsappTrackingUrl(o){const raw=String(o.recipient_phone||'').replace(/\D/g,'');const to=raw.length===10&&raw.startsWith('3')?'57'+raw:raw.length===12&&raw.startsWith('57')?raw:'';const brand=o.source==='business'?(model.store?.name||'Tu negocio'):'RutaYa';const message='Hola, '+(o.recipient_name||'')+'. '+brand+' te comparte el seguimiento de tu domicilio RutaYa: '+trackingLink(o)+'. Puedes ver su estado y la última ubicación reportada cuando el repartidor active el GPS.';return 'https://wa.me/'+to+'?text='+encodeURIComponent(message)}
function businessShareActions(o){const token=e(o.tracking_token||'');return '<button class="button tonal small" data-act="trackBusiness" data-token="'+token+'">'+icon('navigation',17)+' Ver domiciliario</button><a class="button primary small" href="'+e(whatsappTrackingUrl(o))+'" target="_blank" rel="noopener noreferrer">'+icon('phone',17)+' WhatsApp clienta</a><button class="button outline small" data-act="copyTrack" data-token="'+token+'">'+icon('copy',17)+' Copiar enlace</button>'}
function businessTrackingPanel(o){const t=model.businessTrackingToken===o.tracking_token?model.businessTrackingData:null;const loc=t?.courier_location;const hasGps=loc?.lat!=null&&loc?.lng!=null;const map=hasGps?'<div class="map-preview"><iframe loading="lazy" title="Última posición del domiciliario" src="'+e(googleEmbed(loc))+'"></iframe></div><small>Última ubicación: '+e(scheduledTime(loc.updated_at))+' · Precisión aprox. '+Math.round(loc.accuracy||0)+' m. Se actualiza mientras el repartidor comparte GPS. <a href="'+e(navigationUrl(loc))+'" target="_blank" rel="noopener">Abrir punto GPS en Google Maps</a>.</small>':'<div class="map-preview"><div class="map-fallback">'+icon('crosshair',32)+'<b>Esperando ubicación</b><small>La posición aparecerá cuando el repartidor acepte y active su GPS.</small></div></div>';return '<section class="card business-live"><div class="inline-between"><h3>Seguimiento de '+e(o.recipient_name||'la entrega')+'</h3><button class="iconbtn" data-act="closeBusinessTrack" aria-label="Cerrar">'+icon('close')+'</button></div><span class="badge">'+e(orderStatusText({...o,status:t?.status||o.status}))+'</span>'+modeInfo(o)+map+'<div class="order-actions"><a class="button outline small" href="'+e(trackingLink(o))+'" target="_blank" rel="noopener">'+icon('external',17)+' Abrir seguimiento</a><a class="button primary small" href="'+e(whatsappTrackingUrl(o))+'" target="_blank" rel="noopener noreferrer">'+icon('phone',17)+' Enviar a clienta</a></div></section>'}


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
 const cards=list.map(c=>'<article class="card courier-admin-card"><div class="inline-between"><div><b>'+e(c.display_name||'Sin nombre')+'</b><small class="block-small">'+e(c.email||'')+'</small></div><span class="badge '+(c.approved?'green':'')+'">'+(c.approved?'Aprobado':'Pendiente')+'</span></div><div class="courier-detail">'+icon('phone',16)+' <span>'+e(c.phone||'')+'</span><span>·</span>'+icon('truck',16)+' <span>'+e(c.vehicle||'')+'</span></div><p class="field-help">Solicitud: '+e(prettyTime(c.applied_at))+'</p><div class="order-actions"><button class="button '+(c.approved?'outline':'primary')+' small" data-act="reviewCourier" data-user="'+e(c.user_id)+'" data-approve="'+(!c.approved)+'">'+icon(c.approved?'alert':'check',17)+' '+(c.approved?'Suspender acceso':'Aprobar domiciliario')+'</button></div></article>').join('');
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
 return 'Hola. '+(model.store?.name||'La tienda')+' te invita a completar los datos de entrega de tu pedido en RutaYa.\n'+
 'Abre este enlace, escribe tu nombre, celular y dirección, y confirma el punto en el mapa:\n'+link+
 '\nNo necesitas crear una cuenta. El enlace dura 48 horas.';
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
  isAdmin()&&role==='admin'&&['pending','accepted','at_pickup'].includes(o.status)
  ||role==='negocios'&&['pending','accepted','at_pickup'].includes(o.status)
  ||role==='cliente'&&o.status==='pending');
 if(canCancel)buttons.push('<button class="button outline small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="cancel">'+icon('close',16)+' Cancelar</button>');
 if(role==='repartidores'&&['accepted','at_pickup'].includes(o.status)&&o.courier_id===model.user?.id)
  buttons.push('<button class="button outline small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="release">'+icon('arrowLeft',16)+' Liberar servicio</button>');
 if(role==='admin'&&isAdmin()&&['pending','accepted','at_pickup'].includes(o.status))
  buttons.push('<button class="button primary small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="assign">'+icon('user',16)+' Asignar a...</button>');
 if(role==='admin'&&isAdmin()&&['accepted','at_pickup'].includes(o.status))
  buttons.push('<button class="button tonal small" data-act="manageOrder" data-id="'+e(o.id)+'" data-operation="reassign">'+icon('route',16)+' Reasignar</button>');
 return buttons.join('');
}
function manageOrderModal(){
 const o=model.orders.find(x=>x.id===model.manageOrderId);
 if(!o)return '';
 const operation=model.manageAction;
 const isCancel=operation==='cancel',isRelease=operation==='release',isAssign=operation==='assign';
 const title=isCancel?'Cancelar domicilio':isRelease?'Liberar servicio':isAssign?'Asignar domiciliario':'Devolver a disponibles';
 const description=isCancel?'El pedido pasará a cancelado y ya no se podrá aceptar. Si el paquete fue recogido, contacta a administración.':
  isRelease?'El domicilio regresará a la lista de disponibles para que otro repartidor pueda tomarlo.':isAssign?'Selecciona un domiciliario aprobado. Solo se puede asignar o cambiar antes de recoger el paquete.':'El pedido volverá a disponibles y se retirará del repartidor anterior. Solo es posible antes de recoger el paquete.';
 return modal(title,'<p>'+description+'</p><p><strong>'+e(o.items_description)+'</strong></p>'+(isAssign?'<label for="ry-manage-courier">Domiciliario aprobado</label><select id="ry-manage-courier"><option value="">Selecciona un repartidor</option>'+model.couriers.filter(x=>x.approved).map(c=>'<option value="'+e(c.user_id)+'">'+e(c.display_name||c.email||'Domiciliario')+'</option>').join('')+'</select>':'')+'<label for="ry-manage-reason">Motivo del cambio</label><textarea id="ry-manage-reason" rows="3" maxlength="200" placeholder="Ej. El cliente cambió de planes / el domiciliario no puede continuar" required></textarea><p class="field-help">Este cambio quedará registrado. Confirma primero con las personas involucradas.</p>',
 '<button class="button outline" data-act="closeManage">Volver</button><button class="button '+(isCancel?'danger':'primary')+'" data-act="confirmManage" data-id="'+e(o.id)+'">'+icon('check',17)+' Confirmar</button>');
}
function adminOrderCard(o){
 const pending=o.status==='pending';
 return '<article class="order">'+
 '<div class="inline-between"><strong>'+e(o.items_description)+'</strong><span class="badge '+(o.status==='delivered'?'green':'')+'">'+e(orderStatusText(o))+'</span></div>'+
 '<div class="admin-order-meta"><span>'+e(o.source==='business'?'Negocio':'Cliente')+'</span><span>'+e(modeName(o.delivery_mode))+'</span><span>'+e(prettyTime(o.created_at))+'</span></div>'+
 '<p>'+e(o.pickup_address)+' → '+e(o.dropoff_address)+'</p>'+
 stalledNote(o)+
 (o.recipient_phone?'<p class="field-help">Contacto destinatario: <a href="tel:'+e(String(o.recipient_phone).replace(/[^\d+]/g,''))+'">'+e(o.recipient_phone)+'</a></p>':'')+
 '<div class="field-line space"><input id="fee-'+e(o.id)+'" type="number" min="0" max="1000000" value="'+e(o.fee??'')+'" placeholder="Tarifa COP" '+(pending?'':'disabled')+'><button class="button tonal small" data-act="setFee" data-id="'+e(o.id)+'" '+(pending?'':'disabled title="Solo antes de asignar"')+'>Guardar tarifa</button></div>'+
 '<div class="order-actions">'+orderManageButtons(o,'admin')+'</div></article>';
}

function notify(message){document.querySelector('.toast')?.remove();const n=document.createElement('div');n.className='toast';n.setAttribute('role','status');n.textContent=message;document.body.append(n);clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.remove(),4600)}
function hideBtn(v,label,ico){return `<button class="button ${v?'primary':'outline'}" data-act="${e(label)}">${icon(ico,17)} ${e(label)}</button>`}
function modeBanner(){return !data.isLive?`<div class="notice">${icon('info',17)} <span><strong>Vista de prueba:</strong> tus pedidos solo aparecen en este navegador. Los enlaces de seguimiento no funcionan en otro celular hasta conectar la base de datos.</span></div>`:''}
function logo(){return `<a class="logo" href="${url('')}" aria-label="RutaYa inicio"><span class="logo-symbol">${icon('logo',25)}</span><span>Ruta<b>Ya</b></span></a>`}
function header(){const heading={cliente:'Tu ciudad en movimiento',negocios:'Panel de negocios',repartidores:'RutaYa Repartidor',seguimiento:'Seguimiento de entrega',admin:'Administración'}[page];return `<header class="topbar"><div class="toprow">${logo()}<div class="top-actions"><div class="city">${icon('pin',15)} Popayán <span class="desktop-link">· Cauca</span></div>${page==='cliente'?`<button class="iconbtn" data-act="nav" data-view="cuenta" title="Mi cuenta">${icon('user')}</button>`:''}${page==='repartidores'?`<button class="iconbtn" data-act="courierGps" title="Activar ubicación">${icon('crosshair')}</button>`:''}</div></div></header>`}
function footer(){return `<footer class="footer">RutaYa · Hecho para conectar Popayán <div style="margin-top:8px"><a href="${url('')}">Clientes</a><a href="${url('negocios/')}">Negocios</a><a href="${url('repartidores/')}">Domiciliarios</a><a href="${url('admin/')}">Administración</a></div><small>Las tarifas y condiciones deben confirmarse antes de iniciar el servicio.</small></footer>`}
function bottomNav(){const items=page==='cliente'?[['inicio','home','Inicio'],['pedidos','clipboard','Mis pedidos'],['cuenta','user','Cuenta']]:page==='negocios'?[['inicio','home','Panel'],['pedidos','clipboard','Pedidos'],['cuenta','shop','Mi tienda']]:page==='repartidores'?[['inicio','bag','Disponibles'],['pedidos','route','Mis servicios'],['cuenta','user','Perfil']]:page==='admin'?[['inicio','clipboard','Pedidos'],['domiciliarios','user','Domiciliarios'],['pedidos','card','Tarifas'],['cuenta','settings','Ajustes']]:[];return items.length?`<nav class="nav-bottom" aria-label="Navegación principal"><div class="nav-inner">${items.map(([v,i,label])=>`<button data-act="nav" data-view="${v}" class="${model.view===v?'active':''}">${icon(i,21)}${label}</button>`).join('')}</div></nav>`:''}
function newOrderCard(order,role){let token=order.tracking_token;let active=!['delivered','cancelled'].includes(order.status);let statusClass=order.status==='delivered'?'green':order.status==='cancelled'?'red':'gray';let shop=order.pickup_name||order.shop_name||'Punto de recogida';let me=role==='repartidores';return `<article class="order" data-order="${e(order.id)}"><div class="order-head"><span class="badge ${statusClass}"><span class="status-dot"></span>${e(orderStatusText(order))}</span><small>${prettyTime(order.created_at)}</small></div><h3>${e(serviceName(order.service))}</h3>${modeInfo(order)}<p style="font-size:13px;margin:4px 0">${e(order.items_description)}</p><div class="route-line"><span class="circle">${icon('shop',14)}</span><div class="route-detail"><b>Recoger ${order.pickup_name?'en '+e(order.pickup_name):''}</b><small>${e(order.pickup_address)}</small></div></div><div class="route-line drop"><span class="circle">${icon('pin',15)}</span><div class="route-detail"><b>Entregar</b><small>${e(order.dropoff_address)}</small></div></div><div class="inline-between space"><div><small>Tarifa de domicilio</small><div style="font-size:17px;font-weight:900;color:var(--purple)">${money(order.fee)}</div></div>${order.amount_to_collect>0?`<div><small>Pendiente por producto</small><div style="font-weight:900">${money(order.amount_to_collect)}</div></div>`:''}</div>${stalledNote(order)}<div class="order-actions">${me?courierActions(order):role==='negocios'?businessShareActions(order):`<a class="button tonal small" href="${url('seguimiento/?token='+encodeURIComponent(token))}">${icon('route',17)} Ver seguimiento</a><button class="button outline small" data-act="copyTrack" data-token="${e(token)}">${icon('copy',17)} Compartir</button>`}${orderManageButtons(order,role)}</div>${me?courierMapPanel(order):''}${role==='negocios'&&model.businessTrackingToken===token?businessTrackingPanel(order):''}</article>`}
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
 const pickup=pending||o.status==='accepted'||o.status==='at_pickup';
 const done=o.status==='delivered'||o.status==='cancelled';
 const pickupPlace={lat:o.pickup_lat,lng:o.pickup_lng,address:o.pickup_address};
 const dropPlace={lat:o.dropoff_lat,lng:o.dropoff_lng,address:o.dropoff_address};
 const link=(place,label,primary)=>'<a class="button '+(primary?'primary':'outline')+' small courier-nav-btn" href="'+e(navigationUrl(place))+'" target="_blank" rel="noopener noreferrer">'+icon('navigation',18)+' '+label+'</a>';
 const preview=(stage,label)=>'<button class="button tonal small" data-act="courierMap" data-id="'+e(o.id)+'" data-stage="'+stage+'">'+icon('pin',17)+' '+label+'</button>';
 let actions=[];
 if(pending)actions.push('<button class="button primary small" data-act="claim" data-id="'+e(o.id)+'">'+icon('check',17)+' Aceptar servicio</button>');
 if(!done){
  actions.push(link(pickupPlace,'Ruta al punto de recogida',pickup));
  actions.push(link(dropPlace,'Ruta a la dirección del cliente',!pickup));
  actions.push(preview(pickup?'pickup':'dropoff','Ver punto en el mapa'));
 }
 if(!pending){
  const steps={accepted:['at_pickup','Confirmar llegada al local'],at_pickup:['picked_up','Confirmar recogida'],picked_up:['at_dropoff','Confirmar llegada al cliente'],at_dropoff:['delivered','Confirmar entrega']};
  const step=steps[o.status];
  if(step)actions.push('<button class="button outline small" data-act="progress" data-id="'+e(o.id)+'" data-next="'+step[0]+'">'+icon('crosshair',17)+' '+step[1]+'</button>');
 }
 return actions.join('');
}
function empty(heading,desc,ico='clipboard'){return `<div class="empty">${icon(ico,31)}<b>${e(heading)}</b><small>${e(desc)}</small></div>`}
function clientHome(){return `<div class="hero"><span class="eyebrow">ENTREGAS EN POPAYÁN</span><h1>Lo que necesitas, <br> hasta donde estés.</h1><p>Una compra, un encargo o un paquete. Elige el servicio y te ayudamos a moverlo.</p><div class="illustration">${icon('logo',155)}</div></div><section class="spaced"><div class="section-title"><h2>¿Qué hacemos hoy?</h2></div><div class="services"><button class="service" data-act="service" data-service="shop"><span class="ico-wrap">${icon('bag',27)}</span><b>Comprar</b><small>Encarga productos de cualquier tienda</small></button><button class="service" data-act="service" data-service="pickup"><span class="ico-wrap">${icon('receipt',27)}</span><b>Recoger</b><small>Traemos tu compra ya preparada</small></button><button class="service" data-act="service" data-service="parcel"><span class="ico-wrap">${icon('box',27)}</span><b>Enviar</b><small>Envía un paquete de un punto a otro</small></button></div></section><section class="spaced"><div class="section-title"><h2>Tus pedidos</h2><button class="button ghost small" data-act="nav" data-view="pedidos">Ver todos ${icon('chevron',15)}</button></div>${model.orders.filter(o=>o.source==='customer').length?model.orders.filter(o=>o.source==='customer').slice(0,2).map(o=>newOrderCard(o,'cliente')).join(''):empty('Aquí aparecerán tus pedidos','Solicita tu primer servicio para empezar.','box')}</section><div class="card soft" style="margin-top:15px"><div class="inline">${icon('shield',25)} <h3 style="margin:0">Tu pedido, paso a paso</h3></div><p>Desde el momento en que el domiciliario acepta hasta que confirma la entrega. Comparte el enlace de seguimiento cuando el servicio esté conectado.</p></div>`}
function clientOrders(){let orders=model.orders.filter(x=>x.source==='customer');return `<div class="pagehead"><h1>Mis pedidos</h1></div>${orders.length?orders.map(x=>newOrderCard(x,'cliente')).join(''):empty('No tienes pedidos','Puedes pedir una compra, una recogida o un envío.')}<button class="button primary wide" data-act="service" data-service="shop">${icon('bag')} Solicitar servicio</button>`}
function accountView(){return `<div class="pagehead"><h1>Tu cuenta</h1></div><div class="card"><div class="auth-label">${icon('shield',20)} <strong>${data.isLive?(model.user?'Sesión iniciada':'Acceso a tu cuenta'):'Modo demostración'}</strong></div><p>${model.user?.email&&data.isLive?e(model.user.email):'Inicia sesión para consultar tus pedidos desde cualquier celular.'}</p>${data.isLive?(model.user?`<div class="account-actions"><button data-act="showChangePassword" class="button outline">${icon('settings',17)} Cambiar contraseña</button><button data-act="signout" class="button outline">${icon('logout',17)} Cerrar sesión</button></div>`:`<button data-act="openAuth" class="button primary">${icon('user',17)} Iniciar sesión o registrarme</button>`):`<p>La aplicación está lista para conectar autenticación y pedidos entre celulares mediante Supabase.</p>`}</div><div class="card"><h3>Otras formas de usar RutaYa</h3><div class="mini-tabs"><a href="${url('negocios/')}">${icon('shop',16)} Soy negocio</a><a href="${url('repartidores/')}">${icon('truck',16)} Soy domiciliario</a></div>${model.profile?.is_admin?`<a class="button outline wide space" href="${url('admin/')}">${icon('settings',17)} Administrar RutaYa y domiciliarios</a>`:''}</div>${model.user&&data.isLive?'<div class="card"><h3>Avisos de tus pedidos</h3><p>Te avisamos dentro de RutaYa cuando cambie un pedido. Si el navegador lo permite, puedes recibir avisos mientras la página permanezca abierta.</p><button class="button outline" data-act="enableAlerts">'+icon('info',17)+' Activar avisos del navegador</button></div>':''}`}
function storeCard(){const s=model.store;return `<div class="card"><div class="inline-between"><div><span class="badge">${icon('shop',15)} Comercios</span><h2 style="margin-top:10px">${e(s?.name||'Configura tu negocio')}</h2><p>${e(s?.address||'Registra el punto exacto de recogida para que tus clientes te encuentren por nombre.')}</p></div><span style="color:var(--purple)">${icon('shop',32)}</span></div><div class="inline-between" style="margin-top:12px"><span class="badge ${s?.lat!=null?'green':'red'}">${s?.lat!=null?'Ubicación guardada':'Falta ubicación GPS'}</span><button class="button tonal small" data-act="editStore">${icon('settings',15)} Configurar tienda</button></div></div>`}
function businessHome(){let orders=model.orders.filter(o=>o.source==='business');let active=orders.filter(o=>!['delivered','cancelled'].includes(o.status));return `<div class="pagehead"><div><span class="eyebrow" style="color:var(--purple)">RUTAYA PARA NEGOCIOS</span><h1>Gestión de entregas</h1></div></div>${storeCard()}<div class="stats"><div class="stat"><div class="num">${orders.length}</div><small>Solicitudes</small></div><div class="stat"><div class="num">${active.length}</div><small>En proceso</small></div><div class="stat"><div class="num">${orders.filter(o=>o.status==='delivered').length}</div><small>Entregados</small></div></div>${model.profile?.is_admin?`<div class="card soft"><div class="inline-between"><div><h3>Domiciliarios de RutaYa</h3><p>Invita y aprueba a quienes repartirán tus pedidos.</p></div><a class="button primary small" href="${url('admin/')}">${icon('user',16)} Administrar</a></div></div>`:'' }<div class="card spaced"><h2>Enviar pedido a cliente</h2><p>RutaYa usará el punto de recogida de tu negocio. Registra a quién se entrega, si falta cobrar y la modalidad del domicilio. Luego podrás compartir el seguimiento por WhatsApp.</p><button class="button primary wide" data-act="businessForm">${icon('truck',19)} Solicitar un domiciliario</button></div><div class="section-title spaced"><h2>Entregas recientes</h2><button class="button ghost small" data-act="nav" data-view="pedidos">Ver todas ${icon('chevron',15)}</button></div>${orders.length?orders.slice(0,3).map(o=>newOrderCard(o,'negocios')).join(''):empty('No hay entregas todavía','Registra tu primer servicio desde el panel del negocio.')}`}
function businessOrders(){const orders=model.orders.filter(o=>o.source==='business');return `<div class="pagehead"><h1>Pedidos del negocio</h1></div>${orders.length?orders.map(o=>newOrderCard(o,'negocios')).join(''):empty('Sin pedidos todavía','Cuando solicites un domiciliario podrás seguirlo y enviar el enlace por WhatsApp a la clienta.')}<button class="button primary wide" data-act="businessForm">${icon('truck',18)} Nuevo envío</button>`}
function courierHome(){const orders=model.orders.filter(o=>o.status==='pending').sort((a,b)=>({urgent:0,normal:1,routed:2}[a.delivery_mode||'normal']??1)-({urgent:0,normal:1,routed:2}[b.delivery_mode||'normal']??1)||new Date(a.created_at)-new Date(b.created_at));return `<div class="pagehead"><div><span class="eyebrow" style="color:var(--purple)">RUTAYA REPARTIDOR</span><h1>Servicios disponibles</h1></div></div><div class="card soft"><div class="inline-between"><div><h3 style="margin:0">Ubicación del domiciliario</h3><p style="font-size:12px">${model.courierGps?'GPS activo · Última lectura recibida':'Actívala para verificar recogidas y entregas.'}</p></div><button class="button tonal small" data-act="courierGps">${icon('crosshair',16)} ${model.courierGps?'Actualizar':'Activar GPS'}</button></div></div>${orders.length?orders.map(o=>newOrderCard(o,'repartidores')).join(''):empty('No hay solicitudes pendientes','Los nuevos pedidos que lleguen aparecerán aquí.','clipboard')}<div class="hint">${icon('shield',19)} La confirmación de llegada, recogida y entrega exige GPS dentro de 200 m del punto, con precisión máxima de 100 m. Un navegador no es suficiente para evitar GPS falsificado.</div>`}
function courierOrders(){const orders=model.orders.filter(o=>o.courier_id&&(o.status!=='delivered'||new Date(o.updated_at).toDateString()===new Date().toDateString()));return `<div class="pagehead"><h1>Mis servicios</h1></div>${orders.length?orders.map(o=>newOrderCard(o,'repartidores')).join(''):empty('Todavía no tienes servicios asignados','Acepta un domicilio disponible para empezar.')}`}
function courierAccount(){return `<div class="pagehead"><h1>Mi perfil de reparto</h1></div><div class="card"><h3>Seguimiento y GPS</h3><p>Para que un cliente pueda ver tu posición real, debes permitir el GPS y mantener esta página abierta mientras trabajas. Los navegadores pueden detener las actualizaciones al bloquear el teléfono.</p><button class="button primary" data-act="courierGps">${icon('crosshair',17)} Activar seguimiento GPS</button></div>${accountView()}`}

function adminHome(){
 const delayed=model.orders.filter(stalled);
 return '<div class="pagehead"><h1>Panel administrativo</h1></div>'+
 '<div class="stats"><div class="stat"><div class="num">'+model.orders.length+'</div><small>Pedidos</small></div>'+
 '<div class="stat"><div class="num">'+model.orders.filter(o=>o.status==='pending').length+'</div><small>Disponibles</small></div>'+
 '<div class="stat"><div class="num">'+delayed.length+'</div><small>Para revisar</small></div></div>'+
 (delayed.length?'<div class="card notice-card"><h3>'+icon('alert',20)+' Servicios con retraso</h3><p>Hay '+delayed.length+' servicios sin actualización reciente. Revisa cada caso; RutaYa no cancela ni reasigna pedidos automáticamente.</p></div>':'')+
 '<div class="card soft"><div class="inline-between"><div><h2>Domiciliarios</h2><p>Invita y aprueba a quienes pueden trabajar.</p></div><button class="button primary small" data-act="nav" data-view="domiciliarios">Gestionar</button></div></div>'+
 '<div class="section-title spaced"><h2>Todos los pedidos</h2></div>'+
 (model.orders.length?model.orders.map(adminOrderCard).join(''):empty('Sin pedidos','Cuando recibas un domicilio, aparecerá aquí.'))+
 '<p class="field-help">Puedes ajustar una tarifa solo mientras el pedido no haya sido asignado.</p>';
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
function adminSettings(){return `<div class="pagehead"><h1>Configuración</h1></div><div class="card"><h3>Estado de RutaYa</h3><p>${e(data.mode())}</p><p>Google Maps: ${hasGoogleKey()?'Clave configurada':'Pendiente de conectar API'}</p><p>Supabase: ${data.isLive?'Configurado':'Pendiente'}</p><button class="button outline small" data-act="enableAlerts">${icon('info',17)} Activar avisos mientras la página esté abierta</button></div>`}
function trackSteps(status){
 if(status==='cancelled')return '<div class="tracking-cancelled">'+icon('close',24)+' <div><b>Pedido cancelado</b><small>Este servicio ya no está disponible para reparto. Contacta al negocio si necesitas solicitar uno nuevo.</small></div></div>';
 const steps=[['pending','Solicitud recibida'],['accepted','Domiciliario asignado'],['at_pickup','Llegó al local'],['picked_up','Pedido recogido'],['at_dropoff','Llegó a tu dirección'],['delivered','Entrega confirmada']];
 const idx=steps.findIndex(x=>x[0]===status);
 return '<div class="timeline">'+steps.map(([id,title],i)=>'<div class="timeline-step '+(idx>i?'done':idx===i?'current':'')+'"><span class="step-icon">'+icon(idx>i?'check':'clock',18)+'</span><div><b>'+title+'</b><small>'+(idx>i?'Completado':idx===i?'En curso':'Pendiente')+'</small></div></div>').join('')+'</div>';
}
function trackingPage(){const o=model.track;const token=new URLSearchParams(location.search).get('token');if(!token)return `<div class="card"><h2>¿Quieres consultar un pedido?</h2><p>Abre el enlace individual que recibiste cuando se creó tu domicilio.</p><a href="${url('')}" class="button primary">Ir al inicio</a></div>`;if(!o)return `<div class="card">${empty('Pedido no encontrado','Si el enlace llegó desde otro celular y estamos en modo de demostración, todavía no se comparte entre dispositivos.','search')}</div>`;const loc=o.courier_location;const tracked=loc?.lat!=null&&loc?.lng!=null;return `<div class="pagehead"><div><span class="eyebrow" style="color:var(--purple)">ENLACE DE SEGUIMIENTO</span><h1 class="tracking-title">Sigue tu domicilio</h1></div></div><div class="card"><span class="badge ${o.status==='delivered'?'green':'gray'}">${icon('clock',15)} ${e(orderStatusText(o))}</span><h2 style="margin-top:16px">${e(serviceName(o.service))}</h2>${modeInfo(o)}<p>${e(o.items_description||'Entrega RutaYa')}</p><div class="inline-between"><small>Tarifa del domicilio</small><strong class="big-price">${money(o.fee)}</strong></div></div><div class="split"><div class="card"><div class="inline-between"><h2>Ubicación del domiciliario</h2>${icon('navigation',22)}</div>${tracked?`<div class="map-preview"><iframe loading="lazy" title="Ubicación del domiciliario en Google Maps" src="${googleEmbed(loc)}"></iframe></div><div class="driver-location space">${icon('crosshair',20)}<div><b>Última posición reportada</b><small>${prettyTime(loc.updated_at)} · Precisión GPS: ${Math.round(loc.accuracy||0)} m</small><p><a class="link" href="${navigationUrl(loc)}" target="_blank" rel="noopener">Abrir posición en Google Maps ${icon('external',15)}</a></p></div></div>`:`<div class="map-preview"><div class="map-fallback">${icon('route',38)}<b>${o.status==='delivered'?'Servicio entregado':o.status==='cancelled'?'Servicio cancelado':o.status==='pending'?'Esperando domiciliario':'Esperando señal GPS'}</b><small>${o.status==='delivered'?'La entrega finalizó; el mapa deja de mostrar la ubicación del repartidor.':o.status==='cancelled'?'El reparto ya no está activo.':o.status==='pending'?'La ubicación aparecerá cuando un repartidor acepte y active su GPS.':'El repartidor debe tener su página abierta y compartir ubicación. Si no hay señal reciente, no mostramos posiciones antiguas.'}</small></div></div>`}<p class="field-help">${tracked?'El marcador muestra la última ubicación recibida, no una transmisión continua.':'Estado actualizado: ${prettyTime(o.updated_at||o.created_at)}. Sin una posición GPS reciente disponible.'}</p></div><div class="card"><h2>Estado de la entrega</h2>${trackSteps(o.status)}<p class="field-help">Última actualización: ${prettyTime(o.updated_at||o.created_at)}</p><div class="divider"></div><div class="route-line"><span class="circle">${icon('shop',14)}</span><div class="route-detail"><b>Recogida</b><small>${e(o.pickup_address)}</small></div></div><div class="route-line drop"><span class="circle">${icon('pin',14)}</span><div class="route-detail"><b>Entrega</b><small>${e(o.dropoff_address)}</small></div></div></div></div><div class="hint">${icon('info',18)} La hora estimada de llegada y las paradas previas se mostrarán cuando conectemos un servicio de rutas y la asignación real. No incluimos una ETA ficticia.</div>`}
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

function pickerButton(field,label,draft){const p=draft[field];return `<label>${e(label)}</label><button class="pick-button" data-act="pick" data-field="${field}">${icon('pin',23)}<span class="pick-text"><strong>${p?'Ubicación confirmada':'Elegir ubicación'}</strong><small>${e(p?.address||'Buscar una dirección, elegir una anterior o usar GPS')}</small></span>${icon('chevron',19)}</button>`}
function formContent(){const d=model.draft;const service=model.service;const fields={shop:['¿Qué necesitas comprar?','Ej. Dos rollos de papel en el D1'],pickup:['¿Qué pedido deben recoger?','Ej. Pedido de Bella Shop a nombre de María'],parcel:['¿Qué vas a enviar?','Ej. Una carpeta de documentos']}[service];const zones=model.zones.map(z=>`<option value="${e(z.name)}" ${d.dropoff_zone===z.name?'selected':''}>${e(z.name)}${z.is_example===false?'':' · prueba'}</option>`).join('');return `<div class="hint">${icon('info',18)} ${service==='shop'?'Para comprar productos, acuerda el pago por adelantado antes de enviar al domiciliario. No hemos habilitado cobros electrónicos.':service==='pickup'?'Si ya pagaste tu compra, indícanos el nombre de la persona que la hizo.':'El paquete debe estar listo y protegido para transportarlo.'}</div><label for="detail">${fields[0]}</label><textarea id="detail" name="items_description" placeholder="${fields[1]}">${e(d.items_description||'')}</textarea>${pickerButton('pickup','1. ¿Dónde recogemos?',d)}${pickerButton('dropoff','2. ¿Dónde entregamos?',d)}${service==='pickup'?`<label for="shopper-name">¿A nombre de quién está el pedido?</label><input id="shopper-name" name="shopper_name" placeholder="Nombre y apellido" value="${e(d.shopper_name||'')}">`:''}<label for="recipient-name">¿Quién recibe?</label><input id="recipient-name" name="recipient_name" placeholder="Nombre del destinatario" value="${e(d.recipient_name||'')}"><label for="recipient-phone">Teléfono de contacto</label><input type="tel" id="recipient-phone" name="recipient_phone" placeholder="Celular del destinatario" value="${e(d.recipient_phone||'')}">${service==='pickup'?`<label>¿El producto ya está pagado?</label><select name="paid"><option value="true" ${d.paid!==false?'selected':''}>Sí, está pagado</option><option value="false" ${d.paid===false?'selected':''}>No, falta cancelar</option></select>${d.paid===false?`<label>Valor por pagar en la tienda (COP)</label><input type="number" min="0" name="amount_to_collect" value="${e(d.amount_to_collect||'')}">`:''}`:''}<label>Zona de entrega (tarifa)</label><select name="dropoff_zone"><option value="">Selecciona zona para estimar</option>${zones}</select>${modeSelector(d)}<div class="location-card space"><div class="inline-between"><span>Tarifa de domicilio</span><strong class="big-price">${money(data.estimateFee(model.zones,d.dropoff_zone,d.delivery_mode||'normal'))}</strong></div><small>${e(zoneEstimateNote(d.dropoff_zone))}</small></div><label>Indicaciones (opcional)</label><input name="delivery_notes" placeholder="Casa de portón negro, segundo piso..." value="${e(d.delivery_notes||'')}">`}
function businessFormContent(){const d=model.businessDraft;const s=model.store;return `<div class="hint">${icon('shop',18)} Recogeremos el pedido en <strong>${e(s?.name||'tu negocio')}</strong>: ${e(s?.address||'primero registra su ubicación.')}</div><label>¿Qué se entrega?</label><input name="items_description" placeholder="Ej. Set de esmaltes y lámpara" value="${e(d.items_description||'')}">${pickerButton('dropoff','Dirección del cliente',d)}<label>Nombre del destinatario</label><input name="recipient_name" value="${e(d.recipient_name||'')}" placeholder="Ej. Ana Rodríguez"><label>Teléfono de contacto</label><input type="tel" name="recipient_phone" value="${e(d.recipient_phone||'')}" placeholder="Celular"><label>¿El producto está pagado?</label><select name="paid"><option value="true" ${d.paid!==false?'selected':''}>Sí, ya pagó</option><option value="false" ${d.paid===false?'selected':''}>No, falta cobrar</option></select>${d.paid===false?`<label>Valor pendiente de cobrar (COP)</label><input type="number" name="amount_to_collect" min="0" value="${e(d.amount_to_collect||'')}">`:''}<label>Zona de entrega (tarifa de RutaYa)</label><select name="dropoff_zone"><option value="">Selecciona zona</option>${model.zones.map(z=>`<option value="${e(z.name)}" ${d.dropoff_zone===z.name?'selected':''}>${e(z.name)}${z.is_example===false?'':' · prueba'}</option>`).join('')}</select>${modeSelector(d)}<div class="location-card space"><div class="inline-between"><span>Tarifa estimada</span><strong class="big-price">${money(data.estimateFee(model.zones,d.dropoff_zone,d.delivery_mode||'normal'))}</strong></div><small>${e(zoneEstimateNote(d.dropoff_zone))}</small></div><label>Notas para la entrega</label><input name="delivery_notes" value="${e(d.delivery_notes||'')}" placeholder="Ej. Tocar el timbre del apartamento 202">`}
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
function render(){if(model.loading){root.innerHTML=header()+`<main class="wrap header-space"><div class="card">Preparando RutaYa…</div></main>`;return}if(model.error){root.innerHTML=header()+`<main class="wrap header-space"><div class="notice">${e(model.error)}</div></main>`;return}if(page==='seguimiento'){root.innerHTML=header()+`<main class="wrap header-space">${modeBanner()}${trackingPage()}</main>`+footer();return}let needsAuth=data.isLive&&!model.user&&page!=='cliente';let needsRole=data.isLive&&model.user&&page!=='cliente'&&page!=='seguimiento'&&page!=='repartidores'&&(page==='admin'?!(model.profile?.is_admin||model.profile?.role==='admin'):model.profile?.role!=='business');if(needsAuth||needsRole){root.innerHTML=header()+`<main class="wrap header-space"><div class="card" style="max-width:530px;margin:auto"><h2>${needsAuth?'Inicia sesión para continuar':'Acceso restringido'}</h2><p>${needsAuth?'Necesitas una cuenta RutaYa.':'Esta cuenta no tiene autorización para este panel. Contacta al administrador para asignar el rol correspondiente.'}</p><button class="button primary" data-act="${needsAuth?'openAuth':'signout'}">${needsAuth?'Ingresar o registrarme':'Cambiar de cuenta'}</button></div></main>`+(model.auth?authModal():'');return}if(page==='repartidores'&&data.isLive&&model.user&&(model.profile?.role!=='courier'||!model.profile?.approved)){root.innerHTML=header()+`<main class="wrap header-space">${courierApplicationPage()}</main>`+footer();return}let body='';if(page==='cliente')body=model.view==='pedidos'?clientOrders():model.view==='cuenta'?accountView():clientHome();else if(page==='negocios')body=model.view==='pedidos'?businessOrders():model.view==='cuenta'?storeCard()+accountView():businessHome();else if(page==='repartidores')body=model.view==='pedidos'?courierOrders():model.view==='cuenta'?courierAccount():courierHome();else if(page==='admin')body=model.view==='domiciliarios'?adminCourierPage():model.view==='pedidos'?adminRates():model.view==='cuenta'?adminSettings():adminHome();root.innerHTML=header()+`<main class="wrap with-nav header-space">${modeBanner()}${body}</main>`+footer()+bottomNav()+(model.showForm==='store'?storeModal():model.showForm?(page==='negocios'?modal('Nueva entrega desde el negocio',businessFormContent(),`<button class="button outline" data-act="closeModal">Cancelar</button><button class="button primary" data-act="submitBusiness">Crear solicitud</button>`):modal('Solicitar '+serviceName(model.service).toLowerCase(),formContent(),`<button class="button outline" data-act="closeModal">Cancelar</button><button class="button primary" data-act="submitCustomer">Crear pedido</button>`)):'')+(model.auth?authModal():'')+(model.manageAction?manageOrderModal():'')}
async function refresh(){const before=model.orders;const next=await data.listOrders(page);const notice=changedOrderNotice(before,next);model.orders=next;if(page==='admin'&&(model.profile?.is_admin||model.profile?.role==='admin'))model.couriers=await data.listCouriers();if(page==='negocios'&&model.businessTrackingToken){try{model.businessTrackingData=await data.getTracking(model.businessTrackingToken)}catch(err){console.warn('No se pudo refrescar seguimiento',err)}}if(page==='seguimiento'){model.track=await data.getTracking(new URLSearchParams(location.search).get('token'))}render();if(!model.manageAction&&!model.showForm&&!model.auth)orderUpdateNotice(notice)}
async function initialize(){try{await data.init();
 if(data.isLive&&page==='cliente'){
  data.getClient()?.auth.onAuthStateChange((event)=>{
   if(event==='PASSWORD_RECOVERY'){
    model.passwordRecovery=true;model.auth='password';model.loading=false;render();
   }
  });
 }model.user=await data.currentUser();model.profile=await data.profile();model.zones=await data.getZones();model.knownStores=await data.getPublicStores();if(page==='negocios')model.store=await data.getStore();if(page==='admin'||page==='cliente'||page==='negocios'||page==='repartidores')model.orders=await data.listOrders(page);if(page==='admin'&&model.user&&(model.profile?.is_admin||model.profile?.role==='admin')){model.couriers=await data.listCouriers();model.adminZones=await data.getAdminZones()}if(page==='seguimiento'){model.track=await data.getTracking(new URLSearchParams(location.search).get('token'));model.poll=setInterval(async()=>{try{model.track=await data.getTracking(new URLSearchParams(location.search).get('token'));render()}catch(err){console.warn(err)}},8500)}if(data.isLive&&model.user==null&&page!=='seguimiento'&&page!=='cliente')model.auth=true;if(page==='cliente'&&model.passwordRecovery&&model.user)model.auth='password';model.loading=false;render()}catch(err){console.error(err);model.error=err.message;model.loading=false;render()}}
function draftChange(el){let draft=page==='negocios'?model.businessDraft:model.draft;if(!el.name)return;draft[el.name]=el.name==='paid'?el.value==='true':el.value; if(el.name==='paid'||el.name==='dropoff_zone'||el.name==='delivery_mode')render()}
root.addEventListener('input',ev=>{let t=ev.target;if(t.matches('.modal [name]'))draftChange(t)});
root.addEventListener('change',ev=>{let t=ev.target;if(t.matches('.modal [name]'))draftChange(t)});
root.addEventListener('click',async ev=>{const b=ev.target.closest('[data-act]');if(!b)return;const action=b.dataset.act;const id=b.dataset.id;try{if(action==='nav'){if(data.isLive&&!model.user&&b.dataset.view==='pedidos'){model.auth=true;render();notify('Ingresa para ver tus pedidos.');return}model.view=b.dataset.view;render();window.scrollTo({top:0,behavior:'smooth'})}else if(action==='service'){if(data.isLive&&!model.user){model.auth=true;model.registration=true;render();notify('Regístrate o inicia sesión para pedir un domicilio.');return}model.service=b.dataset.service;model.draft=model.draft||{};model.showForm=true;render()}else if(action==='businessForm'){if(model.store?.lat==null){notify('Primero configura la ubicación GPS de tu negocio.');model.showForm=false;model.view='cuenta';render();return}model.showForm=true;render()}else if(action==='closeModal'){model.showForm=false;model.auth=null;render()}else if(action==='pick'||action==='pickStore'){let isStore=action==='pickStore';if(isStore){model.store={...(model.store||{}),name:document.getElementById('store-name')?.value||'Bella Shop',address:document.getElementById('store-address')?.value||''}}let draft=page==='negocios'?model.businessDraft:model.draft;let field=b.dataset.field;let initial=isStore?(model.store?.lat!=null?{address:model.store.address,lat:model.store.lat,lng:model.store.lng}:null):draft[field]||null;let result=await openPicker({title:isStore?'Ubicación de mi negocio':field==='pickup'?'Punto de recogida':'Punto de entrega',starting:initial,knownStores:model.knownStores,recentPlaces:isStore?[]:recentPlacesFor(field),onSelect:null});if(result){if(isStore){model.store={...(model.store||{}),...result};}else draft[field]=result;render();}}else if(action==='editStore'){model.showForm='store';render()}else if(action==='saveStore'){const name=document.getElementById('store-name')?.value.trim(),address=document.getElementById('store-address')?.value.trim();if(!name||!address||model.store?.lat==null)throw Error('Indica el nombre, la dirección y el punto GPS de la tienda.');model.store=await data.saveStore({name,address,lat:model.store.lat,lng:model.store.lng});model.knownStores=await data.getPublicStores();model.showForm=false;notify('Ubicación del negocio guardada. Ahora se puede buscar por su nombre.');render()}else if(action==='submitCustomer'||action==='submitBusiness'){if(model.sending)return;model.sending=true;b.disabled=true;try{let bus=action==='submitBusiness',d=bus?model.businessDraft:model.draft;const p=bus?model.store:null;if(!d.items_description?.trim()||(!bus&&!d.pickup)||!d.dropoff)throw Error('Completa el detalle y selecciona los puntos de recogida y entrega en el mapa.');if(!d.recipient_name?.trim())throw Error('Falta el nombre del destinatario.');
const phoneDigits=String(d.recipient_phone||'').replace(/\D/g,'');
if(!/^3\d{9}$/.test(phoneDigits)&&!/^573\d{9}$/.test(phoneDigits))
 throw Error('Escribe el celular colombiano del destinatario (10 dígitos) para contacto y seguimiento.');if(!d.dropoff_zone)throw Error('Selecciona la zona de entrega para calcular la tarifa.');if(!bus&&model.service==='pickup'&&!d.shopper_name?.trim())throw Error('Indica a nombre de quién está el pedido.');if(d.paid===false&&!(Number(d.amount_to_collect)>0))throw Error('Debes indicar cuánto falta por pagar.');let input={source:bus?'business':'customer',service:bus?'business':model.service,items_description:d.items_description.trim(),pickup_name:bus?p.name:'',pickup_address:bus?p.address:d.pickup.address,pickup_lat:bus?p.lat:d.pickup.lat,pickup_lng:bus?p.lng:d.pickup.lng,dropoff_address:d.dropoff.address,dropoff_lat:d.dropoff.lat,dropoff_lng:d.dropoff.lng,dropoff_zone:d.dropoff_zone||'',recipient_name:d.recipient_name.trim(),recipient_phone:d.recipient_phone||'',shopper_name:bus?'':d.shopper_name||'',paid:d.paid!==false,amount_to_collect:d.paid===false?Math.round(+d.amount_to_collect):0,delivery_notes:d.delivery_notes||'',delivery_mode:d.delivery_mode||'normal'};let order=await data.createOrder(input);model.showForm=false;if(bus)model.businessDraft={};else model.draft={};model.view='pedidos';await refresh();notify(bus?'¡Solicitud creada! Pulsa WhatsApp clienta para enviar el seguimiento.':'¡Pedido creado! Consulta su seguimiento en Mis pedidos.');}finally{model.sending=false}}else if(action==='trackBusiness'){model.businessTrackingToken=b.dataset.token;model.businessTrackingData=await data.getTracking(model.businessTrackingToken);render();document.querySelector('.business-live')?.scrollIntoView({behavior:'smooth',block:'nearest'})}else if(action==='closeBusinessTrack'){model.businessTrackingToken=null;model.businessTrackingData=null;render()}else if(action==='copyCourierInvite'){const link=url('repartidores/');const message='Regístrate como domiciliario en RutaYa: '+link+'\nCrea tu cuenta, envía tu solicitud y espera la aprobación para recibir servicios.';try{await navigator.clipboard.writeText(message);notify('Enlace de inscripción copiado. Envíalo por WhatsApp al domiciliario.')}catch{prompt('Copia y envía este enlace al repartidor:',message)}}else if(action==='applyCourier'){const phone=document.getElementById('courier-phone')?.value.trim();const vehicle=document.getElementById('courier-vehicle')?.value;if(!phone||!vehicle)throw Error('Indica tu celular y el tipo de vehículo.');b.disabled=true;await data.requestCourier(phone,vehicle);model.profile=await data.profile();render();notify('Solicitud enviada. La administración debe aprobarte antes de poder repartir.')}else if(action==='checkCourierApproval'){model.profile=await data.profile();if(model.profile?.role==='courier'&&model.profile.approved){model.orders=await data.listOrders('repartidores');notify('¡Tu cuenta ya está aprobada!')}else notify('Tu solicitud todavía está pendiente de aprobación.');render()}else if(action==='reviewCourier'){const userId=b.dataset.user;const approve=b.dataset.approve==='true';if(!model.profile?.is_admin&&!model.profile?.role==='admin')throw Error('No tienes autorización para aprobar domiciliarios.');if(!confirm(approve?'¿Aprobar a este domiciliario para recibir y aceptar pedidos en RutaYa? Comprueba primero su identidad.':'¿Suspender el acceso de este domiciliario a nuevos pedidos?'))return;b.disabled=true;await data.reviewCourier(userId,approve);model.couriers=await data.listCouriers();render();notify(approve?'Domiciliario aprobado y habilitado.':'Acceso del domiciliario suspendido.')}else if(action==='copyTrack'){let link=url('seguimiento/?token='+encodeURIComponent(b.dataset.token));try{await navigator.clipboard.writeText(link);notify('Enlace copiado. Compártelo con el cliente.')}catch{prompt('Copia el enlace de seguimiento:',link)}}else if(action==='courierGps'){if(model.gpsWatch!=null){notify('El GPS ya está activo mientras la página esté abierta.');return}if(!navigator.geolocation)throw Error('El navegador no ofrece geolocalización.');const p=await gps();model.courierGps=p;try{await data.updateCourierLocation(p)}catch(err){console.warn(err)}let last=0;model.gpsWatch=navigator.geolocation.watchPosition(async pos=>{const point={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy};model.courierGps=point;if(Date.now()-last>14000){last=Date.now();try{await data.updateCourierLocation(point)}catch(err){console.warn(err)}}},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});notify('GPS activado. Mantén la página abierta para transmitir ubicación.');render()}else if(action==='claim'){await data.claimOrder(id);await refresh();notify('Servicio aceptado. Primero ve al punto de recogida.')}else if(action==='courierMap'){model.courierMapOrderId=id;model.courierMapStage=b.dataset.stage==='dropoff'?'dropoff':'pickup';render();document.querySelector('.courier-map-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'})}else if(action==='closeCourierMap'){model.courierMapOrderId=null;render()}else if(action==='progress'){b.disabled=true;const location=await gps();await data.progressOrder(id,b.dataset.next,location);model.courierGps=location;await refresh();notify('Estado confirmado con GPS.')}else if(action==='manageOrder'){
 const operation=b.dataset.operation;
 if(!['cancel','release','reassign','assign'].includes(operation))throw Error('Operación no válida');
 model.manageAction=operation;model.manageOrderId=id;render();
}else if(action==='closeManage'){
 model.manageAction=null;model.manageOrderId=null;render();
}else if(action==='confirmManage'){
 if(model.sending)return;
 const op=model.manageAction;
 const reason=document.getElementById('ry-manage-reason')?.value.trim()||'';
 if(reason.length<5)throw Error('Escribe un motivo de al menos cinco caracteres');
 model.sending=true;b.disabled=true;
 try{
  if(op==='cancel')await data.cancelOrder(id,reason);
  else if(op==='release')await data.releaseOrder(id,reason);
  else if(op==='reassign')await data.reassignOrder(id,reason);
  else if(op==='assign'){const courierId=document.getElementById('ry-manage-courier')?.value;if(!courierId)throw Error('Selecciona un domiciliario aprobado');await data.assignOrder(id,courierId,reason)}
  else throw Error('Operación inválida');
  model.manageAction=null;model.manageOrderId=null;
  await refresh();
  notify(op==='cancel'?'Pedido cancelado.':op==='release'?'Servicio liberado para otro domiciliario.':op==='assign'?'Domiciliario asignado.':'Pedido devuelto a disponibles para reasignación.');
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
}else if(action==='openAuth'){model.registration=false;model.auth=true;render()}else if(action==='toggleRegistration'){model.registration=!model.registration;render()}else if(action==='submitAuth'){const email=document.getElementById('auth-email')?.value.trim(),password=document.getElementById('auth-pass')?.value;const name=document.getElementById('auth-name')?.value.trim();if(!email||!password)throw Error('Escribe correo y contraseña.');if(model.registration){await data.signUp(email,password,name);model.user=await data.currentUser();if(!model.user){model.registration=false;model.auth=true;render();notify('Registro recibido. Revisa tu correo para confirmar la cuenta y luego inicia sesión.');return}notify('¡Cuenta creada! Ya tienes tu sesión iniciada.')}else{await data.signIn(email,password);model.user=await data.currentUser();if(!model.user)throw Error('No se pudo iniciar sesión. Revisa tu correo o contraseña.');notify('¡Iniciaste sesión correctamente!')}model.profile=await data.profile();model.auth=false;model.registration=false;model.orders=await data.listOrders(page);if(page==='admin'&&(model.profile?.is_admin||model.profile?.role==='admin')){model.couriers=await data.listCouriers();model.adminZones=await data.getAdminZones()}render()}else if(action==='signout'){await data.signOut();model.user=null;model.profile=null;model.auth=true;render()}}catch(err){console.error(err);notify(err.message||'Ocurrió un error. Vuelve a intentar.');b.disabled=false}});
window.addEventListener('storage',()=>{if(!data.isLive)refresh().catch(console.error)});
window.addEventListener('rutaya-refresh',()=>{if(!data.isLive)refresh().catch(console.error)});
if(data.isLive){setInterval(()=>{if(page!=='seguimiento'&&!model.loading&&!model.error&&model.user&&!model.showForm&&!model.auth&&!model.manageAction&&!(page==='admin'&&model.view==='pedidos'))refresh().catch(()=>{})},12000)}
initialize();