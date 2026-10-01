/* Suivi du matériel informatique — V 2.8
 * Plans des salles, fiche par poste, rapport au service réseau.
 * Les données restent dans le navigateur (localStorage). */
(() => {
  'use strict';

  const CFG = window.CONFIG_SALLES;
  const CATS = CFG.categories;
  // Chaque thème est découpé en rubriques ; « options » = tous ses libellés, dans l'ordre
  CATS.forEach(c => {
    if (Array.isArray(c.groupes)) c.options = c.groupes.flatMap(g => g.options);
    else c.groupes = [{ nom: '', options: c.options || [] }];
  });
  const SALLES = Object.keys(CFG.salles);
  const CLE = 'gestionSalles_v4';
  const CLE_V3 = 'itInventoryData_v3';
  const CLE_PREFS = 'gestionSalles_prefs';
  const NS = 'http://www.w3.org/2000/svg';
  const ETATS = { ok: 'Fonctionne', new: 'À signaler', sent: 'Signalé' };
  const LIB_HISTO = { signale: 'Signalé au service réseau', repare: 'Remis en service', controle: 'Salle contrôlée' };
  const LIB_ROLES = { equipe: 'Équipe', technicien: 'Service réseau', responsable: 'Responsable' };
  const TYPES_AVIS = { idee: "Idée d'amélioration", anomalie: "Problème dans l'application", question: 'Question', autre: 'Autre' };
  const DELAI_ANNULATION = 7000;   // une réparation n'est envoyée qu'après ce délai : on peut l'annuler d'ici là

  // Libellés de la V 1.2 devenus plus précis en V 2.0
  const RENOMMAGES = {
    'Pas de connexion': 'Pas de connexion réseau', 'Fige / Se bloque': 'Fige / se bloque',
    'Écran bleu / BSOD': 'Écran bleu (BSOD)', 'Couleurs anormales (Écran)': 'Couleurs anormales',
    'Ne se lance pas (Général)': 'Ne se lance pas', 'Plante / Se ferme (Général)': 'Plante / se ferme',
    'Naviswork': 'Navisworks', 'Epic games': 'Epic Games', 'Autocad': 'AutoCAD', 'Libreoffice': 'LibreOffice',
    'Bimvision': 'BIMvision', 'Manque alim elec': 'Manque alimentation', 'Manque rj45': 'Manque câble RJ45',
    'Manque Connexion ecran': 'Manque câble écran', 'Clavier non détectée': 'Clavier non détecté'
  };
  // Libellés de la V 2.0 renommés en V 2.3
  const ALIAS = { 'Câble manquant': 'Câble vidéo manquant' };

  // Range chaque libellé coché dans son thème : un libellé déplacé d'un thème à un autre
  // (ex. « Pas de connexion réseau », passé de l'unité centrale au réseau) suit, s'il n'existe
  // que dans un seul thème ; sinon il reste où il est, dans la rubrique « Autres ».
  function rangerPb(src) {
    const pb = Object.fromEntries(CATS.map(c => [c.id, []]));
    for (const [id, valeurs] of Object.entries(src || {})) {
      if (!Array.isArray(valeurs)) continue;
      const c = CATS.find(x => x.id === id);
      for (let v of valeurs) {
        v = String(v);
        if (ALIAS[v]) v = ALIAS[v];
        let cible = c;
        if (!c || !c.options.includes(v)) {
          const autres = CATS.filter(x => x.options.includes(v));
          if (autres.length === 1) cible = autres[0];
        }
        if (cible && !pb[cible.id].includes(v)) pb[cible.id].push(v);
      }
    }
    return pb;
  }

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
  // « serveur » : repère de la dernière version reçue du registre commun
  // « reseau » : dernier message du service réseau tant que le poste a un problème { txt, par, t }
  const pcVide = () => ({ pb: Object.fromEntries(CATS.map(c => [c.id, []])), obs: '', modifie: null, signale: null, historique: [], serveur: null, reseau: null });
  const reseauValide = r => r && typeof r.txt === 'string' && r.txt.trim()
    ? { txt: r.txt.slice(0, 500), par: String(r.par || '').slice(0, 80), t: r.t ? String(r.t) : null } : null;
  const salleVide = () => ({ pcs: {}, obs: '', obsModifie: null, obsSignale: null, controle: null, historique: [], plan: null, serveur: null });
  const donneesVides = () => ({
    version: 4, savedAt: null, reglages: { nom: '', code: '', appareil: '' },
    salles: Object.fromEntries(SALLES.map(s => [s, salleVide()])),
    file: [], sync: { dernier: null, feuille: '', role: '', repris: false, msgN: 0, msgVu: 0, api: 0 },
    plans: {}   // plans ajustés partagés par le registre : { salle: { postes, contour?, maj, par } }
  });

  function normaliser(src) {
    const out = donneesVides();
    if (!src || typeof src !== 'object') return out;
    out.savedAt = src.savedAt || null;
    out.reglages.nom = String(src.reglages?.nom || '');
    out.reglages.code = String(src.reglages?.code || '');
    out.reglages.appareil = String(src.reglages?.appareil || '');
    out.file = Array.isArray(src.file) ? src.file.filter(e => e && e.id) : [];
    out.plans = plansValides(src.plans);
    // Le lien vers la feuille n'est gardé que pour le responsable
    const role = Object.keys(LIB_ROLES).includes(src.sync?.role) ? src.sync.role : '';
    out.sync = {
      dernier: src.sync?.dernier || null, feuille: role === 'responsable' ? String(src.sync?.feuille || '') : '', role, repris: !!src.sync?.repris,
      msgN: Math.max(0, Number(src.sync?.msgN) || 0), msgVu: Math.max(0, Number(src.sync?.msgVu) || 0), api: Math.max(0, Number(src.sync?.api) || 0)
    };
    for (const [id, s] of Object.entries(src.salles || {})) {
      if (!CFG.salles[id] || !s) continue;
      const R = out.salles[id];
      R.obs = String(s.obs || '');
      R.obsModifie = s.obsModifie || null;
      R.obsSignale = s.obsSignale || null;
      R.controle = s.controle || null;
      R.historique = Array.isArray(s.historique) ? s.historique.slice(-50) : [];
      R.plan = s.plan && s.plan.postes ? s.plan : null;
      R.serveur = s.serveur || null;
      for (const [n, p] of Object.entries(s.pcs || {})) {
        const P = pcVide();
        P.pb = rangerPb(p?.pb);
        P.obs = String(p?.obs || '');
        P.modifie = p?.modifie || null;
        P.signale = p?.signale || null;
        P.historique = Array.isArray(p?.historique) ? p.historique.slice(-30) : [];
        P.serveur = p?.serveur || null;
        P.reseau = reseauValide(p?.reseau);
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
        P.pb = rangerPb(P.pb);
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
  if (!donnees.reglages.appareil) donnees.reglages.appareil = 'A' + Math.random().toString(36).slice(2, 8).toUpperCase();
  let erreurSauvegarde = false;
  // Registre commun : état de la liaison, événements en cours d'envoi, historiques déjà chargés
  const statut = { erreur: null, envoi: false };
  const enVol = new Set();
  const cacheHisto = new Map();

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
    if (p && !aProbleme(p)) p.reseau = null;   // le message du service réseau ne survit pas à la dernière panne
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
  // Avec le registre : tout le monde voit le plan partagé (ajusté par le responsable) ; seul un
  // ajustement en attente d'envoi (R.plan.enAttente) passe devant. Sans registre : plan ajusté
  // gardé sur cet ordinateur, comme avant.
  const planPartage = id => donnees.plans[id] || null;
  function plan(id) {
    const conf = CFG.salles[id].plan, loc = salle(id).plan, part = planPartage(id);
    const avecRegistre = registreConfigure();
    const base = { portes: conf?.portes || [], mobilier: conf?.mobilier || [] };
    if (loc && (!avecRegistre || loc.enAttente)) return { ...base, contour: loc.contour || part?.contour || conf?.contour, postes: loc.postes, local: true, partage: false };
    if (avecRegistre && part && (part.contour || conf?.contour)) return { ...base, contour: part.contour || conf.contour, postes: part.postes, local: false, partage: true, maj: part.maj, par: part.par };
    if (conf) return { ...base, contour: conf.contour, postes: conf.postes, local: false, partage: false };
    return null;
  }
  // Copie modifiable du plan, créée au premier ajustement
  function rendreLocal(id) {
    const R = salle(id);
    if (R.plan && registreConfigure() && !R.plan.enAttente) R.plan = null;   // ancien ajustement local : abandonné
    if (R.plan) return R.plan;
    const conf = CFG.salles[id].plan, part = registreConfigure() ? planPartage(id) : null;
    if (part || conf) {
      R.plan = { postes: JSON.parse(JSON.stringify((part || conf).postes)) };
      if (part?.contour) R.plan.contour = JSON.parse(JSON.stringify(part.contour));
    } else {
      const l = numeros(id), postes = {};
      l.forEach((n, i) => { postes[n] = [90 + (i % 3) * 210, 90 + Math.floor(i / 3) * 150, 100, 66]; });
      const h = Math.max(900, 140 + Math.ceil(l.length / 3) * 150);
      R.plan = { contour: [[40, 40], [700, 40], [700, h], [40, h]], postes };
    }
    if (registreConfigure()) R.plan.enAttente = true;
    return R.plan;
  }
  // Un plan reçu du registre n'est gardé que s'il a la forme attendue
  function plansValides(src) {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    const nombres = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
    for (const [id, p] of Object.entries(src)) {
      if (!CFG.salles[id] || !p || typeof p.postes !== 'object' || !p.postes) continue;
      if (!Object.values(p.postes).every(a => nombres(a, 4))) continue;
      if (p.contour && !(Array.isArray(p.contour) && p.contour.length >= 3 && p.contour.every(c => nombres(c, 2)))) continue;
      out[id] = { postes: p.postes, ...(p.contour ? { contour: p.contour } : {}), maj: String(p.maj || ''), par: String(p.par || '') };
    }
    return out;
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
      el('circle', { class: 'rep', r: 6 }, g);
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
    const [cObs, cRep] = g.querySelectorAll('circle');
    cObs.setAttribute('cx', x + w - 8); cObs.setAttribute('cy', y + 8);
    cRep.setAttribute('cx', x + 8); cRep.setAttribute('cy', y + 8);
  }

  // ---------- État de l'interface ----------
  // reps : réparations en cours de saisie par le service réseau, par poste { 'salle|poste': { coches, message } }
  const ui = { salle: SALLES[0], sel: null, vue: 'plan', filtre: 'tous', edition: false, catOuverte: null, rechPb: '', reps: {} };
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
    if (registreConfigure() && !erreurSauvegarde) {
      const attente = donnees.file.filter(e => e.action !== 'avis' || serveurAJour()).length, pl = attente > 1 ? 's' : '';
      let txt, err = false, alerte = false;
      if (!donnees.reglages.code || statut.erreur === 'code') { txt = 'Code d\'accès à saisir'; err = true; }
      else if (statut.erreur === 'non_configure') { txt = 'Registre pas encore activé'; err = true; }
      else if (statut.erreur) { txt = attente ? `Hors ligne · ${attente} action${pl} en attente` : 'Registre injoignable'; alerte = true; }
      else if (statut.envoi || attente) txt = 'Envoi au registre…';
      else txt = donnees.sync.dernier ? `Registre commun à jour · ${fmtHeure(donnees.sync.dernier)}${donnees.sync.role === 'technicien' ? ' · service réseau' : ''}` : 'Connexion au registre…';
      e.classList.toggle('erreur', err);
      e.classList.toggle('alerte', alerte);
      e.textContent = txt;
      e.title = 'Registre commun : cliquer pour le détail';
      return;
    }
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
    else if (lay.local) meta.push(registreConfigure() ? 'plan ajusté, pas encore partagé' : 'plan ajusté sur cet ordinateur');
    else if (lay.partage && lay.maj) meta.push(`plan ajusté le ${fmtJour(lay.maj)}${lay.par ? ' par ' + lay.par : ''}`);
    meta.push(R.controle ? `contrôlée ${fmtRel(R.controle.date)}${R.controle.par ? ' par ' + R.controle.par : ''}` : 'aucun contrôle enregistré');
    $('#roomMeta').textContent = meta.join(' · ');
    $('#roomStats').innerHTML =
      `<span class="stat ok"><b>${b.ok}</b> fonctionnent</span>` +
      (b.new ? `<span class="stat new"><b>${b.new}</b> à signaler</span>` : '') +
      (b.sent ? `<span class="stat sent"><b>${b.sent}</b> en attente</span>` : '');
    const bt = $('#btnAjuster');
    bt.hidden = ui.vue !== 'plan' || !peutAjuster();
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
        numeros(ui.salle).map(n => `<button type="button" class="tile" data-n="${n}">${n}<span class="obs-dot" hidden></span><span class="rep-dot" hidden></span></button>`).join('');
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
      const obs = !!p?.obs.trim(), msgReseau = !!(p?.reseau && aProbleme(p));
      const lib = `Poste ${n} — ${ETATS[st]}` + (aProbleme(p) ? ' : ' + resumeCourt(p).join(' ; ') : '') + (msgReseau ? ' · message du service réseau' : '');
      e.setAttribute('aria-label', lib);
      if (e.classList.contains('desk')) {
        e.querySelector('circle.obs').style.display = obs ? '' : 'none';
        e.querySelector('circle.rep').style.display = msgReseau ? '' : 'none';
        e.querySelector('title').textContent = lib;
      } else {
        const dot = e.querySelector('.obs-dot'), dotRep = e.querySelector('.rep-dot');
        if (dot) dot.hidden = !obs;
        if (dotRep) dotRep.hidden = !msgReseau;
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
        <td class="obs">${esc(p?.obs || '')}${p?.reseau && aProbleme(p) ? `<div class="rm-ligne"><span class="role-tag">Réseau</span> ${esc(p.reseau.txt)}</div>` : ''}</td><td class="date">${aProbleme(p) ? esc(fmtRel(p.modifie)) : ''}</td></tr>`;
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

  // Icônes des thèmes (traits, couleur du texte)
  const svgIco = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONES = {
    uc: svgIco('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10 6.5h4M10 9.5h4"/><circle cx="12" cy="16.5" r="1.3"/>'),
    ecran: svgIco('<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M12 16.5V20M8 20h8"/>'),
    periph: svgIco('<rect x="2" y="10" width="13" height="8" rx="1.5"/><path d="M5 13h1M8 13h1M11 13h1M6 15.5h5"/><rect x="17" y="7" width="5" height="9" rx="2.5"/><path d="M19.5 7v3"/>'),
    logiciel: svgIco('<rect x="2.5" y="3.5" width="19" height="17" rx="2"/><path d="M2.5 8h19"/><path d="M9 12.5l-2.5 2.5L9 17.5M15 12.5l2.5 2.5-2.5 2.5"/>'),
    reseau: svgIco('<rect x="9" y="2.5" width="6" height="5" rx="1"/><rect x="2.5" y="16.5" width="6" height="5" rx="1"/><rect x="15.5" y="16.5" width="6" height="5" rx="1"/><path d="M12 7.5v4.5M5.5 16.5V12h13v4.5"/>'),
    prise: svgIco('<path d="M9 2.5v5M15 2.5v5"/><path d="M6.5 7.5h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5v5"/>')
  };
  const CHEVRON = svgIco('<path d="M6 9l6 6 6-6"/>');
  const sansAccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Un thème = un menu dépliant : en-tête (icône, nom, ce qui est coché, nombre), puis ses rubriques
  function htmlCategories(p) {
    const f = sansAccent((ui.rechPb || '').trim());
    const html = CATS.map(c => {
      const sel = p.pb[c.id];
      const groupes = c.groupes.slice();
      const autres = sel.filter(v => !c.options.includes(v));
      if (autres.length) groupes.push({ nom: 'Autres', options: autres });
      // Recherche : le thème entier si son nom commence par le mot (« écran »), sauf si une rubrique
      // le porte (« clavier » → rubrique Clavier) ; sinon la rubrique ou les libellés qui le contiennent
      const groupeTrouve = f && groupes.some(g => sansAccent(g.nom).includes(f));
      const themeEntier = f && !groupeTrouve && sansAccent(c.nom).startsWith(f);
      let visibles = themeEntier ? groupes : groupes
        .map(g => ({ nom: g.nom, options: !f || sansAccent(g.nom).includes(f) ? g.options : g.options.filter(o => sansAccent(o).includes(f)) }))
        .filter(g => g.options.length);
      if (f && !visibles.length && sansAccent(c.nom).includes(f)) visibles = groupes;
      if (f && !visibles.length) return '';
      const ouverte = f ? true : ui.catOuverte === c.id;
      const ko = sel.length > 0;
      return `<section class="cat${ko ? ' ko' : ''}${ouverte ? ' ouverte' : ''}" data-cat="${c.id}">
        <button type="button" class="cat-btn" data-ouvrir="${c.id}" aria-expanded="${ouverte}">
          <span class="cat-ico">${ICONES[c.icone] || ICONES.uc}</span>
          <span class="cat-t"><span class="cat-nom">${esc(c.nom)}</span>
            <span class="cat-res">${ko ? esc(sel.join(' · ')) : 'Aucun problème'}</span></span>
          <span class="cat-nb">${ko ? sel.length : 'OK'}</span>
          <span class="chev">${CHEVRON}</span>
        </button>
        ${ouverte ? `<div class="cat-corps">${visibles.map(g => `
          <div class="sous">${g.nom ? `<h5>${esc(g.nom)}</h5>` : ''}
            <div class="chips">${g.options.map(o => `<button type="button" class="chip${c.options.includes(o) ? '' : ' hors'}" data-val="${esc(o)}" aria-pressed="${sel.includes(o)}">${esc(o)}</button>`).join('')}</div>
          </div>`).join('')}</div>` : ''}
      </section>`;
    }).join('');
    return html || `<p class="rech-vide">Aucun libellé ne correspond à « ${esc(ui.rechPb)} ». Décrivez le problème dans l'observation ci-dessous.</p>`;
  }

  function rendreCategories(focus) {
    const box = $('#cats');
    if (!box) return;
    box.innerHTML = htmlCategories(salle(ui.salle).pcs[ui.sel] || pcVide());
    if (focus) {
      const sel = focus.val !== undefined
        ? $$(`.cat[data-cat="${focus.cat}"] .chip`, box).find(b => b.dataset.val === focus.val)
        : $(`.cat[data-cat="${focus.cat}"] .cat-btn`, box);
      sel?.focus({ preventScroll: true });
    }
  }

  // ---------- Service réseau : réparations panne par panne et message ----------
  // Le service réseau (code technicien) et le responsable peuvent enregistrer une réparation ;
  // les collègues voient le résultat : pannes restantes, message, historique.
  function peutReparer() {
    return registreConfigure() && statut.erreur !== 'code' && serveurAJour() && (donnees.sync.role === 'technicien' || donnees.sync.role === 'responsable');
  }
  const libRole = r => LIB_ROLES[r] || '';

  // Pannes en cours d'un poste, une par libellé coché (plus l'observation libre, si elle existe)
  function pannesDuPoste(p) {
    const l = [];
    if (!p) return l;
    CATS.forEach(c => p.pb[c.id].forEach(label => l.push({ cat: c.id, theme: c.nom, court: c.court, label })));
    if (p.obs.trim()) l.push({ cat: 'obs', theme: 'Observation', court: 'Obs.', label: p.obs.trim() });
    return l;
  }
  // « Réparé · É1 : HS · Pér : Clavier HS » : l'abréviation du thème évite de confondre deux « HS »
  const detailReparations = items => 'Réparé · ' + items.map(it => `${it.court} : ${it.label}`).join(' · ');
  const cleItem = it => `${it.cat}|${it.label}`;
  function brouillonRep() {
    const cle = `${ui.salle}|${ui.sel}`;
    if (!ui.reps[cle]) ui.reps[cle] = { coches: [], message: '' };
    return ui.reps[cle];
  }

  // Message laissé par le service réseau : visible de tous, tant que le poste a un problème
  function htmlMessageReseau(p) {
    if (!p || !p.reseau || !aProbleme(p)) return '';
    return `<div class="reseau-msg"><div class="rm-t"><span class="role-tag">Service réseau</span>${p.reseau.par ? ' ' + esc(p.reseau.par) : ''}${p.reseau.t ? ' · ' + esc(fmtRel(p.reseau.t)) : ''}</div>
      <p>${esc(p.reseau.txt)}</p></div>`;
  }

  function htmlReparations(p) {
    const pannes = pannesDuPoste(p), br = brouillonRep();
    const liste = pannes.length
      ? `<ul class="rep-liste">${pannes.map(it => `<li><label class="rep-item">
          <input type="checkbox" data-rep="${esc(cleItem(it))}"${br.coches.includes(cleItem(it)) ? ' checked' : ''}>
          <span class="rep-lib">${esc(it.label)}</span><span class="rep-th">${esc(it.theme)}</span></label></li>`).join('')}</ul>
        <button type="button" class="lien" data-act="rep-tout">Tout cocher</button>`
      : `<p class="rep-vide">Aucune panne signalée sur ce poste. Vous pouvez tout de même laisser un message (il restera dans l'historique).</p>`;
    return `<h4>Service réseau · réparations</h4>
      <p class="rep-info">${p && p.signale && aProbleme(p) ? `Signalé au service réseau ${esc(fmtRel(p.signale))}. ` : ''}Cochez ce qui est réparé.</p>
      ${liste}
      <label class="field"><span>Message (visible par tous)</span>
        <textarea id="repMsg" rows="2" maxlength="500" placeholder="ex. souris remplacée, clavier commandé…">${esc(br.message)}</textarea></label>
      <button type="button" class="btn btn-ok btn-block" id="repBtn" data-act="rep-valider" disabled>✓ Enregistrer</button>`;
  }
  // Texte et état du bouton d'enregistrement selon ce qui est coché et écrit
  function majBoutonRep() {
    const b = $('#repBtn');
    if (!b) return;
    const nb = $$('#repZone [data-rep]:checked').length, msg = !!($('#repMsg')?.value || '').trim(), pl = nb > 1 ? 's' : '';
    b.disabled = !nb && !msg;
    b.textContent = nb && msg ? `✓ Enregistrer ${nb} réparation${pl} et le message` : nb ? `✓ Enregistrer ${nb} réparation${pl}` : msg ? 'Envoyer le message' : '✓ Enregistrer';
  }
  function rendreRep() {
    const z = $('#repZone');
    if (!z) return;
    if (!z.contains(document.activeElement)) z.innerHTML = htmlReparations(salle(ui.salle).pcs[ui.sel] || pcVide());
    majBoutonRep();
  }

  function enregistrerReparations() {
    if (!peutReparer() || !ui.sel) return;
    const id = ui.salle, n = ui.sel, cle = `${id}|${n}`, R = salle(id), br = ui.reps[cle] || { coches: [], message: '' };
    const msg = (br.message || '').trim();
    const items = pannesDuPoste(R.pcs[n]).filter(it => br.coches.includes(cleItem(it)));
    if (!items.length && !msg) return;
    const existait = !!R.pcs[n], avant = JSON.stringify(R.pcs[n] || pcVide());
    const p = poste(id, n, true), t = maintenant(), signaleLe = p.signale;
    items.forEach(it => { if (it.cat === 'obs') p.obs = ''; else p.pb[it.cat] = p.pb[it.cat].filter(v => v !== it.label); });
    if (items.length && !aProbleme(p)) { p.signale = null; p.modifie = t; }   // tout est réparé : le poste fonctionne
    if (msg) p.reseau = { txt: msg, par: nom(), t };
    if (!aProbleme(p)) p.reseau = null;
    nettoyer(id, n);
    delete ui.reps[cle];
    const detail = [items.length ? detailReparations(items) : '', msg ? `« ${msg} »` : ''].filter(Boolean).join(' — ');
    const ev = noter(items.length ? 'reparation' : 'note', id, n, detail, t, items.length
      ? { reparees: items.map(({ cat, theme, label }) => ({ cat, theme, label })), message: msg, signaleLe, apres: Date.now() + DELAI_ANNULATION }
      : { message: msg });
    sauver();
    rendreInspecteur();
    apresChangementPoste();
    const nb = items.length, pl = nb > 1 ? 's' : '';
    if (!nb) return toast(`Message enregistré pour le poste ${n}.`);
    toast(`${nb} réparation${pl} enregistrée${pl} pour le poste ${n}.`, 'Annuler', () => {
      if (existait) R.pcs[n] = JSON.parse(avant); else delete R.pcs[n];
      defaireEvenement(ev, id, n, 'Réparation annulée');
      sauver(); rendreTout();
    }, DELAI_ANNULATION - 500);
  }

  function piedPoste(p) {
    const ok = peutReparer()
      ? `<button type="button" class="btn btn-ok" data-act="repare"${aProbleme(p) ? '' : ' disabled'}>✓ Tout est réparé</button>`
      : p && p.signale && aProbleme(p)
        ? `<button type="button" class="btn btn-ok" data-act="repare">✓ Réparé, remettre en service</button>`
        : `<button type="button" class="btn btn-ok" data-act="toutok"${aProbleme(p) ? '' : ' disabled'}>✓ Tout fonctionne</button>`;
    return ok + `<button type="button" class="btn" data-act="suiv">Poste suivant ›</button>`;
  }

  function blocHistorique(h, titre = 'Historique', max = 8) {
    if (!h || !h.length) return '';
    return `<div class="histo"><h4>${titre}</h4><ol>${h.slice().sort((a, b) => a.t < b.t ? 1 : -1).slice(0, max).map(e =>
      `<li class="${esc(e.type)}"><div>${esc(e.quoi || LIB_HISTO[e.type] || e.type)}${e.par ? ' — ' + esc(e.par) : ''}${e.role === 'technicien' ? ' <span class="role-tag">Service réseau</span>' : ''}</div>
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
        ${htmlMessageReseau(salle(id).pcs[n])}
        ${peutReparer() ? `<section class="rep" id="repZone">${htmlReparations(salle(id).pcs[n])}</section>` : ''}
        <label class="rech">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
          <input type="search" id="rechPb" value="${esc(ui.rechPb)}" placeholder="Chercher (souris, réseau, licence…)" aria-label="Chercher un problème" autocomplete="off">
        </label>
        <div id="cats" class="cats">${htmlCategories(p)}</div>
        <label class="field"><span>Observation</span>
          <textarea id="inspObs" rows="3" placeholder="Précisions utiles au technicien…">${esc(p.obs)}</textarea></label>
        ${registreConfigure() ? `<div id="histoDistant" data-cle="${id}|${n}"></div>` : blocHistorique(p.historique)}
      </div>
      <div class="insp-foot" id="inspFoot">${piedPoste(salle(id).pcs[n])}</div>`;
    if (registreConfigure()) chargerHistorique(id, n);
    majBoutonRep();
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
        ${registreConfigure() ? `<div id="histoDistant" data-cle="${id}|"></div>` : blocHistorique(historiqueSalle(id), 'Derniers événements')}
      </div>`;
    if (registreConfigure()) chargerHistorique(id, '');
  }

  // Avec le registre, le responsable et le service réseau réagencent les plans (un poste déplacé par erreur le serait
  // pour tous, les collègues ne le peuvent pas). Le service réseau suppose un script Google de niveau 4.
  const peutAjuster = () => !registreConfigure() || donnees.sync.role === 'responsable'
    || (donnees.sync.role === 'technicien' && donnees.sync.api >= 4);

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
            ${registreConfigure()
              ? `<li>Quand vous cliquez sur « Terminer », le plan est <strong>enregistré dans le registre</strong> : tous vos collègues le voient aussitôt. Seuls le responsable et le service réseau peuvent le modifier. « Annuler » abandonne ce que vous avez changé.</li>`
              : `<li>Le plan ajusté est gardé <strong>sur cet ordinateur</strong>. Pour que tout le monde le voie : « Copier la configuration », puis remplacer le bloc de la salle dans <code>salles.js</code>.</li>`}
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
    rendreRep();
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

  function basculer(cat, val) {
    const p = poste(ui.salle, ui.sel, true), arr = p.pb[cat], i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    p.modifie = maintenant();
    rendreCategories({ cat, val });
    nettoyer(ui.salle, ui.sel);
    noter('modif', ui.salle, ui.sel);
    sauver();
    apresChangementPoste();
  }

  function remettreEnService() {
    const id = ui.salle, n = ui.sel, R = salle(id), p = R.pcs[n];
    if (!p) return;
    const avant = JSON.stringify(p);
    const repare = !!(p.signale && aProbleme(p)), detail = resumeCourt(p).join(' · ');
    // Pour le service réseau, c'est la réparation de toutes les pannes signalées (une ligne par panne dans « Réparations »)
    const parReseau = peutReparer() && aProbleme(p), pannes = pannesDuPoste(p), signaleLe = p.signale, t = maintenant();
    if (repare) {
      p.historique.push({ t, type: 'repare', txt: detail, par: nom() });
      p.historique = p.historique.slice(-30);
    }
    CATS.forEach(c => { p.pb[c.id] = []; });
    p.obs = ''; p.signale = null; p.modifie = t; p.reseau = null;
    nettoyer(id, n);
    delete ui.reps[`${id}|${n}`];
    const ev = parReseau
      ? noter('reparation', id, n, detailReparations(pannes), t,
        { reparees: pannes.map(({ cat, theme, label }) => ({ cat, theme, label })), message: '', signaleLe, apres: Date.now() + DELAI_ANNULATION })
      : noter(repare ? 'repare' : 'modif', id, n, repare ? detail : `Tout fonctionne (était : ${detail})`, t);
    sauver();
    rendreInspecteur();
    apresChangementPoste();
    toast(`Poste ${n} : tout fonctionne.`, 'Annuler', () => {
      R.pcs[n] = JSON.parse(avant);
      defaireEvenement(ev, id, n);
      sauver(); rendreTout();
    }, parReseau ? DELAI_ANNULATION - 500 : 6000);
  }

  function controler() {
    const id = ui.salle, R = salle(id), b = bilan(id), t = maintenant();
    const enPanne = b.new + b.sent;
    const txt = enPanne ? `${enPanne} poste${enPanne > 1 ? 's' : ''} en panne` : 'tout fonctionne';
    R.controle = { date: t, par: nom() };
    R.historique.push({ t, type: 'controle', par: nom(), txt });
    R.historique = R.historique.slice(-50);
    noter('controle', id, 'SALLE', txt);
    sauver();
    rendreSalle();
    toast(`Contrôle de la salle ${id} enregistré.`);
  }

  // ---------- Ajustement du plan ----------
  function commencerEdition() {
    if (ui.vue !== 'plan') return;
    ui.edition = true;
    ui.avantEdition = { id: ui.salle, plan: JSON.stringify(salle(ui.salle).plan) };   // pour « Annuler »
    if (!CFG.salles[ui.salle].plan) rendreLocal(ui.salle);
    rendreSalle();
  }
  // Abandonne les déplacements faits depuis l'ouverture (rien n'est envoyé) ; demande confirmation s'il y en a
  function annulerEdition() {
    const av = ui.avantEdition, id = ui.salle;
    if (!ui.edition || !av || av.id !== id) return terminerEdition();
    if (JSON.stringify(salle(id).plan) !== av.plan && !confirm(`Abandonner les modifications du plan de la salle ${id} ?`)) return;
    salle(id).plan = JSON.parse(av.plan);
    ui.edition = false; ui.sel = null; ui.avantEdition = null;
    sauver();
    rendreSalle();
    toast('Modifications du plan abandonnées.');
  }
  function terminerEdition(rendre = true) {
    const id = ui.salle;
    ui.edition = false;
    ui.avantEdition = null;
    const R = salle(id), conf = CFG.salles[id].plan;
    if (registreConfigure()) {
      if (R.plan) {
        const base = planPartage(id) || conf;
        if (base && canon(R.plan.postes) === canon(base.postes)) R.plan = null;   // rien n'a bougé
        else { R.plan.enAttente = true; delete R.plan.refuse; }
      }
      sauver();
      if (rendre) rendreSalle();
      if (R.plan) pousserPlan(id);
      return;
    }
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
    if (a === 'annuler') return annulerEdition();
    if (a === 'copier') {
      copier(texteConfig(id)).then(ok => toast(ok
        ? (registreConfigure() ? 'Configuration copiée (simple copie de secours : le plan est déjà partagé par le registre).' : 'Configuration copiée : collez-la dans salles.js à la place du bloc de la salle.')
        : 'Copie impossible dans ce navigateur.'));
      return;
    }
    if (a === 'origine' && registreConfigure()) {
      const part = planPartage(id);
      if (!salle(id).plan && !part) return toast('Le plan est déjà celui d\'origine.');
      if (!confirm(`Revenir au plan d'origine de la salle ${id} ? Le plan ajusté sera remplacé pour tous vos collègues.`)) return;
      delete donnees.plans[id];
      salle(id).plan = null;
      if (!CFG.salles[id].plan) rendreLocal(id);
      sauver(); ui.sel = null; rendreSalle();
      if (part) pousserPlan(id, true);
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
    const lien = lienApplication(blocs);
    if (lien) s += `\nUne fois les réparations faites, vous pouvez les enregistrer panne par panne (avec un message) dans l'application :\n${lien}\n`;
    s += `\nCordialement,\n${nom() ? nom() + '\n' : ''}${CFG.signature}\n`;
    return s;
  }
  // Lien vers l'application dans le rapport, pour que le service réseau y enregistre ses réparations
  function lienApplication(blocs) {
    if (!registreConfigure() || location.protocol === 'file:') return '';
    const base = location.origin + location.pathname.replace(/index\.html$/, '');
    return base + (blocs.length === 1 ? '#' + blocs[0].id : '');
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
    let msg = '', reussi = true;
    if (mode === 'gmail') {
      const url = corps => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      let lien = url(texte);
      if (lien.length > 7500) {
        const copie = copier(texte);
        lien = url('Le rapport a été copié : collez-le ici (Ctrl+V).\n');
        window.open(lien, '_blank', 'noopener');
        reussi = await copie;
        msg = reussi ? 'Rapport long : il a été copié, collez-le dans Gmail (Ctrl+V).' : 'Rapport trop long pour Gmail : utilisez « Copier le texte ».';
      } else {
        window.open(lien, '_blank', 'noopener');
        msg = 'Gmail s\'ouvre avec le rapport pré-rempli.';
      }
    } else if (mode === 'mailto') {
      const lien = corps => `mailto:${to}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      if (lien(texte).length > 1900) {
        reussi = await copier(texte);
        if (reussi) location.href = lien('Le rapport a été copié : collez-le ici (Ctrl+V).\n');
        msg = reussi ?'Rapport copié : collez-le dans le message (Ctrl+V).' : 'Rapport trop long : utilisez « Copier le texte ».';
      } else {
        location.href = lien(texte);
        msg = 'La messagerie de l\'ordinateur s\'ouvre avec le rapport.';
      }
    } else if (mode === 'copier') {
      reussi = await copier(texte);
      msg = reussi ? `Rapport copié (destinataire : ${to}).` : 'Copie impossible dans ce navigateur : sélectionnez le texte et faites Ctrl+C.';
    } else if (mode === 'imprimer') {
      $('#dlgRapport').close();
      imprimer(`<h1>${esc(sujet)}</h1><div class="meta">À : ${esc(to)}</div><pre>${esc(texte)}</pre>`);
      msg = 'Rapport envoyé à l\'impression.';
    }
    if (!reussi) {   // rien n'est parti : les postes ne sont pas marqués, la fenêtre reste ouverte
      if (!$('#dlgRapport').open) return toast(msg);
      $('#rapportAlerte').textContent = msg;
      $('#rapportAlerte').hidden = false;
      return;
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
        noter('signale', b.id, n, resumeCourt(p).join(' · '), t);
        nb++;
      }
      if (b.obs) {
        R.obsSignale = t;
        noter('signale', b.id, 'SALLE', `Observation de salle : ${b.obs}`, t);
      }
    }
    sauver();
    rendreTout();
    toast(`${msg} ${nb ? `${nb} poste${nb > 1 ? 's' : ''} marqué${nb > 1 ? 's' : ''} « signalé ».` : ''}`.trim(), 'Annuler', () => {
      for (const b of blocs) {
        donnees.salles[b.id] = normaliser({ salles: { [b.id]: JSON.parse(avant[b.id]) } }).salles[b.id];
        b.pcs.forEach(({ n }) => noter('annulation', b.id, n, 'Signalement annulé'));
        if (b.obs) noter('annulation', b.id, 'SALLE', 'Signalement annulé');
      }
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
      svg = s.outerHTML + `<p class="legend-print">Rouge : à signaler · orange : signalé, en attente · gris : fonctionne · point bleu : observation · point vert : message du service réseau</p>`;
    }
    const lignes = numeros(id).map(n => {
      const p = R.pcs[n], s = etatPoste(p);
      const rm = p?.reseau && aProbleme(p) ? `<br><em>Service réseau : ${esc(p.reseau.txt)}</em>` : '';
      return `<tr><td><strong>${n}</strong></td><td>${ETATS[s]}</td><td>${p ? esc(resume(p).join(' ; ')) : ''}</td><td>${esc(p?.obs || '')}${rm}</td></tr>`;
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
    const l = [['Salle', 'Poste', 'État', ...CATS.map(c => c.nom), 'Observation', 'Message du service réseau', 'Constaté le', 'Signalé le']];
    for (const id of SALLES) for (const n of numeros(id)) {
      const p = salle(id).pcs[n], s = etatPoste(p), pb = aProbleme(p);
      l.push([id, nomPc(id, n), ETATS[s], ...CATS.map(c => p ? p.pb[c.id].join(', ') : ''), p?.obs || '', pb && p.reseau ? p.reseau.txt : '',
        pb && p.modifie ? fmtDT(p.modifie) : '', pb && p.signale ? fmtDT(p.signale) : '']);
    }
    const csv = '﻿' + l.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    telecharger(csv, `suivi-salles-${dateFichier()}.csv`, 'text/csv;charset=utf-8');
    toast('Tableau exporté (s\'ouvre dans Excel ou LibreOffice Calc).');
  }

  function sauvegarderFichier() {
    // Le code d'accès ne part pas dans le fichier : il pourrait circuler
    telecharger(JSON.stringify({ application: 'Suivi matériel informatique', ...donnees, reglages: { ...donnees.reglages, code: '' } }, null, 1),
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
      lu.reglages = { ...donnees.reglages, nom: lu.reglages.nom || donnees.reglages.nom };
      lu.file = donnees.file;
      lu.plans = donnees.plans;
      lu.sync = { ...donnees.sync };
      donnees = lu;
      ui.sel = null; ui.edition = false;
      sauver(); rendreTout();
      toast(registreConfigure() ? 'Sauvegarde restaurée. Les postes déjà inscrits au registre commun gardent leur état du registre.' : 'Sauvegarde restaurée.');
    };
    lecteur.readAsText(fichier);
  }

  function effacerTout() {
    if (!confirm(registreConfigure()
      ? 'Effacer les données gardées dans ce navigateur ?\n\nLe registre commun n\'est pas touché : l\'état des postes sera rechargé depuis le registre.'
      : 'Effacer toutes les données de suivi enregistrées dans ce navigateur ?\n\nConseil : faites d\'abord « Sauvegarder les données ».')) return;
    const avant = JSON.stringify(donnees);
    const garde = { reglages: donnees.reglages, file: donnees.file, plans: donnees.plans };
    donnees = donneesVides();
    Object.assign(donnees, garde);
    donnees.sync.repris = true;   // rien à reprendre : on repart du registre
    ui.sel = null; ui.edition = false;
    sauver(); rendreTout();
    rafraichir();
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

  // ---------- Registre commun (Google Sheets) ----------
  // Chaque action part dans une file d'attente gardée dans le navigateur, puis est envoyée
  // au registre. Le registre renvoie l'état de tous les postes, qui remplace l'état local
  // des postes sans action en attente. Sans réseau, l'application continue en local.
  function registreConfigure() { return !!(CFG.registre && CFG.registre.url); }
  function peutEnvoyer() { return registreConfigure() && !!donnees.reglages.code && statut.erreur !== 'code'; }
  // Le script Google annonce son niveau (api 3 = réparations et messages au concepteur). Tant qu'il ne l'a pas fait,
  // ces nouveautés restent chez nous : un script plus ancien les inscrirait dans l'historique des postes.
  const serveurAJour = () => donnees.sync.api >= 3;
  const envoyable = e => (!e.apres || e.apres <= Date.now()) && !(e.action === 'avis' && !serveurAJour());
  const idEvenement = () => `${donnees.reglages.appareil}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  function instantane(id, n) {
    if (n === 'SALLE') {
      const R = salle(id);
      return {
        obs: R.obs, obsModifie: R.obsModifie, obsSignale: R.obsSignale, controle: R.controle, libelle: ETATS[etatObsSalle(R)],
        resume: R.controle ? `Contrôlée le ${fmtDT(R.controle.date)}${R.controle.par ? ' par ' + R.controle.par : ''}` : ''
      };
    }
    const p = salle(id).pcs[n] || pcVide();
    return JSON.parse(JSON.stringify({ pb: p.pb, obs: p.obs, modifie: p.modifie, signale: p.signale, libelle: ETATS[etatPoste(p)], resume: resume(p).join(' ; '), reseau: p.reseau }));
  }

  function noter(action, id, n, detail, t = maintenant(), extra = null) {
    if (!registreConfigure() || !n) return null;
    const etat = instantane(id, n);
    if (detail === undefined) {
      detail = n === 'SALLE'
        ? (etat.obs.trim() ? `Observation de salle : ${etat.obs.trim()}` : 'Observation de salle effacée')
        : [etat.resume, etat.obs.trim() ? `Obs. : ${etat.obs.trim()}` : ''].filter(Boolean).join(' ; ') || 'Plus aucun problème';
    }
    // Plusieurs cases cochées d'affilée sur le même poste : une seule ligne au registre
    const der = donnees.file[donnees.file.length - 1];
    const fusion = (action === 'modif' || action === 'obs_salle') && der && der.action === action
      && der.salle === id && der.poste === n && !enVol.has(der.id);
    let ev;
    if (fusion) { Object.assign(der, { t, detail, etat, par: nom() }); ev = der; }
    else {
      ev = { id: idEvenement(), t, salle: id, poste: n, action, detail, par: nom(), appareil: donnees.reglages.appareil, etat, ...(extra || {}) };
      donnees.file.push(ev);
    }
    if (donnees.file.length > 2000) donnees.file = donnees.file.slice(-2000);
    // « apres » : événement retenu jusqu'à cette heure (délai pour annuler une réparation)
    planifierEnvoi(ev.apres ? Math.max(0, ev.apres - Date.now()) + 300 : (action === 'modif' || action === 'obs_salle' ? 4000 : 600));
    majSauvegarde();
    return ev;
  }
  // Annule une action : retirée de la file si elle n'est pas encore partie, sinon l'annulation est notée au registre
  function defaireEvenement(ev, id, n, detail) {
    const i = ev ? donnees.file.findIndex(e => e.id === ev.id) : -1;
    if (i >= 0 && !enVol.has(ev.id)) {
      donnees.file.splice(i, 1);
      // d'autres actions sur ce poste attendent encore : le registre doit recevoir l'état restauré, pas le leur
      if (donnees.file.some(e => e.salle === id && e.poste === n)) noter('annulation', id, n, detail);
    } else noter('annulation', id, n, detail);
  }

  let minuteurEnvoi = null, echeanceEnvoi = 0;
  function planifierEnvoi(delai) {
    const echeance = Date.now() + delai;
    if (minuteurEnvoi && echeanceEnvoi <= echeance) return;
    clearTimeout(minuteurEnvoi);
    echeanceEnvoi = echeance;
    minuteurEnvoi = setTimeout(() => { minuteurEnvoi = null; envoyerFile(); }, delai);
  }

  async function appel(corps) {
    const ctrl = new AbortController(), minuterie = setTimeout(() => ctrl.abort(), 25000);
    try {
      // text/plain : requête « simple », sans pré-vérification CORS (que Google ne gère pas)
      const r = await fetch(CFG.registre.url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...corps, code: donnees.reglages.code }), signal: ctrl.signal, cache: 'no-store'
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(minuterie);
    }
  }

  // Réponse de doPost (état de tous les postes), et non la page d'accueil du service (doGet)
  const reponseComplete = r => Array.isArray(r.etat);

  function erreurRegistre(code) {
    const avant = statut.erreur;
    statut.erreur = code || 'serveur';
    if (code === 'code' && avant !== 'code') ouvrirRegistre('Le code d\'accès a été refusé par le registre. Vérifiez-le auprès du responsable de l\'application.');
  }

  async function envoyerFile() {
    if (!peutEnvoyer() || statut.envoi || !donnees.file.length) return;
    const maintenantMs = Date.now();
    const prets = donnees.file.filter(envoyable);
    if (!prets.length) {
      // réparations encore annulables : on attend la fin du délai (les messages en attente d'un script à jour attendent sans minuteur)
      const retenus = donnees.file.filter(e => e.apres && e.apres > maintenantMs);
      if (retenus.length) planifierEnvoi(Math.max(300, Math.min(...retenus.map(e => e.apres)) - maintenantMs + 50));
      return;
    }
    statut.envoi = true;
    majSauvegarde();
    const lot = prets.slice(0, 100);
    lot.forEach(e => enVol.add(e.id));
    try {
      const r = await appel({ action: 'envoyer', evenements: lot });
      // Une réponse sans état n'est pas un accusé de réception : les actions restent en attente
      if (r.ok && !reponseComplete(r)) statut.erreur = 'serveur';
      else if (r.ok) {
        const ids = new Set(lot.map(e => e.id));
        donnees.file = donnees.file.filter(e => !ids.has(e.id));
        statut.erreur = null;
        if (r.refuses > 0) toast('Le registre a refusé ' + (r.refuses > 1 ? 'des réparations' : 'une réparation') + ' : il faut le code du service réseau.');
        cacheHisto.clear();
        appliquerEtat(r);
        const z = $('#histoDistant');
        if (z) chargerHistorique(...z.dataset.cle.split('|'));   // seul l'historique se met à jour
      } else erreurRegistre(r.erreur);
    } catch (e) {
      statut.erreur = 'reseau';
    } finally {
      lot.forEach(e => enVol.delete(e.id));
      statut.envoi = false;
      sauver();
      if (donnees.file.length && !statut.erreur) planifierEnvoi(300);
    }
  }

  // Plans ajustés par le responsable : envoyés au registre pour que tout le monde les voie.
  // En cas d'échec (hors ligne, script Google pas à jour) le plan reste en attente sur cet ordinateur.
  const planEnVol = new Set();
  async function pousserPlan(id, supprimer = false, muet = false) {
    if (!peutEnvoyer() || !peutAjuster() || planEnVol.has(id)) return false;
    const R = salle(id);
    const envoye = supprimer ? null : (R.plan && { contour: R.plan.contour, postes: JSON.parse(JSON.stringify(R.plan.postes)) });
    if (!supprimer && !envoye) return true;
    const cle = envoye ? canon(envoye.postes) : '';
    const dire = msg => { if (!muet) toast(msg); };
    planEnVol.add(id);
    try {
      const r = await appel({ action: 'plan', salle: id, plan: envoye, par: nom() });
      if (!r.ok) {
        if (r.erreur === 'plan_invalide') {
          if (R.plan) R.plan.refuse = true;
          dire('Le registre a refusé ce plan (position invalide) : il reste sur cet ordinateur.');
        } else if (r.erreur === 'droits') {
          if (R.plan) R.plan.refuse = true;   // pas de nouvel essai tant que le profil ou le script ne change pas
          dire("Votre profil ne peut pas modifier les plans (ou le script Google n'est pas à jour) : le plan reste sur cet ordinateur.");
        } else erreurRegistre(r.erreur);
        return false;
      }
      // Un script Google pas encore mis à jour répond « ok » sans les plans : ce n'est pas un enregistrement
      const pris = reponseComplete(r) && r.plans && typeof r.plans === 'object' && (supprimer ? !r.plans[id] : !!r.plans[id]);
      if (!pris) {
        dire("Le registre n'a pas enregistré le plan : le script Google doit être mis à jour. Le plan reste sur cet ordinateur.");
        return false;
      }
      statut.erreur = null;
      appliquerEtat(r);
      if (!supprimer && R.plan && R.plan.enAttente && canon(R.plan.postes) === cle) R.plan = null;   // sauf s'il a encore bougé
      cacheHisto.clear();
      if (ui.salle === id && !ui.edition && ui.vue === 'plan') { rendrePlan(); rendreNonPlaces(); }
      rendreEntete();
      dire(supprimer ? "Plan d'origine rétabli pour tous vos collègues." : 'Plan enregistré : tous vos collègues le voient.');
      return true;
    } catch (e) {
      statut.erreur = 'reseau';
      dire('Registre injoignable : le plan est gardé sur cet ordinateur et sera envoyé dès que possible.');
      return false;
    } finally {
      planEnVol.delete(id);
      sauver();
    }
  }
  async function poussesPlansEnAttente() {
    if (!peutAjuster()) return;
    for (const id of SALLES) {
      const p = salle(id).plan;
      if (p && p.enAttente && !p.refuse && !(ui.edition && id === ui.salle)) await pousserPlan(id, false, true);
    }
  }
  // Avant le registre, un plan ajusté restait sur l'ordinateur : le responsable l'envoie, les autres l'abandonnent
  function migrerPlansLocaux() {
    for (const id of SALLES) {
      const R = salle(id);
      if (!R.plan || R.plan.enAttente) continue;
      if (peutAjuster() && !donnees.plans[id]) R.plan.enAttente = true;
      else R.plan = null;
    }
  }

  async function rafraichir() {
    if (!peutEnvoyer() || document.hidden) return;
    await poussesPlansEnAttente();
    if (donnees.file.some(envoyable)) return envoyerFile();   // l'envoi rapporte aussi l'état à jour
    try {
      const r = await appel({ action: 'etat' });
      if (r.ok && reponseComplete(r)) { statut.erreur = null; appliquerEtat(r); }
      else if (r.ok) statut.erreur = 'serveur';
      else erreurRegistre(r.erreur);
    } catch (e) {
      statut.erreur = 'reseau';
    }
    sauver();
  }

  // Au tout premier contact, les relevés faits avant le registre y sont versés
  function reprendre(distant) {
    donnees.sync.repris = true;
    const connus = new Map(distant.map(x => [x.salle + '|' + x.poste, x.d || {}]));
    for (const id of SALLES) {
      const R = salle(id);
      for (const [n, p] of Object.entries(R.pcs)) {
        if (!aProbleme(p)) continue;
        const d = connus.get(id + '|' + n);
        if (d && (d.t || '') >= (p.modifie || '')) continue;
        noter('reprise', id, n, undefined, p.modifie || maintenant());
      }
      const d = connus.get(id + '|SALLE');
      if (R.obs.trim() && (!d || (d.t || '') < (R.obsModifie || ''))) noter('obs_salle', id, 'SALLE', undefined, R.obsModifie || maintenant());
    }
  }

  function appliquerEtat(r) {
    // Seul le code responsable reçoit l'adresse de la feuille Google
    const roleAvant = donnees.sync.role, apiAvant = donnees.sync.api;
    donnees.sync.api = Math.max(0, Number(r.api) || 0);
    donnees.sync.role = r.role === 'responsable' || r.role === 'technicien' ? r.role : 'equipe';
    if (roleAvant !== donnees.sync.role || apiAvant !== donnees.sync.api) {   // nouveau profil ou script : les plans refusés sont retentés
      SALLES.forEach(id => { if (salle(id).plan) delete salle(id).plan.refuse; });
    }
    donnees.sync.feuille = donnees.sync.role === 'responsable' ? String(r.feuille || '') : '';
    if (r.messagesInfo && typeof r.messagesInfo.n === 'number') {   // pour le responsable : nombre de messages au concepteur
      donnees.sync.msgN = r.messagesInfo.n;
      donnees.sync.msgVu = Math.min(donnees.sync.msgVu, r.messagesInfo.n);
    }
    majRole();
    // Plans partagés (un script Google pas encore à jour n'en envoie pas : on garde ceux qu'on a)
    const majAvant = Object.fromEntries(SALLES.map(id => [id, donnees.plans[id]?.maj || '']));
    if (r.plans && typeof r.plans === 'object') donnees.plans = plansValides(r.plans);
    const planModifie = SALLES.filter(id => majAvant[id] !== (donnees.plans[id]?.maj || ''));
    migrerPlansLocaux();
    donnees.sync.dernier = maintenant();
    const distant = Array.isArray(r.etat) ? r.etat : [];
    if (!donnees.sync.repris) reprendre(distant);
    const attente = new Set(donnees.file.map(e => e.salle + '|' + e.poste));
    const changes = new Set();
    for (const { salle: id, poste: n, d } of distant) {
      const cle = id + '|' + n;
      if (!donnees.salles[id] || !d || !n || attente.has(cle)) continue;
      if (n === 'SALLE') {
        const R = salle(id);
        if (R.serveur === d.maj) continue;
        const sig = x => JSON.stringify([x.obs || '', x.obsModifie || null, x.obsSignale || null, x.controle || null]);
        if (sig(R) === sig(d)) { R.serveur = d.maj; continue; }
        Object.assign(R, { obs: String(d.obs || ''), obsModifie: d.obsModifie || null, obsSignale: d.obsSignale || null, controle: d.controle || null, serveur: d.maj });
        changes.add(cle);
        continue;
      }
      const p = salle(id).pcs[n];
      if (p && p.serveur === d.maj) continue;
      const pbDistant = rangerPb(d.pb), reseauDistant = reseauValide(d.reseau);
      const signature = (pb, x, rs) => JSON.stringify([CATS.map(c => pb[c.id]), x.obs || '', x.modifie || null, x.signale || null, rs ? [rs.txt, rs.t] : null]);
      if (p && signature(p.pb, p, p.reseau) === signature(pbDistant, d, reseauDistant)) { p.serveur = d.maj; continue; }   // écho de nos propres actions
      const P = p || pcVide();
      P.pb = pbDistant;
      P.reseau = reseauDistant;
      P.obs = String(d.obs || '');
      P.modifie = d.modifie || null;
      P.signale = d.signale || null;
      P.serveur = d.maj;
      if (!p) {
        if (!aProbleme(P) && !P.signale) continue;
        salle(id).pcs[n] = P;
      }
      changes.add(cle);
    }
    if (planModifie.includes(ui.salle) && !ui.edition && ui.vue === 'plan') { rendrePlan(); rendreEntete(); rendreNonPlaces(); }
    if ((roleAvant !== donnees.sync.role || apiAvant !== donnees.sync.api) && ui.sel && !ui.edition && !document.activeElement?.matches('#inspector textarea, #inspector input')) rendreInspecteur();   // la fiche change selon le profil et le script
    if (donnees.file.some(envoyable) && !statut.envoi) planifierEnvoi(300);   // un script à jour libère les messages restés en attente
    if (changes.size) rendreApresSync(changes);
    if (peutAjuster() && SALLES.some(id => salle(id).plan?.enAttente)) setTimeout(poussesPlansEnAttente, 400);
  }

  function rendreApresSync(changes) {
    rendreOnglets();
    majBadge();
    rendreEntete();
    if (ui.vue === 'liste') rendreListe(); else majPostes();
    rendreNonPlaces();
    const saisie = document.activeElement?.matches('#inspector textarea, #inspector input');
    const concerne = [...changes].some(k => ui.sel ? k === `${ui.salle}|${ui.sel}` : k.startsWith(ui.salle + '|'));
    if (concerne && !saisie && !ui.edition) rendreInspecteur();
  }

  async function chargerHistorique(id, n) {
    const cle = `${id}|${n}`;
    const zone = () => { const z = $('#histoDistant'); return z && z.dataset.cle === cle ? z : null; };
    const titre = n ? 'Historique · registre commun' : 'Derniers événements · registre commun';
    const message = txt => { const z = zone(); if (z) z.innerHTML = `<div class="histo"><h4>${titre}</h4><p class="vide">${txt}</p></div>`; };
    const afficher = evs => {
      const z = zone();
      if (!z) return;
      if (!evs.length) return message('Aucun événement enregistré pour le moment.');
      z.innerHTML = blocHistorique(evs.map(e => ({
        t: e.t, type: e.action, par: e.par, role: e.role, txt: e.detail,
        quoi: n ? e.libelle : `${e.poste === 'Salle' || e.poste === 'Plan' ? e.poste : 'Poste ' + e.poste.replace(/^.*P/, '')} : ${e.libelle.toLowerCase()}`
      })), titre, n ? 20 : 12);
    };
    const c = cacheHisto.get(cle);
    if (c && Date.now() - c.t < 60000) return afficher(c.evs);
    if (!peutEnvoyer()) return message('Saisissez le code d\'accès pour voir l\'historique commun.');
    message('Chargement du registre…');
    try {
      const r = await appel({ action: 'historique', salle: id, poste: n, max: n ? 20 : 12 });
      if (!r.ok) { erreurRegistre(r.erreur); majSauvegarde(); return message('Registre indisponible.'); }
      if (!Array.isArray(r.evenements)) return message('Registre indisponible pour le moment.');
      cacheHisto.set(cle, { t: Date.now(), evs: r.evenements || [] });
      afficher(r.evenements || []);
    } catch (e) {
      message('Registre injoignable pour le moment.');
    }
  }

  // Page fermée avec des actions en attente : dernier envoi sans attendre la réponse.
  // Elles restent dans la file ; le registre ignore les doublons au prochain envoi.
  function balise() {
    const prets = donnees.file.filter(envoyable);
    if (!peutEnvoyer() || !prets.length || !navigator.sendBeacon) return;
    const corps = JSON.stringify({ action: 'envoyer', code: donnees.reglages.code, evenements: prets.slice(0, 100) });
    try { navigator.sendBeacon(CFG.registre.url, new Blob([corps], { type: 'text/plain;charset=utf-8' })); } catch (e) { /* tant pis */ }
  }

  function ouvrirRegistre(message) {
    const d = $('#dlgRegistre');
    $('#regNom').value = donnees.reglages.nom;
    $('#regCode').value = donnees.reglages.code;
    $('#registreMsg').textContent = message || 'Chaque action (panne relevée, signalement, réparation, contrôle) est inscrite dans le registre commun de l\'équipe, avec votre nom.';
    $('#registreMsg').classList.toggle('alerte', !!message);
    const att = donnees.file.length;
    $('#registreEtat').textContent = [
      donnees.sync.dernier ? `Dernier échange avec le registre : ${fmtDT(donnees.sync.dernier)}.` : 'Pas encore de contact avec le registre.',
      att ? `${att} action${att > 1 ? 's' : ''} en attente d'envoi.` : ''
    ].join(' ');
    const lien = $('#lienFeuille');
    const responsable = donnees.sync.role === 'responsable' && !!donnees.sync.feuille;
    lien.hidden = !responsable;
    if (responsable) lien.href = donnees.sync.feuille;
    const profil = {
      responsable: ' Connecté avec le code responsable.',
      technicien: ' Connecté avec le code du service réseau : vous pouvez enregistrer les réparations.'
    }[donnees.sync.role];
    if (profil) $('#registreEtat').textContent += profil;
    // Le script Google est-il à jour ? (réparations du service réseau et messages au concepteur en dépendent)
    const sc = $('#registreScript');
    sc.hidden = !donnees.sync.dernier;
    if (donnees.sync.dernier) {
      const aJour = serveurAJour();
      sc.className = aJour ? 'small muted' : 'small alerte';
      sc.textContent = aJour
        ? 'Script Google à jour : réparations du service réseau et messages au concepteur actifs.'
        : 'Le script Google n\'est pas encore à jour : les réparations du service réseau et les messages au concepteur attendent sa mise à jour.';
    }
    if (!d.open) d.showModal();
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
    if (chip) return basculer(chip.closest('.cat').dataset.cat, chip.dataset.val);
    const theme = e.target.closest('[data-ouvrir]');
    if (theme) {
      const id = theme.dataset.ouvrir;
      if (ui.rechPb) {   // pendant une recherche, cliquer un thème l'ouvre seul et efface la recherche
        ui.rechPb = '';
        $('#rechPb').value = '';
        ui.catOuverte = id;
      } else ui.catOuverte = ui.catOuverte === id ? null : id;
      rendreCategories({ cat: id });
      if (ui.catOuverte === id) $(`.cat[data-cat="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'prec') voisin(-1);
      else if (act === 'suiv') voisin(1);
      else if (act === 'fermer') choisir(null);
      else if (act === 'toutok' || act === 'repare') remettreEnService();
      else if (act === 'controle') controler();
      else if (act === 'rep-tout') {
        const br = brouillonRep();
        br.coches = $$('#repZone [data-rep]').map(c => c.dataset.rep);
        $$('#repZone [data-rep]').forEach(c => { c.checked = true; });
        majBoutonRep();
      } else if (act === 'rep-valider') enregistrerReparations();
      return;
    }
    const li = e.target.closest('.pb-salle li');
    if (li) choisir(li.dataset.n);
  });
  $('#inspector').addEventListener('keydown', e => {
    const li = e.target.closest('.pb-salle li');
    if (li && e.key === 'Enter') choisir(li.dataset.n);
    if (e.target.id === 'rechPb' && e.key === 'Escape' && e.target.value) {   // Échap vide d'abord la recherche
      e.stopPropagation();
      e.target.value = '';
      ui.rechPb = '';
      rendreCategories();
    }
  }, true);
  $('#inspector').addEventListener('change', e => {
    if (!e.target.matches('[data-rep]')) return;
    const br = brouillonRep(), cle = e.target.dataset.rep;
    br.coches = e.target.checked ? [...new Set([...br.coches, cle])] : br.coches.filter(c => c !== cle);
    majBoutonRep();
  });
  $('#inspector').addEventListener('input', e => {
    if (e.target.id === 'repMsg') {
      brouillonRep().message = e.target.value;
      majBoutonRep();
    } else if (e.target.id === 'rechPb') {
      ui.rechPb = e.target.value;
      rendreCategories();
    } else if (e.target.id === 'inspObs') {
      const p = poste(ui.salle, ui.sel, true);
      p.obs = e.target.value;
      p.modifie = maintenant();
      nettoyer(ui.salle, ui.sel);
      noter('modif', ui.salle, ui.sel);
      sauver();
      apresChangementPoste();
    } else if (e.target.id === 'obsSalle') {
      const R = salle(ui.salle);
      R.obs = e.target.value;
      R.obsModifie = maintenant();
      noter('obs_salle', ui.salle, 'SALLE');
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
      if (ui.edition) annulerEdition();
      return;
    }
    if (e.target.matches?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
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
    if (!ui.edition && ui.sel && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest?.('#roomTabs')) {
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
      restaurer: () => $('#fileImport').click(), aide: () => $('#dlgAide').showModal(), effacer: effacerTout,
      registre: () => ouvrirRegistre(), avis: ouvrirAvis, boite: ouvrirBoite,
      feuille: () => { if (donnees.sync.role === 'responsable' && donnees.sync.feuille) window.open(donnees.sync.feuille, '_blank', 'noopener'); }
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
  $$('[data-fermer]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close('cancel')));

  // Registre commun : nom et code d'accès
  $('#saveState').addEventListener('click', () => { if (registreConfigure()) ouvrirRegistre(); });
  function lireIdentite() {
    const code = $('#regCode').value.trim();
    if (code !== donnees.reglages.code) {   // nouveau code : les droits seront redonnés par le registre
      donnees.sync.role = '';
      donnees.sync.feuille = '';
      majRole();
      if (ui.sel && !ui.edition) rendreInspecteur();
    }
    donnees.reglages.nom = $('#regNom').value.trim();
    donnees.reglages.code = code;
    statut.erreur = null;
    sauver();
  }
  // Ce qui dépend du profil (équipe, service réseau, responsable) : boutons et entrées de menu
  function majRole() {
    const r = donnees.sync.role, reg = registreConfigure();
    $('[data-menu="feuille"]').hidden = !(r === 'responsable' && donnees.sync.feuille);
    $('#btnRapport').hidden = reg && r === 'technicien';   // le service réseau reçoit les rapports : il n'en envoie pas
    $('[data-menu="avis"]').hidden = !reg;
    $('[data-menu="boite"]').hidden = !(reg && r === 'responsable');
    majBadgeMessages();
    majSauvegarde();
    rendreEntete();   // le bouton « Ajuster le plan » dépend du profil
  }
  function majBadgeMessages() {
    const nouveaux = donnees.sync.role === 'responsable' ? Math.max(0, donnees.sync.msgN - donnees.sync.msgVu) : 0;
    $('#btnMenu').classList.toggle('a-badge', nouveaux > 0);
    $('#boiteNb').textContent = nouveaux ? ` · ${nouveaux} nouveau${nouveaux > 1 ? 'x' : ''}` : '';
  }

  // ---------- Messages au concepteur ----------
  const contexteAvis = () => [`écran ${innerWidth}×${innerHeight}`, `vue ${ui.vue}`, ui.sel ? `poste ${ui.sel}` : '',
    (navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/) || [''])[0]].filter(Boolean).join(' · ');

  function ouvrirAvis() {
    $('#avisTexte').value = '';
    $('#avisType').value = 'idee';
    $('#avisInfo').textContent = `Envoyé avec votre nom${nom() ? ' (' + nom() + ')' : ''}, la version de l'application (V ${CFG.version}) et la salle affichée (${ui.salle}).`;
    $('#dlgAvis').showModal();
    $('#avisTexte').focus();
  }
  // Le message passe par la même file que les actions : gardé hors ligne, jamais envoyé deux fois
  function empilerAvis(type, texte) {
    donnees.file.push({
      id: idEvenement(), t: maintenant(), salle: ui.salle, poste: 'AVIS', action: 'avis', detail: texte.slice(0, 2000),
      type: TYPES_AVIS[type] ? type : 'autre', par: nom(), appareil: donnees.reglages.appareil, version: CFG.version, contexte: contexteAvis()
    });
    planifierEnvoi(300);
    sauver();
    toast(peutEnvoyer() && !statut.erreur && serveurAJour()
      ? 'Merci ! Votre message est transmis au concepteur.'
      : 'Message gardé : il sera transmis au concepteur dès que possible.');
  }

  let boiteMessages = [];
  async function ouvrirBoite() {
    const corps = $('#boiteCorps');
    corps.innerHTML = '<p class="muted">Chargement des messages…</p>';
    $('#boiteCopier').disabled = true;
    if (!$('#dlgBoite').open) $('#dlgBoite').showModal();
    try {
      const r = await appel({ action: 'messages', max: 200 });
      if (!r.ok) { corps.innerHTML = `<p class="alerte">${r.erreur === 'droits' ? 'Cette liste est réservée au code responsable.' : 'Le registre a refusé la demande.'}</p>`; return; }
      if (!Array.isArray(r.messages)) { corps.innerHTML = '<p class="alerte">Le script Google n\'est pas à jour : il ne gère pas encore les messages.</p>'; return; }
      boiteMessages = r.messages;
      donnees.sync.msgN = r.messagesInfo && typeof r.messagesInfo.n === 'number' ? r.messagesInfo.n : boiteMessages.length;
      donnees.sync.msgVu = donnees.sync.msgN;
      sauver();
      majBadgeMessages();
      corps.innerHTML = htmlBoite(boiteMessages);
      $('#boiteCopier').disabled = !boiteMessages.length;
    } catch (e) {
      corps.innerHTML = '<p class="alerte">Registre injoignable pour le moment.</p>';
    }
  }
  const detailsAvis = m => [m.salle ? 'Salle ' + m.salle : '', m.version ? 'V ' + m.version : '', m.contexte].filter(Boolean).join(' · ');
  function htmlBoite(msgs) {
    if (!msgs.length) return '<p class="muted">Aucun message pour le moment.</p>';
    return msgs.map(m => `<article class="msg">
      <header><span class="pill type-${esc(m.type)}">${esc(TYPES_AVIS[m.type] || m.libelle || 'Autre')}</span>
        <strong>${esc(m.par || 'Anonyme')}</strong>${m.role && m.role !== 'equipe' ? ` <span class="role-tag">${esc(libRole(m.role))}</span>` : ''}
        <span class="muted">${esc(fmtDT(m.t))}</span></header>
      <p>${esc(m.texte)}</p>
      <footer>${esc(detailsAvis(m))}</footer></article>`).join('');
  }
  function texteBoite(msgs) {
    return `Messages au concepteur (${msgs.length}) — copie du ${fmtDT(maintenant())}\n\n` + msgs.map(m =>
      `[${fmtDT(m.t)}] ${m.par || 'Anonyme'} (${libRole(m.role) || '—'}) — ${TYPES_AVIS[m.type] || 'Autre'}\n${m.texte}\n(${detailsAvis(m)})`).join('\n\n---\n\n');
  }
  $('#dlgRegistre form').addEventListener('submit', e => {
    if (e.submitter && e.submitter.value !== 'ok') return;
    lireIdentite();
    rafraichir();
  });
  $('#formAvis').addEventListener('submit', e => {
    if (e.submitter && e.submitter.value !== 'ok') return;
    const texte = $('#avisTexte').value.trim();
    if (!texte) { e.preventDefault(); $('#avisTexte').focus(); return; }   // la fenêtre reste ouverte
    empilerAvis($('#avisType').value, texte);
  });
  $('#boiteCopier').addEventListener('click', async () => {
    toast((await copier(texteBoite(boiteMessages))) ? 'Messages copiés : vous pouvez les coller où vous voulez.' : 'Copie impossible dans ce navigateur : sélectionnez le texte et faites Ctrl+C.');
  });
  $('#btnSync').addEventListener('click', async () => {
    lireIdentite();
    $('#registreEtat').textContent = 'Échange avec le registre…';
    await rafraichir();
    ouvrirRegistre(statut.erreur === 'code' ? 'Le code d\'accès a été refusé par le registre.'
      : statut.erreur ? 'Le registre ne répond pas : vérifiez la connexion. Les actions restent en attente et partiront plus tard.' : undefined);
  });

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
  majRole();

  if (registreConfigure()) {
    $('[data-menu="registre"]').hidden = false;
    if (!donnees.reglages.code || !nom()) setTimeout(() => ouvrirRegistre(), 400);
    else rafraichir();
    setInterval(rafraichir, 60000);
    setInterval(() => { if (donnees.file.length && !statut.envoi) envoyerFile(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) balise(); else rafraichir(); });
    window.addEventListener('pagehide', balise);
    window.addEventListener('online', () => { if (statut.erreur === 'reseau') statut.erreur = null; rafraichir(); });
  }
})();
