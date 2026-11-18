import {icon,escapeHTML} from './icons.js';
const CONFIG=window.RUTAYA_CONFIG||{};
let mapsPromise=null;
function loadGoogle(){if(!CONFIG.googleMapsApiKey?.trim())return Promise.resolve(null);if(window.google?.maps)return Promise.resolve(window.google.maps);if(mapsPromise)return mapsPromise;mapsPromise=new Promise((resolve,reject)=>{const cb='rutayaMapsReady_'+Math.random().toString(36).slice(2);window[cb]=()=>{delete window[cb];resolve(window.google.maps)};const s=document.createElement('script');s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(CONFIG.googleMapsApiKey.trim())+'&v=weekly&libraries=places&callback='+cb+'&loading=async';s.async=true;s.onerror=()=>{delete window[cb];reject(new Error('Google Maps no cargó. Revisa la clave, la facturación y las restricciones de dominio.'))};document.head.append(s)});return mapsPromise;}
export function hasGoogleKey(){return !!CONFIG.googleMapsApiKey?.trim()}
export async function initPickerMap(root,selected,onChoose){const g=await loadGoogle();if(!g)return null;const center=selected||CONFIG.cityCenter||{lat:2.4448,lng:-76.6147};const map=new g.Map(root,{center,zoom:16,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'greedy'});const marker=new g.Marker({map,position:center,draggable:true});let latest=selected||null;function picked(pos){latest={lat:pos.lat(),lng:pos.lng()};marker.setPosition(latest);onChoose(latest)}map.addListener('click',e=>picked(e.latLng));marker.addListener('dragend',e=>picked(e.latLng));return {map,set(point){map.panTo(point);map.setZoom(17);marker.setPosition(point);latest=point;onChoose(point)},setWithoutSelect(point){map.panTo(point);map.setZoom(17);marker.setPosition(point)},get(){return latest}}}
export async function addGoogleAutocomplete(host,onPick){const g=await loadGoogle();if(!g)return null;const {PlaceAutocompleteElement}=await g.importLibrary('places');const el=new PlaceAutocompleteElement();el.setAttribute('placeholder','Buscar una dirección o comercio');el.style.width='100%';host.append(el);el.addEventListener('gmp-select',async({placePrediction})=>{try{const place=placePrediction.toPlace();await place.fetchFields({fields:['displayName','formattedAddress','location']});if(place.location){onPick({lat:place.location.lat(),lng:place.location.lng(),address:place.formattedAddress||place.displayName||''})}}catch(e){console.error(e)}});return el}
export function navigationUrl(place){if(!place)return 'https://www.google.com/maps';const dest=place.lat!=null&&place.lng!=null?`${place.lat},${place.lng}`:place.address||'';return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(dest)+'&travelmode=driving&dir_action=navigate'}

