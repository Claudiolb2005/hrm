var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const m = request.method;
    const C = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    };
    if (m === "OPTIONS") return new Response(null, { headers: C });
    try {
      if (p === "/api/login" && m === "POST") return await doLogin(request, env, C);
      if (p === "/api/me") return await doMe(request, env, C);
      if (p === "/api/logout" && m === "POST") return await doLogout(request, env, C);
      if (p === "/api/forgot-password" && m === "POST") return await doForgotPassword(request, env, C);
      if (p === "/api/recover" && m === "POST") return await doRecover(request, env, C);
      if (p.startsWith("/api/")) {
        const u = await auth(request, env);
        if (!u) return J({ error: "No autorizado" }, 401, C);
        if (p === "/api/reset-password" && m === "POST") return await apiResetPassword(request, env, u, C);
        if (p === "/api/empresas" && m === "GET") return await apiEmpresas(env, u, C);
        if (p === "/api/empresas" && m === "POST") return await apiCrearEmpresa(request, env, u, C);
        if (p === "/api/usuarios" && m === "GET") return await apiUsuarios(env, u, C);
        if (p === "/api/usuarios" && m === "POST") return await apiCrearUsuario(request, env, u, C);
        if (p === "/api/periodos" && m === "GET") return await apiPeriodos(request, env, u, C);
        if (p === "/api/periodos" && m === "POST") return await apiCrearPeriodo(request, env, u, C);
        if (p === "/api/upload" && m === "POST") return await apiUpload(request, env, u, C);
        if (p === "/api/procesar-informe" && m === "POST") return await apiProcesarInforme(request, env, u, C);
        if (p === "/api/documentos") return await apiDocs(request, env, u, C);
        if (p === "/api/reportes" && m === "GET") return await apiReportes(request, env, u, C);
        if (p === "/api/reportes" && m === "POST") return await apiGuardarReporte(request, env, u, C);
        if (p === "/api/mapeo" && m === "GET") return await apiGetMapeo(request, env, u, C);
        if (p === "/api/mapeo" && m === "POST") return await apiSaveMapeo(request, env, u, C);
        if (p === "/api/mapeo" && m === "DELETE") return await apiDeleteMapeo(request, env, u, C);
        if (p === "/api/bases-isn" && m === "GET") return await apiGetBases(request, env, u, C);
        if (p === "/api/bases-isn" && m === "POST") return await apiSaveBases(request, env, u, C);
        if (p === "/api/bases-isn" && m === "DELETE") return await apiDeleteBase(request, env, u, C);
        if (p === "/api/detect-columns" && m === "POST") return await apiDetectColumns(request, env, u, C);
        if (p === "/api/download" && m === "GET") return await apiDownload(request, env, u, C);
        if (p === "/api/reprocesar" && m === "POST") return await apiReprocesar(request, env, u, C);
        if (p === "/api/procesar-reporte" && m === "POST") return await apiProcesarReporte(request, env, u, C);
        if (p === "/api/seed-placeholders" && m === "POST") return await apiSeedPlaceholders(request, env, u, C);
        if (p === "/api/upload-raw" && m === "POST") return await apiUploadRaw(request, env, u, C);
        return J({ error: "Not found" }, 404, C);
      }
      if (p === "/" || p === "/login") return H(pageLogin());
      if (p === "/recover") return H(pageRecover());
      if (p === "/admin") return H(pageAdmin());
      if (p === "/portal") return H(pagePortal());
      if (p === "/reporte") return H(pageReporte());
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return J({ error: e.message }, 500, C);
    }
  }
};
function J(d, s = 200, c = {}) {
  return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...c } });
}
__name(J, "J");
function H(html) {
  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}
