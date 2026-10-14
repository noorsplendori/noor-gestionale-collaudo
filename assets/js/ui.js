export const $=q=>document.querySelector(q); export const $$=q=>[...document.querySelectorAll(q)];
export const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('show'),2600)}
export function openModal(title,html,sub=''){ $('#modalTitle').textContent=title;$('#modalSub').textContent=sub;$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden') }
export function closeModal(){$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}
export function fmtDate(v){try{const d=v?.toDate?v.toDate():new Date(v);return isNaN(d)?'—':d.toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch{return'—'}}
export function compressImage(file,max=900,q=.72){return new Promise((resolve,reject)=>{if(!file)return resolve('');const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{let w=im.width,h=im.height;if(w>max||h>max){const k=Math.min(max/w,max/h);w=Math.round(w*k);h=Math.round(h*k)}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);resolve(c.toDataURL('image/jpeg',q))};im.onerror=reject;im.src=r.result};r.onerror=reject;r.readAsDataURL(file)})}

export function confirmDialog(message,title='Conferma operazione'){
  return new Promise(resolve=>{
    let overlay=document.getElementById('noorConfirmOverlay');
    if(!overlay){
      overlay=document.createElement('div');overlay.id='noorConfirmOverlay';overlay.className='noor-confirm hidden';
      overlay.innerHTML='<div class="noor-confirm-card"><div class="confirm-icon"><svg viewBox="0 0 24 24"><path d="M12 3 21 20H3L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg></div><h3 id="noorConfirmTitle"></h3><p id="noorConfirmMessage"></p><div class="noor-confirm-actions"><button id="noorConfirmCancel" class="btn secondary" type="button">Annulla</button><button id="noorConfirmOk" class="btn primary" type="button">Conferma</button></div></div>';
      document.body.appendChild(overlay);
    }
    overlay.querySelector('#noorConfirmTitle').textContent=title;
    overlay.querySelector('#noorConfirmMessage').textContent=message;
    overlay.classList.remove('hidden');
    const finish=v=>{overlay.classList.add('hidden');resolve(v)};
    overlay.querySelector('#noorConfirmCancel').onclick=()=>finish(false);
    overlay.querySelector('#noorConfirmOk').onclick=()=>finish(true);
    overlay.onclick=e=>{if(e.target===overlay)finish(false)};
  })
}
