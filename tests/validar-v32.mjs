import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const base=dirname(dirname(fileURLToPath(import.meta.url)));
const app=readFileSync(join(base,'app.js'),'utf8');
const extract=(start,end)=>{
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Falta bloque: '+start);
 return app.slice(a,b);
};
const helperCode=extract('const SUPPORT_CATEGORIES=','function orderSupportButton(o,role){');
const support=new Function('const e=x=>String(x);\n'+helperCode+'\nreturn {formatSupportReport,supportCategory,supportCategorySelector};')();
assert.match(support.formatSupportReport('direccion','La casa no aparece en el mapa'),/^\[Dirección incorrecta\]/);
assert.throws(()=>support.formatSupportReport('inexistente','Descripción suficientemente larga'),/Selecciona/);
assert.throws(()=>support.formatSupportReport('otro','Corto'),/diez/);
assert.equal(support.supportCategory('[Problema con el pago] Pidieron doble cobro').label,'Problema con el pago');
assert.equal(support.supportCategory('Reporte del modelo anterior').label,'Sin clasificar');
assert.match(support.supportCategorySelector('mi-tipo'),/mi-tipo/);
const csvCode=extract('function csvCell(value){','function adminStatsPage(){');
const csv=new Function(csvCode+'\nreturn csvCell;')();
assert.equal(csv('=SUM(A1:A2)'),'"\'=SUM(A1:A2)"');
assert.equal(csv('hola;"mundo"'),'"hola;""mundo"""');
assert.equal(csv(null),'""');
assert.match(app,/data-act="supportFilter"/);
assert.match(app,/data-act="supportToOrder"/);
assert.match(app,/data-act="exportAdminCsv"/);
assert.match(app,/adminOrderFilter==='delayed'/);
assert.match(app,/\['active','delayed','done','all'\]\.includes\(v\)/);
for(const p of ['index.html','admin/index.html','negocios/index.html','repartidores/index.html','seguimiento/index.html','confirmar/index.html']){
 const html=readFileSync(join(base,p),'utf8');
 assert.match(html,/app\.js\?v=33/,'Versión nueva de '+p);
}
console.log('Pruebas RutaYa v32: OK');
