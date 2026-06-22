// ════════════════════════════════════════════════
// CONFIGURACIÓN FIREBASE — YA ESTÁ CARGADA CON TUS DATOS
// ════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyDtrkKejWZVQ6I-OVCgw-SjVx5MRGBv5gI",
  authDomain: "compra-aqui-963.firebaseapp.com",
  projectId: "compra-aqui-963",
  storageBucket: "compra-aqui-963.firebasestorage.app",
  messagingSenderId: "245065047300",
  appId: "1:245065047300:web:95660fcdb428a52ca94451"
};

// ════════════════════════════════════════════════
// ⚠️ CAMBIÁ ESTO POR TU EMAIL DE ADMIN
// ════════════════════════════════════════════════
const ADMIN_EMAIL = "juanmikael369@gmail.com";

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

let currentUser    = null;
let productosCache = [];
let fotosActuales  = [];
let fotoIndex      = 0;
let config         = {};

// ════════════════════════════════════════════════
// COLORES POR TEMA
// ════════════════════════════════════════════════
const colores = {
  indigo: { accent:'#6366f1', accent2:'#818cf8', accent3:'#4f46e5', glow:'rgba(99,102,241,0.3)' },
  blue:   { accent:'#3b82f6', accent2:'#60a5fa', accent3:'#2563eb', glow:'rgba(59,130,246,0.3)' },
  violet: { accent:'#8b5cf6', accent2:'#a78bfa', accent3:'#7c3aed', glow:'rgba(139,92,246,0.3)' },
  cyan:   { accent:'#06b6d4', accent2:'#22d3ee', accent3:'#0891b2', glow:'rgba(6,182,212,0.3)' },
  red:    { accent:'#ef4444', accent2:'#f87171', accent3:'#dc2626', glow:'rgba(239,68,68,0.3)' },
  orange: { accent:'#f97316', accent2:'#fb923c', accent3:'#ea580c', glow:'rgba(249,115,22,0.3)' }
};
function aplicarColor(c) {
  const t = colores[c] || colores.indigo;
  const r = document.documentElement.style;
  r.setProperty('--accent',  t.accent);
  r.setProperty('--accent2', t.accent2);
  r.setProperty('--accent3', t.accent3);
  r.setProperty('--glow',    t.glow);
  r.setProperty('--shadow-accent', `0 0 32px ${t.glow}`);
  r.setProperty('--border', `${t.glow.replace('0.3','0.15')}`);
}

// ════════════════════════════════════════════════
// CONFIG TIENDA
// ════════════════════════════════════════════════
async function cargarConfig() {
  try {
    const doc = await db.collection('config').doc('tienda').get();
    config = doc.exists ? doc.data() : {};
    aplicarColor(config.color || 'indigo');
    aplicarLogo(config);  // aplica logo/ícono en login, topbar, favicon
    // Aplicar textos
    const titulo = config.titulo || 'Productos disponibles';
    const sub    = config.subtitulo || 'Encontrá lo que buscás y contactanos por WhatsApp';
    const el1 = document.getElementById('tienda-titulo-hero');
    const el2 = document.getElementById('tienda-subtitulo-hero');
    if (el1) el1.textContent = titulo;
    if (el2) el2.textContent = sub;
    // Nombre tienda
    const brandEls = document.querySelectorAll('.topbar-brand, .brand-name');
    if (config.nombre) {
      brandEls.forEach(el => {
        el.innerHTML = config.nombre + '<span>.</span>';
      });
    }
  } catch(e) { console.log('Config no encontrada, usando defaults'); }
}

// ════════════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════════════
// ── Historia de pantallas para que el botón volver del sistema funcione ──
const screenHistory = [];

function showScreen(id, productoId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  screenHistory.push(id);

  // Recordar dónde estaba el usuario, para volver ahí si recarga/reabre la app.
  // Solo nos interesa recordar pantallas "de contenido" (detalle/remate);
  // tienda/admin/login son los puntos de entrada normales, no hace falta guardarlas.
  if (id === 'screen-detalle' || id === 'screen-remate') {
    sessionStorage.setItem('ultimaPantalla', JSON.stringify({ id, productoId }));
  } else if (id === 'screen-tienda' || id === 'screen-admin') {
    sessionStorage.removeItem('ultimaPantalla');
  }

  // Use replaceState for root screens, pushState for sub-screens
  // This avoids creating extra history entries that lead to blank pages
  if (id === 'screen-login' || id === 'screen-register') {
    history.replaceState({ screen: id }, '', location.pathname);
  } else if (id === 'screen-tienda' || id === 'screen-admin') {
    // For main screens, replace so back from here goes to prev site or closes
    history.replaceState({ screen: id }, '', location.pathname);
    // But also push one extra so the back button triggers popstate instead of leaving
    history.pushState({ screen: id, anchor: true }, '', location.pathname);
  } else {
    // Sub-screens: push so back returns to parent
    history.pushState({ screen: id }, '', location.pathname);
  }
}

function showTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'tab-usuarios')  cargarUsuariosAdmin();
  if (id === 'tab-productos') cargarProductosAdmin();
  if (id === 'tab-config')    cargarConfigForm();
}

// ════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════
auth.onAuthStateChanged(async (user) => {
  await cargarConfig();
  if (!user) { showScreen('screen-login'); return; }
  currentUser = user;

  const userRef = db.collection('usuarios').doc(user.uid);
  const userDoc = await userRef.get();

  if (userDoc.exists && userDoc.data().bloqueado === true) {
    showScreen('screen-blocked'); return;
  }

  const nombre = userDoc.exists ? userDoc.data().nombre : (user.displayName || user.email.split('@')[0]);
  await userRef.set({
    uid: user.uid, email: user.email,
    nombre, bloqueado: false,
    fechaRegistro: userDoc.exists ? userDoc.data().fechaRegistro : new Date().toISOString(),
    ultimoAcceso: new Date().toISOString()
  }, { merge: true });

  const nd = document.getElementById('user-name-display');
  if (nd) nd.textContent = nombre;

  if (user.email === ADMIN_EMAIL) {
    await cargarMetricas();
    await cargarProductosAdmin();
    showScreen('screen-admin');
  } else {
    await cargarProductosTienda();
    await restaurarUltimaPantalla();
  }
});

// Si el usuario estaba viendo el detalle de un producto o un remate, lo
// volvemos a llevar ahí en vez de mostrarle siempre el listado general.
async function restaurarUltimaPantalla() {
  const guardado = sessionStorage.getItem('ultimaPantalla');
  if (!guardado) { showScreen('screen-tienda'); return; }

  let datos;
  try { datos = JSON.parse(guardado); } catch(e) { showScreen('screen-tienda'); return; }

  const p = productosCache.find(x => x.id === datos.productoId);
  // Si el producto ya no existe (lo borraron, por ej.), volvemos al listado normal.
  if (!p) { sessionStorage.removeItem('ultimaPantalla'); showScreen('screen-tienda'); return; }

  if (datos.id === 'screen-remate' && p.esRemate) {
    await verRemate(p.id);
  } else if (datos.id === 'screen-detalle') {
    verDetalle(p.id);
  } else {
    showScreen('screen-tienda');
  }
}

async function loginUser() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const err   = document.getElementById('login-error');
  err.classList.add('hidden');
  if (!email || !pass) { mostrarError(err, 'Completá todos los campos.'); return; }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) { mostrarError(err, traducirError(e.code)); }
}

