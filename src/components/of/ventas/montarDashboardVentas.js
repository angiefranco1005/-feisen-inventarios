// Dashboard de ventas: es el código del artefacto "Dashboard Ventas" casi sin cambios (HTML + JS sin React).
// Se monta dentro de `root`; los datos vienen de Supabase (tabla ventas_odoo) en vez de venir incrustados.
//   opts.base        { C: clientes[], P: productos[], R: [empresa, iCliente, iProducto, mes, valor, cantidad][] }  (filas de origen 'base')
//   opts.snapshot    { docs: [{ data() { return { empresa, mes, filas, archivo, subido } } }] }                 (meses cargados desde Odoo)
//   opts.guardarMes  (body) => Promise   ·   opts.alGuardar () => void   ·   opts.puedeCargar boolean
import * as XLSX from 'xlsx'

export function montarDashboardVentas(root, opts){
  var limpiezas=[];
  function alRedimensionar(fn){window.addEventListener('resize',fn);limpiezas.push(function(){window.removeEventListener('resize',fn)})}

  var store={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
  // Pestañas
  var tabs={resumen:document.getElementById('tab-resumen'),analisis:document.getElementById('tab-analisis'),cargar:document.getElementById('tab-cargar'),tutorial:document.getElementById('tab-tutorial')};
  function show(id){
    Object.keys(tabs).forEach(function(k){
      tabs[k].setAttribute('aria-selected',k===id?'true':'false');
      document.getElementById(k).hidden=k!==id;
    });
    window.scrollTo(0,0);
  }
  tabs.resumen.onclick=function(){show('resumen')};
  tabs.tutorial.onclick=function(){show('tutorial')};
  tabs.analisis.onclick=function(){show('analisis')};
  tabs.cargar.onclick=function(){show('cargar')};
  root.addEventListener('click',function(e){var a=e.target.closest('[data-goto]');if(a){e.preventDefault();show(a.dataset.goto)}});

  // Criterios de la tabla dinámica
  var CRIT=[
    ["Filtro","Fecha de factura: el mes del informe (del paso 5)"],
    ["Filtro","Publicado (solo facturas válidas)"],
    ["Filtro","Clientes y Facturas (del paso 4)"],
    ["Filas","Contacto (del paso 6)"],
    ["Filas","Producto, dentro de cada contacto (del paso 6)"],
    ["Columnas","Fecha de factura › Mes"],
    ["Medidas","Cantidad de producto"],
    ["Medidas","Subtotal (valor sin IVA)"]
  ];
  var colsEl=document.getElementById('cols');
  var done=JSON.parse(store.get('odoo-crit')||'[]');
  CRIT.forEach(function(c,i){
    var li=document.createElement('li');
    li.innerHTML='<label><input type="checkbox" id="crit-'+i+'"'+(done.indexOf(i)>-1?' checked':'')+'><span><b>'+c[1]+'</b><code>'+c[0]+'</code></span></label>';
    colsEl.appendChild(li);
  });
  function prog(){
    var boxes=colsEl.querySelectorAll('input'),on=[];
    boxes.forEach(function(b,i){if(b.checked)on.push(i)});
    document.getElementById('prog-txt').textContent=on.length+' de '+boxes.length;
    document.getElementById('prog-bar').style.width=(on.length/boxes.length*100)+'%';
    store.set('odoo-crit',JSON.stringify(on));
  }
  colsEl.addEventListener('change',prog);prog();

  var sys=store.get('odoo-sys')==='ol'?'ol':'sh';
  var mes=document.getElementById('mes');
  var d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);
  mes.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  function fname(){
    var tag=sys==='sh'?'Feisen':'FC';
    document.getElementById('fname').textContent='Ventas_'+tag+'_'+(mes.value||'AAAA-MM')+'.xlsx';
  }
  mes.addEventListener('input',fname);
  function applySys(){
    document.querySelectorAll('.chip').forEach(function(c){c.setAttribute('aria-pressed',c.dataset.sys===sys?'true':'false')});
    fname();
  }
  document.querySelectorAll('.chip').forEach(function(c){
    c.onclick=function(){sys=c.dataset.sys;store.set('odoo-sys',sys);applySys()};
  });
  applySys();

  // Copiar
  var toast=document.getElementById('toast'),tt;
  function say(m){toast.textContent=m;toast.classList.add('show');clearTimeout(tt);tt=setTimeout(function(){toast.classList.remove('show')},1800)}
  document.querySelectorAll('[data-copy]').forEach(function(b){
    b.onclick=function(){
      var el=document.getElementById(b.dataset.copy),txt=el.textContent;
      function sel(){var r=document.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r);say('Texto seleccionado: cópialo con Cmd+C')}
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){say('Copiado')},sel)}else sel();
    };
  });

  var D=opts.base;
  // ===== Datos =====
  // Base: D (Feisen + FC, abr–27 oct 2026, venta neta sin IVA). Encima van los meses cargados desde Odoo (db "ventas").
  // Mes como número continuo: 2026-04 = 4, 2026-12 = 12, 2027-01 = 13.
  var NOM=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var ABR=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  function yOf(m){return 2026+Math.floor((m-1)/12)}
  function moOf(m){return ((m-1)%12+12)%12}
  function mOfYm(ym){var p=ym.split('-');return (+p[0]-2026)*12+(+p[1])}
  function ymOf(m){return yOf(m)+'-'+String(moOf(m)+1).padStart(2,'0')}
  var MULTI=false;
  function MN(m){return NOM[moOf(m)]+(MULTI?' '+yOf(m):'')}
  function MS(m){return ABR[moOf(m)]+(MULTI?' '+String(yOf(m)).slice(2):'')}
  var BASE_DAYS=27,BASE_M=10,MD=31;
  var CO='all',CO_LBL={all:'Consolidado Feisen + FC',fe:'Feisen',fc:'FC'};
  function inCo(r){return CO==='all'||(CO==='fe'?r[0]===0:r[0]===1)}
  // fila base: [empresa, cliente, producto, mes, valor, cantidad, origen 'b' base | 'u' cargado]
  var BASE=D.R.map(function(r){return [r[0],D.C[r[1]],D.P[r[2]],r[3],r[4],r[5],'b']});
  var UP={};
  var R=[],ALL=[];
  // fila de análisis: [cliente, producto, mes, empresa, valor, 0, cantidad, nº mes]
  function rebuildRows(){
    var over={};Object.keys(UP).forEach(function(k){var u=UP[k];over[u.co+'|'+u.m]=1});
    R=BASE.filter(function(r){return !over[r[0]+'|'+r[3]]});
    Object.keys(UP).forEach(function(k){var u=UP[k];u.filas.forEach(function(f){R.push([u.co,f.c,f.p,u.m,f.v,f.q,'u'])})});
    var ys={};R.forEach(function(r){ys[yOf(r[3])]=1});MULTI=Object.keys(ys).length>1;
    ALL=R.map(function(r){return [r[1],r[2],MN(r[3]),r[0],r[4],0,r[5],r[3]]});
  }
  // Meses y etiquetas según la empresa elegida
  var MONTHS=[],LAST=BASE_M,PREV=[],JS=[],PARTIAL=false,DAYS=MD,FAC=1;
  var PERIODO='',ALL_S='',ALL_L='',PREV_S='',PREV_L='',JS_S='',JS_L='',LAST_LBL='';
  function rngS(a){return a.length?(a.length>1?MS(a[0])+'–'+MS(a[a.length-1]):MS(a[0])):'—'}
  function rngL(a){return a.length?(a.length>1?MN(a[0]).toLowerCase()+' a '+MN(a[a.length-1]).toLowerCase():MN(a[0]).toLowerCase()):'—'}
  function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}
  function derive(){
    var ms={};R.forEach(function(r){if(inCo(r))ms[r[3]]=1});
    MONTHS=Object.keys(ms).map(Number).sort(function(a,b){return a-b});
    if(!MONTHS.length)MONTHS=[BASE_M];
    LAST=MONTHS[MONTHS.length-1];
    PREV=MONTHS.filter(function(m){return m<LAST}).slice(-6);
    JS=PREV.slice(-3);
    PARTIAL=LAST===BASE_M&&R.some(function(r){return inCo(r)&&r[3]===BASE_M&&r[6]==='b'});
    DAYS=PARTIAL?BASE_DAYS:MD;FAC=PARTIAL?MD/BASE_DAYS:1;
    ALL_S=rngS(MONTHS);ALL_L=rngL(MONTHS);PREV_S=rngS(PREV);PREV_L=rngL(PREV);JS_S=rngS(JS);JS_L=rngL(JS);
    PERIODO=cap(rngL(MONTHS).replace(' a ',' – '))+(MULTI?'':' '+yOf(LAST))+(PARTIAL?' · al '+BASE_DAYS+'/'+String(moOf(BASE_M)+1).padStart(2,'0'):'');
    LAST_LBL=MN(LAST)+(PARTIAL?' al '+DAYS:'');
  }
  var SD='Sin detalle',DATA={rows:[]};
  var cop=function(n){return (n<0?'-':'')+'$'+Math.round(Math.abs(n)).toLocaleString('es-CO')};
  var copS=function(n){var a=Math.abs(n),g=n<0?'-':'';if(a>=1e9)return g+'$'+(a/1e9).toLocaleString('es-CO',{maximumFractionDigits:1})+' mil M';if(a>=1e6)return g+'$'+(a/1e6).toLocaleString('es-CO',{maximumFractionDigits:1})+' M';if(a>=1e3)return g+'$'+Math.round(a/1e3).toLocaleString('es-CO')+' mil';return cop(n)};
  var num=function(n){return Math.round(n).toLocaleString('es-CO')};
  var F={mes:'',prod:'',cli:''};
  var IDX={prod:1,cli:0,mes:2};
  var LABEL={mes:'Mes',prod:'Producto',cli:'Cliente'};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function match(r,skip){return Object.keys(F).every(function(k){return k===skip||!F[k]||r[IDX[k]]===F[k]})}
  function group(rows,i,m){var g={};rows.forEach(function(r){g[r[i]]=(g[r[i]]||0)+r[m]});return Object.keys(g).map(function(k){return [k,g[k]]}).sort(function(a,b){return b[1]-a[1]})}
  function creditNote(){
    var n=0,s=0;R.forEach(function(r){if(inCo(r)&&r[4]<0&&r[6]==='b'){n++;s+=r[4]}});
    var ups=Object.keys(UP).map(function(k){return UP[k]}).filter(function(u){return CO==='all'||(CO==='fe'?u.co===0:u.co===1)}).sort(function(a,b){return a.m-b.m||a.co-b.co});
    return (n?'En los datos de origen se restaron '+n+' notas crédito por '+copS(-s)+'; los meses cargados desde Odoo traen solo facturas. ':'')+(ups.length?'Meses cargados desde Odoo: '+ups.map(function(u){return MS(u.m)+' '+(u.co?'FC':'Feisen')}).join(', ')+'. ':'')+' Los productos de los dos Odoo se unificaron por nombre (sin el código [010] de Feisen) para que sumen juntos; un cliente con el mismo nombre en Feisen y FC se suma en el consolidado. '+(PARTIAL?MN(BASE_M)+' llega hasta el '+BASE_DAYS+'/'+String(moOf(BASE_M)+1).padStart(2,'0')+'/'+yOf(BASE_M)+'.':'');
  }

  // ===== Gráfica mes a mes (compartida) =====
  function mmChart(el,lgd,fe,fc,opt){
    var W=el.clientWidth,H=el.clientHeight;if(!W)return;
    var both=CO==='all',tot={};MONTHS.forEach(function(m){tot[m]=(fe[m]||0)+(fc[m]||0)});
    var avg=0;PREV.forEach(function(m){avg+=tot[m]||0});avg/=PREV.length||1;
    var proj=(tot[LAST]||0)*FAC,cols=MONTHS.slice();if(opt.proj&&PARTIAL)cols.push('p');
    var max=Math.max.apply(null,cols.map(function(c){return c==='p'?proj:tot[c]}).concat([avg,1]))*1.14;
    var ml=52,mr=6,mt=24,mb=40,pw=W-ml-mr,ph=H-mt-mb,step=pw/cols.length,bw=Math.min(60,step*0.64);
    var y=function(v){return mt+ph-Math.max(0,v)/max*ph};
    var small=step<62;
    var lab=function(v){return small?(v/1e6).toLocaleString('es-CO',{maximumFractionDigits:0})+' M':copS(v)};
    var cF=both?'var(--blue)':(CO==='fe'?'var(--blue)':'var(--red)');
    var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Ventas mes a mes">';
    [0,0.5,1].forEach(function(t){var v=max/1.14*t;s+='<line class="grid" x1="'+ml+'" x2="'+(W-mr)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="ax" x="'+(ml-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+copS(v)+'</text>'});
    cols.forEach(function(c,i){
      var cx=ml+step*i+step/2,x=cx-bw/2,v=c==='p'?proj:tot[c];
      var dim=opt.sel&&c!=='p'&&MN(c)!==opt.sel;
      var g='<g'+(dim?' opacity=".4"':'')+'>';
      if(c==='p'){g+='<rect class="proj" x="'+x+'" y="'+y(v)+'" width="'+bw+'" height="'+(mt+ph-y(v))+'" rx="4"><title>'+MN(LAST)+' proyectado al '+MD+': '+cop(v)+'</title></rect>'}
      else{
        var a=Math.max(0,both?fe[c]||0:v),b=both?Math.max(0,fc[c]||0):0,ya=y(a),yb=y(a+b);
        var tip='<b>'+MN(c)+(c===LAST&&PARTIAL?' (al '+DAYS+')':'')+'</b>'+(both?'Feisen '+copS(fe[c]||0)+'<br>FC '+copS(fc[c]||0)+'<br>Total ':'')+cop(v);
        var attrs=opt.click?' class="bar-h" data-pk="mes" data-pv="'+MN(c)+'" data-tip="'+esc(tip)+'"':'';
        g+='<g'+attrs+'><rect x="'+x+'" y="'+ya+'" width="'+bw+'" height="'+(mt+ph-ya)+'" fill="'+cF+'"'+(b?'':' rx="4"')+'/>';
        if(b)g+='<rect x="'+x+'" y="'+yb+'" width="'+bw+'" height="'+(ya-yb)+'" fill="var(--red)"/>';
        g+='<rect x="'+x+'" y="'+mt+'" width="'+bw+'" height="'+ph+'" fill="transparent">'+(opt.click?'':'<title>'+MN(c)+': '+cop(v)+(both?' (Feisen '+cop(fe[c]||0)+' · FC '+cop(fc[c]||0)+')':'')+'</title>')+'</rect></g>';
      }
      g+='<text class="vlab" x="'+cx+'" y="'+(y(v)-7)+'" text-anchor="middle"'+(small?' style="font-size:11px"':'')+'>'+lab(v)+'</text>';
      g+='<text class="clab" x="'+cx+'" y="'+(mt+ph+17)+'" text-anchor="middle">'+(c==='p'?MS(LAST):MS(c))+'</text>';
      if(c==='p'||(c===LAST&&PARTIAL))g+='<text class="csub" x="'+cx+'" y="'+(mt+ph+31)+'" text-anchor="middle">'+(c==='p'?'proyect.':'al '+DAYS)+'</text>';
      s+=g+'</g>';
    });
    if(PREV.length)s+='<line class="avg" x1="'+ml+'" x2="'+(W-mr)+'" y1="'+y(avg)+'" y2="'+y(avg)+'"/>';
    el.innerHTML=s+'</svg>';
    lgd.innerHTML=(both?'<span><i class="k-fe"></i>Feisen</span><span><i class="k-fc"></i>FC</span>':'<span><i class="'+(CO==='fe'?'k-fe':'k-fc')+'"></i>'+CO_LBL[CO]+'</span>')+(opt.proj&&PARTIAL?'<span><i class="k-pr"></i>'+MN(LAST)+' proyectado</span>':'')+(PREV.length?'<span><i class="k-av"></i>Prom. '+PREV_S+' '+copS(avg)+'</span>':'');
  }

  // ===== Análisis de ventas =====
  var SLOTS=8;
  var RANK={};
  function ranks(){
    ['prod','cli'].forEach(function(k){RANK[k]={};group(DATA.rows.filter(function(r){return r[IDX[k]]!==SD}),IDX[k],4).forEach(function(x,i){RANK[k][x[0]]=i<SLOTS?i+1:0})});
  }
  function slot(k,v){return RANK[k][v]||0}

  var sel={};
  ['mes','prod','cli'].forEach(function(k){
    sel[k]=document.getElementById('f-'+k);
    sel[k].addEventListener('change',function(){F[k]=k==='mes'?sel[k].value:buscarValor(k,sel[k].value);sel[k].value=F[k];render()});
    // Al borrar el buscador se quita el filtro de una vez
    if(k!=='mes')sel[k].addEventListener('input',function(){if(!sel[k].value&&F[k]){F[k]='';render()}});
  });
  // Producto y cliente se escriben: vale el nombre exacto, o el único que contenga lo escrito
  var LISTA={prod:[],cli:[]};
  function buscarValor(k,txt){
    var t=String(txt||'').trim().toLowerCase();if(!t)return '';
    var ex=LISTA[k].find(function(v){return v.toLowerCase()===t});if(ex)return ex;
    var parc=LISTA[k].filter(function(v){return v.toLowerCase().indexOf(t)>-1});
    return parc.length===1?parc[0]:F[k];
  }
  function fillSelects(){['mes','prod','cli'].forEach(function(k){
    var vals={};DATA.rows.forEach(function(r){if(r[IDX[k]]!==SD)vals[r[IDX[k]]]=1});
    var list=k==='mes'?MONTHS.map(function(m){return MN(m)}).filter(function(m){return vals[m]}):Object.keys(vals).sort(function(a,b){return a.localeCompare(b,'es')});
    if(k!=='mes'){LISTA[k]=list;document.getElementById('dl-'+k).innerHTML=list.map(function(v){return '<option value="'+esc(v)+'">'}).join('');return}
    sel[k].innerHTML='<option value="">'+cap(ALL_L.replace(' a ',' – '))+'</option>'+list.map(function(v){return '<option>'+esc(v)+'</option>'}).join('');
  })}
  function setF(k,v){F[k]=F[k]===v?'':v;sel[k].value=F[k];render()}
  document.getElementById('f-clear').onclick=function(){Object.keys(F).forEach(function(k){F[k]='';sel[k].value=''});render()};

  // Tooltip
  var tip=document.getElementById('tip');
  function showTip(e,html){tip.innerHTML=html;tip.hidden=false;var x=e.clientX+14,y=e.clientY+14;var w=tip.offsetWidth,h=tip.offsetHeight;if(x+w>innerWidth-8)x=e.clientX-w-14;if(y+h>innerHeight-8)y=e.clientY-h-14;tip.style.left=x+'px';tip.style.top=y+'px'}
  function hideTip(){tip.hidden=true}

  // Barras
  function bars(el,k,m,n,fmt){
    var rows=DATA.rows.filter(function(r){return match(r,k)&&r[IDX[k]]!==SD});
    var g=group(rows,IDX[k],m).filter(function(x){return x[1]>0});
    var tot=g.reduce(function(s,x){return s+x[1]},0);
    var top=g.slice(0,n);
    if(F[k]&&!top.some(function(x){return x[0]===F[k]})){var f=g.find(function(x){return x[0]===F[k]});if(f)top.push(f)}
    var max=top.length?top[0][1]:1;
    el.innerHTML=top.length?top.map(function(x){
      var pct=tot?Math.round(x[1]/tot*100):0;
      var cls='brow'+(F[k]===x[0]?' sel':(F[k]?' dim':''));
      return '<button type="button" class="'+cls+'" data-k="'+k+'" data-v="'+esc(x[0])+'" data-tip="'+esc('<b>'+esc(x[0])+'</b>'+fmt(x[1])+' · '+pct+' % del total')+'"><span class="nm">'+esc(x[0])+'</span><span class="vl">'+fmt(x[1])+'<small>'+pct+' %</small></span><span class="tr"><i data-w="'+Math.max(1.5,x[1]/max*100)+'"></i></span></button>';
    }).join('')+(g.length>top.length?'<p class="empty">y '+(g.length-top.length)+' más</p>':''):'<p class="empty">Sin ventas con estos filtros.</p>';
    requestAnimationFrame(function(){requestAnimationFrame(function(){el.querySelectorAll('.tr>i').forEach(function(i){i.style.width=i.dataset.w+'%'})})});
  }

  // Treemap (squarified)
  function squarify(items,x,y,w,h){
    var out=[],rest=items.slice(),total=rest.reduce(function(s,i){return s+i.v},0);
    if(!total||w<=0||h<=0)return out;
    var scale=w*h/total;
    rest=rest.map(function(i){return {d:i,a:i.v*scale}});
    function worst(row,len){var s=0,mx=0,mn=Infinity;row.forEach(function(r){s+=r.a;mx=Math.max(mx,r.a);mn=Math.min(mn,r.a)});return Math.max(len*len*mx/(s*s),(s*s)/(len*len*mn))}
    while(rest.length){
      var len=Math.min(w,h),row=[rest[0]],i=1;
      while(i<rest.length&&worst(row.concat(rest[i]),len)<=worst(row,len)){row.push(rest[i]);i++}
      rest=rest.slice(row.length);
      var s=row.reduce(function(a,r){return a+r.a},0);
      if(w>=h){var cw=s/h,cy=y;row.forEach(function(r){var rh=r.a/cw;out.push({d:r.d,x:x,y:cy,w:cw,h:rh});cy+=rh});x+=cw;w-=cw}
      else{var rh2=s/w,cx=x;row.forEach(function(r){var rw=r.a/rh2;out.push({d:r.d,x:cx,y:y,w:rw,h:rh2});cx+=rw});y+=rh2;h-=rh2}
    }
    return out;
  }
  var tmG='cli',tmEl=document.getElementById('tm'),tiles={};
  document.querySelectorAll('[data-g]').forEach(function(b){b.onclick=function(){tmG=b.dataset.g;document.querySelectorAll('[data-g]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});treemap()}});
  function treemap(){
    var W=tmEl.clientWidth,H=tmEl.clientHeight;if(!W)return;
    var k=tmG;if(F[k])k=k==='prod'?'cli':'prod';
    document.querySelectorAll('[data-g]').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.g===k?'true':'false')});
    var rows=DATA.rows.filter(function(r){return match(r)&&r[4]>0});
    var tot=rows.reduce(function(s,r){return s+r[4]},0);
    var g=group(rows,IDX[k],4).filter(function(x){return x[1]>0});
    var MAXT=16,items=g.slice(0,MAXT).map(function(x){return {id:x[0],v:x[1],other:false}});
    if(g.length>MAXT){var ov=g.slice(MAXT).reduce(function(s,x){return s+x[1]},0);items.push({id:'Otros ('+(g.length-MAXT)+')',v:ov,other:true})}
    var keep={};
    if(!items.length){Object.keys(tiles).forEach(function(t){tiles[t].remove()});tiles={};tmEl.innerHTML='<p class="empty" style="padding:16px">Sin ventas con estos filtros.</p>';return}
    var emp=tmEl.querySelector('.empty');if(emp)emp.remove();
    var restSet={};g.slice(MAXT).forEach(function(x){restSet[x[0]]=1});
    squarify(items,0,0,W,H).forEach(function(t){
      var it=t.d,slotN=it.other?0:slot(k,it.id);
      var subRows=it.other?rows.filter(function(r){return restSet[r[IDX[k]]]}):rows.filter(function(r){return r[IDX[k]]===it.id});
      var subs=group(subRows,k==='prod'?0:1,4).filter(function(x){return x[1]>0}).map(function(x){return {id:x[0],v:x[1]}});
      squarify(subs,t.x,t.y,t.w,t.h).forEach(function(s){
        var key='s|'+k+'|'+it.id+'|'+s.d.id;keep[key]=1;
        var el=tiles[key];
        if(!el){el=document.createElement('div');el.className='tile sub';el.style.opacity=0;tmEl.appendChild(el);tiles[key]=el;
          el.style.left=s.x+'px';el.style.top=s.y+'px';el.style.width=s.w+'px';el.style.height=s.h+'px';}
        el.className='tile sub c'+slotN;
        el.dataset.k=it.other?'':k;el.dataset.v=it.other?'':it.id;
        el.dataset.tip='<b>'+esc(it.id)+'</b>'+(k==='prod'?'Cliente: ':'Producto: ')+esc(s.d.id)+'<br>'+cop(s.d.v)+' · '+(tot?Math.round(s.d.v/tot*1000)/10:0)+' % del total';
        el.innerHTML=(s.w>70&&s.h>40)?'<span class="sl">'+esc(s.d.id)+'</span>':'';
        requestAnimationFrame(function(){el.style.left=s.x+'px';el.style.top=s.y+'px';el.style.width=s.w+'px';el.style.height=s.h+'px';el.style.opacity=1});
      });
      var tk='t|'+k+'|'+it.id;keep[tk]=1;
      var te=tiles[tk];
      if(!te){te=document.createElement('div');te.className='tile top';te.style.opacity=0;tmEl.appendChild(te);tiles[tk]=te;
        te.style.left=t.x+'px';te.style.top=t.y+'px';te.style.width=t.w+'px';te.style.height=t.h+'px';}
      te.className='tile top tc'+slotN;
      var pct=tot?Math.round(it.v/tot*100):0;
      te.innerHTML=(t.w>64&&t.h>34)?'<span class="tl">'+esc(it.id)+((t.w>90&&t.h>52)?'<span class="tv">'+copS(it.v)+' · '+pct+' %</span>':'')+'</span>':'';
      tmEl.appendChild(te);
      requestAnimationFrame(function(){te.style.left=t.x+'px';te.style.top=t.y+'px';te.style.width=t.w+'px';te.style.height=t.h+'px';te.style.opacity=1});
    });
    Object.keys(tiles).forEach(function(key){if(!keep[key]){var el=tiles[key];delete tiles[key];el.style.opacity=0;setTimeout(function(){el.remove()},320)}});
  }
  tmEl.addEventListener('click',function(e){var t=e.target.closest('.tile.sub');if(t&&t.dataset.k)setF(t.dataset.k,t.dataset.v)});
  var pane=document.getElementById('analisis');
  pane.addEventListener('click',function(e){var b=e.target.closest('.brow');if(b){hideTip();setF(b.dataset.k,b.dataset.v);return}var d=e.target.closest('[data-dk]');if(d){hideTip();setF(d.dataset.dk,d.dataset.dv);return}var q=e.target.closest('[data-pk]');if(q){hideTip();setF(q.dataset.pk,q.dataset.pv)}});
  pane.addEventListener('mousemove',function(e){var t=e.target.closest('[data-tip]');if(t)showTip(e,t.dataset.tip);else hideTip()});
  pane.addEventListener('mouseleave',hideTip);
  var rT;alRedimensionar(function(){clearTimeout(rT);rT=setTimeout(function(){treemap();pareto();aMonths()},120)});

  // ===== Tortas =====
  var CV={c0:'--s0',c1:'--s1',c2:'--s2',c3:'--s3',c4:'--s4',c5:'--s5',c6:'--s6',c7:'--s7',c8:'--s8'};
  function donut(el,k,items){
    var tot=items.reduce(function(s,x){return s+x.v},0);
    var R=60,C=2*Math.PI*R,off=0,gap=items.length>1?1.5:0;
    var segs=items.map(function(x){
      var len=tot?x.v/tot*C:0,d=Math.max(0,len-gap);
      var s='<circle class="seg-c" r="'+R+'" cx="80" cy="80" fill="none" stroke="var('+CV['c'+x.c]+')" stroke-width="'+(F[k]&&F[k]===x.id?30:24)+'" stroke-dasharray="'+d+' '+(C-d)+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 80 80)"'+(x.other?'':' data-dk="'+k+'" data-dv="'+esc(x.id)+'"')+' data-tip="'+esc('<b>'+esc(x.id)+'</b>'+cop(x.v)+' · '+(tot?Math.round(x.v/tot*100):0)+' %')+'"><title>'+esc(x.id)+'</title></circle>';
      off+=len;return s;
    }).join('');
    var svg='<svg viewBox="0 0 160 160" role="img" aria-label="Gráfica de torta">'+(items.length?segs:'<circle r="60" cx="80" cy="80" fill="none" stroke="var(--soft)" stroke-width="24"/>')+'<text class="ct" x="80" y="80" text-anchor="middle">'+copS(tot)+'</text><text class="cl" x="80" y="96" text-anchor="middle">total</text></svg>';
    var lg='<div class="lg">'+items.map(function(x){
      var cls=F[k]?(F[k]===x.id?'sel':'dim'):'';
      return '<button type="button" class="'+cls+'"'+(x.other?' disabled':' data-dk="'+k+'" data-dv="'+esc(x.id)+'"')+'><span class="sw c'+x.c+'"></span><span class="nm">'+esc(x.id)+'</span><span class="vl">'+copS(x.v)+'<small>'+(tot?Math.round(x.v/tot*100):0)+' %</small></span></button>';
    }).join('')+'</div>';
    el.innerHTML=items.length?svg+lg:'<p class="empty">Sin ventas con estos filtros.</p>';
  }
  function donuts(){
    var rp=DATA.rows.filter(function(r){return match(r,'prod')&&r[4]>0&&r[1]!==SD});
    var gp=group(rp,1,4),items=[],other=0;
    gp.forEach(function(x){var c=slot('prod',x[0]);if(c)items.push({id:x[0],v:x[1],c:c});else other+=x[1]});
    if(other>0)items.push({id:'Otros',v:other,c:0,other:true});
    donut(document.getElementById('d-prod'),'prod',items);
  }

  // ===== Pareto =====
  var paG='cli',paC='A',paEl=document.getElementById('pa');
  document.getElementById('pa-abc').addEventListener('click',function(e){var b=e.target.closest('[data-pc]');if(b){paC=b.dataset.pc;pareto()}});
  document.querySelectorAll('[data-pg]').forEach(function(b){b.onclick=function(){paG=b.dataset.pg;document.querySelectorAll('[data-pg]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});pareto()}});
  function pareto(){
    var k=paG,W=paEl.clientWidth,H=paEl.clientHeight;if(!W)return;
    var rows=DATA.rows.filter(function(r){return match(r,k)&&r[4]>0&&r[IDX[k]]!==SD});
    var g=group(rows,IDX[k],4).filter(function(x){return x[1]>0});
    var tot=g.reduce(function(s,x){return s+x[1]},0),n=g.length;
    var noun=k==='cli'?['cliente','clientes']:['producto','productos'];
    if(!n){paEl.innerHTML='<p class="empty">Sin ventas con estos filtros.</p>';document.getElementById('pa-insight').textContent='';document.getElementById('pa-abc').innerHTML='';document.getElementById('pa-list').innerHTML='';return}
    var cum=0,cls={A:[0,0],B:[0,0],C:[0,0]},pts=[];
    g.forEach(function(x){var prev=cum/tot;cum+=x[1];x.cum=cum/tot;x.c=prev<0.8?'A':(prev<0.95?'B':'C');cls[x.c][0]++;cls[x.c][1]+=x[1]});
    var nA=cls.A[0],pA=Math.round(cls.A[1]/tot*100);
    document.getElementById('pa-insight').innerHTML='<b>'+nA+' de '+n+' '+noun[1]+'</b> ('+Math.round(nA/n*100)+' %) hacen el <b>'+pA+' % de la venta</b>.';
    if(!cls[paC][0])paC='A';
    document.getElementById('pa-abc').innerHTML=[['A','ka'],['B','kb'],['C','kc']].map(function(c){var v=cls[c[0]];return '<button type="button" data-pc="'+c[0]+'" aria-pressed="'+(paC===c[0])+'"'+(v[0]?'':' disabled')+'><i class="'+c[1]+'">'+c[0]+'</i>'+v[0]+' '+(v[0]===1?noun[0]:noun[1])+' · '+copS(v[1])+' ('+Math.round(v[1]/tot*100)+' %)</button>'}).join('');
    var DESC={A:'hacen el primer 80 % de la venta',B:'llevan del 80 % al 95 %',C:'son el último 5 %'};
    var lst=g.map(function(x,i){x.rk=i+1;return x}).filter(function(x){return x.c===paC});
    document.getElementById('pa-list').innerHTML='<h3>Clase '+paC+': '+lst.length+' '+(lst.length===1?noun[0]:noun[1])+' <span>'+DESC[paC]+' · toca uno para filtrar</span></h3><div class="pl">'+lst.map(function(x){
      return '<button type="button" class="'+(F[k]===x[0]?'sel':'')+'" data-pk="'+k+'" data-pv="'+esc(x[0])+'"><span class="rk">'+x.rk+'</span><span class="nm" title="'+esc(x[0])+'">'+esc(x[0])+'</span><span class="vl">'+copS(x[1])+'<small>'+(x[1]/tot*100).toFixed(1).replace('.',',')+' % · acum. '+Math.round(x.cum*100)+' %</small></span></button>';
    }).join('')+'</div>';
    var ml=52,mr=40,mt=12,mb=26,pw=W-ml-mr,ph=H-mt-mb,max=g[0][1],bw=pw/n,gapb=bw>6?2:(bw>3?1:0);
    var y=function(v){return mt+ph-(v/max)*ph},yc=function(p){return mt+ph-p*ph};
    var s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Gráfica de Pareto">';
    [0,0.5,1].forEach(function(t){s+='<line class="grid" x1="'+ml+'" x2="'+(W-mr)+'" y1="'+y(max*t)+'" y2="'+y(max*t)+'"/><text class="ax" x="'+(ml-6)+'" y="'+(y(max*t)+4)+'" text-anchor="end">'+copS(max*t)+'</text>'});
    [0.5,0.8,1].forEach(function(p){s+='<text class="ax" x="'+(W-mr+6)+'" y="'+(yc(p)+4)+'">'+Math.round(p*100)+' %</text>'});
    s+='<line class="ref" x1="'+ml+'" x2="'+(W-mr)+'" y1="'+yc(0.8)+'" y2="'+yc(0.8)+'"/>';
    var col={A:'var(--s1)',B:'var(--pb)',C:'var(--s0)'};
    g.forEach(function(x,i){
      var bx=ml+i*bw,bh=Math.max(1,ph-(y(x[1])-mt)),r=Math.min(3,(bw-gapb)/2);
      var tipH=esc('<b>'+esc(x[0])+'</b>'+cop(x[1])+' · '+(x[1]/tot*100).toFixed(1).replace('.',',')+' %<br>Acumulado: '+Math.round(x.cum*100)+' % · Clase '+x.c);
      var sl=F[k]===x[0];
      s+='<g><rect class="hit" x="'+bx+'" y="'+mt+'" width="'+bw+'" height="'+ph+'" data-pk="'+k+'" data-pv="'+esc(x[0])+'" data-tip="'+tipH+'"/><rect class="pbar" pointer-events="none" x="'+(bx+gapb/2)+'" y="'+y(x[1])+'" width="'+Math.max(0.5,bw-gapb)+'" height="'+bh+'" rx="'+r+'" fill="'+(sl?'var(--red)':col[x.c])+'"/></g>';
      pts.push((bx+bw/2).toFixed(1)+','+yc(x.cum).toFixed(1));
    });
    s+='<polyline class="cum" points="'+ml+','+yc(0)+' '+pts.join(' ')+'"/>';
    var a=g[nA-1],ax=ml+(nA-0.5)*bw;
    s+='<circle class="dot" cx="'+ax+'" cy="'+yc(a.cum)+'" r="5"/><text class="lab" x="'+Math.min(ax+8,W-mr-60)+'" y="'+(yc(a.cum)+18)+'">'+Math.round(a.cum*100)+' % con '+nA+'</text>';
    s+='<line class="grid" x1="'+ml+'" x2="'+(W-mr)+'" y1="'+(mt+ph)+'" y2="'+(mt+ph)+'"/><text class="ax" x="'+ml+'" y="'+(H-6)+'">Mayor venta</text><text class="ax" x="'+(W-mr)+'" y="'+(H-6)+'" text-anchor="end">Menor venta →</text></svg>';
    paEl.innerHTML=s;
  }
  function aMonths(){
    var fe={},fc={};DATA.rows.forEach(function(r){if(match(r,'mes')){var o=r[3]?fc:fe;o[r[7]]=(o[r[7]]||0)+r[4]}});
    mmChart(document.getElementById('a-mm'),document.getElementById('a-lgd'),fe,fc,{proj:true,click:true,sel:F.mes});
  }
  function render(){
    Object.keys(F).forEach(function(k){sel[k].classList.toggle('on',!!F[k])});
    var rows=DATA.rows.filter(function(r){return match(r)});
    var allTot=DATA.rows.reduce(function(s,r){return s+r[4]},0);
    var tot=rows.reduce(function(s,r){return s+r[4]},0);
    var units=rows.reduce(function(s,r){return s+r[6]},0);
    var clis={},prods={};rows.forEach(function(r){if(r[4]>0){clis[r[0]]=1;if(r[1]!==SD)prods[r[1]]=1}});
    var nc=Object.keys(clis).length,np=Object.keys(prods).length;
    var act=Object.keys(F).filter(function(k){return F[k]});
    document.getElementById('f-clear').hidden=!act.length;
    document.getElementById('kpis').innerHTML=[
      ['main','Ventas netas sin IVA',cop(tot),act.length?(allTot?(Math.round(tot/allTot*1000)/10).toLocaleString('es-CO'):0)+' % de '+ALL_S+' · '+CO_LBL[CO]:PERIODO+' · '+CO_LBL[CO]],
      ['','Unidades vendidas',num(units),units?'Precio promedio '+copS(tot/units):'—'],
      ['','Clientes que compraron',num(nc),nc?'Promedio '+copS(tot/nc)+' c/u':'—'],
      ['','Productos vendidos',num(np),'referencias distintas']
    ].map(function(k){return '<div class="kpi '+k[0]+'"><div class="l">'+k[1]+'</div><div class="n">'+k[2]+'</div><div class="s">'+k[3]+'</div></div>'}).join('');
    document.getElementById('f-summary').innerHTML=act.length?'Viendo: '+act.map(function(k){return LABEL[k]+' <b>'+esc(F[k])+'</b>'+(k==='mes'&&PARTIAL&&F[k]===MN(LAST)?' (al '+DAYS+')':'')}).join(' · '):'Viendo todas las ventas de '+ALL_L+'.';
    bars(document.getElementById('b-prod'),'prod',4,8,copS);
    bars(document.getElementById('b-uni'),'prod',6,8,function(v){return num(v)+' und'});
    bars(document.getElementById('b-cli'),'cli',4,8,copS);
    fichas();aMonths();treemap();donuts();pareto();
  }

  // ===== Fichas: al elegir un cliente o un producto =====
  // Cliente: cuánto compró, qué compra (de mayor a menor) y qué no compra de lo que sí compran otros.
  // Producto: quién lo compra (de mayor a menor) y qué clientes activos no lo compran.
  // Ambas respetan el mes elegido y la empresa; tocar una fila filtra por ella.
  function lista(items,k,fmtV,vacio){
    if(!items.length)return '<p class="empty">'+vacio+'</p>';
    return '<div class="pl fl">'+items.map(function(x,i){
      return '<button type="button" data-pk="'+k+'" data-pv="'+esc(x.n)+'"'+(F[k]===x.n?' class="sel"':'')+'><span class="rk">'+(i+1)+'</span><span class="nm" title="'+esc(x.n)+'">'+esc(x.n)+'</span><span class="vl">'+fmtV(x)+'</span></button>';
    }).join('')+'</div>';
  }
  function sumar(rows,i){var g={};rows.forEach(function(r){var o=g[r[i]]||(g[r[i]]={n:r[i],v:0,q:0});o.v+=r[4];o.q+=r[6]});return Object.keys(g).map(function(k){return g[k]}).filter(function(x){return x.v>0&&x.n!==SD}).sort(function(a,b){return b.v-a.v})}
  function fichas(){
    var el=document.getElementById('fichas');
    if(!F.cli&&!F.prod){el.hidden=true;el.innerHTML='';return}
    var base=DATA.rows.filter(function(r){return !F.mes||r[2]===F.mes});
    var cuando=F.mes?' en '+esc(F.mes.toLowerCase()):' de '+ALL_L;
    var vq=function(x){return copS(x.v)+'<small>'+num(x.q)+' und</small>'};
    var html='';
    if(F.cli){
      var rc=base.filter(function(r){return r[0]===F.cli});
      var tot=rc.reduce(function(s,r){return s+r[4]},0);
      var meses={};rc.forEach(function(r){if(r[4]>0)meses[r[7]]=1});var ms=Object.keys(meses).map(Number).sort(function(a,b){return a-b});
      var compra=sumar(rc,1),tiene={};compra.forEach(function(x){tiene[x.n]=1});
      var noCompra=sumar(base,1).filter(function(x){return !tiene[x.n]});
      html+='<section class="card fi-card"><div class="fi-head"><span class="tag t-blue">Ficha del cliente</span><h2 class="ch">'+esc(F.cli)+'</h2>'+
        '<p class="muted sm">Compró <b class="fi-n">'+cop(tot)+'</b>'+cuando+(ms.length?' · en '+ms.length+(ms.length===1?' mes':' meses')+' · última compra en '+MN(ms[ms.length-1]).toLowerCase():'')+' · '+compra.length+(compra.length===1?' producto distinto':' productos distintos')+'</p></div>'+
        '<div class="grid2"><div><h3>Lo que más compra</h3><p class="muted sm">De mayor a menor venta · toca uno para ver ese producto</p>'+lista(compra,'prod',function(x){return copS(x.v)+'<small>'+num(x.q)+' und · '+(tot?Math.round(x.v/tot*100):0)+' %</small>'},'No tiene compras con estos filtros.')+'</div>'+
        '<div><h3>Lo que no ha comprado</h3><p class="muted sm">'+noCompra.length+' productos que otros clientes sí compran'+cuando+', ordenados por lo que más se vende</p>'+lista(noCompra,'prod',function(x){return copS(x.v)+'<small>venta total</small>'},'Ha comprado todo lo que se vende.')+'</div></div></section>';
    }
    if(F.prod){
      var rp=base.filter(function(r){return r[1]===F.prod});
      var totp=rp.reduce(function(s,r){return s+r[4]},0),uni=rp.reduce(function(s,r){return s+r[6]},0);
      var quien=sumar(rp,0),lo={};quien.forEach(function(x){lo[x.n]=1});
      var noLo=sumar(base,0).filter(function(x){return !lo[x.n]});
      html+='<section class="card fi-card"><div class="fi-head"><span class="tag t-blue">Ficha del producto</span><h2 class="ch">'+esc(F.prod)+'</h2>'+
        '<p class="muted sm">Se vendieron <b class="fi-n">'+cop(totp)+'</b>'+cuando+' · '+num(uni)+' und · a '+quien.length+(quien.length===1?' cliente':' clientes')+'</p></div>'+
        '<div class="grid2"><div><h3>Quién lo compra más</h3><p class="muted sm">De mayor a menor · toca uno para ver ese cliente</p>'+lista(quien,'cli',function(x){return copS(x.v)+'<small>'+num(x.q)+' und · '+(totp?Math.round(x.v/totp*100):0)+' %</small>'},'Nadie lo compró con estos filtros.')+'</div>'+
        '<div><h3>Clientes que no lo compran</h3><p class="muted sm">'+noLo.length+' clientes que compraron otras cosas'+cuando+', ordenados por lo que compran</p>'+lista(noLo,'cli',function(x){return copS(x.v)+'<small>compras totales</small>'},'Todos los clientes lo compraron.')+'</div></div></section>';
    }
    el.innerHTML=html;el.hidden=false;
  }
  function loadSet(){
    derive();
    var keepF={};Object.keys(F).forEach(function(k){keepF[k]=F[k]});
    DATA={rows:ALL.filter(function(r){return CO==='all'||(CO==='fe'?r[3]===0:r[3]===1)})};
    ranks();fillSelects();
    // conserva el mes; producto y cliente solo si existen en la empresa elegida
    Object.keys(F).forEach(function(k){F[k]=keepF[k]&&DATA.rows.some(function(r){return r[IDX[k]]===keepF[k]})?keepF[k]:'';sel[k].value=F[k]});
    Object.keys(tiles).forEach(function(t){tiles[t].remove()});tiles={};tmEl.innerHTML='';
    document.getElementById('a-tags').innerHTML='<span class="tag t-blue">'+PERIODO+'</span> <span class="tag t-blue">'+CO_LBL[CO]+'</span>';
    document.getElementById('a-note').textContent=creditNote();
    render();
  }

  // ===== Resumen =====
  var rRows=[],rShowAll=false,rFE={},rFC={};
  var mmEl=document.getElementById('r-mm');
  function rMM(){mmChart(mmEl,document.getElementById('r-lgd'),rFE,rFC,{proj:true})}
  function pct(a,b){return b?((a/b-1)*100):0}
  function chg(v){var c=v>=0?'up':'down';return '<span class="chg '+c+'">'+(v>=0?'▲ +':'▼ ')+v.toFixed(1).replace('.',',')+' %</span>'}
  function rTbl(){
    var list=rShowAll?rRows:rRows.slice(0,15);
    document.querySelector('#r-tbl tbody').innerHTML=list.map(function(r){
      var v=!(r.a>0)?'<span class="chg up">Nuevo</span>':(!(r.o>0)?'<span class="chg down">Sin compra</span>':chg(pct(r.p,r.a)));
      return '<tr><td title="'+esc(r.c)+'">'+esc(r.c)+'</td><td class="num">'+(r.a?copS(r.a):'—')+'</td><td class="num">'+(r.o?copS(r.o):'—')+'</td>'+(PARTIAL?'<td class="num">'+(r.o?copS(r.p):'—')+'</td>':'')+'<td class="num">'+v+'</td></tr>';
    }).join('');
    document.getElementById('r-more').textContent=rShowAll?'Ver solo los 15 principales':'Ver todos los clientes ('+rRows.length+')';
  }
  document.getElementById('r-more').onclick=function(){rShowAll=!rShowAll;rTbl()};
  function lst(el,arr,val){
    var t=arr.reduce(function(s,r){return s+val(r)},0);
    el.innerHTML='<div class="tot"><span>'+arr.length+' clientes</span><span>'+copS(t)+'</span></div>'+(arr.length?arr.map(function(r){return '<div><span title="'+esc(r.c)+'">'+esc(r.c)+'</span><span>'+copS(val(r))+'</span></div>'}).join(''):'');
  }
  function rLabels(){
    var mn=MN(LAST).toLowerCase();
    document.getElementById('r-tags').innerHTML='<span class="tag t-blue">'+esc(PERIODO)+'</span>'+(PARTIAL?' <span class="tag t-warn">'+MN(LAST)+' en curso</span>':'');
    document.getElementById('r-lede').textContent='Ventas a clientes sin IVA y cómo va '+mn+' frente al promedio de '+PREV_L+'.';
    document.getElementById('r-mmnote').textContent=(PARTIAL?MN(LAST)+' va al '+DAYS+' ('+Math.round(DAYS/MD*100)+' % del mes); la proyección supone el mismo ritmo hasta el '+MD+'. ':'')+(PREV.length?'La línea punteada es el promedio de '+PREV_L+'.':'');
    document.getElementById('r-cmpnote').textContent='Promedio mensual de '+PREV_L+' contra '+mn+'. La variación compara '+mn+(PARTIAL?' proyectado':'')+' con ese promedio.';
    document.getElementById('r-thead').innerHTML='<tr><th>Cliente</th><th class="num">'+cap(PREV_S)+'<br><small>prom./mes</small></th><th class="num">'+MN(LAST)+'<br><small>'+(PARTIAL?'al '+DAYS:'mes completo')+'</small></th>'+(PARTIAL?'<th class="num">'+MN(LAST)+'<br><small>proyectado</small></th>':'')+'<th class="num">Variación</th></tr>';
    document.getElementById('r-lost-h').textContent='Compraron en '+JS_S+(PARTIAL?' y aún no en ':' y no en ')+mn;
    document.getElementById('r-lost-p').textContent='Para llamar: ordenados por lo que compraron de '+JS_L;
    document.getElementById('r-new-h').textContent='Clientes nuevos en '+mn;
    document.getElementById('r-new-p').textContent='No compraron de '+PREV_L;
  }
  function rRender(){
    rFE={};rFC={};var cli={},inP={},inJ={};
    PREV.forEach(function(m){inP[m]=1});JS.forEach(function(m){inJ[m]=1});
    R.forEach(function(r){
      if(!inCo(r))return;
      var o=r[0]?rFC:rFE;o[r[3]]=(o[r[3]]||0)+r[4];
      var c=r[1],x=cli[c]||(cli[c]={t:0,as:0,js:0,o:0});
      x.t+=r[4];if(inP[r[3]])x.as+=r[4];if(inJ[r[3]])x.js+=r[4];if(r[3]===LAST)x.o+=r[4];
    });
    var T=function(m){return (rFE[m]||0)+(rFC[m]||0)};
    var np=PREV.length||1,tAS=0,best=PREV[0];PREV.forEach(function(m){tAS+=T(m);if(T(m)>T(best))best=m});
    var acc=0;MONTHS.forEach(function(m){acc+=T(m)});
    var avg=PREV.length?tAS/np:0,tOC=T(LAST),proj=tOC*FAC,vp=pct(proj,avg);
    var ncli=Object.keys(cli).filter(function(k){return cli[k].t>0}).length;
    document.getElementById('r-kpis').innerHTML=[
      ['main','Acumulado '+ALL_S,cop(acc),ncli+' clientes · '+CO_LBL[CO]],
      ['','Promedio mensual '+PREV_S,avg?copS(avg):'—',best!=null?'Mejor mes: '+MN(best).toLowerCase()+' '+copS(T(best)):'Sin meses anteriores'],
      ['',LAST_LBL,copS(tOC),avg?Math.round(tOC/avg*100)+' % del promedio mensual':'—'],
      PARTIAL?['',MN(LAST)+' proyectado',copS(proj),avg?chg(vp)+' vs promedio':'—']:['','Variación vs promedio',avg?(vp>=0?'+':'')+vp.toFixed(1).replace('.',',')+' %':'—',MN(LAST)+' frente a '+PREV_S]
    ].map(function(k){return '<div class="kpi '+k[0]+'"><div class="l">'+k[1]+'</div><div class="n">'+k[2]+'</div><div class="s">'+k[3]+'</div></div>'}).join('');
    rRows=Object.keys(cli).map(function(k){var x=cli[k];return {c:k,a:x.as/np,o:x.o,p:x.o*FAC,t:x.t,js:x.js}}).filter(function(r){return r.t!==0}).sort(function(a,b){return b.t-a.t});
    rLabels();
    rTbl();
    lst(document.getElementById('r-lost'),rRows.filter(function(r){return r.js>0&&!(r.o>0)}).sort(function(a,b){return b.js-a.js}),function(r){return r.js});
    lst(document.getElementById('r-new'),rRows.filter(function(r){return !(r.a>0)&&r.o>0}).sort(function(a,b){return b.o-a.o}),function(r){return r.o});
    document.getElementById('r-note').textContent=creditNote();
    rMM();
  }
  var t2;alRedimensionar(function(){clearTimeout(t2);t2=setTimeout(rMM,120)});
  tabs.resumen.addEventListener('click',function(){setTimeout(rMM,30)});
  tabs.analisis.addEventListener('click',function(){setTimeout(render,30)});

  // ===== Empresa (compartido entre pestañas) =====
  function setCo(c){
    CO=c;store.set('ventas-co',c);
    document.querySelectorAll('[data-co]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.co===c?'true':'false')});
    loadSet();rRender();
  }
  document.querySelectorAll('[data-co]').forEach(function(b){b.onclick=function(){setCo(b.dataset.co)}});
  rebuildRows();
  var co0=store.get('ventas-co');setCo(co0==='fe'||co0==='fc'?co0:'all');

  // ===== Cargar informe (Excel de Odoo → db "ventas") =====
  var XLSX_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var MES_RX=/(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|jan|apr|aug|dec)[a-zé]*\.?\s*(?:de\s+)?(\d{4})/i;
  var MES_N={ene:1,jan:1,feb:2,mar:3,abr:4,apr:4,may:5,jun:6,jul:7,ago:8,aug:8,sep:9,set:9,oct:10,nov:11,dic:12,dec:12};
  var DBV=null,upCo=0,pending=null;
  var $=function(id){return document.getElementById(id)};
  function upMsg(t,cls){var el=$('up-msg');el.textContent=t||'';el.className='up-msg'+(cls?' '+cls:'')}
  function loadXLSX(){return Promise.resolve(XLSX)}

  function numv(v){if(typeof v==='number')return isFinite(v)?v:0;if(v==null)return 0;var s=String(v).replace(/[^\d,.\-]/g,'');if(!s)return 0;if(s.indexOf(',')>-1)s=s.replace(/\./g,'').replace(',','.');var n=parseFloat(s);return isFinite(n)?n:0}
  function normProd(t){return t.replace(/^\[[^\]]*\]\s*/,'').trim()||SD}
  function Fail(m){this.message=m}
  // Lee la tabla dinámica exportada: filas Total › Contacto › Producto (sangría con espacios), columnas por mes con Cantidad y Subtotal.
  function parseOdoo(XL,wb,mesManual){
    var ws=wb.Sheets[wb.SheetNames[0]];
    var A=XL.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:true});
    (ws['!merges']||[]).forEach(function(m){var v=(A[m.s.r]||[])[m.s.c];for(var r=m.s.r;r<=m.e.r;r++){A[r]=A[r]||[];for(var c=m.s.c;c<=m.e.c;c++)if(A[r][c]==null)A[r][c]=v}});
    var isV=function(v){return typeof v==='string'&&/subtotal|sin impuestos/i.test(v)};
    var mr=-1;for(var i=0;i<Math.min(A.length,20);i++){if((A[i]||[]).some(isV)){mr=i;break}}
    if(mr<0)throw new Fail('No encontré la columna Subtotal. En Medidas deben estar marcadas Cantidad de producto y Subtotal (paso 8).');
    var cols=[],head=A[mr]||[];
    for(var c=1;c<head.length;c++){
      var mv=head[c],kind=isV(mv)?'v':(typeof mv==='string'&&/cantidad/i.test(mv)?'q':null);if(!kind)continue;
      var ym=null;for(var r=0;r<mr;r++){var hv=A[r]&&A[r][c],mt=typeof hv==='string'&&hv.match(MES_RX);if(mt)ym=mt[2]+'-'+String(MES_N[mt[1].toLowerCase().slice(0,3)]).padStart(2,'0')}
      cols.push({c:c,kind:kind,ym:ym});
    }
    var withM=cols.filter(function(x){return x.ym});
    if(withM.length)cols=withM;
    else{
      if(!mesManual)return {needMonth:true};
      var fv=cols.find(function(x){return x.kind==='v'}),fq=cols.find(function(x){return x.kind==='q'});
      cols=[fv,fq].filter(Boolean).map(function(x){return {c:x.c,kind:x.kind,ym:mesManual}});
    }
    if(!cols.some(function(x){return x.kind==='v'}))throw new Fail('No encontré valores de Subtotal en el archivo.');
    var body=[];
    for(var i2=mr+1;i2<A.length;i2++){var row=A[i2];if(!row||row[0]==null)continue;var raw=String(row[0]);if(!raw.trim())continue;body.push({ind:raw.match(/^\s*/)[0].length,t:raw.trim(),row:row})}
    if(!body.length)throw new Fail('El archivo no trae filas de clientes. Revisa que hayas usado Expandir todo antes de descargar (paso 9).');
    var lv=[];body.forEach(function(b){if(lv.indexOf(b.ind)<0)lv.push(b.ind)});lv.sort(function(a,b){return a-b});
    if(lv.length<3)throw new Fail('No pude separar los clientes de los productos. La tabla debe estar agrupada por Contacto y luego por Producto (paso 6), y expandida antes de descargar (paso 9).');
    var out={},tot={},cli=null;
    cols.forEach(function(x){out[x.ym]=out[x.ym]||{};tot[x.ym]=tot[x.ym]||{v:0,q:0}});
    function add(c,p,row){cols.forEach(function(x){var n=numv(row[x.c]);if(!n)return;var k=c+'\u0001'+p,o=out[x.ym][k]||(out[x.ym][k]={c:c,p:p,v:0,q:0});o[x.kind]+=n})}
    body.forEach(function(b,ix){
      var L=lv.indexOf(b.ind);
      if(L===0){cols.forEach(function(x){tot[x.ym][x.kind]+=numv(b.row[x.c])});return}
      if(L===1){cli=b.t;var nx=body[ix+1];if(nx&&lv.indexOf(nx.ind)>=2)return;add(cli,SD,b.row);return}
      if(L===2&&cli)add(cli,normProd(b.t),b.row);
    });
    var months=Object.keys(out).sort().map(function(ym){
      var filas=Object.keys(out[ym]).map(function(k){var o=out[ym][k];return {c:o.c,p:o.p,v:Math.round(o.v*100)/100,q:Math.round(o.q*100)/100}});
      var v=filas.reduce(function(s,f){return s+f.v},0),q=filas.reduce(function(s,f){return s+f.q},0);
      var cs={},ps={};filas.forEach(function(f){cs[f.c]=1;if(f.p!==SD)ps[f.p]=1});
      return {ym:ym,filas:filas,v:v,q:q,nc:Object.keys(cs).length,np:Object.keys(ps).length,check:tot[ym].v,diff:Math.abs(v-tot[ym].v)>1&&tot[ym].v!==0};
    }).filter(function(m){return m.filas.length});
    if(!months.length)throw new Fail('El archivo no trae ventas con valor.');
    return {months:months};
  }
  function coName(co){return co?'FC':'Feisen'}
  function docId(co,ym){return (co?'fc':'feisen')+'-'+ym}
  function showPreview(res,fname){
    pending={co:upCo,months:res.months,fname:fname};
    var warn=res.months.filter(function(m){return m.diff});
    var rows=res.months.map(function(m){
      var mm=mOfYm(m.ym),had=UP[docId(upCo,m.ym)],base=BASE.some(function(r){return r[0]===upCo&&r[3]===mm});
      var st=had?'<span class="st rep">Reemplaza la carga anterior</span>':(base?'<span class="st rep">Reemplaza los datos de origen</span>':'<span class="st new">Mes nuevo</span>');
      return '<tr><td>'+esc(NOM[moOf(mm)]+' '+yOf(mm))+'</td><td class="num">'+num(m.nc)+'</td><td class="num">'+num(m.np)+'</td><td class="num">'+num(m.q)+'</td><td class="num">'+cop(m.v)+'</td><td>'+st+'</td></tr>';
    }).join('');
    $('up-preview').innerHTML='<div class="tbl flat"><table><thead><tr><th>Mes</th><th class="num">Clientes</th><th class="num">Productos</th><th class="num">Unidades</th><th class="num">Venta sin IVA</th><th>Al guardar</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      (warn.length?'<p class="up-warn">La suma de las filas no coincide con el Total del archivo en '+warn.map(function(m){return esc(m.ym)}).join(', ')+'. Revisa que la tabla esté expandida y vuelve a descargarla.</p>':'');
    upMsg('Revisa el resumen de '+coName(upCo)+'. Compara la venta con el Total de Odoo y, si coincide, guarda.','');
    $('up-save').disabled=!DBV;$('up-cancel').hidden=false;
  }
  function resetUp(){pending=null;$('up-preview').innerHTML='';$('up-save').disabled=true;$('up-cancel').hidden=true;$('up-month-row').hidden=true;$('up-file').value='';$('up-fname').textContent='Ningún archivo elegido'}
  var lastFile=null;
  async function readFile(file){
    if(!file)return;
    lastFile=file;$('up-fname').textContent=file.name;$('up-preview').innerHTML='';$('up-save').disabled=true;pending=null;
    if(!/\.xlsx?$/i.test(file.name)){upMsg('El archivo debe ser el Excel (.xlsx) que descarga Odoo.','err');return}
    var guess=file.name.match(/feisen|fc/i);if(guess){upCo=/fc/i.test(guess[0])&&!/feisen/i.test(file.name)?1:0;paintCo()}
    upMsg('Leyendo el archivo…');
    try{
      var XL=await loadXLSX();
      var wb=XL.read(await file.arrayBuffer(),{type:'array'});
      var mm=$('up-month-row').hidden?null:($('up-month').value||null);
      var res=parseOdoo(XL,wb,mm);
      if(res.needMonth){$('up-month-row').hidden=false;if(!$('up-month').value){var d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);$('up-month').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}upMsg('Elige el mes del archivo y lo vuelvo a leer.');res=parseOdoo(XL,wb,$('up-month').value)}
      showPreview(res,file.name);
    }catch(e){upMsg(e instanceof Fail?e.message:(e&&e.message==='lib'?'No se pudo cargar el lector de Excel. Revisa la conexión e inténtalo de nuevo.':'No pude leer el archivo. Asegúrate de que sea el Excel descargado de la tabla dinámica de Odoo.'),'err')}
  }
  function paintCo(){document.querySelectorAll('[data-up-co]').forEach(function(b){b.setAttribute('aria-pressed',+b.dataset.upCo===upCo?'true':'false')})}
  document.querySelectorAll('[data-up-co]').forEach(function(b){b.onclick=function(){upCo=+b.dataset.upCo;paintCo();if(lastFile&&pending)readFile(lastFile)}});
  $('up-file').addEventListener('change',function(e){readFile(e.target.files[0])});
  $('up-month').addEventListener('change',function(){if(lastFile)readFile(lastFile)});
  var drop=$('up-drop');
  ['dragenter','dragover'].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.add('over')})});
  ['dragleave','drop'].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.remove('over')})});
  drop.addEventListener('drop',function(e){var f=e.dataTransfer&&e.dataTransfer.files[0];if(f)readFile(f)});
  $('up-cancel').onclick=function(){resetUp();upMsg('')};
  $('up-save').onclick=async function(){
    if(!pending||!DBV)return;
    var p=pending,btn=$('up-save');btn.disabled=true;$('up-cancel').hidden=true;upMsg('Guardando…');
    var done=0;
    try{
      for(var i=0;i<p.months.length;i++){
        var m=p.months[i],ref=DBV.collection('ventas').doc(docId(p.co,m.ym));
        var body={empresa:p.co?'fc':'feisen',mes:m.ym,filas:m.filas,total:m.v,unidades:m.q,clientes:m.nc,productos:m.np,archivo:String(p.fname).slice(0,120),subido:new Date().toISOString()};
        try{await ref.set(body)}catch(e){if(e&&e.code==='unavailable'){await new Promise(function(r){setTimeout(r,800+Math.random()*700)});await ref.set(body)}else throw e}
        done++;
      }
      resetUp();upMsg('Listo: '+done+(done===1?' mes guardado':' meses guardados')+' para '+coName(p.co)+'. El Resumen y el Análisis ya lo muestran.','ok');if(opts.alGuardar)opts.alGuardar();
    }catch(e){
      var c=e&&e.code;
      upMsg((done?'Se guardaron '+done+' de '+p.months.length+' meses. ':'')+(c==='invalid_argument'?'No se pudo guardar: tu usuario no tiene permiso para escribir en este tablero, o el mes tiene demasiadas filas. Pide acceso de edición a quien te compartió el tablero.':c==='quota_exceeded'?'No se pudo guardar: el tablero llegó a su límite de espacio. Avísale a gerencia.':'No se pudo guardar por un problema de conexión. Inténtalo de nuevo en un momento.'),'err');
      btn.disabled=false;$('up-cancel').hidden=false;
    }
  };
  function renderUpList(){
    var arr=Object.keys(UP).map(function(k){return UP[k]}).sort(function(a,b){return b.m-a.m||a.co-b.co});
    $('up-list').innerHTML=arr.length?arr.map(function(u){var d=u.subido?new Date(u.subido):null;return '<div><span title="'+esc(u.archivo||'')+'">'+esc(NOM[moOf(u.m)]+' '+yOf(u.m))+' · '+coName(u.co)+(d&&!isNaN(d)?' <small class="muted">subido '+d.toLocaleDateString('es-CO')+'</small>':'')+'</span><span>'+copS(u.total)+'</span></div>'}).join(''):'<p class="empty">Todavía no se ha cargado ningún mes.</p>';
  }
  function applySnap(snap){
    var next={};
    snap.docs.forEach(function(d){
      var x=d.data();if(!x||typeof x.mes!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(x.mes)||!Array.isArray(x.filas))return;
      var co=x.empresa==='fc'?1:(x.empresa==='feisen'?0:-1);if(co<0)return;
      var filas=[];x.filas.forEach(function(f){if(!f||typeof f!=='object')return;var v=Number(f.v),q=Number(f.q);if(!isFinite(v))return;filas.push({c:String(f.c||'Sin nombre').slice(0,200),p:String(f.p||SD).slice(0,200),v:v,q:isFinite(q)?q:0})});
      if(!filas.length)return;
      next[docId(co,x.mes)]={co:co,m:mOfYm(x.mes),ym:x.mes,filas:filas,total:filas.reduce(function(s,f){return s+f.v},0),archivo:typeof x.archivo==='string'?x.archivo:'',subido:typeof x.subido==='string'?x.subido:''};
    });
    UP=next;rebuildRows();loadSet();rRender();renderUpList();
  }
  // Guardado en Supabase (antes: base de datos del artefacto). DBV imita la forma que usaba el tablero.
  if(opts.puedeCargar){
    DBV={collection:function(){return {doc:function(){return {set:function(body){return opts.guardarMes(body)}}}}}};
  }else{$('up-off').hidden=false;$('up-form').hidden=true}
  applySnap(opts.snapshot);

  return {
    actualizar:function(snapshot){applySnap(snapshot)},
    desmontar:function(){limpiezas.forEach(function(f){f()})}
  };
}