export function trackingRouteUrl(origin,destination){
 if(origin?.lat==null||origin?.lng==null||destination?.lat==null||destination?.lng==null)return null;
 const originStr=Number(origin.lat)+','+Number(origin.lng);
 const destinationStr=Number(destination.lat)+','+Number(destination.lng);
 if(![origin.lat,origin.lng,destination.lat,destination.lng].every(v=>Number.isFinite(Number(v))))return null;
 return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(originStr)+
  '&destination='+encodeURIComponent(destinationStr)+'&travelmode=driving';
}
export function mapsSearchUrl(query){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query||'Popayán, Colombia')}
export function googleEmbed(center){if(!center||center.lat==null||center.lng==null)return null;return 'https://www.google.com/maps?q='+encodeURIComponent(center.lat+','+center.lng)+'&z=15&output=embed'}
export function parseCoordinate(value){const v=String(value||'').trim();let m=v.match(/^\s*(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)\s*$/);if(!m)m=v.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)/);if(!m)m=v.match(/[?&](?:q|ll)=(-?\d+\.\d+)%?2[Cc](-?\d+\.\d+)/);if(!m)m=v.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);if(!m)return null;const lat=+m[1],lng=+m[2];return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null}
export async function gps({allowApproximate=false}={}){
 if(typeof isSecureContext==='boolean'&&!isSecureContext)throw Error('Para usar GPS abre RutaYa en una página HTTPS (Chrome o Safari).');
 if(!navigator.geolocation)throw Error('Este navegador no permite solicitar ubicación. Abre el enlace en Chrome o Safari, o marca tu casa en el mapa.');
 const locate=options=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(
  pos=>{
   const point={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy};
   if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))reject(Error('El teléfono no entregó coordenadas válidas.'));
   else resolve(point);
  },reject,options));
 try{
  return await locate({enableHighAccuracy:true,maximumAge:0,timeout:18000});
 }catch(firstError){
  if(firstError?.code===1)throw Error('La ubicación está bloqueada. En ajustes del celular permite la ubicación a este navegador. Si abriste el enlace dentro de WhatsApp, usa su menú para abrirlo en Chrome o Safari; también puedes marcar tu casa en el mapa.');
  if(allowApproximate){
   try{return await locate({enableHighAccuracy:false,maximumAge:60000,timeout:10000})}
   catch(secondError){if(secondError?.code===1)throw Error('No autorizaste la ubicación. Puedes marcar tu dirección manualmente en el mapa.')}
  }
  if(firstError?.code===3)throw Error('Tu celular tardó demasiado en obtener GPS. Activa la ubicación del teléfono, intenta en un lugar abierto o marca tu casa en el mapa.');
  throw Error('No fue posible obtener el GPS. Revisa que la ubicación del teléfono esté encendida y que el navegador tenga permiso. También puedes tocar «Marcar en el mapa».');
 }
}