__name(H, "H");
async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function token() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(token, "token");
async function auth(r, env) {
  const h = r.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const d = await env.SESSIONS.get(h.slice(7));
  return d ? JSON.parse(d) : null;
}
__name(auth, "auth");
async function doLogin(req, env, C) {
  const { email, password } = await req.json();
  if (!email || !password) return J({ error: "Campos requeridos" }, 400, C);
  const h = await sha256(password);
  const r = await env.DB.prepare("SELECT u.id,u.email,u.nombre,u.rol,u.empresa_id,e.nombre as empresa_nombre FROM usuarios u LEFT JOIN empresas e ON u.empresa_id=e.id WHERE u.email=? AND u.password_hash=? AND u.activo=1").bind(email, h).first();
  if (!r) return J({ error: "Credenciales inv\xE1lidas" }, 401, C);
  const t = token();
  const user = { id: r.id, email: r.email, nombre: r.nombre, rol: r.rol, empresa_id: r.empresa_id, empresa_nombre: r.empresa_nombre };
  await env.SESSIONS.put(t, JSON.stringify(user), { expirationTtl: 604800 });
  return J({ token: t, user }, 200, C);
}
__name(doLogin, "doLogin");
async function doMe(req, env, C) {
  const u = await auth(req, env);
  return u ? J({ user: u }, 200, C) : J({ error: "No auth" }, 401, C);
}
__name(doMe, "doMe");
async function doLogout(req, env, C) {
  const h = req.headers.get("Authorization");
  if (h?.startsWith("Bearer ")) await env.SESSIONS.delete(h.slice(7));
  return J({ ok: true }, 200, C);
}
__name(doLogout, "doLogout");
async function doForgotPassword(req, env, C) {
  const { email } = await req.json();
  if (!email) return J({ error: "Email requerido" }, 400, C);
  const u = await env.DB.prepare("SELECT id,email,nombre FROM usuarios WHERE email=? AND activo=1").bind(email).first();
  if (!u) return J({ ok: true, message: "Si el correo existe, recibir\xE1s un enlace de recuperaci\xF3n" }, 200, C);
  const t = token();
  const baseUrl = new URL(req.url).origin;
  const recoverUrl = baseUrl + "/recover?token=" + t;
  await env.SESSIONS.put("recover:" + t, JSON.stringify({ user_id: u.id, email: u.email }), { expirationTtl: 3600 });
  let emailSent = false;
  try {
    if (env.RESEND_API_KEY) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.EMAIL_FROM || "HRM Portal <noreply@hrm.mx>",
          to: [u.email],
          subject: "Recuperaci\xF3n de contrase\xF1a \u2014 HRM Portal",
          html: '<div style="font-family:Segoe UI,sans-serif;max-width:500px;margin:0 auto;padding:30px"><h2 style="color:#1a8a8a">Recuperaci\xF3n de contrase\xF1a</h2><p>Hola ' + u.nombre + ',</p><p>Recibimos una solicitud para restablecer tu contrase\xF1a en el portal HRM.</p><p><a href="' + recoverUrl + '" style="display:inline-block;background:#1a8a8a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Restablecer contrase\xF1a</a></p><p style="color:#5f7d8a;font-size:13px">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p><hr style="border:1px solid #d0dfe6;margin:20px 0"><p style="color:#5f7d8a;font-size:11px">HRM Human Resources Management</p></div>'
        })
      });
      emailSent = emailRes.ok;
    }
  } catch (e) {
    emailSent = false;
  }
  return J({ ok: true, message: "Si el correo existe, recibir\xE1s un enlace de recuperaci\xF3n", _debug: !env.RESEND_API_KEY ? { recover_url: recoverUrl, note: "Email service not configured. Share this link manually." } : void 0 }, 200, C);
}
__name(doForgotPassword, "doForgotPassword");
async function doRecover(req, env, C) {
  const { token: t, password } = await req.json();
  if (!t || !password) return J({ error: "Token y contrase\xF1a requeridos" }, 400, C);
  if (password.length < 3) return J({ error: "La contrase\xF1a debe tener al menos 3 caracteres" }, 400, C);
  const data = await env.SESSIONS.get("recover:" + t);
  if (!data) return J({ error: "El enlace ha expirado o es inv\xE1lido" }, 400, C);
  const { user_id } = JSON.parse(data);
  const h = await sha256(password);
  await env.DB.prepare("UPDATE usuarios SET password_hash=? WHERE id=?").bind(h, user_id).run();
  await env.SESSIONS.delete("recover:" + t);
  return J({ ok: true, message: "Contrase\xF1a actualizada correctamente" }, 200, C);
}
__name(doRecover, "doRecover");
async function apiResetPassword(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const { user_id, password } = await req.json();
  if (!user_id || !password) return J({ error: "Campos requeridos" }, 400, C);
  const h = await sha256(password);
  await env.DB.prepare("UPDATE usuarios SET password_hash=? WHERE id=?").bind(h, user_id).run();
  return J({ ok: true }, 200, C);
}
__name(apiResetPassword, "apiResetPassword");
async function apiEmpresas(env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const { results } = await env.DB.prepare("SELECT * FROM empresas ORDER BY nombre").all();
  return J({ empresas: results }, 200, C);
}
__name(apiEmpresas, "apiEmpresas");
async function apiCrearEmpresa(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  await env.DB.prepare("INSERT INTO empresas(nombre,rfc,slug)VALUES(?,?,?)").bind(d.nombre, d.rfc, d.slug).run();
  return J({ ok: true }, 201, C);
}
__name(apiCrearEmpresa, "apiCrearEmpresa");
async function apiUsuarios(env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const { results } = await env.DB.prepare("SELECT u.id,u.email,u.nombre,u.rol,u.empresa_id,u.activo,e.nombre as empresa_nombre FROM usuarios u LEFT JOIN empresas e ON u.empresa_id=e.id ORDER BY u.nombre").all();
  return J({ usuarios: results }, 200, C);
}
__name(apiUsuarios, "apiUsuarios");
async function apiCrearUsuario(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  const h = await sha256(d.password);
  await env.DB.prepare("INSERT INTO usuarios(email,password_hash,nombre,rol,empresa_id)VALUES(?,?,?,?,?)").bind(d.email, h, d.nombre, d.rol, d.empresa_id || null).run();
  return J({ ok: true }, 201, C);
}
__name(apiCrearUsuario, "apiCrearUsuario");
async function apiPeriodos(req, env, u, C) {
  const eid = new URL(req.url).searchParams.get("empresa_id");
  let q, a;
  const MESES_ORDER = "CASE p.mes WHEN 'enero' THEN 1 WHEN 'febrero' THEN 2 WHEN 'marzo' THEN 3 WHEN 'abril' THEN 4 WHEN 'mayo' THEN 5 WHEN 'junio' THEN 6 WHEN 'julio' THEN 7 WHEN 'agosto' THEN 8 WHEN 'septiembre' THEN 9 WHEN 'octubre' THEN 10 WHEN 'noviembre' THEN 11 WHEN 'diciembre' THEN 12 END";
  if (u.rol === "admin") {
    q = eid ? "SELECT p.*,e.nombre as empresa_nombre FROM periodos p JOIN empresas e ON p.empresa_id=e.id WHERE p.empresa_id=? ORDER BY p.anio DESC," + MESES_ORDER : "SELECT p.*,e.nombre as empresa_nombre FROM periodos p JOIN empresas e ON p.empresa_id=e.id ORDER BY p.anio DESC," + MESES_ORDER;
    a = eid ? [eid] : [];
  } else {
    q = 'SELECT p.*,e.nombre as empresa_nombre FROM periodos p JOIN empresas e ON p.empresa_id=e.id WHERE p.empresa_id=? AND p.estado="publicado" ORDER BY p.anio DESC,' + MESES_ORDER;
    a = [u.empresa_id];
  }
  const st = a.length ? env.DB.prepare(q).bind(...a) : env.DB.prepare(q);
  const { results } = await st.all();
  return J({ periodos: results }, 200, C);
}
__name(apiPeriodos, "apiPeriodos");
async function apiCrearPeriodo(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  if (!d.empresa_id || !d.mes || !d.anio) return J({ error: "Faltan campos: empresa_id, mes, anio" }, 400, C);
  const existing = await env.DB.prepare("SELECT id FROM periodos WHERE empresa_id=? AND mes=? AND anio=?").bind(d.empresa_id, d.mes, d.anio).first();
  if (existing) return J({ ok: true, id: existing.id, duplicate: true }, 200, C);
  const r = await env.DB.prepare("INSERT INTO periodos(empresa_id,mes,anio,estado,total_percepciones,total_deducciones,total_neto,total_isn,total_empleados)VALUES(?,?,?,'publicado',?,?,?,?,?)").bind(d.empresa_id, d.mes, d.anio, d.total_percepciones || 0, d.total_deducciones || 0, d.total_neto || 0, d.total_isn || 0, d.total_empleados || 0).run();
  const newId = r.meta?.last_row_id;
  if (newId) await seedPlaceholderSections(env, newId, d.empresa_id);
  return J({ ok: true, id: newId }, 201, C);
}
__name(apiCrearPeriodo, "apiCrearPeriodo");
async function apiUpload(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  try {
    const fd = await req.formData();
    const f = fd.get("file"), pid = fd.get("periodo_id"), eid = fd.get("empresa_id"), tipo = fd.get("tipo") || "otro";
    if (!f || !pid || !eid) return J({ error: "Faltan campos: file, periodo_id, empresa_id" }, 400, C);
    if (!f.name) return J({ error: "Archivo inv\xE1lido (sin nombre)" }, 400, C);
    if (f.size > 95 * 1024 * 1024) return J({ error: "El archivo excede 95MB. Comprime o divide el archivo." }, 413, C);
    const key = `empresas/${eid}/periodos/${pid}/${Date.now()}_${f.name}`;
    await env.DOCS.put(key, f.stream(), { httpMetadata: { contentType: f.type || "application/octet-stream" } });
    await env.DB.prepare("INSERT INTO documentos(periodo_id,empresa_id,nombre,tipo,r2_key,size_bytes,uploaded_by)VALUES(?,?,?,?,?,?,?)").bind(pid, eid, f.name, tipo, key, f.size, u.id).run();
    return J({ ok: true, key, nombre: f.name, tipo, size: f.size }, 201, C);
  } catch (e) {
    return J({ error: "Error al subir archivo: " + (e.message || "desconocido") }, 500, C);
  }
}
__name(apiUpload, "apiUpload");
async function seedPlaceholderSections(env, pid, eid) {
  const notas = {
    sec1: "Sube el informe de supervisi\xF3n (PDF) para ver la integraci\xF3n de n\xF3mina con totales de percepciones, deducciones y CFDIs.",
    sec2: "Sube el informe de supervisi\xF3n (PDF) o el archivo de N\xF3mina (Excel) para ver los importes por periodo.",
    sec4: "Sube el archivo de N\xF3mina (Excel) para ver el concentrado detallado por concepto.",
    sec5: "Sube el archivo de N\xF3mina (Excel) para ver los totales por puesto.",
    sec6: "Sube el archivo de N\xF3mina (Excel) para ver los totales por estado.",
    sec7: "Sube el informe de supervisi\xF3n (PDF) o el archivo de N\xF3mina (Excel) para ver los impuestos del trabajador.",
    sec8: "Sube el informe de supervisi\xF3n (PDF) o el archivo de N\xF3mina (Excel) para ver las contribuciones patronales.",
    sec9: "Sube el informe de supervisi\xF3n (PDF) o el archivo de N\xF3mina (Excel) para ver el IMSS por registro patronal.",
    sec10: "Sube el archivo de N\xF3mina (Excel) para ver el impuesto sobre n\xF3mina por estado.",
    sec11: "Sube el archivo de Contabilidad (Excel) para ver la comparaci\xF3n con la provisi\xF3n global.",
    sec12: "Sube el archivo de N\xF3mina (Excel) para ver las tendencias de altas y bajas.",
    sec13: "Sube el informe de supervisi\xF3n (PDF) para ver las acciones de mejora."
  };
  for (const [sec, nota] of Object.entries(notas)) {
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(pid, eid, sec, JSON.stringify({ _nota: nota })).run();
    } catch (e) {
    }
  }
}
__name(seedPlaceholderSections, "seedPlaceholderSections");
async function apiDocs(req, env, u, C) {
  const url = new URL(req.url);
  const pid = url.searchParams.get("periodo_id");
  const tipo = url.searchParams.get("tipo");
  let q = "SELECT * FROM documentos WHERE 1=1";
  const a = [];
  if (u.rol !== "admin") {
    q += " AND empresa_id=?";
    a.push(u.empresa_id);
  }
  if (pid) {
    q += " AND periodo_id=?";
    a.push(pid);
  }
  if (tipo) {
    q += " AND tipo=?";
    a.push(tipo);
  }
  q += " ORDER BY created_at DESC";
  if (!pid) q += u.rol === "admin" ? " LIMIT 100" : " LIMIT 50";
  const st = a.length ? env.DB.prepare(q).bind(...a) : env.DB.prepare(q);
  const { results } = await st.all();
  return J({ documentos: results }, 200, C);
}
__name(apiDocs, "apiDocs");
async function apiReportes(req, env, u, C) {
  const url = new URL(req.url);
  const pid = url.searchParams.get("periodo_id"), sec = url.searchParams.get("seccion");
  let q = "SELECT * FROM reportes WHERE 1=1";
  const a = [];
  if (pid) {
    q += " AND periodo_id=?";
    a.push(pid);
  }
  if (sec) {
    q += " AND seccion=?";
    a.push(sec);
  }
  if (u.rol !== "admin") {
    q += " AND empresa_id=?";
    a.push(u.empresa_id);
  }
  q += " ORDER BY seccion";
  const st = a.length ? env.DB.prepare(q).bind(...a) : env.DB.prepare(q);
  const { results } = await st.all();
  return J({ reportes: results }, 200, C);
}
__name(apiReportes, "apiReportes");
async function apiGuardarReporte(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json)VALUES(?,?,?,?)").bind(d.periodo_id, d.empresa_id, d.seccion, JSON.stringify(d.datos_json)).run();
  return J({ ok: true }, 201, C);
}
__name(apiGuardarReporte, "apiGuardarReporte");
async function apiGetMapeo(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const eid = new URL(req.url).searchParams.get("empresa_id");
  if (!eid) return J({ error: "empresa_id requerido" }, 400, C);
  const { results } = await env.DB.prepare("SELECT * FROM mapeo_columnas WHERE empresa_id=? AND activo=1 ORDER BY categoria,concepto_hrm").bind(eid).all();
  return J({ mapeo: results }, 200, C);
}
__name(apiGetMapeo, "apiGetMapeo");
async function apiSaveMapeo(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  await env.DB.prepare("INSERT OR REPLACE INTO mapeo_columnas(empresa_id,concepto_hrm,columna_cliente,categoria)VALUES(?,?,?,?)").bind(d.empresa_id, d.concepto_hrm, d.columna_cliente, d.categoria).run();
  return J({ ok: true }, 201, C);
}
__name(apiSaveMapeo, "apiSaveMapeo");
async function apiDeleteMapeo(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  await env.DB.prepare("DELETE FROM mapeo_columnas WHERE id=? AND empresa_id=?").bind(d.id, d.empresa_id).run();
  return J({ ok: true }, 200, C);
}
__name(apiDeleteMapeo, "apiDeleteMapeo");
async function apiGetBases(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const eid = new URL(req.url).searchParams.get("empresa_id");
  if (!eid) return J({ error: "empresa_id requerido" }, 400, C);
  const { results } = await env.DB.prepare("SELECT * FROM bases_isn WHERE empresa_id=? AND activo=1 ORDER BY entidad_federativa").bind(eid).all();
  return J({ bases: results }, 200, C);
}
__name(apiGetBases, "apiGetBases");
async function apiSaveBases(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  await env.DB.prepare("INSERT OR REPLACE INTO bases_isn(empresa_id,registro_patronal,entidad_federativa,tasa,vales_gravado,ptu_gravado)VALUES(?,?,?,?,?,?)").bind(d.empresa_id, d.registro_patronal, d.entidad_federativa, d.tasa, d.vales_gravado ? 1 : 0, d.ptu_gravado ? 1 : 0).run();
  return J({ ok: true }, 201, C);
}
__name(apiSaveBases, "apiSaveBases");
async function apiDeleteBase(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  await env.DB.prepare("DELETE FROM bases_isn WHERE id=? AND empresa_id=?").bind(d.id, d.empresa_id).run();
  return J({ ok: true }, 200, C);
}
__name(apiDeleteBase, "apiDeleteBase");
async function apiDetectColumns(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  return J({ columns: d.columns || [] }, 200, C);
}
__name(apiDetectColumns, "apiDetectColumns");
async function apiProcesarInforme(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  const { periodo_id, empresa_id, text } = d;
  if (!periodo_id || !empresa_id || !text) return J({ error: "Faltan campos" }, 400, C);
  const fullText = text;
  const parseNum = /* @__PURE__ */ __name((s) => parseFloat(String(s).replace(/,/g, "")) || 0, "parseNum");
  const parseInt2 = /* @__PURE__ */ __name((s) => parseInt(String(s).replace(/,/g, ""), 10) || 0, "parseInt2");
  let totalPerc = 0, totalDed = 0, totalNeto = 0;
  const percMatch = fullText.match(/Percepciones\s+([\d,]+\.\d{2})/);
  const dedMatch = fullText.match(/Deducciones\s+([\d,]+\.\d{2})/);
  if (percMatch) totalPerc = parseNum(percMatch[1]);
  if (dedMatch) totalDed = parseNum(dedMatch[1]);
  if (totalPerc > 0 && totalDed > 0) {
    const afterDed = fullText.substring(fullText.indexOf("Deducciones"));
    const netoMatch = afterDed.match(/TOTAL:\s+([\d,]+\.\d{2})/);
    if (netoMatch) totalNeto = parseNum(netoMatch[1]);
  }
  if (totalNeto === 0 && totalPerc > 0 && totalDed > 0) {
    totalNeto = Math.round((totalPerc - totalDed) * 100) / 100;
  }
  if (totalPerc === 0) return J({ error: "No se pudo extraer Percepciones del PDF. Verifica que sea un Informe de Supervisi\xF3n v\xE1lido." }, 400, C);
  const sec1 = { percepciones: totalPerc, deducciones: totalDed, total_neto: totalNeto, sem_prom: 0, cat_prom: 0, emp_finiquitos: 0, emp_bonos_sem: 0, emp_bonos_cat: 0, emp_gratificacion: 0, cfdi_total: 0, cfdi_dif: 0, disp_total: 0, disp_dif: 0 };
  const semPromMatch = fullText.match(/[Ss]emanal(?:es)?\s*(?:promedio)?[:\s]+(\d[,\d]*)\s/) || fullText.match(/Empleados?\s+semanal[es]*[:\s]+(\d[,\d]*)/i);
  const catPromMatch = fullText.match(/[Cc]atorcenal(?:es)?\s*(?:promedio)?[:\s]+(\d[,\d]*)\s/) || fullText.match(/Empleados?\s+catorcenal[es]*[:\s]+(\d[,\d]*)/i);
  if (semPromMatch) sec1.sem_prom = parseInt2(semPromMatch[1]);
  if (catPromMatch) sec1.cat_prom = parseInt2(catPromMatch[1]);
  const cfdiMatch = fullText.match(/Certificados Fiscales Digitales\s+([\d,]+\.\d{2})/);
  const dispMatch = fullText.match(/Dispersiones\s+([\d,]+\.\d{2})/);
  if (cfdiMatch) sec1.cfdi_total = parseNum(cfdiMatch[1]);
  if (dispMatch) sec1.disp_total = parseNum(dispMatch[1]);
  sec1.cfdi_dif = Math.round((totalNeto - sec1.cfdi_total) * 100) / 100;
  sec1.disp_dif = Math.round((totalNeto - sec1.disp_total) * 100) / 100;
  await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(periodo_id, empresa_id, "sec1", JSON.stringify(sec1)).run();
  const sec2 = [];
  const periodLabels = ["SEM 52", "SEM 01", "SEM 02", "SEM 03", "SEM 04", "SEM 05", "CAT 01", "CAT 02", "CAT 03", "BONOS SEM", "BONOS CAT", "FINIQUITOS", "FINIQ CAT", "GRATIF", "GRATIFICACION"];
  for (const lbl of periodLabels) {
    const esc = lbl.replace(/ /g, "\\s+");
    const re = new RegExp(esc + "\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})", "i");
    const m = fullText.match(re);
    if (m) {
      sec2.push({ p: lbl, nom: parseNum(m[1]), cfdi: parseNum(m[2]), disp: parseNum(m[3]) });
    }
  }
  if (sec2.length === 0) {
    await saveSec(env, periodo_id, empresa_id, "sec2", { _nota: "No se pudieron extraer los importes por periodo del informe PDF. Sube el archivo de N\xF3mina (Excel) para ver el detalle." });
  } else {
    await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(periodo_id, empresa_id, "sec2", JSON.stringify(sec2)).run();
  }
  await saveSec(env, periodo_id, empresa_id, "sec4", { _nota: "Sube el archivo de N\xF3mina (Excel) para ver el concentrado detallado por concepto." });
  await saveSec(env, periodo_id, empresa_id, "sec5", { _nota: "Sube el archivo de N\xF3mina (Excel) para ver los totales por puesto." });
  await saveSec(env, periodo_id, empresa_id, "sec6", { _nota: "Sube el archivo de N\xF3mina (Excel) para ver los totales por estado." });
  const sec7Periods = [];
  for (const lbl of periodLabels) {
    const esc = lbl.replace(/ /g, "\\s+");
    const re = new RegExp(esc + "\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})", "i");
    const matches = [...fullText.matchAll(new RegExp(re.source, "gi"))];
    if (matches.length > 0) {
      const m = matches[matches.length - 1];
      sec7Periods.push({ p: lbl, isr: parseNum(m[1]), imss: parseNum(m[2]), info: parseNum(m[3]), fon: parseNum(m[4]), total: parseNum(m[5]) });
    }
  }
  const visorTotMatch = fullText.match(/Total\s+nómina\s+SAT[:\s]+\$?\s*([\d,]+\.\d{2})/i);
  const visorExeMatch = fullText.match(/Nómina\s+exenta[:\s]+\$?\s*([\d,]+\.\d{2})/i);
  const visorEmpMatch = fullText.match(/Trabajadores?\s+SAT[:\s]+(\d[,\d]*)/i) || fullText.match(/Núm(?:ero)?\.?\s+empleados?\s+SAT[:\s]+(\d[,\d]*)/i);
  const isrSatMatch = fullText.match(/ISR\s+SAT[:\s]+\$?\s*([\d,]+\.\d{2})/i);
  if (sec7Periods.length > 0) {
    const tISR = sec7Periods.reduce((s, r) => s + r.isr, 0);
    const tIM = sec7Periods.reduce((s, r) => s + r.imss, 0);
    const tIn = sec7Periods.reduce((s, r) => s + r.info, 0);
    const tFn = sec7Periods.reduce((s, r) => s + r.fon, 0);
    const tTr = sec7Periods.reduce((s, r) => s + r.total, 0);
    const isrSat = isrSatMatch ? parseNum(isrSatMatch[1]) : 0;
    const sec7 = {
      periodos: sec7Periods,
      total_isr: Math.round(tISR * 100) / 100,
      total_imss: Math.round(tIM * 100) / 100,
      total_info: Math.round(tIn * 100) / 100,
      total_fon: Math.round(tFn * 100) / 100,
      total_trabajador: Math.round(tTr * 100) / 100,
      isr_nomina: Math.round(tISR * 100) / 100,
      isr_sat: isrSat,
      isr_dif: Math.round((tISR - isrSat) * 100) / 100,
      total_nomina_sat: visorTotMatch ? parseNum(visorTotMatch[1]) : 0,
      nomina_exenta_sat: visorExeMatch ? parseNum(visorExeMatch[1]) : 0,
      num_empleados_sat: visorEmpMatch ? parseInt2(visorEmpMatch[1]) : 0
    };
    await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(periodo_id, empresa_id, "sec7", JSON.stringify(sec7)).run();
  } else {
    await saveSec(env, periodo_id, empresa_id, "sec7", { _nota: "No se pudieron extraer los impuestos por periodo del PDF. Sube el archivo de N\xF3mina (Excel) para ver el detalle completo." });
  }
  const contribIdx = Math.max(fullText.indexOf("Contribuciones"), fullText.indexOf("patronales"), fullText.indexOf("PATRONALES"));
  const sec8Periods = [];
  if (contribIdx > 0) {
    const contribText = fullText.substring(contribIdx, contribIdx + 8e3);
    for (const lbl of periodLabels) {
      const esc = lbl.replace(/ /g, "\\s+");
      const re = new RegExp(esc + "\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})", "i");
      const m = contribText.match(re);
      if (m) {
        sec8Periods.push({ p: lbl, imss: parseNum(m[1]), rcv: parseNum(m[2]), info: parseNum(m[3]), isn: parseNum(m[4]), total: parseNum(m[5]) });
      }
    }
  }
  if (sec8Periods.length > 0) {
    const tIM = sec8Periods.reduce((s, r) => s + r.imss, 0);
    const tRC = sec8Periods.reduce((s, r) => s + r.rcv, 0);
    const tIn = sec8Periods.reduce((s, r) => s + r.info, 0);
    const tIS = sec8Periods.reduce((s, r) => s + r.isn, 0);
    const sec8 = {
      periodos: sec8Periods,
      isn_total: Math.round(tIS * 100) / 100,
      total_imss: Math.round(tIM * 100) / 100,
      total_rcv: Math.round(tRC * 100) / 100,
      total_info: Math.round(tIn * 100) / 100,
      total_patron: Math.round((tIM + tRC + tIn + tIS) * 100) / 100
    };
    await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(periodo_id, empresa_id, "sec8", JSON.stringify(sec8)).run();
  } else {
    await saveSec(env, periodo_id, empresa_id, "sec8", { _nota: "No se pudieron extraer las contribuciones patronales del PDF. Sube el archivo de N\xF3mina (Excel) para ver el detalle completo." });
  }
  const sec9 = [];
  const rpRe = /\b([A-Z]\d{10})\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ\s()]{2,40}?)\s+(\d[,\d]*)\s+([\d,]+\.\d{2})/g;
  let rpm;
  const seenRp = /* @__PURE__ */ new Set();
  while ((rpm = rpRe.exec(fullText)) !== null) {
    const rp = rpm[1];
    if (seenRp.has(rp)) continue;
    seenRp.add(rp);
    sec9.push({ rp, e: rpm[2].trim(), emp: parseInt2(rpm[3]), t: parseNum(rpm[4]) });
  }
  if (sec9.length > 0) {
    await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(periodo_id, empresa_id, "sec9", JSON.stringify(sec9)).run();
  } else {
    await saveSec(env, periodo_id, empresa_id, "sec9", { _nota: "No se pudieron extraer los registros patronales del PDF. Sube el archivo de N\xF3mina (Excel) para ver el detalle completo." });
  }
  await saveSec(env, periodo_id, empresa_id, "sec10", { _nota: "Sube el archivo de N\xF3mina (Excel) para ver el impuesto sobre n\xF3mina por estado." });
  await saveSec(env, periodo_id, empresa_id, "sec11", { _nota: "Sube el archivo de Contabilidad (Excel) para ver la comparaci\xF3n con la provisi\xF3n global." });
  await saveSec(env, periodo_id, empresa_id, "sec12", { _nota: "Sube el archivo de N\xF3mina (Excel) para ver las tendencias de altas y bajas." });
  const accionesIdx = fullText.indexOf("Acciones de mejora");
  if (accionesIdx > 0) {
    const accionesText = fullText.substring(accionesIdx + 20);
    const accionesItems = accionesText.split(/\d+\.\s+/).filter((a) => a.trim().length > 20).map((a) => a.trim().substring(0, 300));
    if (accionesItems.length > 0) {
      await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(periodo_id, empresa_id, "sec13", JSON.stringify(accionesItems)).run();
    } else {
      await saveSec(env, periodo_id, empresa_id, "sec13", { _nota: "No se encontraron acciones de mejora en el informe." });
    }
  } else {
    await saveSec(env, periodo_id, empresa_id, "sec13", { _nota: "No se encontr\xF3 la secci\xF3n de acciones de mejora en el PDF." });
  }
  const empMatch = fullText.match(/TOTAL:\s+(\d[,\d]+)\s/);
  const empCount = empMatch ? parseInt2(empMatch[1]) : 0;
  const isnMatch = fullText.match(/Impuesto(?:\s+(?:sobre|estatal|sobre\s+n)).*?TOTAL[^\d]*([\d,]+\.\d{2})/i) || fullText.match(/ISN[^\d]*([\d,]+\.\d{2})/);
  const isnTotal = isnMatch ? parseNum(isnMatch[1]) : 0;
  const empTotalMatch = fullText.match(/TOTAL:\s+(\d[,\d]+)\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}/);
  const empFinal = empTotalMatch ? parseInt2(empTotalMatch[1]) : empCount;
  await env.DB.prepare("UPDATE periodos SET total_percepciones=?,total_deducciones=?,total_neto=?,total_empleados=?,total_isn=?,estado=? WHERE id=?").bind(totalPerc, totalDed, totalNeto, empFinal, isnTotal, "publicado", periodo_id).run();
  const { results: rSec } = await env.DB.prepare("SELECT seccion, datos_json FROM reportes WHERE periodo_id=?").bind(periodo_id).all();
  let savedCount = 0;
  let missingCount = 0;
  for (const r of rSec || []) {
    try {
      const d2 = JSON.parse(r.datos_json);
      if (d2 && d2._nota) missingCount++;
      else savedCount++;
    } catch (e) {
      savedCount++;
    }
  }
  return J({ ok: true, secciones: savedCount, faltantes: missingCount, percepciones: totalPerc, deducciones: totalDed, neto: totalNeto, empleados: empFinal }, 200, C);
}
__name(apiProcesarInforme, "apiProcesarInforme");
async function saveSec(env, pid, eid, sec, data) {
  const existing = await env.DB.prepare("SELECT datos_json FROM reportes WHERE periodo_id=? AND seccion=?").bind(pid, sec).first();
  if (existing) {
    try {
      const d = JSON.parse(existing.datos_json);
      if (d && !d._nota) return;
    } catch (e) {
    }
  }
  await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json) VALUES(?,?,?,?)").bind(pid, eid, sec, JSON.stringify(data)).run();
}
__name(saveSec, "saveSec");
async function apiDownload(req, env, u, C) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key) return J({ error: "key required" }, 400, C);
  const doc = await env.DB.prepare("SELECT empresa_id,nombre FROM documentos WHERE r2_key=? LIMIT 1").bind(key).first();
  if (!doc) return J({ error: "File not found" }, 404, C);
  if (u.rol !== "admin" && doc.empresa_id !== u.empresa_id) return J({ error: "Forbidden" }, 403, C);
  const obj = await env.DOCS.get(key);
  if (!obj) return J({ error: "File not found" }, 404, C);
  const safeName = String(doc.nombre || "archivo").replace(/[^\w\s.\-]/g, "_");
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream", "Content-Disposition": 'attachment; filename="' + safeName + '"', ...C } });
}
__name(apiDownload, "apiDownload");
async function apiReprocesar(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  const pid = d.periodo_id, eid = d.empresa_id, tipo = d.tipo || "acumulado";
  if (!pid || !eid) return J({ error: "periodo_id y empresa_id requeridos" }, 400, C);
  const doc = await env.DB.prepare("SELECT r2_key,nombre FROM documentos WHERE periodo_id=? AND tipo=? ORDER BY id DESC LIMIT 1").bind(pid, tipo).first();
  if (!doc) return J({ error: 'No hay archivo tipo "' + tipo + '" subido para este periodo' }, 404, C);
  const obj = await env.DOCS.get(doc.r2_key);
  if (!obj) return J({ error: "Archivo no encontrado en R2" }, 404, C);
  const bytes = await obj.arrayBuffer();
  const ct = tipo === "informe" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Response(bytes, { status: 200, headers: { "Content-Type": ct, "X-Filename": doc.nombre, ...C } });
}
__name(apiReprocesar, "apiReprocesar");
var LOGO = "data:image/png;base64,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lFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimllFJKKaWUUkoppZRSSimlvrb+b9T1d4w3WZtNAAAAAElFTkSuQmCC";
async function apiProcesarReporte(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  const pid = d.periodo_id, eid = d.empresa_id;
  if (!pid || !eid) return J({ error: "periodo_id y empresa_id requeridos" }, 400, C);
  const secciones = d.secciones || {};
  let count = 0;
  for (const [seccion, datos] of Object.entries(secciones)) {
    await env.DB.prepare("INSERT OR REPLACE INTO reportes(periodo_id,empresa_id,seccion,datos_json)VALUES(?,?,?,?)").bind(pid, eid, seccion, JSON.stringify(datos)).run();
    count++;
  }
  if (d.totales) {
    const t = d.totales;
    await env.DB.prepare("UPDATE periodos SET total_empleados=?,total_percepciones=?,total_deducciones=?,total_neto=?,total_isn=? WHERE id=?").bind(t.empleados || 0, t.percepciones || 0, t.deducciones || 0, t.neto || 0, t.isn || 0, pid).run();
  }
  return J({ ok: true, secciones_guardadas: count }, 201, C);
}
__name(apiProcesarReporte, "apiProcesarReporte");
async function apiSeedPlaceholders(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const d = await req.json();
  const pid = d.periodo_id, eid = d.empresa_id;
  if (!pid || !eid) return J({ error: "periodo_id y empresa_id requeridos" }, 400, C);
  await seedPlaceholderSections(env, pid, eid);
  return J({ ok: true }, 200, C);
}
__name(apiSeedPlaceholders, "apiSeedPlaceholders");
async function apiUploadRaw(req, env, u, C) {
  if (u.rol !== "admin") return J({ error: "Forbidden" }, 403, C);
  const formData = await req.formData();
  const file = formData.get("file");
  const empresa_id = formData.get("empresa_id");
  const periodo_id = formData.get("periodo_id");
  const sistema_hint = formData.get("sistema") || "";
  if (!file || !empresa_id) return J({ error: "file y empresa_id requeridos" }, 400, C);
  const nombre = file.name;
  const ext = nombre.split(".").pop().toLowerCase();
  const key = `raw/${empresa_id}/${Date.now()}_${nombre.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const tipo = "raw";
  const deteccion = detectRawFormat(nombre, ext, sistema_hint);
  try {
    await env.DOCS.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    if (periodo_id) {
      await env.DB.prepare("INSERT INTO documentos(periodo_id,empresa_id,tipo,nombre,r2_key)VALUES(?,?,?,?,?)").bind(periodo_id, empresa_id, tipo, nombre, key).run();
    }
    return J({
      ok: true,
      key,
      nombre,
      tipo: deteccion.sistema_detectado || "desconocido",
      columnas_sugeridas: deteccion.columnas_sugeridas || [],
      confianza: deteccion.confianza || 0,
      mensaje: "Archivo recibido. El sistema lo procesar\xE1 cuando el formato RAW est\xE9 configurado. Contacta al admin para mapear columnas."
    }, 201, C);
  } catch (e) {
    return J({ error: "Error guardando archivo: " + e.message }, 500, C);
  }
}
__name(apiUploadRaw, "apiUploadRaw");
function detectRawFormat(nombre, ext, hint) {
  var n = (nombre || "").toLowerCase();
  var result = { sistema_detectado: null, columnas_sugeridas: [], confianza: 0 };
  if (hint) {
    result.sistema_detectado = hint;
    result.confianza = 100;
    return result;
  }
  if (/cfdi|timbres?|sat|xml|factur/i.test(n) && (ext === "xml" || ext === "xlsx" || ext === "xls")) {
    result.sistema_detectado = "xml_cfdi";
    result.confianza = 70;
  } else if (/acumulado|prenomina|base.*nomin/i.test(n) && (ext === "xlsx" || ext === "xls")) {
    result.sistema_detectado = "acumulado";
    result.confianza = 60;
  } else if (/contabilidad|poliza|p.liza/i.test(n)) {
    result.sistema_detectado = "contabilidad";
    result.confianza = 60;
  } else if (/isu|isn|impuesto/i.test(n)) {
    result.sistema_detectado = "isn";
    result.confianza = 50;
  } else if (/dispers|pago|banco|clabe|txt.*layout/i.test(n)) {
    result.sistema_detectado = "txt_banco";
    result.confianza = 50;
  } else if (/sua|idse|imov|alta.*baja/i.test(n)) {
    result.sistema_detectado = "idse";
    result.confianza = 50;
  } else if (ext === "xlsx" || ext === "xls") {
    result.sistema_detectado = "desconocido_excel";
    result.confianza = 20;
  }
  return result;
}
__name(detectRawFormat, "detectRawFormat");
var CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f0f6f8;color:#1a2e3a;line-height:1.6}
a{color:#1a8a8a;text-decoration:none}
.top{background:#fff;border-bottom:1px solid #b8ced8;padding:12px 32px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 1px 3px rgba(26,46,58,.06);overflow:hidden}
.top-l{display:flex;align-items:center;gap:14px;font-weight:700;font-size:15px}
.top-l img{height:90px}
.top-r{display:flex;align-items:center;gap:14px;font-size:13px;color:#3d5a6b}
.bo{background:none;border:1px solid #b8ced8;color:#3d5a6b;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:12px;font-family:inherit;transition:all .15s;text-decoration:none}
.bo:hover{border-color:#1a8a8a;color:#1a8a8a;text-decoration:none}
.br:hover{border-color:#d94452;color:#d94452}
.ct{max-width:1000px;margin:0 auto;padding:28px 32px}
.tabs{display:flex;gap:2px;margin-bottom:22px;border-bottom:2px solid #b8ced8}
.tab{padding:10px 18px;cursor:pointer;font-size:14px;color:#3d5a6b;border:none;background:none;font-family:inherit;border-bottom:3px solid transparent;font-weight:600}
.tab.active{color:#1a8a8a;border-bottom-color:#1a8a8a}
.pn{display:none}.pn.active{display:block}
.cd{background:#fff;border:1px solid #b8ced8;border-radius:14px;padding:24px;margin-bottom:18px;box-shadow:0 1px 3px rgba(26,46,58,.06)}
.cd h3{font-size:16px;font-weight:700;margin-bottom:16px}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
label{display:block;font-size:11px;font-weight:700;color:#5f7d8a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
input,select{width:100%;padding:10px 14px;background:#f0f6f8;border:1px solid #b8ced8;border-radius:8px;color:#1a2e3a;font-size:14px;outline:none;font-family:inherit}
input:focus,select:focus{border-color:#1a8a8a}
.btn{padding:10px 20px;background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;padding:10px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#5f7d8a;border-bottom:2px solid #b8ced8;font-weight:700}
.tbl td{padding:10px 12px;border-bottom:1px solid #d0dfe6;color:#3d5a6b}
.tbl td:first-child{color:#1a2e3a;font-weight:600}
.pill{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700}
.pill-a{background:rgba(123,94,167,.18);color:#5c4488}
.pill-s{background:rgba(26,138,138,.15);color:#147070}
.pill-p{background:rgba(26,138,138,.15);color:#147070}
.uz{border:2px dashed #b8ced8;border-radius:12px;padding:36px;text-align:center;color:#5f7d8a;cursor:pointer}
.uz:hover{border-color:#1a8a8a}
.msg{padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px}
.msg-ok{background:rgba(32,160,160,.08);border:1px solid rgba(32,160,160,.2);color:#1a8a8a}
.msg-err{background:rgba(217,68,82,.06);border:1px solid rgba(217,68,82,.15);color:#d94452}
.g4-b{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}
.kpi{background:#fff;border:1px solid #d0dfe6;border-radius:10px;padding:16px 18px;position:relative;box-shadow:0 2px 6px rgba(26,46,58,.04)}
.kpi::before{content:'';position:absolute;border-radius:14px 14px 0 0;top:0;left:0;width:100%;height:3px;background:var(--c,#1a8a8a)}
.kpi-l{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#5f7d8a;font-weight:700;margin-bottom:6px}
.kpi-v{font-size:20px;font-weight:800;font-family:'Courier New',monospace}
.grid-c{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:20px;margin-bottom:28px}
.pc{background:#fff;border:1px solid #b8ced8;border-radius:16px;padding:28px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(26,46,58,.06)}
.pc:hover{border-color:#1a8a8a;transform:translateY(-2px);box-shadow:0 8px 24px rgba(26,138,138,.1)}
.pc::before{content:'';position:absolute;top:0;left:0;width:100%;height:3px;background:linear-gradient(90deg,#1a8a8a,#40c8c8)}
.pc h3{font-size:22px;font-weight:800;margin-bottom:8px;text-transform:capitalize}
.pc .mt{color:#3d5a6b;font-size:13px;margin-bottom:20px}
.kps{display:grid;grid-template-columns:1fr 1fr;gap:16px 24px}
.kp-l{font-size:10px;color:#5f7d8a;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:2px}
.kp-v{font-size:16px;font-weight:800;font-family:'Courier New',monospace}
.empty{text-align:center;padding:60px;color:#5f7d8a;font-size:15px}
@media(max-width:768px){.kpi-row2{grid-template-columns:1fr!important}.g4-b{grid-template-columns:1fr 1fr}.ct{padding:16px}.grid-c{grid-template-columns:1fr}}

@media(max-width:768px){
  .top{padding:10px 16px;flex-wrap:wrap;gap:8px}
  .top-l img{height:50px!important}
  .top-r{gap:6px}
  .top-r .bo{font-size:10px;padding:6px 10px}
  .ct{padding:16px!important;max-width:100vw}
}
@media(max-width:480px){
  .top-r span{display:none}
  .top-r .bo{font-size:9px;padding:5px 8px}
}

/* \u2500\u2500\u2500 Loading overlay global \u2500\u2500\u2500 */
.ldo{position:fixed;inset:0;background:rgba(13,30,42,.55);backdrop-filter:blur(4px);z-index:9998;display:none;align-items:center;justify-content:center;animation:ldoIn .2s ease}
.ldo.sh{display:flex}
.ldo-c{background:#fff;border-radius:16px;padding:32px 44px;min-width:280px;max-width:90vw;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.25)}
.ldo-sp{width:48px;height:48px;border:4px solid #e8f1f4;border-top-color:#1a8a8a;border-radius:50%;margin:0 auto 18px;animation:ldoRot 1s linear infinite}
.ldo-t{font-size:15px;font-weight:700;color:#1a2e3a;margin-bottom:6px}
.ldo-s{font-size:12px;color:#5a7a8a}
.ldo-pb{margin-top:14px;height:6px;background:#e8f1f4;border-radius:6px;overflow:hidden;display:none}
.ldo-pb.sh{display:block}
.ldo-pf{height:100%;background:linear-gradient(90deg,#1a8a8a,#40c8c8);width:0;transition:width .25s;border-radius:6px}
@keyframes ldoIn{from{opacity:0}to{opacity:1}}
@keyframes ldoRot{from{transform:rotate(0)}to{transform:rotate(360deg)}}

/* \u2500\u2500\u2500 Confirm modal \u2500\u2500\u2500 */
.cfm{position:fixed;inset:0;background:rgba(13,30,42,.55);backdrop-filter:blur(4px);z-index:9999;display:none;align-items:center;justify-content:center;animation:ldoIn .2s ease}
.cfm.sh{display:flex}
.cfm-c{background:#fff;border-radius:16px;padding:28px;width:100%;max-width:420px;box-shadow:0 24px 60px rgba(0,0,0,.25)}
.cfm-i{width:48px;height:48px;border-radius:50%;background:rgba(217,68,82,.1);color:#d94452;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;margin:0 auto 14px}
.cfm-i.ok{background:rgba(26,138,138,.1);color:#1a8a8a}
.cfm-t{font-size:16px;font-weight:800;color:#1a2e3a;text-align:center;margin-bottom:6px}
.cfm-m{font-size:13px;color:#5a7a8a;text-align:center;margin-bottom:20px;line-height:1.5}
.cfm-bt{display:flex;gap:10px;justify-content:center}
.cfm-bt button{flex:1;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;border:none;transition:transform .1s}
.cfm-bt button:hover{transform:translateY(-1px)}
.cfm-bt .cfm-c1{background:#f0f6f8;color:#3d5a6b;border:1px solid #d4e5eb}
.cfm-bt .cfm-c2{background:#d94452;color:#fff}
.cfm-bt .cfm-c2.ok{background:#1a8a8a}

/* \u2500\u2500\u2500 Tooltips \u2500\u2500\u2500 */
[data-tip]{position:relative}
[data-tip]:hover::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#1a2e3a;color:#fff;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;z-index:10000;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.2)}

/* \u2500\u2500\u2500 Print friendly \u2500\u2500\u2500 */
@media print{.top,.bo,.btn-i,.back-link,.foot,.ldo,.cfm{display:none!important}.sec-body{display:block!important}.sec{break-inside:avoid;page-break-inside:avoid}}
`;
var UI_FN = `function showLoading(t,s){var o=document.getElementById('__ldo');if(!o){o=document.createElement('div');o.id='__ldo';o.className='ldo';o.innerHTML='<div class="ldo-c"><div class="ldo-sp"></div><div class="ldo-t" id="__ldoT">Cargando...</div><div class="ldo-s" id="__ldoS"></div><div class="ldo-pb" id="__ldoPB"><div class="ldo-pf" id="__ldoPF"></div></div></div>';document.body.appendChild(o);}document.getElementById('__ldoT').textContent=t||'Cargando...';document.getElementById('__ldoS').textContent=s||'';document.getElementById('__ldoPB').classList.remove('sh');document.getElementById('__ldoPF').style.width='0%';o.classList.add('sh');}function setLoadingProgress(p,s){var pb=document.getElementById('__ldoPB'),pf=document.getElementById('__ldoPF'),ss=document.getElementById('__ldoS');if(pb)pb.classList.add('sh');if(pf)pf.style.width=Math.max(0,Math.min(100,p))+'%';if(ss&&s!==undefined)ss.textContent=s;}function setLoadingText(t,s){var tt=document.getElementById('__ldoT'),ss=document.getElementById('__ldoS');if(tt&&t)tt.textContent=t;if(ss&&s!==undefined)ss.textContent=s;}function hideLoading(){var o=document.getElementById('__ldo');if(o)o.classList.remove('sh');}function confirmAction(opts){return new Promise(function(res){var c=document.createElement('div');c.className='cfm sh';var icon=opts.danger?'!':'?';var iconCls=opts.danger?'':' ok';var btnCls=opts.danger?'':' ok';c.innerHTML='<div class="cfm-c"><div class="cfm-i'+iconCls+'">'+icon+'</div><div class="cfm-t">'+(opts.title||'\xBFConfirmar?')+'</div><div class="cfm-m">'+(opts.msg||'')+'</div><div class="cfm-bt"><button class="cfm-c1" id="__cfmN">'+(opts.cancel||'Cancelar')+'</button><button class="cfm-c2'+btnCls+'" id="__cfmY">'+(opts.ok||'Confirmar')+'</button></div></div>';document.body.appendChild(c);document.getElementById('__cfmY').onclick=function(){c.remove();res(true);};document.getElementById('__cfmN').onclick=function(){c.remove();res(false);};c.onclick=function(e){if(e.target===c){c.remove();res(false);}};});}`;
var AUTH_ADMIN = "var tk=localStorage.getItem('hrm_token'),U=JSON.parse(localStorage.getItem('hrm_user')||'{}');if(!tk||U.rol!=='admin')window.location.href='/';";
var AUTH_ANY = "var tk=localStorage.getItem('hrm_token'),U=JSON.parse(localStorage.getItem('hrm_user')||'{}');if(!tk)window.location.href='/';";
var LOGOUT_FN = "async function logout(){var ok=true;if(typeof confirmAction==='function'){ok=await confirmAction({title:'Cerrar sesi\xF3n',msg:'Saldr\xE1s del portal HRM. Tendr\xE1s que iniciar sesi\xF3n de nuevo.',ok:'Salir',danger:false});}else{ok=confirm('\xBFCerrar sesi\xF3n?');}if(!ok)return;fetch('/api/logout',{method:'POST',headers:{'Authorization':'Bearer '+tk,'Content-Type':'application/json'}});localStorage.removeItem('hrm_token');localStorage.removeItem('hrm_user');window.location.href='/';}";
var FMT_FN = "var fmt=function(n){return new Intl.NumberFormat('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)};";
function pageLogin() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HRM \u2014 Portal de Clientes</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;background:linear-gradient(150deg,#e8f4f8 0%,#d5eff3 40%,#c4e8ee 100%);color:#1a2e3a}
.nav{padding:18px 40px;background:rgba(255,255,255,.88);backdrop-filter:blur(12px);border-bottom:1px solid #b8ced8}.nav img{height:90px}
.center{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.card{background:#fff;border:1px solid #b8ced8;border-radius:20px;padding:40px;width:100%;max-width:400px;box-shadow:0 8px 40px rgba(26,46,58,.08);position:relative;overflow:hidden}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#1a8a8a,#40c8c8,#1a8a8a)}
.card img{height:70px;display:block;margin:0 auto 28px}
.card h2{font-size:22px;font-weight:800;text-align:center;margin-bottom:4px}
.card .sub{color:#5f7d8a;font-size:14px;text-align:center;margin-bottom:28px}
label{display:block;font-size:11px;font-weight:700;color:#5f7d8a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}
input{width:100%;padding:13px 16px;background:#f0f6f8;border:1.5px solid #b8ced8;border-radius:10px;color:#1a2e3a;font-size:15px;outline:none;transition:all .2s;margin-bottom:16px;font-family:inherit}
input:focus{border-color:#1a8a8a;background:#fff;box-shadow:0 0 0 3px rgba(26,138,138,.08)}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
.btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(26,138,138,.3)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.error{background:rgba(217,68,82,.06);border:1px solid rgba(217,68,82,.15);color:#d94452;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;display:none}
.foot{text-align:center;padding:20px;font-size:12px;color:#5f7d8a}
.pw-wrap{position:relative}
.pw-toggle{position:absolute;right:12px;top:13px;cursor:pointer;color:#8ba5b2;font-size:11px;font-weight:700;user-select:none;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.05em}
.pw-toggle:hover{color:#1a8a8a;background:#f0f6f8}
.lgo{position:fixed;inset:0;background:rgba(13,30,42,.55);backdrop-filter:blur(4px);z-index:9998;display:none;align-items:center;justify-content:center}
.lgo.sh{display:flex}
.lgo-c{background:#fff;border-radius:16px;padding:32px 44px;min-width:280px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.25)}
.lgo-sp{width:48px;height:48px;border:4px solid #e8f1f4;border-top-color:#1a8a8a;border-radius:50%;margin:0 auto 18px;animation:lgoRot 1s linear infinite}
.lgo-t{font-size:15px;font-weight:700;color:#1a2e3a}
@keyframes lgoRot{from{transform:rotate(0)}to{transform:rotate(360deg)}}
</style></head><body style="overflow-x:hidden;margin:0">
<nav class="nav"><img src="${LOGO}" alt="HRM"></nav>
<div class="center">
  <div class="card">
    <img src="${LOGO}" alt="HRM">
    <h2>Portal de Clientes</h2>
    <p class="sub">Ingresa tus credenciales para acceder</p>
    <div class="error" id="error"></div>
    <form id="lf">
      <label>Correo electr\xF3nico</label>
      <input type="email" id="email" placeholder="tu@empresa.com" autocomplete="email" required>
      <label>Contrase\xF1a</label>
      <div class="pw-wrap"><input type="password" id="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password" required><span class="pw-toggle" id="pwTog" onclick="togPw()">Mostrar</span></div>
      <button type="submit" class="btn" id="btn">Iniciar sesi\xF3n</button>
    </form>
    <p style="text-align:center;margin-top:20px;font-size:12px;color:#5f7d8a">\xBFNecesitas acceso? Contacta a tu administrador HRM</p>
    <p style="text-align:center;margin-top:8px"><a href="#" onclick="showForgot()" style="font-size:13px;color:#1a8a8a;text-decoration:none;font-weight:600">\xBFOlvidaste tu contrase\xF1a?</a></p>
  </div>
  <div id="forgotModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;display:none;align-items:center;justify-content:center">
    <div style="background:#fff;border-radius:20px;padding:36px;width:100%;max-width:400px;box-shadow:0 16px 48px rgba(0,0,0,.15)">
      <h3 style="font-size:18px;font-weight:800;margin-bottom:8px">Recuperar contrase\xF1a</h3>
      <p style="color:#5f7d8a;font-size:13px;margin-bottom:20px">Ingresa tu correo y te enviaremos un enlace para restablecer tu contrase\xF1a</p>
      <div id="fMsg" style="display:none;padding:10px;border-radius:8px;font-size:13px;margin-bottom:14px"></div>
      <label>Correo electr\xF3nico</label>
      <input type="email" id="fEmail" placeholder="tu@empresa.com">
      <button class="btn" onclick="sendRecover()" id="fBtn" style="width:100%;margin-top:4px">Enviar enlace</button>
      <p style="text-align:center;margin-top:14px"><a href="#" onclick="closeForgot()" style="font-size:13px;color:#3d5a6b">Cancelar</a></p>
    </div>
  </div>
</div>
<div id="__lgo" class="lgo"><div class="lgo-c"><div class="lgo-sp"></div><div class="lgo-t" id="__lgoT">Iniciando sesi\xF3n...</div></div></div>
<div class="foot">\xA9 2026 HRM Human Resources Management</div>
<script>
// Clear old session on login page load
localStorage.removeItem('hrm_token');
localStorage.removeItem('hrm_user');

document.getElementById('lf').addEventListener('submit', async function(e) {
  e.preventDefault();
  var btn = document.getElementById('btn'), err = document.getElementById('error');
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Verificando...';
  var lgo = document.getElementById('__lgo'); if(lgo){document.getElementById('__lgoT').textContent='Verificando credenciales...';lgo.classList.add('sh');}
  try {
    var r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
    });
    var d = await r.json();
    if (!r.ok) {
      if(lgo)lgo.classList.remove('sh');
      err.textContent = d.error || 'Credenciales inv\xE1lidas'; err.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Iniciar sesi\xF3n'; return;
    }
    localStorage.setItem('hrm_token', d.token);
    localStorage.setItem('hrm_user', JSON.stringify(d.user));
    if(lgo){document.getElementById('__lgoT').textContent='Cargando portal...';}
    window.location.href = d.user.rol === 'admin' ? '/admin' : '/portal';
  } catch (x) {
    if(lgo)lgo.classList.remove('sh');
    err.textContent = 'Error de conexi\xF3n'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Iniciar sesi\xF3n';
  }
});
function togPw(){var p=document.getElementById('password'),t=document.getElementById('pwTog');if(p.type==='password'){p.type='text';t.textContent='Ocultar';}else{p.type='password';t.textContent='Mostrar';}}
function showForgot(){document.getElementById('forgotModal').style.display='flex';}
function closeForgot(){document.getElementById('forgotModal').style.display='none';}
async function sendRecover(){
  var btn=document.getElementById('fBtn'),msg=document.getElementById('fMsg'),em=document.getElementById('fEmail').value;
  if(!em){msg.style.display='block';msg.style.background='rgba(217,68,82,.06)';msg.style.border='1px solid rgba(217,68,82,.15)';msg.style.color='#d94452';msg.textContent='Ingresa tu correo';return}
  btn.disabled=true;btn.textContent='Enviando...';
  try{
    var r=await fetch('/api/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em})});
    var d=await r.json();
    msg.style.display='block';msg.style.background='rgba(32,160,160,.08)';msg.style.border='1px solid rgba(32,160,160,.2)';msg.style.color='#1a8a8a';
    msg.textContent=d.message||'Enlace enviado';
    if(d._debug&&d._debug.recover_url){msg.innerHTML+='<br><br><a href="'+d._debug.recover_url+'" style="color:#1a8a8a;word-break:break-all;font-size:11px">'+d._debug.recover_url+'</a><br><span style="font-size:10px;color:#5f7d8a">(Link visible porque el servicio de email no est\xE1 configurado)</span>'}
    btn.textContent='Enviado';
  }catch(x){msg.style.display='block';msg.textContent='Error de conexi\xF3n';btn.disabled=false;btn.textContent='Enviar enlace'}
}
<\/script></body></html>`;
}
__name(pageLogin, "pageLogin");
function pageAdmin() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin \u2014 HRM</title>
<style>
${CSS}
*{box-sizing:border-box}
.lay{display:flex;height:calc(100vh - 60px);overflow:hidden}
.sb{width:270px;background:#fff;border-right:1px solid #d4e5eb;flex-shrink:0;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden}
.sb-hd{padding:18px 18px 12px;border-bottom:1px solid #e8f1f4}
.sb-hd h3{font-size:11px;font-weight:700;color:#8ba5b2;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px}
.sb-search{width:100%;padding:8px 12px;font-size:12px;border:1px solid #d4e5eb;border-radius:8px;background:#f8fbfc;color:#1a2e3a;outline:none;transition:border .15s}
.sb-search:focus{border-color:#1a8a8a}
.sb-list{flex:1;overflow-y:auto;padding:6px 0}
.sb-it{display:flex;align-items:center;gap:10px;padding:11px 18px;cursor:pointer;font-size:13px;font-weight:500;color:#5a7a8a;border-left:3px solid transparent;transition:all .12s}
.sb-it:hover{background:rgba(26,138,138,.03);color:#1a2e3a}
.sb-it.act{background:rgba(26,138,138,.06);color:#1a8a8a;border-left-color:#1a8a8a;font-weight:700}
.sb-it .dot{width:8px;height:8px;border-radius:50%;background:#20a0a0;flex-shrink:0}
.sb-it .ini{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
.sb-it .inf{flex:1;min-width:0}
.sb-it .inf .nm{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-it .inf .rf{font-size:10px;color:#8ba5b2;font-family:monospace}
.sb-add{display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;margin:8px 14px 14px;cursor:pointer;font-size:12px;font-weight:700;color:#1a8a8a;border-radius:10px;border:2px dashed #c8dfe8;transition:all .15s;background:#f8fbfc}
.sb-add:hover{background:#e8f5f5;border-color:#1a8a8a}
.mn{flex:1;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;background:#f0f6f8;min-width:0}
.mn-hd{padding:20px 28px 16px;background:#fff;border-bottom:1px solid #d4e5eb;display:flex;align-items:center;justify-content:space-between}
.mn-hd .left h1{font-size:20px;font-weight:800;color:#1a2e3a;margin-bottom:1px}
.mn-hd .left .sub{color:#8ba5b2;font-size:12px}
.mn-hd .right{display:flex;gap:8px}
.mn-bd{padding:24px 28px;flex:1;overflow-y:auto;overflow-x:hidden}
.bc{display:flex;align-items:center;gap:6px;margin-bottom:18px;font-size:12px;color:#8ba5b2}
.bc span{cursor:pointer;transition:color .12s}
.bc span:hover{color:#1a8a8a}
.bc .cur{color:#1a8a8a;font-weight:700;cursor:default}
.bc .sep{color:#c8dfe8;font-size:10px;cursor:default}
.tabs{display:flex;gap:4px;margin-bottom:20px;background:#fff;border:1px solid #d4e5eb;border-radius:12px;padding:4px}
.tab{flex:1;padding:10px 8px;text-align:center;border-radius:9px;font-size:12px;font-weight:600;color:#8ba5b2;cursor:pointer;transition:all .15s;position:relative}
.tab:hover{color:#5a7a8a;background:rgba(26,138,138,.03)}
.tab.act{background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;box-shadow:0 2px 8px rgba(26,138,138,.25)}
.tab .badge{display:inline-block;margin-left:4px;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:800;background:rgba(26,138,138,.1);color:#1a8a8a}
.tab.act .badge{background:rgba(255,255,255,.25);color:#fff}
.step{display:flex;gap:12px;margin-bottom:20px}
.step-i{flex:1;padding:14px 16px;background:#fff;border:2px solid #d4e5eb;border-radius:12px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden}
.step-i:hover{border-color:#1a8a8a;box-shadow:0 2px 12px rgba(26,138,138,.06)}
.step-i.act{border-color:#1a8a8a;background:#f0fafa}
.step-i.done{border-color:#20a0a0;background:#f0fafa}
.step-i .sn{font-size:10px;font-weight:800;color:#8ba5b2;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.step-i.act .sn,.step-i.done .sn{color:#1a8a8a}
.step-i .sv{font-size:15px;font-weight:800;color:#1a2e3a}
.step-i.done .sv{color:#1a8a8a}
.step-i .ck{position:absolute;top:10px;right:10px;width:22px;height:22px;border-radius:50%;background:#1a8a8a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px}
.chips{display:flex;flex-wrap:wrap;gap:6px;padding:12px 0}
.chip{padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;background:#fff;color:#5a7a8a;border:1px solid #d4e5eb;transition:all .15s}
.chip:hover{border-color:#1a8a8a;color:#1a2e3a;box-shadow:0 2px 8px rgba(26,138,138,.06)}
.chip.act{background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;border-color:transparent;box-shadow:0 2px 10px rgba(26,138,138,.2)}
.chip.has{border-color:#20a0a0;background:#f0fafa;color:#1a8a8a;font-weight:700}
.ug{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin:16px 0}
.uc{background:#fff;border:2px solid #d4e5eb;border-radius:14px;padding:20px 16px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.uc:hover{border-color:#1a8a8a;transform:translateY(-3px);box-shadow:0 8px 24px rgba(26,138,138,.08)}
.uc.hf{border-color:#20a0a0;background:#f0fafa}
.uc .ic{margin-bottom:10px}
.uc .nm{font-size:13px;font-weight:700;color:#1a2e3a;margin-bottom:2px}
.uc .ds{font-size:11px;color:#8ba5b2}
.uc .ck{position:absolute;top:10px;right:10px;width:22px;height:22px;border-radius:50%;background:#1a8a8a;color:#fff;font-size:11px;display:none;align-items:center;justify-content:center;font-weight:800}
.uc.hf .ck{display:flex}
.uc .fi{margin-top:10px;font-size:10px;color:#1a8a8a;font-weight:600;background:#e8f5f5;padding:6px 8px;border-radius:6px;word-break:break-all;text-align:left}
.ab{display:flex;gap:12px;align-items:center;padding:16px 0}
.pb{height:4px;background:#e8f1f4;border-radius:4px;margin-top:8px;overflow:hidden;display:none}
.pb .fl{height:100%;background:linear-gradient(90deg,#1a8a8a,#40c8c8);width:0;transition:width .3s;border-radius:4px}
.dr{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;border:1px solid #d4e5eb;border-radius:10px;margin-bottom:6px;font-size:12px}
.dr .dn{flex:1;font-weight:600;color:#1a2e3a}
.dr .dtp{background:#f0f6f8;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;color:#8ba5b2;text-transform:uppercase}
.toast{position:fixed;bottom:20px;right:20px;padding:14px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:999;animation:sU .3s ease;box-shadow:0 4px 16px rgba(0,0,0,.12)}
.toast-ok{background:#1a8a8a;color:#fff}
.toast-err{background:#d94452;color:#fff}
@keyframes sU{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.mo{position:fixed;inset:0;background:rgba(26,46,58,.5);backdrop-filter:blur(4px);z-index:100;display:none;align-items:center;justify-content:center}
.mo.sh{display:flex}
.mo-c{background:#fff;border-radius:18px;padding:28px;width:100%;max-width:480px;box-shadow:0 24px 48px rgba(26,46,58,.15)}
.mo-c h2{font-size:18px;font-weight:800;color:#1a2e3a;margin-bottom:3px}
.mo-c .sub{color:#8ba5b2;font-size:13px;margin-bottom:20px}
input[type=file]{display:none}
.np-box{background:#fff;border:2px solid #d4e5eb;border-radius:14px;padding:20px;margin-bottom:16px}
.np-box h4{font-size:13px;font-weight:700;color:#1a8a8a;margin-bottom:4px}
.np-box p{font-size:12px;color:#8ba5b2;margin-bottom:14px}
.empty{text-align:center;padding:60px 20px}
.empty svg{margin-bottom:16px;opacity:.3}
.empty h3{font-size:16px;color:#5a7a8a;margin-bottom:6px}
.empty p{font-size:13px;color:#8ba5b2;max-width:280px;margin:0 auto}
.map-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:10px 14px;background:#fff;border:1px solid #d4e5eb;border-radius:10px;transition:border-color .15s}
.map-row.done{border-color:#20a0a0;background:#f8fcfc}
.map-row .ml{flex:1}
.map-row .ml .mn2{font-size:12px;font-weight:600;color:#1a2e3a}
.map-row .ml .md{font-size:10px;color:#8ba5b2}
.map-row input{width:200px;padding:7px 10px;font-size:12px;background:#f8fbfc;border:1px solid #d4e5eb;border-radius:8px;color:#1a2e3a;outline:none;transition:border .15s}
.map-row input:focus{border-color:#1a8a8a}
.cat-hd{font-size:11px;font-weight:700;color:#1a8a8a;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid #e8f1f4}
.isn-tbl{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;border-radius:12px;overflow:hidden;border:1px solid #d4e5eb}
.isn-tbl thead{background:#f0f6f8}
.isn-tbl th{padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#8ba5b2;text-transform:uppercase;letter-spacing:.06em}
.isn-tbl td{padding:9px 12px;border-top:1px solid #e8f1f4;color:#5a7a8a}
.isn-tbl tr:hover td{background:rgba(26,138,138,.02)}
.isn-tbl .mono{font-family:monospace;font-size:11px;color:#1a2e3a;font-weight:600}
.isn-tbl .rate{font-family:monospace;color:#d4920a;font-weight:700;text-align:right}
.tag-g{color:#1a8a8a;font-weight:600;font-size:11px}
.tag-r{color:#d94452;font-weight:700;font-size:11px}
@media(max-width:768px){.sb{display:none}.mn-bd{padding:16px}.step{flex-direction:column}}

.yr-btn:hover,.mo-btn:hover,.fc-main:hover,.fc-other:hover,.of-item:hover{border-color:#1a8a8a!important}

@media(max-width:768px){
  .mn-hd{padding:14px 16px;flex-wrap:wrap;gap:8px}
  .mn-hd .left h1{font-size:16px}
  .mn-hd .right{gap:4px}
  .mn-hd .right .bo{font-size:10px;padding:5px 8px}
  .ug{grid-template-columns:1fr 1fr!important}
  .chips{gap:4px}
  .chip{padding:6px 12px;font-size:12px}
}
@media(max-width:480px){
  .mn-hd .left h1{font-size:14px}
  .ug{grid-template-columns:1fr!important}
  .mo-c{padding:18px;margin:10px;max-width:calc(100vw - 20px)}
}
</style><script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"><\/script></head><html style="overflow-x:hidden"><body style="overflow-x:hidden;max-width:100vw;margin:0">
<div class="top"><div class="top-l"><img src="${LOGO}" alt="HRM"><span style="color:#1a8a8a;font-weight:700">Administrador</span></div><div class="top-r"><span id="uN" style="color:#5a7a8a;font-size:13px"></span><button class="bo" onclick="showMapeo()" data-tip="Configurar mapeo de columnas Excel" style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 3H3v18h18z"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>Mapeo</button><button class="bo" onclick="showBases()" data-tip="Bases ISN por registro patronal" style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>Bases ISN</button><button class="bo" onclick="showMo('usuario')" data-tip="Gestionar usuarios y accesos al portal" style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Usuarios</button><a href="/portal" class="bo" data-tip="Abrir vista de cliente" style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Ver portal</a><button class="bo br" onclick="logout()" data-tip="Cerrar sesi\xF3n" style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Salir</button></div></div>
<div class="lay">
<div class="sb">
  <div class="sb-hd">
    <h3>Clientes <span id="cCount" style="background:#1a8a8a;color:#fff;padding:1px 7px;border-radius:10px;font-size:9px;font-weight:800;margin-left:6px"></span></h3>
    <input class="sb-search" id="sSearch" placeholder="Buscar cliente..." oninput="filterClients()">
  </div>
  <div class="sb-list" id="cList"></div>
  <div class="sb-add" onclick="showMo('empresa')">+ Nuevo cliente</div>
</div>
<div class="mn">
  <div class="mn-hd"><div class="left"><h1 id="mT">Panel de administraci\xF3n</h1><div class="sub" id="mS">Selecciona un cliente para comenzar</div></div><div class="right" id="mR"></div></div>
  <div class="mn-bd" id="mB"><div class="empty" style="padding:80px 20px;text-align:center"><div style="display:inline-block;padding:24px;background:linear-gradient(135deg,#f0fafa,#fff);border-radius:50%;margin-bottom:20px;box-shadow:0 4px 16px rgba(26,138,138,.08)"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#1a8a8a" stroke-width="1.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><h3 style="font-size:18px;color:#1a2e3a;margin-bottom:8px">Bienvenido al panel HRM</h3><p style="font-size:13px;color:#5a7a8a;max-width:380px;margin:0 auto 20px">Selecciona un cliente de la barra izquierda para comenzar a gestionar sus periodos de n\xF3mina, o crea uno nuevo.</p><div style="display:inline-flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="bo" style="padding:10px 20px;font-size:13px;background:#1a8a8a;color:#fff;border:none" onclick="showMo(&#39;empresa&#39;)">+ Nuevo cliente</button><button class="bo" style="padding:10px 20px;font-size:13px" onclick="showMo(&#39;usuario&#39;)">Gestionar usuarios</button></div></div></div>
</div>
</div>
<div class="mo" id="mo-empresa"><div class="mo-c"><h2>Nuevo cliente</h2><div class="sub">Registra una empresa para gestionar su n\xF3mina</div><label>Raz\xF3n social</label><input id="en"><div class="fr"><div><label>RFC</label><input id="er"></div><div><label>Slug</label><input id="es" placeholder="nombre-corto"></div></div><div style="display:flex;gap:10px;margin-top:12px"><button class="btn" onclick="cE()">Crear cliente</button><button class="bo" onclick="hideMo()">Cancelar</button></div></div></div>
<div class="mo" id="mo-usuario"><div class="mo-c"><h2>Gesti\xF3n de usuarios</h2><div class="sub">Administra accesos al portal</div><div id="uList" style="max-height:220px;overflow-y:auto;margin-bottom:14px"></div><h3 style="font-size:13px;font-weight:700;margin-bottom:10px;padding-top:12px;border-top:1px solid #e8f1f4">Agregar usuario</h3><div class="fr"><div><label>Nombre</label><input id="un"></div><div><label>Email</label><input id="ue" type="email"></div></div><div class="fr"><div><label>Contrase\xF1a</label><input id="up" type="password"></div><div><label>Rol</label><select id="ur"><option value="socio">Socio</option><option value="admin">Admin</option></select></div></div><label>Empresa</label><select id="ux"><option value="">\u2014 Sin empresa \u2014</option></select><div style="display:flex;gap:10px;margin-top:12px"><button class="btn" onclick="cU()">Crear usuario</button><button class="bo" onclick="hideMo()">Cerrar</button></div></div></div>
<script>
${AUTH_ADMIN}
${LOGOUT_FN}
${UI_FN}
document.getElementById('uN').textContent=U.nombre;
var H={'Content-Type':'application/json','Authorization':'Bearer '+tk};
var CE=null,CP=null,EMPS=[],PERS=[],FILES={},FILES_OTROS=[];
var CATS=[{k:'nomina',ic:'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a8a8a" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',nm:'N\xF3mina',ds:'Archivos de n\xF3mina',ac:'.xlsx,.xls,.csv'},{k:'acumulado',ic:'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2a7ab5" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',nm:'Acumulado',ds:'Resumen acumulado',ac:'.xlsx,.xls'},{k:'contabilidad',ic:'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7b5ea7" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',nm:'Contabilidad',ds:'Archivo contable',ac:'.xlsx,.xls'},{k:'cfdi',ic:'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d4920a" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>',nm:'CFDIs',ds:'Timbres fiscales',ac:'.xlsx,.xls,.xml'},{k:'informe',ic:'<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d94452" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',nm:'Informe',ds:'PDF supervisi\xF3n',ac:'.pdf'}];
async function seedNotas(){
  if(!CP||!CE)return;
  showLoading('Preparando secciones...','Creando placeholders para las 12 secciones del reporte');
  try{
    var r=await fetch('/api/seed-placeholders',{method:'POST',headers:H,body:JSON.stringify({periodo_id:CP.id,empresa_id:CE.id})});
    hideLoading();
    if(r.ok){toast('Secciones preparadas. Ahora puedes subir los archivos.',true);renderClient()}
    else{var e=await r.json().catch(function(){return{}});toast('Error: '+(e.error||'desconocido'),false)}
  }catch(err){hideLoading();toast('Error: '+err.message,false)}
}
function toast(t,ok){var d=document.createElement('div');d.className='toast '+(ok?'toast-ok':'toast-err');d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.remove()},3000)}
function showMo(id){document.getElementById('mo-'+id).classList.add('sh')}
function hideMo(){document.querySelectorAll('.mo').forEach(function(m){m.classList.remove('sh')})}
document.querySelectorAll('.mo').forEach(function(m){m.addEventListener('click',function(e){if(e.target===m)hideMo()})});
function filterClients(){var q=document.getElementById('sSearch').value.toLowerCase();document.querySelectorAll('#cList .sb-it').forEach(function(el){el.style.display=el.textContent.toLowerCase().includes(q)?'':'none'})}
async function loadAll(){
  showLoading('Cargando panel...','Consultando clientes, periodos y usuarios');
  try{
  var r=await fetch('/api/empresas',{headers:H});
  if(r.status===401){localStorage.removeItem('hrm_token');localStorage.removeItem('hrm_user');window.location.href='/';return}
  if(!r.ok){toast('Error cargando empresas ('+r.status+')',false);return}
  var d=await r.json();EMPS=d.empresas||[];
  var cl=document.getElementById('cList');cl.innerHTML='';
  if(!EMPS.length){cl.innerHTML='<div style="padding:20px 16px;text-align:center;color:#8ba5b2;font-size:12px">Sin clientes registrados</div>'}
  EMPS.forEach(function(e){var ini=e.nombre.substring(0,2).toUpperCase();cl.innerHTML+='<div class="sb-it'+(CE&&CE.id===e.id?' act':'')+'" onclick="selE('+e.id+')"><div class="ini">'+ini+'</div><div class="inf"><div class="nm">'+e.nombre.substring(0,28)+'</div><div class="rf">'+(e.rfc||'Sin RFC')+'</div></div></div>'});
  var cc=document.getElementById('cCount');if(cc)cc.textContent=EMPS.length;
  ['ux'].forEach(function(id){var s=document.getElementById(id);if(!s)return;s.innerHTML='<option value="">\u2014 Sin empresa \u2014</option>';EMPS.forEach(function(e){s.innerHTML+='<option value="'+e.id+'">'+e.nombre+'</option>'})});
  var r2=await fetch('/api/periodos',{headers:H});
  if(r2.status===401){localStorage.removeItem('hrm_token');localStorage.removeItem('hrm_user');window.location.href='/';return}
  if(r2.ok){PERS=(await r2.json()).periodos||[]}else{PERS=[]}
  var r3=await fetch('/api/usuarios',{headers:H});
  if(r3.ok){var us=(await r3.json()).usuarios||[];
  var ul=document.getElementById('uList');if(ul){ul.innerHTML='';
  us.forEach(function(u){ul.innerHTML+='<div class="dr"><div class="ini" style="width:28px;height:28px;font-size:10px;border-radius:6px">'+u.nombre.substring(0,2).toUpperCase()+'</div><span class="dn">'+u.nombre+'</span><span class="dtp">'+u.rol+'</span><span style="color:#8ba5b2;font-size:10px">'+u.email+'</span><button class="bo" style="font-size:10px;padding:3px 8px;margin-left:auto" onclick="resetPw('+u.id+',&#39;'+u.nombre.replace(/'/g,'')+'&#39;)">Reset</button></div>'})}}
  if(CE)selE(CE.id);
  hideLoading();
  }catch(err){
    hideLoading();
    document.getElementById('cList').innerHTML='<div style="padding:16px;color:#d94452;font-size:11px">Error: '+err.message+'</div>';
    console.error('loadAll:',err);
  }
}
var CY=null,CM=null,VIEW='periodos';
function backToClient(){VIEW='periodos';renderClient();}
function showMapeo(){
  if(!CE){toast('Selecciona un cliente primero',false);return;}
  VIEW='mapeo';
  document.getElementById('mT').textContent='Mapeo de columnas';
  document.getElementById('mS').textContent=CE.nombre+' \xB7 '+(CE.rfc||'Sin RFC');
  var mb=document.getElementById('mB');
  mb.innerHTML='<a href="#" onclick="event.preventDefault();backToClient()" style="display:inline-flex;align-items:center;gap:6px;color:#3d5a6b;font-size:12px;margin-bottom:14px;text-decoration:none;font-weight:600">\u2190 Volver al cliente</a><div id="viewContent"><div style="text-align:center;padding:30px;color:#8ba5b2">Cargando...</div></div>';
  renderMapeo();
}
function showBases(){
  if(!CE){toast('Selecciona un cliente primero',false);return;}
  VIEW='bases';
  document.getElementById('mT').textContent='Bases ISN';
  document.getElementById('mS').textContent=CE.nombre+' \xB7 '+(CE.rfc||'Sin RFC');
  var mb=document.getElementById('mB');
  mb.innerHTML='<a href="#" onclick="event.preventDefault();backToClient()" style="display:inline-flex;align-items:center;gap:6px;color:#3d5a6b;font-size:12px;margin-bottom:14px;text-decoration:none;font-weight:600">\u2190 Volver al cliente</a><div id="viewContent"><div style="text-align:center;padding:30px;color:#8ba5b2">Cargando...</div></div>';
  renderBasesISN();
}

function selE(id){
  CE=EMPS.find(function(e){return e.id===id});if(!CE)return;CY=null;CM=null;CP=null;VIEW='periodos';
  document.querySelectorAll('#cList .sb-it').forEach(function(s,i){s.classList.toggle('act',EMPS[i]&&EMPS[i].id===id)});
  document.getElementById('mT').textContent=CE.nombre;
  document.getElementById('mS').textContent=(CE.rfc||'Sin RFC')+' \xB7 '+CE.slug;
  renderClient();
}
function renderClient(){
  if(!CE)return;
  var mb=document.getElementById('mB');
  var h='';
  h+='<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#8ba5b2;margin-bottom:20px;flex-wrap:wrap">';
  h+='<span style="font-weight:700;color:#1a2e3a">'+CE.nombre+'</span>';
  if(CY)h+=' <span>\u203A</span> <span style="font-weight:600;color:#1a8a8a">'+CY+'</span>';
  if(CM)h+=' <span>\u203A</span> <span style="font-weight:600;color:#1a8a8a;text-transform:capitalize">'+CM+'</span>';
  h+='</div>';
  if(!CY){
    var currentYear=new Date().getFullYear();
    var yearsWithData={};PERS.filter(function(p){return p.empresa_id===CE.id}).forEach(function(p){yearsWithData[p.anio]=true;});
    h+='<div style="margin-bottom:18px"><div style="font-size:13px;font-weight:700;color:#3d5a6b;margin-bottom:4px">Selecciona el a\xF1o</div><div style="font-size:11px;color:#8ba5b2">Los a\xF1os con periodo cargado muestran un punto verde.</div></div>';
    h+='<div style="display:flex;gap:8px;flex-wrap:wrap">';
    for(var y=currentYear+1;y>=2020;y--){
      var hasData=yearsWithData[y];
      h+='<div style="position:relative;padding:12px 22px;background:'+(hasData?'#f0fafa':'#fff')+';border:1.5px solid '+(hasData?'#1a8a8a':'#d0dfe6')+';border-radius:10px;cursor:pointer;font-weight:700;font-size:14px;color:'+(hasData?'#1a8a8a':'#3d5a6b')+';transition:all .15s" onmouseover="this.style.transform=&#39;translateY(-2px)&#39;;this.style.boxShadow=&#39;0 4px 12px rgba(26,138,138,.15)&#39;" onmouseout="this.style.transform=&#39;&#39;;this.style.boxShadow=&#39;&#39;" onclick="CY='+y+';CM=null;CP=null;renderClient()">'+y;
      if(hasData)h+='<span style="position:absolute;top:6px;right:8px;width:7px;height:7px;border-radius:50%;background:#1a8a8a"></span>';
      h+='</div>';
    }
    h+='</div>';mb.innerHTML=h;return;
  }
  if(!CM){
    var meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var hoy=new Date();var mesActual=hoy.getFullYear()===CY?hoy.getMonth():-1;
    h+='<div style="margin-bottom:18px"><div style="font-size:13px;font-weight:700;color:#3d5a6b;margin-bottom:4px">Selecciona el mes de '+CY+'</div><div style="font-size:11px;color:#8ba5b2">Los meses con datos cargados aparecen en verde. El mes actual aparece resaltado.</div></div>';
    h+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
    meses.forEach(function(m,idx){
      var ml=m.toLowerCase();
      var per=PERS.find(function(p){return p.empresa_id===CE.id&&p.mes===ml&&p.anio===CY});
      var ok=per&&per.total_empleados>0;
      var hasPlaceholder=per&&!ok;
      var isCurrent=idx===mesActual;
      var bg=ok?'#f0fafa':(hasPlaceholder?'#fff7e6':'#fff');
      var bc=ok?'#1a8a8a':(hasPlaceholder?'#d4920a':(isCurrent?'#1a8a8a':'#d0dfe6'));
      var color=ok?'#1a8a8a':(hasPlaceholder?'#8a5a00':'#1a2e3a');
      h+='<div style="position:relative;padding:14px 8px;background:'+bg+';border:1.5px solid '+bc+';border-radius:10px;cursor:pointer;text-align:center;transition:all .15s" onmouseover="this.style.transform=&#39;translateY(-2px)&#39;;this.style.boxShadow=&#39;0 4px 12px rgba(0,0,0,.06)&#39;" onmouseout="this.style.transform=&#39;&#39;;this.style.boxShadow=&#39;&#39;" onclick="selM(&#39;'+ml+'&#39;)">';
      if(isCurrent)h+='<span style="position:absolute;top:4px;right:4px;background:#1a8a8a;color:#fff;font-size:8px;padding:1px 5px;border-radius:6px;font-weight:800">HOY</span>';
      h+='<div style="font-weight:700;font-size:13px;color:'+color+'">'+m+'</div>';
      if(ok)h+='<div style="font-size:10px;color:#1a8a8a;margin-top:3px;font-weight:600">&#10003; '+per.total_empleados+' empleados</div>';
      else if(hasPlaceholder)h+='<div style="font-size:10px;color:#d4920a;margin-top:3px;font-weight:600">Pendiente</div>';
      else h+='<div style="font-size:10px;color:#8ba5b2;margin-top:3px">Sin datos</div>';
      h+='</div>';
    });
    h+='</div>';
    h+='<div style="margin-top:14px"><span style="font-size:12px;color:#1a8a8a;cursor:pointer;font-weight:600" onclick="CY=null;renderClient()">\u2190 Cambiar a\xF1o</span></div>';
    mb.innerHTML=h;return;
  }
  CP=PERS.find(function(p){return p.empresa_id===CE.id&&p.mes===CM&&p.anio===CY});
  if(!CP){cPI();return}
  renderFileZone(h);
}
async function cPI(){
  if(!CE||!CM||!CY)return;
  showLoading('Creando periodo '+CM+' '+CY+'...','Inicializando contenedor para los archivos del mes');
  try{
    var resp=await fetch('/api/periodos',{method:'POST',headers:H,body:JSON.stringify({empresa_id:CE.id,mes:CM,anio:CY,total_empleados:0,total_percepciones:0,total_deducciones:0,total_neto:0,total_isn:0})});
    if(!resp.ok){hideLoading();toast('Error creando periodo',false);return}
    var r2=await fetch('/api/periodos',{headers:H});PERS=(await r2.json()).periodos;
    CP=PERS.find(function(p){return p.empresa_id===CE.id&&p.mes===CM&&p.anio===CY});
    hideLoading();
    toast('Periodo '+CM+' '+CY+' creado. Ahora sube los archivos.',true);
    renderClient();
  }catch(e){hideLoading();toast('Error: '+e.message,false);}
}
function renderFileZone(prefix){
  var mb=document.getElementById('mB');
  var h=prefix||'';
  if(CP&&CP.total_empleados>0){
    h+='<div style="background:#f0fafa;border:1px solid #1a8a8a;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
    h+='<div><span style="font-size:12px;font-weight:700;color:#1a8a8a">&#10003; Reporte generado</span>';
    h+='<span style="font-size:11px;color:#5a7a8a;margin-left:12px">'+CP.total_empleados+' empleados</span></div>';
    h+='<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="bo" style="font-size:11px" onclick="reprocesar()" data-tip="Reprocesar todos los archivos guardados (acumulado, CFDI, contabilidad, nomina ISN, informe)">\u21BB Reprocesar todo</button><a href="/reporte?id='+CP.id+'" style="padding:6px 14px;background:#1a8a8a;color:#fff;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none">Ver reporte &#8594;</a></div></div>';
  } else if(CP){
    h+='<div style="background:#fff7e6;border:1px solid #ffd98a;border-left:4px solid #d4920a;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
    h+='<div><span style="font-size:12px;font-weight:700;color:#8a5a00">Reporte pendiente de informaci&#243;n</span>';
    h+='<div style="font-size:11px;color:#5a7a8a;margin-top:2px">Sube la carpeta del mes y el sistema detecta cada archivo autom&#225;ticamente.</div></div>';
    h+='<div style="display:flex;gap:8px"><button class="bo" style="font-size:11px" onclick="seedNotas()">Preparar secciones</button><a href="/reporte?id='+CP.id+'" style="padding:6px 14px;background:#d4920a;color:#fff;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none">Ver reporte &#8594;</a></div></div>';
  }
  var ks=Object.keys(FILES);
  var hasFiles=ks.length>0;
  h+='<div style="font-size:13px;font-weight:700;color:#3d5a6b;margin-bottom:12px">Subir archivos del mes</div>';
  h+='<div id="dz" style="background:'+(hasFiles?'#f0fafa':'#fff')+';border:2px dashed '+(hasFiles?'#1a8a8a':'#a8c5d0')+';border-radius:12px;padding:'+(hasFiles?'18px':'32px 24px')+';text-align:center;transition:all .2s">';
  if(!hasFiles){
    h+='<div style="margin-bottom:12px"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#1a8a8a" stroke-width="1.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>';
    h+='<div style="font-weight:700;font-size:15px;color:#1a2e3a;margin-bottom:4px">Selecciona la carpeta o el ZIP del mes</div>';
    h+='<div style="font-size:12px;color:#5a7a8a;margin-bottom:6px">El sistema detecta autom&#225;ticamente Acumulado, N&#243;mina, Contabilidad, CFDIs, Informe e Impuestos.</div>';
    h+='<div style="font-size:11px;color:#8ba5b2;margin-bottom:14px">Acepta carpeta entera, archivos sueltos o .zip. Tambi&#233;n puedes arrastrarlos aqu&#237;.</div>';
    h+='<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">';
    h+='<button class="bo" style="font-size:12px;padding:8px 18px;background:#1a8a8a;color:#fff;border:none" onclick="document.getElementById(&#39;folderIn&#39;).click()">&#128193; Seleccionar carpeta</button>';
    h+='<button class="bo" style="font-size:12px;padding:8px 18px" onclick="document.getElementById(&#39;filesIn&#39;).click()">&#128206; Archivos / ZIP</button>';
    h+='</div>';
  } else {
    h+=renderDetectedFiles();
  }
  h+='<input type="file" id="folderIn" webkitdirectory directory multiple style="display:none" onchange="onFolder(this.files)">';
  h+='<input type="file" id="filesIn" multiple style="display:none" onchange="onFolder(this.files)">';
  h+='</div>';
  if(hasFiles){
    h+='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">';
    h+='<button id="bU" style="padding:12px 28px;background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(26,138,138,.25);transition:all .15s" onmouseover="this.style.transform=&#39;translateY(-1px)&#39;;this.style.boxShadow=&#39;0 6px 18px rgba(26,138,138,.35)&#39;" onmouseout="this.style.transform=&#39;&#39;;this.style.boxShadow=&#39;0 4px 12px rgba(26,138,138,.25)&#39;" onclick="upAll()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Subir '+ks.length+' archivo'+(ks.length>1?'s':'')+' y procesar</button>';
    h+='<button class="bo" style="font-size:12px;padding:8px 14px" onclick="document.getElementById(&#39;folderIn&#39;).click()">+ Agregar m&#225;s</button>';
    h+='<button class="bo" style="font-size:12px;padding:8px 14px" onclick="confirmAction({title:&#39;\xBFLimpiar selecci\xF3n?&#39;,msg:&#39;Se quitar\xE1n los archivos elegidos. No se borran los que ya est\xE1n subidos al servidor.&#39;,ok:&#39;Limpiar&#39;,danger:true}).then(function(ok){if(ok){FILES={};FILES_OTROS=[];renderClient();}})" data-tip="Quitar archivos pendientes de subir">Limpiar</button>';
    h+='<span id="uSt" style="font-size:12px;color:#8ba5b2"></span></div>';
    h+='<div style="margin-top:4px" id="pb" class="pb"><div class="fl" id="pf"></div></div>';
  }
  h+='<div id="dL" style="margin-top:16px"></div>';
  h+='<div style="margin-top:12px"><span style="font-size:11px;color:#8ba5b2;cursor:pointer" onclick="CM=null;CP=null;FILES={};FILES_OTROS=[];renderClient()">&#8592; Cambiar mes</span></div>';
  mb.innerHTML=h;
  attachDropZone();
  ldD();
}
function renderDetectedFiles(){
  var lbls={acumulado:{n:'Acumulado',c:'#1a8a8a',d:'Excel con todos los periodos',ac:'.xlsx,.xls,.csv'},
           informe:{n:'Informe',c:'#d4920a',d:'PDF de supervisi&#243;n',ac:'.pdf'},
           nomina:{n:'N&#243;mina',c:'#2a7ab5',d:'Excel mensual',ac:'.xlsx,.xls,.csv'},
           contabilidad:{n:'Contabilidad',c:'#7b5ea7',d:'Excel contable / p&#243;lizas',ac:'.xlsx,.xls,.csv'},
           cfdi:{n:'CFDIs',c:'#d4920a',d:'Timbres emitidos',ac:'.xlsx,.xls,.csv,.xml'},
           impuestos:{n:'Impuestos',c:'#7b5ea7',d:'PDF de impuestos',ac:'.pdf'}};
  var order=['acumulado','informe','nomina','contabilidad','cfdi','impuestos'];
  var h='<div style="font-size:11px;font-weight:700;color:#8ba5b2;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;text-align:left">Archivos detectados</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left">';
  order.forEach(function(k){
    var f=FILES[k];var l=lbls[k];
    var clickHandler=f?'':'onclick="pickFor(&#39;'+k+'&#39;)" title="Asignar archivo manualmente"';
    h+='<div style="display:flex;align-items:center;gap:10px;background:'+(f?'#fff':'#f8fbfc')+';border:1px solid '+(f?l.c:'#e0eaef')+';border-radius:8px;padding:10px 12px'+(f?'':';cursor:pointer')+'" '+clickHandler+'>';
    h+='<div style="width:24px;height:24px;border-radius:50%;background:'+(f?l.c:'#d0dfe6')+';display:flex;align-items:center;justify-content:center;flex-shrink:0">';
    h+=f?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':'<span style="color:#fff;font-size:11px;font-weight:700">+</span>';
    h+='</div>';
    h+='<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:'+(f?l.c:'#5a7a8a')+'">'+l.n+'</div>';
    h+='<div style="font-size:10px;color:#8ba5b2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(f?f.name:'click para asignar')+'</div></div>';
    if(f)h+='<span style="font-size:16px;color:#8ba5b2;cursor:pointer;line-height:1;padding:0 4px" onclick="event.stopPropagation();delete FILES[&#39;'+k+'&#39;];renderClient()" title="Quitar">&times;</span>';
    h+='<input type="file" id="mf_'+k+'" accept="'+l.ac+'" style="display:none" onchange="onF(&#39;'+k+'&#39;,this);renderClient()">';
    h+='</div>';
  });
  h+='</div>';
  if(FILES_OTROS&&FILES_OTROS.length){
    h+='<div style="margin-top:10px;padding:8px 12px;background:#f8fbfc;border:1px dashed #d0dfe6;border-radius:8px;font-size:11px;color:#8ba5b2;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px">';
    h+='<span><b>'+FILES_OTROS.length+'</b> archivo'+(FILES_OTROS.length>1?'s':'')+' adicional'+(FILES_OTROS.length>1?'es ignorados':' ignorado')+' (comprobantes, dispersiones, etc.)</span>';
    h+='<span style="cursor:pointer;color:#1a8a8a;font-weight:600" onclick="showOtros()">ver lista</span>';
    h+='</div>';
  }
  return h;
}
function pickFor(tipo){
  if(FILES_OTROS&&FILES_OTROS.length){
    showAsignar(tipo);
  } else {
    document.getElementById('mf_'+tipo).click();
  }
}
function showAsignar(tipo){
  var lbls={acumulado:'Acumulado',informe:'Informe',nomina:'N&#243;mina',contabilidad:'Contabilidad',cfdi:'CFDIs',impuestos:'Impuestos'};
  var h='<div style="position:fixed;inset:0;background:rgba(20,40,55,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)this.remove()">';
  h+='<div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:80vh;overflow:hidden;display:flex;flex-direction:column">';
  h+='<div style="padding:16px 20px;border-bottom:1px solid #e0eaef;display:flex;justify-content:space-between;align-items:center">';
  h+='<div><div style="font-size:11px;color:#8ba5b2;text-transform:uppercase;letter-spacing:.08em;font-weight:700">Asignar como</div>';
  h+='<div style="font-size:15px;font-weight:700;color:#1a2e3a">'+lbls[tipo]+'</div></div>';
  h+='<span style="font-size:22px;color:#8ba5b2;cursor:pointer;line-height:1" onclick="this.closest(&#39;[onclick]&#39;).remove()">&times;</span></div>';
  h+='<div style="padding:8px 12px;background:#f8fbfc;font-size:11px;color:#5a7a8a">Selecciona un archivo de los ignorados o <span style="color:#1a8a8a;cursor:pointer;font-weight:600" onclick="document.getElementById(&#39;mf_'+tipo+'&#39;).click();this.closest(&#39;[onclick]&#39;).remove()">sube uno nuevo</span></div>';
  h+='<div style="overflow:auto;flex:1;padding:8px">';
  FILES_OTROS.forEach(function(f,i){
    h+='<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:6px;cursor:pointer;font-size:12px" onmouseover="this.style.background=&#39;#f0fafa&#39;" onmouseout="this.style.background=&#39;transparent&#39;" onclick="assignOtro('+i+',&#39;'+tipo+'&#39;)">';
    h+='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8ba5b2" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    h+='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+f.name+'</span>';
    h+='<span style="font-size:10px;color:#8ba5b2">'+(f.size>1024*1024?(f.size/1048576).toFixed(1)+'MB':(f.size/1024).toFixed(0)+'KB')+'</span>';
    h+='</div>';
  });
  h+='</div></div></div>';
  var div=document.createElement('div');div.innerHTML=h;document.body.appendChild(div.firstChild);
}
function assignOtro(idx,tipo){
  var f=FILES_OTROS.splice(idx,1)[0];
  FILES[tipo]=f;
  document.querySelectorAll('[onclick]').forEach(function(el){if(el.style.position==='fixed')el.remove()});
  renderClient();
  toast('Asignado a '+tipo,true);
}
function showOtros(){
  var h='<div style="position:fixed;inset:0;background:rgba(20,40,55,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)this.remove()">';
  h+='<div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:80vh;overflow:hidden;display:flex;flex-direction:column">';
  h+='<div style="padding:16px 20px;border-bottom:1px solid #e0eaef;display:flex;justify-content:space-between;align-items:center">';
  h+='<div style="font-size:15px;font-weight:700;color:#1a2e3a">Archivos ignorados ('+FILES_OTROS.length+')</div>';
  h+='<span style="font-size:22px;color:#8ba5b2;cursor:pointer;line-height:1" onclick="this.closest(&#39;[onclick]&#39;).remove()">&times;</span></div>';
  h+='<div style="padding:8px 12px;background:#f8fbfc;font-size:11px;color:#5a7a8a">Estos archivos no se procesar&#225;n. Si alguno deber&#237;a ir a una categor&#237;a, click en la card &quot;no detectado&quot; correspondiente.</div>';
  h+='<div style="overflow:auto;flex:1;padding:8px">';
  FILES_OTROS.forEach(function(f){
    h+='<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:11px;border-bottom:1px solid #f0f4f6">';
    h+='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b8c8d0" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    h+='<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#5a7a8a">'+f.name+'</span>';
    h+='<span style="color:#b8c8d0">'+(f.size>1024*1024?(f.size/1048576).toFixed(1)+'MB':(f.size/1024).toFixed(0)+'KB')+'</span>';
    h+='</div>';
  });
  h+='</div></div></div>';
  var div=document.createElement('div');div.innerHTML=h;document.body.appendChild(div.firstChild);
}
function detectFileType(name){
  var n=name.toLowerCase();
  var ext=n.split('.').pop();
  if(ext==='pdf'){
    if(/impuesto/i.test(n))return 'impuestos';
    if(/informe|supervisi/i.test(n))return 'informe';
    return null;
  }
  if(ext!=='xlsx'&&ext!=='xls'&&ext!=='csv')return null;
  if(/acumulado/i.test(n))return 'acumulado';
  if(/contabilidad|poliza|p.liza|2489/i.test(n))return 'contabilidad';
  if(/emitidos|cfdi|pho190128/i.test(n))return 'cfdi';
  // N\xF3mina: detectar por (a) prefijo d\xEDgito-mes, (b) palabra "isn", (c) palabra "nomina",
  // o (d) cualquier mes en el nombre (\xFAltimo recurso, ya descartados los anteriores)
  if(/^\\d{1,2}[\\s._-]+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(n))return 'nomina';
  if(/\\bisn\\b/i.test(n))return 'nomina';
  if(/n.mina/i.test(n))return 'nomina';
  if(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(n))return 'nomina';
  return null;
}
async function extractZip(zipFile){
  if(!window.JSZip)throw new Error('JSZip no disponible');
  var zip=await JSZip.loadAsync(zipFile);
  var files=[];var tasks=[];
  zip.forEach(function(path,entry){
    if(entry.dir)return;
    var base=path.split('/').pop();
    if(!base||base.startsWith('.')||base.startsWith('~$'))return;
    var ext=base.split('.').pop().toLowerCase();
    if(['xlsx','xls','csv','pdf'].indexOf(ext)===-1)return;
    tasks.push(entry.async('blob').then(function(blob){files.push(new File([blob],base,{type:blob.type||'application/octet-stream'}))}));
  });
  await Promise.all(tasks);
  return files;
}
async function onFolder(fileList){
  if(!fileList||!fileList.length)return;
  var all=[];
  for(var i=0;i<fileList.length;i++){
    var f=fileList[i];
    if(f.name.toLowerCase().endsWith('.zip')){
      toast('Descomprimiendo '+f.name+'...',true);
      try{var extracted=await extractZip(f);all=all.concat(extracted)}
      catch(e){toast('Error al descomprimir '+f.name+': '+e.message,false);console.error(e)}
    } else { all.push(f) }
  }
  var detectados=0;
  for(var j=0;j<all.length;j++){
    var fi=all[j];
    if(fi.name.startsWith('.')||fi.name.startsWith('~$'))continue;
    var tipo=detectFileType(fi.name);
    if(tipo){if(!FILES[tipo]){FILES[tipo]=fi;detectados++}}
    else FILES_OTROS.push(fi);
  }
  renderClient();
  if(detectados===0&&!Object.keys(FILES).length)toast('No se detectaron archivos v&#225;lidos. Revisa los nombres.',false);
  else if(detectados>0)toast(detectados+' archivo'+(detectados>1?'s':'')+' detectado'+(detectados>1?'s':''),true);
}
function attachDropZone(){
  var dz=document.getElementById('dz');if(!dz)return;
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.style.borderColor='#1a8a8a';dz.style.background='#f0fafa'});
  dz.addEventListener('dragleave',function(e){e.preventDefault();if(!Object.keys(FILES).length){dz.style.borderColor='#a8c5d0';dz.style.background='#fff'}});
  dz.addEventListener('drop',function(e){e.preventDefault();onFolder(e.dataTransfer.files)});
}

function toggleOF(){var p=document.getElementById('ofP');if(p)p.style.display=p.style.display==='none'?'block':'none'}


function selM(mes){
  CM=mes;CP=PERS.find(function(p){return p.empresa_id===CE.id&&p.mes===mes&&p.anio===CY});
  FILES={};FILES_OTROS=[];renderClient();
}

function onF(k,inp){if(inp.files&&inp.files.length){FILES[k]=inp.files[0];renderClient()}}
function updB(){var n=Object.keys(FILES).length;var b=document.getElementById('bU');if(b){b.disabled=n===0;b.textContent=n>0?'Subir '+n+' archivo'+(n>1?'s':''):'Subir archivos'}}
async function upAll(){
  var ks=Object.keys(FILES);if(!ks.length)return;
  var b=document.getElementById('bU');if(b)b.disabled=true;
  showLoading('Subiendo archivos...','Preparando '+ks.length+' archivo'+(ks.length>1?'s':''));
  var acumFile=null,informeFile=null,cfdiFile=null,contabFile=null,nominaFile=null,okCount=0,errCount=0,errMsgs=[];
  for(var i=0;i<ks.length;i++){
    var k=ks[i],file=FILES[k];
    setLoadingText('Subiendo '+(i+1)+'/'+ks.length,file.name);
    setLoadingProgress((i/ks.length)*40,'');
    try{
      var fd=new FormData();fd.append('file',file);fd.append('periodo_id',CP.id);fd.append('empresa_id',CE.id);fd.append('tipo',k);
      var r=await fetch('/api/upload',{method:'POST',headers:{'Authorization':'Bearer '+tk},body:fd});
      if(!r.ok){var ed=await r.json().catch(function(){return{error:'HTTP '+r.status}});errCount++;errMsgs.push(k+': '+(ed.error||'error'));continue}
      okCount++;
      if(k==='acumulado')acumFile=file;
      if(k==='informe')informeFile=file;
      if(k==='cfdi')cfdiFile=file;
      if(k==='contabilidad')contabFile=file;
      if(k==='nomina')nominaFile=file;
    }catch(e){errCount++;errMsgs.push(k+': '+e.message)}
  }
  setLoadingProgress(45,'');
  if(acumFile){
    setLoadingText('Procesando acumulado','Generando las 12 secciones del reporte...');
    setLoadingProgress(55,'');
    try{await processExcelFile(acumFile)}catch(e){errMsgs.push('acumulado (proceso): '+e.message);console.error(e)}
  }
  if(cfdiFile){
    setLoadingText('Procesando CFDIs','Calculando totales por periodo desde CFDI...');
    setLoadingProgress(70,'');
    try{await processCfdiFile(cfdiFile)}catch(e){errMsgs.push('cfdi (proceso): '+e.message);console.error(e)}
  }
  if(contabFile){
    setLoadingText('Procesando contabilidad','Extrayendo dispersiones y provision global...');
    setLoadingProgress(80,'');
    try{await processContabilidadFile(contabFile)}catch(e){errMsgs.push('contabilidad (proceso): '+e.message);console.error(e)}
  }
  if(nominaFile){
    setLoadingText('Procesando nomina ISN','Generando seccion X: ISN por estado...');
    setLoadingProgress(88,'');
    try{await processNominaIsnFile(nominaFile)}catch(e){errMsgs.push('nomina ISN (proceso): '+e.message);console.error(e)}
  }
  if(informeFile&&informeFile.name.toLowerCase().endsWith('.pdf')){
    setLoadingText('Procesando informe PDF','Extrayendo texto del PDF de supervision...');
    setLoadingProgress(95,'');
    try{await processInformePDF(informeFile)}catch(e){errMsgs.push('informe PDF: '+e.message);console.error(e)}
  }
  setLoadingProgress(100,'');
  setTimeout(function(){
    hideLoading();
    if(errCount===0&&!errMsgs.length){toast('Archivos subidos y procesados correctamente',true);}
    else if(okCount>0){toast('Subida parcial: '+okCount+' OK, '+errCount+' con error. Revisa consola.',false);console.warn('Errores:',errMsgs);}
    else{toast('No se subio ningun archivo. '+(errMsgs[0]||''),false);console.error('Errores:',errMsgs);}
    if(b)b.disabled=false;FILES={};FILES_OTROS=[];renderClient();
  },400);
}

async function ldD(){
  if(!CP)return;var r=await fetch('/api/documentos?periodo_id='+CP.id,{headers:H});var d=await r.json();
  var dl=document.getElementById('dL');
  if(!d.documentos.length){dl.innerHTML='<div style="color:#8ba5b2;font-size:12px">Sin documentos subidos a\xFAn.</div>';return}
  var h='<div style="font-size:10px;font-weight:700;color:#8ba5b2;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Documentos subidos ('+d.documentos.length+')</div>';
  d.documentos.forEach(function(doc){var ext=doc.nombre.split('.').pop().toLowerCase();h+='<div class="dr"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="'+(ext==='pdf'?'#d94452':'#1a8a8a')+'" stroke-width="2" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span class="dn">'+doc.nombre+'</span><span class="dtp">'+doc.tipo+'</span></div>'});
  dl.innerHTML=h;
}
async function cE(){
  var nombre=document.getElementById('en').value.trim();
  var rfc=document.getElementById('er').value.trim();
  var slug=document.getElementById('es').value.trim();
  if(!nombre||!rfc||!slug){toast('Completa todos los campos',false);return;}
  showLoading('Creando cliente...');
  try{
    var r=await fetch('/api/empresas',{method:'POST',headers:H,body:JSON.stringify({nombre:nombre,rfc:rfc,slug:slug})});
    hideLoading();
    if(!r.ok){var e=await r.json().catch(function(){return{}});toast('Error: '+(e.error||'no se pudo crear'),false);return;}
    toast('Cliente creado',true);hideMo();
    document.getElementById('en').value='';document.getElementById('er').value='';document.getElementById('es').value='';
    loadAll();
  }catch(e){hideLoading();toast('Error: '+e.message,false);}
}
async function cU(){
  var nombre=document.getElementById('un').value.trim();
  var email=document.getElementById('ue').value.trim();
  var password=document.getElementById('up').value;
  var rol=document.getElementById('ur').value;
  var empresa_id=document.getElementById('ux').value||null;
  if(!nombre||!email||!password){toast('Completa nombre, email y contrase\xF1a',false);return;}
  if(password.length<6){toast('La contrase\xF1a debe tener al menos 6 caracteres',false);return;}
  showLoading('Creando usuario...');
  try{
    var r=await fetch('/api/usuarios',{method:'POST',headers:H,body:JSON.stringify({nombre:nombre,email:email,password:password,rol:rol,empresa_id:empresa_id})});
    hideLoading();
    if(!r.ok){var e=await r.json().catch(function(){return{}});toast('Error: '+(e.error||'no se pudo crear'),false);return;}
    toast('Usuario creado',true);
    document.getElementById('un').value='';document.getElementById('ue').value='';document.getElementById('up').value='';
    loadAll();
  }catch(e){hideLoading();toast('Error: '+e.message,false);}
}
async function resetPw(id,nm){
  var ok=await confirmAction({title:'Restablecer contrase\xF1a',msg:'Vas a generar una nueva contrase\xF1a para <b>'+nm+'</b>. La anterior quedar\xE1 invalidada.',ok:'Continuar',danger:false});
  if(!ok)return;
  var np=prompt('Nueva contrase\xF1a para '+nm+' (m\xEDnimo 6 caracteres):');
  if(!np)return;
  if(np.length<6){toast('La contrase\xF1a debe tener al menos 6 caracteres',false);return;}
  showLoading('Actualizando contrase\xF1a...');
  try{
    var r=await fetch('/api/reset-password',{method:'POST',headers:H,body:JSON.stringify({user_id:id,password:np})});
    hideLoading();
    if(r.ok)toast('Contrase\xF1a actualizada para '+nm,true);else toast('Error actualizando contrase\xF1a',false);
  }catch(e){hideLoading();toast('Error: '+e.message,false);}
}

// \u2500\u2500 MAPEO DE COLUMNAS \u2500\u2500
var CONCEPTOS=[
  {c:'periodo',cat:'identificacion',desc:'Columna de periodo (SEM 01, CAT 01, etc.)'},
  {c:'num_empleado',cat:'identificacion',desc:'N\xFAmero de empleado'},
  {c:'nombre_empleado',cat:'identificacion',desc:'Nombre del empleado'},
  {c:'puesto',cat:'identificacion',desc:'Puesto del empleado'},
  {c:'registro_patronal',cat:'identificacion',desc:'Registro patronal (RP)'},
  {c:'fecha_ingreso',cat:'identificacion',desc:'Fecha de ingreso'},
  {c:'rfc',cat:'identificacion',desc:'RFC del empleado'},
  {c:'nss',cat:'identificacion',desc:'N\xFAmero de seguro social'},
  {c:'sueldo',cat:'percepciones',desc:'Sueldo base'},
  {c:'comisiones',cat:'percepciones',desc:'Comisiones'},
  {c:'bono',cat:'percepciones',desc:'Bonos'},
  {c:'aguinaldo',cat:'percepciones',desc:'Aguinaldo'},
  {c:'prima_vacacional',cat:'percepciones',desc:'Prima vacacional'},
  {c:'ptu',cat:'percepciones',desc:'PTU'},
  {c:'despensa',cat:'percepciones',desc:'Vales de despensa'},
  {c:'total_percepciones',cat:'totales',desc:'Total de percepciones'},
  {c:'isr',cat:'deducciones',desc:'ISR retenido'},
  {c:'imss_obrero',cat:'deducciones',desc:'IMSS obrero'},
  {c:'rcv_obrero',cat:'deducciones',desc:'RCV obrero'},
  {c:'infonavit',cat:'deducciones',desc:'Pr\xE9stamo Infonavit'},
  {c:'fonacot',cat:'deducciones',desc:'Pr\xE9stamo FONACOT'},
  {c:'total_deducciones',cat:'totales',desc:'Total de deducciones'},
  {c:'neto',cat:'totales',desc:'Neto sueldo fiscal'},
  {c:'imss_patronal',cat:'patronales',desc:'IMSS patronal'},
  {c:'rcv_patronal',cat:'patronales',desc:'RCV patronal'},
  {c:'infonavit_empresa',cat:'patronales',desc:'Infonavit empresa'},
  {c:'isn',cat:'patronales',desc:'Impuesto sobre n\xF3mina (ISN)'}
];
var XCOLS=[];
var SMART_MAP={'periodo':['SEMANA / CATORCENA','semana','catorcena','periodo'],'num_empleado':['NO.','no.','num'],'nombre_empleado':['Empleado','empleado','nombre'],'puesto':['Puesto','puesto'],'registro_patronal':['RP','REGISTRO PATRONAL','registro patronal'],'fecha_ingreso':['FECHA DE INGRESO','fecha de ingreso'],'rfc':['RFC','rfc'],'nss':['NSS','nss'],'sueldo':['Sueldo','sueldo'],'comisiones':['Comisiones','comision'],'bono':['Bono','bono'],'aguinaldo':['Aguinaldo','aguinaldo'],'prima_vacacional':['Prima vacacional','prima vacacional'],'ptu':['PTU','ptu'],'despensa':['Despensa','despensa'],'total_percepciones':['TOTAL PERCEPCIONES','total percepciones'],'isr':['I.S.R. (sp)','I.S.R','isr'],'imss_obrero':['I.M.S.S.','I.M.S.S','imss'],'rcv_obrero':['rcv (MONTO)','rcv','RCV'],'infonavit':['Pr\xE9stamo Infonavit','infonavit'],'fonacot':['Pr\xE9stamo FONACOT','FONACOT','fonacot'],'total_deducciones':['TOTAL DEDUCCIONES','total deducciones'],'neto':['NETO SUELDO FISCAL','neto sueldo','neto'],'imss_patronal':['Imss','imss patron'],'rcv_patronal':['RCV'],'infonavit_empresa':['Infonavit empresa'],'isn':['Impuesto estatal','isn']};
function detectCSV(input){
  if(!input.files.length)return;
  var file=input.files[0];
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var text=e.target.result;
      var lines=text.split(String.fromCharCode(10));
      if(lines.length<1){toast('Archivo vac\xEDo',false);return}
      var hdr=lines[0].split(',').map(function(c){return c.trim().replace(/^"|"$/g,'')}).filter(function(c){return c.length>0});
      if(hdr.length>2){XCOLS=hdr;toast(hdr.length+' columnas detectadas',true);renderMapeo()}
      else toast('No se detectaron columnas',false);
    }catch(err){toast('Error: '+err.message,false)}
  };
  reader.readAsText(file);
}
function smartMatch(concepto){
  var patterns=SMART_MAP[concepto]||[];
  for(var i=0;i<patterns.length;i++){for(var j=0;j<XCOLS.length;j++){if(XCOLS[j]===patterns[i])return XCOLS[j]}}
  for(var i2=0;i2<patterns.length;i2++){var p=patterns[i2].toLowerCase();for(var j2=0;j2<XCOLS.length;j2++){if(XCOLS[j2].toLowerCase().indexOf(p)!==-1)return XCOLS[j2]}}
  return '';
}
async function renderMapeo(){
  var vc=document.getElementById('viewContent');
  vc.innerHTML='<div style="text-align:center;padding:30px;color:#8ba5b2">Cargando...</div>';
  var r=await fetch('/api/mapeo?empresa_id='+CE.id,{headers:H});
  var d=await r.json();var map={};var total=CONCEPTOS.length,filled=0;
  d.mapeo.forEach(function(m){map[m.concepto_hrm]=m;filled++});
  var cats=[{k:'identificacion',t:'Identificaci\xF3n',ic:'\u{1F464}'},{k:'percepciones',t:'Percepciones',ic:'\u{1F4B0}'},{k:'deducciones',t:'Deducciones',ic:'\u{1F4C9}'},{k:'totales',t:'Totales',ic:'\u{1F4CA}'},{k:'patronales',t:'Patronales',ic:'\u{1F3DB}'}];
  var h='<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#1a2e3a">Mapeo de columnas</div><div style="font-size:12px;color:#8ba5b2">Sube un Excel de muestra para detectar columnas autom\xE1ticamente, o escribe los nombres manualmente.</div></div><div style="text-align:right"><div style="font-size:24px;font-weight:800;color:#1a8a8a">'+filled+'/'+total+'</div><div style="font-size:10px;color:#8ba5b2">configurados</div></div></div>';
  h+='<div style="height:4px;background:#e8f1f4;border-radius:4px;margin-bottom:16px;overflow:hidden"><div style="height:100%;width:'+(filled/total*100)+'%;background:linear-gradient(90deg,#1a8a8a,#40c8c8);border-radius:4px"></div></div>';
  // Upload Excel button
  h+='<div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;padding:14px;background:#fff;border:2px dashed '+(XCOLS.length?'#20a0a0':'#d4e5eb')+';border-radius:12px;cursor:pointer" onclick="document.getElementById(&#39;xlUp&#39;).click()">';
  h+='<input type="file" id="xlUp" accept=".csv,.txt" onchange="detectCSV(this)" style="display:none">';
  if(XCOLS.length){
    h+='<div style="width:36px;height:36px;border-radius:10px;background:#e8f5f5;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a8a8a" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>';
    h+='<div><div style="font-size:13px;font-weight:700;color:#1a8a8a">'+XCOLS.length+' columnas detectadas</div><div style="font-size:11px;color:#8ba5b2">Haz clic para cargar otro archivo</div></div>';
  }else{
    h+='<div style="width:36px;height:36px;border-radius:10px;background:#f0f6f8;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8ba5b2" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>';
    h+='<div><div style="font-size:13px;font-weight:700;color:#1a2e3a">Subir CSV de muestra</div><div style="font-size:11px;color:#8ba5b2">Guarda tu Excel como CSV y s\xFAbelo para detectar columnas</div></div>';
  }
  h+='</div>';
  if(XCOLS.length&&filled<total){
    h+='<button class="btn" style="margin-bottom:16px;font-size:12px;padding:10px 20px" onclick="autoMapAll()">Auto-mapear todo ('+XCOLS.length+' columnas)</button> ';
    h+='<button class="bo" style="margin-bottom:16px;font-size:12px;padding:10px 16px" onclick="saveAllMaps()">Guardar todos los cambios</button>';
  }
  cats.forEach(function(cat){
    var items=CONCEPTOS.filter(function(c2){return c2.cat===cat.k});
    var catFilled=items.filter(function(c2){return map[c2.c]}).length;
    h+='<div class="cat-hd">'+cat.ic+' '+cat.t+' ('+catFilled+'/'+items.length+')</div>';
    items.forEach(function(item){
      var m=map[item.c];
      var autoVal=(!m&&XCOLS.length)?smartMatch(item.c):'';
      h+='<div class="map-row'+(m?' done':'')+'">';
      h+='<div class="ml"><div class="mn2">'+item.c.replace(/_/g,' ')+'</div><div class="md">'+item.desc+'</div></div>';
      if(XCOLS.length){
        h+='<select id="map_'+item.c+'" style="width:220px;padding:7px 10px;font-size:12px;background:#f8fbfc;border:1px solid #d4e5eb;border-radius:8px;color:#1a2e3a;outline:none">';
        h+='<option value="">\u2014 Seleccionar columna \u2014</option>';
        XCOLS.forEach(function(col){var sel=(m&&m.columna_cliente===col)||(!m&&autoVal===col);h+='<option value="'+col.replace(/"/g,'&quot;')+'"'+(sel?' selected':'')+'>'+col+'</option>'});
        h+='</select>';
      }else{
        h+='<input id="map_'+item.c+'" placeholder="Columna en Excel" value="'+(m?m.columna_cliente:'')+'" style="width:220px;padding:7px 10px;font-size:12px;background:#f8fbfc;border:1px solid #d4e5eb;border-radius:8px;color:#1a2e3a;outline:none">';
      }
      h+='<button class="bo" style="font-size:10px;padding:5px 12px" onclick="saveMap(&#39;'+item.c+'&#39;,&#39;'+item.cat+'&#39;)">'+(m?'\u2713':'Guardar')+'</button>';
      if(m)h+='<button class="bo" style="font-size:10px;padding:5px 8px;color:#d94452" onclick="delMap('+m.id+')">\u2715</button>';
      h+='</div>';
    });
  });
  vc.innerHTML=h;
}
async function autoMapAll(){
  var count=0;
  for(var i=0;i<CONCEPTOS.length;i++){
    var c=CONCEPTOS[i];var sel=document.getElementById('map_'+c.c);
    if(sel&&!sel.value){var auto=smartMatch(c.c);if(auto){sel.value=auto;count++}}
  }
  toast(count+' columnas auto-mapeadas',true);
}
async function saveAllMaps(){
  var count=0;
  for(var i=0;i<CONCEPTOS.length;i++){
    var c=CONCEPTOS[i];var sel=document.getElementById('map_'+c.c);
    if(sel&&sel.value){
      await fetch('/api/mapeo',{method:'POST',headers:H,body:JSON.stringify({empresa_id:CE.id,concepto_hrm:c.c,columna_cliente:sel.value,categoria:c.cat})});
      count++;
    }
  }
  toast(count+' mapeos guardados',true);renderMapeo();
}
async function saveMap(concepto,cat){
  var el=document.getElementById('map_'+concepto);var v=el?el.value.trim():'';
  if(!v){toast('Selecciona o escribe una columna',false);return}
  await fetch('/api/mapeo',{method:'POST',headers:H,body:JSON.stringify({empresa_id:CE.id,concepto_hrm:concepto,columna_cliente:v,categoria:cat})});
  toast('Guardado: '+concepto,true);renderMapeo();
}
async function delMap(id){
  var ok=await confirmAction({title:'\xBFEliminar mapeo?',msg:'Esta columna ya no se considerar\xE1 al procesar archivos del cliente.',ok:'Eliminar',danger:true});
  if(!ok)return;
  showLoading('Eliminando mapeo...');
  try{
    await fetch('/api/mapeo',{method:'DELETE',headers:H,body:JSON.stringify({id:id,empresa_id:CE.id})});
    hideLoading();toast('Mapeo eliminado',true);renderMapeo();
  }catch(e){hideLoading();toast('Error: '+e.message,false);}
}

// \u2500\u2500 BASES ISN \u2500\u2500
async function renderBasesISN(){
  var vc=document.getElementById('viewContent');
  vc.innerHTML='<div style="text-align:center;padding:30px;color:#8ba5b2">Cargando...</div>';
  var r=await fetch('/api/bases-isn?empresa_id='+CE.id,{headers:H});
  var d=await r.json();
  var h='<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px"><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#1a2e3a">Bases ISN</div><div style="font-size:12px;color:#8ba5b2">Registros patronales con tasas de impuesto sobre n\xF3mina por estado.</div></div><div style="text-align:right"><div style="font-size:24px;font-weight:800;color:#d4920a">'+d.bases.length+'</div><div style="font-size:10px;color:#8ba5b2">registros</div></div></div>';
  h+='<div class="np-box"><h4>Agregar registro patronal</h4>';
  h+='<div class="fr"><div><label>Registro patronal</label><input id="brp" placeholder="ej: Y6079749104"></div><div><label>Entidad federativa</label><input id="bef" placeholder="ej: CDMX"></div></div>';
  h+='<div class="fr"><div><label>Tasa ISN (%)</label><input id="bta" type="number" step="0.0025" placeholder="ej: 3.00"></div><div style="display:flex;gap:16px;align-items:flex-end;padding-bottom:6px"><label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="checkbox" id="bvg"> Vales gravado</label><label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px"><input type="checkbox" id="bpg"> PTU gravado</label></div></div>';
  h+='<button class="btn" style="font-size:12px;padding:8px 18px" onclick="addBase()">Agregar</button></div>';
  if(d.bases.length){
    h+='<table class="isn-tbl"><thead><tr><th>Registro patronal</th><th>Estado</th><th style="text-align:right">Tasa</th><th style="text-align:center">Vales</th><th style="text-align:center">PTU</th><th></th></tr></thead><tbody>';
    d.bases.forEach(function(b){
      h+='<tr><td class="mono">'+b.registro_patronal+'</td><td>'+b.entidad_federativa+'</td><td class="rate">'+(b.tasa*100).toFixed(2)+'%</td><td style="text-align:center">'+(b.vales_gravado?'<span class="tag-r">Gravado</span>':'<span class="tag-g">Exento</span>')+'</td><td style="text-align:center">'+(b.ptu_gravado?'<span class="tag-r">Gravado</span>':'<span class="tag-g">Exento</span>')+'</td><td><button class="bo" style="font-size:10px;padding:3px 8px;color:#d94452" onclick="delBase('+b.id+')">\u2715</button></td></tr>';
    });
    h+='</tbody></table>';
  } else {
    h+='<div class="empty" style="padding:30px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c4d5dc" stroke-width="1.5"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg><h3 style="font-size:14px">Sin registros patronales</h3><p style="font-size:12px">Agrega el primer registro usando el formulario de arriba</p></div>';
  }
  vc.innerHTML=h;
}
async function addBase(){
  var rp=document.getElementById('brp').value.trim(),ef=document.getElementById('bef').value.trim(),ta=parseFloat(document.getElementById('bta').value),vg=document.getElementById('bvg').checked,pg=document.getElementById('bpg').checked;
  if(!rp||!ef||isNaN(ta)){toast('Completa todos los campos',false);return}
  await fetch('/api/bases-isn',{method:'POST',headers:H,body:JSON.stringify({empresa_id:CE.id,registro_patronal:rp,entidad_federativa:ef,tasa:ta/100,vales_gravado:vg,ptu_gravado:pg})});
  toast('Registro agregado',true);renderBasesISN();
}
async function delBase(id){
  var ok=await confirmAction({title:'\xBFEliminar registro patronal?',msg:'Esta base ISN se eliminar\xE1 del cliente.',ok:'Eliminar',danger:true});
  if(!ok)return;
  showLoading('Eliminando...');
  try{
    await fetch('/api/bases-isn',{method:'DELETE',headers:H,body:JSON.stringify({id:id,empresa_id:CE.id})});
    hideLoading();toast('Registro eliminado',true);renderBasesISN();
  }catch(e){hideLoading();toast('Error: '+e.message,false);}
}

// \u2500\u2500 PROCESAMIENTO AUTOM\xC1TICO DEL ACUMULADO \u2500\u2500
function processExcelFile(file){
  if(!CP){toast('Primero crea el periodo',false);return Promise.resolve()}
  return new Promise(function(resolve){
    var reader=new FileReader();
    reader.onload=async function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        var data=XLSX.utils.sheet_to_json(ws,{defval:0});
        if(!data.length){toast('Excel vac\xEDo',false);resolve();return}
        var keys=Object.keys(data[0]);
        // \u2500\u2500 Leer calendario (Hoja1) para fechas de pago por per\xEDodo \u2500\u2500
        window._hrmCalendar=[];
        try{
          var calWs=wb.Sheets['Hoja1'];
          if(calWs){
            var calRaw=XLSX.utils.sheet_to_json(calWs,{header:1,defval:''});
            for(var ci=1;ci<calRaw.length;ci++){
              var rw=calRaw[ci];
              if(rw[0]){
                var pName=String(rw[0]).trim().toUpperCase();
                // Map "SEMANA 09" \u2192 "SEM 09", "CATORCENA 05" \u2192 "CAT 05"
                var per=pName.replace(/^SEMANA\\s+/i,'SEM ').replace(/^CATORCENA\\s+/i,'CAT ').replace(/\\s+/g,' ').trim();
                window._hrmCalendar.push({
                  period:per,
                  originalName:pName,
                  dateRange:String(rw[1]||''),
                  payDate:rw[2]?new Date(rw[2]):null,
                  amount:parseFloat(rw[3])||0
                });
              }
            }
          }
        }catch(calErr){console.warn('Error leyendo calendario:',calErr)}
        // \u2500\u2500 Fin calendario \u2500\u2500
        if(typeof setLoadingText==='function')setLoadingText('Procesando acumulado','Calculando '+data.length+' registros, '+keys.length+' columnas...');
        var fc=findCol(keys);
        // Cargar cat\xE1logo RP\u2192Estado para fallback en sec6 y enriquecer sec9
        var basesCat={};
        try{
          var bRes=await fetch('/api/bases-isn?empresa_id='+CE.id,{headers:H});
          var bD=await bRes.json();
          (bD.bases||[]).forEach(function(b){basesCat[String(b.registro_patronal).trim()]=b.entidad_federativa});
        }catch(bErr){console.warn('No se pudo cargar bases_isn:',bErr)}
        var secs={};
        try{secs=generateAllSections(data,fc,basesCat)||{}}catch(genErr){console.error(genErr);toast('Advertencia: no se generaron todas las secciones',false)}
        var cPerc=fc('TOTAL PERCEPCIONES');
        var cDed=fc('TOTAL DEDUCCIONES');
        var cISN=fc('Impuesto estatal');
        var cNo=fc('NO.');
        var totalP=0,totalD=0,totalISN=0,emps=new Set();
        data.forEach(function(r){
          totalP+=(r[cPerc]||0);
          totalD+=(r[cDed]||0);
          totalISN+=(r[cISN]||0);
          var empId=r[cNo];if(empId)emps.add(empId);
        });
        var totalN=totalP-totalD;
        if(totalP===0){
          toast('ERROR: No se encontraron datos. Revisa consola F12',false);
          console.error('Columnas del Excel:',keys);
          resolve();return;
        }
        var body={periodo_id:CP.id,empresa_id:CE.id,secciones:secs,totales:{empleados:emps.size,percepciones:totalP,deducciones:totalD,neto:totalN,isn:totalISN}};
        if(typeof setLoadingText==='function')setLoadingText('Guardando en base de datos','Escribiendo '+Object.keys(secs).length+' secciones...');
        var resp=await fetch('/api/procesar-reporte',{method:'POST',headers:H,body:JSON.stringify(body)});
        if(resp.ok){
          var r2=await fetch('/api/periodos',{headers:H});PERS=(await r2.json()).periodos;
          CP=PERS.find(function(p){return p.id===CP.id});
        }else{
          var errTxt=await resp.text();toast('Error API: '+resp.status,false);console.error('API:',errTxt);
        }
        resolve();
      }catch(err){toast('Error: '+err.message,false);console.error('processExcelFile:',err);resolve()}
    };
    reader.onerror=function(){toast('Error leyendo archivo',false);resolve()};
    reader.readAsArrayBuffer(file);
  });
}

// Buscador inteligente de columnas
function findCol(keys){
  var cache={};
  return function(target){
    if(cache[target]!==undefined)return cache[target];
    var i,tLow=target.toLowerCase().trim();
    // 1 exacto
    for(i=0;i<keys.length;i++){if(keys[i]===target){cache[target]=keys[i];return keys[i]}}
    // 2 case-insensitive
    for(i=0;i<keys.length;i++){if(keys[i].toLowerCase().trim()===tLow){cache[target]=keys[i];return keys[i]}}
    // 3 key contiene target
    for(i=0;i<keys.length;i++){if(keys[i].toLowerCase().indexOf(tLow)>=0){cache[target]=keys[i];return keys[i]}}
    // 4 target contiene key (min 3 chars)
    for(i=0;i<keys.length;i++){if(keys[i].length>2&&tLow.indexOf(keys[i].toLowerCase().trim())>=0){cache[target]=keys[i];return keys[i]}}
    // 5 sin espacios/puntos
    var tC=tLow.replace(/[s.()/]/g,'');
    for(i=0;i<keys.length;i++){var kC=keys[i].toLowerCase().replace(/[s.()/]/g,'');if(kC===tC||kC.indexOf(tC)>=0||tC.indexOf(kC)>=0){cache[target]=keys[i];return keys[i]}}
    cache[target]=target;return target;
  };
}

// Map common Mexican sucursal/branch name patterns to estado
function mapSucursalToEstado(sucursal){
  if(!sucursal)return '';
  var s=String(sucursal).toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\\s+/g,' ').trim();
  if(!s)return '';
  var ESTADOS_DIRECT=['AGUASCALIENTES','CAMPECHE','COAHUILA','COLIMA','CHIAPAS','CHIHUAHUA','DURANGO','GUANAJUATO','GUERRERO','HIDALGO','JALISCO','MICHOACAN','MORELOS','NAYARIT','OAXACA','PUEBLA','QUERETARO','SINALOA','SONORA','TABASCO','TAMAULIPAS','TLAXCALA','VERACRUZ','YUCATAN','ZACATECAS'];
  for(var ie=0;ie<ESTADOS_DIRECT.length;ie++){
    if(s.indexOf(ESTADOS_DIRECT[ie])>=0)return ESTADOS_DIRECT[ie];
  }
  if(s.indexOf('CDMX')>=0||s.indexOf('CIUDAD DE MEXICO')>=0||s.indexOf('CIUDAD MEXICO')>=0||/(^| )DF($| )/.test(s)||s.indexOf('MEXICO DF')>=0)return 'CDMX';
  if(s.indexOf('NUEVO LEON')>=0||s.indexOf('MONTERREY')>=0||s.indexOf('APODACA')>=0||s.indexOf('SAN NICOLAS')>=0||s.indexOf('SAN PEDRO GZA')>=0)return 'NUEVO LEON';
  if(s.indexOf('BAJA CALIFORNIA SUR')>=0||s.indexOf('LA PAZ')>=0||s.indexOf('LOS CABOS')>=0||s.indexOf('CABO SAN LUCAS')>=0)return 'BAJA CALIFORNIA SUR';
  if(s.indexOf('BAJA CALIFORNIA')>=0||s.indexOf('TIJUANA')>=0||s.indexOf('MEXICALI')>=0||s.indexOf('ENSENADA')>=0||s.indexOf('ROSARITO')>=0)return 'BAJA CALIFORNIA';
  if(s.indexOf('SAN LUIS POTOSI')>=0||/(^| )SLP($| )/.test(s))return 'SAN LUIS POTOSI';
  if(s.indexOf('QUINTANA ROO')>=0||s.indexOf('CANCUN')>=0||s.indexOf('PLAYA DEL CARMEN')>=0||s.indexOf('CHETUMAL')>=0||s.indexOf('COZUMEL')>=0||s.indexOf('TULUM')>=0)return 'QUINTANA ROO';
  if(s.indexOf('ESTADO DE MEXICO')>=0||s.indexOf('EDOMEX')>=0||s.indexOf('TOLUCA')>=0||s.indexOf('NAUCALPAN')>=0||s.indexOf('ECATEPEC')>=0||s.indexOf('TLALNEPANTLA')>=0||s.indexOf('CUAUTITLAN')>=0)return 'MEXICO';
  var cityMap={
    'MANZANILLO':'COLIMA',
    'GUADALAJARA':'JALISCO','ZAPOPAN':'JALISCO','TLAQUEPAQUE':'JALISCO','TONALA':'JALISCO','PUERTO VALLARTA':'JALISCO',
    'LEON':'GUANAJUATO','IRAPUATO':'GUANAJUATO','CELAYA':'GUANAJUATO','SALAMANCA':'GUANAJUATO',
    'CHOLULA':'PUEBLA',
    'MERIDA':'YUCATAN',
    'HERMOSILLO':'SONORA','CIUDAD OBREGON':'SONORA','NOGALES':'SONORA',
    'CULIACAN':'SINALOA','MAZATLAN':'SINALOA','LOS MOCHIS':'SINALOA',
    'CIUDAD JUAREZ':'CHIHUAHUA','JUAREZ':'CHIHUAHUA',
    'SALTILLO':'COAHUILA','TORREON':'COAHUILA','MONCLOVA':'COAHUILA',
    'GOMEZ PALACIO':'DURANGO',
    'MORELIA':'MICHOACAN','URUAPAN':'MICHOACAN',
    'VILLAHERMOSA':'TABASCO',
    'TUXTLA':'CHIAPAS','TAPACHULA':'CHIAPAS',
    'ACAPULCO':'GUERRERO','CHILPANCINGO':'GUERRERO','IXTAPA':'GUERRERO','ZIHUATANEJO':'GUERRERO',
    'CUERNAVACA':'MORELOS','CUAUTLA':'MORELOS',
    'PACHUCA':'HIDALGO','TULA':'HIDALGO',
    'FRESNILLO':'ZACATECAS',
    'CIUDAD DEL CARMEN':'CAMPECHE',
    'TEPIC':'NAYARIT',
    'XALAPA':'VERACRUZ','COATZACOALCOS':'VERACRUZ','POZA RICA':'VERACRUZ','ORIZABA':'VERACRUZ',
    'TAMPICO':'TAMAULIPAS','REYNOSA':'TAMAULIPAS','MATAMOROS':'TAMAULIPAS','CIUDAD VICTORIA':'TAMAULIPAS','NUEVO LAREDO':'TAMAULIPAS'
  };
  for(var city in cityMap){
    if(s.indexOf(city)>=0)return cityMap[city];
  }
  return '';
}

function generateAllSections(data,fc,basesCat){
  basesCat=basesCat||{};
  var secs={};
  var warnings={conceptos_nuevos:[],puestos_nuevos:[],columnas_no_detectadas:[]};
  var keys=Object.keys(data[0]);
  if(!fc)fc=findCol(keys);

  // \u2500\u2500 Helpers \u2500\u2500
  function num(v){
    if(typeof v==='number')return isNaN(v)?0:v;
    if(typeof v==='string'){var n=parseFloat(v.replace(/[,\\s$]/g,''));return isNaN(n)?0:n}
    return 0;
  }
  function s(v){var n=typeof v==='number'?v:num(v);return parseFloat((n||0).toFixed(2))}
  function findExact(target){
    var tLow=String(target).toLowerCase().trim();
    for(var i=0;i<keys.length;i++){if(String(keys[i]).toLowerCase().trim()===tLow)return keys[i]}
    return null;
  }
  function isNumericCol(col){
    // Verifica si la columna tiene datos num\xE9ricos (al menos 1 valor distinto de 0 que sea n\xFAmero o num\xE9rico)
    for(var i=0;i<Math.min(data.length,50);i++){
      var v=data[i][col];
      if(v===undefined||v===null||v===0||v==='')continue;
      if(typeof v==='number')return true;
      if(typeof v==='string'&&!isNaN(parseFloat(v.replace(/[,\\s$]/g,''))))return true;
      return false;
    }
    return false;
  }
  function colsByPattern(includes,excludes){
    excludes=excludes||[];
    var out=[];
    keys.forEach(function(k){
      var kl=String(k).toLowerCase().trim();
      var inc=includes.some(function(p){return kl.indexOf(p)>=0});
      var exc=excludes.some(function(p){return kl.indexOf(p)>=0});
      if(inc&&!exc&&isNumericCol(k))out.push(k);
    });
    return out;
  }
  function sumCols(d,cols){
    var t=0;
    cols.forEach(function(c){d.forEach(function(r){t+=num(r[c])})});
    return s(t);
  }
  function sumC(d,name){var col=fc(name);return col?sumCols(d,[col]):0}
  function uniqueEmps(d){var col=fc('NO.');var e=new Set();d.forEach(function(r){var v=r[col];if(v)e.add(v)});return e}
  function byP(p){return data.filter(function(r){return String(r[periodCol]).trim()===p})}

  // \u2500\u2500 Detectar columna de per\xEDodo \u2500\u2500
  var periodCol=null;
  function looksLikePeriod(col){
    if(!col)return false;
    var hit=0,seen=0;
    for(var i=0;i<Math.min(data.length,200);i++){
      var v=data[i][col];if(v===undefined||v===null||v==='')continue;
      seen++;
      var u=String(v).toUpperCase().trim();
      if(/^(SEM|CAT)\\s*\\d+/.test(u)||u.indexOf('FINIQ')>=0||u.indexOf('BONO')>=0||u.indexOf('GRAT')>=0||u.indexOf('ESPECIAL')>=0||u.indexOf('PTU')>=0)hit++;
    }
    return seen>0 && hit/seen>=0.5;
  }
  var tries=['SEMANA / CATORCENA','SEMANA/CATORCENA','SEMANA/ CATORCENA','Periodo','periodo','PERIODO','TIPO NOMINA','Tipo n\xF3mina'];
  for(var pt=0;pt<tries.length;pt++){var f=fc(tries[pt]);if(f&&keys.indexOf(f)>=0&&looksLikePeriod(f)){periodCol=f;break}}
  if(!periodCol){
    // Buscar entre todas las columnas la que contenga valores tipo SEM/CAT
    for(var ki=0;ki<keys.length;ki++){if(looksLikePeriod(keys[ki])){periodCol=keys[ki];break}}
  }
  if(!periodCol){periodCol=keys[0];console.warn('Columna periodo no detectada por contenido, fallback a:',periodCol);warnings.columnas_no_detectadas.push('periodo')}
  console.log('Columna periodo:',periodCol,'Ejemplo:',data[0][periodCol]);

  // \u2500\u2500 Detectar todos los per\xEDodos del Excel y ordenarlos \u2500\u2500
  var pSet={};data.forEach(function(r){var p=r[periodCol];if(p&&String(p).trim())pSet[String(p).trim()]=(pSet[String(p).trim()]||0)+1});
  function pOrd(p){
    var u=String(p).toUpperCase().trim();
    if(/^SEM\\s*\\d+$/.test(u))return 100+(parseInt(u.replace(/\\D/g,''),10)||0);
    if(/^CAT\\s*\\d+$/.test(u))return 200+(parseInt(u.replace(/\\D/g,''),10)||0);
    if(u.indexOf('FINIQ')>=0)return 300;
    if(u.indexOf('GRAT')>=0)return 310;
    if(u.indexOf('PTU')>=0)return 320;
    if(u.indexOf('BONO')>=0&&u.indexOf('CAT')>=0)return 330;
    if(u.indexOf('BONO')>=0&&u.indexOf('SEM')>=0)return 340;
    if(u.indexOf('ESPECIAL')>=0)return 350;
    if(u.indexOf('BONO')>=0)return 360;
    return 500;
  }
  var allPeriods=Object.keys(pSet).sort(function(a,b){return pOrd(a)-pOrd(b)});
  // SEM/CAT por nombre del per\xEDodo (P2: por nombre del per\xEDodo)
  var periods=allPeriods.filter(function(p){return /^SEM\\s*\\d+$/i.test(String(p).trim())});
  var catPeriods=allPeriods.filter(function(p){return /^CAT\\s*\\d+$/i.test(String(p).trim())});
  console.log('Periodos:',allPeriods.join(', '),' | Sem:',periods.join(','),' | Cat:',catPeriods.join(','));

  // \u2500\u2500 Definir grupos de conceptos \u2500\u2500
  // ISR group (todos los conceptos de ISR: N\xF3mina, Finiquito, Liquidaci\xF3n, Ajuste)
  var isrCols=colsByPattern(['isr','i.s.r'],[]);
  // Infonavit empleado (excluir empresa/patr\xF3n)
  var infCols=colsByPattern(['infonavit'],['empresa','patr\xF3n','patron']);
  // Fonacot (todos)
  var fonCols=colsByPattern(['fonacot'],[]);
  // Despensa (Informativo)
  var desCol=findExact('Despensa (Informativo)')||findExact('Despensa(Informativo)')||findExact('Despensa');
  if(!desCol){var ds=colsByPattern(['despensa'],[]);if(ds.length)desCol=ds[0]}
  // RCV empleado (con par\xE9ntesis o "obrero")
  var rcvEmpCol=findExact('rcv (MONTO)')||findExact('RCV obrero')||findExact('rcv obrero');
  // IMSS empleado (con puntos)
  var imssEmpCol=findExact('I.M.S.S.')||findExact('I.M.S.S');
  // IMSS empresa (sin puntos, lowercase)
  var imssPatCol=findExact('imss')||findExact('IMSS');
  if(imssPatCol===imssEmpCol)imssPatCol=null;
  // RCV empresa
  var rcvPatCol=findExact('RCV')||findExact('rcv');
  if(rcvPatCol===rcvEmpCol)rcvPatCol=null;
  // Infonavit empresa
  var infPatCol=findExact('Infonavit empresa')||findExact('infonavit empresa');

  console.log('Grupos detectados:',{
    isr:isrCols,infonavit_emp:infCols,fonacot:fonCols,despensa:desCol,
    imss_emp:imssEmpCol,rcv_emp:rcvEmpCol,
    imss_pat:imssPatCol,rcv_pat:rcvPatCol,infonavit_pat:infPatCol
  });

  // \u2500\u2500 Totales globales \u2500\u2500
  var totalPerc=sumC(data,'TOTAL PERCEPCIONES');
  var totalDed=sumC(data,'TOTAL DEDUCCIONES');
  var totalNeto=s(totalPerc-totalDed);
  var totalDespensa=desCol?sumCols(data,[desCol]):0;

  // \u2500\u2500 SEC1: Integraci\xF3n \u2500\u2500
  var semEmps=periods.map(function(p){return uniqueEmps(byP(p)).size});
  var catEmps=catPeriods.map(function(p){return uniqueEmps(byP(p)).size});
  var semProm=semEmps.length?Math.round(semEmps.reduce(function(a,b){return a+b},0)/semEmps.length):0;
  var catProm=catEmps.length?Math.round(catEmps.reduce(function(a,b){return a+b},0)/catEmps.length):0;
  var empFiniq=0,empFiniqCat=0,empBonosSem=0,empBonosCat=0;
  allPeriods.forEach(function(p){
    var u=p.toUpperCase();
    var cnt=uniqueEmps(byP(p)).size;
    if(u.indexOf('FINIQ')>=0&&u.indexOf('CAT')<0)empFiniq+=cnt;
    else if(u.indexOf('FINIQ')>=0&&u.indexOf('CAT')>=0)empFiniqCat+=cnt;
    else if(u.indexOf('BONO')>=0&&u.indexOf('SEM')>=0)empBonosSem+=cnt;
    else if(u.indexOf('BONO')>=0&&u.indexOf('CAT')>=0)empBonosCat+=cnt;
    else if(u.indexOf('ESPECIAL')>=0)empBonosSem+=cnt;
  });
  var empGrat=0;allPeriods.forEach(function(p){if(p.toUpperCase().indexOf('GRAT')>=0)empGrat+=uniqueEmps(byP(p)).size});
  secs.sec1={percepciones:s(totalPerc),deducciones:s(totalDed),total_neto:totalNeto,sem_prom:semProm,cat_prom:catProm,emp_finiquitos:empFiniq+empFiniqCat,emp_bonos_sem:empBonosSem,emp_bonos_cat:empBonosCat,emp_gratificacion:empGrat,cfdi_total:0,cfdi_dif:0,disp_total:0,disp_dif:0};

  // \u2500\u2500 SEC2: Importes por per\xEDodo \u2500\u2500
  var sec2=[];
  allPeriods.forEach(function(p){var pd=byP(p);if(pd.length){var pp=sumC(pd,'TOTAL PERCEPCIONES');var dd=sumC(pd,'TOTAL DEDUCCIONES');sec2.push({p:p,nom:s(pp-dd),cfdi:0,disp:0})}});
  secs.sec2=sec2;

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // SEC4: Concentrado de n\xF3mina (Secci\xF3n IV - usuario)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // Reglas:
  //   - Quitar conceptos en cero (auto)
  //   - Agrupar deducciones: ISR, Pr\xE9stamo Infonavit, Pr\xE9stamo Fonacot
  //   - Resto va separado
  //   - Despensa al final (informativa, s\xED cuenta vs CFDIs)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  var percArr=[];var seenP={};
  // Conceptos de percepci\xF3n conocidos (cada uno separado, eliminar ceros)
  var percNamesKnown=['Sueldo','Vacaciones','Vacaciones pendientes','Prima vacacional','Aguinaldo','Gratificacion','Liquidacion','Bono','Fondo ahorro empresa','Comisiones','Prima dominical','D\xEDa festivo','Dia festivo','D\xEDa descanso','Dia descanso','Retroactivo','Ajuste de Sueldo','incentivos (MONTO)','Incentivos','Premio asistencia','Premio puntualidad','Horas extra','Tiempo extra','Destajo','Compensacion','Subsidio al empleo','PTU'];
  percNamesKnown.forEach(function(name){
    var col=findExact(name);
    if(!col||col===desCol||seenP[col])return;
    var t=sumCols(data,[col]);
    if(t>0){seenP[col]=true;percArr.push({c:col,t:s(t)})}
  });
  // Detectar percepciones del Excel que NO est\xE9n en la lista conocida (warning)
  var dedExcludePatterns=['isr','i.s.r','infonavit','fonacot','imss','i.m.s.s','rcv','fondo','prestamo','pr\xE9stamo','descuento','pension','pensi\xF3n','sindical','total deducciones','total perc','despensa','impuesto'];
  var structuralCols=['SEMANA / CATORCENA','SEMANA/CATORCENA','SEMANA/ CATORCENA','NO.','NO','Numero','N\xFAmero','Puesto','PUESTO','Departamento','DEPARTAMENTO','estado','Estado','ESTADO','REGISTRO PATRONAL','Registro patronal','Empleado','Nombre','NOMBRE','Apellido','Apellido Paterno','Apellido Materno','Fecha','Fecha de ingreso','FECHA DE INGRESO','Fecha de baja','FECHA DE BAJA','Entidad','ENTIDAD','NSS','RFC','CURP','SD','SBC','Sueldo Diario','Salario Base','Salario Diario','Salario Diario Integrado','Dias trabajados','D\xEDas trabajados','DIAS TRABAJADOS','NETO SUELDO FISCAL','TOTAL PREVISION SOCIAL','TOTAL PREVISI\xD3N SOCIAL','Vacaciones','Cancelaciones Prematuras','Periodo','periodo','PERIODO','TIPO NOMINA','Tipo n\xF3mina'];
  keys.forEach(function(k){
    if(seenP[k]||k===desCol)return;
    var kl=String(k).toLowerCase().trim();
    if(structuralCols.some(function(s){return kl===s.toLowerCase()}))return;
    if(dedExcludePatterns.some(function(p){return kl.indexOf(p)>=0}))return;
    if(kl.indexOf('comprob')>=0||kl.indexOf('verific')>=0||kl.indexOf('cuadre')>=0||kl.indexOf('previsi')>=0||kl.indexOf('seguro_vivienda')>=0||kl.indexOf('seguro vivienda')>=0||kl==='faltas'||kl==='incapacidades'||kl.indexOf('vacaciones_1')>=0||kl.indexOf('vacaciones 1')>=0)return;
    // Check if numeric and sum > 0
    if(!isNumericCol(k))return;
    var t=sumCols(data,[k]);
    if(t>0){
      warnings.conceptos_nuevos.push({col:k,total:s(t),tipo:'percepcion?'});
    }
  });

  // Deducciones agrupadas
  var dedArr=[];
  var dedKnownGroups=[];
  if(isrCols.length){var tISR=sumCols(data,isrCols);if(tISR>0){dedArr.push({c:'I.S.R.',t:s(tISR),group:isrCols});dedKnownGroups=dedKnownGroups.concat(isrCols)}}
  if(imssEmpCol){var tIM=sumCols(data,[imssEmpCol]);if(tIM>0){dedArr.push({c:'I.M.S.S.',t:s(tIM)});dedKnownGroups.push(imssEmpCol)}}
  if(rcvEmpCol){var tRCV=sumCols(data,[rcvEmpCol]);if(tRCV>0){dedArr.push({c:'RCV',t:s(tRCV)});dedKnownGroups.push(rcvEmpCol)}}
  if(infCols.length){var tINF=sumCols(data,infCols);if(tINF>0){dedArr.push({c:'Pr\xE9stamo Infonavit',t:s(tINF),group:infCols});dedKnownGroups=dedKnownGroups.concat(infCols)}}
  if(fonCols.length){var tFON=sumCols(data,fonCols);if(tFON>0){dedArr.push({c:'Pr\xE9stamo Fonacot',t:s(tFON),group:fonCols});dedKnownGroups=dedKnownGroups.concat(fonCols)}}
  // Otros conceptos de deducci\xF3n conocidos (Q4: van separados)
  var otherDedNames=['Fondo de ahorro Empleado','Fondo ahorro','Cancelaciones Prematuras','PRESTAMOS LAFFY','Prestamos LAFFY','Prestamos','OTROS DESCUENTOS','Otros descuentos','PENSION ALIMENTICIA','Pension alimenticia','Descuento sindical'];
  otherDedNames.forEach(function(name){
    var col=findExact(name);
    if(!col||dedKnownGroups.indexOf(col)>=0)return;
    var t=sumCols(data,[col]);
    if(t>0){dedArr.push({c:col,t:s(t)});dedKnownGroups.push(col)}
  });

  // Despensa al final (informativa, entra al cuadre vs CFDIs seg\xFAn Q2)
  var despAtEnd=null;
  if(desCol&&totalDespensa>0)despAtEnd={c:desCol,t:s(totalDespensa)};

  // Per\xEDodos del concentrado
  var periodosArr=[];
  allPeriods.forEach(function(p){
    var pd=byP(p);
    if(pd.length){
      var pp=sumC(pd,'TOTAL PERCEPCIONES');
      var dd=sumC(pd,'TOTAL DEDUCCIONES');
      var dsp=desCol?sumCols(pd,[desCol]):0;
      periodosArr.push({p:p,perc:s(pp),ded:s(dd),neto:s(pp-dd),despensa:s(dsp),emps:uniqueEmps(pd).size})
    }
  });
  secs.sec4={percepciones:percArr,deducciones:dedArr,despensa:despAtEnd,periodos:periodosArr,total_perc:s(totalPerc),total_ded:s(totalDed),total_neto:totalNeto,total_despensa:s(totalDespensa)};

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // SEC5: Totales por puesto (Secci\xF3n V - usuario)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // Reglas:
  //   - M\xE9trica = Neto fiscal + Despensa
  //   - Listas fijas SEM/CAT
  //   - Puesto fuera de lista \u2192 "OTROS" agregado
  //   - Puesto nuevo \u2192 alerta al admin
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  var pCol=fc('Puesto');
  var percColX=fc('TOTAL PERCEPCIONES');
  var dedColX=fc('TOTAL DEDUCCIONES');
  var listaSem=['EJECUTIVO DE VENTAS','GERENTE DE TIENDA','GERENTE REGIONAL','ASSISTANT MANAGER','TECNICO DE SERVICIO','EJECUTIVO CUBRE INC','MONITORISTA'];
  var listaCat=['GERENTES','PRESIDENCIA','DIRECTORES','COORDINADORES','ANALISTAS'];

  function netoPlusDespensa(r){
    return num(r[percColX])-num(r[dedColX])+(desCol?num(r[desCol]):0);
  }
  function normPuesto(p){
    if(!p)return '';
    return String(p).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().replace(/\\s+/g,' ').trim();
  }
  // Clasifica un puesto normalizado en una de las familias fijas.
  // El matching es por palabras clave (substring) para tolerar variantes:
  //   "PRESIDENTE" \u2192 PRESIDENCIA, "DIRECTORA DE IT" \u2192 DIRECTORES,
  //   "GERENTE SR AUDITORIA" \u2192 GERENTES, "EJECUTIVO DE VENTAS BACK UP" \u2192 EJECUTIVO DE VENTAS
  function clasifPuesto(pNorm,tipo){
      if(!pNorm)return null;
      if(tipo==='catorcenal'){
        if(pNorm.indexOf('PRESIDENT')>=0||pNorm.indexOf('PRESIDENCIA')>=0||pNorm.indexOf('VPGM')>=0||pNorm.indexOf('CEO')>=0)return 'PRESIDENCIA';
        if(pNorm.indexOf('DIRECTOR')>=0||pNorm.indexOf('HEAD ')>=0||pNorm.indexOf('VP ')>=0||pNorm.indexOf('GERENTE REGIONAL')>=0||pNorm.indexOf('JEFE')>=0)return 'DIRECTORES';
        if(pNorm.indexOf('COORDINADOR')>=0||pNorm.indexOf('COORD ')>=0||pNorm.indexOf('LIDER')>=0||pNorm.indexOf('LIDER')>=0)return 'COORDINADORES';
        if(pNorm.indexOf('GERENTE')>=0||pNorm.indexOf('MANAGER')>=0||pNorm.indexOf('HRBP')>=0)return 'GERENTES';
        if(pNorm.indexOf('ANALISTA')>=0||pNorm.indexOf('ANALYST')>=0||pNorm.indexOf('ESPECIALISTA')>=0||pNorm.indexOf('DESARROLLADOR')>=0||pNorm.indexOf('CAPACITADOR')>=0||pNorm.indexOf('ASISTENTE')>=0||pNorm.indexOf('COMMUNITY')>=0||pNorm.indexOf('PROJECT MANAGER')>=0||pNorm.indexOf('AUXILIAR')>=0||pNorm.indexOf('ADMINISTRATIV')>=0||pNorm.indexOf('CONTADOR')>=0||pNorm.indexOf('RECEPCION')>=0||pNorm.indexOf('CAJERO')>=0||pNorm.indexOf('SECRETARIA')>=0||pNorm.indexOf('SOPORTE')>=0||pNorm.indexOf('RECLUTAMIENTO')>=0||pNorm.indexOf('CAPTURISTA')>=0||pNorm.indexOf('PRACTICANTE')>=0||pNorm.indexOf('BECARIO')>=0||pNorm.indexOf('ABOGADO')>=0||pNorm.indexOf('PRODUCTOR')>=0||pNorm.indexOf('EJECUTIVO')>=0||pNorm.indexOf('SUPERVISOR')>=0||pNorm.indexOf('PROMOTOR')>=0||pNorm.indexOf('MERCADOLOGIA')>=0||pNorm.indexOf('MARKETING')>=0||pNorm.indexOf('VENTAS')>=0)return 'ANALISTAS';
        return null;
      }
    if(pNorm.indexOf('EJECUTIVO')>=0&&pNorm.indexOf('CUBRE')>=0)return 'EJECUTIVO CUBRE INC';
    if(pNorm.indexOf('EJECUTIVO DE VENTAS')>=0)return 'EJECUTIVO DE VENTAS';
    if(pNorm.indexOf('GERENTE DE TIENDA')>=0)return 'GERENTE DE TIENDA';
    if(pNorm.indexOf('GERENTE REGIONAL')>=0)return 'GERENTE REGIONAL';
    if(pNorm.indexOf('ASSISTANT MANAGER')>=0||pNorm.indexOf('ASISTENTE DE TIENDA')>=0)return 'ASSISTANT MANAGER';
    if(pNorm.indexOf('TECNICO')>=0||pNorm.indexOf('TECNICO')>=0)return 'TECNICO DE SERVICIO';
    if(pNorm.indexOf('MONITORISTA')>=0||pNorm.indexOf('CCTV')>=0)return 'MONITORISTA';
    return null;
  }
  function aggPuestos(rows,lista,tipo){
    var agg={};lista.forEach(function(p){agg[p]=0});
    agg['OTROS']=0;
    var nuevos={};
    rows.forEach(function(r){
      var pRaw=r[pCol]||'';
      var p=normPuesto(pRaw);
      var v=netoPlusDespensa(r);
      var matched=clasifPuesto(p,tipo);
      if(matched&&lista.indexOf(matched)>=0){
        agg[matched]+=v;
      }else{
        agg['OTROS']+=v;
        if(p)nuevos[p]=(nuevos[p]||0)+v;
      }
    });
    var out=[];
    lista.forEach(function(L){out.push({n:L,v:s(agg[L]||0)})});
    out.push({n:'OTROS',v:s(agg['OTROS']||0)});
    var nuevosArr=[];for(var nk in nuevos)nuevosArr.push({n:nk,v:s(nuevos[nk])});
    nuevosArr.sort(function(a,b){return b.v-a.v});
    return {puestos:out,nuevos:nuevosArr};
  }
  var semData=data.filter(function(r){return periods.indexOf(String(r[periodCol]).trim())>=0});
  var catData=data.filter(function(r){return catPeriods.indexOf(String(r[periodCol]).trim())>=0});
  var semAgg=aggPuestos(semData,listaSem,'semanal');
  var catAgg=aggPuestos(catData,listaCat,'catorcenal');
  // Alertar al admin sobre puestos nuevos
  semAgg.nuevos.forEach(function(n){warnings.puestos_nuevos.push({puesto:n.n,tipo:'semanal',monto:n.v})});
  catAgg.nuevos.forEach(function(n){warnings.puestos_nuevos.push({puesto:n.n,tipo:'catorcenal',monto:n.v})});
  secs.sec5={
    semanal:semAgg.puestos,
    total_sem:s(semAgg.puestos.reduce(function(a,b){return a+b.v},0)),
    catorcenal:catAgg.puestos,
    total_cat:s(catAgg.puestos.reduce(function(a,b){return a+b.v},0)),
    nuevos_semanal:semAgg.nuevos,
    nuevos_catorcenal:catAgg.nuevos
  };

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // SEC6: Totales por estado (Secci\xF3n VI - usuario)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // Reglas:
  //   - Columna 'estado' directa del acumulado
  //   - M\xE9trica = Neto fiscal + Despensa
  //   - Todos los estados (~30)
  //   - Ordenado de mayor a menor
  //   - % sobre Neto fiscal + Despensa
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // Detecci\xF3n agresiva de columna estado: literal, parcial, o por contenido (nombres de estados MX)
  var estCol=findExact('estado')||findExact('Estado')||findExact('ESTADO')||findExact('ENTIDAD')||findExact('Entidad')||findExact('ENTIDAD FEDERATIVA')||findExact('Entidad federativa');
  if(!estCol){
    for(var ie=0;ie<keys.length;ie++){
      var kle=String(keys[ie]).toLowerCase().trim();
      if(kle==='entidad federativa'||kle==='ent. fed.'||kle==='ent fed'||kle.indexOf('entidad')>=0||(kle.indexOf('estado')>=0&&kle.indexOf('civil')<0)){estCol=keys[ie];break}
    }
  }
  if(!estCol){
    var ESTADOS_MX=['JALISCO','CDMX','CIUDAD DE MEXICO','NUEVO LEON','MEXICO','VERACRUZ','PUEBLA','GUANAJUATO','SINALOA','SONORA','CHIHUAHUA','BAJA CALIFORNIA','COAHUILA','TAMAULIPAS','MICHOACAN','QUERETARO','SAN LUIS POTOSI','CHIAPAS','OAXACA','GUERRERO','MORELOS','HIDALGO','TABASCO','CAMPECHE','YUCATAN','QUINTANA ROO','NAYARIT','COLIMA','AGUASCALIENTES','DURANGO','TLAXCALA','ZACATECAS'];
    for(var ic=0;ic<keys.length;ic++){
      var hits=0,seen=0;
      for(var ir=0;ir<Math.min(data.length,200);ir++){
        var vv=String(data[ir][keys[ic]]||'').toUpperCase().trim();
        if(!vv)continue;seen++;
        if(ESTADOS_MX.indexOf(vv)>=0||ESTADOS_MX.some(function(stt){return vv.indexOf(stt)>=0}))hits++;
      }
      if(seen>0&&hits/seen>=0.5){estCol=keys[ic];console.log('Columna estado detectada por contenido:',estCol);break}
    }
  }
  var s6=[];
  if(estCol){
    var em={};
    data.forEach(function(r){
      var e=r[estCol];
      if(!e)return;
      e=String(e).trim();
      em[e]=(em[e]||0)+netoPlusDespensa(r);
    });
    for(var k6 in em)if(k6)s6.push({e:k6,v:s(em[k6])});
    s6.sort(function(a,b){return b.v-a.v});
  }else{
    warnings.columnas_no_detectadas.push('estado');
    var rpCol_=fc('REGISTRO PATRONAL');
    var sucCol_=findExact('Sucursal')||findExact('SUCURSAL')||findExact('sucursal')||fc('Sucursal');
    function sucToEdo(suc){
      if(!suc)return null;
      var u=String(suc).toUpperCase().trim();
      if(u.indexOf('CDMX')>=0||u.indexOf('CIUDAD DE MEX')>=0||u.indexOf('MEXICO D.F')>=0||u.indexOf('EDO MEX')>=0)return 'CDMX';
      if(u.indexOf('MANZANILLO')>=0||u.indexOf('COLIMA')>=0||u.indexOf('TEKOMAN')>=0)return 'COLIMA';
      if(u.indexOf('GUADALAJARA')>=0||u.indexOf('TLAQUEPA')>=0||u.indexOf('ZAPOPAN')>=0||u.indexOf('PUERTO VALLARTA')>=0)return 'JALISCO';
      if(u.indexOf('MONTERREY')>=0||u.indexOf('SAN NICOLAS')>=0||u.indexOf('GUADALUPE NL')>=0||u.indexOf('APODACA')>=0)return 'NUEVO LEON';
      if(u.indexOf('PUEBLA')>=0||u.indexOf('TEHUACAN')>=0||u.indexOf('TEXMELUCAN')>=0)return 'PUEBLA';
      if(u.indexOf('VERACRUZ')>=0||u.indexOf('BOCA DEL RIO')>=0||u.indexOf('XALAPA')>=0||u.indexOf('COATZACOALCOS')>=0)return 'VERACRUZ';
      if(u.indexOf('MEXICO')>=0||u.indexOf('ECATEPEC')>=0||u.indexOf('NAUCALPAN')>=0||u.indexOf('TLALNEPANTLA')>=0||u.indexOf('CUAUTITLAN')>=0||u.indexOf('CUAUTITL\xC1N')>=0||u.indexOf('NEZAHUALCOYOTL')>=0||u.indexOf('CHALCO')>=0||u.indexOf('TOLUCA')>=0||u.indexOf('ATIZAPAN')>=0||u.indexOf('COACALCO')>=0||u.indexOf('TULTITLAN')>=0)return 'EDO MEXICO';
      if(u.indexOf('TIJUANA')>=0||u.indexOf('MEXICALI')>=0||u.indexOf('ENSENADA')>=0||u.indexOf('ROSARITO')>=0)return 'BAJA CALIFORNIA';
      if(u.indexOf('CHIHUAHUA')>=0||u.indexOf('JUAREZ')>=0||u.indexOf('CIUDAD JUAREZ')>=0||u.indexOf('DELICIAS')>=0||u.indexOf('CUAUHTEMOC')>=0)return 'CHIHUAHUA';
      if(u.indexOf('HERMOSILLO')>=0||u.indexOf('OBREGON')>=0||u.indexOf('NOGALES')>=0||u.indexOf('GUAYMAS')>=0||u.indexOf('NAVOJOA')>=0)return 'SONORA';
      if(u.indexOf('CULIACAN')>=0||u.indexOf('MAZATLAN')>=0||u.indexOf('LOS MOCHIS')>=0)return 'SINALOA';
      if(u.indexOf('CANCUN')>=0||u.indexOf('CHETUMAL')>=0||u.indexOf('PLAYA DEL CARMEN')>=0)return 'QUINTANA ROO';
      if(u.indexOf('MERIDA')>=0||u.indexOf('VALLADOLID')>=0)return 'YUCATAN';
      if(u.indexOf('LEON')>=0||u.indexOf('IRAPUATO')>=0||u.indexOf('CELAYA')>=0||u.indexOf('SALAMANCA')>=0)return 'GUANAJUATO';
      if(u.indexOf('QUERETARO')>=0||u.indexOf('SAN JUAN DEL RIO')>=0)return 'QUERETARO';
      if(u.indexOf('MORELIA')>=0||u.indexOf('URUAPAN')>=0||u.indexOf('ZAMORA')>=0)return 'MICHOACAN';
      if(u.indexOf('ACAPULCO')>=0||u.indexOf('CHILPANCINGO')>=0)return 'GUERRERO';
      if(u.indexOf('CUERNAVACA')>=0||u.indexOf('CUAUTLA')>=0||u.indexOf('JIUTEPEC')>=0)return 'MORELOS';
      if(u.indexOf('TAMPICO')>=0||u.indexOf('VICTORIA')>=0||u.indexOf('REYNOSA')>=0||u.indexOf('MATAMOROS')>=0||u.indexOf('NUEVO LAREDO')>=0)return 'TAMAULIPAS';
      if(u.indexOf('SALTILLO')>=0||u.indexOf('TORREON')>=0||u.indexOf('PIEDRAS NEGRAS')>=0||u.indexOf('MONCLOVA')>=0)return 'COAHUILA';
      if(u.indexOf('SAN LUIS POTOSI')>=0||u.indexOf('SAN LUIS')>=0)return 'SAN LUIS POTOSI';
      if(u.indexOf('AGUASCALIENTES')>=0)return 'AGUASCALIENTES';
      if(u.indexOf('DURANGO')>=0||u.indexOf('GOMEZ PALACIO')>=0)return 'DURANGO';
      if(u.indexOf('OAXACA')>=0)return 'OAXACA';
      if(u.indexOf('TUXTLA')>=0||u.indexOf('TAPACHULA')>=0||u.indexOf('SAN CRISTOBAL')>=0)return 'CHIAPAS';
      if(u.indexOf('VILLAHERMOSA')>=0)return 'TABASCO';
      if(u.indexOf('TEPIC')>=0)return 'NAYARIT';
      if(u.indexOf('ZACATECAS')>=0)return 'ZACATECAS';
      if(u.indexOf('LA PAZ')>=0||u.indexOf('CABO SAN LUCAS')>=0)return 'BAJA CALIFORNIA SUR';
      if(u.indexOf('TLAXCALA')>=0)return 'TLAXCALA';
      if(u.indexOf('PACHUCA')>=0||u.indexOf('TULANCINGO')>=0)return 'HIDALGO';
      return null;
    }
    var sm={};data.forEach(function(r){
      var rp=r[rpCol_];if(!rp)return;rp=String(rp).trim();
      var est=(rp&&basesCat[rp])||null;
      if(!est&&sucCol_)est=sucToEdo(r[sucCol_]);
      if(!est)est=rp||'(sin estado)';
      sm[est]=(sm[est]||0)+netoPlusDespensa(r);
    });
    for(var k6b in sm)if(k6b)s6.push({e:k6b,v:s(sm[k6b])});
    s6.sort(function(a,b){return b.v-a.v});
  }
  secs.sec6=s6;

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // SEC7: Impuestos por per\xEDodo (Secci\xF3n VII - usuario)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // Reglas:
  //   - A: ISR agrupado (= sec4 ISR group)
  //   - B: IMSS empleado + RCV empleado
  //   - C: Infonavit agrupado (Q5: igual que Secci\xF3n IV)
  //   - D: Fonacot agrupado
  //   - E: A+B+C+D
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  var s7p=[];var tISR7=0,tIM7=0,tInf7=0,tFn7=0,tTr7=0;
  allPeriods.forEach(function(p){
    var pd=byP(p);
    if(pd.length){
      var isr=isrCols.length?sumCols(pd,isrCols):0;
      var im=(imssEmpCol?sumCols(pd,[imssEmpCol]):0)+(rcvEmpCol?sumCols(pd,[rcvEmpCol]):0);
      var inf=infCols.length?sumCols(pd,infCols):0;
      var fn=fonCols.length?sumCols(pd,fonCols):0;
      var tot=s(isr+im+inf+fn);
      tISR7+=isr;tIM7+=im;tInf7+=inf;tFn7+=fn;tTr7+=tot;
      s7p.push({p:p,isr:s(isr),imss:s(im),info:s(inf),fon:s(fn),total:tot});
    }
  });
  secs.sec7={periodos:s7p,total_isr:s(tISR7),total_imss:s(tIM7),total_info:s(tInf7),total_fon:s(tFn7),total_trabajador:s(tTr7),isr_nomina:s(tISR7),isr_sat:0,isr_dif:0,total_nomina_sat:0,nomina_exenta_sat:0,num_empleados_sat:0,colaboradores_dif:[]};

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // SEC8: Contribuciones patronales (Secci\xF3n VIII - usuario)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // Reglas:
  //   - IMSS empresa (sin puntos)
  //   - RCV empresa (concepto \xFAnico, parte de previsi\xF3n social)
  //   - Infonavit empresa
  //   - ISN (Impuesto estatal) - hueco hasta tener proceso
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  var isnCol=fc('Impuesto estatal');
  var s8p=[];var tIM8=0,tRC=0,tIn8=0,tIS=0;
  allPeriods.forEach(function(p){
    var pd=byP(p);
    if(pd.length){
      var im=imssPatCol?sumCols(pd,[imssPatCol]):0;
      var rc=rcvPatCol?sumCols(pd,[rcvPatCol]):0;
      var inf=infPatCol?sumCols(pd,[infPatCol]):0;
      var isn=isnCol?sumCols(pd,[isnCol]):0;
      if(im+rc+inf+isn>0){
        var tot=s(im+rc+inf+isn);
        tIM8+=im;tRC+=rc;tIn8+=inf;tIS+=isn;
        s8p.push({p:p,imss:s(im),rcv:s(rc),info:s(inf),isn:s(isn),total:tot});
      }
    }
  });
  secs.sec8={periodos:s8p,total_imss:s(tIM8),total_rcv:s(tRC),total_info:s(tIn8),isn_total:s(tIS),total_patron:s(tIM8+tRC+tIn8+tIS)};

  // \u2500\u2500 SEC9: IMSS+RCV por RP (obrero + patronal + Infonavit empresa) \u2500\u2500
  var rpCol9=fc('REGISTRO PATRONAL');
  var eCol=fc('NO.');
  var rm={};data.forEach(function(r){
    var rp=r[rpCol9];if(!rp)return;rp=String(rp).trim();
    if(!rm[rp])rm[rp]={rp:rp,e:basesCat[rp]||'',emp:new Set(),t:0};
    rm[rp].emp.add(r[eCol]);
    var x=0;
    if(imssEmpCol)x+=num(r[imssEmpCol]);
    if(rcvEmpCol)x+=num(r[rcvEmpCol]);
    if(imssPatCol)x+=num(r[imssPatCol]);
    if(rcvPatCol)x+=num(r[rcvPatCol]);
    if(infPatCol)x+=num(r[infPatCol]);
    rm[rp].t+=x;
  });
  var s9=[];for(var k9 in rm)s9.push({rp:rm[k9].rp,e:rm[k9].e,emp:rm[k9].emp.size,t:s(rm[k9].t)});
  s9.sort(function(a,b){return b.t-a.t});
  secs.sec9=s9;

  // \u2500\u2500 SEC10: Impuesto sobre n\xF3mina por estado \u2500\u2500
  // Reglas:
  //   - Base gravable = TOTAL PERCEPCIONES - Despensa(Informativo) - PTU
  //   - Exenci\xF3n: 5 UMAs por d\xEDa trabajado (UMA=113.14 para 2026)
  //   - Tasa seg\xFAn estado (de cat\xE1logo bases_isn o defaults)
  //   - C\xE1lculo por empleado, agregado por estado
  var sec10=[];
  var umaDiaria=113.14;
  var defaultTasas={
    'AGUASCALIENTES':0.025,'CAMPECHE':0.03,'COAHUILA':0.03,'COLIMA':0.03,
    'CHIAPAS':0.03,'CHIHUAHUA':0.03,'DURANGO':0.03,'GUANAJUATO':0.03,
    'GUERRERO':0.03,'HIDALGO':0.03,'JALISCO':0.03,'MEXICO':0.03,
    'MICHOACAN':0.03,'MORELOS':0.03,'NAYARIT':0.03,'NUEVO LEON':0.03,
    'OAXACA':0.03,'PUEBLA':0.03,'QUERETARO':0.03,'QUINTANA ROO':0.03,
    'SAN LUIS POTOSI':0.03,'SINALOA':0.03,'SONORA':0.03,'TABASCO':0.03,
    'TAMAULIPAS':0.03,'TLAXCALA':0.03,'VERACRUZ':0.03,'YUCATAN':0.03,
    'ZACATECAS':0.03,'CDMX':0.04,'CIUDAD DE MEXICO':0.04,
    'BAJA CALIFORNIA':0.03,'BAJA CALIFORNIA SUR':0.03
  };
  var cDias=fc('Dias trabajados');
  var cDespensa=desCol;
  var cPTU=findExact('PTU');
  var cEstCol=estCol||fc('REGISTRO PATRONAL');
  var rpCol10=fc('REGISTRO PATRONAL');
  var sucCol10=findExact('Sucursal')||findExact('SUCURSAL')||findExact('sucursal')||fc('Sucursal');
  var isnPorEstado={};
  if(cDias&&cPerc){
    data.forEach(function(r){
      // Fallback chain: explicit ESTADO column \u2192 basesCat RP map \u2192 sucursal mapping
      var est='';
      if(estCol)est=String(r[estCol]||'').trim();
      if(!est&&rpCol10){
        var rp10=String(r[rpCol10]||'').trim();
        if(rp10&&basesCat[rp10])est=basesCat[rp10];
      }
      if(!est&&sucCol10){est=mapSucursalToEstado(r[sucCol10])||''}
      if(!est)return;
      var percepcionesTotal=num(r[cPerc])||0;
      var despensa=desCol?num(r[cDespensa]||0):0;
      var ptu=cPTU?num(r[cPTU]||0):0;
      var dias=num(r[cDias]||0)||7;
      // Base gravable: percepciones - despensa - PTU
      var base=Math.max(0,percepcionesTotal-despensa-ptu);
      // Exenci\xF3n: 5 UMAs por d\xEDa
      var exencion=5*umaDiaria*dias;
      base=Math.max(0,base-exencion);
      if(!isnPorEstado[est])isnPorEstado[est]={estado:est,num_empleados:0,base_gravable:0,tasa:0,impuesto:0,nomina_total:0};
      isnPorEstado[est].num_empleados++;
      isnPorEstado[est].base_gravable+=base;
      isnPorEstado[est].nomina_total+=percepcionesTotal;
    });
    // Cargar tasas desde cat\xE1logo si est\xE1 disponible
    var isnTasas={...defaultTasas};
    for(var rpKey in basesCat){
      if(typeof basesCat[rpKey]==='string'&&basesCat[rpKey].trim()){
        // basesCat[rpKey] es el nombre del estado
        var estB=basesCat[rpKey].toUpperCase().trim();
        // Intentar obtener tasa espec\xEDfica; las tasas del cat\xE1logo tienen prioridad
      }
    }
    var estKeys=Object.keys(isnPorEstado);
    var mesAnt=isnTotal||0;
    for(var ek=0;ek<estKeys.length;ek++){
      var eObj=isnPorEstado[estKeys[ek]];
      eObj.tasa=defaultTasas[eObj.estado.toUpperCase().trim()]||0.03;
      eObj.impuesto=Math.round(eObj.base_gravable*eObj.tasa*100)/100;
      eObj.base_gravable=Math.round(eObj.base_gravable*100)/100;
      eObj.nomina_total=Math.round(eObj.nomina_total*100)/100;
      sec10.push(eObj);
    }
    sec10.sort(function(a,b){return b.base_gravable-a.base_gravable});
  }
  secs.sec10=sec10;

  // \u2500\u2500 SEC12: Tendencias \u2500\u2500
  var sT=[];var pE=null;var tSB=0,tSA=0;
  periods.forEach(function(p){
    var c=uniqueEmps(byP(p));
    if(pE!==null){var a=0,b=0;c.forEach(function(e){if(!pE.has(e))a++});pE.forEach(function(e){if(!c.has(e))b++});
      sT.push({p:p,b:b,a:a,t:c.size});tSB+=b;tSA+=a;
    }else{sT.push({p:p,b:0,a:0,t:c.size})}
    pE=c;
  });
  var cT=[];var pCT=null;var tCB=0,tCA=0;
  catPeriods.forEach(function(p){
    var c=uniqueEmps(byP(p));
    if(pCT!==null){var a=0,b=0;c.forEach(function(e){if(!pCT.has(e))a++});pCT.forEach(function(e){if(!c.has(e))b++});
      cT.push({p:p,b:b,a:a,t:c.size});tCB+=b;tCA+=a;
    }else{cT.push({p:p,b:0,a:0,t:c.size})}
    pCT=c;
  });
  secs.sec12={semanal:sT,total_sem_b:tSB,total_sem_a:tSA,catorcenal:cT,total_cat_b:tCB,total_cat_a:tCA,promedio_empleados:semProm};

  // SEC13
  secs.sec13=['Pendiente de an\xE1lisis'];

  // Guardar warnings/alerts en sec1 tambi\xE9n para que el admin las vea
  secs.sec1.warnings=warnings;

  console.log('REPORTE GENERADO: '+Object.keys(secs).length+' secciones | Perc:$'+(totalPerc/1e6).toFixed(1)+'M | Ded:$'+(totalDed/1e6).toFixed(1)+'M | Neto:$'+(totalNeto/1e6).toFixed(1)+'M');
  if(warnings.puestos_nuevos.length){
    console.warn('PUESTOS NUEVOS DETECTADOS: '+warnings.puestos_nuevos.length+' (top 20 por monto):');
    warnings.puestos_nuevos.slice(0,20).forEach(function(p){console.warn('  ['+p.tipo+'] '+p.puesto+' \u2192 $'+p.monto.toLocaleString())});
  }
  return secs;
}

// Reprocesar acumulado desde R2 sin volver a subir
async function reprocesar(){
  if(!CP){toast('No hay periodo seleccionado',false);return}
  var ok=await confirmAction({title:'Reprocesar reporte completo',msg:'Se descargar\xE1n todos los archivos guardados (acumulado, CFDI, contabilidad, n\xF3mina ISN) y se regenerar\xE1n las secciones del reporte. Esto puede tomar 1-3 minutos.',ok:'Reprocesar',danger:false});
  if(!ok)return;
  showLoading('Reprocesando reporte...','Descargando acumulado desde el servidor');
  setLoadingProgress(5,'');
  var resumenProc={acumulado:false,cfdi:false,contabilidad:false,nomina:false,errores:[]};
  try{
    // 1) ACUMULADO (obligatorio, define sec1/sec2/sec4-9/sec12)
    var resp=await fetch('/api/reprocesar',{method:'POST',headers:H,body:JSON.stringify({periodo_id:CP.id,empresa_id:CE.id,tipo:'acumulado'})});
    if(!resp.ok){var err=await resp.json();hideLoading();toast('Error acumulado: '+(err.error||resp.status),false);return}
    var buf=await resp.arrayBuffer();
    setLoadingText('Leyendo Excel acumulado','Procesando '+Math.round(buf.byteLength/1024/1024)+' MB');
    setLoadingProgress(15,'');
    var wb=XLSX.read(buf,{type:'array'});
    var ws=wb.Sheets[wb.SheetNames[0]];
    var data=XLSX.utils.sheet_to_json(ws,{defval:0});
    if(!data.length){hideLoading();toast('Excel acumulado vac\xEDo',false);return}
    var keys=Object.keys(data[0]);
    console.log('COLUMNAS DETECTADAS ('+keys.length+'):',keys.join(', '));
    var fc=findCol(keys);
    var basesCat={};
    try{
      var bRes2=await fetch('/api/bases-isn?empresa_id='+CE.id,{headers:H});
      var bD2=await bRes2.json();
      (bD2.bases||[]).forEach(function(b){basesCat[String(b.registro_patronal).trim()]=b.entidad_federativa});
    }catch(bErr2){console.warn('No se pudo cargar bases_isn:',bErr2)}
    setLoadingText('Generando secciones','Calculando totales por puesto, estado, registro patronal...');
    setLoadingProgress(30,'');
    var secs=generateAllSections(data,fc,basesCat);
    var cPerc=fc('TOTAL PERCEPCIONES');
    var cDed=fc('TOTAL DEDUCCIONES');
    var cISN=fc('Impuesto estatal');
    var cNo=fc('NO.');
    var totalP=0,totalD=0,totalISN=0,emps=new Set();
    data.forEach(function(r){
      totalP+=(r[cPerc]||0);totalD+=(r[cDed]||0);totalISN+=(r[cISN]||0);
      var id=r[cNo];if(id)emps.add(id);
    });
    var totalN=totalP-totalD;
    if(totalP===0){hideLoading();toast('ERROR: No se encontraron datos num\xE9ricos. Revisa consola F12',false);return}
    setLoadingText('Guardando reporte','Escribiendo en base de datos...');
    setLoadingProgress(45,'');
    var body={periodo_id:CP.id,empresa_id:CE.id,secciones:secs,totales:{empleados:emps.size,percepciones:totalP,deducciones:totalD,neto:totalN,isn:totalISN}};
    var r2=await fetch('/api/procesar-reporte',{method:'POST',headers:H,body:JSON.stringify(body)});
    if(!r2.ok){hideLoading();toast('Error guardando reporte',false);return}
    resumenProc.acumulado=true;

    // 2) CFDI (opcional) \u2014 actualiza sec1.cfdi_total y sec2[].cfdi
    try{
      setLoadingText('Procesando CFDIs','Descargando y calculando totales por periodo...');
      setLoadingProgress(60,'');
      var rC=await fetch('/api/reprocesar',{method:'POST',headers:H,body:JSON.stringify({periodo_id:CP.id,empresa_id:CE.id,tipo:'cfdi'})});
      if(rC.ok){
        var bufC=await rC.arrayBuffer();
        var blobC=new Blob([bufC],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        await processCfdiFile(blobC);
        resumenProc.cfdi=true;
      }else if(rC.status!==404){var eC=await rC.json().catch(function(){return{}});resumenProc.errores.push('CFDI: '+(eC.error||rC.status))}
    }catch(eC){console.warn('CFDI:',eC);resumenProc.errores.push('CFDI: '+eC.message)}

    // 3) CONTABILIDAD (opcional) \u2014 actualiza sec1.disp_total, sec2[].disp y sec11
    try{
      setLoadingText('Procesando contabilidad','Extrayendo dispersiones y provisi\xF3n global...');
      setLoadingProgress(75,'');
      var rK=await fetch('/api/reprocesar',{method:'POST',headers:H,body:JSON.stringify({periodo_id:CP.id,empresa_id:CE.id,tipo:'contabilidad'})});
      if(rK.ok){
        var bufK=await rK.arrayBuffer();
        var blobK=new Blob([bufK],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        await processContabilidadFile(blobK);
        resumenProc.contabilidad=true;
      }else if(rK.status!==404){var eK=await rK.json().catch(function(){return{}});resumenProc.errores.push('Contabilidad: '+(eK.error||rK.status))}
    }catch(eK){console.warn('Contabilidad:',eK);resumenProc.errores.push('Contabilidad: '+eK.message)}

    // 4) NOMINA ISN (opcional) \u2014 actualiza sec10
    try{
      setLoadingText('Procesando n\xF3mina ISN','Generando secci\xF3n X: ISN por estado...');
      setLoadingProgress(88,'');
      var rN=await fetch('/api/reprocesar',{method:'POST',headers:H,body:JSON.stringify({periodo_id:CP.id,empresa_id:CE.id,tipo:'nomina'})});
      if(rN.ok){
        var bufN=await rN.arrayBuffer();
        var blobN=new Blob([bufN],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        await processNominaIsnFile(blobN);
        resumenProc.nomina=true;
      }else if(rN.status!==404){var eN=await rN.json().catch(function(){return{}});resumenProc.errores.push('N\xF3mina ISN: '+(eN.error||rN.status))}
    }catch(eN){console.warn('N\xF3mina ISN:',eN);resumenProc.errores.push('N\xF3mina ISN: '+eN.message)}

    // 5) INFORME PDF (opcional) \u2014 actualiza sec7 (visor SAT)
    try{
      setLoadingText('Procesando informe PDF','Extrayendo visor SAT...');
      setLoadingProgress(95,'');
      var rI=await fetch('/api/reprocesar',{method:'POST',headers:H,body:JSON.stringify({periodo_id:CP.id,empresa_id:CE.id,tipo:'informe'})});
      if(rI.ok){
        var bufI=await rI.arrayBuffer();
        var blobI=new Blob([bufI],{type:'application/pdf'});
        await processInformePDF(blobI);
        resumenProc.informe=true;
      }else if(rI.status!==404){var eI=await rI.json().catch(function(){return{}});resumenProc.errores.push('Informe: '+(eI.error||rI.status))}
    }catch(eI){console.warn('Informe:',eI);resumenProc.errores.push('Informe: '+eI.message)}

    setLoadingProgress(100,'');
    var r3=await fetch('/api/periodos',{headers:H});PERS=(await r3.json()).periodos;
    CP=PERS.find(function(p){return p.id===CP.id});
    hideLoading();
    var procesados=[];
    if(resumenProc.acumulado)procesados.push('acumulado');
    if(resumenProc.cfdi)procesados.push('CFDI');
    if(resumenProc.contabilidad)procesados.push('contabilidad');
    if(resumenProc.nomina)procesados.push('n\xF3mina ISN');
    if(resumenProc.informe)procesados.push('informe');
    var msg='Reprocesados: '+procesados.join(', ')+'. '+emps.size+' empleados, $'+(totalN/1e6).toFixed(1)+'M.';
    if(resumenProc.errores.length){msg+=' Errores: '+resumenProc.errores.length;console.warn('Errores:',resumenProc.errores)}
    toast(msg,resumenProc.errores.length===0);
    renderClient();
  }catch(err){hideLoading();toast('Error: '+err.message,false);console.error(err)}
}



// \u2500\u2500 Auto-process Informe PDF \u2500\u2500
async function processInformePDF(file){
  if(!CP){toast('Primero crea el periodo',false);return}
  try{
    var buf=await file.arrayBuffer();
    var pdf=await pdfjsLib.getDocument({data:buf}).promise;
    var allText='';
    for(var i=1;i<=pdf.numPages;i++){
      var pg=await pdf.getPage(i);
      var tc=await pg.getTextContent();
      allText+=tc.items.map(function(it){return it.str}).join(' ');
      allText+=String.fromCharCode(10);
    }
    var resp=await fetch('/api/procesar-informe',{method:'POST',headers:H,body:JSON.stringify({
      periodo_id:CP.id,empresa_id:CE.id,text:allText
    })});
    if(resp.ok){
      var rd=await resp.json();
      var r3=await fetch('/api/periodos',{headers:H});PERS=(await r3.json()).periodos;
      CP=PERS.find(function(p){return p.id===CP.id});
    }else{
      var err=await resp.json();
      toast('Error procesando informe: '+(err.error||'desconocido'),false);
    }
  }catch(e){toast('Error leyendo PDF: '+e.message,false);console.error(e)}
}

async function fetchSeccionesParaPatch(){
  try{
    var r=await fetch('/api/reportes?periodo_id='+CP.id,{headers:H});
    if(!r.ok)return {};
    var d=await r.json();
    var out={};
    (d.reportes||[]).forEach(function(rep){
      try{out[rep.seccion]=JSON.parse(rep.datos_json)}catch(e){}
    });
    return out;
  }catch(e){return {}}
}

async function processCfdiFile(file){
  if(!CP){toast('Primero crea el periodo',false);return}
  toast('Leyendo CFDIs...',true);
  return new Promise(function(resolve){
    var reader=new FileReader();
    reader.onload=async function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        var data=XLSX.utils.sheet_to_json(ws,{defval:0});
        if(!data.length){toast('CFDI Excel vacio',false);resolve();return}
        var keys=Object.keys(data[0]);
        console.log('CFDI columnas ('+keys.length+'):',keys.join(', '));
        var fc=findCol(keys);
        var cPerc=fc('Total Percepciones')||fc('Total percepciones')||fc('TotalPercepciones')||fc('Percepciones');
        var cDed=fc('Total Deducciones')||fc('Total deducciones')||fc('TotalDeducciones')||fc('Deducciones');
        var cTotal=fc('Total');
        var cEstado=fc('Estado')||fc('Estatus');
        var rowsValidos=data.filter(function(r){
          if(!cEstado)return true;
          var ee=String(r[cEstado]||'').toLowerCase();
          return ee.indexOf('cancel')<0;
        });
        function num(v){if(typeof v==='number')return v||0;if(typeof v==='string'){var n=parseFloat(String(v).replace(/[,\\s$]/g,''));return isNaN(n)?0:n}return 0}
        var totalCfdi=0;
        rowsValidos.forEach(function(r){
          var p=cPerc?num(r[cPerc]):0;
          var d2=cDed?num(r[cDed]):0;
          if(p===0&&d2===0&&cTotal)totalCfdi+=num(r[cTotal]);
          else totalCfdi+=(p-d2);
        });
        totalCfdi=Math.round(totalCfdi*100)/100;
        var secs=await fetchSeccionesParaPatch();
        var sec1=secs.sec1||{};
        var sec2=secs.sec2||[];
        // \u2500\u2500 Matching real CFDI vs per\xEDodos por fecha de pago \u2500\u2500
        var calendar=window._hrmCalendar||[];
        var cfdiPorPeriodo={};
        var cfdiNoMatch=0;
        // Inicializar todos los per\xEDodos con 0
        sec2.forEach(function(p){cfdiPorPeriodo[p.p]=0});
        // Procesar cada CFDI: encontrar a qu\xE9 per\xEDodo pertenece por fecha de pago
        var cFecha=fc('Fecha pago');
        var cTotal=fc('Total')||fc('Total percepciones');
        var cEstado=fc('Estado')||fc('Estado cancelacion')||fc('Estado proceso cancelacion');
        rowsValidos.forEach(function(r){
          var payDate=r[cFecha];
          if(!payDate)return;
          var pd=typeof payDate==='string'?new Date(payDate):payDate;
          var monto=0;
          if(cTotal)monto=num(r[cTotal]);
          if(monto===0){
            var p=cPerc?num(r[cPerc]):0;
            var d2=cDed?num(r[cDed]):0;
            monto=p-d2;
          }
          // Buscar per\xEDodo que coincida con la fecha de pago
          var matched=false;
          for(var ci=0;ci<calendar.length;ci++){
            var cal=calendar[ci];
            if(cal.payDate){
              var pdTime=pd.getTime();
              var calTime=cal.payDate.getTime();
              // Coincidencia exacta de fecha de pago
              if(pdTime===calTime){
                var perKey=cal.period;
                if(!cfdiPorPeriodo[perKey])cfdiPorPeriodo[perKey]=0;
                cfdiPorPeriodo[perKey]+=monto;
                matched=true;
                break;
              }
            }
          }
          if(!matched){
            // Sin calendario: tratar de matchear por periodicidad + mes
            // CFDIs con periodicidad 99 (Otra) \u2192 bonos/finiquitos
            // Los que no matchean van al total general
            cfdiNoMatch+=monto;
          }
        });
        // Redondear
        for(var pk in cfdiPorPeriodo)cfdiPorPeriodo[pk]=Math.round(cfdiPorPeriodo[pk]*100)/100;
        var totalCfdiPorPeriodos=Object.values(cfdiPorPeriodo).reduce(function(a,b){return a+b},0);
        var totalCfdiReal=totalCfdiPorPeriodos+cfdiNoMatch;
        // \u2500\u2500 Dynamic date-based matching: applies when calendar is missing OR most CFDIs failed exact match \u2500\u2500
        // (Hoja1 calendar often contains stale data from previous month; this rebuilds buckets from the CFDI dates themselves)
        var calendarFailed=calendar.length===0||(totalCfdiPorPeriodos===0&&cfdiNoMatch>0)||(cfdiNoMatch>totalCfdiPorPeriodos&&totalCfdiPorPeriodos>0);
        if(calendarFailed){
          // Reset and rebuild by clustering pay dates
          cfdiPorPeriodo={};
          sec2.forEach(function(p){cfdiPorPeriodo[p.p]=0});
          cfdiNoMatch=0;
          var cPeriodicidad=fc('Periodicidad pago')||fc('PeriodicidadPago')||fc('Periodicidad');
          var entries=[];
          rowsValidos.forEach(function(r){
            var pd0=r[cFecha];
            if(!pd0)return;
            var d=typeof pd0==='string'?new Date(pd0):pd0;
            if(!d||isNaN(d.getTime()))return;
            var monto=0;
            if(cTotal)monto=num(r[cTotal]);
            if(monto===0){
              var pp=cPerc?num(r[cPerc]):0;
              var dd=cDed?num(r[cDed]):0;
              monto=pp-dd;
            }
            var per=cPeriodicidad?String(r[cPeriodicidad]||'').trim():'';
            entries.push({date:d,monto:monto,per:per});
          });
          if(entries.length){
            var earliest=entries[0].date.getTime();
            entries.forEach(function(e){if(e.date.getTime()<earliest)earliest=e.date.getTime()});
            // Period names available, sorted by numeric suffix
            function periodSort(a,b){
              var ma=parseInt((String(a).match(/\\d+/)||['0'])[0],10);
              var mb=parseInt((String(b).match(/\\d+/)||['0'])[0],10);
              return ma-mb;
            }
            var semList=[],catList=[];
            sec2.forEach(function(p){
              if(/^SEM/i.test(p.p))semList.push(p.p);
              else if(/^CAT/i.test(p.p))catList.push(p.p);
            });
            semList.sort(periodSort);
            catList.sort(periodSort);
            function bucketIndex(date,bucketDays){
              var diffMs=date.getTime()-earliest;
              var diffDays=Math.floor(diffMs/(1000*60*60*24));
              return Math.floor(diffDays/bucketDays);
            }
            entries.forEach(function(e){
              var perKey=null;
              var per=String(e.per).trim();
              // 02=Semanal (7-day blocks), 03=Catorcenal (14-day blocks)
              if(per.indexOf('02')===0||/SEMAN/i.test(per)){
                var idxS=bucketIndex(e.date,7);
                if(semList[idxS])perKey=semList[idxS];
              }else if(per.indexOf('03')===0||/CATORC/i.test(per)){
                var idxC=bucketIndex(e.date,14);
                if(catList[idxC])perKey=catList[idxC];
              }else{
                // Unknown periodicidad: try semanal first, fall back to catorcenal
                var idxS2=bucketIndex(e.date,7);
                if(semList[idxS2])perKey=semList[idxS2];
                else{var idxC2=bucketIndex(e.date,14);if(catList[idxC2])perKey=catList[idxC2]}
              }
              if(perKey){
                if(!cfdiPorPeriodo[perKey])cfdiPorPeriodo[perKey]=0;
                cfdiPorPeriodo[perKey]+=e.monto;
              }else{
                cfdiNoMatch+=e.monto;
              }
            });
            for(var pk2 in cfdiPorPeriodo)cfdiPorPeriodo[pk2]=Math.round(cfdiPorPeriodo[pk2]*100)/100;
            totalCfdiPorPeriodos=Object.values(cfdiPorPeriodo).reduce(function(a,b){return a+b},0);
            totalCfdiReal=totalCfdiPorPeriodos+cfdiNoMatch;
            console.log('CFDI matched via dynamic pay-date clustering: $'+totalCfdiPorPeriodos.toLocaleString()+' across '+(semList.length+catList.length)+' periods');
          }else{
            // No usable pay dates at all \u2192 proportional fallback
            var totalNomina=0;
            sec2.forEach(function(p){totalNomina+=p.nom||0});
            if(totalNomina>0){
              sec2.forEach(function(p){
                cfdiPorPeriodo[p.p]=Math.round(((p.nom||0)/totalNomina)*totalCfdi*100)/100;
              });
            }
            totalCfdiReal=totalCfdi;
          }
        }
        var nuevoSec1=Object.assign({},sec1,{cfdi_total:Math.round(totalCfdiReal*100)/100,cfdi_dif:Math.round(((sec1.total_neto||0)-totalCfdiReal)*100)/100});
        var nuevoSec2=sec2.map(function(p){return Object.assign({},p,{cfdi:cfdiPorPeriodo[p.p]||0})});
        var body={periodo_id:CP.id,empresa_id:CE.id,secciones:{sec1:nuevoSec1,sec2:nuevoSec2}};
        var resp=await fetch('/api/procesar-reporte',{method:'POST',headers:H,body:JSON.stringify(body)});
        if(resp.ok){console.log('CFDI procesado: total $'+totalCfdi.toLocaleString())}
        else{var et=await resp.text();console.error('Error CFDI:',et)}
        resolve();
      }catch(err){toast('Error CFDI: '+err.message,false);console.error('processCfdiFile:',err);resolve()}
    };
    reader.onerror=function(){toast('Error leyendo archivo CFDI',false);resolve()};
    reader.readAsArrayBuffer(file);
  });
}

async function processContabilidadFile(file){
  if(!CP){toast('Primero crea el periodo',false);return}
  toast('Leyendo contabilidad...',true);
  return new Promise(function(resolve){
    var reader=new FileReader();
    reader.onload=async function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array'});
        var ws=wb.Sheets[wb.SheetNames[0]];
        var data=XLSX.utils.sheet_to_json(ws,{defval:0});
        if(!data.length){toast('Contabilidad Excel vacio',false);resolve();return}
        var keys=Object.keys(data[0]);
        console.log('Contabilidad columnas ('+keys.length+'):',keys.join(', '));
        var fc=findCol(keys);
        var cDeb=fc('DEBIT AMOUNT')||fc('Debit')||fc('Cargo')||fc('CARGO')||fc('Debe');
        var cDes=fc('DESCRIPTION')||fc('Description')||fc('Descripcion')||fc('Glosa')||fc('Concepto')||fc('CONCEPTO')||fc('Referencia');
        var cCta=fc('ACCOUNT')||fc('Account')||fc('Cuenta')||fc('CUENTA')||fc('Codigo');
        function num(v){if(typeof v==='number')return v||0;if(typeof v==='string'){var n=parseFloat(String(v).replace(/[,\\s$]/g,''));return isNaN(n)?0:n}return 0}
        var rowsNomina=data.filter(function(r){
          var c=String(r[cCta]||'').toLowerCase();
          var d2=String(r[cDes]||'').toLowerCase();
          return c.indexOf('2489')>=0||c.indexOf('pasivo')>=0||c.indexOf('nomina')>=0||d2.indexOf('nomina')>=0;
        });
        var dispTotal=0;
        var dispPorPeriodo={};
        function detectarPeriodoDesc(desc){
          var u=String(desc||'').toUpperCase();
          var m=u.match(/SEM(?:ANA)?\\s*0?(\\d+)/);
          if(m)return 'SEM '+(m[1].length===1?'0':'')+m[1];
          m=u.match(/CAT(?:ORCENA)?\\s*0?(\\d+)/);
          if(m)return 'CAT '+(m[1].length===1?'0':'')+m[1];
          if(u.indexOf('FINIQ')>=0)return 'FINIQUITOS';
          if(u.indexOf('GRAT')>=0)return 'GRATIFICACION';
          if(u.indexOf('BONO')>=0&&u.indexOf('CAT')>=0)return 'BONOS CAT';
          if(u.indexOf('BONO')>=0&&u.indexOf('SEM')>=0)return 'BONOS SEM';
          if(u.indexOf('BONO')>=0)return 'BONOS';
          if(u.indexOf('PTU')>=0)return 'PTU';
          return null;
        }
        rowsNomina.forEach(function(r){
          var deb=num(r[cDeb]);
          if(deb<=0)return;
          dispTotal+=deb;
          var per=detectarPeriodoDesc(r[cDes]);
          if(per){dispPorPeriodo[per]=(dispPorPeriodo[per]||0)+deb}
        });
        dispTotal=Math.round(dispTotal*100)/100;
        Object.keys(dispPorPeriodo).forEach(function(k){dispPorPeriodo[k]=Math.round(dispPorPeriodo[k]*100)/100});
        var secs=await fetchSeccionesParaPatch();
        var sec1=secs.sec1||{};
        var sec2=secs.sec2||[];
        function matchPeriodo(pAcum){
          if(dispPorPeriodo[pAcum]!=null)return dispPorPeriodo[pAcum];
          var uA=String(pAcum).toUpperCase().replace(/\\s+/g,' ').trim();
          for(var k in dispPorPeriodo){
            var uK=String(k).toUpperCase().replace(/\\s+/g,' ').trim();
            if(uA===uK)return dispPorPeriodo[k];
          }
          return 0;
        }
        var nuevoSec1=Object.assign({},sec1,{disp_total:dispTotal,disp_dif:Math.round(((sec1.total_neto||0)-dispTotal)*100)/100});
        var nuevoSec2=sec2.map(function(p){return Object.assign({},p,{disp:matchPeriodo(p.p)})});
        var sec11Periodos=Object.keys(dispPorPeriodo).map(function(k){
          var nom=0;sec2.forEach(function(p){if(String(p.p).toUpperCase().trim()===k.toUpperCase().trim())nom=p.nom});
          return {p:k,prov:dispPorPeriodo[k],nom:nom,var:Math.round((dispPorPeriodo[k]-nom)*100)/100};
        });
        var nuevoSec11={
          provision_global:dispTotal,
          nomina_ajustada:sec1.total_neto||0,
          diferencia:Math.round(((sec1.total_neto||0)-dispTotal)*100)/100,
          periodos:sec11Periodos,
          notas:[]
        };
        var body={periodo_id:CP.id,empresa_id:CE.id,secciones:{sec1:nuevoSec1,sec2:nuevoSec2,sec11:nuevoSec11}};
        var resp=await fetch('/api/procesar-reporte',{method:'POST',headers:H,body:JSON.stringify(body)});
        if(resp.ok){console.log('Contabilidad procesada: dispersion total $'+dispTotal.toLocaleString())}
        else{var et=await resp.text();console.error('Error contabilidad:',et)}
        resolve();
      }catch(err){toast('Error contabilidad: '+err.message,false);console.error('processContabilidadFile:',err);resolve()}
    };
    reader.onerror=function(){toast('Error leyendo archivo contabilidad',false);resolve()};
    reader.readAsArrayBuffer(file);
  });
}

async function processNominaIsnFile(file){
  if(!CP){toast('Primero crea el periodo',false);return}
  toast('Leyendo nomina ISN...',true);
  return new Promise(function(resolve){
    var reader=new FileReader();
    reader.onload=async function(e){
      try{
        var wb=XLSX.read(e.target.result,{type:'array'});
        function num(v){if(typeof v==='number')return v||0;if(typeof v==='string'){var n=parseFloat(String(v).replace(/[,\\s$]/g,''));return isNaN(n)?0:n}return 0}
        var hojaResumen=null;
        for(var i=0;i<wb.SheetNames.length;i++){
          var nm=String(wb.SheetNames[i]).toLowerCase();
          if(nm.indexOf('resumen')>=0||nm.indexOf('summary')>=0){hojaResumen=wb.SheetNames[i];break}
        }
        var sec10=[];
        if(hojaResumen){
          var ws=wb.Sheets[hojaResumen];
          var rows=null;
          for(var hRow=0;hRow<3;hRow++){
            var rr=XLSX.utils.sheet_to_json(ws,{defval:0,range:hRow});
            if(rr.length&&Object.keys(rr[0]).length>=3){rows=rr;break}
          }
          if(rows&&rows.length){
            var ks=Object.keys(rows[0]);
            var fc=findCol(ks);
            var cEnt=fc('ENTIDAD FEDERATIVA')||fc('Entidad federativa')||fc('Estado')||fc('Entidad');
            var cEmp=fc('EMPLEADOS')||fc('Empleados')||fc('No. Empleados')||fc('NUM_EMPLEADOS');
            var cBase=fc('BASE ISN')||fc('Base ISN')||fc('Base')||fc('Base gravada');
            var cTasa=fc('TASA')||fc('Tasa')||fc('TASA ISN');
            var cImp=fc('IMPUESTO')||fc('Impuesto')||fc('IMP')||fc('ISN');
            var cAnt=fc('ANTERIOR')||fc('Anterior')||fc('Mes anterior')||fc('IMP ANT');
            var agg={};
            rows.forEach(function(r){
              var ent=String(r[cEnt]||'').trim();
              if(!ent)return;
              if(!agg[ent])agg[ent]={e:ent,emp:0,base:0,tasa:cTasa?num(r[cTasa]):0,imp:0,ant:0};
              agg[ent].emp+=cEmp?num(r[cEmp]):0;
              agg[ent].base+=cBase?num(r[cBase]):0;
              agg[ent].imp+=cImp?num(r[cImp]):0;
              agg[ent].ant+=cAnt?num(r[cAnt]):0;
              if(cTasa&&num(r[cTasa])>0)agg[ent].tasa=num(r[cTasa]);
            });
            for(var k in agg){
              var a=agg[k];
              sec10.push({e:a.e,emp:Math.round(a.emp),base:Math.round(a.base*100)/100,tasa:Math.round(a.tasa*100)/100,imp:Math.round(a.imp*100)/100,ant:Math.round(a.ant*100)/100,dif:Math.round((a.imp-a.ant)*100)/100});
            }
          }
        }
        if(!sec10.length){
          try{
            var bRes=await fetch('/api/bases-isn?empresa_id='+CE.id,{headers:H});
            var bD=await bRes.json();
            var basesCat={};(bD.bases||[]).forEach(function(b){basesCat[String(b.registro_patronal).trim()]={ent:b.entidad_federativa,tasa:b.tasa}});
            var resp=await fetch('/api/reprocesar',{method:'POST',headers:H,body:JSON.stringify({periodo_id:CP.id,empresa_id:CE.id,tipo:'acumulado'})});
            if(resp.ok){
              var buf=await resp.arrayBuffer();
              var wb2=XLSX.read(buf,{type:'array'});
              var ws2=wb2.Sheets[wb2.SheetNames[0]];
              var data2=XLSX.utils.sheet_to_json(ws2,{defval:0});
              var keys2=Object.keys(data2[0]);
              var fc2=findCol(keys2);
              var cRp2=fc2('REGISTRO PATRONAL');
              var cIsn2=fc2('Impuesto estatal');
              var cEmp2=fc2('NO.');
              var agg2={};
              data2.forEach(function(r){
                var rp=String(r[cRp2]||'').trim();if(!rp)return;
                var inf=basesCat[rp];if(!inf)return;
                if(!agg2[inf.ent])agg2[inf.ent]={e:inf.ent,emp:new Set(),base:0,tasa:inf.tasa,imp:0};
                agg2[inf.ent].emp.add(r[cEmp2]);
                agg2[inf.ent].imp+=num(r[cIsn2]);
              });
              for(var k2 in agg2){
                var a=agg2[k2];
                var baseAprox=a.tasa>0?(a.imp/(a.tasa/100)):0;
                sec10.push({e:a.e,emp:a.emp.size,base:Math.round(baseAprox*100)/100,tasa:Math.round(a.tasa*100)/100,imp:Math.round(a.imp*100)/100,ant:0,dif:0});
              }
            }
          }catch(fbErr){console.warn('Fallback sec10 fallo:',fbErr)}
        }
        sec10.sort(function(a,b){return b.imp-a.imp});
        var body={periodo_id:CP.id,empresa_id:CE.id,secciones:{sec10:sec10}};
        var resp2=await fetch('/api/procesar-reporte',{method:'POST',headers:H,body:JSON.stringify(body)});
        if(resp2.ok){console.log('Sec10 generada con '+sec10.length+' estados')}
        else{var et2=await resp2.text();console.error('Error sec10:',et2)}
        resolve();
      }catch(err){toast('Error nomina ISN: '+err.message,false);console.error('processNominaIsnFile:',err);resolve()}
    };
    reader.onerror=function(){toast('Error leyendo archivo nomina ISN',false);resolve()};
    reader.readAsArrayBuffer(file);
  });
}

loadAll();
<\/script></body></html>`;
}
__name(pageAdmin, "pageAdmin");
function pageRecover() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Restablecer contrase\xF1a \u2014 HRM</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;background:linear-gradient(150deg,#e8f4f8 0%,#d5eff3 40%,#c4e8ee 100%);color:#1a2e3a}
.nav{padding:18px 40px;background:rgba(255,255,255,.88);backdrop-filter:blur(12px);border-bottom:1px solid #b8ced8}.nav img{height:90px}
.center{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.card{background:#fff;border:1px solid #b8ced8;border-radius:20px;padding:40px;width:100%;max-width:400px;box-shadow:0 8px 40px rgba(26,46,58,.08);position:relative;overflow:hidden}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#1a8a8a,#40c8c8,#1a8a8a)}
.card h2{font-size:22px;font-weight:800;text-align:center;margin-bottom:8px}
.card .sub{color:#5f7d8a;font-size:14px;text-align:center;margin-bottom:24px}
label{display:block;font-size:11px;font-weight:700;color:#5f7d8a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}
input{width:100%;padding:13px 16px;background:#f0f6f8;border:1.5px solid #b8ced8;border-radius:10px;color:#1a2e3a;font-size:15px;outline:none;transition:all .2s;margin-bottom:16px;font-family:inherit}
input:focus{border-color:#1a8a8a;background:#fff;box-shadow:0 0 0 3px rgba(26,138,138,.08)}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#1a8a8a,#20a0a0);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
.msg{padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;display:none}
.msg-ok{background:rgba(32,160,160,.08);border:1px solid rgba(32,160,160,.2);color:#1a8a8a}
.msg-err{background:rgba(217,68,82,.06);border:1px solid rgba(217,68,82,.15);color:#d94452}
</style></head><body style="overflow-x:hidden;margin:0">
<nav class="nav"><img src="${LOGO}" alt="HRM"></nav>
<div class="center">
  <div class="card">
    <h2>Nueva contrase\xF1a</h2>
    <p class="sub">Ingresa tu nueva contrase\xF1a</p>
    <div class="msg" id="msg"></div>
    <label>Nueva contrase\xF1a</label>
    <input type="password" id="pw1" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" required>
    <label>Confirmar contrase\xF1a</label>
    <input type="password" id="pw2" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" required>
    <button class="btn" id="btn" onclick="doReset()">Cambiar contrase\xF1a</button>
    <p style="text-align:center;margin-top:20px"><a href="/" style="font-size:13px;color:#3d5a6b;text-decoration:none">Volver al login</a></p>
  </div>
</div>
<script>
var tk = new URLSearchParams(window.location.search).get('token');
if (!tk) { document.getElementById('msg').className='msg msg-err'; document.getElementById('msg').style.display='block'; document.getElementById('msg').textContent='Enlace inv\xE1lido. Solicita uno nuevo.'; document.getElementById('btn').disabled=true; }
async function doReset() {
  var pw1=document.getElementById('pw1').value, pw2=document.getElementById('pw2').value, msg=document.getElementById('msg'), btn=document.getElementById('btn');
  if (!pw1 || !pw2) { msg.className='msg msg-err'; msg.style.display='block'; msg.textContent='Completa ambos campos'; return; }
  if (pw1 !== pw2) { msg.className='msg msg-err'; msg.style.display='block'; msg.textContent='Las contrase\xF1as no coinciden'; return; }
  btn.disabled=true; btn.textContent='Guardando...';
  try {
    var r = await fetch('/api/recover', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token:tk,password:pw1}) });
    var d = await r.json();
    if (r.ok) { msg.className='msg msg-ok'; msg.style.display='block'; msg.textContent='Contrase\xF1a actualizada. Redirigiendo...'; setTimeout(function(){window.location.href='/'},2000); }
    else { msg.className='msg msg-err'; msg.style.display='block'; msg.textContent=d.error||'Error'; btn.disabled=false; btn.textContent='Cambiar contrase\xF1a'; }
  } catch(x) { msg.className='msg msg-err'; msg.style.display='block'; msg.textContent='Error de conexi\xF3n'; btn.disabled=false; btn.textContent='Cambiar contrase\xF1a'; }
}
<\/script></body></html>`;
}
__name(pageRecover, "pageRecover");
function pagePortal() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portal \u2014 HRM</title><style>${CSS}
@media(max-width:768px){
  .ct{padding:16px!important}
  .g2{grid-template-columns:1fr!important}
}
@media(max-width:480px){
  h1{font-size:18px!important}
  .per-card{padding:14px!important}
}
</style></head><body style="overflow-x:hidden">
<div class="top">
  <div class="top-l"><img src="${LOGO}" alt="HRM"></div>
  <div class="top-r"><span id="uN" style="font-weight:600;font-size:12px"></span><button class="bo br" onclick="logout()" data-tip="Cerrar sesi\xF3n" style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Salir</button></div>
</div>
<div class="ct">
  <h1 style="font-size:28px;font-weight:800;margin-bottom:6px" id="wt">Bienvenido</h1>
  <p style="color:#3d5a6b;font-size:14px;margin-bottom:28px" id="ws">Selecciona un periodo para ver el informe</p>
  <div id="yt"></div>
<div class="grid-c" id="pg"></div>
  <div class="empty" id="em" style="display:none;padding:60px 20px"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#c4d5dc" stroke-width="1.2" style="margin-bottom:16px;opacity:.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><h3 style="font-size:18px;color:#3d5a6b;margin-bottom:8px">Sin reportes disponibles</h3><p style="color:#5a7a8a;font-size:13px;max-width:380px;margin:0 auto">A\xFAn no hay periodos publicados para tu empresa. Tu administrador HRM los subir\xE1 conforme cierre la n\xF3mina mensual.</p></div>
</div>
<script>
${AUTH_ANY}
${LOGOUT_FN}
${FMT_FN}
${UI_FN}
document.getElementById('uN').textContent = U.empresa_nombre || '';
document.getElementById('wt').textContent = 'Bienvenido, ' + U.nombre;
if (U.empresa_nombre) document.getElementById('ws').textContent = 'Reportes de n\xF3mina \u2014 ' + U.empresa_nombre;
var tk_h={'Authorization':'Bearer '+tk};
function dlFile(key,name,btn){var _t=btn?btn.textContent:'';if(btn){btn.disabled=true;btn.textContent='...';}fetch('/api/download?key='+encodeURIComponent(key),{headers:tk_h}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.blob();}).then(function(b){var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=name||'archivo';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove();},100);if(btn){btn.disabled=false;btn.textContent=_t;}}).catch(function(e){alert('Error al descargar: '+e.message);if(btn){btn.disabled=false;btn.textContent=_t;}});}
function paintImpIcons(){
  if(!window._impDocs)return;
  document.querySelectorAll('#pg .pc').forEach(function(card){
    var pid=card.getAttribute('data-pid');if(!pid)return;
    var doc=window._impDocs[pid];if(!doc)return;
    if(card.querySelector('[data-imp-btn]'))return;
    card.style.position='relative';
    var btn=document.createElement('button');
    btn.type='button';
    btn.setAttribute('data-imp-btn','1');
    btn.title='Descargar PDF de impuestos';
    btn.style.cssText='position:absolute;top:10px;right:10px;background:#d4920a;color:#fff;border:none;border-radius:6px;padding:5px 9px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;z-index:2;box-shadow:0 1px 3px rgba(26,46,58,.15)';
    btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>PDF';
    btn.onclick=function(e){e.stopPropagation();dlFile(doc.r2_key,doc.nombre||'impuestos.pdf',btn);};
    card.appendChild(btn);
  });
}
var CY=null;
async function load() {
  showLoading('Cargando tus reportes...','Consultando periodos disponibles');
  var r = await fetch('/api/periodos', { headers: { 'Authorization': 'Bearer ' + tk } });
  if (!r.ok) { hideLoading(); localStorage.removeItem('hrm_token'); window.location.href = '/'; return; }
  var d = await r.json();
  hideLoading();
  if (!d.periodos.length) { document.getElementById('em').style.display = 'block'; return; }
  // Group by year
  var years={};
  d.periodos.forEach(function(p){
    if(!years[p.anio])years[p.anio]=[];
    years[p.anio].push(p);
  });
  var yrs=Object.keys(years).sort(function(a,b){return b-a});
  if(!CY)CY=yrs[0];
  window._years=years;
  window._yrs=yrs;
  render();
}
function render(){
  // Render year tabs with current CY highlighted
  var yrs=window._yrs||[];
  var h='<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">';
  yrs.forEach(function(y){
    h+='<div style="padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:700;font-size:14px;'+(y==CY?'background:#1a8a8a;color:#fff':'background:#fff;border:1px solid #d0dfe6;color:#3d5a6b')+'" onclick="CY='+y+';render()">'+y+'</div>';
  });
  h+='</div>';
  document.getElementById('yt').innerHTML=h;
  var periodos=window._years[CY]||[];
  document.getElementById('pg').innerHTML = periodos.map(function(p) {
    var hasData = p.total_empleados > 0;
    var statusBadge = hasData
      ? '<span style="position:absolute;bottom:12px;right:12px;background:#1a8a8a;color:#fff;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:5px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>Ver reporte</span>'
      : '<span style="position:absolute;bottom:12px;right:12px;background:#fff7e6;color:#d4920a;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:700;border:1px solid #f5c870">Pendiente</span>';
    return '<div class="pc" data-pid="'+p.id+'" style="position:relative;padding-bottom:48px" onclick="location.href=&#39;/reporte?id=' + p.id + '&#39;">' +
      '<h3 style="text-transform:capitalize;display:flex;align-items:center;gap:8px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a8a8a" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + p.mes + ' ' + p.anio + '</h3>' +
      '<div class="mt">' + (p.empresa_nombre || '') + '</div>' +
      '<div class="kps">' +
        '<div><div class="kp-l">Percepciones</div><div class="kp-v" style="color:#1a8a8a">$' + fmt(p.total_percepciones) + '</div></div>' +
        '<div><div class="kp-l">Neto pagado</div><div class="kp-v" style="color:#2a7ab5">$' + fmt(p.total_neto) + '</div></div>' +
        '<div><div class="kp-l">Deducciones</div><div class="kp-v" style="color:#d94452">$' + fmt(p.total_deducciones) + '</div></div>' +
        '<div><div class="kp-l">Empleados</div><div class="kp-v">' + p.total_empleados.toLocaleString() + '</div></div>' +
      '</div>' + statusBadge + '</div>';
  }).join('');
  paintImpIcons();
}
load();
// Load impuestos docs once and paint PDF icons on cards
(async function(){
  try{
    var dr=await fetch('/api/documentos?tipo=impuestos',{headers:tk_h});
    if(!dr.ok)return;
    var dd=await dr.json();
    var map={};
    (dd.documentos||[]).forEach(function(doc){if(doc.periodo_id&&!map[doc.periodo_id])map[doc.periodo_id]=doc;});
    window._impDocs=map;
    paintImpIcons();
  }catch(e){}
})();
<\/script></body></html>`;
}
__name(pagePortal, "pagePortal");
function pageReporte() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte \u2014 HRM</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"><\/script>
<style>
${CSS}
.sec{margin-bottom:24px;background:#fff;border:1px solid #b8ced8;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(26,46,58,.06)}
.sec-h{display:flex;align-items:center;gap:12px;padding:16px 20px;cursor:pointer;user-select:none}
.sec-h:hover{background:rgba(26,138,138,.02)}
.sec-h .arrow{margin-left:auto;font-size:12px;color:#5f7d8a;transition:transform .2s}
.sec.open .sec-h .arrow{transform:rotate(180deg)}
.sec-n{font-size:12px;font-weight:800;color:#1a8a8a;font-family:'Courier New',monospace;background:rgba(26,138,138,.08);padding:4px 10px;border-radius:6px}
.sec-t{font-size:16px;font-weight:700}
.sec-body{display:none;padding:0 20px 20px;border-top:1px solid #b8ced8}
.sec.open .sec-body{display:block}
.chart-c{background:#f8fbfc;border:1px solid #d0dfe6;border-radius:10px;padding:18px;margin-top:16px}
.chart-c h4{font-size:13px;font-weight:700;color:#3d5a6b;margin-bottom:12px}
.tbl-w{overflow-x:auto;border-radius:10px;border:1px solid #d0dfe6;margin-top:16px}
table{width:100%;border-collapse:collapse;font-size:12px}thead{background:#f0f6f8}
th{padding:10px 12px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#5f7d8a;font-weight:700;border-bottom:2px solid #b8ced8}th:first-child{text-align:left}
td{padding:8px 12px;text-align:right;font-family:'Courier New',monospace;font-size:11px;border-bottom:1px solid #d0dfe6;color:#3d5a6b}td:first-child{text-align:left;font-family:'Segoe UI',sans-serif;font-weight:600;color:#1a2e3a}
tr.tot td{font-weight:800;color:#1a2e3a;border-top:2px solid #b8ced8;background:#f0f6f8}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.callout{background:#f8fbfc;border:1px solid #d0dfe6;border-radius:10px;padding:16px;color:#3d5a6b;font-size:13px;line-height:1.7;border-left:4px solid #1a8a8a;margin-top:16px}
.act-item{display:flex;gap:12px;background:#f8fbfc;border:1px solid #d0dfe6;border-radius:10px;padding:14px 16px;margin-top:10px}
.act-n{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;background:rgba(212,146,10,.08);color:#d4920a;font-family:'Courier New',monospace}
.act-t{font-size:13px;color:#3d5a6b;line-height:1.6}
.back-link{display:inline-flex;align-items:center;gap:6px;color:#3d5a6b;font-size:13px;margin-bottom:16px;text-decoration:none;font-weight:600}
.back-link:hover{color:#1a8a8a;text-decoration:none}
.foot{margin-top:40px;padding:20px 0;border-top:1px solid #b8ced8;text-align:center;color:#5f7d8a;font-size:12px}
.loading{text-align:center;padding:40px;color:#5f7d8a}
.g4{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.kpi-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:900px){
  .g4{grid-template-columns:1fr 1fr!important}
  .kpi-row2{grid-template-columns:1fr!important}
}
@media(max-width:600px){
  .g4{grid-template-columns:1fr!important}
  .kpi-row2{grid-template-columns:1fr!important}
  .ct{padding:14px!important}
  h1{font-size:16px!important}
  .kpi{padding:12px 14px!important}
  .kpi-v{font-size:15px!important}
  .kpi-l{font-size:9px!important}
  .sec-hd{padding:12px 14px!important}
  .sec-hd .num{font-size:16px;width:28px;height:28px;min-width:28px}
  .sec-hd .tit{font-size:12px}
  .sec-bd{padding:12px!important;overflow-x:auto}
  .sec-bd table{font-size:10px}
  .sec-bd th,.sec-bd td{padding:4px 6px!important}
}


@media(max-width:600px){.emp-grid,.imp-grid{grid-template-columns:1fr!important}}
</style></head><body style="overflow-x:hidden;margin:0">
<div class="top">
  <div class="top-l"><img src="${LOGO}" alt="HRM"></div>
  <div class="top-r"><span id="uN" style="font-weight:600;font-size:12px"></span><button class="bo br" onclick="logout()" data-tip="Cerrar sesi\xF3n" style="display:inline-flex;align-items:center;gap:5px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Salir</button></div>
</div>
<div class="ct">
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px"><div><h1 style="font-size:22px;font-weight:800;margin:0;color:#1a2e3a">Informe de supervisi\xF3n de n\xF3mina</h1></div><div style="display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center"><button onclick="expandAll()" class="bo" data-tip="Abrir todas las secciones" style="font-size:11px">Expandir todo</button><button onclick="collapseAll()" class="bo" data-tip="Cerrar todas las secciones" style="font-size:11px">Colapsar todo</button><button onclick="window.print()" class="bo" data-tip="Imprimir o exportar como PDF" style="font-size:11px">Imprimir / PDF</button><a href="/portal" style="display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:#1a8a8a;border-radius:8px;color:#fff;font-size:12px;font-weight:600;text-decoration:none;letter-spacing:.02em">\u2190 Portal</a></div></div>
<p style="color:#3d5a6b;font-size:14px;margin-bottom:24px" id="ts"></p>
<div id="kpis"></div>
<div id="impuestosBanner"></div>
<div id="nominaClienteBanner"></div>
<div id="sections"><div class="loading" style="text-align:center;padding:40px 20px"><div style="width:42px;height:42px;border:4px solid #e8f1f4;border-top-color:#1a8a8a;border-radius:50%;margin:0 auto 14px;animation:ldoRot 1s linear infinite"></div><div style="font-size:14px;font-weight:700;color:#3d5a6b">Cargando reporte</div><div style="font-size:12px;color:#8ba5b2;margin-top:4px">Consultando 12 secciones de informaci\xF3n...</div></div></div>
<div class="foot"><img src="${LOGO}" alt="HRM" style="height:24px;opacity:.5;display:block;margin:0 auto 6px">HRM Human Resources Management</div>
</div>
<script>
${AUTH_ANY}
${LOGOUT_FN}
${FMT_FN}
${UI_FN}
document.getElementById('uN').textContent=U.empresa_nombre||'';
var pid=new URLSearchParams(window.location.search).get('id');
var tk_h={'Authorization':'Bearer '+tk};
function dlFile(key,name,btn){var _t=btn?btn.textContent:'';if(btn){btn.disabled=true;btn.textContent='Descargando...';}fetch('/api/download?key='+encodeURIComponent(key),{headers:tk_h}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.blob();}).then(function(b){var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=name||'archivo';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove();},100);if(btn){btn.disabled=false;btn.textContent=_t;}}).catch(function(e){alert('Error al descargar: '+e.message);if(btn){btn.disabled=false;btn.textContent=_t;}});}
var tl='#1a8a8a',rd='#d94452',bl='#2a7ab5',am='#d4920a',pr='#7b5ea7',gn='#2a9d5c';
var rendered={};
function toggle(id){var el=document.getElementById(id);el.classList.toggle('open');if(el.classList.contains('open')&&!rendered[id]){rendered[id]=true;renderSection(id);}}

(async function(){
  // Load periodo info
  var r=await fetch('/api/periodos',{headers:tk_h});
  if(!r.ok){window.location.href='/portal';return}
  var d=await r.json();var p=null;
  for(var i=0;i<d.periodos.length;i++){if(d.periodos[i].id==pid){p=d.periodos[i];break}}
  if(!p){document.getElementById('ts').textContent='Periodo no encontrado';return}
  document.getElementById('ts').textContent=(p.empresa_nombre||'')+' \u2014 '+p.mes+' '+p.anio;
  
  // KPIs from periodo
  document.getElementById('kpis').innerHTML=
    '<div class="g4" style="gap:12px;margin-bottom:12px">'+
    '<div class="kpi" style="border-top:3px solid '+tl+'"><div style="font-size:10px;font-weight:700;color:#5a7a8a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Percepciones</div><div style="font-size:18px;font-weight:800;color:'+tl+';font-family:monospace">$'+fmt(p.total_percepciones)+'</div></div>'+
    '<div class="kpi" style="border-top:3px solid '+rd+'"><div style="font-size:10px;font-weight:700;color:#5a7a8a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Deducciones</div><div style="font-size:18px;font-weight:800;color:'+rd+';font-family:monospace">$'+fmt(p.total_deducciones)+'</div></div>'+
    '<div class="kpi" style="border-top:3px solid '+bl+'"><div style="font-size:10px;font-weight:700;color:#5a7a8a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Neto</div><div style="font-size:18px;font-weight:800;color:'+bl+';font-family:monospace">$'+fmt(p.total_neto)+'</div></div>'+
    '</div>'+
    '<div class="kpi-row2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">'+
    '<div class="kpi" style="border-top:3px solid '+pr+'"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px"><div style="font-size:10px;font-weight:700;color:#5a7a8a;text-transform:uppercase;letter-spacing:.08em">Empleados</div><div style="font-size:22px;font-weight:800;color:#1a2e3a">'+p.total_empleados.toLocaleString()+'</div></div><div style="border-top:1px solid #e8f1f4;padding-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;font-size:11px" id="empGrid"></div></div>'+
    '<div class="kpi" style="border-top:3px solid '+am+'"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px"><div style="font-size:10px;font-weight:700;color:#5a7a8a;text-transform:uppercase;letter-spacing:.08em">Impuestos</div><div style="font-size:18px;font-weight:800;color:'+am+';font-family:monospace" id="impTotalV">$0</div></div><div style="border-top:1px solid #e8f1f4;padding-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px" id="impGrid"></div></div>'+
    '</div>';

  // Load all report sections from API
  var r2=await fetch('/api/reportes?periodo_id='+pid,{headers:tk_h});
  var rd2=await r2.json();
  window.RD={};
  rd2.reportes.forEach(function(rep){window.RD[rep.seccion]=JSON.parse(rep.datos_json);});
  
  
  
  // Populate employee breakdown grid
  var s1d=window.RD['sec1']||{};
  var empG=document.getElementById('empGrid');
  if(empG){
    var rows=[{l:'Semanales',v:s1d.sem_prom||0},{l:'Catorcenales',v:s1d.cat_prom||0},{l:'Finiquitos',v:s1d.emp_finiquitos||0},{l:'Bonos sem.',v:s1d.emp_bonos_sem||0},{l:'Bonos cat.',v:s1d.emp_bonos_cat||0}];
    if(s1d.emp_gratificacion)rows.push({l:'Gratificaci\xF3n',v:s1d.emp_gratificacion});
    empG.innerHTML=rows.map(function(r){return '<div style="display:flex;justify-content:space-between"><span style="color:#8ba5b2">'+r.l+'</span><span style="font-weight:700;color:#1a2e3a">'+r.v.toLocaleString()+'</span></div>'}).join('');
  }

  // Populate impuestos breakdown grid
  var s7d=window.RD['sec7']||{};var s8d=window.RD['sec8']||{};
  var impTotal=(s7d.total_trabajador||0)+(s8d.total_patron||0);
  var impV=document.getElementById('impTotalV');
  if(impV)impV.textContent='$'+fmt(impTotal);
  var impG=document.getElementById('impGrid');
  if(impG){
    var h='<div>';
    h+='<div style="font-size:9px;font-weight:700;color:'+am+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Trabajador</div>';
    [{l:'ISR',v:s7d.total_isr},{l:'IMSS+RCV',v:s7d.total_imss},{l:'Infonavit',v:s7d.total_info},{l:'FONACOT',v:s7d.total_fon}].forEach(function(r){
      h+='<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:#8ba5b2">'+r.l+'</span><span style="font-weight:600;color:#1a2e3a;font-family:monospace;font-size:10px">$'+fmt(r.v||0)+'</span></div>';
    });
    h+='<div style="display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid #e8f1f4;margin-top:2px"><span style="font-weight:700;color:'+am+';font-size:10px">Subtotal</span><span style="font-weight:700;color:'+am+';font-family:monospace;font-size:10px">$'+fmt(s7d.total_trabajador||0)+'</span></div>';
    h+='</div><div>';
    h+='<div style="font-size:9px;font-weight:700;color:'+tl+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">Patr\xF3n</div>';
    [{l:'IMSS',v:s8d.total_imss},{l:'RCV',v:s8d.total_rcv},{l:'Infonavit',v:s8d.total_info},{l:'Imp. estatal',v:s8d.isn_total}].forEach(function(r){
      h+='<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:#8ba5b2">'+r.l+'</span><span style="font-weight:600;color:#1a2e3a;font-family:monospace;font-size:10px">$'+fmt(r.v||0)+'</span></div>';
    });
    h+='<div style="display:flex;justify-content:space-between;padding:2px 0;border-top:1px solid #e8f1f4;margin-top:2px"><span style="font-weight:700;color:'+tl+';font-size:10px">Subtotal</span><span style="font-weight:700;color:'+tl+';font-family:monospace;font-size:10px">$'+fmt(s8d.total_patron||0)+'</span></div>';
    h+='</div>';
    h+='<div id="impPdfLink" style="grid-column:1/-1;text-align:center;margin-top:8px;padding-top:8px;border-top:1px solid #e8f1f4"><span style="color:#8ba5b2;font-size:10px">Cargando PDF...</span></div>';
    impG.innerHTML=h;
  // Load impuestos PDF link + banner
  (function(){
    fetch('/api/documentos?periodo_id='+pid+'&tipo=impuestos',{headers:tk_h}).then(function(r){return r.json()}).then(function(d){
      var banner=document.getElementById('impuestosBanner');
      var el=document.getElementById('impPdfLink');
      var has=d.documentos&&d.documentos.length>0;
      if(has){
        var doc=d.documentos[0];
        var nm=doc.nombre||'impuestos.pdf';
        if(banner){
          banner.innerHTML='<div style="background:#fff7e6;border:1px solid #f5c870;border-left:4px solid #d4920a;border-radius:12px;padding:18px 22px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div style="font-size:11px;font-weight:700;color:#d4920a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Impuestos del periodo</div><div style="font-size:15px;font-weight:700;color:#1a2e3a;margin-bottom:2px">PDF disponible para descarga</div><div style="font-size:12px;color:#5f7d8a" id="impBnrNm"></div></div><button type="button" id="impBnrBtn" style="background:#d4920a;color:#fff;border:none;border-radius:8px;padding:12px 22px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar PDF</button></div>';
          var nmEl=document.getElementById('impBnrNm');if(nmEl)nmEl.textContent=nm;
          var bbtn=document.getElementById('impBnrBtn');if(bbtn)bbtn.onclick=function(){dlFile(doc.r2_key,nm,bbtn);};
        }
        if(el){
          el.innerHTML='<button type="button" id="impPdfBtn" style="background:#d4920a;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:10px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar PDF de impuestos</button>';
          var ibtn=document.getElementById('impPdfBtn');if(ibtn)ibtn.onclick=function(){dlFile(doc.r2_key,nm,ibtn);};
        }
      }else{
        if(banner)banner.innerHTML='<div style="background:#f0f6f8;border:1px dashed #b8ced8;border-radius:12px;padding:14px 18px;margin-bottom:20px;color:#5f7d8a;font-size:12px;font-style:italic;text-align:center">PDF de impuestos a\xFAn no disponible para este periodo.</div>';
        if(el)el.innerHTML='<span style="color:#8ba5b2;font-size:10px;font-style:italic">PDF de impuestos a\xFAn no disponible</span>';
      }
    }).catch(function(){
      var banner=document.getElementById('impuestosBanner');
      var el=document.getElementById('impPdfLink');
      if(banner)banner.innerHTML='';
      if(el)el.innerHTML='<span style="color:#8ba5b2;font-size:10px;font-style:italic">PDF no disponible</span>';
    });
  })();

  // Load Nomina Cliente (Excel) banner — admin ve todas, socio solo su empresa (gating en /api/download)
  (function(){
    fetch('/api/documentos?periodo_id='+pid+'&tipo=nomina_cliente',{headers:tk_h}).then(function(r){return r.json()}).then(function(d){
      var banner=document.getElementById('nominaClienteBanner');if(!banner)return;
      if(d.documentos&&d.documentos.length>0){
        var doc=d.documentos[0];var nm=doc.nombre||'Nomina Cliente.xlsx';
        banner.innerHTML='<div style="background:#eafaf1;border:1px solid #8fd3ad;border-left:4px solid #1a8a5a;border-radius:12px;padding:18px 22px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div style="font-size:11px;font-weight:700;color:#1a8a5a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">N\xF3mina Cliente del periodo</div><div style="font-size:15px;font-weight:700;color:#1a2e3a;margin-bottom:2px">Excel disponible para descarga</div><div style="font-size:12px;color:#5f7d8a" id="ncBnrNm"></div></div><button type="button" id="ncBnrBtn" style="background:#1a8a5a;color:#fff;border:none;border-radius:8px;padding:12px 22px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar Excel</button></div>';
        var nmEl=document.getElementById('ncBnrNm');if(nmEl)nmEl.textContent=nm;
        var b=document.getElementById('ncBnrBtn');if(b)b.onclick=function(){dlFile(doc.r2_key,nm,b);};
      }
    }).catch(function(){});
  })();

  }


  // Build section headers - sec1 and sec2 are internal (admin only)
  var secs=[
    {id:'sec1',n:'I',t:'Integraci\xF3n de la n\xF3mina'},
    {id:'sec2',n:'II',t:'Importes de la n\xF3mina, CFDIs y Pagos'},
    {id:'sec4',n:'III',t:'Concentrado n\xF3mina'},
    {id:'sec5',n:'IV',t:'Totales por puesto'},
    {id:'sec6',n:'V',t:'Totales por estado'},
    {id:'sec7',n:'VI',t:'Impuestos y visor de n\xF3minas SAT'},
    {id:'sec8',n:'VII',t:'Contribuciones'},
    {id:'sec9',n:'VIII',t:'IMSS y RCV por registro patronal'},
    {id:'sec10',n:'IX',t:'Impuesto sobre n\xF3mina por estado'},
    {id:'sec11',n:'X',t:'Provisi\xF3n Global (contabilidad) vs N\xF3mina'},
    {id:'sec12',n:'XI',t:'Tendencias de los movimientos de n\xF3mina'},
    {id:'sec14',n:'XII',t:'Comisiones y Seguro Social semanal'},
    {id:'sec13',n:'XIII',t:'Acciones de mejora'}
  ];
  var html='';
  secs.forEach(function(s){
    html+='<div class="sec" id="'+s.id+'"><div class="sec-h" onclick="toggle(&#39;'+s.id+'&#39;)"><span class="sec-n">'+s.n+'</span><span class="sec-t">'+s.t+'</span><span class="arrow">\u25BC</span></div><div class="sec-body"><div id="body_'+s.id+'"><div class="loading">Cargando...</div></div></div></div>';
  });
  document.getElementById('sections').innerHTML=html;
})();

function expandAll(){document.querySelectorAll('.sec').forEach(function(s){if(!s.classList.contains('open')){s.classList.add('open');var id=s.id;if(!rendered[id]){rendered[id]=true;renderSection(id);}}});}
function collapseAll(){document.querySelectorAll('.sec').forEach(function(s){s.classList.remove('open');});}
function renderSection(id){
  Chart.defaults.font.family="'Segoe UI',sans-serif";Chart.defaults.font.size=11;
  var D=window.RD[id];
  if(!D){document.getElementById('body_'+id).innerHTML='<div style="padding:20px;background:#fff7e6;border:1px solid #ffd98a;border-left:4px solid #d4920a;border-radius:10px;margin:12px 0;color:#6b4a0a;font-size:13px;line-height:1.6"><b style="font-size:14px">Informaci\xF3n pendiente</b><br><br>Esta secci\xF3n a\xFAn no tiene datos. Sube los archivos del periodo desde el panel de admin para generar el reporte.</div>';return}
  // Handle "no data available" placeholder sections (uploaded PDF only, missing Excel files)
  if(D&&D._nota){
    document.getElementById('body_'+id).innerHTML='<div style="padding:20px;background:#fff7e6;border:1px solid #ffd98a;border-left:4px solid #d4920a;border-radius:10px;margin:12px 0;color:#6b4a0a;font-size:13px;line-height:1.6"><div style="display:flex;align-items:flex-start;gap:10px"><div style="flex-shrink:0;width:28px;height:28px;background:#d4920a;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">!</div><div><b style="font-size:14px;color:#3d5a6b">Informaci\xF3n faltante en esta secci\xF3n</b><div style="margin-top:8px">'+D._nota+'</div></div></div></div>';
    return;
  }
  var el=document.getElementById('body_'+id);var h='';
  var tl='#1a8a8a',rd='#d94452',bl='#2a7ab5',am='#d4920a',pr='#7b5ea7',gn='#2a9d5c';

  if(id==='sec1'){
    h='<div style="margin-bottom:14px;font-size:12px;color:#5f7d8a">Empleados semanales promedio: <b style="color:#1a2e3a">'+(D.sem_prom||0).toLocaleString()+'</b> \xB7 Catorcenales promedio: <b style="color:#1a2e3a">'+(D.cat_prom||0).toLocaleString()+'</b></div>';
    h+='<div class="tbl-w"><table><thead><tr><th style="text-align:left">Concepto</th><th>Importe</th></tr></thead><tbody>';
    h+='<tr><td>Percepciones</td><td style="color:'+tl+'"><b>$'+fmt(D.percepciones)+'</b></td></tr>';
    h+='<tr><td>Deducciones</td><td style="color:'+rd+'"><b>$'+fmt(D.deducciones)+'</b></td></tr>';
    h+='<tr class="tot"><td>TOTAL (Neto)</td><td><b>$'+fmt(D.total_neto)+'</b></td></tr></tbody></table></div>';
    h+='<div class="g2" style="margin-top:16px"><div class="callout"><b>N\xF3mina vs CFDIs</b><div style="margin-top:10px"><div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span>N\xF3mina</span><span style="font-family:monospace">$'+fmt(D.total_neto)+'</span></div><div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span>CFDI</span><span style="font-family:monospace">$'+fmt(D.cfdi_total)+'</span></div><div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700;border-top:2px solid #d4e5eb;margin-top:6px"><span>Diferencia</span><span style="color:'+tl+'">$'+fmt(D.cfdi_dif)+'</span></div></div></div>';
    h+='<div class="callout"><b>N\xF3mina vs Dispersiones</b><div style="margin-top:10px"><div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span>N\xF3mina</span><span style="font-family:monospace">$'+fmt(D.total_neto)+'</span></div><div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px"><span>Dispersiones</span><span style="font-family:monospace">$'+fmt(D.disp_total)+'</span></div><div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700;border-top:2px solid #d4e5eb;margin-top:6px"><span>Diferencia</span><span style="color:'+tl+'">$'+fmt(D.disp_dif)+'</span></div></div></div></div>';
    if(D.warnings){
      var W=D.warnings;
      var wList=function(title,items,fmtItem){
        if(!items||!items.length)return '';
        var top=items.slice(0,3),rest=items.slice(3);
        var b='<div style="margin-top:14px;padding:12px 14px;background:#fff7e6;border:1px solid #ffd98a;border-left:4px solid #d4920a;border-radius:8px"><b style="font-size:12px;color:#6b4a0a">&#9888; '+title+' ('+items.length+')</b><ul style="margin:6px 0 0 18px;padding:0;font-size:11px;color:#5a3d08">';
        top.forEach(function(it){b+='<li>'+fmtItem(it)+'</li>'});
        if(rest.length){
          var rid='wmore_'+Math.random().toString(36).slice(2,8);
          b+='</ul><div id="'+rid+'" style="display:none"><ul style="margin:6px 0 0 18px;padding:0;font-size:11px;color:#5a3d08">';
          rest.forEach(function(it){b+='<li>'+fmtItem(it)+'</li>'});
          b+='</ul></div><a href="#" data-wmore="'+rid+'" data-n="'+rest.length+'" style="display:inline-block;margin-top:6px;font-size:11px;color:#d4920a;font-weight:600;text-decoration:none">Ver m&aacute;s ('+rest.length+')</a>';
        }else{b+='</ul>'}
        b+='</div>';return b;
      };
      h+=wList('Conceptos nuevos detectados (revisar antes de publicar)',W.conceptos_nuevos,function(it){return '<b>'+it.col+'</b> &mdash; Total: $'+fmt(it.total)+' <span style="color:#888">('+(it.tipo||'?')+')</span>'});
      h+=wList('Puestos nuevos detectados (revisar antes de publicar)',W.puestos_nuevos,function(it){return '<b>'+it.puesto+'</b> <span style="color:#888">['+it.tipo+']</span> &mdash; Monto: $'+fmt(it.monto)});
      if(W.columnas_no_detectadas&&W.columnas_no_detectadas.length){
        h+='<div style="margin-top:10px;padding:10px 14px;background:#fef5f5;border:1px solid #f5a3aa;border-left:4px solid #d94452;border-radius:8px;font-size:12px;color:#7a1f29"><b>&#9888; Columnas no detectadas en el Excel:</b> '+W.columnas_no_detectadas.join(', ')+'</div>';
      }
    }
    el.innerHTML=h;
    // Bind Ver m\xE1s toggles
    el.querySelectorAll('a[data-wmore]').forEach(function(a){
      a.onclick=function(ev){
        ev.preventDefault();
        var box=document.getElementById(a.getAttribute('data-wmore'));
        if(!box)return;
        var hidden=box.style.display==='none';
        box.style.display=hidden?'block':'none';
        a.textContent=hidden?'Ver menos':('Ver m\xE1s ('+a.getAttribute('data-n')+')');
      };
    });
  }
  if(id==='sec2'){
    var nomT=0,cfdiT=0,dispT=0;D.forEach(function(r){nomT+=r.nom;cfdiT+=r.cfdi;dispT+=r.disp});
    h='<div class="g2" style="margin-bottom:16px"><div class="callout">Dif. N\xF3mina vs CFDI: <b style="color:'+tl+'">$'+fmt(nomT-cfdiT)+'</b></div><div class="callout">Dif. N\xF3mina vs Dispersiones: <b style="color:'+tl+'">$'+fmt(nomT-dispT)+'</b></div></div>';
    h+='<div class="tbl-w"><table><thead><tr><th>Periodo</th><th>N\xF3mina</th><th>CFDI</th><th>Dif</th><th>Dispersi\xF3n</th><th>Dif</th></tr></thead><tbody>';
    D.forEach(function(r){var d1=(r.nom-r.cfdi);var d2=(r.nom-r.disp);h+='<tr><td>'+r.p+'</td><td>$'+fmt(r.nom)+'</td><td>$'+fmt(r.cfdi)+'</td><td style="color:'+(Math.abs(d1)<1?tl:rd)+'"><b>$'+fmt(d1)+'</b></td><td>$'+fmt(r.disp)+'</td><td style="color:'+(Math.abs(d2)<1?tl:rd)+'"><b>$'+fmt(d2)+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td>$'+fmt(nomT)+'</td><td>$'+fmt(cfdiT)+'</td><td style="color:'+tl+'"><b>$'+fmt(nomT-cfdiT)+'</b></td><td>$'+fmt(dispT)+'</td><td style="color:'+tl+'"><b>$'+fmt(nomT-dispT)+'</b></td></tr></tbody></table></div>';
    el.innerHTML=h;
  }
  if(id==='sec4'){
    h='<div class="chart-c"><h4>Neto por periodo</h4><canvas id="c4" height="220"></canvas></div>';
    h+='<div class="tbl-w" style="margin-top:16px"><table><thead><tr><th colspan="2" style="text-align:center;color:'+tl+'">PERCEPCIONES</th></tr><tr><th>Concepto</th><th>Total</th></tr></thead><tbody>';
    D.percepciones.forEach(function(c){h+='<tr><td>'+c.c+'</td><td style="color:'+tl+'">$'+fmt(c.t)+'</td></tr>'});
    h+='<tr class="tot"><td>TOTAL PERCEPCIONES</td><td style="color:'+tl+'"><b>$'+fmt(D.total_perc)+'</b></td></tr>';
    h+='<tr><td colspan="2" style="text-align:center;color:'+rd+';font-weight:700;background:#fef5f5;padding:8px">DEDUCCIONES</td></tr>';
    D.deducciones.forEach(function(c){var tip=c.group&&c.group.length>1?' <span style="font-size:10px;color:#888" title="'+c.group.join(" + ")+'">(agrupado: '+c.group.length+')</span>':'';h+='<tr><td>'+c.c+tip+'</td><td style="color:'+rd+'">$'+fmt(c.t)+'</td></tr>'});
    h+='<tr class="tot"><td>TOTAL DEDUCCIONES</td><td style="color:'+rd+'"><b>$'+fmt(D.total_ded)+'</b></td></tr>';
    h+='<tr class="tot"><td><b>NETO</b></td><td><b>$'+fmt(D.total_neto)+'</b></td></tr>';
    if(D.despensa){h+='<tr><td colspan="2" style="text-align:center;color:'+bl+';font-weight:700;background:#f4f9fc;padding:8px">DESPENSA (informativo, s\xED cuenta vs CFDIs)</td></tr><tr><td>'+D.despensa.c+'</td><td style="color:'+bl+'">$'+fmt(D.despensa.t)+'</td></tr>'}
    h+='</tbody></table></div>';
    h+='<div class="tbl-w" style="margin-top:16px"><table><thead><tr><th>Periodo</th><th>Percepciones</th><th>Deducciones</th><th>Neto</th></tr></thead><tbody>';
    D.periodos.forEach(function(r){h+='<tr><td>'+r.p+'</td><td style="color:'+tl+'">$'+fmt(r.perc)+'</td><td style="color:'+rd+'">$'+fmt(r.ded)+'</td><td><b>$'+fmt(r.neto)+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td style="color:'+tl+'"><b>$'+fmt(D.total_perc)+'</b></td><td style="color:'+rd+'"><b>$'+fmt(D.total_ded)+'</b></td><td><b>$'+fmt(D.total_neto)+'</b></td></tr></tbody></table></div>';
    el.innerHTML=h;
    new Chart(document.getElementById('c4'),{type:'bar',data:{labels:D.periodos.map(function(r){return r.p}),datasets:[{data:D.periodos.map(function(r){return r.neto}),backgroundColor:bl+'44',borderColor:bl,borderWidth:1}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:function(v){return '$'+(v/1e6).toFixed(0)+'M'}}}}}});
  }
  if(id==='sec5'){
    h='<h4 style="font-size:13px;color:'+tl+';margin-bottom:10px">N\xF3mina Semanal (Neto + Despensa)</h4><div class="tbl-w"><table><thead><tr><th>Puesto</th><th>Importe</th></tr></thead><tbody>';
    D.semanal.forEach(function(r){h+='<tr><td>'+r.n+'</td><td style="color:'+tl+'"><b>$'+fmt(r.v)+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL SEMANAL</td><td style="color:'+tl+'"><b>$'+fmt(D.total_sem)+'</b></td></tr></tbody></table></div>';
    h+='<h4 style="font-size:13px;color:'+bl+';margin:20px 0 10px">N\xF3mina Catorcenal (Neto + Despensa)</h4><div class="tbl-w"><table><thead><tr><th>Puesto</th><th>Importe</th></tr></thead><tbody>';
    D.catorcenal.forEach(function(r){h+='<tr><td>'+r.n+'</td><td style="color:'+bl+'"><b>$'+fmt(r.v)+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL CATORCENAL</td><td style="color:'+bl+'"><b>$'+fmt(D.total_cat)+'</b></td></tr></tbody></table></div>';
    var nuevos=(D.nuevos_semanal||[]).concat(D.nuevos_catorcenal||[]);
    if(nuevos.length){h+='<div class="callout" style="margin-top:16px;border-left:4px solid '+am+';background:#fffbf0"><b>\u26A0 Puestos nuevos detectados (revisar antes de publicar)</b><div style="margin-top:8px;font-size:12px">';nuevos.forEach(function(n){h+='<div>\xB7 '+n.n+' \u2014 $'+fmt(n.v)+'</div>'});h+='</div></div>'}
    el.innerHTML=h;
  }
  if(id==='sec6'){
    h='<div class="chart-c"><h4>Neto por estado</h4><canvas id="c6" height="350"></canvas></div>';
    h+='<div class="tbl-w" style="margin-top:16px"><table><thead><tr><th>Estado</th><th>Total n\xF3mina</th><th>%</th></tr></thead><tbody>';
    var tv6=D.reduce(function(s,r){return s+r.v},0);
    D.forEach(function(r){h+='<tr><td>'+r.e+'</td><td style="color:'+bl+'"><b>$'+fmt(r.v)+'</b></td><td>'+(tv6>0?(r.v/tv6*100).toFixed(2):'0')+'%</td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td style="color:'+bl+'"><b>$'+fmt(tv6)+'</b></td><td>100%</td></tr></tbody></table></div>';
    el.innerHTML=h;
    new Chart(document.getElementById('c6'),{type:'bar',data:{labels:D.slice(0,15).map(function(r){return r.e}),datasets:[{data:D.slice(0,15).map(function(r){return r.v}),backgroundColor:tl+'44',borderColor:tl,borderWidth:1}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:function(v){return '$'+(v/1e6).toFixed(0)+'M'}}}}}});
  }
  if(id==='sec7'){
    h='<div class="tbl-w"><table><thead><tr><th>Periodo</th><th>ISR</th><th>IMSS</th><th>Infonavit</th><th>FONACOT</th><th>TRABAJADOR</th></tr></thead><tbody>';
    D.periodos.forEach(function(r){h+='<tr><td>'+r.p+'</td><td>$'+fmt(r.isr)+'</td><td>$'+fmt(r.imss)+'</td><td>$'+fmt(r.info)+'</td><td>$'+fmt(r.fon)+'</td><td><b>$'+fmt(r.total)+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td><b>$'+fmt(D.total_isr)+'</b></td><td><b>$'+fmt(D.total_imss)+'</b></td><td><b>$'+fmt(D.total_info)+'</b></td><td><b>$'+fmt(D.total_fon)+'</b></td><td><b>$'+fmt(D.total_trabajador)+'</b></td></tr>';
    h+='</tbody></table></div>';
    h+='<div class="callout" style="margin-top:16px;border-left:4px solid '+am+'"><b>Visor de n\xF3minas SAT</b><div style="margin-top:8px;font-size:12px"><div style="display:flex;gap:24px;flex-wrap:wrap"><div>Total n\xF3mina SAT: <b>$'+fmt(D.total_nomina_sat)+'</b></div><div>N\xF3mina exenta: <b>$'+fmt(D.nomina_exenta_sat)+'</b></div><div>Trabajadores: <b>'+D.num_empleados_sat+'</b></div></div>';
    h+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid #d4e5eb"><div style="display:flex;justify-content:space-between;max-width:400px;padding:3px 0"><span>ISR n\xF3mina</span><span style="font-family:monospace">$'+fmt(D.isr_nomina)+'</span></div><div style="display:flex;justify-content:space-between;max-width:400px;padding:3px 0"><span>ISR SAT</span><span style="font-family:monospace">$'+fmt(D.isr_sat)+'</span></div><div style="display:flex;justify-content:space-between;max-width:400px;padding:3px 0;font-weight:700;color:'+rd+'"><span>Diferencia</span><span>$'+fmt(D.isr_dif)+'</span></div></div></div></div>';
    el.innerHTML=h;
  }
  if(id==='sec8'){
    h='<div class="tbl-w"><table><thead><tr><th>Periodo</th><th>IMSS</th><th>RCV</th><th>Infonavit</th><th>Imp. estatal</th><th>PATR\xD3N</th></tr></thead><tbody>';
    D.periodos.forEach(function(r){h+='<tr><td>'+r.p+'</td><td>$'+fmt(r.imss)+'</td><td>$'+fmt(r.rcv)+'</td><td>$'+fmt(r.info)+'</td><td style="color:'+am+'">$'+fmt(r.isn)+'</td><td><b>$'+fmt(r.total)+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td><b>$'+fmt(D.total_imss)+'</b></td><td><b>$'+fmt(D.total_rcv)+'</b></td><td><b>$'+fmt(D.total_info)+'</b></td><td style="color:'+am+'"><b>$'+fmt(D.isn_total)+'</b></td><td><b>$'+fmt(D.total_patron)+'</b></td></tr></tbody></table></div>';
    el.innerHTML=h;
  }
  if(id==='sec9'){
    h='<div class="tbl-w"><table><thead><tr><th>Registro Patronal</th><th>Estado</th><th>Colaboradores</th><th>Total IMSS</th></tr></thead><tbody>';
    var t9=0,te9=0;D.forEach(function(r){t9+=r.t;te9+=r.emp;h+='<tr><td style="font-family:monospace;font-weight:600">'+r.rp+'</td><td>'+r.e+'</td><td>'+r.emp+'</td><td style="color:'+tl+'"><b>$'+fmt(r.t)+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td>30 registros</td><td><b>'+te9.toLocaleString()+'</b></td><td style="color:'+tl+'"><b>$'+fmt(t9)+'</b></td></tr></tbody></table></div>';
    el.innerHTML=h;
  }
  if(id==='sec10'){
    h='<div class="tbl-w"><table><thead><tr><th>Estado</th><th>Emp.</th><th>Base gravable</th><th>Tasa</th><th>Impuesto</th><th>Mes anterior</th><th>Diferencia</th></tr></thead><tbody>';
    var ti=0,ta2=0;D.forEach(function(r){ti+=r.imp;ta2+=r.ant;h+='<tr><td>'+r.e+'</td><td>'+r.emp+'</td><td>$'+fmt(r.base)+'</td><td>'+r.tasa.toFixed(2)+'%</td><td style="color:'+am+'"><b>$'+fmt(r.imp)+'</b></td><td>$'+fmt(r.ant)+'</td><td style="color:'+(r.dif<0?gn:rd)+'">$'+fmt(r.dif)+'</td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td></td><td></td><td></td><td style="color:'+am+'"><b>$'+fmt(ti)+'</b></td><td><b>$'+fmt(ta2)+'</b></td><td style="color:'+gn+'"><b>$'+fmt(ti-ta2)+'</b></td></tr></tbody></table></div>';
    el.innerHTML=h;
  }
  if(id==='sec11'){
    h='<div class="tbl-w"><table><thead><tr><th style="text-align:left">Concepto</th><th>Importe</th></tr></thead><tbody>';
    h+='<tr><td>Provisi\xF3n global (contabilidad)</td><td><b>$'+fmt(D.provision_global)+'</b></td></tr>';
    h+='<tr><td>N\xF3mina ajustada (- despensa + pensi\xF3n)</td><td><b>$'+fmt(D.nomina_ajustada)+'</b></td></tr>';
    h+='<tr class="tot"><td>Diferencia</td><td style="color:'+rd+'"><b>$'+fmt(D.diferencia)+'</b></td></tr></tbody></table></div>';
    h+='<div class="tbl-w" style="margin-top:16px"><table><thead><tr><th>Periodo / Concepto</th><th>Provisi\xF3n</th><th>N\xF3mina</th><th>Variaci\xF3n</th></tr></thead><tbody>';
    D.periodos.forEach(function(r){var vc=r.var===0?tl:(r.var>0?gn:rd);h+='<tr><td>'+r.p+'</td><td>$'+fmt(r.prov)+'</td><td>$'+fmt(r.nom)+'</td><td style="color:'+vc+'"><b>$'+fmt(r.var)+'</b></td></tr>'});
    h+='</tbody></table></div>';
    if(D.notas&&D.notas.length){h+='<div class="callout" style="margin-top:16px"><b>Notas</b>';D.notas.forEach(function(n){h+='<div style="margin-top:4px;font-size:12px;color:#5f7d8a">\xB7 '+n+'</div>'});h+='</div>'}
    el.innerHTML=h;
  }
  if(id==='sec12'){
    h='<h4 style="font-size:13px;color:'+tl+';margin-bottom:8px">Semanal</h4>';
    h+='<div class="chart-c"><canvas id="c12" height="200"></canvas></div>';
    h+='<div class="tbl-w" style="margin-top:10px"><table><thead><tr><th>Per\xEDodo</th><th>Bajas</th><th>Altas</th><th>Total</th></tr></thead><tbody>';
    D.semanal.forEach(function(r){h+='<tr><td>'+r.p+'</td><td style="color:'+rd+'">'+(r.b?'-'+r.b:'')+'</td><td style="color:'+gn+'">'+(r.a?'+'+r.a:'')+'</td><td><b>'+r.t.toLocaleString()+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td style="color:'+rd+'"><b>-'+D.total_sem_b+'</b></td><td style="color:'+gn+'"><b>+'+D.total_sem_a+'</b></td><td></td></tr></tbody></table></div>';
    h+='<h4 style="font-size:13px;color:'+bl+';margin:20px 0 8px">Catorcenal</h4>';
    h+='<div class="tbl-w"><table><thead><tr><th>Per\xEDodo</th><th>Bajas</th><th>Altas</th><th>Total</th></tr></thead><tbody>';
    D.catorcenal.forEach(function(r){h+='<tr><td>'+r.p+'</td><td style="color:'+rd+'">'+(r.b?'-'+r.b:'')+'</td><td style="color:'+gn+'">'+(r.a?'+'+r.a:'')+'</td><td><b>'+r.t.toLocaleString()+'</b></td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td style="color:'+rd+'"><b>-'+D.total_cat_b+'</b></td><td style="color:'+gn+'"><b>+'+D.total_cat_a+'</b></td><td></td></tr></tbody></table></div>';
    h+='<div class="callout" style="margin-top:14px">Promedio empleados: <b>'+D.promedio_empleados.toLocaleString()+'</b></div>';
    el.innerHTML=h;
    var sd=D.semanal.filter(function(r){return r.b||r.a});
    if(sd.length)new Chart(document.getElementById('c12'),{type:'bar',data:{labels:sd.map(function(r){return r.p}),datasets:[{label:'Bajas',data:sd.map(function(r){return r.b}),backgroundColor:rd+'44',borderColor:rd,borderWidth:1},{label:'Altas',data:sd.map(function(r){return r.a}),backgroundColor:gn+'44',borderColor:gn,borderWidth:1}]},options:{responsive:true,plugins:{legend:{position:'bottom'}}}});
  }
  if(id==='sec13'){
    D.forEach(function(t,i){h+='<div class="act-item"><div class="act-n">'+(i+1)+'</div><div class="act-t">'+t+'</div></div>'});
    el.innerHTML=h;
  }
  if(id==='sec14'){
    var ce=D.com_estado||[];var cet=D.com_estado_total||ce.reduce(function(s,r){return s+r.v},0);
    h='<h4 style="font-size:13px;color:'+tl+';margin-bottom:8px">Comisiones por estado</h4>';
    h+='<div class="chart-c"><canvas id="c14e" height="340"></canvas></div>';
    h+='<div class="tbl-w" style="margin-top:10px"><table><thead><tr><th style="text-align:left">Estado</th><th>Importe</th><th>%</th></tr></thead><tbody>';
    ce.forEach(function(r){h+='<tr><td>'+r.e+'</td><td style="color:'+tl+'"><b>$'+fmt(r.v)+'</b></td><td>'+(r.pct!=null?r.pct.toFixed(2):(cet>0?(r.v/cet*100).toFixed(2):'0'))+'%</td></tr>'});
    h+='<tr class="tot"><td>TOTAL</td><td style="color:'+tl+'"><b>$'+fmt(cet)+'</b></td><td>100%</td></tr></tbody></table></div>';
    h+='<h4 style="font-size:13px;color:'+am+';margin:22px 0 8px">Comisiones por periodo</h4>';
    h+='<div class="chart-c"><canvas id="c14p" height="200"></canvas></div>';
    h+='<h4 style="font-size:13px;color:'+bl+';margin:22px 0 8px">Seguro Social Patronal semanal (IMSS + RCV)</h4>';
    h+='<div class="chart-c"><canvas id="c14sp" height="200"></canvas></div>';
    h+='<h4 style="font-size:13px;color:'+gn+';margin:22px 0 8px">Seguro Social Retenido a empleados semanal</h4>';
    h+='<div class="chart-c"><canvas id="c14so" height="200"></canvas></div>';
    if(D.nota)h+='<div class="callout" style="margin-top:16px"><b>Comentario</b><div style="margin-top:6px;font-size:12px;color:#5f7d8a;line-height:1.6">'+D.nota+'</div></div>';
    el.innerHTML=h;
    var mM=function(v){return '$'+(v/1e6).toFixed(1)+'M'};
    new Chart(document.getElementById('c14e'),{type:'bar',data:{labels:ce.map(function(r){return r.e}),datasets:[{data:ce.map(function(r){return r.v}),backgroundColor:tl+'44',borderColor:tl,borderWidth:1}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:function(v){return mM(v)}}}}}});
    var cp=D.com_periodo||[];if(cp.length)new Chart(document.getElementById('c14p'),{type:'bar',data:{labels:cp.map(function(r){return r.p}),datasets:[{data:cp.map(function(r){return r.v}),backgroundColor:am+'55',borderColor:am,borderWidth:1}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:function(v){return mM(v)}}}}}});
    var sp=D.ss_patronal||[];if(sp.length)new Chart(document.getElementById('c14sp'),{type:'bar',data:{labels:sp.map(function(r){return r.p}),datasets:[{data:sp.map(function(r){return r.v}),backgroundColor:bl+'44',borderColor:bl,borderWidth:1}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:function(v){return mM(v)}}}}}});
    var so=D.ss_obrero||[];if(so.length)new Chart(document.getElementById('c14so'),{type:'bar',data:{labels:so.map(function(r){return r.p}),datasets:[{data:so.map(function(r){return r.v}),backgroundColor:gn+'44',borderColor:gn,borderWidth:1}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:function(v){return '$'+(v/1e3).toFixed(0)+'K'}}}}}});
  }
}
<\/script></body></html>`;
}
__name(pageReporte, "pageReporte");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
