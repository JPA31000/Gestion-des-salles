/* Suivi du matériel informatique — V 2.0
 * Plans des salles, fiche par poste, rapport au service réseau.
 * Les données restent dans le navigateur (localStorage). */
(() => {
  'use strict';

  const CFG = window.CONFIG_SALLES;
  const CATS = CFG.categories;
  const SALLES = Object.keys(CFG.salles);
  const CLE = 'gestionSalles_v4';
  const CLE_V3 = 'itInventoryData_v3';
  const CLE_PREFS = 'gestionSalles_prefs';
  const NS = 'http://www.w3.org/2000/svg';
  const ETATS = { ok: 'Fonctionne', new: 'À signaler', sent: 'Signalé' };
  const LIB_HISTO = { signale: 'Signalé au service réseau', repare: 'Remis en service', controle: 'Salle contrôlée' };

  // Libellés de la V 1.2 devenus plus précis en V 2.0
  const RENOMMAGES = {
    'Pas de connexion': 'Pas de connexion réseau', 'Fige / Se bloque': 'Fige / se bloque',
    'Écran bleu / BSOD': 'Écran bleu (BSOD)', 'Couleurs anormales (Écran)': 'Couleurs anormales',
    'Ne se lance pas (Général)': 'Ne se lance pas', 'Plante / Se ferme (Général)': 'Plante / se ferme',
    'Naviswork': 'Navisworks', 'Epic games': 'Epic Games', 'Autocad': 'AutoCAD', 'Libreoffice': 'LibreOffice',
    'Bimvision': 'BIMvision', 'Manque alim elec': 'Manque alimentation', 'Manque rj45': 'Manque câble RJ45',
    'Manque Connexion ecran': 'Manque câble écran', 'Clavier non détectée': 'Clavier non détecté'
  };

  // ---------- Outils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const maintenant = () => new Date().toISOString();
  const borne = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtJour = iso => new Date(iso).toLocaleDateString('fr-FR');
  const fmtHeure = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const fmtDT = iso => iso ? `${fmtJour(iso)} à ${fmtHeure(iso)}` : '';
  const estMobile = () => window.matchMedia('(max-width: 860px)').matches;
  const nomPc = (id, n) => `${id}P${n}`;

  function fmtRel(iso) {
    if (!iso) return '';
    const d = new Date(iso), j = new Date();
    if (d.toDateString() === j.toDateString()) return `aujourd'hui à ${fmtHeure(iso)}`;
    const hier = new Date(j); hier.setDate(j.getDate() - 1);
    if (d.toDateString() === hier.toDateString()) return `hier à ${fmtHeure(iso)}`;
    const jour = d.toLocaleDateString('fr-FR', d.getFullYear() === j.getFullYear()
      ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
    return `le ${jour}`;
  }

  // ---------- Données ----------
  const pcVide = () => ({ pb: Object.fromEntries(CATS.map(c => [c.id, []])), obs: '', modifie: null, signale: null, historique: [] });
  const salleVide = () => ({ pcs: {}, obs: '', obsModifie: null, obsSignale: null, controle: null, historique: [], plan: null });
  const donneesVides = () => ({ version: 4, savedAt: null, reglages: { nom: '' }, salles: Object.fromEntries(SALLES.map(s => [s, salleVide()])) });

  function normaliser(src) {
    const out = donneesVides();
    if (!src || typeof src !== 'object') return out;
    out.savedAt = src.savedAt || null;
    out.reglages.nom = String(src.reglages?.nom || '');
    for (const [id, s] of Object.entries(src.salles || {})) {
      if (!CFG.salles[id] || !s) continue;
      const R = out.salles[id];
      R.obs = String(s.obs || '');
      R.obsModifie = s.obsModifie || null;
      R.obsSignale = s.obsSignale || null;
      R.controle = s.controle || null;
      R.historique = Array.isArray(s.historique) ? s.historique.slice(-50) : [];
      R.plan = s.plan && s.plan.postes ? s.plan : null;
      for (const [n, p] of Object.entries(s.pcs || {})) {
        const P = pcVide();
        for (const c of CATS) P.pb[c.id] = Array.isArray(p?.pb?.[c.id]) ? p.pb[c.id].map(String) : [];
        P.obs = String(p?.obs || '');
        P.modifie = p?.modifie || null;
        P.signale = p?.signale || null;
        P.historique = Array.isArray(p?.historique) ? p.historique.slice(-30) : [];
        R.pcs[n] = P;
      }
    }
    return out;
  }

  // Reprise des données enregistrées par la V 1.2 (une ligne par poste, un choix par colonne)
  function depuisV3(ancien) {
    const out = donneesVides();
    const val = (v, ok) => (v && v !== ok) ? [RENOMMAGES[v] || v] : [];
    for (const [id, s] of Object.entries(ancien || {})) {
      if (!out.salles[id] || !Array.isArray(s?.items)) continue;
      const R = out.salles[id];
      R.obs = String(s.generalObservation || '');
      if (R.obs.trim()) R.obsModifie = maintenant();
      s.items.forEach((it, i) => {
        const m = /P(\d+)$/.exec(it.pcNumber || '');
        const n = pad2(m ? +m[1] : i + 1);
        const P = pcVide();
        P.pb.pc = val(it.pcStatus, 'Ok');
        P.pb.screen1 = val(it.screen1, 'Ok');
        P.pb.screen2 = val(it.screen2, 'Ok');
        P.pb.software = val(it.software, 'RAS');
        P.pb.peripheral = val(it.peripheral, 'RAS');
        P.obs = String(it.observation || '');
        if (aProbleme(P)) { P.modifie = it.lastModified || maintenant(); R.pcs[n] = P; }
      });
    }
    return out;
  }

  let repriseV3 = false;
  function charger() {
    try {
      const brut = localStorage.getItem(CLE);
      if (brut) return normaliser(JSON.parse(brut));
      const v3 = localStorage.getItem(CLE_V3);
      if (v3) { repriseV3 = true; return depuisV3(JSON.parse(v3)); }
    } catch (e) { console.warn('Lecture des données impossible', e); }
    return donneesVides();
  }

  let donnees = charger();
  let erreurSauvegarde = false;

  function sauver() {
    donnees.savedAt = maintenant();
    try { localStorage.setItem(CLE, JSON.stringify(donnees)); erreurSauvegarde = false; }
    catch (e) { erreurSauvegarde = true; }
    majSauvegarde();
  }

  const salle = id => donnees.salles[id];
  const nom = () => donnees.reglages.nom.trim();

  function poste(id, n, creer) {
    const R = salle(id);
    if (!R.pcs[n] && creer) R.pcs[n] = pcVide();
    return R.pcs[n] || null;
  }
  // Retire un poste revenu à l'état neuf, pour garder des données légères
  function nettoyer(id, n) {
    const p = salle(id).pcs[n];
    if (p && !aProbleme(p) && !p.signale && !p.historique.length) delete salle(id).pcs[n];
  }

  function aProbleme(p) { return !!p && (CATS.some(c => p.pb[c.id].length > 0) || p.obs.trim() !== ''); }
  function etatPoste(p) {
    if (!aProbleme(p)) return 'ok';
    return p.signale && p.modifie && p.signale >= p.modifie ? 'sent' : 'new';
  }
  function etatObsSalle(R) {
    if (!R.obs.trim()) return 'ok';
    return R.obsSignale && R.obsModifie && R.obsSignale >= R.obsModifie ? 'sent' : 'new';
  }
  function numeros(id) {
    const l = Array.from({ length: CFG.salles[id].postes }, (_, i) => pad2(i + 1));
    for (const n of Object.keys(salle(id).pcs).sort()) if (!l.includes(n) && aProbleme(salle(id).pcs[n])) l.push(n);
    return l;
  }
  function bilan(id) {
    const b = { ok: 0, new: 0, sent: 0, total: 0 };
    for (const n of numeros(id)) { b[etatPoste(salle(id).pcs[n])]++; b.total++; }
    b.obs = etatObsSalle(salle(id));
    return b;
  }
  const resume = p => CATS.filter(c => p.pb[c.id].length).map(c => `${c.nom} : ${p.pb[c.id].join(', ')}`);
  function resumeCourt(p) {
    const l = CATS.filter(c => p.pb[c.id].length).map(c => `${c.court} : ${p.pb[c.id].join(', ')}`);
    const o = p.obs.trim();
    if (o) l.push(`« ${o.length > 60 ? o.slice(0, 57) + '…' : o} »`);
    return l;
  }

  // ---------- Plans ----------
  function plan(id) {
    const conf = CFG.salles[id].plan, loc = salle(id).plan;
    if (loc) return { contour: loc.contour || conf?.contour, portes: conf?.portes || [], mobilier: conf?.mobilier || [], postes: loc.postes, local: true };
    if (conf) return { contour: conf.contour, portes: conf.portes || [], mobilier: conf.mobilier || [], postes: conf.postes, local: false };
    return null;
  }
  // Copie locale du plan, créée au premier ajustement
  function rendreLocal(id) {
    const R = salle(id);
    if (R.plan) return R.plan;
    const conf = CFG.salles[id].plan;
    if (conf) {
      R.plan = { postes: JSON.parse(JSON.stringify(conf.postes)) };
    } else {
      const l = numeros(id), postes = {};
      l.forEach((n, i) => { postes[n] = [90 + (i % 3) * 210, 90 + Math.floor(i / 3) * 150, 100, 66]; });
      const h = Math.max(900, 140 + Math.ceil(l.length / 3) * 150);
      R.plan = { contour: [[40, 40], [700, 40], [700, h], [40, h]], postes };
    }
    return R.plan;
  }
  const canon = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
  function boite(contour) {
    const xs = contour.map(p => p[0]), ys = contour.map(p => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function dessinerPlan(svg, lay) {
    svg.innerHTML = '';
    const b = boite(lay.contour), m = 26;
    svg.setAttribute('viewBox', `${b.x0 - m} ${b.y0 - m} ${b.x1 - b.x0 + 2 * m} ${b.y1 - b.y0 + 2 * m}`);
    el('polygon', { class: 'floor', points: lay.contour.map(p => p.join(',')).join(' ') }, svg);
    for (const d of lay.portes) {
      el('line', { class: 'door-gap', x1: d.h[0], y1: d.h[1], x2: d.c[0], y2: d.c[1] }, svg);
      const r = Math.hypot(d.c[0] - d.h[0], d.c[1] - d.h[1]);
      const sens = (d.o[0] - d.h[0]) * (d.c[1] - d.h[1]) - (d.o[1] - d.h[1]) * (d.c[0] - d.h[0]) > 0 ? 1 : 0;
      el('path', { class: 'door-arc', d: `M${d.o[0]},${d.o[1]} A${r},${r} 0 0 ${sens} ${d.c[0]},${d.c[1]}` }, svg);
      el('line', { class: 'door-leaf', x1: d.h[0], y1: d.h[1], x2: d.o[0], y2: d.o[1] }, svg);
    }
    for (const mb of lay.mobilier) el('rect', { class: 'meuble', x: mb.r[0], y: mb.r[1], width: mb.r[2], height: mb.r[3], rx: 4 }, svg);
    const calque = el('g', { class: 'desks' }, svg);
    for (const n of Object.keys(lay.postes).sort()) {
      const g = el('g', { class: 'desk', 'data-n': n, tabindex: '0', role: 'button' }, calque);
      el('title', {}, g);
      el('rect', { class: 'halo', rx: 11 }, g);
      el('rect', { class: 'body', rx: 6 }, g);
      el('text', { class: 'num' }, g).textContent = n;
      el('circle', { class: 'obs', r: 6 }, g);
      positionner(g, lay.postes[n]);
    }
  }
  function positionner(g, [x, y, w, h]) {
    const [halo, corps] = g.querySelectorAll('rect');
    Object.entries({ x: x - 6, y: y - 6, width: w + 12, height: h + 12 }).forEach(([k, v]) => halo.setAttribute(k, v));
    Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => corps.setAttribute(k, v));
    const t = g.querySelector('text');
    t.setAttribute('x', x + w / 2); t.setAttribute('y', y + h / 2);
    t.setAttribute('font-size', borne(Math.min(w, h) * 0.46, 16, 34).toFixed(1));
    const c = g.querySelector('circle');
    c.setAttribute('cx', x + w - 8); c.setAttribute('cy', y + 8);
  }

  // ---------- État de l'interface ----------
  const ui = { salle: SALLES[0], sel: null, vue: 'plan', filtre: 'tous', edition: false };
  try {
    const pr = JSON.parse(localStorage.getItem(CLE_PREFS) || '{}');
    if (SALLES.includes(pr.salle)) ui.salle = pr.salle;
    if (pr.vue === 'liste') ui.vue = 'liste';
  } catch (e) { /* préférences facultatives */ }
  const depuisAncre = decodeURIComponent(location.hash.slice(1));
  if (SALLES.includes(depuisAncre)) ui.salle = depuisAncre;

  function retenirPrefs() {
    try { localStorage.setItem(CLE_PREFS, JSON.stringify({ salle: ui.salle, vue: ui.vue })); } catch (e) { /* facultatif */ }
  }

  // ---------- Affichage ----------
  function majSauvegarde() {
    const e = $('#saveState');
    e.classList.toggle('erreur', erreurSauvegarde);
    e.textContent = erreurSauvegarde ? 'Sauvegarde impossible dans ce navigateur'
      : donnees.savedAt ? `Enregistré ${fmtRel(donnees.savedAt)}` : 'Aucune modification';
    e.title = donnees.savedAt ? `Dernière sauvegarde : ${fmtDT(donnees.savedAt)}` : '';
  }

  function aSignaler(id) {
    const b = bilan(id);
    return b.new + (b.obs === 'new' ? 1 : 0);
  }
  function majBadge() {
    const n = SALLES.reduce((s, id) => s + aSignaler(id), 0);
    const b = $('#badgeRapport');
    b.hidden = !n; b.textContent = n;
    $('#btnRapport').title = n ? `${n} élément${n > 1 ? 's' : ''} à signaler` : 'Préparer un rapport';
  }

  function rendreOnglets() {
    $('#roomTabs').innerHTML = SALLES.map(id => {
      const b = bilan(id);
      const pire = b.new || b.obs === 'new' ? 'new' : (b.sent || b.obs === 'sent') ? 'sent' : 'ok';
      const nb = b.new + b.sent;
      const titre = nb ? `${nb} poste${nb > 1 ? 's' : ''} en panne` : 'Aucun problème relevé';
      return `<button type="button" class="room-tab" role="tab" data-salle="${id}" aria-selected="${id === ui.salle}" title="${titre}">
        <span class="dot ${pire}"></span>${id}${nb ? `<span class="count ${b.new ? 'new' : 'sent'}">${nb}</span>` : ''}</button>`;
    }).join('');
  }

  function rendreEntete() {
    const id = ui.salle, R = salle(id), b = bilan(id), lay = plan(id);
    $('#roomTitle').textContent = `Salle ${id}`;
    const meta = [`${b.total} postes`];
    if (!lay) meta.push('plan non relevé');
    else if (lay.local) meta.push('plan ajusté sur cet ordinateur');
    meta.push(R.controle ? `contrôlée ${fmtRel(R.controle.date)}${R.controle.par ? ' par ' + R.controle.par : ''}` : 'aucun contrôle enregistré');
    $('#roomMeta').textContent = meta.join(' · ');
    $('#roomStats').innerHTML =
      `<span class="stat ok"><b>${b.ok}</b> fonctionnent</span>` +
      (b.new ? `<span class="stat new"><b>${b.new}</b> à signaler</span>` : '') +
      (b.sent ? `<span class="stat sent"><b>${b.sent}</b> en attente</span>` : '');
    const bt = $('#btnAjuster');
    bt.hidden = ui.vue !== 'plan';
    bt.textContent = ui.edition ? 'Terminer l\'ajustement' : 'Ajuster le plan';
  }

  function rendreSalle() {
    document.body.classList.toggle('editing', ui.edition);
    $('#editBar').hidden = !ui.edition;
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === ui.vue)));
    const enPlan = ui.vue === 'plan';
    $('#planWrap').hidden = !enPlan;
    $('#listWrap').hidden = enPlan;
    $('.legend').hidden = !enPlan;
    rendreEntete();
    if (enPlan) rendrePlan(); else rendreListe();
    rendreNonPlaces();
    rendreInspecteur();
  }

  function rendrePlan() {
    const svg = $('#plan'), tuiles = $('#tiles'), lay = plan(ui.salle);
    if (!lay) {
      svg.toggleAttribute('hidden', true); tuiles.hidden = false;
      tuiles.innerHTML = `<p class="note">Le plan de cette salle n'a pas encore été relevé : les postes sont présentés dans l'ordre. « Ajuster le plan » permet de les placer.</p>` +
        numeros(ui.salle).map(n => `<button type="button" class="tile" data-n="${n}">${n}<span class="obs-dot" hidden></span></button>`).join('');
    } else {
      svg.toggleAttribute('hidden', false); tuiles.hidden = true; tuiles.innerHTML = '';
      dessinerPlan(svg, lay);
    }
    majPostes();
  }

  // Couleurs, infobulles et sélection des postes (plan, vignettes, postes non placés)
  function majPostes(racine = document, id = ui.salle, avecSelection = true) {
    $$('.desk, .tile, .chip-pc', racine).forEach(e => {
      const n = e.dataset.n, p = salle(id).pcs[n], st = etatPoste(p);
      e.classList.remove('ok', 'new', 'sent');
      e.classList.add(st);
      e.classList.toggle('selected', avecSelection && n === ui.sel);
      const obs = !!p?.obs.trim();
      const lib = `Poste ${n} — ${ETATS[st]}` + (aProbleme(p) ? ' : ' + resumeCourt(p).join(' ; ') : '');
      e.setAttribute('aria-label', lib);
      if (e.classList.contains('desk')) {
        e.querySelector('circle.obs').style.display = obs ? '' : 'none';
        e.querySelector('title').textContent = lib;
      } else {
        const dot = e.querySelector('.obs-dot');
        if (dot) dot.hidden = !obs;
        e.title = lib;
      }
    });
  }

  function rendreNonPlaces() {
    const box = $('#unplaced'), lay = plan(ui.salle);
    const manquants = lay && ui.vue === 'plan' ? numeros(ui.salle).filter(n => !lay.postes[n]) : [];
    box.hidden = !manquants.length;
    if (!manquants.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<span class="lbl">${ui.edition ? 'Cliquez sur un poste pour le poser sur le plan :' : 'Postes non placés sur le plan :'}</span>` +
      manquants.map(n => `<button type="button" class="chip-pc" data-n="${n}">${n}</button>`).join('');
    majPostes(box);
  }

  function rendreListe() {
    const id = ui.salle, R = salle(id), l = numeros(id);
    const cpt = { tous: l.length, pb: 0, new: 0, sent: 0, ok: 0 };
    l.forEach(n => { const s = etatPoste(R.pcs[n]); cpt[s]++; if (s !== 'ok') cpt.pb++; });
    const filtres = [['tous', 'Tous'], ['pb', 'En panne'], ['new', 'À signaler'], ['sent', 'Signalés'], ['ok', 'Fonctionnent']];
    $('#listFilters').innerHTML = filtres.map(([k, t]) =>
      `<button type="button" data-filtre="${k}" aria-pressed="${ui.filtre === k}">${t} · ${cpt[k]}</button>`).join('');
    const lignes = l.filter(n => {
      const s = etatPoste(R.pcs[n]);
      return ui.filtre === 'tous' || ui.filtre === s || (ui.filtre === 'pb' && s !== 'ok');
    });
    $('#listBody').innerHTML = lignes.length ? lignes.map(n => {
      const p = R.pcs[n], s = etatPoste(p);
      const pbs = p ? CATS.flatMap(c => p.pb[c.id].map(v => `<span class="pb"><b>${esc(c.court)}</b>${esc(v)}</span>`)).join('') : '';
      return `<tr data-n="${n}" tabindex="0" class="${n === ui.sel ? 'selected' : ''}">
        <td class="num">${n}</td><td><span class="pill ${s}">${ETATS[s]}</span></td>
        <td><div class="pb-list">${pbs || '<span class="muted">—</span>'}</div></td>
        <td class="obs">${esc(p?.obs || '')}</td><td class="date">${aProbleme(p) ? esc(fmtRel(p.modifie)) : ''}</td></tr>`;
    }).join('') : `<tr class="empty"><td colspan="5">Aucun poste dans cette catégorie.</td></tr>`;
  }

  // ---------- Panneau latéral ----------
  function rendreInspecteur() {
    const box = $('#inspector');
    box.classList.toggle('sheet', !!ui.sel && !ui.edition && estMobile());
    if (ui.edition) inspecteurEdition(box);
    else if (ui.sel) inspecteurPoste(box);
    else inspecteurSalle(box);
  }

  function sousTitre(id, n) {
    const p = salle(id).pcs[n];
    const l = [nomPc(id, n)];
    if (aProbleme(p)) l.push(`relevé ${fmtRel(p.modifie)}`);
    if (aProbleme(p) && p.signale) l.push(`signalé ${fmtRel(p.signale)}`);
    return esc(l.join(' · '));
  }

  function blocCategorie(c, p) {
    const sel = p.pb[c.id];
    const opts = [...c.options, ...sel.filter(v => !c.options.includes(v))];
    return `<div class="cat" data-cat="${c.id}">
      <div class="cat-head"><h4>${esc(c.nom)}</h4><span class="etat${sel.length ? ' ko' : ''}">${etatCategorie(sel)}</span></div>
      <div class="chips">${opts.map(o => `<button type="button" class="chip${c.options.includes(o) ? '' : ' hors'}" data-val="${esc(o)}" aria-pressed="${sel.includes(o)}">${esc(o)}</button>`).join('')}</div>
    </div>`;
  }
  const etatCategorie = sel => sel.length ? `${sel.length} problème${sel.length > 1 ? 's' : ''}` : 'OK';

  function piedPoste(p) {
    const ok = p && p.signale && aProbleme(p)
      ? `<button type="button" class="btn btn-ok" data-act="repare">✓ Réparé, remettre en service</button>`
      : `<button type="button" class="btn btn-ok" data-act="toutok"${aProbleme(p) ? '' : ' disabled'}>✓ Tout fonctionne</button>`;
    return ok + `<button type="button" class="btn" data-act="suiv">Poste suivant ›</button>`;
  }

  function blocHistorique(h, titre = 'Historique') {
    if (!h || !h.length) return '';
    return `<div class="histo"><h4>${titre}</h4><ol>${h.slice().sort((a, b) => a.t < b.t ? 1 : -1).slice(0, 8).map(e =>
      `<li class="${esc(e.type)}"><div>${esc(e.quoi || LIB_HISTO[e.type] || e.type)}${e.par ? ' — ' + esc(e.par) : ''}</div>
       <div class="d">${fmtDT(e.t)}${e.txt ? ' · ' + esc(e.txt) : ''}</div></li>`).join('')}</ol></div>`;
  }

  function inspecteurPoste(box) {
    const id = ui.salle, n = ui.sel, p = salle(id).pcs[n] || pcVide(), st = etatPoste(salle(id).pcs[n]);
    box.innerHTML = `
      <div class="insp-head">
        <div class="t"><h3>Poste ${n} <span class="pill ${st}" id="inspPill">${ETATS[st]}</span></h3>
          <div class="sub" id="inspSub">${sousTitre(id, n)}</div></div>
        <div class="insp-nav">
          <button type="button" class="btn btn-icon" data-act="prec" aria-label="Poste précédent" title="Poste précédent (←)">‹</button>
          <button type="button" class="btn btn-icon" data-act="suiv" aria-label="Poste suivant" title="Poste suivant (→)">›</button>
          <button type="button" class="btn btn-icon" data-act="fermer" aria-label="Fermer" title="Fermer (Échap)">×</button>
        </div>
      </div>
      <div class="insp-body">
        ${CATS.map(c => blocCategorie(c, p)).join('')}
        <label class="field"><span>Observation</span>
          <textarea id="inspObs" rows="3" placeholder="Précisions utiles au technicien…">${esc(p.obs)}</textarea></label>
        ${blocHistorique(p.historique)}
      </div>
      <div class="insp-foot" id="inspFoot">${piedPoste(salle(id).pcs[n])}</div>`;
  }

  function historiqueSalle(id) {
    const R = salle(id), h = R.historique.map(e => ({ ...e }));
    for (const [n, p] of Object.entries(R.pcs)) {
      for (const e of p.historique) h.push({ ...e, quoi: `Poste ${n} : ${(LIB_HISTO[e.type] || e.type).toLowerCase()}` });
    }
    return h;
  }

  function inspecteurSalle(box) {
    const id = ui.salle, R = salle(id), l = numeros(id).filter(n => aProbleme(R.pcs[n])), os = etatObsSalle(R);
    box.innerHTML = `
      <div class="insp-head"><div class="t"><h3>Salle ${id}</h3>
        <div class="sub">Cliquez sur un poste pour le renseigner.</div></div></div>
      <div class="insp-body">
        <section class="salle-section"><h4>Postes en panne${l.length ? ` · ${l.length}` : ''}</h4>
          ${l.length ? `<ul class="pb-salle">${l.map(n => {
            const p = R.pcs[n], s = etatPoste(p);
            return `<li data-n="${n}" tabindex="0"><span class="n">${n}</span><span class="txt">${esc(resumeCourt(p).join(' · '))}</span><span class="pill ${s}">${ETATS[s]}</span></li>`;
          }).join('')}</ul>` : `<div class="ras">✓ Aucun problème relevé dans cette salle</div>`}
        </section>
        <section class="salle-section"><h4>Observation générale <span id="obsSallePill">${os !== 'ok' ? `<span class="pill ${os}">${ETATS[os]}</span>` : ''}</span></h4>
          <textarea id="obsSalle" class="obs-salle" placeholder="Vidéoprojecteur, réseau, imprimante, chauffage…">${esc(R.obs)}</textarea>
        </section>
        <section class="salle-section"><h4>Contrôle de la salle</h4>
          <button type="button" class="btn btn-ok btn-block" data-act="controle">✓ Salle contrôlée</button>
          <p class="controle-info">${R.controle ? `Dernier contrôle : ${fmtDT(R.controle.date)}${R.controle.par ? ' par ' + esc(R.controle.par) : ''}` : 'Aucun contrôle enregistré.'}</p>
        </section>
        ${blocHistorique(historiqueSalle(id), 'Derniers événements')}
      </div>`;
  }

  function inspecteurEdition(box) {
    const lay = plan(ui.salle), p = ui.sel && lay?.postes[ui.sel];
    box.innerHTML = `
      <div class="insp-head"><div class="t"><h3>Ajuster le plan</h3><div class="sub">Salle ${ui.salle}</div></div></div>
      <div class="insp-body">
        <section class="salle-section"><h4>Poste choisi</h4>
          ${p ? `<p><strong>Poste ${ui.sel}</strong> — ${p[2]} × ${p[3]}</p>` : `<p class="muted">Cliquez sur un poste du plan.</p>`}
        </section>
        <section class="salle-section aide"><h4>Comment faire</h4>
          <ol>
            <li>Glissez un poste pour le déplacer ; les flèches du clavier l'avancent pas à pas (Maj : plus vite).</li>
            <li>« Pivoter » le tourne d'un quart de tour, « Retirer du plan » le range dans les postes non placés.</li>
            <li>Le plan ajusté est gardé <strong>sur cet ordinateur</strong>. Pour que tout le monde le voie : « Copier la configuration », puis remplacer le bloc de la salle dans <code>salles.js</code>.</li>
          </ol>
        </section>
      </div>`;
  }

  function apresChangementPoste() {
    const id = ui.salle, n = ui.sel, p = salle(id).pcs[n], st = etatPoste(p);
    const pill = $('#inspPill');
    if (pill) { pill.className = `pill ${st}`; pill.textContent = ETATS[st]; }
    const sub = $('#inspSub'); if (sub) sub.innerHTML = sousTitre(id, n);
    const foot = $('#inspFoot'); if (foot && !foot.contains(document.activeElement)) foot.innerHTML = piedPoste(p);
    majPostes();
    rendreEntete();
    rendreOnglets();
    majBadge();
    if (ui.vue === 'liste') rendreListe();
  }

  function rendreTout() {
    rendreOnglets();
    rendreSalle();
    majBadge();
    majSauvegarde();
  }

  // ---------- Actions ----------
  function changerSalle(id) {
    if (!SALLES.includes(id) || id === ui.salle) return;
    if (ui.edition) terminerEdition(false);
    ui.salle = id; ui.sel = null; ui.filtre = 'tous';
    retenirPrefs();
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* fichier local */ }
    rendreOnglets();
    rendreSalle();
  }

  function choisir(n) {
    ui.sel = n || null;
    majPostes();
    $$('#listBody tr[data-n]').forEach(tr => tr.classList.toggle('selected', tr.dataset.n === ui.sel));
    rendreInspecteur();
    if (n && !ui.edition && !estMobile()) $('#inspector .insp-body')?.scrollTo(0, 0);
  }

  function voisin(sens) {
    const l = ui.vue === 'liste' ? $$('#listBody tr[data-n]').map(tr => tr.dataset.n) : numeros(ui.salle);
    if (!l.length) return;
    const i = l.indexOf(ui.sel);
    choisir(l[i < 0 ? 0 : (i + sens + l.length) % l.length]);
  }

  function basculer(cat, val, chip) {
    const p = poste(ui.salle, ui.sel, true), arr = p.pb[cat], i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    p.modifie = maintenant();
    chip.setAttribute('aria-pressed', String(i < 0));
    const etat = chip.closest('.cat').querySelector('.etat');
    etat.textContent = etatCategorie(arr);
    etat.classList.toggle('ko', arr.length > 0);
    nettoyer(ui.salle, ui.sel);
    sauver();
    apresChangementPoste();
  }

  function remettreEnService() {
    const id = ui.salle, n = ui.sel, R = salle(id), p = R.pcs[n];
    if (!p) return;
    const avant = JSON.stringify(p);
    if (p.signale && aProbleme(p)) {
      p.historique.push({ t: maintenant(), type: 'repare', txt: resumeCourt(p).join(' · '), par: nom() });
      p.historique = p.historique.slice(-30);
    }
    CATS.forEach(c => { p.pb[c.id] = []; });
    p.obs = ''; p.signale = null; p.modifie = maintenant();
    nettoyer(id, n);
    sauver();
    rendreInspecteur();
    apresChangementPoste();
    toast(`Poste ${n} : tout fonctionne.`, 'Annuler', () => {
      R.pcs[n] = JSON.parse(avant); sauver(); rendreTout();
    });
  }

  function controler() {
    const id = ui.salle, R = salle(id), b = bilan(id), t = maintenant();
    const enPanne = b.new + b.sent;
    R.controle = { date: t, par: nom() };
    R.historique.push({ t, type: 'controle', par: nom(), txt: enPanne ? `${enPanne} poste${enPanne > 1 ? 's' : ''} en panne` : 'tout fonctionne' });
    R.historique = R.historique.slice(-50);
    sauver();
    rendreSalle();
    toast(`Contrôle de la salle ${id} enregistré.`);
  }

  // ---------- Ajustement du plan ----------
  function commencerEdition() {
    if (ui.vue !== 'plan') return;
    ui.edition = true;
    if (!CFG.salles[ui.salle].plan) rendreLocal(ui.salle);
    rendreSalle();
  }
  function terminerEdition(rendre = true) {
    ui.edition = false;
    const R = salle(ui.salle), conf = CFG.salles[ui.salle].plan;
    if (R.plan && conf && canon(R.plan.postes) === canon(conf.postes)) R.plan = null;
    sauver();
    if (rendre) rendreSalle();
  }
  function versSvg(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function deplacer(n, x, y) {
    const lay = plan(ui.salle), r = rendreLocal(ui.salle).postes[n], b = boite(lay.contour);
    r[0] = Math.round(borne(x, b.x0 + 2, b.x1 - 2 - r[2]));
    r[1] = Math.round(borne(y, b.y0 + 2, b.y1 - 2 - r[3]));
    const g = $(`#plan .desk[data-n="${n}"]`);
    if (g) positionner(g, r);
  }
  function tailleType(lay) {
    const l = Object.values(lay.postes).filter(r => r[2] >= r[3]);
    return l.length ? [l[0][2], l[0][3]] : [90, 62];
  }
  function poser(n) {
    const loc = rendreLocal(ui.salle), lay = plan(ui.salle), b = boite(lay.contour), [w, h] = tailleType(lay);
    loc.postes[n] = [Math.round((b.x0 + b.x1 - w) / 2), Math.round((b.y0 + b.y1 - h) / 2), w, h];
    sauver();
    ui.sel = n;
    rendreSalle();
  }
  function actionEdition(a) {
    const id = ui.salle, lay = plan(id);
    if (a === 'terminer') return terminerEdition();
    if (a === 'copier') {
      copier(texteConfig(id)).then(ok => toast(ok ? 'Configuration copiée : collez-la dans salles.js à la place du bloc de la salle.' : 'Copie impossible dans ce navigateur.'));
      return;
    }
    if (a === 'origine') {
      if (!salle(id).plan) return toast('Le plan est déjà celui d\'origine.');
      if (!confirm(`Revenir au plan d'origine de la salle ${id} ? Les déplacements faits sur cet ordinateur seront perdus.`)) return;
      salle(id).plan = null;
      if (!CFG.salles[id].plan) rendreLocal(id);
      sauver(); ui.sel = null; rendreSalle();
      return;
    }
    if (!ui.sel || !lay?.postes[ui.sel]) return toast('Cliquez d\'abord sur un poste du plan.');
    const loc = rendreLocal(id);
    if (a === 'pivoter') {
      const [x, y, w, h] = loc.postes[ui.sel];
      loc.postes[ui.sel] = [x, y, h, w];
      deplacer(ui.sel, x + (w - h) / 2, y + (h - w) / 2);
      sauver(); rendreInspecteur();
    } else if (a === 'retirer') {
      delete loc.postes[ui.sel];
      ui.sel = null;
      sauver(); rendreSalle();
    }
  }
  function texteConfig(id) {
    const lay = plan(id), conf = CFG.salles[id];
    const postes = Object.keys(lay.postes).sort().map(n => `'${n}': [${lay.postes[n].map(Math.round).join(', ')}]`);
    const lignes = [];
    for (let i = 0; i < postes.length; i += 4) lignes.push('          ' + postes.slice(i, i + 4).join(', '));
    const portes = lay.portes.map(p => `{ h: [${p.h.join(', ')}], c: [${p.c.join(', ')}], o: [${p.o.join(', ')}] }`).join(', ');
    const mobilier = lay.mobilier.map(m => `{ r: [${m.r.join(', ')}] }`).join(', ');
    return `    '${id}': {\n      postes: ${conf.postes},\n      plan: {\n` +
      `        contour: [${lay.contour.map(p => `[${p.join(', ')}]`).join(', ')}],\n` +
      `        portes: [${portes}],\n        mobilier: [${mobilier}],\n` +
      `        postes: {\n${lignes.join(',\n')}\n        }\n      }\n    },`;
  }

  // ---------- Rapport ----------
  function collecter() {
    const perimetre = $('input[name="perimetre"]:checked').value, deja = $('#optDeja').checked;
    const garder = s => s === 'new' || (deja && s === 'sent');
    return (perimetre === 'salle' ? [ui.salle] : SALLES).map(id => {
      const R = salle(id);
      const pcs = numeros(id).filter(n => garder(etatPoste(R.pcs[n]))).map(n => ({ n, p: R.pcs[n], s: etatPoste(R.pcs[n]) }));
      const os = etatObsSalle(R);
      return { id, pcs, obs: garder(os) ? R.obs.trim() : '', obsEtat: os };
    }).filter(b => b.pcs.length || b.obs);
  }
  function compter(ids, deja) {
    return ids.reduce((s, id) => {
      const b = bilan(id);
      return s + b.new + (b.obs === 'new' ? 1 : 0) + (deja ? b.sent + (b.obs === 'sent' ? 1 : 0) : 0);
    }, 0);
  }
  function sujetRapport(blocs) {
    const ids = blocs.map(b => b.id);
    return ids.length > 1
      ? `Problèmes informatiques ${CFG.batiment} - Salles ${ids.join(', ')}`
      : `Problème informatique ${CFG.batiment} - Salle ${ids[0] || ui.salle}`;
  }
  function texteRapport(blocs) {
    const t = maintenant(), ids = blocs.map(b => b.id), trait = '----------------------------------------';
    let s = `Bonjour,\n\nVoici le relevé des problèmes informatiques du ${CFG.batiment}, ${ids.length > 1 ? 'salles ' + ids.join(', ') : 'salle ' + ids[0]}.\n`;
    s += `Relevé du ${fmtDT(t)}${nom() ? ' par ' + nom() : ''}.\n`;
    for (const b of blocs) {
      s += `\n${trait}\nSALLE ${b.id}${b.pcs.length ? ` — ${b.pcs.length} poste${b.pcs.length > 1 ? 's' : ''} concerné${b.pcs.length > 1 ? 's' : ''}` : ''}\n${trait}\n`;
      for (const { n, p, s: st } of b.pcs) {
        s += `\nPoste ${nomPc(b.id, n)}${st === 'sent' ? ` — RAPPEL (déjà signalé le ${fmtJour(p.signale)})` : ''}\n`;
        for (const c of CATS) if (p.pb[c.id].length) s += `  • ${c.nom} : ${p.pb[c.id].join(', ')}\n`;
        if (p.obs.trim()) s += `  • Observation : ${p.obs.trim().replace(/\n+/g, ' ')}\n`;
        if (p.modifie) s += `  Constaté le ${fmtDT(p.modifie)}\n`;
      }
      if (b.obs) s += `\nObservation générale pour la salle${b.obsEtat === 'sent' ? ' (rappel)' : ''} :\n  ${b.obs.replace(/\n/g, '\n  ')}\n`;
    }
    s += `\nCordialement,\n${nom() ? nom() + '\n' : ''}${CFG.signature}\n`;
    return s;
  }

  function ouvrirRapport() {
    const nSalle = compter([ui.salle], false), nTous = compter(SALLES, false);
    $('#optSalle').textContent = `Salle ${ui.salle}`;
    $('#optToutes').textContent = `Toutes les salles`;
    $('input[name="perimetre"][value="salle"]').checked = nSalle > 0 || nTous === 0;
    $('input[name="perimetre"][value="toutes"]').checked = !(nSalle > 0 || nTous === 0);
    $('#optDeja').checked = nTous === 0 && compter(SALLES, true) > 0;
    $('#optNom').value = donnees.reglages.nom;
    $('#destinataire').textContent = CFG.destinataire;
    genererRapport();
    $('#dlgRapport').showModal();
  }
  function genererRapport() {
    const deja = $('#optDeja').checked;
    $('#optSalle').textContent = `Salle ${ui.salle} (${compter([ui.salle], deja)})`;
    $('#optToutes').textContent = `Toutes les salles (${compter(SALLES, deja)})`;
    const blocs = collecter(), alerte = $('#rapportAlerte');
    const vide = !blocs.length;
    $('#rapportTexte').value = vide ? '' : texteRapport(blocs);
    $('#rapportTexte').placeholder = 'Rien à signaler pour le moment.';
    alerte.hidden = !vide;
    alerte.textContent = vide ? (compter(SALLES, true)
      ? 'Rien de nouveau à signaler ici. Cochez « Inclure les problèmes déjà signalés » pour envoyer un rappel, ou choisissez « Toutes les salles ».'
      : 'Aucun problème relevé : il n\'y a rien à envoyer.') : '';
    $$('#dlgRapport [data-envoi]').forEach(b => { b.disabled = vide; });
  }

  async function envoyer(mode) {
    const blocs = collecter();
    if (!blocs.length) return;
    const texte = $('#rapportTexte').value, sujet = sujetRapport(blocs), to = CFG.destinataire;
    let msg = '';
    if (mode === 'gmail') {
      const url = corps => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      let lien = url(texte);
      if (lien.length > 7500) {
        const copie = copier(texte);
        lien = url('Le rapport a été copié : collez-le ici (Ctrl+V).\n');
        window.open(lien, '_blank', 'noopener');
        msg = (await copie) ? 'Rapport long : il a été copié, collez-le dans Gmail (Ctrl+V).' : 'Rapport trop long pour Gmail : utilisez « Copier le texte ».';
      } else {
        window.open(lien, '_blank', 'noopener');
        msg = 'Gmail s\'ouvre avec le rapport pré-rempli.';
      }
    } else if (mode === 'mailto') {
      const lien = corps => `mailto:${to}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      if (lien(texte).length > 1900) {
        const ok = await copier(texte);
        location.href = lien('Le rapport a été copié : collez-le ici (Ctrl+V).\n');
        msg = ok ? 'Rapport copié : collez-le dans le message (Ctrl+V).' : 'Rapport trop long : utilisez « Copier le texte ».';
      } else {
        location.href = lien(texte);
        msg = 'La messagerie de l\'ordinateur s\'ouvre avec le rapport.';
      }
    } else if (mode === 'copier') {
      msg = (await copier(texte)) ? `Rapport copié (destinataire : ${to}).` : 'Copie impossible dans ce navigateur.';
    } else if (mode === 'imprimer') {
      $('#dlgRapport').close();
      imprimer(`<h1>${esc(sujet)}</h1><div class="meta">À : ${esc(to)}</div><pre>${esc(texte)}</pre>`);
      msg = 'Rapport envoyé à l\'impression.';
    }
    if ($('#dlgRapport').open) $('#dlgRapport').close();
    if ($('#optMarquer').checked) marquerSignales(blocs, msg);
    else toast(msg);
  }

  function marquerSignales(blocs, msg) {
    const t = maintenant(), avant = {};
    let nb = 0;
    for (const b of blocs) {
      const R = salle(b.id);
      avant[b.id] = JSON.stringify(R);
      for (const { n } of b.pcs) {
        const p = R.pcs[n];
        p.historique.push({ t, type: 'signale', txt: resumeCourt(p).join(' · '), par: nom() });
        p.historique = p.historique.slice(-30);
        p.signale = t;
        nb++;
      }
      if (b.obs) R.obsSignale = t;
    }
    sauver();
    rendreTout();
    toast(`${msg} ${nb ? `${nb} poste${nb > 1 ? 's' : ''} marqué${nb > 1 ? 's' : ''} « signalé ».` : ''}`.trim(), 'Annuler', () => {
      for (const id of Object.keys(avant)) donnees.salles[id] = normaliser({ salles: { [id]: JSON.parse(avant[id]) } }).salles[id];
      sauver(); rendreTout();
    });
  }

  // ---------- Impression, exports, sauvegardes ----------
  function imprimer(html) {
    const f = $('#printSheet');
    f.innerHTML = html;
    window.print();
    setTimeout(() => { f.innerHTML = ''; }, 500);
  }

  function imprimerFiche() {
    const id = ui.salle, R = salle(id), lay = plan(id), b = bilan(id);
    let svg = '';
    if (lay) {
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('class', 'plan-svg');
      s.setAttribute('xmlns', NS);
      dessinerPlan(s, lay);
      majPostes(s, id, false);
      svg = s.outerHTML + `<p class="legend-print">Rouge : à signaler · orange : signalé, en attente · gris : fonctionne · point bleu : observation</p>`;
    }
    const lignes = numeros(id).map(n => {
      const p = R.pcs[n], s = etatPoste(p);
      return `<tr><td><strong>${n}</strong></td><td>${ETATS[s]}</td><td>${p ? esc(resume(p).join(' ; ')) : ''}</td><td>${esc(p?.obs || '')}</td></tr>`;
    }).join('');
    imprimer(`<h1>Salle ${esc(id)} — suivi du matériel informatique</h1>
      <div class="meta">${esc(CFG.batiment)} · imprimé le ${fmtDT(maintenant())} · ${b.total} postes : ${b.ok} fonctionnent, ${b.new} à signaler, ${b.sent} en attente${R.controle ? ` · dernier contrôle le ${fmtDT(R.controle.date)}` : ''}</div>
      ${svg}
      <table><thead><tr><th style="width:12mm">Poste</th><th style="width:26mm">État</th><th>Problèmes</th><th style="width:55mm">Observation</th></tr></thead><tbody>${lignes}</tbody></table>
      ${R.obs.trim() ? `<p><strong>Observation générale :</strong> ${esc(R.obs)}</p>` : ''}`);
  }

  const dateFichier = () => new Date().toISOString().slice(0, 10);
  function telecharger(contenu, nomFichier, type) {
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = nomFichier;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exporterCsv() {
    const l = [['Salle', 'Poste', 'État', ...CATS.map(c => c.nom), 'Observation', 'Constaté le', 'Signalé le']];
    for (const id of SALLES) for (const n of numeros(id)) {
      const p = salle(id).pcs[n], s = etatPoste(p), pb = aProbleme(p);
      l.push([id, nomPc(id, n), ETATS[s], ...CATS.map(c => p ? p.pb[c.id].join(', ') : ''), p?.obs || '',
        pb && p.modifie ? fmtDT(p.modifie) : '', pb && p.signale ? fmtDT(p.signale) : '']);
    }
    const csv = '﻿' + l.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    telecharger(csv, `suivi-salles-${dateFichier()}.csv`, 'text/csv;charset=utf-8');
    toast('Tableau exporté (s\'ouvre dans Excel ou LibreOffice Calc).');
  }

  function sauvegarderFichier() {
    telecharger(JSON.stringify({ application: 'Suivi matériel informatique', ...donnees }, null, 1),
      `suivi-salles-sauvegarde-${dateFichier()}.json`, 'application/json');
    toast('Sauvegarde téléchargée.');
  }

  function restaurer(fichier) {
    const lecteur = new FileReader();
    lecteur.onload = () => {
      let src;
      try { src = JSON.parse(lecteur.result); } catch (e) { return toast('Ce fichier n\'est pas une sauvegarde lisible.'); }
      let lu = null;
      if (src && src.salles) lu = normaliser(src);
      else if (src && Object.values(src).some(v => Array.isArray(v?.items))) lu = depuisV3(src);
      if (!lu) return toast('Ce fichier n\'est pas une sauvegarde de l\'application.');
      if (!confirm(`Remplacer les données de ce navigateur par celles du fichier « ${fichier.name} » ?`)) return;
      if (!lu.reglages.nom) lu.reglages.nom = donnees.reglages.nom;
      donnees = lu;
      ui.sel = null; ui.edition = false;
      sauver(); rendreTout();
      toast('Sauvegarde restaurée.');
    };
    lecteur.readAsText(fichier);
  }

  function effacerTout() {
    if (!confirm('Effacer toutes les données de suivi enregistrées dans ce navigateur ?\n\nConseil : faites d\'abord « Sauvegarder les données ».')) return;
    const avant = JSON.stringify(donnees);
    const n = donnees.reglages.nom;
    donnees = donneesVides();
    donnees.reglages.nom = n;
    ui.sel = null; ui.edition = false;
    sauver(); rendreTout();
    toast('Données effacées.', 'Annuler', () => { donnees = normaliser(JSON.parse(avant)); sauver(); rendreTout(); }, 8000);
  }

  async function copier(txt) {
    try { await navigator.clipboard.writeText(txt); return true; } catch (e) { /* repli ci-dessous */ }
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    (document.querySelector('dialog[open]') || document.body).appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  let minuteur = null;
  function toast(msg, libAction, fnAction, duree = 6000) {
    const t = $('#toast'), b = $('#toastAction');
    $('#toastMsg').textContent = msg;
    b.hidden = !libAction;
    b.textContent = libAction || '';
    b.onclick = () => { t.hidden = true; fnAction && fnAction(); };
    t.hidden = false;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { t.hidden = true; }, duree);
  }

  // ---------- Événements ----------
  $('#roomTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-salle]');
    if (b) changerSalle(b.dataset.salle);
  });
  $('#roomTabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = SALLES.indexOf(ui.salle) + (e.key === 'ArrowRight' ? 1 : -1);
    changerSalle(SALLES[(i + SALLES.length) % SALLES.length]);
    $(`#roomTabs [data-salle="${ui.salle}"]`)?.focus();
    e.preventDefault(); e.stopPropagation();
  });

  $('.seg').addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (!b || b.dataset.view === ui.vue) return;
    if (ui.edition) terminerEdition(false);
    ui.vue = b.dataset.view;
    retenirPrefs();
    rendreSalle();
  });

  $('#btnAjuster').addEventListener('click', () => ui.edition ? terminerEdition() : commencerEdition());
  $('#editBar').addEventListener('click', e => { const b = e.target.closest('[data-edit]'); if (b) actionEdition(b.dataset.edit); });

  // Plan : choix d'un poste, ou glisser en mode ajustement
  const svgPlan = $('#plan');
  let glisse = null;
  $('#planWrap').addEventListener('click', e => {
    if (ui.edition) return;
    const d = e.target.closest('[data-n]');
    if (d) choisir(d.dataset.n === ui.sel && !estMobile() ? null : d.dataset.n);
    else if (e.target.closest('svg') && ui.sel) choisir(null);
  });
  $('#planWrap').addEventListener('keydown', e => {
    const d = e.target.closest('[data-n]');
    if (d && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choisir(d.dataset.n); }
  });
  svgPlan.addEventListener('pointerdown', e => {
    if (!ui.edition) return;
    const g = e.target.closest('.desk');
    if (!g) return;
    e.preventDefault();
    const n = g.dataset.n;
    if (ui.sel !== n) choisir(n);
    const r = rendreLocal(ui.salle).postes[n], pt = versSvg(svgPlan, e);
    glisse = { n, g, dx: pt.x - r[0], dy: pt.y - r[1], bouge: false, id: e.pointerId };
    g.setPointerCapture(e.pointerId);
    g.classList.add('dragging');
  });
  svgPlan.addEventListener('pointermove', e => {
    if (!glisse || e.pointerId !== glisse.id) return;
    const pt = versSvg(svgPlan, e);
    deplacer(glisse.n, pt.x - glisse.dx, pt.y - glisse.dy);
    glisse.bouge = true;
  });
  const finGlisse = () => {
    if (!glisse) return;
    glisse.g.classList.remove('dragging');
    if (glisse.bouge) { sauver(); rendreEntete(); }
    glisse = null;
  };
  svgPlan.addEventListener('pointerup', finGlisse);
  svgPlan.addEventListener('pointercancel', finGlisse);

  $('#unplaced').addEventListener('click', e => {
    const b = e.target.closest('[data-n]');
    if (!b) return;
    if (ui.edition) poser(b.dataset.n); else choisir(b.dataset.n);
  });

  $('#listFilters').addEventListener('click', e => {
    const b = e.target.closest('[data-filtre]');
    if (b) { ui.filtre = b.dataset.filtre; rendreListe(); }
  });
  $('#listBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-n]'); if (tr) choisir(tr.dataset.n); });
  $('#listBody').addEventListener('keydown', e => {
    const tr = e.target.closest('tr[data-n]');
    if (tr && e.key === 'Enter') choisir(tr.dataset.n);
  });

  $('#inspector').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) return basculer(chip.closest('.cat').dataset.cat, chip.dataset.val, chip);
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'prec') voisin(-1);
      else if (act === 'suiv') voisin(1);
      else if (act === 'fermer') choisir(null);
      else if (act === 'toutok' || act === 'repare') remettreEnService();
      else if (act === 'controle') controler();
      return;
    }
    const li = e.target.closest('.pb-salle li');
    if (li) choisir(li.dataset.n);
  });
  $('#inspector').addEventListener('keydown', e => {
    const li = e.target.closest('.pb-salle li');
    if (li && e.key === 'Enter') choisir(li.dataset.n);
  });
  $('#inspector').addEventListener('input', e => {
    if (e.target.id === 'inspObs') {
      const p = poste(ui.salle, ui.sel, true);
      p.obs = e.target.value;
      p.modifie = maintenant();
      nettoyer(ui.salle, ui.sel);
      sauver();
      apresChangementPoste();
    } else if (e.target.id === 'obsSalle') {
      const R = salle(ui.salle);
      R.obs = e.target.value;
      R.obsModifie = maintenant();
      sauver();
      const os = etatObsSalle(R);
      $('#obsSallePill').innerHTML = os !== 'ok' ? `<span class="pill ${os}">${ETATS[os]}</span>` : '';
      rendreOnglets();
      majBadge();
    }
  });

  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      if (!$('#menuList').hidden) return fermerMenu();
      if (ui.sel) { choisir(null); return; }
      if (ui.edition) terminerEdition();
      return;
    }
    if (e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const fleches = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (ui.edition && ui.sel && fleches[e.key]) {
      const r = plan(ui.salle).postes[ui.sel];
      if (!r) return;
      const pas = e.shiftKey ? 20 : 4, [dx, dy] = fleches[e.key];
      deplacer(ui.sel, r[0] + dx * pas, r[1] + dy * pas);
      sauver();
      e.preventDefault();
      return;
    }
    if (!ui.edition && ui.sel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('#roomTabs')) {
      voisin(e.key === 'ArrowLeft' ? -1 : 1);
      e.preventDefault();
    }
  });

  // Menu ⋯
  const fermerMenu = () => { $('#menuList').hidden = true; $('#btnMenu').setAttribute('aria-expanded', 'false'); };
  $('#btnMenu').addEventListener('click', e => {
    e.stopPropagation();
    const ouvert = $('#menuList').hidden;
    $('#menuList').hidden = !ouvert;
    $('#btnMenu').setAttribute('aria-expanded', String(ouvert));
  });
  document.addEventListener('click', e => { if (!e.target.closest('.menu')) fermerMenu(); });
  $('#menuList').addEventListener('click', e => {
    const b = e.target.closest('[data-menu]');
    if (!b) return;
    fermerMenu();
    ({
      fiche: imprimerFiche, csv: exporterCsv, sauver: sauvegarderFichier,
      restaurer: () => $('#fileImport').click(), aide: () => $('#dlgAide').showModal(), effacer: effacerTout
    })[b.dataset.menu]();
  });
  $('#fileImport').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) restaurer(f);
    e.target.value = '';
  });

  // Rapport
  $('#btnRapport').addEventListener('click', ouvrirRapport);
  $$('#dlgRapport input[name="perimetre"], #optDeja').forEach(i => i.addEventListener('change', genererRapport));
  $('#optNom').addEventListener('input', e => {
    donnees.reglages.nom = e.target.value;
    sauver();
    genererRapport();
  });
  $('#dlgRapport').addEventListener('click', e => {
    const b = e.target.closest('[data-envoi]');
    if (b) envoyer(b.dataset.envoi);
  });
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // Autre onglet du navigateur ouvert sur l'application
  window.addEventListener('storage', e => {
    if (e.key !== CLE || !e.newValue) return;
    try { donnees = normaliser(JSON.parse(e.newValue)); } catch (err) { return; }
    if (!document.activeElement?.matches('textarea, input')) rendreTout();
    else { rendreOnglets(); majBadge(); majSauvegarde(); }
  });
  window.addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (SALLES.includes(id)) changerSalle(id);
  });
  let largeurMobile = estMobile();
  window.addEventListener('resize', () => {
    if (estMobile() !== largeurMobile) { largeurMobile = estMobile(); rendreInspecteur(); }
  });

  // ---------- Démarrage ----------
  if (repriseV3) {
    sauver();
    setTimeout(() => toast('Les relevés de la version précédente ont été repris.'), 300);
  }
  rendreTout();
})();