let leafletPromise=null;
function loadLeaflet(){
 if(window.L)return Promise.resolve(window.L);
 if(leafletPromise)return leafletPromise;
 leafletPromise=new Promise((resolve,reject)=>{
  let stylesheet=document.getElementById('rutaya-leaflet-css');
  const cssReady=new Promise(done=>{
   if(stylesheet&&stylesheet.dataset.ready==='yes'){done();return}
   if(!stylesheet){
    stylesheet=document.createElement('link');
    stylesheet.id='rutaya-leaflet-css';stylesheet.rel='stylesheet';
    stylesheet.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
    document.head.append(stylesheet);
   }
   stylesheet.addEventListener('load',()=>{stylesheet.dataset.ready='yes';done()},{once:true});
   stylesheet.addEventListener('error',()=>done(),{once:true});
   if(stylesheet.sheet){stylesheet.dataset.ready='yes';done()}
  });
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
  script.async=true;
  script.onload=()=>{if(!window.L){reject(Error('No se pudo iniciar el mapa'));return}cssReady.then(()=>resolve(window.L))};
  script.onerror=()=>reject(Error('No cargó el mapa. Comprueba tu conexión.'));
  document.head.append(script);
 }).catch(err=>{leafletPromise=null;throw err});
 return leafletPromise;
}
const geoCache=new Map();
let lastGeoRequest=0;
async function searchPlaces(raw){
 const query=String(raw||'').trim();
 if(query.length<3)throw Error('Escribe al menos 3 letras de la dirección o barrio.');
 const normalized=query.toLocaleLowerCase('es');
 if(geoCache.has(normalized))return geoCache.get(normalized);
 // Solo búsquedas explícitas. El geocodificador público tiene límites muy estrictos.
 const wait=Math.max(0,1300-(Date.now()-lastGeoRequest));
 if(wait)await new Promise(ok=>setTimeout(ok,wait));
 lastGeoRequest=Date.now();
 const params=new URLSearchParams({
  format:'jsonv2',countrycodes:'co',limit:'5',addressdetails:'1',viewbox:'-76.88,2.75,-76.35,2.18',bounded:'0',
  q:query.toLowerCase().includes('popayán')||query.toLowerCase().includes('popayan')?query:query+', Popayán, Cauca, Colombia'
 });
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),11000);
 try{
  const response=await fetch('https://nominatim.openstreetmap.org/search?'+params.toString(),
   {headers:{'Accept-Language':'es'},signal:controller.signal});
  if(!response.ok)throw Error('La búsqueda no respondió. Prueba marcar el punto directamente en el mapa.');
  const list=await response.json();
  const results=list.filter(p=>Number.isFinite(+p.lat)&&Number.isFinite(+p.lon))
    .map(p=>({lat:+p.lat,lng:+p.lon,address:String(p.display_name||'').split(',').slice(0,5).join(',').trim()}));
  if(geoCache.size>60)geoCache.clear();
  geoCache.set(normalized,results);
  return results;
 }finally{clearTimeout(timer)}
}
async function reverseAddressSuggestion(point){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9000);
 try{
  // Una consulta por selección GPS. Si el proveedor falla, se permite dirección manual.
  const params=new URLSearchParams({format:'jsonv2',lat:String(point.lat),lon:String(point.lng),zoom:'18',addressdetails:'1','accept-language':'es'});
  const response=await fetch('https://nominatim.openstreetmap.org/reverse?'+params.toString(),{
   headers:{'Accept-Language':'es'},signal:controller.signal
  });
  if(!response.ok)return '';
  const place=await response.json();
  const addr=place.address||{};
  const street=addr.road||addr.pedestrian||addr.residential||addr.path||'';
  const number=addr.house_number||'';
  const vicinity=addr.neighbourhood||addr.suburb||addr.quarter||'';
  const pieces=[street+(number?' '+number:''),vicinity].filter(Boolean);
  const suggested=pieces.join(', ')||String(place.display_name||'').split(',').slice(0,3).join(',').trim();
  return suggested.length>3?suggested.slice(0,260):'';
 }catch{return ''}
 finally{clearTimeout(timer)}
}
function initOpenMap(root,starting,onChoose){
 const L=window.L;
 const center=starting?.lat!=null?starting:(CONFIG.cityCenter||{lat:2.4448,lng:-76.6147});
 const map=L.map(root,{scrollWheelZoom:false,zoomControl:true}).setView([center.lat,center.lng],starting?.lat!=null?17:14);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
 }).addTo(map);
 const pinIcon=L.divIcon({className:'rutaya-leaflet-marker',html:'<span></span>',iconSize:[32,42],iconAnchor:[16,38]});
 let marker=null;
 function set(point,shouldNotify){
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
  const ll=[point.lat,point.lng];
  if(!marker){
   marker=L.marker(ll,{icon:pinIcon,draggable:true}).addTo(map);
   marker.on('dragend',()=>{const p=marker.getLatLng();onChoose({lat:p.lat,lng:p.lng})});
  }else marker.setLatLng(ll);
  map.setView(ll,Math.max(16,map.getZoom()));
  if(shouldNotify)onChoose({lat:point.lat,lng:point.lng});
 }
 map.on('click',event=>set({lat:event.latlng.lat,lng:event.latlng.lng},true));
 if(starting?.lat!=null&&starting?.lng!=null)set({lat:+starting.lat,lng:+starting.lng},false);
 setTimeout(()=>map.invalidateSize(),150);
 return {map,setWithoutSelect:p=>set(p,false),destroy:()=>map.remove()};
}
export async function openPicker({title='Elegir ubicación',starting=null,knownStores=[],recentPlaces=[],onSelect}){
 return new Promise(resolve=>{
  let selected=starting?.lat!=null&&starting?.lng!=null?{...starting}:null;
  let mapController=null,closed=false,requestCount=0;
  const shade=document.createElement('div');
  shade.className='modal-back rutaya-location-overlay';
  shade.innerHTML='<section class="modal rutaya-location-modal" role="dialog" aria-modal="true" aria-label="'+escapeHTML(title)+'">'+
   '<div class="modal-head"><div><h2>'+icon('pin',22)+' '+escapeHTML(title)+'</h2><small>Escribe tu dirección o usa tu ubicación actual.</small></div><button class="iconbtn" type="button" data-close aria-label="Cerrar">'+icon('close',20)+'</button></div>'+
   '<div class="modal-body">'+
    '<button id="ry-use-gps" type="button" class="button primary wide ry-gps-first">'+icon('crosshair',18)+' Usar mi ubicación actual</button>'+ '<div id="ry-recent-places"></div>'+ '<div class="ry-or">o escribe la dirección de entrega</div>'+ '<label for="ry-place-search" class="map-label">Dirección, barrio o negocio</label>'+
    '<form id="ry-place-form" class="search-place"><input id="ry-place-search" autocomplete="off" placeholder="Ej. Carrera 6 # 8-25, Popayán"><button class="button primary" type="submit">'+icon('search',17)+' Buscar</button></form>'+
    '<div id="ry-place-results" aria-live="polite"></div>'+
    '<button type="button" id="ry-show-map" class="button outline wide ry-map-toggle">'+icon('pin',17)+' ¿No aparece tu dirección? Marcar en el mapa</button>'+ '<div id="ry-map-section" class="hide"><div class="map-steps"><b>Toca el punto donde deben llegar</b><small>Mueve el mapa y toca la casa o arrastra el marcador.</small></div>'+
    '<div id="ry-picker-map" class="placemap ry-picker-map"><div class="ry-map-loading">'+icon('route',26)+' Cargando mapa de Popayán…</div></div>'+
    '<div class="ry-map-toolbar"><span id="ry-position-label" class="ry-position-label"></span></div></div>'+
    '<label for="ry-place-address" class="map-label">Dirección completa y referencia para el domiciliario</label>'+
    '<input id="ry-place-address" placeholder="Ej. Carrera 6 # 10-25, portón azul" autocomplete="street-address" value="'+escapeHTML(selected?.address||'')+'">'+
    '<p class="field-help">El GPS marca el punto, pero necesitas revisar la calle y el número de tu casa. Para sugerir una dirección se consulta OpenStreetMap; puedes corregirla o escribirla manualmente.</p>'+
    '<details class="ry-advanced"><summary>Opciones avanzadas (no necesarias)</summary><div class="ry-advanced-inner"><input id="ry-place-coords" placeholder="Latitud, longitud o enlace con coordenadas"><button id="ry-use-coords" type="button" class="button outline small">Marcar ese punto</button></div><small>Los enlaces cortos de Google Maps no siempre incluyen coordenadas. Puedes marcar el lugar directamente en el mapa.</small></details>'+
    '<div id="ry-picker-feedback" class="field-help ry-picker-feedback">'+(selected?'Punto seleccionado. Comprueba la dirección.':'Escribe una dirección y pulsa Buscar, o usa tu ubicación actual.')+'</div>'+
   '</div>'+
   '<div class="modal-foot"><button class="button outline" data-close type="button">Cancelar</button><button id="ry-save-point" type="button" class="button primary">'+icon('check',17)+' Confirmar dirección</button></div>'+
  '</section>';
  document.body.append(shade);
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const byId=id=>shade.querySelector('#'+id);
  const resultBox=byId('ry-place-results');
  const addressInput=byId('ry-place-address');
  const feedback=byId('ry-picker-feedback');
  const position=byId('ry-position-label');
  const save=byId('ry-save-point');
  function updateSaveState(){
   const valid=selected&&Number.isFinite(selected.lat)&&Number.isFinite(selected.lng)&&addressInput.value.trim().length>=5;
   save.disabled=!valid;
   position.textContent=selected?'Punto marcado':'Marca un punto';
  }
  function finish(value){
   if(closed)return;
   closed=true;requestCount++;
   try{mapController?.destroy()}catch(err){console.warn(err)}
   document.body.style.overflow=previousOverflow;
   shade.remove();resolve(value);
  }
  shade.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>finish(null)));
  shade.addEventListener('click',event=>{if(event.target===shade)finish(null)});
  function updateLocation(point,addr,fromMap=false){
   selected={lat:Number(point.lat),lng:Number(point.lng)};
   if(!Number.isFinite(selected.lat)||!Number.isFinite(selected.lng))return;
   if(typeof addr==='string'&&addr.trim())addressInput.value=addr;
   // No borrar la dirección que la persona ya escribió al corregir el punto GPS.
   mapController?.setWithoutSelect(selected);
   feedback.textContent=fromMap?'Punto marcado. Ahora escribe la dirección o una referencia abajo.':'Punto seleccionado. Verifica la dirección antes de guardar.';
   updateSaveState();
  }

  const recentHost=byId('ry-recent-places');
  const validRecent=(Array.isArray(recentPlaces)?recentPlaces:[])
   .filter(p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&String(p.address||'').trim().length>3)
   .slice(0,4);
  if(validRecent.length){
   const title=document.createElement('b');title.className='ry-recent-title';title.textContent='Direcciones que ya usaste';
   recentHost.append(title);
   validRecent.forEach(p=>{
    const button=document.createElement('button');button.type='button';button.className='ry-recent-button';
    button.innerHTML=icon('pin',16)+' <span>'+escapeHTML(p.address)+'</span>';
    button.addEventListener('click',()=>{
     updateLocation({lat:Number(p.lat),lng:Number(p.lng)},String(p.address));
     feedback.textContent='Dirección anterior elegida. Confirma si sigue siendo correcta.';
    });
    recentHost.append(button);
   });
  }

  addressInput.addEventListener('input',updateSaveState);
  async function findQuery(query){
   const text=String(query||'').trim();
   if(!text){feedback.textContent='Escribe un lugar, una calle o un barrio para buscar.';return}
   const coords=parseCoordinate(text);
   if(coords){updateLocation(coords,'');resultBox.innerHTML='';return}
   const shops=knownStores.filter(store=>store.name&&store.name.toLowerCase().includes(text.toLowerCase()));
   resultBox.innerHTML='';
   if(shops.length){
    const info=document.createElement('p');info.className='field-help';info.textContent='Comercios guardados en RutaYa';resultBox.append(info);
    shops.slice(0,5).forEach(store=>{
     const button=document.createElement('button');button.type='button';button.className='place-suggestion';
     button.innerHTML=icon('shop',19)+' <span><b>'+escapeHTML(store.name)+'</b><small>'+escapeHTML(store.address||'Sin dirección')+'</small></span>';
     button.addEventListener('click',()=>{
      if(store.lat==null||store.lng==null){feedback.textContent='Este comercio aún no tiene GPS guardado. Márcalo en el mapa.';return}
      updateLocation({lat:+store.lat,lng:+store.lng},store.name+' · '+(store.address||'Popayán'));
      resultBox.innerHTML='';
     });
     resultBox.append(button);
    });
   }
   if(text.length<3){feedback.textContent='Escribe al menos 3 letras.';return}
   const searchNum=++requestCount;
   const loading=document.createElement('p');loading.className='field-help';loading.textContent='Buscando direcciones…';resultBox.append(loading);
   try{
    const results=await searchPlaces(text);
    if(closed||searchNum!==requestCount)return;
    loading.remove();
    if(!results.length){feedback.textContent='No encontramos esa dirección. Puedes ubicarla tocando el mapa.';return}
    for(const place of results){
     const button=document.createElement('button');button.type='button';button.className='place-suggestion';
     button.innerHTML=icon('pin',18)+' <span><b>'+escapeHTML(place.address)+'</b><small>Marcar en el mapa</small></span>';
     button.onclick=()=>{updateLocation(place,place.address);resultBox.innerHTML=''};
     resultBox.append(button);
    }
    feedback.textContent='Elige un resultado o marca el punto tocando el mapa.';
   }catch(err){
    if(closed||searchNum!==requestCount)return;
    loading.remove();feedback.textContent=err.name==='AbortError'?'La búsqueda tardó demasiado. Prueba de nuevo o toca el mapa.':err.message;
   }
  }
  byId('ry-place-form').addEventListener('submit',event=>{event.preventDefault();findQuery(byId('ry-place-search').value)});
  byId('ry-use-gps').onclick=async()=>{
   const button=byId('ry-use-gps');
   button.disabled=true;button.textContent='Buscando ubicación del celular…';
   feedback.textContent='Consultando el GPS. Permite la ubicación cuando el celular la solicite.';
   try{
    const point=await gps({allowApproximate:true});
    if(closed)return;
    ++requestCount;
    resultBox.replaceChildren();
    updateLocation(point);
    feedback.textContent='GPS encontrado (precisión aprox. '+Math.round(point.accuracy)+' m). Verifica o completa tu dirección en el campo de abajo.';
    addressInput.classList.add('ry-address-needs-check');
    addressInput.scrollIntoView({block:'nearest',behavior:'smooth'});
    // La búsqueda de dirección es solo una sugerencia: jamás impide marcar el punto.
    if(!addressInput.value.trim()){
     const suggestion=await reverseAddressSuggestion(point);
     if(closed)return;
     if(suggestion&&selected?.lat===point.lat&&selected?.lng===point.lng&&!addressInput.value.trim()){
      addressInput.value=suggestion;
      updateSaveState();
      feedback.textContent='GPS localizado. Sugerimos una dirección cercana con OpenStreetMap. Revisa el número de tu casa y pulsa Confirmar dirección.';
     }else if(!addressInput.value.trim()){
      feedback.textContent='GPS localizado. Escribe tu calle, número de casa o una referencia para que el domiciliario pueda encontrarte.';
      addressInput.focus({preventScroll:true});
     }
    }else{
     feedback.textContent='GPS localizado. Revisa que la dirección que escribiste corresponda al punto y pulsa Confirmar dirección.';
    }
   }catch(err){
    if(!closed){
     feedback.textContent=err.message;
     feedback.classList.add('ry-gps-error');
     byId('ry-show-map').scrollIntoView({block:'nearest',behavior:'smooth'});
    }
   }finally{
    button.disabled=false;button.innerHTML=icon('crosshair',18)+' Usar mi ubicación actual';
   }
  };
  byId('ry-use-coords').onclick=()=>{
   const coords=parseCoordinate(byId('ry-place-coords').value);
   if(!coords){feedback.textContent='No encontramos coordenadas en ese texto. Usa el mapa directamente.';return}
   updateLocation(coords,'');
  };
  save.onclick=()=>{
   if(!selected||!Number.isFinite(selected.lat)||!Number.isFinite(selected.lng)){feedback.textContent='Primero marca un punto en el mapa.';return}
   const addr=addressInput.value.trim();
   if(addr.length<5){feedback.textContent='Indica una calle, número de casa o referencia (mínimo cinco caracteres).';return}
   const result={lat:selected.lat,lng:selected.lng,address:addr};
   if(typeof onSelect==='function')onSelect(result);
   finish(result);
  };
  updateSaveState();
  byId('ry-show-map').onclick=async()=>{
   const section=byId('ry-map-section');section.classList.toggle('hide');
   if(section.classList.contains('hide'))return;
   if(mapController){setTimeout(()=>mapController.map.invalidateSize(),60);return}
   try{await loadLeaflet();if(closed)return;byId('ry-picker-map').textContent='';mapController=initOpenMap(byId('ry-picker-map'),selected,p=>updateLocation(p,null,true))}
   catch(err){if(closed)return;byId('ry-picker-map').textContent='El mapa no cargó. Puedes buscar tu dirección o usar el GPS.';feedback.textContent=err.message}
  };
 });
}


