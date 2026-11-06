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
  if (id === 'screen-mis-productos') {
    mostrarMisProductos();
  }

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
  if (id === 'tab-lotes')     cargarLotesAdmin();
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

  if (userDoc.exists && userDoc.data().pendiente === true) {
    showScreen('screen-pending'); return;
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

  // Mostrar nombre en header admin
  const headerNombre = document.getElementById('admin-nombre-header');
  if (headerNombre) {
    const adminDoc = await db.collection('usuarios').doc(user.uid).get();
    const adminNombre = adminDoc.exists ? adminDoc.data().nombre : 'Admin';
    headerNombre.textContent = adminNombre;
  }

  if (user.email === ADMIN_EMAIL) {
    await cargarMetricas();
    await cargarProductosAdmin();
    escucharPendientes();  // badge en tiempo real
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

// ── Alias para remates ──────────────────────────────────────────────────────
function generarAlias(nombre) {
  const base   = (nombre || '').trim().split(/\s+/)[0] || 'User';
  // Solo letras y números, primera letra mayúscula
  const limpio = base.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, '');
  const cap    = limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
  const num    = String(Math.floor(1000 + Math.random() * 9000)); // 4 dígitos
  return cap + num;
}

function regenerarAlias() {
  const nombre = document.getElementById('reg-name').value.trim();
  document.getElementById('reg-alias').value = generarAlias(nombre);
}

function normalizarAlias(input) {
  // Permitir solo letras, números y guión bajo; sin espacios
  input.value = input.value.replace(/[^a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]/g, '');
}

// Generar alias automáticamente cuando el usuario escribe su nombre
document.addEventListener('DOMContentLoaded', () => {
  const regName = document.getElementById('reg-name');
  if (regName) {
    regName.addEventListener('input', () => {
      const aliasEl = document.getElementById('reg-alias');
      // Solo auto-generar si el usuario todavía no tocó el campo alias
      if (aliasEl && !aliasEl.dataset.editadoManual) {
        aliasEl.value = generarAlias(regName.value);
      }
    });
  }
  const regAlias = document.getElementById('reg-alias');
  if (regAlias) {
    // Si el usuario escribe manualmente, marcamos que ya lo editó
    regAlias.addEventListener('input', () => { regAlias.dataset.editadoManual = '1'; });
    // Al hacer click en regenerar, quitamos esa marca para que vuelva a ser auto
    // (lo maneja regenerarAlias, que pisará el valor)
  }
});
// ────────────────────────────────────────────────────────────────────────────

async function registerUser() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-password').value;
  const err   = document.getElementById('register-error');
  const suc   = document.getElementById('register-success');
  err.classList.add('hidden'); suc.classList.add('hidden');

  if (!name || !email || !pass) { mostrarError(err, 'Completá todos los campos.'); return; }
  if (pass.length < 6) { mostrarError(err, 'La contraseña debe tener al menos 6 caracteres.'); return; }

  // Leer alias del campo visible; si quedó vacío, generar uno ahora
  const aliasInput = (document.getElementById('reg-alias')?.value || '').trim();
  const alias = aliasInput || generarAlias(name);
  const telefono = (document.getElementById('reg-telefono')?.value || '').trim().replace(/\D/g,'');

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('usuarios').doc(cred.user.uid).set({
      uid: cred.user.uid, email, nombre: name, alias,
      telefono: telefono || '',
      bloqueado: false, pendiente: true, fechaRegistro: new Date().toISOString()
    });
    suc.textContent = '✅ ¡Cuenta creada! El administrador la activará pronto para que puedas ingresar.';
    suc.classList.remove('hidden');
    // Cerrar sesión: no puede entrar hasta ser activado por el admin
    setTimeout(() => auth.signOut(), 2500);
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
  if (current === 'screen-detalle' || current === 'screen-remate' || current === 'screen-lotes') {
    destino = 'screen-tienda';
  } else if (current === 'screen-lote') {
    destino = 'screen-lotes';
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
    const remateFin2    = p.esRemate && p.remateFin && new Date(p.remateFin) < new Date();
    const esVendidoReal = p.vendido || remateFin2;
    const semaforoClass = esVendidoReal ? 'semaforo-rojo' : 'semaforo-verde';
    // Badge personalizado o defaults
    const badgeTexto    = p.badgeTexto || (esVendidoReal ? 'VENDIDO' : 'DISPONIBLE');
    const badgeFondo    = p.badgeFondo || (esVendidoReal ? '#ef4444' : '#6366f1');
    const badgeColor    = p.badgeColor || '#ffffff';
    const badgeHtml     = `<span class="badge-estado" style="background:${badgeFondo};color:${badgeColor}">${badgeTexto}</span>`;
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
          ${badgeHtml}
          ${p.ofertaHasta && !p.vendido && !isRemate ? '<span class="badge-oferta">🔥 OFERTA</span>' : ''}
          ${remateBadge}
        </div>
        <div class="card-body">
          <div class="card-nombre">${esc(p.nombre)}</div>
          <div class="card-categoria">${p.categoria || '—'}</div>
          ${p.condicion ? `<div class="card-condicion">${p.condicion === 'Nuevo' ? '✨ Nuevo' : '♻️ Usado'}</div>` : ''}
          ${ofertaHtml}
          ${remateCountdown}
          ${p.vendido ? '' : chipsUrgencia(p)}
          <div class="card-footer">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">${precioAntHtml}${descBadgeCard}</div>
              ${isRemate ? `<div style="font-size:1.3rem;font-weight:700;color:var(--accent2);letter-spacing:1px;margin-bottom:2px;">🔨 💰 REMATE</div><div class="card-precio">Precio base: ${precio}</div>` : `<div class="card-precio">${precio}</div>`}
              ${(!isRemate && p.precioContado && !p.vendido) ? `<div class="card-contado">💵 ${formatPrecio(p.precioContado, p.moneda)} contado</div>` : ''}
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
// ── Vista cliente completa desde admin ───────────────────────────────────────
function verComoCliente() {
  sessionStorage.setItem('modoVistaAdmin', '1');
  showScreen('screen-tienda');
  const banner = document.getElementById('banner-vista-admin');
  if (banner) banner.style.display = 'flex';
  // Forzar recarga de productos
  cargarProductosTienda();
}

function volverAlAdmin() {
  sessionStorage.removeItem('modoVistaAdmin');
  const banner = document.getElementById('banner-vista-admin');
  if (banner) banner.style.display = 'none';
  showScreen('screen-admin');
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Ver producto como cliente (desde admin) ───────────────────────────────────
function verProductoComoCliente(id) {
  const p = productosCache.find(x => x.id === id);
  if (!p) return;
  // Marcar que venimos del admin para que el botón Volver regrese al admin
  sessionStorage.setItem('verDesdeAdmin', '1');
  // Abrir en nueva pestaña también
  const url = window.location.href.split('?')[0] + '?preview=' + id;
  // Mostrar el detalle en la app actual (opción A)
  verDetalle(id);
  // Cambiar el botón Volver para que regrese al admin
  const btnVolver = document.querySelector('#screen-detalle .btn-back');
  if (btnVolver) {
    btnVolver.onclick = () => {
      sessionStorage.removeItem('verDesdeAdmin');
      showScreen('screen-admin');
      // Restaurar para clientes normales
      btnVolver.onclick = () => showScreen('screen-tienda');
    };
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function verDetalle(id) {
  const p = productosCache.find(x => x.id === id);
  if (!p) return;
  fotosActuales = p.fotos || [];

  const wa     = config.whatsapp || '5493548549097';
  const tmpl   = config.wamsg    || 'Hola! Vi tu producto {nombre} en Comprá Aquí y me interesa. ¿Está disponible?';
  const msg    = encodeURIComponent(tmpl.replace('{nombre}', p.nombre));
  const waLink = `https://wa.me/${wa}?text=${msg}`;
  const waBtn  = config.btnwa || 'CONSULTAR POR WHATSAPP';
  const waCuotasLink = `https://wa.me/${wa}?text=${encodeURIComponent('Hola! Me interesa "' + p.nombre + '" y quiero pagarlo en ' + (p.planCuotas||'') + ' cuotas. ¿Cómo lo coordinamos?')}`;

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
    ${p.vendido ? '' : chipsUrgencia(p, true)}
    ${p.ofertaHasta && !p.vendido ? `<div class="detalle-oferta-label">⏰ OFERTA POR TIEMPO LIMITADO</div><div class="detalle-countdown" data-hasta="${p.ofertaHasta}">⏳ Cargando oferta...</div>` : ''}
    ${p.vendido ? '' : tiersPrecios(p)}
    ${p.vendido ? '<span class="pill pill-danger" style="font-size:0.85rem;padding:6px 14px;margin-bottom:20px;display:inline-flex">🔴 VENDIDO</span>' : ''}
    ${specs.length ? `<div class="detalle-specs">${specs.map(s=>`
      <div class="spec-card">
        <div class="spec-label">${s.l}</div>
        <div class="spec-value">${esc(s.v)}</div>
      </div>`).join('')}</div>` : ''}
    ${p.descripcion ? `<div class="detalle-desc">${esc(p.descripcion)}</div>` : ''}
    ${p.notas ? `<div class="detalle-desc" style="border-color:#334155"><strong>📝 Notas:</strong> ${esc(p.notas)}</div>` : ''}
    ${!p.vendido ? bloquesEmocionales(p) : ''}
    ${!p.vendido ? `<a href="${waLink}" target="_blank" class="btn-whatsapp">💬 ${esc(waBtn)}</a>` : ''}
    ${(!p.vendido && p.planCuotas) ? `<a href="${waCuotasLink}" target="_blank" class="btn-whatsapp btn-whatsapp-cuotas">🐢 QUIERO PAGARLO EN ${p.planCuotas} CUOTAS</a>` : ''}
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
    // Badge personalizado para mostrar en admin también
    const admBadgeTxt = p.badgeTexto || (p.vendido ? 'VENDIDO' : null);
    const admBadgeHtml = admBadgeTxt ? `<span style="background:${p.badgeFondo||'#ef4444'};color:${p.badgeColor||'#fff'};padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;margin-left:6px;">${admBadgeTxt}</span>` : '';
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
          <button class="btn-sm btn-sm-info" onclick="verProductoComoCliente('${p.id}')">👁 Ver</button>
          <button class="btn-sm btn-sm-primary" onclick="abrirEditar('${p.id}')">✏️ Editar</button>
          <button class="btn-sm btn-sm-warning" onclick="toggleVendido('${p.id}',${p.vendido})">${p.vendido?'↩ Disponible':'✅ Vendido'}</button>
          <button class="btn-sm btn-sm-badge" onclick="abrirModalBadge('${p.id}')">🏷️ Etiqueta</button>
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

async function eliminarUsuario(uid, nombre) {
  if (!confirm(`¿Seguro que querés borrar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) return;
  await db.collection('usuarios').doc(uid).delete();
  cargarUsuariosAdmin();
  cargarMetricas();
}

// ── Badges / Etiquetas personalizadas ────────────────────────────────────────
function abrirModalBadge(productoId) {
  document.getElementById('badge-producto-id').value = productoId;
  // Cargar valores actuales del producto
  const p = productosCache.find(x => x.id === productoId);
  const texto = p?.badgeTexto || 'DISPONIBLE';
  const fondo = p?.badgeFondo || '#22c55e';
  const color = p?.badgeColor || '#ffffff';
  document.getElementById('badge-texto').value       = texto;
  document.getElementById('badge-color-fondo').value = fondo;
  document.getElementById('badge-color-texto').value = color;
  actualizarPreviewBadge();
  // Listeners para preview en tiempo real
  document.getElementById('badge-texto').oninput        = actualizarPreviewBadge;
  document.getElementById('badge-color-fondo').oninput  = actualizarPreviewBadge;
  document.getElementById('badge-color-texto').oninput  = actualizarPreviewBadge;
  document.getElementById('modal-badge').classList.remove('hidden');
}

function cerrarModalBadge() {
  document.getElementById('modal-badge').classList.add('hidden');
}

function seleccionarColorBadge(fondo, texto) {
  document.getElementById('badge-color-fondo').value = fondo;
  document.getElementById('badge-color-texto').value = texto;
  actualizarPreviewBadge();
}

function actualizarPreviewBadge() {
  const texto = document.getElementById('badge-texto').value || 'DISPONIBLE';
  const fondo = document.getElementById('badge-color-fondo').value;
  const color = document.getElementById('badge-color-texto').value;
  const prev  = document.getElementById('badge-preview');
  if (prev) {
    prev.textContent         = texto.toUpperCase();
    prev.style.background    = fondo;
    prev.style.color         = color;
  }
}

async function guardarBadge() {
  const id    = document.getElementById('badge-producto-id').value;
  const texto = document.getElementById('badge-texto').value.trim().toUpperCase();
  const fondo = document.getElementById('badge-color-fondo').value;
  const color = document.getElementById('badge-color-texto').value;
  if (!texto) return;
  const esVendido = texto === 'VENDIDO';
  await db.collection('productos').doc(id).update({
    badgeTexto: texto, badgeFondo: fondo, badgeColor: color,
    vendido: esVendido
  });
  cerrarModalBadge();
  cargarProductosAdmin();
  cargarProductosTienda();
}

async function quitarBadge() {
  const id = document.getElementById('badge-producto-id').value;
  await db.collection('productos').doc(id).update({
    badgeTexto: 'DISPONIBLE', badgeFondo: '#6366f1', badgeColor: '#ffffff',
    vendido: false
  });
  cerrarModalBadge();
  cargarProductosAdmin();
  cargarProductosTienda();
}
// ─────────────────────────────────────────────────────────────────────────────

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

// ── Uploader Cloudinary ─────────────────────────────────────────────────────
const CLOUD_NAME   = 'ddfukywf8';
const UPLOAD_PRESET = 'compra_aqui'; // preset unsigned en tu Cloudinary

// fotosSubidas: array de URLs resultantes, separado por prefijo (np = nuevo producto, edit = editar)
const fotosSubidas = { np: [], edit: [] };

async function subirFotos(files, prefijo) {
  if (!files || !files.length) return;
  const preview  = document.getElementById(`${prefijo}-fotos-preview`);
  const area     = document.getElementById(`${prefijo}-upload-area`);
  if (area) area.style.borderColor = 'var(--accent)';

  for (const file of Array.from(files)) {
    // Mostrar placeholder de carga
    const tmpId = 'tmp-' + Date.now() + Math.random().toString(36).slice(2);
    if (preview) {
      preview.insertAdjacentHTML('beforeend',
        `<div id="${tmpId}" class="foto-thumb foto-thumb-loading">⏳</div>`);
    }

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', UPLOAD_PRESET);
      fd.append('folder', 'compraaqui/productos');

      // Timeout de 30 segundos para no quedar colgado
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 30000);

      const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST', body: fd, signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.secure_url) {
        fotosSubidas[prefijo] = fotosSubidas[prefijo] || [];
        fotosSubidas[prefijo].push(data.secure_url);

        const tmpEl = document.getElementById(tmpId);
        if (tmpEl) {
          tmpEl.outerHTML = `
            <div class="foto-thumb" style="position:relative;">
              <img src="${data.secure_url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" loading="lazy"/>
              <button onclick="event.stopPropagation();eliminarFotoSubida('${data.secure_url}','${prefijo}')"
                style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:0.7rem;cursor:pointer;line-height:20px;padding:0;">✕</button>
            </div>`;
        }
      } else {
        const msg = data.error?.message || 'Error Cloudinary';
        console.error('Cloudinary error:', data);
        const tmpEl = document.getElementById(tmpId);
        if (tmpEl) tmpEl.outerHTML = `<div class="foto-thumb foto-thumb-error" style="font-size:0.6rem;padding:4px;color:#f87171;word-break:break-word;" title="${msg}">❌ ${msg}</div>`;
      }
    } catch(e) {
      console.error('Upload error:', e);
      const msg = e.name === 'AbortError' ? 'Tiempo agotado — reintentá' : e.message;
      const tmpEl = document.getElementById(tmpId);
      if (tmpEl) tmpEl.outerHTML = `<div class="foto-thumb foto-thumb-error" style="font-size:0.6rem;padding:4px;color:#f87171;word-break:break-word;" title="${msg}">❌ ${msg}</div>`;
    }
  }
  if (area) area.style.borderColor = '';
}

function eliminarFotoExistente(url) {
  // Quitar miniatura de fotos existentes en el modal editar
  const editExist = document.getElementById('edit-fotos-existentes');
  if (!editExist) return;
  const thumb = editExist.querySelector(`[data-url="${url}"]`);
  if (thumb) thumb.remove();
  // También quitar del textarea por consistencia
  const textarea = document.getElementById('edit-fotos');
  if (textarea) {
    textarea.value = textarea.value.split('\n').filter(l => l.trim() !== url).join('\n');
  }
}

function eliminarFotoSubida(url, prefijo) {
  fotosSubidas[prefijo] = (fotosSubidas[prefijo] || []).filter(u => u !== url);
  // Redibujar previews
  const preview = document.getElementById(`${prefijo}-fotos-preview`);
  if (!preview) return;
  preview.querySelectorAll('.foto-thumb img').forEach(img => {
    if (img.src === url) img.closest('.foto-thumb').remove();
  });
}
// ────────────────────────────────────────────────────────────────────────────

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

  // Leer fotos subidas a Cloudinary (uploader nuevo) o links manuales como fallback
  const fotos = (fotosSubidas['np'] || []).filter(Boolean);

  const precioAnterior = val('np-precio-anterior');
  const ofertaHasta   = val('np-oferta-hasta');
  const esRemate      = document.getElementById('np-es-remate')?.checked || false;
  const remateFin     = val('np-remate-fin') || null;
  const precioBase    = val('np-precio-base') || null;
  const cantidad  = val('np-cantidad') || null;
  const condicion = val('np-condicion') || 'Usado';
  const colorProd = val('np-color-prod') || val('np-color') || '';
  const materialProd = val('np-material') || '';
  const precioContado = val('np-precio-contado');
  const planCuotas    = val('np-plan-cuotas');
  const exclusivo     = val('np-exclusivo');
  const producto = {
    precioContado: precioContado ? Number(precioContado) : null,
    planCuotas:    planCuotas ? Number(planCuotas) : null,
    exclusivo:     exclusivo ? Number(exclusivo) : null,
    paraVos:       val('np-para-vos'),
    testimonio:    val('np-testimonio'),
    mostrarExclusivo: !!document.getElementById('np-mostrar-exclusivo')?.checked,
    mostrarParaVos:   !!document.getElementById('np-mostrar-paravos')?.checked,
    mostrarHistoria:  !!document.getElementById('np-mostrar-historia')?.checked,
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

    // Si venía de un pendiente, marcarlo como aprobado
    const pendienteId = document.getElementById('np-nombre').dataset.pendienteId;
    if (pendienteId) {
      await db.collection('productos_usuarios').doc(pendienteId).update({ estado: 'aprobado' });
      delete document.getElementById('np-nombre').dataset.pendienteId;
    }

    limpiarFormNuevo();
    cargarMetricas();
    // Ir al tab Productos para ver el producto recién publicado
    const btnProductos = document.querySelector('.tab-btn[onclick*="tab-productos"]');
    if (btnProductos) btnProductos.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch(e) {
    mostrarError(err, 'Error al guardar: ' + e.message);
  }
}

function limpiarFormNuevo() {
  ['np-nombre','np-descripcion','np-precio','np-precio-anterior','np-oferta-hasta','np-precio-base','np-remate-fin','np-categoria','np-medidas',
   'np-peso','np-estado','np-color','np-notas',
   'np-precio-contado','np-plan-cuotas','np-exclusivo','np-para-vos','np-testimonio'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dsel = document.getElementById('np-desarma');
  const msel = document.getElementById('np-moneda');
  if (dsel) dsel.value = '';
  if (msel) msel.value = 'ARS';
  ['np-mostrar-exclusivo','np-mostrar-paravos','np-mostrar-historia'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = false; });
  // Resetear uploader
  fotosSubidas['np'] = [];
  const npPreview = document.getElementById('np-fotos-preview');
  if (npPreview) npPreview.innerHTML = '';
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
  // Fotos: mostrar existentes como miniaturas y resetear uploader
  document.getElementById('edit-fotos').value = (p.fotos || []).join('\n');
  fotosSubidas['edit'] = [];
  const editPreview = document.getElementById('edit-fotos-preview');
  if (editPreview) editPreview.innerHTML = '';
  const editExist = document.getElementById('edit-fotos-existentes');
  if (editExist) {
    editExist.innerHTML = (p.fotos || []).map(url => `
      <div class="foto-thumb" style="position:relative;" data-url="${url}">
        <img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='none';this.closest('.foto-thumb').innerHTML+='<span style=\'font-size:0.6rem;color:#f87171;padding:2px;display:block;text-align:center;\'>URL inválida</span>'"/>
        <button onclick="event.stopPropagation();eliminarFotoExistente('${url}')"
          style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:0.7rem;cursor:pointer;line-height:20px;padding:0;">✕</button>
      </div>`).join('');
  }
  document.getElementById('edit-precio-anterior').value = p.precioAnterior || '';
  setVal('edit-precio-contado', p.precioContado || '');
  setVal('edit-plan-cuotas',    p.planCuotas || '');
  setVal('edit-exclusivo',      p.exclusivo || '');
  setVal('edit-para-vos',       p.paraVos || '');
  setVal('edit-testimonio',     p.testimonio || '');
  [['edit-mostrar-exclusivo','mostrarExclusivo'],['edit-mostrar-paravos','mostrarParaVos'],['edit-mostrar-historia','mostrarHistoria']].forEach(([id,k]) => { const c = document.getElementById(id); if (c) c.checked = p[k] === true; });
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

  // Combinar: fotos existentes que no se borraron + nuevas subidas + links del textarea
  const fotosExistentesEl = document.getElementById('edit-fotos-existentes');
  const fotosExistentes = fotosExistentesEl
    ? [...fotosExistentesEl.querySelectorAll('[data-url]')].map(el => el.dataset.url)
    : [];
  const fotosNuevas   = fotosSubidas['edit'] || [];
  const fotosManual   = val('edit-fotos').split('\n').map(l=>l.trim()).filter(Boolean);
  const fotos = [...new Set([...fotosExistentes, ...fotosNuevas, ...fotosManual])];
  const editPrecioAnt  = val('edit-precio-anterior');
  const editOferta     = val('edit-oferta-hasta');
  const editCondicion  = val('edit-condicion') || 'Usado';
  const editCantidad   = val('edit-cantidad') || null;
  const editColorProd  = val('edit-color-prod') || '';
  const editMaterial   = val('edit-material') || '';
  const editEsRemate   = document.getElementById('edit-es-remate')?.checked || false;
  const editRemateFin  = val('edit-remate-fin') || null;
  const editPrecioBase = val('edit-precio-base') || null;
  const editContado = val('edit-precio-contado');
  const editCuotas  = val('edit-plan-cuotas');
  const editExcl    = val('edit-exclusivo');
  const datos = {
    precioContado: editContado ? Number(editContado) : null,
    planCuotas:    editCuotas ? Number(editCuotas) : null,
    exclusivo:     editExcl ? Number(editExcl) : null,
    paraVos:       val('edit-para-vos'),
    testimonio:    val('edit-testimonio'),
    mostrarExclusivo: !!document.getElementById('edit-mostrar-exclusivo')?.checked,
    mostrarParaVos:   !!document.getElementById('edit-mostrar-paravos')?.checked,
    mostrarHistoria:  !!document.getElementById('edit-mostrar-historia')?.checked,
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
  // Ordenar: pendientes primero, luego activos, bloqueados al final
  users.sort((a, b) => {
    const orden = v => v.pendiente ? 0 : v.bloqueado ? 2 : 1;
    return orden(a) - orden(b);
  });

  lista.innerHTML = users.map(u => {
    const bloq     = u.bloqueado;
    const pendiente = u.pendiente && !bloq;
    const pClass   = bloq ? 'pill-danger' : pendiente ? 'pill-warning' : 'pill-success';
    const pLabel   = bloq ? '🔴 Bloqueado' : pendiente ? '⏳ Pendiente de activación' : '🟢 Activo';
    const fecha    = u.fechaRegistro ? new Date(u.fechaRegistro).toLocaleDateString('es-AR') : '—';
    const alias    = u.alias ? ` · Alias: <strong>${esc(u.alias)}</strong>` : '';
    return `
      <div class="admin-item" style="${pendiente ? 'border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.04);' : ''}">
        <div class="user-avatar">${pendiente ? '🔔' : bloq ? '🚫' : '👤'}</div>
        <div class="admin-item-info">
          <div class="admin-item-nombre">${esc(u.nombre||'Sin nombre')}</div>
          <div class="admin-item-meta">${esc(u.email)}${alias} · Registrado: ${fecha}</div>
          <span class="pill ${pClass}" style="margin-top:6px">${pLabel}</span>
        </div>
        <div class="admin-item-actions">
          ${pendiente ? `<button class="btn-sm btn-sm-success" onclick="activarUsuario('${u.uid}')">✅ Activar</button>` : ''}
          <button class="btn-sm btn-sm-primary" onclick="abrirEditarUsuario('${u.uid}')">✏️ Editar</button>
          <button class="btn-sm ${bloq?'btn-sm-success':'btn-sm-danger'}" onclick="toggleBloqueo('${u.uid}',${bloq})">
            ${bloq?'🔓 Desbloquear':'🔒 Bloquear'}
          </button>
          <button class="btn-sm btn-sm-danger" onclick="eliminarUsuario('${u.uid}','${esc(u.nombre||u.email)}')">🗑️ Borrar</button>
        </div>
      </div>`;
  }).join('');
}

// ── Editar usuario desde admin ───────────────────────────────────────────────
async function abrirEditarUsuario(uid) {
  const doc = await db.collection('usuarios').doc(uid).get();
  if (!doc.exists) return;
  const u = doc.data();
  document.getElementById('eu-uid').value      = uid;
  document.getElementById('eu-nombre').value   = u.nombre   || '';
  document.getElementById('eu-alias').value    = u.alias    || '';
  document.getElementById('eu-telefono').value = u.telefono || '';
  const sel = document.getElementById('eu-pendiente');
  if (u.bloqueado)      sel.value = 'bloqueado';
  else if (u.pendiente) sel.value = 'pendiente';
  else                  sel.value = 'activo';
  document.getElementById('eu-error').classList.add('hidden');
  document.getElementById('modal-usuario').classList.remove('hidden');
}

function cerrarModalUsuario() {
  document.getElementById('modal-usuario').classList.add('hidden');
}

async function guardarEdicionUsuario() {
  const uid      = document.getElementById('eu-uid').value;
  const nombre   = document.getElementById('eu-nombre').value.trim();
  const alias    = document.getElementById('eu-alias').value.trim();
  const telefono = document.getElementById('eu-telefono').value.trim().replace(/\D/g,'');
  const estado   = document.getElementById('eu-pendiente').value;
  const err      = document.getElementById('eu-error');
  err.classList.add('hidden');

  if (!nombre) { err.textContent = 'El nombre no puede estar vacío.'; err.classList.remove('hidden'); return; }
  if (!alias)  { err.textContent = 'El alias no puede estar vacío.'; err.classList.remove('hidden'); return; }

  try {
    await db.collection('usuarios').doc(uid).update({
      nombre,
      alias,
      telefono: telefono || '',
      bloqueado: estado === 'bloqueado',
      pendiente: estado === 'pendiente',
    });
    cerrarModalUsuario();
    cargarUsuariosAdmin();
  } catch(e) {
    err.textContent = 'Error: ' + e.message;
    err.classList.remove('hidden');
  }
}
// ─────────────────────────────────────────────────────────────────────────────

async function toggleBloqueo(uid, bloqueado) {
  await db.collection('usuarios').doc(uid).update({ bloqueado: !bloqueado });
  cargarUsuariosAdmin();
  cargarMetricas();
}

// El usuario en screen-pending puede verificar si ya fue activado sin recargar
async function verificarActivacion() {
  const user = auth.currentUser;
  if (!user) { showScreen('screen-login'); return; }
  const userDoc = await db.collection('usuarios').doc(user.uid).get();
  if (userDoc.exists && userDoc.data().pendiente === true) {
    // Sigue pendiente
    const card = document.querySelector('#screen-pending .auth-card p');
    if (card) {
      card.innerHTML = 'Todavía no fuiste activado.<br>Avisale al administrador e intentá de nuevo en unos minutos.';
    }
  } else {
    // Ya fue activado — recargar flujo
    window.location.reload();
  }
}

async function activarUsuario(uid) {
  await db.collection('usuarios').doc(uid).update({ pendiente: false });
  cargarUsuariosAdmin();
  cargarMetricas();
  // Mostrar aviso al admin
  const suc = document.getElementById('admin-usuarios-msg');
  if (suc) {
    suc.textContent = '✅ Usuario activado. Pedile que recargue la página o vuelva a ingresar.';
    suc.style.display = 'block';
    setTimeout(() => { suc.style.display = 'none'; }, 5000);
  }
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
  setVal('cfg-esperanza', c.esperanza || '');
  setVal('cfg-flex',      c.flex      || '');
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
    esperanza: val('cfg-esperanza'),
    flex:      val('cfg-flex'),
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

async function renderOfertas(ofertas, productoId) {
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

  // Sección ganador: solo visible para el admin o para el propio ganador
  const secAdmin   = document.getElementById('remate-ganador-section');
  const secGanador = document.getElementById('remate-soy-ganador-section');
  if (secAdmin)   secAdmin.style.display   = 'none';
  if (secGanador) secGanador.style.display = 'none';

  if (terminado && ofertas.length) {
    const ganador = ofertas[0];
    const esAdmin    = currentUser.email === ADMIN_EMAIL;
    const soyGanador = ganador.uid === currentUser.uid;

    // Marcar el producto como vendido automáticamente si el remate terminó
    if (esAdmin && !p.vendido) {
      db.collection('productos').doc(productoId).update({
        vendido: true,
        badgeTexto: 'VENDIDO', badgeFondo: '#ef4444', badgeColor: '#ffffff'
      }).catch(() => {});
    }

    if (esAdmin) {
      // Admin: ve quién ganó y puede contactarlo
      // Intentar usar el teléfono propio del ganador si lo registró
      const ganadorDoc = await db.collection('usuarios').doc(ganador.uid).get();
      const ganadorTel = ganadorDoc.exists ? (ganadorDoc.data().telefono || '') : '';
      const waGanador  = ganadorTel ? `54${ganadorTel}` : wa; // si tiene tel propio, lo usamos; sino el WA del admin
      const msgAdmin = encodeURIComponent(`🏆 Hola ${ganador.alias}, ganaste el remate de "${p.nombre}" con ${formatPrecio(ganador.monto, moneda)}. ¿Coordinamos la entrega?`);
      document.getElementById('remate-wa').href = `https://wa.me/${waGanador}?text=${msgAdmin}`;
      document.getElementById('remate-ganador-nombre').textContent = ganador.alias;
      document.getElementById('remate-ganador-monto').textContent = formatPrecio(ganador.monto, moneda);
      if (secAdmin) secAdmin.style.display = 'block';
    } else if (soyGanador) {
      // Ganador: ve felicitación y puede contactar al vendedor
      const msgGan = encodeURIComponent(`🏆 ¡Gané el remate de "${p.nombre}"! Mi oferta fue ${formatPrecio(ganador.monto, moneda)}. ¿Cómo coordinamos la entrega?`);
      document.getElementById('remate-wa-ganador').href = `https://wa.me/${wa}?text=${msgGan}`;
      document.getElementById('remate-soy-ganador-monto').textContent = `Tu oferta ganadora: ${formatPrecio(ganador.monto, moneda)}`;
      if (secGanador) secGanador.style.display = 'block';
    }
    // Resto de usuarios: no ven ninguna sección especial
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

  // Get alias — si no tiene alias guardado, generar uno desde el nombre
  const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
  const uData = userDoc.data() || {};
  const alias = uData.alias || generarAlias(uData.nombre || currentUser.email.split('@')[0]);

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


// ════════════════════════════════════════════════════════════════════════════
//  MÓDULO: PRODUCTOS DE USUARIOS (cargar para vender, aprobación admin)
// ════════════════════════════════════════════════════════════════════════════

// ── Pantalla "Mis productos" ──────────────────────────────────────────────

let misProductosListener = null;

function mostrarMisProductos() {
  if (misProductosListener) { misProductosListener(); misProductosListener = null; }
  const lista = document.getElementById('mis-productos-lista');
  if (!lista) return;
  lista.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>';

  misProductosListener = db.collection('productos_usuarios')
    .where('uid', '==', currentUser.uid)
    .onSnapshot(snap => {
      if (snap.empty) {
        lista.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📦</div>
            <p>Todavía no cargaste ningún producto.</p>
            <button class="btn-primary" onclick="abrirModalCargarProducto()" style="margin-top:16px;">➕ Cargar mi primer producto</button>
          </div>`;
        return;
      }
      lista.innerHTML = snap.docs.map(d => {
        const p   = { id: d.id, ...d.data() };
        const img = p.fotos?.[0]
          ? `<img src="${p.fotos[0]}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" onerror="this.style.display='none'">`
          : `<div style="width:64px;height:64px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">📦</div>`;

        let estadoHtml = '';
        if (p.estado === 'aprobado') {
          estadoHtml = '<span class="pill pill-success">✅ Aprobado — visible en la tienda</span>';
        } else if (p.estado === 'rechazado') {
          estadoHtml = `<span class="pill pill-danger">❌ Rechazado${p.motivoRechazo ? ': ' + esc(p.motivoRechazo) : ''}</span>`;
        } else {
          estadoHtml = '<span class="pill pill-warning">⏳ En revisión</span>';
        }

        const puedeEditar = p.estado !== 'rechazado';
        return `
          <div class="admin-item" style="margin-bottom:12px;${p.estado==='rechazado'?'border-color:rgba(239,68,68,0.3);':''}">
            ${img}
            <div class="admin-item-info" style="flex:1;min-width:0;">
              <div class="admin-item-nombre">${esc(p.nombre)}</div>
              <div class="admin-item-meta">$${(p.precio||0).toLocaleString('es-AR')} · ${p.condicion||'Sin especificar'}</div>
              <div style="margin-top:6px;">${estadoHtml}</div>
            </div>
            <div class="admin-item-actions" style="flex-direction:column;gap:6px;">
              ${puedeEditar ? `<button class="btn-sm btn-sm-primary" onclick="editarMiProducto('${p.id}')">✏️ Editar</button>` : ''}
              <button class="btn-sm btn-sm-danger" onclick="borrarMiProducto('${p.id}')">🗑️ Borrar</button>
            </div>
          </div>`;
      }).join('');
    }, err => {
      console.error('Error mis productos:', err);
      lista.innerHTML = '<div class="empty-state"><p>Error al cargar productos.</p></div>';
    });
}

// ── Modal cargar/editar producto usuario ─────────────────────────────────

function abrirModalCargarProducto(id) {
  fotosSubidas['mcp'] = [];
  document.getElementById('mcp-id').value        = id || '';
  document.getElementById('mcp-nombre').value    = '';
  document.getElementById('mcp-descripcion').value = '';
  document.getElementById('mcp-precio').value    = '';
  document.getElementById('mcp-condicion').value = '';
  document.getElementById('mcp-fotos-preview').innerHTML = '';
  document.getElementById('mcp-error').classList.add('hidden');
  document.getElementById('mcp-titulo').textContent = id ? '✏️ Editar mi producto' : '➕ Cargar producto para vender';
  document.getElementById('modal-cargar-producto').classList.remove('hidden');
}

function cerrarModalCargarProducto() {
  document.getElementById('modal-cargar-producto').classList.add('hidden');
  fotosSubidas['mcp'] = [];
}

async function editarMiProducto(id) {
  const doc = await db.collection('productos_usuarios').doc(id).get();
  if (!doc.exists) return;
  const p = doc.data();
  fotosSubidas['mcp'] = [];
  document.getElementById('mcp-id').value          = id;
  document.getElementById('mcp-nombre').value      = p.nombre || '';
  document.getElementById('mcp-descripcion').value = p.descripcion || '';
  document.getElementById('mcp-precio').value      = p.precio || '';
  document.getElementById('mcp-condicion').value   = p.condicion || '';
  document.getElementById('mcp-titulo').textContent = '✏️ Editar mi producto';
  document.getElementById('mcp-error').classList.add('hidden');
  // Mostrar fotos existentes
  const prev = document.getElementById('mcp-fotos-preview');
  prev.innerHTML = (p.fotos || []).map(url => `
    <div class="foto-thumb" style="position:relative;" data-url="${url}">
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>
      <button onclick="event.stopPropagation();this.closest('[data-url]').remove()"
        style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:0.7rem;cursor:pointer;line-height:20px;padding:0;">✕</button>
    </div>`).join('');
  document.getElementById('modal-cargar-producto').classList.remove('hidden');
}

async function guardarProductoUsuario() {
  const id          = document.getElementById('mcp-id').value;
  const nombre      = document.getElementById('mcp-nombre').value.trim();
  const descripcion = document.getElementById('mcp-descripcion').value.trim();
  const precio      = parseFloat(document.getElementById('mcp-precio').value) || 0;
  const condicion   = document.getElementById('mcp-condicion').value;
  const err         = document.getElementById('mcp-error');
  err.classList.add('hidden');

  if (!nombre) { err.textContent = 'El nombre es obligatorio.'; err.classList.remove('hidden'); return; }
  if (!precio)  { err.textContent = 'Ingresá un precio.'; err.classList.remove('hidden'); return; }

  // Combinar fotos existentes + nuevas subidas
  const fotosExist = [...document.querySelectorAll('#mcp-fotos-preview [data-url]')].map(el => el.dataset.url);
  const fotosNuevas = fotosSubidas['mcp'] || [];
  const fotos = [...new Set([...fotosExist, ...fotosNuevas])];

  const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
  const uData   = userDoc.data() || {};

  const datos = {
    nombre, descripcion, precio, condicion, fotos,
    uid:         currentUser.uid,
    emailVendedor: currentUser.email,
    nombreVendedor: uData.nombre || currentUser.email,
    telefonoVendedor: uData.telefono || '',
    estado:      'pendiente',
    fecha:       new Date().toISOString(),
  };

  try {
    if (id) {
      await db.collection('productos_usuarios').doc(id).update({ ...datos, fechaEdicion: new Date().toISOString() });
    } else {
      await db.collection('productos_usuarios').add(datos);
    }
    cerrarModalCargarProducto();
  } catch(e) {
    console.error('Error guardarProductoUsuario:', e);
    err.textContent = 'Error al enviar: ' + (e.message || e.code || 'Sin conexión. Intentá de nuevo.');
    err.classList.remove('hidden');
  }
}

async function borrarMiProducto(id) {
  if (!confirm('¿Seguro que querés borrar este producto?')) return;
  await db.collection('productos_usuarios').doc(id).delete();
}

// ── Panel admin: pendientes ───────────────────────────────────────────────

async function cargarPendientesAdmin() {
  const lista = document.getElementById('admin-pendientes-lista');
  if (!lista) return;
  lista.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Cargando...</p></div>';

  const snap = await db.collection('productos_usuarios')
    .where('estado', '==', 'pendiente')
    .get();

  // Actualizar badge en el tab
  const badge = document.getElementById('badge-pendientes');
  if (badge) {
    badge.textContent = snap.size;
    badge.style.display = snap.size > 0 ? 'inline-block' : 'none';
  }

  if (snap.empty) {
    lista.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No hay productos pendientes de aprobación.</p></div>';
    return;
  }

  lista.innerHTML = snap.docs.map(d => {
    const p = { id: d.id, ...d.data() };
    const fecha = p.fecha ? new Date(p.fecha).toLocaleString('es-AR') : '—';
    const imgs = (p.fotos || []).slice(0, 3).map(url =>
      `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" onerror="this.style.display='none'">`
    ).join('');

    return `
      <div class="admin-item" style="margin-bottom:16px;flex-direction:column;align-items:stretch;gap:12px;">
        <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div style="display:flex;gap:8px;flex-shrink:0;">${imgs || '<div style="width:80px;height:80px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2rem;">📦</div>'}</div>
          <div style="flex:1;min-width:200px;">
            <div class="admin-item-nombre">${esc(p.nombre)}</div>
            <div class="admin-item-meta">$${(p.precio||0).toLocaleString('es-AR')} · ${p.condicion||'Sin especificar'}</div>
            <div class="admin-item-meta" style="margin-top:4px;">👤 ${esc(p.nombreVendedor)} · ${esc(p.emailVendedor)}</div>
            ${p.telefonoVendedor ? `<div class="admin-item-meta">📱 ${esc(p.telefonoVendedor)}</div>` : ''}
            ${p.descripcion ? `<div style="margin-top:8px;font-size:0.85rem;color:var(--text2);background:var(--bg2);padding:8px;border-radius:8px;">${esc(p.descripcion)}</div>` : ''}
            <div class="admin-item-meta" style="margin-top:6px;">📅 ${fecha}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-sm btn-sm-primary" onclick="editarPendienteEnFormulario('${p.id}')">✏️ Editar antes de publicar</button>
          <button class="btn-sm btn-sm-success" onclick="aprobarProductoUsuario('${p.id}')">✅ Aprobar y publicar</button>
          <button class="btn-sm btn-sm-danger" onclick="rechazarProductoUsuario('${p.id}','${esc(p.nombre)}')">❌ Rechazar y eliminar</button>
        </div>
      </div>`;
  }).join('');
}

// Editar un producto pendiente antes de publicarlo — abre el tab Nuevo pre-cargado
async function editarPendienteEnFormulario(idPendiente) {
  const doc = await db.collection('productos_usuarios').doc(idPendiente).get();
  if (!doc.exists) return;
  const p = doc.data();

  // Ir al tab Nuevo
  const btnNuevo = document.querySelector('.tab-btn[onclick*="tab-nuevo"]');
  if (btnNuevo) btnNuevo.click();

  // Esperar que el DOM esté listo
  await new Promise(r => setTimeout(r, 80));

  // Pre-cargar los campos con los datos del producto pendiente
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('np-nombre',      p.nombre);
  set('np-descripcion', p.descripcion);
  set('np-precio',      p.precio);
  set('np-condicion',   p.condicion || 'Usado');

  // Fotos — cargar las existentes en el uploader
  fotosSubidas['np'] = p.fotos || [];
  const prev = document.getElementById('np-fotos-preview');
  if (prev) {
    prev.innerHTML = (p.fotos || []).map(url => `
      <div class="foto-thumb" style="position:relative;">
        <img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" loading="lazy"/>
        <button onclick="event.stopPropagation();eliminarFotoSubida('${url}','np')"
          style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:0.7rem;cursor:pointer;line-height:20px;padding:0;">✕</button>
      </div>`).join('');
  }

  // Guardar referencia al pendiente para usarla al publicar
  document.getElementById('np-nombre').dataset.pendienteId = idPendiente;

  // Mostrar aviso
  const suc = document.getElementById('np-success');
  if (suc) {
    suc.textContent = `✏️ Editando producto de ${p.nombreVendedor || 'usuario'}. Completá los campos y presioná "PUBLICAR PRODUCTO" para aprobar.`;
    suc.classList.remove('hidden');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function aprobarProductoUsuario(id) {
  const doc = await db.collection('productos_usuarios').doc(id).get();
  if (!doc.exists) return;
  const p = doc.data();

  // Publicar en la colección principal de productos
  await db.collection('productos').add({
    nombre:        p.nombre,
    descripcion:   p.descripcion || '',
    precio:        p.precio,
    condicion:     p.condicion || '',
    fotos:         p.fotos || [],
    vendido:       false,
    fecha:         new Date().toISOString(),
    badgeTexto:    'DISPONIBLE',
    badgeFondo:    '#6366f1',
    badgeColor:    '#ffffff',
    // Datos del vendedor para referencia del admin
    uidVendedor:       p.uid,
    nombreVendedor:    p.nombreVendedor || '',
    emailVendedor:     p.emailVendedor || '',
    telefonoVendedor:  p.telefonoVendedor || '',
    origenUsuario:     true,
  });

  // Marcar como aprobado en productos_usuarios
  await db.collection('productos_usuarios').doc(id).update({ estado: 'aprobado' });

  cargarPendientesAdmin();
  cargarMetricas();
  // Notificar al admin visualmente
  const msg = document.getElementById('admin-usuarios-msg');
  if (msg) {
    msg.textContent = `✅ Producto "${p.nombre}" aprobado y publicado en la tienda.`;
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 5000);
  }
}

async function rechazarProductoUsuario(id, nombre) {
  if (!confirm(`¿Rechazar y eliminar el producto "${nombre}"? El usuario verá que fue rechazado.`)) return;
  await db.collection('productos_usuarios').doc(id).update({
    estado: 'rechazado',
    motivoRechazo: 'No cumple con los requisitos de la plataforma.'
  });
  cargarPendientesAdmin();
}

// ── Badge de pendientes en tiempo real (visible para el admin) ────────────
function escucharPendientes() {
  db.collection('productos_usuarios')
    .where('estado', '==', 'pendiente')
    .onSnapshot(snap => {
      const badge = document.getElementById('badge-pendientes');
      if (!badge) return;
      badge.textContent = snap.size;
      badge.style.display = snap.size > 0 ? 'inline-block' : 'none';
    });
}

// ════════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════
// PERSUASIÓN: URGENCIA, 3 PRECIOS, EMOCIÓN
// ════════════════════════════════════════════════
const TXT_ESPERANZA_DEF = 'Lo que hoy parece lejos puede ser tuyo antes de lo que pensás. Cada cosa que ves acá es una oportunidad real de mejorar tu casa sin vaciar tu bolsillo.';
const TXT_FLEX_DEF      = 'Hacelo a tu ritmo, tranquilo. Escribinos y armamos una forma de pago que te cierre a vos.';

function chipsUrgencia(p, grande) {
  const chips = [];
  const cant = parseInt(p.cantidad, 10);
  if (!isNaN(cant) && cant >= 1 && cant <= 3) {
    chips.push(`<span class="chip-urgencia chip-ultimas">🔥 ${cant === 1 ? '¡Última unidad!' : '¡Últimas ' + cant + ' unidades!'}</span>`);
  }
  if (p.exclusivo && p.mostrarExclusivo === true) {
    chips.push(`<span class="chip-urgencia chip-exclusivo">💎 Exclusivo: solo ${p.exclusivo} ${Number(p.exclusivo) === 1 ? 'unidad' : 'unidades'} en el mundo</span>`);
  }
  if (!chips.length) return '';
  return `<div class="chips-urgencia${grande ? ' chips-urgencia-lg' : ''}">${chips.join('')}</div>`;
}

function tiersPrecios(p) {
  if (!p.precioContado && !p.planCuotas) return '';
  const m = p.moneda;
  const tiers = [];
  if (p.precioAnterior) {
    tiers.push(`<div class="tier tier-mercado"><div class="tier-label">Precio de mercado</div><div class="tier-monto tachado">${formatPrecio(p.precioAnterior, m)}</div><div class="tier-sub">Lo que pagarías en otro lado</div></div>`);
  }
  if (p.precioContado) {
    const ahorro = p.precioAnterior ? p.precioAnterior - p.precioContado : (p.precio - p.precioContado);
    tiers.push(`<div class="tier tier-contado"><div class="tier-tag">MEJOR PRECIO</div><div class="tier-label">💵 Contado / transferencia</div><div class="tier-monto">${formatPrecio(p.precioContado, m)}</div><div class="tier-sub">${ahorro > 0 ? 'Ahorrás ' + formatPrecio(ahorro, m) : 'Pago único'}</div></div>`);
  }
  if (p.planCuotas) {
    const cuota = Math.round(p.precio / p.planCuotas);
    tiers.push(`<div class="tier tier-plan"><div class="tier-label">🐢 A tu ritmo</div><div class="tier-monto">${p.planCuotas} × ${formatPrecio(cuota, m)}</div><div class="tier-sub">Total ${formatPrecio(p.precio, m)} · tranqui</div></div>`);
  }
  return `<div class="tiers tiers-${tiers.length}">${tiers.join('')}</div>`;
}

function bloquesEmocionales(p) {
  const esp  = (config.esperanza || '').trim() || TXT_ESPERANZA_DEF;
  const flex = (config.flex || '').trim()      || TXT_FLEX_DEF;
  return `<div class="bloques-emo">
    ${(p.paraVos && p.mostrarParaVos === true) ? `<div class="bloque-emo bloque-paravos"><strong>💛 Esto es para vos si...</strong><span>${esc(p.paraVos)}</span></div>` : ''}
    ${(p.testimonio && p.mostrarHistoria === true) ? `<div class="bloque-emo bloque-identif"><strong>🙋 Yo estuve ahí, y pude. Vos también podés.</strong><span>${esc(p.testimonio)}</span></div>` : ''}
    <div class="bloque-emo bloque-esperanza"><strong>🌱 Sí se puede</strong><span>${esc(esp)}</span></div>
    <div class="bloque-emo bloque-flex"><strong>🐢 Sin apuro</strong><span>${esc(flex)}</span></div>
  </div>`;
}

// ════════════════════════════════════════════════
// LOTES PARA COMERCIANTES
// ════════════════════════════════════════════════
let lotesCache = [];

function parseItemsLote(txt) {
  return (txt || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [nombre, cant, rev] = l.split('|').map(x => (x || '').trim());
    return {
      nombre: nombre || 'Producto',
      cant: Math.max(1, parseInt(cant, 10) || 1),
      reventa: Number(String(rev || '').replace(/[^\d.]/g, '')) || 0
    };
  });
}

function calcLote(l) {
  const items = l.items || [];
  const unidades = items.reduce((a, i) => a + i.cant, 0);
  const reventaTotal = items.reduce((a, i) => a + i.cant * i.reventa, 0);
  const yaVigente = !!(l.precioYa && (!l.yaHasta || new Date(l.yaHasta) > new Date()));
  const pagar = yaVigente ? l.precioYa : l.precio;
  const ganancia = reventaTotal - pagar;
  return {
    unidades, reventaTotal, yaVigente, pagar,
    costoUnit: unidades ? Math.round(pagar / unidades) : 0,
    ganancia,
    roi: pagar ? Math.round((ganancia / pagar) * 100) : 0,
    gananciaConservadora: Math.round(reventaTotal * 0.7 - pagar)   // vendiendo al 70% del estimado
  };
}

async function verLotes() {
  showScreen('screen-lotes');
  const grid = document.getElementById('lotes-grid');
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const snap = await db.collection('lotes').orderBy('fecha', 'desc').get();
    lotesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><p>No se pudieron cargar los lotes: ${esc(e.message)}</p></div>`;
    return;
  }
  const lotes = lotesCache.filter(l => !l.vendido);
  if (!lotes.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🏪</div><p>Por ahora no hay lotes disponibles.</p></div>';
    return;
  }
  grid.innerHTML = lotes.map(l => {
    const c = calcLote(l);
    return `<div class="lote-card" onclick="verLote('${l.id}')">
      ${l.fotos && l.fotos[0] ? `<img class="lote-card-img" src="${esc(l.fotos[0])}" alt="" onerror="this.style.display='none'">` : ''}
      <div class="lote-card-body">
        <div class="lote-card-nombre">${esc(l.nombre)}</div>
        <div class="lote-card-meta">${c.unidades} unidades · ${formatPrecio(c.costoUnit, l.moneda)} c/u</div>
        <div class="lote-card-precio">${formatPrecio(c.pagar, l.moneda)}</div>
        ${c.reventaTotal ? `<div class="lote-card-ganancia">📈 Ganancia estimada ${formatPrecio(c.ganancia, l.moneda)} (${c.roi}%)</div>` : ''}
        ${c.yaVigente ? '<div class="lote-card-ya">⚡ Precio especial por confirmar ya</div>' : ''}
      </div>
    </div>`;
  }).join('');
}

function verLote(id) {
  const l = lotesCache.find(x => x.id === id);
  if (!l) return;
  const c = calcLote(l);
  const m = l.moneda;
  const wa = config.whatsapp || '5493548549097';
  const msg = encodeURIComponent(`Hola! Me interesa el lote "${l.nombre}" (${formatPrecio(c.pagar, m)}). ¿Sigue disponible?`);
  const fotos = (l.fotos || []).filter(Boolean);
  document.getElementById('lote-contenido').innerHTML = `
    ${fotos.length ? `<div class="lote-fotos">${fotos.map(f => `<img src="${esc(f)}" alt="" onerror="this.style.display='none'">`).join('')}</div>` : ''}
    <div class="detalle-nombre">${esc(l.nombre)}</div>
    ${l.descripcion ? `<div class="detalle-desc">${esc(l.descripcion)}</div>` : ''}
    ${c.yaVigente ? `<div class="lote-ya-box">
        <div class="detalle-oferta-label">⚡ PRECIO ESPECIAL SI CONFIRMÁS YA</div>
        ${l.yaHasta ? `<div class="detalle-countdown" data-hasta="${l.yaHasta}">⏳ ...</div>` : ''}
        <div class="lote-ya-sub">Después vuelve a <s>${formatPrecio(l.precio, m)}</s></div>
      </div>` : ''}
    <div class="lote-numeros">
      <div class="spec-card"><div class="spec-label">Precio total del lote</div><div class="spec-value lote-num-grande">${formatPrecio(c.pagar, m)}</div></div>
      <div class="spec-card"><div class="spec-label">Costo por unidad</div><div class="spec-value lote-num-grande">${formatPrecio(c.costoUnit, m)}</div><div class="tier-sub">${c.unidades} unidades</div></div>
      ${c.reventaTotal ? `
      <div class="spec-card"><div class="spec-label">Podés venderlo por</div><div class="spec-value lote-num-grande">${formatPrecio(c.reventaTotal, m)}</div></div>
      <div class="spec-card lote-ganancia"><div class="spec-label">Tu ganancia estimada</div><div class="spec-value lote-num-grande">${formatPrecio(c.ganancia, m)}</div></div>
      <div class="spec-card lote-ganancia"><div class="spec-label">Retorno de inversión</div><div class="spec-value lote-num-grande">${c.roi}%</div></div>
      <div class="spec-card"><div class="spec-label">Aun vendiendo al 70%</div><div class="spec-value lote-num-grande">${c.gananciaConservadora > 0 ? '+' : ''}${formatPrecio(Math.abs(c.gananciaConservadora) || 0, m)}</div><div class="tier-sub">${c.gananciaConservadora >= 0 ? 'seguís ganando' : 'escenario pesimista'}</div></div>` : ''}
    </div>
    ${(l.items || []).length ? `<div class="lote-tabla-wrap"><table class="lote-tabla">
      <thead><tr><th>Producto</th><th>Cant.</th><th>Reventa c/u</th><th>Subtotal</th></tr></thead>
      <tbody>${l.items.map(i => `<tr><td>${esc(i.nombre)}</td><td>${i.cant}</td><td>${i.reventa ? formatPrecio(i.reventa, m) : '—'}</td><td>${i.reventa ? formatPrecio(i.cant * i.reventa, m) : '—'}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    ${l.entrega ? `<div class="detalle-desc">🚚 ${esc(l.entrega)}</div>` : ''}
    <div class="lote-aviso">Los precios de reventa son estimaciones del vendedor y pueden variar según tu zona y tu canal de venta.</div>
    <a href="https://wa.me/${wa}?text=${msg}" target="_blank" class="btn-whatsapp">💬 QUIERO ESTE LOTE</a>`;
  showScreen('screen-lote');
}

// ─── Admin ───
async function cargarLotesAdmin() {
  const cont = document.getElementById('admin-lotes-list');
  if (!cont) return;
  // El armador necesita los productos; si todavía no están cargados, los traemos.
  if (!productosCache.length) {
    try {
      const ps = await db.collection('productos').orderBy('fecha','desc').get();
      productosCache = ordenarProductos(ps.docs.map(d => ({ id:d.id, ...d.data() })));
    } catch(e) { console.log('No se pudieron cargar productos para lotes', e); }
  }
  poblarCategoriasLote();
  renderPickerLote();
  renderItemsLote();
  renderCondicionesLote();
  renderTotalesLote();
  const snap = await db.collection('lotes').orderBy('fecha', 'desc').get();
  lotesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!lotesCache.length) { cont.innerHTML = '<div class="empty-state"><div class="empty-icon">🏪</div><p>Todavía no cargaste lotes.</p></div>'; return; }
  cont.innerHTML = lotesCache.map(l => {
    const c = calcLote(l);
    return `<div class="admin-item" style="flex-wrap:wrap;gap:10px;">
      <div style="flex:1;min-width:220px;">
        <div class="admin-item-nombre">${esc(l.nombre)} ${l.vendido ? '🔴 Vendido' : ''}</div>
        <div class="admin-item-meta">${c.unidades} u. · Lote ${formatPrecio(l.precio, l.moneda)} · Reventa ${formatPrecio(c.reventaTotal, l.moneda)} · Ganancia ${formatPrecio(c.ganancia, l.moneda)} (${c.roi}%)</div>
      </div>
      <div class="admin-item-actions">
        <button class="btn-sm btn-sm-info" onclick="generarPdfLote(lotesCache.find(x=>x.id==='${l.id}'))">📄 PDF</button>
        <button class="btn-sm btn-sm-info" onclick="generarCatalogoLote(lotesCache.find(x=>x.id==='${l.id}'))">📚 Catálogo</button>
        <button class="btn-sm btn-sm-primary" onclick="editarLote('${l.id}')">Editar</button>
        <button class="btn-sm btn-sm-warning" onclick="toggleLoteVendido('${l.id}', ${!!l.vendido})">${l.vendido ? 'Disponible' : 'Vendido'}</button>
        <button class="btn-sm btn-sm-danger" onclick="eliminarLote('${l.id}')">Eliminar</button>
      </div>
    </div>`;
  }).join('');
}

// ── Estado del armador ──
let loteItems = [];        // [{productoId, nombre, cant, reventa, foto}]
let loteCondiciones = [];  // [{label, tipo:'%'|'$', valor}]
const loteSel = new Set(); // ids de productos tildados en el selector

function aplicarDescLote(base, tipo, valor) {
  const v = Number(valor) || 0;
  if (!v) return base;
  const r = tipo === '$' ? base - v : base * (1 - v / 100);
  return Math.max(0, Math.round(r));
}

function calcPreciosLote() {
  const lista = loteItems.reduce((a, i) => a + (Number(i.cant) || 0) * (Number(i.reventa) || 0), 0);
  const calc  = aplicarDescLote(lista, val('lote-desc-tipo'), val('lote-desc-valor'));
  const manual = Number(val('lote-precio-manual')) || 0;
  const precio = manual || calc;
  return { lista, precio, ahorro: Math.max(0, lista - precio) };
}

// ── Selector de productos ──
function poblarCategoriasLote() {
  const sel = document.getElementById('lote-cat');
  if (!sel) return;
  const actual = sel.value;
  const cats = [...new Set(productosCache.map(p => p.categoria).filter(Boolean))];
  sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  sel.value = actual;
}

function productosVisiblesLote() {
  const q   = val('lote-buscar').toLowerCase();
  const cat = val('lote-cat');
  return productosCache.filter(p =>
    !p.vendido &&
    (!q || (p.nombre || '').toLowerCase().includes(q)) &&
    (!cat || p.categoria === cat)
  );
}

function enLote(id) { return loteItems.some(i => i.productoId === id); }

function renderPickerLote() {
  const cont = document.getElementById('lote-picker');
  if (!cont) return;
  const lista = productosVisiblesLote();
  if (!lista.length) { cont.innerHTML = '<div class="field-hint">No hay productos disponibles con ese filtro.</div>'; actualizarContadorLote(); return; }
  cont.innerHTML = lista.map(p => {
    const ya = enLote(p.id);
    const img = p.fotos && p.fotos[0] ? `<img class="lp-thumb" src="${esc(p.fotos[0])}" alt="" onerror="this.style.display='none'">` : '<div class="lp-thumb">📦</div>';
    return `<label class="lp-row${ya ? ' lp-ya' : ''}">
      <input type="checkbox" ${ya ? 'disabled checked' : ''} ${(!ya && loteSel.has(p.id)) ? 'checked' : ''} onchange="toggleSelLote('${p.id}', this.checked)">
      ${img}
      <div class="lp-info"><div class="lp-nom">${esc(p.nombre)}</div>
      <div class="lp-sub">${formatPrecio(p.precio, p.moneda)}${p.cantidad ? ' · x' + esc(p.cantidad) : ''}${p.categoria ? ' · ' + esc(p.categoria) : ''}${ya ? ' · ya está en el lote' : ''}</div></div>
    </label>`;
  }).join('');
  actualizarContadorLote();
}

function actualizarContadorLote() {
  setText('lote-sel-count', loteSel.size);
  const visibles = productosVisiblesLote().filter(p => !enLote(p.id));
  const todos = visibles.length && visibles.every(p => loteSel.has(p.id));
  const btn = document.getElementById('lote-btn-todos');
  if (btn) btn.textContent = todos ? '☐ QUITAR TODOS' : '☑ TODOS';
}

function toggleSelLote(id, on) {
  if (on) loteSel.add(id); else loteSel.delete(id);
  actualizarContadorLote();
}

function toggleTodosLote() {
  const visibles = productosVisiblesLote().filter(p => !enLote(p.id));
  const todos = visibles.length && visibles.every(p => loteSel.has(p.id));
  visibles.forEach(p => todos ? loteSel.delete(p.id) : loteSel.add(p.id));
  renderPickerLote();
}

function ningunoLote() { loteSel.clear(); renderPickerLote(); }

function agregarSeleccionadosLote() {
  const err = document.getElementById('lote-error');
  err.classList.add('hidden');
  if (!loteSel.size) { mostrarError(err, 'Tildá al menos un producto (o tocá TODOS).'); return; }
  const monedaLote = val('lote-moneda') || 'ARS';
  let otraMoneda = false;
  productosCache.filter(p => loteSel.has(p.id) && !enLote(p.id)).forEach(p => {
    if ((p.moneda || 'ARS') !== monedaLote) otraMoneda = true;
    loteItems.push({
      productoId: p.id,
      nombre: p.nombre,
      cant: Math.max(1, parseInt(p.cantidad, 10) || 1),
      reventa: Number(p.precio) || 0,
      foto: (p.fotos && p.fotos[0]) || ''
    });
  });
  loteSel.clear();
  if (otraMoneda) mostrarError(err, 'Ojo: agregaste productos cargados en otra moneda que la del lote. Revisá los precios.');
  renderPickerLote(); renderItemsLote(); renderTotalesLote();
}

function agregarItemManualLote() {
  loteItems.push({ productoId: null, nombre: '', cant: 1, reventa: 0, foto: '' });
  renderItemsLote(); renderTotalesLote();
}

// ── Tabla de ítems del lote ──
function renderItemsLote() {
  const cont = document.getElementById('lote-items-tabla');
  if (!cont) return;
  if (!loteItems.length) { cont.innerHTML = '<div class="field-hint">Todavía no hay productos en el lote. Elegilos arriba.</div>'; return; }
  const m = val('lote-moneda') || 'ARS';
  cont.innerHTML = `<div class="lp-item lp-head"><div class="lp-nombre-in">Producto</div><div>Cant.</div><div>Valor c/u</div><div style="text-align:right">Subtotal</div><div></div></div>` +
    loteItems.map((it, i) => `<div class="lp-item">
      <div class="lp-nombre-in"><input type="text" value="${esc(it.nombre)}" placeholder="Nombre" oninput="loteItems[${i}].nombre=this.value"></div>
      <input type="number" min="1" value="${it.cant}" oninput="loteItems[${i}].cant=Math.max(1,parseInt(this.value,10)||1);actualizarSubtotalLote(${i});renderTotalesLote()">
      <input type="number" min="0" value="${it.reventa}" oninput="loteItems[${i}].reventa=Number(this.value)||0;actualizarSubtotalLote(${i});renderTotalesLote()">
      <div class="lp-subtotal" id="lote-sub-${i}">${formatPrecio(it.cant * it.reventa, m)}</div>
      <button type="button" class="lp-x" title="Quitar" onclick="quitarItemLote(${i})">✕</button>
    </div>`).join('');
}

function actualizarSubtotalLote(i) {
  const el = document.getElementById('lote-sub-' + i);
  const it = loteItems[i];
  if (el && it) el.textContent = formatPrecio(it.cant * it.reventa, val('lote-moneda') || 'ARS');
}

function quitarItemLote(i) {
  loteItems.splice(i, 1);
  renderPickerLote(); renderItemsLote(); renderTotalesLote();
}

// ── Totales y condiciones de pago ──
function renderTotalesLote() {
  const cont = document.getElementById('lote-totales');
  if (!cont) return;
  const m = val('lote-moneda') || 'ARS';
  const unidades = loteItems.reduce((a, i) => a + (Number(i.cant) || 0), 0);
  const t = calcPreciosLote();
  cont.innerHTML = `
    <div class="lp-fila"><span>${loteItems.length} productos · ${unidades} unidades</span><span></span></div>
    <div class="lp-fila"><span>Valor total de los productos</span><strong>${formatPrecio(t.lista, m)}</strong></div>
    <div class="lp-fila"><span>Descuento por lote completo</span><strong>− ${formatPrecio(t.ahorro, m)}</strong></div>
    <div class="lp-fila lp-big"><span>PRECIO DEL LOTE</span><span>${formatPrecio(t.precio, m)}</span></div>`;
  loteCondiciones.forEach((c, i) => {
    const el = document.getElementById('lote-cond-final-' + i);
    if (el) el.textContent = formatPrecio(aplicarDescLote(t.precio, c.tipo, c.valor), m);
  });
}

function renderCondicionesLote() {
  const cont = document.getElementById('lote-condiciones');
  if (!cont) return;
  if (!loteCondiciones.length) { cont.innerHTML = '<div class="field-hint">Sin condiciones: el PDF mostrará solo el precio del lote.</div>'; return; }
  cont.innerHTML = loteCondiciones.map((c, i) => `<div class="lp-cond">
    <input class="lp-cond-label" type="text" value="${esc(c.label)}" placeholder="Ej: Efectivo / dinero físico" oninput="loteCondiciones[${i}].label=this.value">
    <select onchange="loteCondiciones[${i}].tipo=this.value;renderTotalesLote()"><option value="%" ${c.tipo==='%'?'selected':''}>%</option><option value="$" ${c.tipo==='$'?'selected':''}>$ fijo</option></select>
    <input type="number" min="0" value="${c.valor}" oninput="loteCondiciones[${i}].valor=Number(this.value)||0;renderTotalesLote()">
    <strong id="lote-cond-final-${i}" style="font-size:.85rem;text-align:right"></strong>
    <button type="button" class="lp-x" title="Quitar" onclick="quitarCondicionLote(${i})">✕</button>
  </div>`).join('');
  renderTotalesLote();
}

function agregarCondicionLote(label, valor) {
  loteCondiciones.push({ label, tipo: '%', valor });
  renderCondicionesLote();
}
function quitarCondicionLote(i) { loteCondiciones.splice(i, 1); renderCondicionesLote(); }

// ── Guardar / editar ──
function datosDesdeFormLote() {
  const t = calcPreciosLote();
  const precioYa = val('lote-precio-ya');
  return {
    nombre: val('lote-nombre'), descripcion: val('lote-descripcion'),
    items: loteItems.map(i => ({
      productoId: i.productoId || null,
      nombre: (i.nombre || '').trim() || 'Producto',
      cant: Math.max(1, parseInt(i.cant, 10) || 1),
      reventa: Number(i.reventa) || 0,
      foto: i.foto || ''
    })),
    precio: t.precio, precioLista: t.lista,
    descGeneral: { tipo: val('lote-desc-tipo') || '%', valor: Number(val('lote-desc-valor')) || 0 },
    precioManual: Number(val('lote-precio-manual')) || null,
    condiciones: loteCondiciones.filter(c => (c.label || '').trim()).map(c => ({ label: c.label.trim(), tipo: c.tipo, valor: Number(c.valor) || 0 })),
    moneda: val('lote-moneda') || 'ARS',
    precioYa: precioYa ? Number(precioYa) : null,
    yaHasta: val('lote-ya-hasta') || null,
    entrega: val('lote-entrega'),
    fotos: document.getElementById('lote-fotos').value.split('\n').map(x => x.trim()).filter(Boolean),
    cliente: val('lote-cliente'),
    validezDias: Number(val('lote-validez')) || null,
    notasPdf: val('lote-notas-pdf'),
    pdfFotos: !!document.getElementById('lote-pdf-fotos')?.checked,
    pdfGanancia: !!document.getElementById('lote-pdf-ganancia')?.checked,
    pdfGraficos: !!document.getElementById('lote-pdf-graficos')?.checked,
    pdfWa: val('lote-pdf-wa'),
    pdfDias: Number(val('lote-pdf-dias')) || null,
    pdfGancho: val('lote-pdf-gancho'),
    pdfVentajas: val('lote-pdf-ventajas'),
    catOpc: {fotos: !!document.getElementById('cat-fotos')?.checked, cantidad: !!document.getElementById('cat-cantidad')?.checked, precios: !!document.getElementById('cat-precios')?.checked, ref: !!document.getElementById('cat-ref')?.checked, specs: !!document.getElementById('cat-specs')?.checked, desc: !!document.getElementById('cat-desc')?.checked, notas: !!document.getElementById('cat-notas')?.checked, tema: (document.getElementById('cat-tema')?.value === 'oscuro' ? 'oscuro' : 'claro'), calidad: (document.getElementById('cat-calidad')?.value || 'media')}
  };
}

async function guardarLote() {
  const err = document.getElementById('lote-error');
  const suc = document.getElementById('lote-success');
  err.classList.add('hidden'); suc.classList.add('hidden');
  const datos = datosDesdeFormLote();
  if (!datos.nombre || !datos.items.length || !datos.precio) { mostrarError(err, 'Nombre, al menos un producto y un precio de lote mayor a 0 son obligatorios.'); return; }
  const id = val('lote-id');
  try {
    if (id) { await db.collection('lotes').doc(id).update({ ...datos, editado: new Date().toISOString() }); }
    else    { await db.collection('lotes').add({ ...datos, vendido: false, fecha: new Date().toISOString() }); }
    suc.textContent = '✅ Lote guardado.'; suc.classList.remove('hidden');
    limpiarFormLote(); cargarLotesAdmin();
  } catch (e) { mostrarError(err, 'Error al guardar: ' + e.message); }
}

function limpiarFormLote() {
  ['lote-id','lote-nombre','lote-descripcion','lote-precio-manual','lote-desc-valor','lote-precio-ya','lote-ya-hasta','lote-entrega','lote-fotos',
   'lote-cliente','lote-validez','lote-notas-pdf','lote-buscar']
    .forEach(i => setVal(i, ''));
  setVal('lote-moneda', 'ARS'); setVal('lote-desc-tipo', '%'); setVal('lote-cat', '');
  const f = document.getElementById('lote-pdf-fotos'); if (f) f.checked = true;
  const g = document.getElementById('lote-pdf-ganancia'); if (g) g.checked = true;
  ['lote-pdf-wa','lote-pdf-dias','lote-pdf-gancho','lote-pdf-ventajas'].forEach(i => setVal(i, ''));
  const gr = document.getElementById('lote-pdf-graficos'); if (gr) gr.checked = true;
  ['cat-fotos','cat-cantidad','cat-precios','cat-ref','cat-specs','cat-desc','cat-notas'].forEach(id => { const c = document.getElementById(id); if (c) c.checked = true; });
  setVal('cat-tema', 'claro'); setVal('cat-calidad', 'media');
  loteItems = []; loteCondiciones = []; loteSel.clear();
  renderPickerLote(); renderItemsLote(); renderCondicionesLote(); renderTotalesLote();
}

function editarLote(id) {
  const l = lotesCache.find(x => x.id === id);
  if (!l) return;
  setVal('lote-id', l.id); setVal('lote-nombre', l.nombre || ''); setVal('lote-descripcion', l.descripcion || '');
  setVal('lote-moneda', l.moneda || 'ARS');
  loteItems = (l.items || []).map(i => ({ productoId: i.productoId || null, nombre: i.nombre, cant: i.cant, reventa: i.reventa || 0, foto: i.foto || '' }));
  loteCondiciones = (l.condiciones || []).map(c => ({ ...c }));
  loteSel.clear();
  // Lotes viejos (sin descGeneral) tenían el precio escrito a mano: lo respetamos como precio manual.
  setVal('lote-desc-tipo', l.descGeneral?.tipo || '%');
  setVal('lote-desc-valor', l.descGeneral?.valor || '');
  setVal('lote-precio-manual', l.descGeneral ? (l.precioManual || '') : (l.precio || ''));
  setVal('lote-precio-ya', l.precioYa || ''); setVal('lote-ya-hasta', l.yaHasta ? l.yaHasta.slice(0, 16) : '');
  setVal('lote-entrega', l.entrega || ''); setVal('lote-fotos', (l.fotos || []).join('\n'));
  setVal('lote-cliente', l.cliente || ''); setVal('lote-validez', l.validezDias || ''); setVal('lote-notas-pdf', l.notasPdf || '');
  const f = document.getElementById('lote-pdf-fotos'); if (f) f.checked = l.pdfFotos !== false;
  const g = document.getElementById('lote-pdf-ganancia'); if (g) g.checked = l.pdfGanancia !== false;
  const gr = document.getElementById('lote-pdf-graficos'); if (gr) gr.checked = l.pdfGraficos !== false;
  setVal('lote-pdf-wa', l.pdfWa || ''); setVal('lote-pdf-dias', l.pdfDias || '');
  setVal('lote-pdf-gancho', l.pdfGancho || ''); setVal('lote-pdf-ventajas', l.pdfVentajas || '');
  [['cat-fotos','fotos'],['cat-cantidad','cantidad'],['cat-precios','precios'],['cat-ref','ref'],['cat-specs','specs'],['cat-desc','desc'],['cat-notas','notas']].forEach(([id,k]) => { const c = document.getElementById(id); if (c) c.checked = !l.catOpc || l.catOpc[k] !== false; });
  setVal('cat-tema', (l.catOpc && l.catOpc.tema) || 'claro'); setVal('cat-calidad', (l.catOpc && l.catOpc.calidad) || 'media');
  renderPickerLote(); renderItemsLote(); renderCondicionesLote(); renderTotalesLote();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function toggleLoteVendido(id, actual) {
  await db.collection('lotes').doc(id).update({ vendido: !actual });
  cargarLotesAdmin();
}

async function eliminarLote(id) {
  if (!confirm('¿Eliminar este lote?')) return;
  await db.collection('lotes').doc(id).delete();
  cargarLotesAdmin();
}

// ════════════════════════════════════════════════
// PDF / PRESUPUESTO DEL LOTE
// (se abre una hoja lista para imprimir → "Guardar como PDF")
// ════════════════════════════════════════════════
function pdfDesdeFormLote() {
  const err = document.getElementById('lote-error');
  err.classList.add('hidden');
  const d = datosDesdeFormLote();
  if (!d.items.length) { mostrarError(err, 'Agregá productos al lote antes de generar el PDF.'); return; }
  if (!d.nombre) d.nombre = 'Lote de productos';
  generarPdfLote(d);
}

function miniaturaPdf(url) {
  if (!url) return '';
  // Cloudinary: pedimos una versión chica para que el PDF pese poco.
  return url.includes('res.cloudinary.com') && url.includes('/upload/')
    ? url.replace('/upload/', '/upload/w_160,h_160,c_fill,q_auto/') : url;
}

function generarPdfLote(l) {
  if (!l) return;
  const m   = l.moneda || 'ARS';
  const fp  = n => n === 0 ? formatPrecio(1, m).replace('1', '0') : formatPrecio(n, m);
  const items = l.items || [];
  const unidades = items.reduce((a, i) => a + i.cant, 0);
  const lista = items.reduce((a, i) => a + i.cant * (i.reventa || 0), 0);
  // Súper precio "confirmá YA": vale si está cargado y (no tiene vencimiento, o todavía no venció).
  const yaVigente = !!(l.precioYa && (!l.yaHasta || new Date(l.yaHasta) > new Date()));
  const precio = l.precio;
  const ahorroLote = Math.max(0, lista - precio);
  const conFotos = l.pdfFotos !== false && items.some(i => i.foto);
  const hoy = new Date();
  const vence = l.validezDias ? new Date(hoy.getTime() + l.validezDias * 86400000) : null;
  const fmtF = d => d.toLocaleDateString('es-AR');
  const tienda = config.nombre || 'Comprá Aquí';
  const wa = String(l.pdfWa || '').replace(/\D/g, '');
  const ganancia = lista - precio;
  const roi = precio ? Math.round(ganancia / precio * 100) : 0;

  const filas = items.map((i, n) => `<tr>
      <td class="c">${n + 1}</td>
      ${conFotos ? `<td class="c">${i.foto ? `<img src="${esc(miniaturaPdf(i.foto))}" alt="">` : ''}</td>` : ''}
      <td>${esc(i.nombre)}</td>
      <td class="c">${i.cant}</td>
      <td class="r">${i.reventa ? fp(i.reventa) : '—'}</td>
      <td class="r">${i.reventa ? fp(i.cant * i.reventa) : '—'}</td>
    </tr>`).join('');

  const condiciones = (l.condiciones || []).map(c => {
    const fin = aplicarDescLote(precio, c.tipo, c.valor);
    const desc = c.valor ? (c.tipo === '$' ? '− ' + fp(c.valor) : '− ' + c.valor + '%') : '—';
    return `<tr><td>${esc(c.label)}</td><td class="c">${desc}</td><td class="r"><strong>${fp(fin)}</strong></td><td class="r">${precio - fin > 0 ? fp(precio - fin) : '—'}</td></tr>`;
  }).join('');

  // ── PDF persuasivo: cálculos y bloques nuevos (se suman al presupuesto, no lo reemplazan) ──
  const persuasivo = l.pdfGraficos !== false && lista > 0;
  const verGan = l.pdfGanancia !== false;
  const finales = (l.condiciones || []).map(c => aplicarDescLote(precio, c.tipo, c.valor)).filter(n => n > 0);
  const pBest = Math.min(precio, ...finales, yaVigente ? l.precioYa : precio);
  const gBest = lista - pBest;
  const roiBest = pBest ? Math.round(gBest / pBest * 100) : 0;

  // ── SÚPER PRECIO: el mejor precio disponible manda en todo el PDF ──
  const pYa = yaVigente ? l.precioYa : 0;
  const yaEsMejor = yaVigente && pYa <= pBest;
  const ahorroTotal = Math.max(0, lista - pBest);
  const ahorroTotalPct = lista ? Math.round(ahorroTotal / lista * 100) : 0;
  const descYaPct = precio ? Math.max(0, Math.round((1 - pYa / precio) * 100)) : 0;
  const porCada100 = lista ? Math.round(pBest / lista * 100) : 0;
  const finYa = (yaVigente && l.yaHasta) ? new Date(l.yaHasta) : null;
  const finYaTxt = finYa ? finYa.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  let quedaTxt = '';
  if (finYa) {
    const ms = finYa - hoy, dd = Math.floor(ms / 86400000), hh = Math.floor((ms % 86400000) / 3600000);
    quedaTxt = dd > 0 ? `quedan ${dd} ${dd === 1 ? 'día' : 'días'} y ${hh} hs` : `quedan solo ${Math.max(1, hh)} hs`;
  }
  const mostrarSuper = (persuasivo || yaVigente) && lista > 0 && pBest < lista;
  const equilibrio = lista ? Math.min(100, Math.round(pBest / lista * 100)) : 0;   // % del lote que hay que vender para recuperar lo invertido
  const pct = n => Math.max(0, Math.min(100, n));
  const waLimpio = String(wa).replace(/\D/g, '');
  const waFmt = waLimpio ? '+' + waLimpio : '';
  const waMsg = encodeURIComponent('Hola! Vi el presupuesto del lote "' + l.nombre + '" y quiero reservarlo.');
  const waLinkPdf = waLimpio ? 'https://wa.me/' + waLimpio + '?text=' + waMsg : '';

  // Gráfico 1: lo que pagás vs. lo que vale
  const barras = [
    { t: 'Valor de los productos', v: lista, c: '#2563eb' },
    { t: 'Precio del lote', v: precio, c: '#d97706' }
  ];
  if (pBest < precio) barras.push({ t: 'Tu mejor precio', v: pBest, c: '#10b981' });
  const grafPrecio = barras.map(b => `<div class="gb"><div class="gb-t"><span>${b.t}</span><strong>${fp(b.v)}</strong></div><div class="gb-bar"><div style="width:${pct(lista ? b.v / lista * 100 : 0)}%;background:${b.c}"></div></div></div>`).join('');

  // Gráfico 2: escenarios de ganancia según cuánto logres vender
  const escenarios = [100, 90, 80, 70].map(p => ({ p, g: Math.round(lista * p / 100 - pBest) }));
  const maxEsc = Math.max(1, ...escenarios.map(e => Math.abs(e.g)));
  const grafEsc = escenarios.map(e => `<div class="gb"><div class="gb-t"><span>Si vendés el ${e.p}%</span><strong>${e.g >= 0 ? '+ ' : '− '}${fp(Math.abs(e.g))}</strong></div><div class="gb-bar"><div style="width:${pct(Math.abs(e.g) / maxEsc * 100)}%;background:${e.g >= 0 ? '#10b981' : '#ef4444'}"></div></div></div>`).join('');

  // Gráfico 3: dónde está el valor (top productos por subtotal)
  const top = items.map(i => ({ n: i.nombre, v: i.cant * (i.reventa || 0) })).filter(i => i.v > 0).sort((x, y) => y.v - x.v).slice(0, 5);
  const grafTop = top.map(t => `<div class="gb"><div class="gb-t"><span>${esc(t.n)}</span><strong>${Math.round(t.v / lista * 100)}%</strong></div><div class="gb-bar"><div style="width:${pct(t.v / top[0].v * 100)}%;background:#2563eb"></div></div></div>`).join('');

  // Gráfico 4: dona (de cada $100 de reventa, cuánto es tu margen)
  const margenPct = lista ? pct(Math.round(gBest / lista * 100)) : 0;
  const R = 52, CIR = 2 * Math.PI * R;
  const dona = `<svg viewBox="0 0 140 140" width="130" height="130">
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="#e2e8f0" stroke-width="18"/>
      <circle cx="70" cy="70" r="${R}" fill="none" stroke="#10b981" stroke-width="18" stroke-dasharray="${(CIR * margenPct / 100).toFixed(1)} ${CIR.toFixed(1)}" transform="rotate(-90 70 70)"/>
      <text x="70" y="68" text-anchor="middle" font-size="24" font-weight="800" fill="#065f46">${margenPct}%</text>
      <text x="70" y="86" text-anchor="middle" font-size="10" fill="#6b7280">es tu margen</text></svg>`;

  // Gráfico 5: proyección de recupero (solo si cargaste los días de reventa)
  let grafRecupero = '';
  if (l.pdfDias && lista > 0) {
    const W = 520, H = 170, pl = 46, pb = 24, pt = 10, pr = 10;
    const x = d => pl + (W - pl - pr) * d;
    const y = v => pt + (H - pt - pb) * (1 - v / lista);
    const xe = equilibrio / 100;
    grafRecupero = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">
      <line x1="${pl}" y1="${y(0)}" x2="${W - pr}" y2="${y(0)}" stroke="#cbd5e1"/>
      <line x1="${pl}" y1="${y(pBest)}" x2="${W - pr}" y2="${y(pBest)}" stroke="#1e3a8a" stroke-dasharray="5 4"/>
      <text x="${W - pr}" y="${y(pBest) - 4}" text-anchor="end" font-size="10" fill="#1e3a8a">Tu inversión ${fp(pBest)}</text>
      <polyline points="${x(0)},${y(0)} ${x(1)},${y(lista)}" fill="none" stroke="#10b981" stroke-width="3"/>
      <circle cx="${x(xe)}" cy="${y(pBest)}" r="5" fill="#d97706"/>
      <text x="${x(xe) - 9}" y="${y(pBest) - 9}" text-anchor="end" font-size="10" fill="#b45309" font-weight="700">Recuperás todo (día ${Math.max(1, Math.round(l.pdfDias * xe))})</text>
      <text x="${pl - 4}" y="${y(lista) + 4}" text-anchor="end" font-size="10" fill="#6b7280">${fp(lista)}</text>
      <text x="${pl}" y="${H - 6}" font-size="10" fill="#6b7280">Día 0</text>
      <text x="${W - pr}" y="${H - 6}" text-anchor="end" font-size="10" fill="#6b7280">Día ${l.pdfDias}</text></svg>`;
  }

  // Ventajas: las automáticas salen de los datos reales del lote + las tuyas
  const ventajas = [];
  if (yaEsMejor) ventajas.push(`<strong>Súper precio de ${fp(pYa)}</strong>: ahorrás <strong>${fp(ahorroTotal)}</strong> (${ahorroTotalPct}%) frente a comprar producto por producto${finYa ? ', válido hasta el ' + finYaTxt : ''}.`);
  if (ahorroLote > 0 && lista) ventajas.push(`Comprás el lote completo con <strong>${Math.round(ahorroLote / lista * 100)}% menos</strong> que el valor de los productos sueltos.`);
  if (unidades > 1) ventajas.push(`<strong>${unidades} unidades en una sola compra</strong>: un solo trato, un solo retiro, mayor variedad para tu local.`);
  if (unidades && pBest) ventajas.push(`Costo por unidad desde <strong>${fp(Math.round(pBest / unidades))}</strong>.`);
  if (finales.length && pBest < precio) ventajas.push(`Con tu mejor forma de pago ahorrás <strong>${fp(precio - pBest)}</strong> extra.`);
  if (verGan && gBest > 0) ventajas.push(`Margen estimado de <strong>${fp(gBest)}</strong> (${roiBest}% sobre lo invertido) vendiendo a valor de lista.`);
  if (verGan && equilibrio > 0 && equilibrio < 100) ventajas.push(`Recuperás tu inversión vendiendo solo el <strong>${equilibrio}%</strong> de los productos; el resto es ganancia.`);
  if (vence) ventajas.push(`Precio garantizado hasta el <strong>${fmtF(vence)}</strong>.`);
  (l.pdfVentajas || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(v => ventajas.push(esc(v)));

  // Escalera de precios: de lo más caro a lo más barato, el mejor resaltado
  const peldanos = [{ t: 'Comprando producto por producto', v: lista, cls: 'tach' }];
  if (precio < lista) peldanos.push({ t: 'Precio del lote completo' + (lista ? ' (−' + Math.round((1 - precio / lista) * 100) + '%)' : ''), v: precio, cls: '' });
  (l.condiciones || []).forEach(c => {
    const fin = aplicarDescLote(precio, c.tipo, c.valor);
    if (fin > 0 && fin < precio) peldanos.push({ t: c.label + ' (' + (c.tipo === '$' ? '−' + fp(c.valor) : '−' + c.valor + '%') + ')', v: fin, cls: '' });
  });
  if (yaVigente) peldanos.push({ t: 'Súper precio confirmando ya' + (finYaTxt ? ' · hasta el ' + finYaTxt : ''), v: pYa, cls: '' });
  const minPeld = Math.min(...peldanos.map(x => x.v));
  const escalera = peldanos.map(x => `<div class="esc-row${x.v === minPeld && peldanos.length > 1 ? ' esc-best' : ''}"><span>${esc(x.t)}${(x.v === minPeld && peldanos.length > 1) ? ' <b>MEJOR PRECIO</b>' : ''}</span><strong class="${x.cls}">${x.cls === 'tach' ? '<s>' + fp(x.v) + '</s>' : fp(x.v)}</strong></div>`).join('');

  const bloqueSuper = mostrarSuper ? `<div class="super">
    <div class="super-k">${yaEsMejor ? 'SÚPER PRECIO · OPORTUNIDAD IMPERDIBLE' : 'TU MEJOR PRECIO'}</div>
    <div class="super-p">${fp(pBest)}</div>
    <div class="super-s">en lugar de <s>${fp(lista)}</s> · ahorrás <strong>${fp(ahorroTotal)}</strong> (${ahorroTotalPct}% menos)</div>
    ${yaEsMejor ? `<div class="super-t">${finYa ? 'Válido hasta el ' + finYaTxt + ' · ' + quedaTxt : 'Precio especial por confirmar ya'}</div>` : ''}
    <div class="esc">${escalera}</div>
    <div class="super-g">
      <div><span>Pagás por cada $100 de mercadería</span><strong>$${porCada100}</strong></div>
      <div><span>Costo por unidad</span><strong>${fp(unidades ? Math.round(pBest / unidades) : 0)}</strong></div>
      ${(verGan && gBest > 0) ? `<div><span>Ganancia estimada</span><strong>${fp(gBest)}</strong></div>` : ''}
    </div>
  </div>` : '';

  const bloqueHero = persuasivo ? `<div class="hero">
    <div class="hero-tag">${yaEsMejor ? 'SÚPER PRECIO · OPORTUNIDAD IMPERDIBLE' : 'OPORTUNIDAD DE NEGOCIO'}</div>
    <div class="hero-t">${esc(l.pdfGancho || 'Un lote completo listo para revender y ganar')}</div>
    ${verGan ? `<div class="hero-nums">
      <div><span>Invertís desde</span><strong>${fp(pBest)}</strong></div>
      <div><span>Vale en reventa</span><strong>${fp(lista)}</strong></div>
      <div class="ok"><span>Ganancia estimada</span><strong>${fp(gBest)}</strong></div>
      <div class="ok"><span>Retorno</span><strong>${roiBest}%</strong></div>
    </div>` : ''}
  </div>` : '';

  const bloqueGraficos = persuasivo ? `<h2 class="sec">Los números, de un vistazo</h2>
  <div class="graf-grid">
    <div class="caja graf"><h3>Lo que pagás vs. lo que vale</h3>${grafPrecio}</div>
    ${verGan ? `<div class="caja graf verde"><h3>Cuánto ganás según lo que vendas</h3>${grafEsc}<div class="nota-g">Calculado sobre tu mejor precio (${fp(pBest)}).</div></div>` : ''}
    ${top.length > 1 ? `<div class="caja graf"><h3>Dónde está el valor del lote</h3>${grafTop}<div class="nota-g">% del valor total que aporta cada producto.</div></div>` : ''}
    ${verGan ? `<div class="caja graf dona-box"><h3>De cada $100 que revendés</h3><div class="dona-in">${dona}<div class="dona-txt">${margenPct} son <strong>ganancia</strong> y ${100 - margenPct} cubren lo que pagaste.</div></div></div>` : ''}
  </div>
  ${(verGan && grafRecupero) ? `<div class="caja graf verde"><h3>Recuperás tu inversión rápido (proyección ilustrativa a ${l.pdfDias} días)</h3>${grafRecupero}<div class="nota-g">Supone un ritmo de ventas constante hasta vender todo el lote en ${l.pdfDias} días. Es una estimación, no una garantía.</div></div>` : ''}
  ${ventajas.length ? `<h2 class="sec">Por qué conviene este lote</h2><div class="caja ventajas"><ul>${ventajas.map(v => `<li>${v}</li>`).join('')}</ul></div>` : ''}` : '';

  const bloqueCta = persuasivo ? `<div class="cta">
    <div class="cta-t">¿Lo reservamos? ${yaEsMejor ? (finYa ? 'El súper precio de ' + fp(pYa) + ' vence el ' + finYaTxt + '.' : 'Reservalo ya y quedate con el súper precio de ' + fp(pYa) + '.') : (vence ? 'El presupuesto vence el ' + fmtF(vence) + '.' : '')}</div>
    ${waFmt ? `<div class="cta-n">${esc(waFmt)}</div><a class="cta-b" href="${esc(waLinkPdf)}">Escribime por WhatsApp</a>` : ''}
  </div>` : '';


  // ── PDF premium: bloques nuevos (solo se suman; no reemplazan ningún bloque anterior) ──
  const refNum = 'CA-' + hoy.getFullYear() + String(hoy.getMonth() + 1).padStart(2, '0') + String(hoy.getDate()).padStart(2, '0') + '-' + String(Array.from(String(l.nombre || '')).reduce((a2, c2) => (a2 * 31 + c2.charCodeAt(0)) >>> 0, 7) % 10000).padStart(4, '0');
  const unicas = items.filter(i => i.cant === 1).length;
  const diasVig = vence ? Math.max(0, Math.ceil((vence.getTime() - hoy.getTime()) / 86400000)) : 0;
  const pctGanaBest = lista ? Math.round(gBest / lista * 100) : 0;
  const multiplo = (pBest && lista) ? (lista / pBest).toFixed(2).replace('.', ',') : '';

  const bloqueUnico = persuasivo ? `<div class="unico">
    <div class="unico-k">LOTE ÚNICO</div>
    <div class="unico-t">Una compra que se arma una sola vez</div>
    <div class="unico-g">
      <div><strong>${items.length}</strong><span>productos distintos</span></div>
      <div><strong>${unidades}</strong><span>unidades en total</span></div>
      ${unicas > 0 ? `<div><strong>${unicas}</strong><span>piezas de unidad única</span></div>` : ''}
      ${diasVig > 0 ? `<div class="gold"><strong>${diasVig}</strong><span>${diasVig === 1 ? 'día' : 'días'} de precio garantizado</span></div>` : ''}
    </div>
    <div class="unico-p">Sujeto a disponibilidad: una vez reservado, el lote deja de estar disponible para otros compradores.</div>
  </div>` : '';

  const bloqueGanando = (persuasivo && verGan && gBest > 0) ? `<div class="gana">
    <div class="gana-h">Al comprar este lote, ya estás ganando</div>
    <div class="gana-g">
      <div><span>En pesos</span><strong>${fp(gBest)}</strong></div>
      <div><span>Sobre el valor de reventa</span><strong>${pctGanaBest}%</strong></div>
      <div><span>Retorno sobre lo invertido</span><strong>${roiBest}%</strong></div>
    </div>
    <p>Pagás ${fp(pBest)} por mercadería con un valor de reventa estimado de ${fp(lista)}. Esa diferencia se genera en el momento en que comprás, antes de vender una sola pieza.</p>
  </div>` : '';

  const bloqueIndicadores = (persuasivo && verGan && equilibrio > 0 && equilibrio < 100) ? `<div class="kpi3">
    <div><span>Retorno sobre lo invertido</span><strong>+${roiBest}%</strong><em>Tu inversión se multiplica por ${multiplo}.</em></div>
    <div><span>Punto de equilibrio</span><strong>${equilibrio}% del lote</strong><em>Con esa parte vendida ya recuperás lo que pagaste.</em></div>
    <div><span>Margen de seguridad</span><strong>${100 - equilibrio}%</strong><em>Cuánto puede bajar el precio de reventa antes de empatar.</em></div>
  </div>` : '';

  const resist = [0, 10, 20, 30].map(d => { const ing = Math.round(lista * (100 - d) / 100); const rs = ing - pBest; return { d, ing, rs, rend: pBest ? Math.round(rs / pBest * 100) : 0 }; });
  const aguanta = resist.filter(r => r.d > 0 && r.rs > 0).map(r => r.d);
  const maxAg = aguanta.length ? Math.max(...aguanta) : 0;
  const bloqueResistencia = (persuasivo && verGan && pBest > 0) ? `<h2 class="sec">¿Y si el mercado paga menos?</h2>
  <div class="caja graf">
    <table class="mini"><thead><tr><th>Escenario</th><th class="r">Ingreso por reventa</th><th class="r">Resultado</th><th class="r">Rendimiento</th></tr></thead><tbody>
    ${resist.map(r => `<tr${r.d === 0 ? ' class="base"' : ''}><td>${r.d === 0 ? 'Revendés a valor de lista' : 'Revendés ' + r.d + '% más barato'}</td><td class="r">${fp(r.ing)}</td><td class="r ${r.rs >= 0 ? 'pos' : 'neg'}">${r.rs >= 0 ? '+ ' : '− '}${fp(Math.abs(r.rs))}</td><td class="r ${r.rs >= 0 ? 'pos' : 'neg'}">${r.rend}%</td></tr>`).join('')}
    </tbody></table>
    <div class="nota-g">${maxAg ? 'Aun revendiendo ' + maxAg + '% más barato, el lote deja ganancia. ' : ''}Escenarios ilustrativos calculados sobre tu mejor precio; no constituyen una garantía.</div>
  </div>` : '';

  const bloqueSimple = persuasivo ? `<h2 class="sec">Así de simple</h2>
  <div class="pasos">
    <div><b>1</b><h4>Reservás el lote completo</h4>${pBest ? `<p class="n">${fp(pBest)}</p>` : ''}</div>
    <div class="flecha">→</div>
    <div><b>2</b><h4>Lo revendés, cerrado o por partes</h4>${(verGan && lista) ? `<p class="n">${fp(lista)}</p>` : ''}</div>
    <div class="flecha">→</div>
    <div class="ok"><b>3</b><h4>Te quedás la diferencia</h4>${(verGan && gBest > 0) ? `<p class="n">${fp(gBest)}</p>` : ''}</div>
  </div>` : '';

  const confianzaItems = [
    ['Listado completo', `${items.length} productos y ${unidades} unidades${(l.pdfFotos !== false && items.every(i => i.foto)) ? ', cada uno fotografiado' : ''}.`],
    ['Un solo trato', 'Una sola compra y un solo retiro, sin armar pedidos.']
  ];
  if (vence) confianzaItems.push(['Precio garantizado', 'Vigente hasta el ' + fmtF(vence) + '.']);
  if (waFmt) confianzaItems.push(['Atención directa', 'Por WhatsApp al ' + waFmt + '.']);
  const bloqueConfianza = persuasivo ? `<div class="conf">${confianzaItems.map(c => `<div><strong>${esc(c[0])}</strong><span>${c[1]}</span></div>`).join('')}</div>` : '';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<title>Presupuesto - ${esc(l.nombre)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111827; font-size:12px; line-height:1.45; margin:0; padding:16px; }
  .barra { display:flex; gap:10px; justify-content:center; margin-bottom:16px; }
  .barra button { padding:10px 18px; border:0; border-radius:8px; background:#4f46e5; color:#fff; font-size:14px; font-weight:700; cursor:pointer; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #4f46e5; padding-bottom:10px; margin-bottom:14px; }
  .marca { font-size:22px; font-weight:800; color:#4f46e5; }
  .doc { text-align:right; }
  .doc h1 { margin:0; font-size:16px; letter-spacing:1px; }
  .muted { color:#6b7280; }
  h2 { font-size:15px; margin:0 0 4px; }
  table { width:100%; border-collapse:collapse; margin:10px 0 14px; }
  th { background:#eef2ff; color:#3730a3; font-size:10.5px; text-transform:uppercase; letter-spacing:.4px; text-align:left; padding:7px 8px; }
  td { padding:6px 8px; border-bottom:1px solid #e5e7eb; vertical-align:middle; }
  thead { display:table-header-group; }
  tr { page-break-inside:avoid; }
  .c { text-align:center; } .r { text-align:right; }
  td img { width:46px; height:46px; object-fit:cover; border-radius:6px; display:block; margin:auto; }
  .tot { margin-left:auto; width:340px; }
  .tot div { display:flex; justify-content:space-between; padding:4px 0; }
  .tot .big { border-top:2px solid #4f46e5; margin-top:4px; padding-top:8px; font-size:17px; font-weight:800; color:#4f46e5; }
  .caja { border:1px solid #c7d2fe; background:#f5f7ff; border-radius:8px; padding:10px 12px; margin:10px 0; page-break-inside:avoid; }
  .ya { border-color:#f59e0b; background:#fffbeb; }
  .verde { border-color:#86efac; background:#f0fdf4; }
  .pie { margin-top:18px; font-size:10.5px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:8px; }
  @media print { .barra { display:none; } body { padding:0; } }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hero { background:linear-gradient(135deg,#4338ca,#7c3aed); color:#fff; border-radius:12px; padding:16px 18px; margin-bottom:16px; page-break-inside:avoid; }
  .hero-tag { font-size:10px; letter-spacing:2px; opacity:.85; font-weight:700; }
  .hero-t { font-size:20px; font-weight:800; line-height:1.25; margin:4px 0 12px; }
  .hero-nums { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  .hero-nums div { background:rgba(255,255,255,.14); border-radius:8px; padding:8px; text-align:center; }
  .hero-nums span { display:block; font-size:9.5px; text-transform:uppercase; letter-spacing:.5px; opacity:.9; }
  .hero-nums strong { display:block; font-size:16px; margin-top:2px; }
  .hero-nums .ok { background:#10b981; }
  h2.sec { margin:16px 0 6px; font-size:15px; color:#3730a3; break-after:avoid; page-break-after:avoid; }
  .graf, .ventajas { break-inside:avoid; page-break-inside:avoid; }
  .graf-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .graf h3 { margin:0 0 8px; font-size:12px; color:#3730a3; }
  .gb { margin-bottom:7px; }
  .gb-t { display:flex; justify-content:space-between; gap:8px; font-size:11px; }
  .gb-bar { height:10px; background:#e5e7eb; border-radius:6px; overflow:hidden; margin-top:2px; }
  .gb-bar div { height:100%; border-radius:6px; }
  .nota-g { font-size:9.5px; color:#6b7280; margin-top:4px; }
  .dona-in { display:flex; align-items:center; gap:10px; }
  .dona-txt { font-size:12px; }
  .ventajas ul { margin:0; padding-left:18px; }
  .ventajas li { margin:4px 0; }
  .cta { background:#111827; color:#fff; border-radius:12px; padding:16px; text-align:center; margin:16px 0 4px; page-break-inside:avoid; }
  .cta-t { font-size:15px; font-weight:700; }
  .cta-n { font-size:26px; font-weight:800; margin:6px 0; color:#34d399; }
  .cta-b { display:inline-block; background:#25d366; color:#fff; text-decoration:none; font-weight:700; padding:8px 18px; border-radius:999px; }
  @media (max-width:640px) { .hero-nums { grid-template-columns:1fr 1fr; } .graf-grid { grid-template-columns:1fr; } }
</style>
<style>
  /* ═══ CAPA PREMIUM (se suma al CSS anterior; sobrescribe solo lo visual) ═══ */
  :root { --navy:#0f172a; --navy2:#1e3a8a; --gold:#2563eb; --goldl:#93c5fd; --ink:#0f172a; --mut:#64748b; --line:#e2e8f0; --ok:#047857; }
  body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--ink); font-size:11.5px; line-height:1.5; }
  .barra button { background:var(--navy); }
  .head { background:linear-gradient(135deg,var(--navy),var(--navy2)); color:#fff; border:0; border-radius:14px; padding:20px 24px; margin-bottom:0; align-items:center; }
  .head + .hero { border-radius:0 0 14px 14px; }
  .head:has(+ .hero) { border-radius:14px 14px 0 0; }
  .marca { color:#fff; font-size:24px; font-weight:700; letter-spacing:-.2px; }
  .head .muted { color:#aebbd6; font-size:10.5px; margin-top:2px; }
  .doc h1 { font-size:11px; font-weight:600; letter-spacing:3px; color:var(--goldl); }
  .doc div { color:#dbe4f5; font-size:10.5px; }
  .doc strong { color:#fff; font-weight:600; }
  .doc .ref { letter-spacing:1px; color:#aebbd6; }
  .doc .pill { display:inline-block; margin-top:6px; padding:2px 10px; border:1px solid var(--gold); color:var(--goldl); border-radius:999px; font-size:9px; font-weight:600; letter-spacing:2px; }
  .hero { background:linear-gradient(135deg,var(--navy),var(--navy2)); padding:6px 24px 22px; margin-bottom:58px; border-radius:0 0 14px 14px; }
  .hero-tag { color:var(--goldl); font-weight:600; letter-spacing:3px; opacity:1; }
  .hero-t { font-size:22px; font-weight:700; letter-spacing:-.3px; margin:6px 0 14px; max-width:92%; }
  .hero-nums { margin-bottom:-52px; gap:10px; }
  .hero-nums div { background:#fff; color:var(--ink); border:1px solid var(--line); border-radius:10px; padding:10px 8px; box-shadow:0 4px 14px rgba(11,27,58,.18); }
  .hero-nums span { color:var(--mut); opacity:1; font-size:8.5px; letter-spacing:1px; font-weight:500; }
  .hero-nums strong { color:var(--navy); font-size:17px; font-weight:700; }
  .hero-nums .ok { background:#ecfdf5; border-color:#a7f3d0; }
  .hero-nums .ok strong { color:var(--ok); }
  h2 { color:var(--navy); font-size:14px; font-weight:700; letter-spacing:-.1px; }
  h2.sec { font-size:12px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:var(--navy); padding-left:0; margin:20px 0 8px; }
  th { background:#f1f5f9; color:#334155; font-size:9px; font-weight:600; letter-spacing:1px; border-bottom:1.5px solid var(--navy); }
  td { border-bottom:1px solid #eef2f7; }
  tbody tr:nth-child(even) td { background:#fafbfd; }
  td img { width:44px; height:44px; border-radius:8px; border:1px solid var(--line); }
  .tot .big { border-top:1px solid var(--line); color:var(--navy); font-weight:700; letter-spacing:.3px; }
  .caja { border:1px solid var(--line); background:#f8fafc; border-radius:10px; }
  .verde { border-color:#a7f3d0; background:#f0fdf4; }
  .ya { border-color:#bfdbfe; background:#eff6ff; }
  .graf h3 { color:var(--navy); font-weight:600; font-size:11px; letter-spacing:.3px; }
  .gb-bar { height:8px; background:#e8edf4; }
  .gb-t { font-size:10.5px; } .gb-t strong { font-weight:600; }
  .cta { background:linear-gradient(135deg,var(--navy),var(--navy2)); border-radius:14px; padding:20px; }
  .cta-t { font-weight:600; letter-spacing:.3px; }
  .cta-n { color:var(--goldl); font-weight:700; letter-spacing:1px; }
  .cta-b { background:var(--gold); color:#fff; font-weight:600; letter-spacing:.5px; border-radius:8px; padding:9px 22px; }
  .pie { color:var(--mut); font-size:9.5px; }
  /* Colores y pesos al estilo del PDF de repuestos */
  .hero-nums div:nth-child(1) strong { color:#c2410c; }
  .hero-nums div:nth-child(2) strong { color:#2563eb; }
  .hero-nums strong, .kpi3 strong, .gana-g strong, .unico-g strong, .pasos .n, .marca { font-weight:800; }
  .hero-t, .gana-h, .unico-t, .cta-t { font-weight:800; }
  .cta-n { color:#93c5fd; }
  .pasos > div:nth-child(1) .n { color:#c2410c; } .pasos > div:nth-child(3) .n { color:#2563eb; }

  /* Bloques nuevos */
  .unico { border:1px solid #bfdbfe; background:linear-gradient(180deg,#f8fbff,#eff6ff); border-radius:12px; padding:14px 18px; margin:0 0 14px; page-break-inside:avoid; break-inside:avoid; text-align:center; }
  .unico-k { font-size:9px; letter-spacing:3px; font-weight:600; color:var(--gold); }
  .unico-t { font-size:16px; font-weight:700; color:var(--navy); margin:3px 0 10px; letter-spacing:-.2px; }
  .unico-g { display:flex; justify-content:center; gap:26px; flex-wrap:wrap; }
  .unico-g div { min-width:90px; }
  .unico-g strong { display:block; font-size:22px; font-weight:700; color:var(--navy); line-height:1.1; }
  .unico-g .gold strong { color:var(--gold); }
  .unico-g span { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:var(--mut); }
  .unico-p { margin-top:10px; font-size:10px; color:#475569; }
  .gana { background:linear-gradient(135deg,#065f46,#16a34a); color:#fff; border-radius:12px; padding:14px 18px; margin:0 0 14px; page-break-inside:avoid; break-inside:avoid; }
  .gana-h { font-size:15px; font-weight:700; letter-spacing:-.2px; margin-bottom:10px; }
  .gana-g { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .gana-g div { background:rgba(255,255,255,.14); border-radius:8px; padding:8px 10px; }
  .gana-g span { display:block; font-size:8.5px; text-transform:uppercase; letter-spacing:.9px; opacity:.9; }
  .gana-g strong { display:block; font-size:18px; font-weight:700; margin-top:2px; }
  .gana p { margin:10px 0 0; font-size:10.5px; opacity:.95; }
  .kpi3 { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0; page-break-inside:avoid; break-inside:avoid; }
  .kpi3 div { border:1px solid var(--line); border-radius:10px; padding:10px 12px; background:#fff; }
  .kpi3 span { display:block; font-size:8.5px; text-transform:uppercase; letter-spacing:1px; color:var(--mut); font-weight:500; }
  .kpi3 strong { display:block; font-size:20px; font-weight:700; color:var(--navy); margin:2px 0; }
  .kpi3 em { display:block; font-style:normal; font-size:9.5px; color:var(--mut); }
  table.mini { margin:2px 0 6px; } table.mini td { padding:5px 8px; font-size:10.5px; } table.mini tr.base td { background:#f1f5f9; font-weight:600; }
  .pos { color:var(--ok); font-weight:600; } .neg { color:#b91c1c; font-weight:600; }
  .pasos { display:grid; grid-template-columns:1fr 20px 1fr 20px 1fr; align-items:stretch; gap:6px; margin:6px 0 14px; page-break-inside:avoid; break-inside:avoid; }
  .pasos > div:not(.flecha) { border:1px solid var(--line); border-radius:10px; padding:10px 12px; background:#fff; }
  .pasos .ok { border-color:#a7f3d0; background:#f0fdf4; }
  .pasos b { display:inline-block; width:20px; height:20px; line-height:20px; text-align:center; border-radius:50%; background:var(--navy); color:#fff; font-size:10px; font-weight:600; }
  .pasos h4 { margin:6px 0 2px; font-size:11px; font-weight:600; color:var(--navy); }
  .pasos .n { margin:0; font-size:14px; font-weight:700; color:var(--navy); } .pasos .ok .n { color:var(--ok); }
  .pasos .flecha { display:flex; align-items:center; justify-content:center; color:var(--gold); font-size:16px; }
  .conf { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:6px 0 14px; page-break-inside:avoid; break-inside:avoid; }
  .conf div { padding:2px 0; }
  .conf strong { display:block; font-size:10.5px; font-weight:600; color:var(--navy); }
  .conf span { display:block; font-size:9.5px; color:var(--mut); }
  /* Súper precio (misma paleta del PDF) */
  .super { background:linear-gradient(135deg,var(--navy),var(--navy2)); color:#fff; border-radius:14px; padding:18px 22px; margin:0 0 14px; text-align:center; page-break-inside:avoid; break-inside:avoid; }
  .super-k { font-size:10px; letter-spacing:3px; font-weight:700; color:var(--goldl); }
  .super-p { font-size:40px; font-weight:800; letter-spacing:-1px; line-height:1.1; margin:6px 0 2px; }
  .super-s { font-size:12px; color:#dbe4f5; }
  .super-s s { color:#fca5a5; }
  .super-s strong { color:#6ee7b7; }
  .super-t { display:inline-block; margin-top:8px; padding:3px 14px; border:1px solid var(--goldl); color:var(--goldl); border-radius:999px; font-size:10px; font-weight:700; letter-spacing:1px; }
  .esc { margin:14px 0 10px; text-align:left; }
  .esc-row { display:flex; justify-content:space-between; gap:10px; padding:6px 10px; border-radius:8px; font-size:11px; background:rgba(255,255,255,.08); margin-bottom:4px; }
  .esc-row strong { font-weight:700; } .esc-row s { color:#fca5a5; }
  .esc-row.esc-best { background:#fff; color:var(--navy); } .esc-row.esc-best b { background:var(--ok); color:#fff; font-size:8.5px; letter-spacing:1px; padding:1px 7px; border-radius:999px; margin-left:6px; }
  .super-g { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; }
  .super-g div { background:rgba(255,255,255,.12); border-radius:8px; padding:8px; }
  .super-g span { display:block; font-size:8.5px; text-transform:uppercase; letter-spacing:.8px; opacity:.9; }
  .super-g strong { display:block; font-size:16px; font-weight:800; margin-top:2px; }
  tr.ya-row td { background:#eff6ff; }
  .tot .big.ya-tot { border-top:0; margin-top:0; color:var(--ok); }
  @media (max-width:640px) { .gana-g, .kpi3 { grid-template-columns:1fr; } .pasos { grid-template-columns:1fr; } .pasos .flecha { display:none; } }
</style></head><body>
<div class="barra"><button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button></div>
<div class="head">
  <div><div class="marca">${esc(tienda)}</div>${wa ? `<div class="muted">WhatsApp: +${esc(wa)}</div>` : ''}</div>
  <div class="doc"><h1>PRESUPUESTO DE LOTE</h1>
    <div class="ref">N.º ${refNum}</div>
    <div>Fecha: ${fmtF(hoy)}</div>
    ${vence ? `<div>Válido hasta: <strong>${fmtF(vence)}</strong></div>` : ''}
    ${l.cliente ? `<div>Para: <strong>${esc(l.cliente)}</strong></div>` : ''}
    ${persuasivo ? '<div class="pill">LOTE ÚNICO</div>' : ''}
  </div>
</div>
${bloqueHero}
${bloqueSuper}
${bloqueUnico}
${bloqueGanando}
<h2>${esc(l.nombre)}</h2>
${l.descripcion ? `<div class="muted" style="white-space:pre-line">${esc(l.descripcion)}</div>` : ''}
<table>
  <thead><tr><th class="c">#</th>${conFotos ? '<th class="c">Foto</th>' : ''}<th>Producto</th><th class="c">Cant.</th><th class="r">Valor c/u</th><th class="r">Subtotal</th></tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="tot">
  <div><span>Total de unidades</span><span>${unidades}</span></div>
  <div><span>Valor total de los productos</span><span>${fp(lista)}</span></div>
  ${ahorroLote > 0 ? `<div><span>Descuento por llevar el lote completo</span><span>− ${fp(ahorroLote)}${lista ? ' (' + Math.round(ahorroLote / lista * 100) + '%)' : ''}</span></div>` : ''}
  <div class="big"><span>PRECIO DEL LOTE</span><span>${fp(precio)}</span></div>
  ${yaVigente ? `<div class="big ya-tot"><span>SÚPER PRECIO (confirmando ya)</span><span>${fp(pYa)}</span></div>` : ''}
  <div class="muted"><span>Costo promedio por unidad</span><span>${fp(unidades ? Math.round(precio / unidades) : 0)}</span></div>
</div>
${(yaVigente && !mostrarSuper) ? `<div class="caja ya"><strong>Súper precio si confirmás ya${finYaTxt ? ' (antes del ' + finYaTxt + ')' : ''}:</strong> ${fp(pYa)}</div>` : ''}
${(condiciones || yaVigente) ? `<h2 style="margin-top:14px">Formas de pago y descuentos</h2>
<table><thead><tr><th>Condición</th><th class="c">Descuento</th><th class="r">Precio final</th><th class="r">Ahorrás</th></tr></thead><tbody>${yaVigente ? `<tr class="ya-row"><td><strong>Súper precio si confirmás ya${finYaTxt ? ' (hasta el ' + finYaTxt + ')' : ''}</strong></td><td class="c">− ${descYaPct}%</td><td class="r"><strong>${fp(pYa)}</strong></td><td class="r">${precio - pYa > 0 ? fp(precio - pYa) : '—'}</td></tr>` : ''}${condiciones}</tbody></table>` : ''}
${(l.pdfGanancia !== false && lista > 0) ? `<div class="caja verde"><strong>Potencial de reventa:</strong> vendiendo los productos a su valor (${fp(lista)}) y pagando el lote ${fp(precio)}, el margen estimado es de <strong>${fp(ganancia)}</strong> (${roi}% sobre lo invertido).${pBest < precio ? ' Con tu mejor precio (' + (yaEsMejor ? 'súper precio ' : '') + fp(pBest) + ') el margen asciende a <strong>' + fp(gBest) + '</strong> (' + roiBest + '%).' : ''} Aun vendiendo solo al 70% del valor, con tu mejor precio el resultado estimado sería de <strong>${fp(Math.max(0, Math.round(lista * 0.7 - pBest)))}</strong>.</div>` : ''}
${bloqueGraficos}
${bloqueIndicadores}
${bloqueResistencia}
${bloqueSimple}
${bloqueConfianza}
${l.entrega ? `<div class="caja"><strong>Retiro / entrega:</strong> ${esc(l.entrega)}</div>` : ''}
${l.notasPdf ? `<div class="caja"><strong>Condiciones:</strong><div style="white-space:pre-line">${esc(l.notasPdf)}</div></div>` : ''}
${bloqueCta}
<div class="pie">Los valores de reventa son estimaciones y pueden variar según la zona y el canal de venta. Los productos se entregan en el estado en que se encuentran, tal como se describe/fotografía. Presupuesto sujeto a disponibilidad.</div>
<script>(function(){ var hecho=false; function ir(){ if(hecho) return; hecho=true; setTimeout(function(){ window.print(); }, 300); }
  var f=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();
  var im=Array.prototype.map.call(document.images,function(i){ return i.complete?Promise.resolve():new Promise(function(r){ i.onload=i.onerror=r; }); });
  Promise.all([f].concat(im)).then(ir,ir); setTimeout(ir,6000); })();<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana del PDF. Permití las ventanas emergentes para este sitio y probá de nuevo.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}


// ════════════════════════════════════════════════
// CATÁLOGO COMPLETO DEL LOTE (PDF)
// Un producto por página: todas las fotos + todos los datos
// (misma info que se ve al tocar "Ver" en un producto)
// ════════════════════════════════════════════════
function catalogoDesdeFormLote() {
  const err = document.getElementById('lote-error');
  err.classList.add('hidden');
  const d = datosDesdeFormLote();
  if (!d.items.length) { mostrarError(err, 'Agregá productos al lote antes de generar el catálogo.'); return; }
  if (!d.nombre) d.nombre = 'Lote de productos';
  generarCatalogoLote(d);
}

function fotoCatalogo(url, w, q) {
  if (!url) return '';
  return url.includes('res.cloudinary.com') && url.includes('/upload/')
    ? url.replace('/upload/', '/upload/w_' + w + ',q_' + (q || 'auto') + ',f_jpg/') : url;
}

function generarCatalogoLote(l) {
  if (!l) return;
  const m = l.moneda || 'ARS';
  const fp = n => formatPrecio(n, m);
  const items = l.items || [];
  const tienda = config.nombre || 'Comprá Aquí';
  const wa = String(l.pdfWa || '').replace(/\D/g, '');
  const hoy = new Date().toLocaleDateString('es-AR');
  const unidades = items.reduce((a, i) => a + (Number(i.cant) || 0), 0);
  const op = Object.assign({ fotos:true, cantidad:true, precios:true, ref:true, specs:true, desc:true, notas:true, tema:'claro', calidad:'media' }, l.catOpc || {});

  const CAL = { alta:{ w:900, w1:1400, q:'auto' }, media:{ w:700, w1:1000, q:70 }, liviana:{ w:500, w1:750, q:55 } };
  const cal = CAL[op.calidad] || CAL.media;
  const oscuro = op.tema === 'oscuro';
  const cssOscuro = oscuro ? `
  html, body { background:#080c14; color:#e2e8f0; }
  .portada, .prod-head { border:1px solid rgba(147,197,253,.18); }
  .portada .nums div { background:#0d1220; border:1px solid rgba(99,102,241,.28); }
  .portada .nums span { color:#94a3b8; }
  .portada .nums strong { color:#93c5fd; }
  .prod-head .num { background:rgba(255,255,255,.14); color:#fff; }
  .precios div { background:#0d1220; border-color:rgba(255,255,255,.08); }
  .precios .azul { background:rgba(37,99,235,.2); border-color:#1e40af; }
  .precios span, .specs span { color:#94a3b8; }
  .precios strong { color:#93c5fd; }
  .tach { color:#f87171 !important; }
  .foto-grid div { background:#05070d; }
  .specs div, .txt { background:#0d1220; border-color:rgba(255,255,255,.08); }
  .specs strong { color:#f1f5f9; }
  .txt h4 { color:#93c5fd; }
  .txt div { color:#cbd5e1; }
  .nota { background:rgba(37,99,235,.16); border-color:#1e40af; color:#dbe4f5; }
  .cierre { background:#0d1220; border:1px solid rgba(147,197,253,.18); }
  .pie { color:#64748b; padding:0 12mm 12mm; }
  @page { size:A4; margin:0; }
  @media print {
    .portada { margin:12mm; min-height:271mm; }
    .prod { padding:12mm; min-height:295mm; }
    .cierre { margin:12mm; }
  }
  @media screen { .prod { margin-bottom:16px; } }
  ` : '';

  const paginas = items.map((it, n) => {
    const p = it.productoId ? productosCache.find(x => x.id === it.productoId) : null;
    const nombre = (p && p.nombre) || it.nombre || 'Producto';
    let fotos = ((p && p.fotos) || []).filter(Boolean);
    if (!fotos.length && it.foto) fotos = [it.foto];
    const mp = (p && p.moneda) || m;

    const specs = (op.specs && p) ? [
      ['Categoría', p.categoria], ['Estado', p.estado], ['Condición', p.condicion],
      ['Medidas', p.medidas], ['Peso', p.peso ? p.peso + ' kg' : ''], ['¿Se desarma?', p.desarma],
      ['Tipo', p.color], ['Color', p.colorProd], ['Material', p.materialProd],
      ['Cantidad disponible', p.cantidad]
    ].filter(x => x[1]) : [];

    const grilla = (op.fotos && fotos.length)
      ? `<div class="foto-grid g${Math.min(fotos.length, 3)}">${fotos.map(f => `<div><img src="${esc(fotoCatalogo(f, fotos.length === 1 ? cal.w1 : cal.w, cal.q))}" alt=""></div>`).join('')}</div>` : '';

    const precios = [];
    if (op.cantidad) precios.push(`<div><span>En el lote</span><strong>${it.cant} u.</strong></div>`);
    if (op.precios && it.reventa) {
      precios.push(`<div><span>Valor c/u</span><strong>${fp(it.reventa)}</strong></div>`);
      precios.push(`<div class="azul"><span>Subtotal</span><strong>${fp(it.cant * it.reventa)}</strong></div>`);
    }
    if (op.ref && p && p.precioAnterior) precios.push(`<div><span>Precio de referencia</span><strong class="tach">${formatPrecio(p.precioAnterior, mp)}</strong></div>`);

    const bloques = [];
    if (op.desc && p && p.exclusivo && p.mostrarExclusivo === true) bloques.push(`<div class="nota"><strong>Exclusivo</strong> solo ${esc(p.exclusivo)} ${Number(p.exclusivo) === 1 ? 'unidad' : 'unidades'} en el mundo.</div>`);
    if (op.desc && p && p.descripcion) bloques.push(`<div class="txt"><h4>Descripción</h4><div>${esc(p.descripcion)}</div></div>`);
    if (op.notas && p && p.notas) bloques.push(`<div class="txt"><h4>Notas</h4><div>${esc(p.notas)}</div></div>`);
    if (op.desc && p && p.paraVos && p.mostrarParaVos === true) bloques.push(`<div class="txt"><h4>Esto es para vos si...</h4><div>${esc(p.paraVos)}</div></div>`);
    if (op.desc && p && p.testimonio && p.mostrarHistoria === true) bloques.push(`<div class="txt"><h4>Historia</h4><div>${esc(p.testimonio)}</div></div>`);

    return `<section class="prod">
      <div class="prod-head"><span class="num">${n + 1}</span><h2>${esc(nombre)}</h2></div>
      ${precios.length ? `<div class="precios">${precios.join('')}</div>` : ''}
      ${grilla}
      ${specs.length ? `<div class="specs">${specs.map(s => `<div><span>${s[0]}</span><strong>${esc(s[1])}</strong></div>`).join('')}</div>` : ''}
      ${bloques.join('')}
    </section>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<title>Catálogo - ${esc(l.nombre)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  :root { --navy:#0f172a; --navy2:#1e3a8a; --ink:#0f172a; --mut:#64748b; --line:#e2e8f0; }
  body { font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--ink); font-size:11.5px; line-height:1.5; margin:0; padding:16px; }
  .barra { display:flex; justify-content:center; margin-bottom:16px; }
  .barra button { padding:10px 18px; border:0; border-radius:8px; background:var(--navy2); color:#fff; font-size:14px; font-weight:700; cursor:pointer; }
  .portada { background:linear-gradient(135deg,var(--navy),var(--navy2)); color:#fff; border-radius:14px; padding:28px 28px 30px; margin-bottom:16px; page-break-after:always; break-after:page; min-height:250mm; display:flex; flex-direction:column; justify-content:center; }
  .portada .k { font-size:11px; letter-spacing:3px; font-weight:600; color:#93c5fd; }
  .portada h1 { font-size:34px; font-weight:800; line-height:1.15; margin:10px 0 8px; letter-spacing:-.5px; }
  .portada .s { font-size:14px; color:#dbe4f5; }
  .portada .nums { display:flex; gap:12px; margin-top:26px; }
  .portada .nums div { background:#fff; color:var(--ink); border-radius:10px; padding:12px 18px; }
  .portada .nums span { display:block; font-size:9px; text-transform:uppercase; letter-spacing:1px; color:var(--mut); }
  .portada .nums strong { font-size:22px; font-weight:800; color:var(--navy2); }
  .portada .d { margin-top:22px; font-size:12px; color:#aebbd6; white-space:pre-line; }
  .prod { page-break-before:always; break-before:page; }
  .portada + .prod { page-break-before:auto; break-before:auto; }
  .prod-head { display:flex; align-items:center; gap:12px; background:linear-gradient(135deg,var(--navy),var(--navy2)); color:#fff; border-radius:12px; padding:12px 16px; margin-bottom:10px; break-after:avoid; }
  .prod-head .num { background:#fff; color:var(--navy2); font-weight:800; border-radius:8px; min-width:34px; height:34px; display:flex; align-items:center; justify-content:center; padding:0 8px; }
  .prod-head h2 { margin:0; font-size:19px; font-weight:800; letter-spacing:-.2px; }
  .precios { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; margin-bottom:10px; }
  .precios div { border:1px solid var(--line); border-radius:10px; padding:8px 10px; background:#fff; }
  .precios .azul { background:#eff6ff; border-color:#bfdbfe; }
  .precios span, .specs span { display:block; font-size:8.5px; text-transform:uppercase; letter-spacing:1px; color:var(--mut); font-weight:500; }
  .precios strong { font-size:15px; font-weight:800; color:var(--navy2); }
  .tach { text-decoration:line-through; color:#dc2626 !important; }
  .foto-grid { display:grid; gap:8px; margin-bottom:10px; }
  .foto-grid.g1 { grid-template-columns:1fr; }
  .foto-grid.g2 { grid-template-columns:1fr 1fr; }
  .foto-grid.g3 { grid-template-columns:repeat(3,1fr); }
  .foto-grid div { background:#f1f5f9; border-radius:10px; overflow:hidden; break-inside:avoid; }
  .foto-grid.g1 div { aspect-ratio:16/10; }
  .foto-grid.g2 div { aspect-ratio:4/3; }
  .foto-grid.g3 div { aspect-ratio:1/1; }
  .foto-grid img { width:100%; height:100%; object-fit:contain; display:block; }
  .specs { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:10px; }
  .specs div { border:1px solid var(--line); border-radius:10px; padding:8px 10px; background:#f8fafc; break-inside:avoid; }
  .specs strong { font-size:12px; font-weight:600; }
  .txt { border:1px solid var(--line); background:#f8fafc; border-radius:10px; padding:10px 12px; margin-bottom:8px; break-inside:avoid; }
  .txt h4 { margin:0 0 4px; font-size:9.5px; text-transform:uppercase; letter-spacing:1px; color:var(--navy2); font-weight:700; }
  .txt div { white-space:pre-wrap; word-break:break-word; color:#334155; }
  .nota { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:8px 12px; margin-bottom:8px; }
  .cierre { page-break-before:always; break-before:page; background:#0f172a; color:#fff; border-radius:14px; padding:26px; text-align:center; }
  .cierre h3 { margin:0 0 6px; font-size:20px; font-weight:800; }
  .cierre .n { font-size:28px; font-weight:800; color:#93c5fd; margin:6px 0; }
  .cierre a { display:inline-block; background:#25d366; color:#fff; text-decoration:none; font-weight:700; padding:9px 20px; border-radius:999px; }
  .pie { margin-top:12px; font-size:9.5px; color:var(--mut); }
  @media print { .barra { display:none; } body { padding:0; } }
${cssOscuro}</style></head><body>
<div class="barra"><button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button></div>
<div class="portada">
  <div class="k">CATÁLOGO COMPLETO</div>
  <h1>${esc(l.nombre)}</h1>
  <div class="s">${esc(tienda)}${l.cliente ? ' · Para ' + esc(l.cliente) : ''} · ${hoy}</div>
  <div class="nums">
    <div><span>Productos</span><strong>${items.length}</strong></div>
    <div><span>Unidades</span><strong>${unidades}</strong></div>
  </div>
  ${l.descripcion ? `<div class="d">${esc(l.descripcion)}</div>` : ''}
</div>
${paginas}
${wa ? `<div class="cierre"><h3>¿Te interesa este lote?</h3><div class="n">+${esc(wa)}</div><a href="https://wa.me/${esc(wa)}?text=${encodeURIComponent('Hola! Vi el catálogo del lote "' + l.nombre + '" y me interesa.')}">Escribime por WhatsApp</a></div>` : ''}
<div class="pie">Los productos se entregan en el estado en que se encuentran, tal como se describe y fotografía. Sujeto a disponibilidad.</div>
<script>(function(){ var hecho=false; function ir(){ if(hecho) return; hecho=true; setTimeout(function(){ window.print(); }, 300); }
  var f=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();
  var im=Array.prototype.map.call(document.images,function(i){ return i.complete?Promise.resolve():new Promise(function(r){ i.onload=i.onerror=r; }); });
  Promise.all([f].concat(im)).then(ir,ir); setTimeout(ir,15000); })();<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('El navegador bloqueó la ventana del PDF. Permití las ventanas emergentes para este sitio y probá de nuevo.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
