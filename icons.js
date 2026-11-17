const paths={
  logo:'<path d="M4 13h7l4-6h5l3 7h-6"/><circle cx="10" cy="18" r="2"/><circle cx="20" cy="18" r="2"/><path d="M2 8h7"/>',
  pin:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  bag:'<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
  box:'<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10M7 5l9 4"/>',
  shop:'<path d="M3 10V7l2-4h14l2 4v3M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0M5 13v8h14v-8M9 21v-6h6v6"/>',
  truck:'<path d="M3 6h12v12H3zM15 10h4l3 4v4h-7"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  home:'<path d="m3 11 9-8 9 8v10H3V11Z"/><path d="M9 21v-7h6v7"/>',
  clipboard:'<rect x="5" y="5" width="14" height="17" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 15h6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-7 8-7s8 2 8 7"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  arrowLeft:'<path d="M19 12H5m6-6-6 6 6 6"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  checkCircle:'<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  navigation:'<path d="m4 11 17-8-8 18-2-8-7-2Z"/>',
  crosshair:'<circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="2"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  close:'<path d="M5 5 19 19M19 5 5 19"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9M18 13v7H4V6h7"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M10 2h4l1 3 2 1 3-1 2 4-2 2v2l2 2-2 4-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-4 2-2v-2L2 9l2-4 3 1 2-1 1-3Z"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  shield:'<path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
  alert:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout:'<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M14 7l5 5-5 5M19 12H9"/>',
  location:'<path d="m3 12 8 3 10-12-4 18-6-6-8-3Z"/>',
  route:'<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V8c0-5 12-5 12 0v7"/>',
  receipt:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  heart:'<path d="M20.8 4.6c-2-2-5.1-2-7.1 0L12 6.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21l8.8-9.3a5 5 0 0 0 0-7.1Z"/>',
  phone:'<path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM10 19h4"/>'
};
export function icon(name,size=21,extra=''){return `<svg class="ico ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.info}</svg>`;}
export function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
export function money(n){return n==null?'Por confirmar':('$'+Math.max(0,Number(n)||0).toLocaleString('es-CO'));}
export function prettyTime(v){try{return new Date(v).toLocaleString('es-CO',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}catch{return ''}}
export function statusText(status){return ({pending:'Buscando domiciliario',accepted:'Domiciliario asignado',at_pickup:'Llegó al punto de recogida',picked_up:'Pedido recogido',at_dropoff:'Llegó al destino',delivered:'Pedido entregado',cancelled:'Pedido cancelado'})[status]||status;}
export function serviceName(s){return ({shop:'Comprar en tienda',pickup:'Recoger pedido',parcel:'Enviar paquete',business:'Entrega de negocio'})[s]||s;}