export async function showFleetMap(container,couriers){
 if(!container?.isConnected)return null;
 const points=(couriers||[]).filter(p=>p.lat!==null&&p.lat!==undefined&&p.lng!==null&&p.lng!==undefined
  &&p.seen_at&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))
  &&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180);
 const L=await loadLeaflet();
 if(!container.isConnected)return null;
 container.replaceChildren();
 const center=CONFIG.cityCenter||{lat:2.4448,lng:-76.6147};
 const map=L.map(container,{scrollWheelZoom:false}).setView([center.lat,center.lng],13);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,attribution:'&copy; OpenStreetMap'
 }).addTo(map);
 const bounds=[];
 for(const courier of points){
  const pos=[Number(courier.lat),Number(courier.lng)];
  const fill=courier.active_orders>0?'#7533d0':'#228262';
  const pin=L.circleMarker(pos,{radius:10,color:'#56338a',weight:3,fillColor:fill,fillOpacity:.85}).addTo(map);
  const wrap=document.createElement('div'),name=document.createElement('strong'),small=document.createElement('p');
  name.textContent=courier.name||'Domiciliario';
  small.textContent=courier.active_orders>0?'En reparto · '+courier.active_orders+' servicios':'Disponible y compartiendo GPS';
  wrap.append(name,small);pin.bindPopup(wrap);
  bounds.push(pos);
 }
 if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25],maxZoom:15});
 else if(bounds.length===1)map.setView(bounds[0],15);
 setTimeout(()=>{if(map._container?.isConnected)map.invalidateSize()},150);
 return {destroy:()=>map.remove(),map};
}
