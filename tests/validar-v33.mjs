import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {orderAlert,trackingAlert,alertText,createSoundPlayer} from '../notification-sounds.js';

const dir=dirname(dirname(fileURLToPath(import.meta.url)));
const order=(id,status,extra={})=>({id,status,...extra});
assert.equal(orderAlert([], [order('1','pending')], 'admin',null,false),null,'No sonar al inicializar');
assert.equal(orderAlert([], [order('1','pending')], 'admin',null,true)?.kind,'new','Primer pedido nuevo');
assert.equal(orderAlert([], [order('1','pending')], 'repartidores','courier-a',true)?.kind,'new','Nuevo servicio a repartidores');
assert.equal(orderAlert([], [order('1','pending')], 'cliente','client-a',true),null,'No avisar pedidos de otros');
assert.equal(orderAlert([], [order('1','accepted',{courier_id:'courier-a'})],'repartidores','courier-a',true)?.kind,'assigned');
assert.equal(orderAlert([], [order('1','accepted',{courier_id:'courier-a'})],'repartidores','courier-b',true),null);
assert.equal(orderAlert([order('1','pending')],[order('1','accepted')],'cliente',null,true)?.kind,'assigned');
assert.equal(orderAlert([order('1','accepted')],[order('1','at_pickup')],'admin',null,true)?.kind,'at_pickup');
assert.equal(orderAlert([order('1','at_pickup')],[order('1','picked_up')],'cliente',null,true)?.kind,'on_way');
assert.equal(orderAlert([order('1','picked_up')],[order('1','at_dropoff')],'cliente',null,true)?.kind,'arrived');
assert.equal(orderAlert([order('1','at_dropoff')],[order('1','delivered')],'admin',null,true)?.kind,'delivered');
assert.equal(orderAlert([order('1','pending')],[order('1','cancelled')],'admin',null,true)?.kind,'cancelled');
assert.equal(orderAlert([order('1','accepted')],[order('1','accepted',{last_gps:'different'})],'admin',null,true),null,'GPS solo no suena');
assert.equal(trackingAlert(order('1','accepted'),order('1','picked_up'))?.kind,'on_way');
assert.equal(trackingAlert(order('1','picked_up'),order('1','picked_up',{lat:1})),null);
assert.equal(trackingAlert(null,order('1','pending')),null,'No sonar al abrir seguimiento');
assert.match(alertText({kind:'new',count:2},'admin'),/2 cambios/);

class MockContext{
 constructor(){this.state='suspended';this.currentTime=1;this.destination={};}
 resume(){this.state='running';return Promise.resolve();}
 createOscillator(){return {frequency:{value:0},connect(){},start(){},stop(){}};}
 createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
}
const mock=createSoundPlayer({AudioContext:MockContext});
assert.equal(mock.play('new'),false,'No puede sonar sin activar por toque');
assert.equal(await mock.unlock(),true,'Desbloqueo desde gesto');
assert.equal(mock.play('on_way'),true,'Puede reproducir tono cuando está activo');
const app=readFileSync(join(dir,'app.js'),'utf8');
assert.match(app,/data-act="toggleSounds"/);
assert.match(app,/trackingAlert\(model\.track,next\)/);
assert.match(app,/orderAlert\(before,next,page/);
assert.match(app,/ordersInitialized:true|ordersInitialized=false|ordersInitialized=true/);
assert.match(app,/localStorage\.setItem\(SOUND_PREF,'on'\)/);
for(const path of ['index.html','admin/index.html','negocios/index.html','repartidores/index.html','seguimiento/index.html','confirmar/index.html']){
 const html=readFileSync(join(dir,path),'utf8');
 assert.match(html,/app\.js\?v=33/,path+' debe cargar versión v33');
}
console.log('RutaYa v33: pruebas de estados, audio, seguimiento y enlaces OK');