async function registerUser() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  const err   = document.getElementById('register-error');
  const suc   = document.getElementById('register-success');
  err.classList.add('hidden'); suc.classList.add('hidden');
  const alias = (document.getElementById('reg-alias')?.value || '').trim() || name.split(' ')[0] + Math.floor(Math.random()*999);
  if (!name || !email || !pass) { mostrarError(err, 'Completá todos los campos.'); return; }
  if (pass.length < 6) { mostrarError(err, 'La contraseña debe tener al menos 6 caracteres.'); return; }
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('usuarios').doc(cred.user.uid).set({
      uid: cred.user.uid, email, nombre: name, alias,
      bloqueado: false, fechaRegistro: new Date().toISOString()
    });
    suc.textContent = '✅ ¡Cuenta creada! Ingresando...';
    suc.classList.remove('hidden');
  } catch(e) { mostrarError(err, traducirError(e.code)); }
}

function logoutUser() { sessionStorage.removeItem('ultimaPantalla'); auth.signOut(); }


// Intercept browser/system back button — never leave the app
window.addEventListener('popstate', function(e) {
  const active = document.querySelector('.screen.active');
  const current = active ? active.id : 'screen-tienda';

  // Don't intercept login/register
  if (current === 'screen-login' || current === 'screen-register') return;

  // Prevent leaving: always push back so there's always a state
  let destino = 'screen-tienda';
  if (current === 'screen-detalle' || current === 'screen-remate') {
    destino = 'screen-tienda';
  } else {
    // Already at tienda/admin — just re-push to prevent leaving
    history.pushState({ screen: current, anchor: true }, '', location.pathname);
    return;
  }

  // Navigate internally
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(destino);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  screenHistory.push(destino);
  history.pushState({ screen: destino, anchor: true }, '', location.pathname);
});

function mostrarError(el, msg) {
  el.textContent = '⚠️ ' + msg;
  el.classList.remove('hidden');
}

function traducirError(code) {
  const m = {
    'auth/user-not-found':     'No existe cuenta con ese email.',
    'auth/wrong-password':     'Contraseña incorrecta.',
    'auth/invalid-email':      'Email inválido.',
    'auth/email-already-in-use':'Ya existe una cuenta con ese email.',
    'auth/weak-password':      'Contraseña muy débil (mínimo 6 caracteres).',
    'auth/invalid-credential': 'Email o contraseña incorrectos.',
    'auth/too-many-requests':  'Demasiados intentos. Esperá unos minutos.',
  };
  return m[code] || 'Error inesperado (' + code + ')';
}

// ════════════════════════════════════════════════
// MÉTRICAS ADMIN
// ════════════════════════════════════════════════
async function cargarMetricas() {
  const [prods, users] = await Promise.all([
    db.collection('productos').get(),
    db.collection('usuarios').get()
  ]);
  const total      = prods.size;
  const vendidos   = prods.docs.filter(d => d.data().vendido).length;
  const disponibles= total - vendidos;
  const usersCount = users.docs.filter(d => d.data().email !== ADMIN_EMAIL).length;

  setText('m-total',       total);
  setText('m-disponibles', disponibles);
  setText('m-vendidos',    vendidos);
  setText('m-usuarios',    usersCount);
}
function setText(id, v) { const el = document.getElementById(id); if(el) el.textContent = v; }

// ════════════════════════════════════════════════
// TIENDA — CARGAR & FILTRAR (TIEMPO REAL)
// ════════════════════════════════════════════════
let productosListener = null; // guarda la "desuscripción" del listener activo

function cargarProductosTienda() {
  const grid = document.getElementById('productos-grid');
  grid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando productos...</p></div>`;

  // Si ya había un listener activo (ej. de una sesión anterior), lo cerramos
  // para no duplicar escuchas ni gastar lecturas de Firestore de más.
  if (productosListener) { productosListener(); productosListener = null; }

  // Devolvemos una promesa que se resuelve en la PRIMERA carga de datos,
  // así quien llame con await sabe que productosCache ya está poblado
  // (necesario, por ej., para restaurar la última pantalla vista al recargar).
  // Las actualizaciones siguientes del listener siguen llegando igual,
  // simplemente no afectan más a esta promesa ya resuelta.
  return new Promise((resolve) => {
    let primeraVez = true;
    productosListener = db.collection('productos').orderBy('fecha','desc')
      .onSnapshot(snap => {
        productosCache = ordenarProductos(snap.docs.map(d => ({ id:d.id, ...d.data() })));
        poblarFiltros();
        // Reaplicamos el filtro/búsqueda actual en vez de pisarlo, así si el
        // cliente estaba filtrando por categoría no se le resetea la vista.
        filtrarProductos();
        if (primeraVez) { primeraVez = false; resolve(); }
      }, err => {
        console.log('Error escuchando productos:', err);
        grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error al cargar productos.</p></div>`;
        if (primeraVez) { primeraVez = false; resolve(); }
      });
  });
}

// Productos con "orden" manual asignado van primero, de menor a mayor.
// Los que no tienen "orden" (undefined/null) van todos al final, en el
// orden en que ya venían (por fecha desc, gracias a la query de Firestore).
function ordenarProductos(lista) {
  const conOrden  = lista.filter(p => p.orden !== undefined && p.orden !== null && p.orden !== '');
  const sinOrden  = lista.filter(p => p.orden === undefined || p.orden === null || p.orden === '');
  conOrden.sort((a, b) => Number(a.orden) - Number(b.orden));
  return [...conOrden, ...sinOrden];
}

