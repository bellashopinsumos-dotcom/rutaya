import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {uiScope,captureFormState,restoreFormState,userEditing} from '../form-protection.js';

const rootDir=dirname(dirname(fileURLToPath(import.meta.url)));
class FakeInput{
 constructor({id='',type='text',tagName='INPUT',name='',value='',checked=false,selectionStart=null,selectionEnd=null,options=[],dataset={}}={}){
  Object.assign(this,{id,type,tagName,name,value,checked,selectionStart,selectionEnd,options,dataset,disabled:false,isContentEditable:false});
 }
 matches(selector){return selector==='input,textarea,select';}
 focus(){this.didFocus=true;}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
}
class FakeRoot{
 constructor(fields=[]){this.fields=fields;}
 querySelectorAll(){return this.fields;}
 contains(value){return this.fields.includes(value);}
}
const input=new FakeInput({id:'direccion',value:'Calle 5 # 10 - 20',selectionStart:9,selectionEnd:9});
const notes=new FakeInput({id:'notas',tagName:'TEXTAREA',type:'textarea',value:'Portón verde'});
const checkbox=new FakeInput({id:'confirma',type:'checkbox',checked:true,value:'on'});
const oldRoot=new FakeRoot([input,notes,checkbox]);
const state=captureFormState(oldRoot,{activeElement:input});
assert.equal(state.fields.length,3,'Captura los tres controles');
const reloadedInput=new FakeInput({id:'direccion',value:'',selectionStart:0,selectionEnd:0});
const reloadedNotes=new FakeInput({id:'notas',tagName:'TEXTAREA',type:'textarea',value:''});
const reloadedCheckbox=new FakeInput({id:'confirma',type:'checkbox',checked:false,value:'on'});
const newRoot=new FakeRoot([reloadedInput,reloadedNotes,reloadedCheckbox]);
restoreFormState(newRoot,state);
assert.equal(reloadedInput.value,input.value,'Conserva dirección');
assert.equal(reloadedNotes.value,notes.value,'Conserva indicaciones');
assert.equal(reloadedCheckbox.checked,true,'Conserva selección');
assert.equal(reloadedInput.didFocus,true,'Restablece foco');
assert.equal(reloadedInput.selectionStart,9,'Conserva cursor');
assert.equal(userEditing(oldRoot,{activeElement:input}),true);
assert.equal(userEditing(oldRoot,{activeElement:{}}),false);

const nextStep=uiScope({page:'confirmar',view:'inicio',recipientStep:2});
const previousStep=uiScope({page:'confirmar',view:'inicio',recipientStep:1});
assert.notEqual(nextStep,previousStep,'No restaurar campos de otros pasos');
assert.notEqual(uiScope({page:'admin',view:'inicio',user:'a'}),uiScope({page:'admin',view:'inicio',user:'b'}),'Aislar cuentas');
assert.notEqual(uiScope({page:'cliente',view:'inicio'}),uiScope({page:'cliente',view:'pedidos'}),'Aislar vistas');
const app=readFileSync(join(rootDir,'app.js'),'utf8');
assert.match(app,/const editing=preserveEditingDuringBackgroundUpdate\(\)/,'No sustituir DOM mientras hay edición');
assert.match(app,/if\(editing\)await pollOrderUpdates\(\)/,'Seguir revisando notificaciones sin pintar la pantalla');
assert.match(app,/function render\(\)\{/,'Render controlado');
assert.match(app,/restoreFormState\(root,snapshot\)/,'Resguardar texto y cursor');
assert.match(app,/if\(!preserveEditingDuringBackgroundUpdate\(\)\)render\(\)/,'Seguimiento sin borrar reporte');
assert.match(app,/!preserveEditingDuringBackgroundUpdate\(\)\)render\(\)/,'GPS sin interrumpir edición');
for(const path of ['index.html','admin/index.html','negocios/index.html','repartidores/index.html','seguimiento/index.html','confirmar/index.html']){
 const html=readFileSync(join(rootDir,path),'utf8');
 assert.match(html,/app\.js\?v=34/,path+' debe cargar corrección');
}
console.log('RutaYa v34: formularios, textos, foco y actualización silenciosa OK');
