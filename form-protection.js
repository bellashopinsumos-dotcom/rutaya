// Evita perder texto, selecciones y foco cuando otra parte de RutaYa necesita actualizarse.
// Solo mantiene valores en memoria durante la reconstrucción del MISMO formulario.
export function uiScope(state){
 return JSON.stringify([
  state.page,state.view,state.recipientStep,state.showForm,state.auth,state.registration,
  state.manageAction,state.manageOrderId,state.supportOrderId,state.deliveryOtpOrderId,
  state.guestSupport,state.routeGroupIndex,state.adminOrderFilter,state.supportFilter,
  state.trackStatus,state.loading,state.error
 ]);
}
const selector='input,textarea,select';
const editable=el=>el&&el.matches?.(selector)&&!el.disabled&&
 el.type!=='hidden'&&el.type!=='file';

function inputKey(el,index){
 if(el.id)return 'id:'+el.id;
 if(el.dataset?.barrioFilter)return 'barrio:'+el.dataset.barrioFilter;
 if(el.name)return 'name:'+el.name+':'+index;
 return 'position:'+index;
}
export function captureFormState(root,doc){
 const fields=[];
 let activeKey=null;
 const elements=[...root.querySelectorAll(selector)];
 const current=doc.activeElement;
 elements.forEach((el,index)=>{
  if(!editable(el))return;
  const key=inputKey(el,index);
  const focused=current===el;
  const item={key,type:el.type,tag:el.tagName,value:el.value,checked:el.checked,focused};
  if(focused){
   activeKey=key;
   if(typeof el.selectionStart==='number'&&typeof el.selectionEnd==='number'){
    item.selectionStart=el.selectionStart;item.selectionEnd=el.selectionEnd;
   }
  }
  fields.push(item);
 });
 return {fields,activeKey};
}
export function restoreFormState(root,snapshot){
 if(!snapshot?.fields?.length)return;
 const controls=[...root.querySelectorAll(selector)];
 const indexes=new Map(controls.map((el,index)=>[inputKey(el,index),el]));
 let focus=null,selection=null;
 for(const item of snapshot.fields){
  const el=indexes.get(item.key);
  if(!el||!editable(el)||el.type!==item.type||el.tagName!==item.tag)continue;
  if(item.type==='checkbox'||item.type==='radio')el.checked=item.checked;
  else if(el.tagName==='SELECT'){
   if([...el.options].some(option=>option.value===item.value))el.value=item.value;
  }else el.value=item.value;
  if(item.focused){focus=el;selection=item}
 }
 if(focus){
  try{
   focus.focus({preventScroll:true});
   if(selection?.selectionStart!=null&&typeof focus.setSelectionRange==='function')
    focus.setSelectionRange(selection.selectionStart,selection.selectionEnd);
  }catch(err){console.warn('No se pudo restaurar el cursor del formulario',err)}
 }
}
export function userEditing(root,doc){
 const el=doc.activeElement;
 return Boolean(el&&root.contains(el)&&(editable(el)||el.isContentEditable));
}