function poblarFiltros() {
  const cats = [...new Set(productosCache.map(p => p.categoria).filter(Boolean))];
  const sel  = document.getElementById('filtro-categoria');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function filtrarProductos() {
  const q     = (document.getElementById('search-input')?.value || '').toLowerCase();
  const cat   = document.getElementById('filtro-categoria')?.value || '';
  const est   = document.getElementById('filtro-estado')?.value   || '';
  const fil   = productosCache.filter(p => {
    const matchQ   = !q   || p.nombre.toLowerCase().includes(q) || (p.descripcion||'').toLowerCase().includes(q);
    const matchCat = !cat || p.categoria === cat;
    const matchEst = !est || 
      (est === 'vendido'    ? p.vendido : 
       est === 'remate'     ? (p.esRemate && !p.vendido) : 
       est === 'disponible' ? (!p.vendido && !p.esRemate) : 
       !p.vendido);
    return matchQ && matchCat && matchEst;
  });
  renderProductosTienda(fil);
}

function renderProductosTienda(productos) {
  const grid = document.getElementById('productos-grid');
  if (!productos.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📦</div><p>No se encontraron productos.</p></div>`;
    return;
  }
  grid.innerHTML = productos.map(p => {
    const precioMostrar = (p.esRemate && p.precioBase) ? p.precioBase : p.precio;
    const precio = formatPrecio(precioMostrar, p.moneda);
    const semaforoClass = p.vendido ? 'semaforo-rojo' : 'semaforo-verde';
    const badgeClass    = p.vendido ? 'badge-vendido' : 'badge-disponible';
    const badgeLabel    = p.vendido ? 'VENDIDO' : 'DISPONIBLE';
    const imgHtml = p.fotos && p.fotos[0]
      ? `<img class="card-img" src="${p.fotos[0]}" alt="${esc(p.nombre)}" onerror="this.style.display='none'">`
      : `<div class="card-img-ph">📦</div>`;
    // precioAnterior funciona como "precio de referencia / valor de mercado" tanto
    // para ofertas normales como para remates: siempre se compara contra precioMostrar.
    const precioAntHtml = p.precioAnterior ? `<span class="precio-tachado precio-tachado-rojo">${formatPrecio(p.precioAnterior, p.moneda)}</span>` : '';
    const descPctCard = p.precioAnterior ? Math.round((1 - precioMostrar/p.precioAnterior)*100) : 0;
    const descBadgeCard = descPctCard > 0 ? `<span class="card-desc-badge">-${descPctCard}%</span>` : '';
    const ofertaHtml = p.ofertaHasta && !p.vendido ? `<div class="oferta-countdown" data-hasta="${p.ofertaHasta}">⏳ ...</div>` : '';
    const isRemate = p.esRemate && !p.vendido;
    const clickFn  = isRemate ? `verRemate('${p.id}')` : `verDetalle('${p.id}')`;
    const remateBadge = isRemate ? '<span class="badge-remate">🔨 REMATE</span>' : '';
    const remateCountdown = isRemate ? `<div class="oferta-countdown remate-card-countdown" data-hasta="${p.remateFin}">⏳ ...</div>` : '';
    return `
      <div class="producto-card" onclick="${clickFn}">
        <div class="card-img-wrap">
          ${imgHtml}
          <span class="card-badge ${badgeClass}">${badgeLabel}</span>
          ${p.ofertaHasta && !p.vendido && !isRemate ? '<span class="badge-oferta">🔥 OFERTA</span>' : ''}
          ${remateBadge}
        </div>
        <div class="card-body">
          <div class="card-nombre">${esc(p.nombre)}</div>
          <div class="card-categoria">${p.categoria || '—'}</div>
          ${p.condicion ? `<div class="card-condicion">${p.condicion === 'Nuevo' ? '✨ Nuevo' : '♻️ Usado'}</div>` : ''}
          ${ofertaHtml}
          ${remateCountdown}
          <div class="card-footer">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">${precioAntHtml}${descBadgeCard}</div>
              ${isRemate ? `<div style="font-size:1.3rem;font-weight:700;color:var(--accent2);letter-spacing:1px;margin-bottom:2px;">🔨 💰 REMATE</div><div class="card-precio">Precio base: ${precio}</div>` : `<div class="card-precio">${precio}</div>`}
            </div>
            <span class="semaforo ${semaforoClass}"></span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
// DETALLE PRODUCTO
// ════════════════════════════════════════════════
function verDetalle(id) {
  const p = productosCache.find(x => x.id === id);
  if (!p) return;
  fotosActuales = p.fotos || [];

  const wa     = config.whatsapp || '5493548549097';
  const tmpl   = config.wamsg    || 'Hola! Vi tu producto {nombre} en Comprá Aquí y me interesa. ¿Está disponible?';
  const msg    = encodeURIComponent(tmpl.replace('{nombre}', p.nombre));
  const waLink = `https://wa.me/${wa}?text=${msg}`;
  const waBtn  = config.btnwa || 'CONSULTAR POR WHATSAPP';

  const nFotos = fotosActuales.length;
  let fotosHtml;
  if (!nFotos) {
    fotosHtml = `<div style="height:180px;background:var(--bg2);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;font-size:3rem;margin-bottom:24px">📦</div>`;
  } else if (nFotos === 1) {
    fotosHtml = `<div class="detalle-fotos-wrap detalle-fotos-1" style="margin-bottom:20px;">
      <img class="detalle-foto-main" src="${fotosActuales[0]}" alt="" onclick="abrirModal(0)" onerror="this.style.display='none'">
    </div>`;
  } else {
    const gridClass = nFotos === 2 ? 'detalle-fotos-2' : nFotos === 3 ? 'detalle-fotos-3' : 'detalle-fotos-grid';
    fotosHtml = `<div class="detalle-fotos-wrap ${gridClass}" style="margin-bottom:20px;"><div class="detalle-grid">${fotosActuales.map((f,i) =>
      `<img src="${f}" alt="" onclick="abrirModal(${i})" onerror="this.style.display='none'">`
    ).join('')}</div></div>`;
  }

  const specs = [
    p.categoria ? { l:'Categoría',    v: p.categoria } : null,
    p.estado    ? { l:'Estado',       v: p.estado }    : null,
    p.medidas   ? { l:'Medidas',      v: p.medidas }   : null,
    p.peso      ? { l:'Peso',         v: p.peso+'kg' } : null,
    p.desarma   ? { l:'¿Se desarma?', v: p.desarma }   : null,
    p.color     ? { l:'Color/Material',v:p.color }     : null,
	p.condicion ? { l:'Condición',     v:p.condicion } : null,
    p.cantidad  ? { l:'Cantidad',      v:p.cantidad }  : null,
  ].filter(Boolean);

  document.getElementById('detalle-contenido').innerHTML = `
    ${fotosHtml}
    <div class="detalle-nombre">${esc(p.nombre)}</div>
    ${p.precioAnterior ? `<div style="display:flex;align-items:center;gap:10px;"><div class="detalle-precio-anterior">${formatPrecio(p.precioAnterior, p.moneda)}</div><span class="detalle-desc-badge">-${Math.round((1-p.precio/p.precioAnterior)*100)}%</span></div>` : ''}
    <div class="detalle-precio">${formatPrecio(p.precio, p.moneda)}</div>
    ${p.ofertaHasta && !p.vendido ? `<div class="detalle-countdown" data-hasta="${p.ofertaHasta}">⏳ Cargando oferta...</div>` : ''}
    ${p.vendido ? '<span class="pill pill-danger" style="font-size:0.85rem;padding:6px 14px;margin-bottom:20px;display:inline-flex">🔴 VENDIDO</span>' : ''}
    ${specs.length ? `<div class="detalle-specs">${specs.map(s=>`
      <div class="spec-card">
        <div class="spec-label">${s.l}</div>
        <div class="spec-value">${esc(s.v)}</div>
      </div>`).join('')}</div>` : ''}
    ${p.descripcion ? `<div class="detalle-desc">${esc(p.descripcion)}</div>` : ''}
    ${p.notas ? `<div class="detalle-desc" style="border-color:#334155"><strong>📝 Notas:</strong> ${esc(p.notas)}</div>` : ''}
    ${!p.vendido ? `<a href="${waLink}" target="_blank" class="btn-whatsapp">💬 ${esc(waBtn)}</a>` : ''}
  `;

  showScreen('screen-detalle', p.id);
}

// ════════════════════════════════════════════════
// MODAL FOTOS
// ════════════════════════════════════════════════
function abrirModal(i) {
  fotoIndex = i;
  document.getElementById('modal-img').src = fotosActuales[i];
  document.getElementById('modal-counter').textContent = `${i+1} / ${fotosActuales.length}`;
  document.getElementById('modal-fotos').classList.remove('hidden');
}
function cerrarModal() { document.getElementById('modal-fotos').classList.add('hidden'); }
function cambiarFoto(dir) {
  fotoIndex = (fotoIndex + dir + fotosActuales.length) % fotosActuales.length;
  document.getElementById('modal-img').src = fotosActuales[fotoIndex];
  document.getElementById('modal-counter').textContent = `${fotoIndex+1} / ${fotosActuales.length}`;
}

// ════════════════════════════════════════════════
// ADMIN — PRODUCTOS CRUD
// ════════════════════════════════════════════════
async function cargarProductosAdmin() {
  const lista = document.getElementById('admin-productos-list');
  if (!lista) return;
  lista.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>`;
  const snap = await db.collection('productos').orderBy('fecha','desc').get();
  productosCache = ordenarProductos(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  await cargarMetricas();
  if (!productosCache.length) {
    lista.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>No hay productos. Creá uno en la pestaña "+ Nuevo".</p></div>`;
    return;
  }
  lista.innerHTML = productosCache.map(p => {
    const remateFinalizado = p.esRemate && p.remateFin && new Date(p.remateFin) < new Date();
    const pillClass  = p.vendido ? 'pill-danger' : p.esRemate && !remateFinalizado ? 'pill-remate' : p.esRemate ? 'pill-info' : 'pill-success';
    const pillLabel  = p.vendido ? '🔴 Vendido'  : p.esRemate && !remateFinalizado ? '🔨 En remate' : p.esRemate ? '⌛ Remate finalizado' : '🟢 Disponible';
    const imgHtml    = p.fotos && p.fotos[0]
      ? `<img src="${p.fotos[0]}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='📦'">`
      : '📦';

    // Price display
    const precioStr  = formatPrecio(p.precio, p.moneda);
    const antStr     = p.precioAnterior ? `<span class="admin-precio-tachado">${formatPrecio(p.precioAnterior, p.moneda)}</span> ` : '';
    const descPct    = p.precioAnterior ? Math.round((1 - p.precio/p.precioAnterior)*100) : 0;
    const descBadge  = descPct > 0 ? `<span class="admin-badge-desc">-${descPct}%</span>` : '';

    // Oferta countdown
    let ofertaHtml = '';
    if (p.ofertaHasta && !p.vendido && !p.esRemate) {
      const hasta = new Date(p.ofertaHasta);
      const ok    = hasta > new Date();
      ofertaHtml  = ok
        ? `<div class="admin-oferta-tag" data-hasta="${p.ofertaHasta}">🔥 Oferta hasta: ${hasta.toLocaleDateString('es-AR')} ${hasta.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})} — <span class="admin-countdown" data-hasta="${p.ofertaHasta}">⏳...</span></div>`
        : `<div class="admin-oferta-tag admin-oferta-expirada">⌛ Oferta expirada</div>`;
    }
    if (p.esRemate && p.remateFin) {
      const hasta = new Date(p.remateFin);
      const ok    = hasta > new Date();
      ofertaHtml  = ok
        ? `<div class="admin-oferta-tag admin-remate-tag" data-hasta="${p.remateFin}">🔨 Remate cierra: ${hasta.toLocaleDateString('es-AR')} ${hasta.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})} — <span class="admin-countdown" data-hasta="${p.remateFin}">⏳...</span></div>`
        : `<div class="admin-oferta-tag admin-oferta-expirada">🔨 Remate finalizado</div>`;
    }

    return `
      <div class="admin-item" draggable="true" data-id="${p.id}" ondragstart="dragStartProducto(event)" ondragover="dragOverProducto(event)" ondrop="dragDropProducto(event)" ondragend="dragEndProducto(event)">
        <div class="admin-drag-handle" title="Arrastrá para reordenar" ontouchstart="touchStartProducto(event)" ontouchmove="touchMoveProducto(event)" ontouchend="touchEndProducto(event)">⠿</div>
        <div class="admin-item-img">${imgHtml}</div>
        <div class="admin-item-info">
          <div class="admin-item-nombre">${esc(p.nombre)}</div>
          <div class="admin-item-meta">${antStr}${precioStr} ${descBadge}${p.esRemate && p.precioBase ? ' · <span style="color:#a78bfa;font-weight:600;">🔨 Base: $' + Number(p.precioBase).toLocaleString('es-AR') + '</span>' : ''} · ${p.categoria||'Sin categoría'}${p.condicion ? ' · ' + (p.condicion === 'Nuevo' ? '✨ Nuevo' : '♻️ Usado') : ''}</div>
          ${ofertaHtml}
          <span class="pill ${pillClass}" style="margin-top:6px">${pillLabel}</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn-sm btn-sm-primary" onclick="abrirEditar('${p.id}')">✏️ Editar</button>
          <button class="btn-sm btn-sm-warning" onclick="toggleVendido('${p.id}',${p.vendido})">${p.vendido?'↩ Disponible':'✅ Vendido'}</button>
          <button class="btn-sm btn-sm-danger" onclick="eliminarProducto('${p.id}')">🗑️ Eliminar</button>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════
// ADMIN — REORDENAR PRODUCTOS (DRAG & DROP: mouse + touch)
// ════════════════════════════════════════════════
let dragProductoId = null;

// Mueve la fila arrastrada a la posición de "fila", antes o después según
// en qué mitad de su altura está el puntero/dedo. Comparte lógica mouse/touch.
function moverFilaArrastrada(fila, clientY) {
  if (!fila || fila.dataset.id === dragProductoId) return;
  const lista = document.getElementById('admin-productos-list');
  const arrastrada = lista.querySelector(`.admin-item[data-id="${dragProductoId}"]`);
  if (!arrastrada) return;
  const rect = fila.getBoundingClientRect();
  const despuesDeFila = (clientY - rect.top) > rect.height / 2;
  if (despuesDeFila) {
    fila.after(arrastrada);
  } else {
    fila.before(arrastrada);
  }
}

// Guarda el orden final (1, 2, 3...) según la posición visual actual de
// todas las filas en la lista, apenas se suelta el arrastre.
async function guardarOrdenActual() {
  const lista = document.getElementById('admin-productos-list');
  const filas = [...lista.querySelectorAll('.admin-item')];
  const batch = db.batch();
  filas.forEach((fila, i) => {
    batch.update(db.collection('productos').doc(fila.dataset.id), { orden: i + 1 });
  });
  await batch.commit();
  dragProductoId = null;
  cargarProductosAdmin();
}

// ── Mouse (drag & drop nativo) ──
function dragStartProducto(ev) {
  dragProductoId = ev.currentTarget.dataset.id;
  ev.currentTarget.classList.add('admin-item-dragging');
  ev.dataTransfer.effectAllowed = 'move';
}
function dragOverProducto(ev) {
  ev.preventDefault();
  moverFilaArrastrada(ev.currentTarget, ev.clientY);
}
function dragEndProducto(ev) {
  ev.currentTarget.classList.remove('admin-item-dragging');
}
async function dragDropProducto(ev) {
  ev.preventDefault();
  await guardarOrdenActual();
}

// ── Touch (celular) ──
// El handle (⠿) es el único punto que dispara el arrastre, así no se
// interfiere con el scroll normal de la pantalla al tocar el resto de la fila.
function touchStartProducto(ev) {
  const fila = ev.currentTarget.closest('.admin-item');
  if (!fila) return;
  dragProductoId = fila.dataset.id;
  fila.classList.add('admin-item-dragging');
}
function touchMoveProducto(ev) {
  if (!dragProductoId) return;
  ev.preventDefault(); // evita que la página haga scroll mientras se arrastra
  const touch = ev.touches[0];
  const elBajoDedo = document.elementFromPoint(touch.clientX, touch.clientY);
  const fila = elBajoDedo ? elBajoDedo.closest('.admin-item') : null;
  if (fila) moverFilaArrastrada(fila, touch.clientY);
}
async function touchEndProducto(ev) {
  const fila = document.querySelector(`.admin-item[data-id="${dragProductoId}"]`);
  if (fila) fila.classList.remove('admin-item-dragging');
  if (!dragProductoId) return;
  await guardarOrdenActual();
}

async function toggleVendido(id, actual) {
  await db.collection('productos').doc(id).update({ vendido: !actual });
  cargarProductosAdmin();
}

async function eliminarProducto(id) {
  if (!confirm('¿Seguro que querés eliminar este producto? Esta acción no se puede deshacer.')) return;
  await db.collection('productos').doc(id).delete();
  cargarProductosAdmin();
}

function agregarFotoInput() {
  const c = document.getElementById('fotos-inputs');
  const i = document.createElement('input');
  i.type = 'text'; i.className = 'foto-input';
  i.placeholder = `Link foto ${c.children.length + 1}`;
  c.appendChild(i);
}

async function guardarProducto() {
  const nombre      = val('np-nombre');
  const descripcion = val('np-descripcion');
  const precio      = val('np-precio');
  const err = document.getElementById('np-error');
  const suc = document.getElementById('np-success');
  err.classList.add('hidden'); suc.classList.add('hidden');

  if (!nombre || !descripcion || !precio) {
    mostrarError(err, 'Nombre, descripción y precio son obligatorios.'); return;
  }

  const fotos = [...document.querySelectorAll('.foto-input')]
    .map(i => i.value.trim()).filter(Boolean);

  const precioAnterior = val('np-precio-anterior');
  const ofertaHasta   = val('np-oferta-hasta');
  const esRemate      = document.getElementById('np-es-remate')?.checked || false;
  const remateFin     = val('np-remate-fin') || null;
  const precioBase    = val('np-precio-base') || null;
  const cantidad  = val('np-cantidad') || null;
  const condicion = val('np-condicion') || 'Usado';
  const colorProd = val('np-color-prod') || val('np-color') || '';
  const materialProd = val('np-material') || '';
  const producto = {
    nombre, descripcion, precio: Number(precio),
    precioAnterior: precioAnterior ? Number(precioAnterior) : null,
    ofertaHasta:    ofertaHasta || null,
    esRemate, remateFin,
    precioBase: precioBase ? Number(precioBase) : Number(precio),
    cantidad: cantidad || null,
    condicion,
    colorProd, materialProd,
    moneda:    val('np-moneda') || 'ARS',
    categoria: val('np-categoria'),
    estado:    val('np-estado'),
    medidas:   val('np-medidas'),
    peso:      val('np-peso') || null,
    desarma:   val('np-desarma'),
    color:     val('np-color'),
    notas:     val('np-notas'),
    fotos, vendido: false,
    fecha: new Date().toISOString()
  };

  try {
    await db.collection('productos').add(producto);
    suc.textContent = '✅ Producto publicado correctamente.';
    suc.classList.remove('hidden');
    limpiarFormNuevo();
    cargarMetricas();
  } catch(e) {
    mostrarError(err, 'Error al guardar: ' + e.message);
  }
}

function limpiarFormNuevo() {
  ['np-nombre','np-descripcion','np-precio','np-precio-anterior','np-oferta-hasta','np-precio-base','np-remate-fin','np-categoria','np-medidas',
   'np-peso','np-estado','np-color','np-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dsel = document.getElementById('np-desarma');
  const msel = document.getElementById('np-moneda');
  if (dsel) dsel.value = '';
  if (msel) msel.value = 'ARS';
  document.getElementById('fotos-inputs').innerHTML =
    ['1','2','3'].map(n=>`<input type="text" class="foto-input" placeholder="Link foto ${n}"/>`).join('');
}

// ═══ EDITAR ═══
function abrirEditar(id) {
  const p = productosCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById('edit-id').value          = p.id;
  document.getElementById('edit-nombre').value      = p.nombre || '';
  document.getElementById('edit-descripcion').value = p.descripcion || '';
  document.getElementById('edit-precio').value      = p.precio || '';
  document.getElementById('edit-moneda').value      = p.moneda || 'ARS';
  document.getElementById('edit-categoria').value   = p.categoria || '';
  document.getElementById('edit-estado').value      = p.estado || '';
  document.getElementById('edit-medidas').value     = p.medidas || '';
  document.getElementById('edit-peso').value        = p.peso || '';
  document.getElementById('edit-desarma').value     = p.desarma || '';
  document.getElementById('edit-color').value       = p.color || '';
  document.getElementById('edit-notas').value       = p.notas || '';
  document.getElementById('edit-fotos').value       = (p.fotos || []).join('\n');
  document.getElementById('edit-precio-anterior').value = p.precioAnterior || '';
  const eoh = document.getElementById('edit-oferta-hasta');
  if (eoh) eoh.value = p.ofertaHasta ? p.ofertaHasta.slice(0,16) : '';
  const editCond = document.getElementById('edit-condicion');
  if (editCond) editCond.value = p.condicion || 'Usado';
  const editCant = document.getElementById('edit-cantidad');
  if (editCant) editCant.value = p.cantidad || '';
  const editColorProd = document.getElementById('edit-color-prod');
  if (editColorProd) editColorProd.value = p.colorProd || '';
  const editMaterial = document.getElementById('edit-material');
  if (editMaterial) editMaterial.value = p.materialProd || '';
  const editEsRemate = document.getElementById('edit-es-remate');
  if (editEsRemate) {
    editEsRemate.checked = p.esRemate || false;
    toggleEditRemateFields(p.esRemate || false);
  }
  const editPrecioBase = document.getElementById('edit-precio-base');
  if (editPrecioBase) editPrecioBase.value = p.precioBase || '';
  const editRemateFin = document.getElementById('edit-remate-fin');
  if (editRemateFin) editRemateFin.value = p.remateFin ? p.remateFin.slice(0,16) : '';
  document.getElementById('edit-error').classList.add('hidden');
  document.getElementById('modal-editar').classList.remove('hidden');
}
function cerrarModalEditar() { document.getElementById('modal-editar').classList.add('hidden'); }

async function guardarEdicion() {
  const id          = val('edit-id');
  const nombre      = val('edit-nombre');
  const descripcion = val('edit-descripcion');
  const precio      = val('edit-precio');
  const err = document.getElementById('edit-error');
  err.classList.add('hidden');
  if (!nombre || !descripcion || !precio) { mostrarError(err,'Nombre, descripción y precio son obligatorios.'); return; }

  const fotos = val('edit-fotos').split('\n').map(l=>l.trim()).filter(Boolean);
  const editPrecioAnt  = val('edit-precio-anterior');
  const editOferta     = val('edit-oferta-hasta');
  const editCondicion  = val('edit-condicion') || 'Usado';
  const editCantidad   = val('edit-cantidad') || null;
  const editColorProd  = val('edit-color-prod') || '';
  const editMaterial   = val('edit-material') || '';
  const editEsRemate   = document.getElementById('edit-es-remate')?.checked || false;
  const editRemateFin  = val('edit-remate-fin') || null;
  const editPrecioBase = val('edit-precio-base') || null;
  const datos = {
    nombre, descripcion, precio: Number(precio),
    precioAnterior: editPrecioAnt ? Number(editPrecioAnt) : null,
    ofertaHasta:    editOferta || null,
    esRemate: editEsRemate,
    remateFin: editRemateFin,
    precioBase: editPrecioBase ? Number(editPrecioBase) : Number(precio),
    condicion: editCondicion,
    cantidad: editCantidad,
    colorProd: editColorProd,
    materialProd: editMaterial,
    moneda:    val('edit-moneda') || 'ARS',
    categoria: val('edit-categoria'),
    estado:    val('edit-estado'),
    medidas:   val('edit-medidas'),
    peso:      val('edit-peso') || null,
    desarma:   val('edit-desarma'),
    color:     val('edit-color'),
    notas:     val('edit-notas'),
    fotos, editado: new Date().toISOString()
  };
  try {
    await db.collection('productos').doc(id).update(datos);
    cerrarModalEditar();
    cargarProductosAdmin();
  } catch(e) { mostrarError(err, 'Error: ' + e.message); }
}

// ════════════════════════════════════════════════
// ADMIN — USUARIOS
// ════════════════════════════════════════════════
async function cargarUsuariosAdmin() {
  const lista = document.getElementById('admin-usuarios-list');
  if (!lista) return;
  lista.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando usuarios...</p></div>`;
  const snap  = await db.collection('usuarios').get();
  const users = snap.docs.map(d => d.data()).filter(u => u.email !== ADMIN_EMAIL);
  if (!users.length) {
    lista.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No hay usuarios registrados aún.</p></div>`;
    return;
  }
  lista.innerHTML = users.map(u => {
    const bloq = u.bloqueado;
    const pClass = bloq ? 'pill-danger' : 'pill-success';
    const pLabel = bloq ? '🔴 Bloqueado' : '🟢 Activo';
    const fecha  = u.fechaRegistro ? new Date(u.fechaRegistro).toLocaleDateString('es-AR') : '—';
    return `
      <div class="admin-item">
        <div class="user-avatar">👤</div>
        <div class="admin-item-info">
          <div class="admin-item-nombre">${esc(u.nombre||'Sin nombre')}</div>
          <div class="admin-item-meta">${esc(u.email)} · Registrado: ${fecha}</div>
          <span class="pill ${pClass}" style="margin-top:6px">${pLabel}</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn-sm ${bloq?'btn-sm-success':'btn-sm-danger'}" onclick="toggleBloqueo('${u.uid}',${bloq})">
            ${bloq?'🔓 Desbloquear':'🔒 Bloquear'}
          </button>
        </div>
      </div>`;
  }).join('');
}

async function toggleBloqueo(uid, bloqueado) {
  await db.collection('usuarios').doc(uid).update({ bloqueado: !bloqueado });
  cargarUsuariosAdmin();
  cargarMetricas();
}

// ════════════════════════════════════════════════
// ADMIN — CONFIGURACIÓN
// ════════════════════════════════════════════════
async function cargarConfigForm() {
  const doc = await db.collection('config').doc('tienda').get();
  const c   = doc.exists ? doc.data() : {};
  setVal('cfg-nombre',    c.nombre    || 'Comprá Aquí');
  setVal('cfg-icono',     c.icono     || '');
  setVal('cfg-whatsapp',  c.whatsapp  || '5493548549097');
  setVal('cfg-titulo',    c.titulo    || 'Productos disponibles');
  setVal('cfg-subtitulo', c.subtitulo || 'Encontrá lo que buscás y contactanos por WhatsApp');
  setVal('cfg-color',     c.color     || 'indigo');
  setVal('cfg-btnwa',     c.btnwa     || 'CONSULTAR POR WHATSAPP');
  setVal('cfg-wamsg',     c.wamsg     || 'Hola! Vi tu producto {nombre} en Comprá Aquí y me interesa. ¿Está disponible?');
  setVal('cfg-logo',      c.logo      || '');
}

async function guardarConfig() {
  const err = document.getElementById('cfg-error');
  const suc = document.getElementById('cfg-success');
  err.classList.add('hidden'); suc.classList.add('hidden');

  const wa = val('cfg-whatsapp').replace(/\D/g,'');
  if (!wa) { mostrarError(err,'El número de WhatsApp es obligatorio.'); return; }

  const datos = {
    nombre:    val('cfg-nombre')    || 'Comprá Aquí',
    icono:     val('cfg-icono')     || '🏪',
    logo:      val('cfg-logo')      || '',
    whatsapp:  wa,
    titulo:    val('cfg-titulo')    || 'Productos disponibles',
    subtitulo: val('cfg-subtitulo') || '',
    color:     val('cfg-color')     || 'indigo',
    btnwa:     val('cfg-btnwa')     || 'CONSULTAR POR WHATSAPP',
    wamsg:     val('cfg-wamsg')     || 'Hola! Vi tu producto {nombre} y me interesa.',
    actualizado: new Date().toISOString()
  };

  try {
    await db.collection('config').doc('tienda').set(datos);
    config = datos;
    aplicarColor(datos.color);
    aplicarLogo(datos);
    suc.textContent = '✅ Configuración guardada correctamente.';
    suc.classList.remove('hidden');
  } catch(e) { mostrarError(err, 'Error: ' + e.message); }
}

function aplicarLogo(cfg) {
  const logo  = cfg.logo  || '';
  const emoji = cfg.icono || '🏪';

  // 1. Favicon (pestaña del navegador)
  const favicon = document.getElementById('favicon-link');
  if (favicon) {
    if (logo) {
      favicon.type = 'image/png';
      favicon.href = logo;
    } else {
      favicon.type = 'image/svg+xml';
      favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>`;
    }
  }

  // 2. brand-icon en pantalla: login, registro, topbar — tamaño FIJO
  document.querySelectorAll('.brand-icon, .brand-icon-sm').forEach(el => {
    if (logo) {
      const esSm = el.classList.contains('brand-icon-sm');
      const px = esSm ? '30' : '52';
      const br = esSm ? '6' : '10';
      el.innerHTML = `<img src="${logo}" alt="logo" width="${px}" height="${px}"
        style="width:${px}px;height:${px}px;max-width:${px}px;max-height:${px}px;
        object-fit:contain;border-radius:${br}px;display:block;">`;
    } else {
      el.textContent = emoji;
    }
  });

  // 3. OG tags (WhatsApp/redes)
  const ogImg = document.getElementById('og-image');
  if (ogImg && logo) ogImg.content = logo;
  const ogTitle = document.getElementById('og-title');
  if (ogTitle) ogTitle.content = cfg.nombre || 'Comprá Aquí';
}

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v;
}
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatPrecio(precio, moneda) {
  if (!precio) return '—';
  const n = Number(precio).toLocaleString('es-AR');
  return moneda === 'USD' ? `USD ${n}` : `$ ${n}`;
}

// ════════════════════════════════════════════════
// COUNTDOWN OFERTAS
// ════════════════════════════════════════════════
function iniciarCountdowns() {
  function actualizar() {
    document.querySelectorAll('.oferta-countdown[data-hasta], .detalle-countdown[data-hasta], .remate-card-countdown[data-hasta]').forEach(el => {
      const esRemate = el.classList.contains('remate-card-countdown');
      const esTarjeta = el.classList.contains('oferta-countdown'); // tarjeta del listado = más chica
      const palabra  = esRemate ? 'Remate' : 'Oferta';
      const hasta = new Date(el.dataset.hasta);
      const diff  = hasta - new Date();

      if (diff <= 0) {
        el.innerHTML = `<span class="countdown-expirado">⌛ ${palabra} expirada</span>`;
        return;
      }

      const dias = Math.floor(diff / 86400000);
      const hs   = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const segs = Math.floor((diff % 60000) / 1000);
      const pad  = n => String(n).padStart(2,'0');

      const boxClass = esTarjeta ? 'countdown-box countdown-box-sm' : 'countdown-box';
      el.innerHTML = `
        <div style="font-size:0.68rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">⏳ ${palabra} termina en:</div>
        <div class="${boxClass}">
          <div class="countdown-unit"><span class="num">${pad(dias)}</span><span class="lbl">Días</span></div>
          <div class="countdown-unit"><span class="num">${pad(hs)}</span><span class="lbl">Hrs</span></div>
          <div class="countdown-unit"><span class="num">${pad(mins)}</span><span class="lbl">Min</span></div>
          <div class="countdown-unit"><span class="num">${pad(segs)}</span><span class="lbl">Seg</span></div>
        </div>`;
    });
  }
  actualizar();
  setInterval(actualizar, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  iniciarCountdowns();
  // Re-run after products load
  const observer = new MutationObserver(() => iniciarCountdowns());
  const grid = document.getElementById('productos-grid');
  if (grid) observer.observe(grid, { childList: true });
  const det = document.getElementById('detalle-contenido');
  if (det) observer.observe(det, { childList: true });
});

// ════════════════════════════════════════════════
// SISTEMA DE REMATES
// ════════════════════════════════════════════════

let remateListener = null;

async function verRemate(productoId) {
  const p = productosCache.find(x => x.id === productoId);
  if (!p || !p.esRemate) return;

  // Get user alias
  const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
  const userData = userDoc.data() || {};
  const aliasUsuario = userData.alias || userData.nombre || 'Anónimo';

  renderPantallaRemate(p, aliasUsuario);
  showScreen('screen-remate', p.id);
  iniciarEscuchaOfertas(productoId);
}

function renderPantallaRemate(p, aliasUsuario) {
  const hasta = new Date(p.remateFin);
  const ahora = new Date();
  const terminado = hasta <= ahora;
  const wa = config.whatsapp || '5493548549097';
  const precioBaseActual = p.precioBase || p.precio;

  document.getElementById('remate-titulo').textContent = p.nombre;
  const remateCondEl = document.getElementById('remate-condicion');
  if (remateCondEl) {
    if (p.condicion) {
      remateCondEl.textContent = p.condicion === 'Nuevo' ? '✨ Nuevo' : '♻️ Usado';
      remateCondEl.style.display = 'block';
    } else {
      remateCondEl.style.display = 'none';
    }
  }
  document.getElementById('remate-img').src = (p.fotos && p.fotos[0]) || '';
  document.getElementById('remate-img').style.display = (p.fotos && p.fotos[0]) ? 'block' : 'none';
  document.getElementById('remate-base').textContent = formatPrecio(precioBaseActual, p.moneda);
  document.getElementById('remate-countdown').dataset.hasta = p.remateFin;
  document.getElementById('remate-producto-id').value = p.id;
  document.getElementById('remate-producto-nombre').value = p.nombre;
  document.getElementById('remate-moneda').value = p.moneda || 'ARS';
  document.getElementById('remate-wa').href = '#';
  document.getElementById('remate-alias-display').textContent = aliasUsuario;

  // Precio de mercado tachado, para generar urgencia comparando contra el precio base del remate.
  // Usa p.precioAnterior como "valor de mercado / referencia" (mismo campo que en ofertas normales).
  const valorMercadoEl = document.getElementById('remate-valor-mercado');
  if (valorMercadoEl) {
    if (p.precioAnterior && p.precioAnterior > precioBaseActual) {
      const ahorroPct = Math.round((1 - precioBaseActual / p.precioAnterior) * 100);
      valorMercadoEl.innerHTML = `<span style="display:flex;align-items:center;gap:6px;"><span class="precio-tachado precio-tachado-rojo" style="display:inline;">${formatPrecio(p.precioAnterior, p.moneda)}</span> <span class="card-desc-badge">-${ahorroPct}%</span></span>`;
      valorMercadoEl.style.display = 'block';
    } else {
      valorMercadoEl.style.display = 'none';
    }
  }

  const inputSection = document.getElementById('remate-input-section');
  const ganadorSection = document.getElementById('remate-ganador-section');

  if (terminado) {
    inputSection.style.display = 'none';
    ganadorSection.style.display = 'block';
  } else {
    inputSection.style.display = 'block';
    ganadorSection.style.display = 'none';
  }
}

function iniciarEscuchaOfertas(productoId) {
  if (remateListener) remateListener();
  remateListener = db.collection('remates').doc(productoId)
    .collection('ofertas')
    .orderBy('monto', 'desc')
    .onSnapshot(snap => {
      const ofertas = snap.docs.map(d => d.data());
      renderOfertas(ofertas, productoId);
    });
}

function renderOfertas(ofertas, productoId) {
  const lista = document.getElementById('remate-ofertas-list');
  const p = productosCache.find(x => x.id === productoId);
  const moneda = p ? p.moneda : 'ARS';
  const wa = config.whatsapp || '5493548549097';

  if (!ofertas.length) {
    lista.innerHTML = '<div class="remate-empty">🔔 Sé el primero en ofertar</div>';
    return;
  }

  // Check if remate ended
  const hasta = p ? new Date(p.remateFin) : null;
  const terminado = hasta && new Date() >= hasta;

  lista.innerHTML = ofertas.map((o, i) => {
    const esGanador = i === 0 && terminado;
    const esMio     = o.uid === currentUser.uid;
    const clases    = i === 0 ? 'oferta-item oferta-1er' : i === 1 ? 'oferta-item oferta-2do' : i === 2 ? 'oferta-item oferta-3er' : 'oferta-item';
    const emoji     = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
    const ganBadge  = esGanador ? '<span class="badge-ganador">🏆 GANADOR</span>' : '';
    const miBadge   = esMio ? '<span class="badge-mio">← Tu oferta</span>' : '';

    // WhatsApp link for winner
    let waBtn = '';
    if (esGanador && esMio) {
      const msg = encodeURIComponent(`🏆 ¡Gané el remate de "${p.nombre}"! Mi oferta fue ${formatPrecio(o.monto, moneda)}. ¿Cómo coordinamos la entrega?`);
      waBtn = `<a href="https://wa.me/${wa}?text=${msg}" target="_blank" class="btn-remate-wa">💬 ¡Contactar al vendedor!</a>`;
    }

    return `
      <div class="${clases}">
        <div class="oferta-rank">${emoji}</div>
        <div class="oferta-info">
          <div class="oferta-alias">${esc(o.alias)} ${miBadge} ${ganBadge}</div>
          <div class="oferta-tiempo">${new Date(o.fecha).toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'})}</div>
        </div>
        <div class="oferta-monto">${formatPrecio(o.monto, moneda)}</div>
        ${waBtn}
      </div>`;
  }).join('');

  // If ended and I'm winner, show contact button for admin too
  if (terminado && ofertas.length && currentUser.email === ADMIN_EMAIL) {
    const ganador = ofertas[0];
    const msg = encodeURIComponent(`🏆 Hola ${ganador.alias}, ganaste el remate de "${p.nombre}" con ${formatPrecio(ganador.monto, moneda)}. ¿Coordinamos la entrega?`);
    document.getElementById('remate-wa').href = `https://wa.me/${wa}?text=${msg}`;
    document.getElementById('remate-ganador-nombre').textContent = ganador.alias;
    document.getElementById('remate-ganador-monto').textContent = formatPrecio(ganador.monto, moneda);
    document.getElementById('remate-ganador-section').style.display = 'block';
  }
}

async function hacerOferta() {
  const productoId = document.getElementById('remate-producto-id').value;
  const nombre     = document.getElementById('remate-producto-nombre').value;
  const moneda     = document.getElementById('remate-moneda').value;
  const montoStr   = document.getElementById('remate-monto-input').value.trim();
  const errEl      = document.getElementById('remate-error');
  errEl.classList.add('hidden');

  if (!montoStr || isNaN(montoStr) || Number(montoStr) <= 0) {
    errEl.textContent = 'Ingresá un monto válido.';
    errEl.classList.remove('hidden');
    return;
  }

  const monto = Number(montoStr);

  // Check if higher than current best
  const snap = await db.collection('remates').doc(productoId)
    .collection('ofertas').orderBy('monto','desc').limit(1).get();

  if (!snap.empty) {
    const mejorOferta = snap.docs[0].data().monto;
    if (monto <= mejorOferta) {
      errEl.textContent = `Tu oferta debe ser mayor a ${formatPrecio(mejorOferta, moneda)}.`;
      errEl.classList.remove('hidden');
      return;
    }
  }

  // Check against base price
  const p = productosCache.find(x => x.id === productoId);
  const base = p ? (p.precioBase || p.precio) : 0;
  if (monto < base) {
    errEl.textContent = `Tu oferta debe ser al menos ${formatPrecio(base, moneda)}.`;
    errEl.classList.remove('hidden');
    return;
  }

  // Get alias
  const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
  const alias = userDoc.data()?.alias || userDoc.data()?.nombre || 'Anónimo';

  try {
    // Use uid as doc id so each user has only one offer (always updates to highest)
    await db.collection('remates').doc(productoId)
      .collection('ofertas').doc(currentUser.uid).set({
        uid: currentUser.uid,
        alias,
        monto,
        fecha: new Date().toISOString()
      });
    document.getElementById('remate-monto-input').value = '';
    errEl.classList.add('hidden');
  } catch(e) {
    errEl.textContent = 'Error al ofertar: ' + e.message;
    errEl.classList.remove('hidden');
  }
}

function cerrarRemate() {
  if (remateListener) { remateListener(); remateListener = null; }
  if (currentUser && currentUser.email === ADMIN_EMAIL) {
    showScreen('screen-admin');
  } else {
    showScreen('screen-tienda');
  }
}

function toggleEditRemateFields(checked) {
  const el = document.getElementById('edit-remate-fields');
  if (el) el.style.display = checked ? 'block' : 'none';
}

function toggleRemateFields(checked) {
  document.getElementById('remate-fields').style.display = checked ? 'block' : 'none';
}

// ════════════════════════════════════════════════
// ADMIN — REMATES
// ════════════════════════════════════════════════
async function cargarRematesAdmin() {
  const lista = document.getElementById('admin-remates-list');
  if (!lista) return;
  lista.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando remates...</p></div>`;

  const snap = await db.collection('productos').where('esRemate','==',true).get();
  const remates = snap.docs.map(d => ({ id:d.id, ...d.data() }));

  if (!remates.length) {
    lista.innerHTML = `<div class="empty-state"><div class="empty-icon">🔨</div><p>No hay remates activos. Creá un producto con modo remate activado.</p></div>`;
    return;
  }

  // For each remate, get top offers
  const rematesHtml = await Promise.all(remates.map(async p => {
    const ofSnap = await db.collection('remates').doc(p.id)
      .collection('ofertas').orderBy('monto','desc').limit(5).get();
    const ofertas = ofSnap.docs.map(d => d.data());
    const hasta   = new Date(p.remateFin);
    const activo  = hasta > new Date();
    const statusClass = activo ? 'admin-remate-tag' : 'admin-oferta-expirada';
    const statusLabel = activo ? `⏳ Activo — cierra <span class="admin-countdown" data-hasta="${p.remateFin}"></span>` : '⌛ Finalizado';

    const ofertasHtml = ofertas.length
      ? ofertas.map((o,i) => {
          const emoji = i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
          const wa    = config.whatsapp || '5493548549097';
          const msg   = encodeURIComponent(`🏆 Hola ${o.alias}, ganaste el remate de "${p.nombre}" con ${formatPrecio(o.monto,p.moneda)}. ¿Coordinamos?`);
          const waBtn = i===0 && !activo ? `<a href="https://wa.me/${wa}?text=${msg}" target="_blank" class="btn-remate-wa" style="margin-top:6px;font-size:0.78rem;padding:6px 10px;">💬 Contactar ganador</a>` : '';
          return `<div class="oferta-item ${i===0?'oferta-1er':''}">
            <div class="oferta-rank">${emoji}</div>
            <div class="oferta-info"><div class="oferta-alias">${esc(o.alias)}</div></div>
            <div class="oferta-monto">${formatPrecio(o.monto,p.moneda)}</div>
            ${waBtn}
            <button class="btn-sm btn-sm-danger" style="margin-left:8px;flex-shrink:0;" onclick="event.stopPropagation();borrarOfertaRemate('${p.id}','${o.uid}','${esc(o.alias)}')" title="Borrar esta oferta">🗑️</button>
          </div>`;
        }).join('')
      : '<div class="remate-empty">Sin ofertas aún</div>';

    return `
      <div class="admin-item" style="flex-direction:column;align-items:stretch;gap:12px;">
        <div style="display:flex;gap:14px;align-items:center;">
          <div class="admin-item-img">
            ${p.fotos&&p.fotos[0]?`<img src="${p.fotos[0]}" style="width:100%;height:100%;object-fit:cover">`:'📦'}
          </div>
          <div style="flex:1;">
            <div class="admin-item-nombre">${esc(p.nombre)}</div>
            <div class="admin-item-meta">Base: ${formatPrecio(p.precioBase||p.precio,p.moneda)}</div>
            <div class="admin-oferta-tag ${statusClass}" style="margin-top:6px;">${statusLabel}</div>
          </div>
        </div>
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div style="font-size:0.8rem;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Tablero de ofertas</div>
            ${ofertas.length ? `<button class="btn-sm btn-sm-danger" onclick="reiniciarTableroRemate('${p.id}','${esc(p.nombre)}')">🔄 Reiniciar tablero</button>` : ''}
          </div>
          ${ofertasHtml}
        </div>
      </div>`;
  }));

  lista.innerHTML = rematesHtml.join('');
  iniciarCountdownsAdmin();
}

async function borrarOfertaRemate(productoId, uid, alias) {
  if (!confirm(`¿Borrar la oferta de ${alias}? Esta acción no se puede deshacer.`)) return;
  try {
    await db.collection('remates').doc(productoId).collection('ofertas').doc(uid).delete();
    cargarRematesAdmin();
  } catch(e) {
    alert('Error al borrar la oferta: ' + e.message);
  }
}

async function reiniciarTableroRemate(productoId, nombreProducto) {
  if (!confirm(`¿Borrar TODAS las ofertas del remate "${nombreProducto}"? Esta acción no se puede deshacer y el remate quedará como si nadie hubiera ofertado.`)) return;
  try {
    const ofSnap = await db.collection('remates').doc(productoId).collection('ofertas').get();
    // Firestore no permite borrar una subcolección entera de una sola vez,
    // hay que borrar documento por documento en un batch.
    const batch = db.batch();
    ofSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    cargarRematesAdmin();
  } catch(e) {
    alert('Error al reiniciar el tablero: ' + e.message);
  }
}

function iniciarCountdownsAdmin() {
  function actualizar() {
    document.querySelectorAll('.admin-countdown[data-hasta]').forEach(el => {
      const hasta = new Date(el.dataset.hasta);
      const diff  = hasta - new Date();
      if (diff <= 0) { el.textContent = 'Finalizado'; return; }
      const d = Math.floor(diff/86400000);
      const h = Math.floor((diff%86400000)/3600000);
      const m = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      el.textContent = d>0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
    });
  }
  actualizar();
  setInterval(actualizar, 1000);
}
