const CONFIG=window.RUTAYA_CONFIG||{};
const STORAGE='rutaya_v4_pilot';
const fallback={orders:[],store:{name:'Bella Shop',address:'',lat:null,lng:null,verified:false},zones:[{name:'Centro',fee:4000},{name:'Norte',fee:5000},{name:'Sur',fee:5000},{name:'Occidente',fee:6000}],courierLocation:null};
function read(){try{return {...structuredClone(fallback),...JSON.parse(localStorage.getItem(STORAGE)||'{}')}}catch{return structuredClone(fallback)}}
function write(d){localStorage.setItem(STORAGE,JSON.stringify(d));window.dispatchEvent(new Event('rutaya-refresh'))}
export const isLive=!!(CONFIG.supabaseUrl?.trim()&&CONFIG.supabaseAnonKey?.trim());
let api=null;
export async function init(){if(!isLive)return;if(!window.supabase?.createClient)throw Error('No cargó la conexión con Supabase. Comprueba internet.');api=window.supabase.createClient(CONFIG.supabaseUrl.trim(),CONFIG.supabaseAnonKey.trim(),{auth:{persistSession:true,autoRefreshToken:true}});}
export function mode(){return isLive?'Conectado a Supabase':'Demostración local'}
export async function currentUser(){if(!isLive)return {id:'demo-local',email:'demo@rutaya.local'};const {data,error}=await api.auth.getUser();if(error)return null;return data.user||null}
export async function profile(){if(!isLive)return {role:'demo'};let u=await currentUser();if(!u)return null;const {data,error}=await api.from('profiles').select('*').eq('user_id',u.id).maybeSingle();if(error)throw error;return data}
export async function signIn(email,password){const {data,error}=await api.auth.signInWithPassword({email,password});if(error)throw error;return data}
export async function signUp(email,password,name){const {data,error}=await api.auth.signUp({email,password,options:{data:{display_name:name}}});if(error)throw error;return data}
export async function signOut(){if(isLive){const {error}=await api.auth.signOut();if(error)throw error}}
export async function getStore(){if(!isLive)return read().store;let user=await currentUser();if(!user)return null;const {data,error}=await api.from('businesses').select('id,name,address,lat,lng,approved').eq('owner_user_id',user.id).maybeSingle();if(error)throw error;return data}
export async function getPublicStores(){if(!isLive){const s=read().store;return s?[s]:[]}const {data,error}=await api.from('businesses').select('id,name,address,lat,lng').eq('approved',true).not('lat','is',null).limit(200);if(error)throw error;return data||[]}
export async function saveStore(input){if(!isLive){let d=read();d.store={...d.store,...input,verified:input.lat!=null&&input.lng!=null};write(d);return d.store}const {data,error}=await api.rpc('set_business_location',{p_name:input.name,p_address:input.address,p_lat:input.lat,p_lng:input.lng});if(error)throw error;return data}
export async function getZones(){if(!isLive)return read().zones;const {data,error}=await api.from('tariff_zones').select('name,fee').order('name');if(error)throw error;return data||[]}
export async function saveZones(zones){if(!isLive){let d=read();d.zones=zones;write(d);return}throw Error('Las tarifas reales se administran mediante el panel SQL seguro de Supabase. No se editan desde el navegador.')}
export async function createOrder(order){if(!isLive){let d=read();const p={...order,id:crypto.randomUUID(),tracking_token:crypto.randomUUID(),status:'pending',delivery_mode:order.delivery_mode||'normal',dispatch_after:calculateDispatchAfter(order.delivery_mode||'normal'),fee:estimateFee(d.zones,order.dropoff_zone,order.delivery_mode||'normal'),courier_id:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};d.orders.unshift(p);write(d);return p}let {data,error}=await api.rpc('create_rutaya_order',{p_data:order});if(error)throw error;return data}
export function estimateFee(zones,zone,mode='normal'){const base=zones.find(x=>x.name.toLowerCase()===String(zone||'').toLowerCase())?.fee;return base==null?null:Math.max(0,Number(base)+(mode==='routed'?-1000:mode==='urgent'?1500:0))}
export function calculateDispatchAfter(mode='normal'){if(mode!=='routed')return new Date().toISOString();const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));const date=new Date(Date.UTC(parts.year,parts.month-1,parts.day+(parts.hour>=12?1:0),19,0,0));return date.toISOString()}
export async function listOrders(role){if(!isLive){let o=read().orders;return role==='cliente'?o.filter(p=>p.source==='customer'):role==='negocios'?o.filter(p=>p.source==='business'):role==='repartidores'?o.filter(p=>p.status!=='delivered'&&p.status!=='cancelled'&&(p.status!=='pending'||!p.dispatch_after||Date.parse(p.dispatch_after)<=Date.now())):o}let q=api.from('orders').select('*').order('created_at',{ascending:false}).limit(120);if(role==='repartidores'){let u=await currentUser();q=q.or(`status.eq.pending,courier_id.eq.${u?.id||'00000000-0000-0000-0000-000000000000'}`)}const {data,error}=await q;if(error)throw error;return data||[]}
export async function getTracking(token){if(!token)return null;if(!isLive){const d=read();let o=d.orders.find(x=>x.tracking_token===token);return o?{...o,courier_location:o.courier_id?d.courierLocation:null}:null}const {data,error}=await api.rpc('track_rutaya_order',{p_token:token});if(error)throw error;return data}
export async function claimOrder(id){if(!isLive){let d=read(),o=d.orders.find(x=>x.id===id);if(!o||o.status!=='pending')throw Error('Este pedido ya no está disponible.');if(o.fee==null)throw Error('RutaYa debe confirmar la tarifa antes de asignar un domiciliario.');if(o.dispatch_after&&Date.parse(o.dispatch_after)>Date.now())throw Error('La entrega enrutada estará disponible para reparto desde la tarde programada.');let act=d.orders.filter(x=>x.courier_id==='demo-courier'&&!['delivered','cancelled'].includes(x.status));if(act.length>=5)throw Error('Ya tienes cinco servicios activos.');if(act.some(x=>['picked_up','at_dropoff'].includes(x.status)))throw Error('Termina de entregar lo que ya recogiste antes de tomar otro servicio.');o.status='accepted';o.courier_id='demo-courier';o.updated_at=new Date().toISOString();write(d);return o}const {data,error}=await api.rpc('claim_rutaya_order',{p_order_id:id});if(error)throw error;return data}
export async function progressOrder(id,next,location){if(!isLive){let d=read(),o=d.orders.find(x=>x.id===id);if(!o||o.courier_id!=='demo-courier')throw Error('Este pedido no está asignado.');const allowed={accepted:'at_pickup',at_pickup:'picked_up',picked_up:'at_dropoff',at_dropoff:'delivered'};if(allowed[o.status]!==next)throw Error('Debes completar el paso anterior primero.');let dest=['at_pickup','picked_up'].includes(next)?{lat:o.pickup_lat,lng:o.pickup_lng}:{lat:o.dropoff_lat,lng:o.dropoff_lng};if(dest.lat==null||dest.lng==null)throw Error('El pedido no tiene un punto GPS confirmado.');if(!location||location.accuracy>100||distance(location,dest)>200)throw Error('Debes estar a menos de 200 metros del punto y tener señal GPS precisa para confirmar.');o.status=next;o.updated_at=new Date().toISOString();d.courierLocation={lat:location.lat,lng:location.lng,accuracy:location.accuracy,updated_at:o.updated_at};write(d);return o}const {data,error}=await api.rpc('progress_rutaya_order',{p_order_id:id,p_next:next,p_lat:location.lat,p_lng:location.lng,p_accuracy:location.accuracy});if(error)throw error;return data}
export async function updateCourierLocation(point){if(!point||point.accuracy>100)return;if(!isLive){let d=read();d.courierLocation={...point,updated_at:new Date().toISOString()};write(d);return}const {error}=await api.rpc('update_rutaya_courier_location',{p_lat:point.lat,p_lng:point.lng,p_accuracy:point.accuracy});if(error)throw error}
export async function setOrderFee(id,fee){if(!isLive){let d=read(),o=d.orders.find(x=>x.id===id);if(!o)throw Error('Pedido no encontrado');o.fee=fee;write(d);return}const {error}=await api.rpc('admin_set_rutaya_fee',{p_order_id:id,p_fee:fee});if(error)throw error}
export function distance(a,b){const toRad=Math.PI/180,x=(b.lat-a.lat)*toRad,y=(b.lng-a.lng)*toRad;const h=Math.sin(x/2)**2+Math.cos(a.lat*toRad)*Math.cos(b.lat*toRad)*Math.sin(y/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
export function getClient(){return api}

export async function requestCourier(phone,vehicle){
 if(!isLive)throw Error('El registro de repartidores necesita Supabase');
 if(!api)throw Error('No hay conexión con RutaYa');
 const {data,error}=await api.rpc('request_rutaya_courier',{p_phone:phone,p_vehicle:vehicle});
 if(error)throw error;
 return data;
}
export async function listCouriers(){
 if(!isLive)return [];
 const {data,error}=await api.rpc('list_rutaya_couriers');
 if(error)throw error;
 return data||[];
}
export async function reviewCourier(userId,approve){
 if(!isLive)throw Error('Necesitas conexión para aprobar repartidores');
 const {error}=await api.rpc('review_rutaya_courier',{p_user_id:userId,p_approve:approve});
 if(error)throw error;
}

