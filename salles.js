/*
 * Configuration des salles informatiques — Bâtiment 13
 * ----------------------------------------------------
 * Ce fichier se modifie sans toucher au reste de l'application.
 *
 * Plans : coordonnées en unités libres (le plan est mis à l'échelle à l'affichage).
 *   contour  : sommets du mur, dans l'ordre
 *   portes   : h = gond, c = bout du vantail fermé (dans le mur), o = bout du vantail ouvert
 *   mobilier : tables sans poste  { r: [x, y, largeur, hauteur] }
 *   postes   : '04': [x, y, largeur, hauteur]  (coin haut-gauche)
 * Un poste absent de « postes » apparaît dans « Postes non placés ».
 * Le bouton « Ajuster le plan » de l'application permet de déplacer les postes
 * puis de copier ici la configuration obtenue.
 */

// Rubriques communes aux deux écrans
const ECRAN = [
  { nom: 'Affichage', options: [
    "Pas d'image", 'Message « Aucun signal »', "Ne s'allume pas", 'Image floue / mauvaise résolution',
    'Couleurs anormales', 'Image qui scintille', 'Lignes ou taches', 'Pixels morts'] },
  { nom: 'Matériel', options: [
    'HS', 'Rayé / fissuré', 'Pied cassé ou instable', 'Boutons cassés', 'Câble vidéo manquant',
    "Câble d'alimentation manquant", 'Absent'] },
  { nom: 'Réglages', options: [
    'Écrans inversés (gauche / droite)', 'Affichage en double (recopie)'] }
];

window.CONFIG_SALLES = {
  version: '2.8',
  batiment: 'Bât 13',
  destinataire: 'reseauinfovitry@gmail.com',
  signature: "L'équipe GCCE",

  /* Registre commun (Google Sheets) : adresse de l'application Web Apps Script
     (Déployer > Gérer les déploiements > URL se terminant par /exec).
     Laisser vide pour un usage sans registre (données gardées dans chaque navigateur). */
  registre: {
    url: 'https://script.google.com/macros/s/AKfycby0O2OlUG2K5HbMX5ZawY-_Y5x5WUEekxIDfVORMW0GrZMX3hFnAuZ70uOTx4mc4kDy/exec'
  },

  /* Thèmes de pannes : chaque thème est un menu dépliant de la fiche du poste,
     découpé en rubriques. On peut ajouter ou retirer des libellés librement ;
     un libellé déjà coché et retiré d'ici reste visible dans la rubrique « Autres ». */
  categories: [
    { id: 'pc', nom: 'Unité centrale', court: 'UC', icone: 'uc', groupes: [
      { nom: 'Démarrage', options: [
        "Ne s'allume pas", "S'éteint tout seul", 'Redémarre en boucle', 'Bloqué au démarrage',
        'Bips au démarrage', 'Écran bleu (BSOD)', '« Aucun périphérique de démarrage »'] },
      { nom: 'Fonctionnement', options: [
        'Très lent', 'Fige / se bloque', 'Surchauffe', 'Bruit anormal', 'Date et heure fausses (pile)',
        'Disque plein', 'Mises à jour bloquées', 'Virus ou fenêtres suspectes'] },
      { nom: 'État du matériel', options: [
        'HS', 'Abîmé', 'Bouton marche cassé', 'Capot ouvert ou manquant', 'Port USB avant HS',
        'Prise casque HS', "Câble d'alimentation manquant", 'Unité absente'] }
    ] },
    { id: 'screen1', nom: 'Écran 1', court: 'É1', icone: 'ecran', groupes: ECRAN },
    { id: 'screen2', nom: 'Écran 2', court: 'É2', icone: 'ecran', groupes: ECRAN },
    { id: 'peripheral', nom: 'Clavier, souris et son', court: 'Pér', icone: 'periph', groupes: [
      { nom: 'Clavier', options: [
        'Manque clavier', 'Clavier HS', 'Clavier non détecté', 'Touches manquantes ou bloquées', 'Clavier en QWERTY'] },
      { nom: 'Souris', options: [
        'Manque souris', 'Souris HS', 'Souris non détectée', 'Clic ou molette défectueux'] },
      { nom: 'Son et vidéo', options: [
        'Casque manquant', 'Pas de son', 'Micro HS', 'Webcam HS'] },
      { nom: 'Branchements', options: [
        'Manque alimentation', 'Manque câble écran', 'Port USB HS', 'Câble défectueux'] }
    ] },
    { id: 'software', nom: 'Logiciels et session', court: 'Log', icone: 'logiciel', groupes: [
      { nom: 'Session Windows', options: [
        'Session impossible (Windows)', 'Mot de passe refusé / compte bloqué', 'Profil temporaire (bureau vide)',
        'Ouverture de session très longue'] },
      { nom: 'Problème', options: [
        'Ne se lance pas', 'Plante / se ferme', 'Erreur de licence', 'Logiciel absent (à installer)',
        'Mise à jour demandée', 'Très lent dans le logiciel'] },
      { nom: 'Logiciel concerné', options: [
        'Revit', 'AutoCAD', 'Navisworks', 'Twinmotion', 'Epic Games', 'SketchUp', 'BIMvision', 'CYPE',
        'LibreOffice', 'Microsoft Office', 'Navigateur Internet', 'Lecteur PDF'] }
    ] },
    { id: 'reseau', nom: 'Réseau et Internet', court: 'Rés', icone: 'reseau', groupes: [
      { nom: 'Connexion', options: [
        'Pas de connexion réseau', 'Internet très lent', 'Site bloqué par le filtrage',
        'Lecteurs réseau inaccessibles', 'Impression impossible (imprimante)'] },
      { nom: 'Branchements', options: [
        'Manque câble RJ45', 'Câble RJ45 abîmé', 'Prise réseau murale HS'] }
    ] },
    { id: 'poste', nom: 'Poste et électricité', court: 'Poste', icone: 'prise', groupes: [
      { nom: 'Électricité', options: [
        'Prise électrique HS', 'Multiprise manquante ou HS', 'Câbles dangereux (dénudés, au sol)'] },
      { nom: 'Mobilier et propreté', options: [
        'Table abîmée', 'Chaise cassée', 'Poste sale', 'Étiquette du poste manquante', 'Antivol arraché'] }
    ] }
  ],

  salles: {
    '13-11': {
      postes: 14,
      plan: {
        contour: [[60, 175], [615, 175], [615, 945], [60, 945]],
        portes: [{ h: [615, 195], c: [615, 290], o: [520, 195] }, { h: [615, 945], c: [525, 945], o: [615, 855] }],
        mobilier: [],
        postes: {
          '01': [105, 818, 108, 72], '02': [558, 728, 50, 84], '03': [558, 630, 50, 84], '04': [558, 529, 50, 84],
          '05': [558, 438, 50, 84], '06': [558, 333, 50, 84], '07': [453, 188, 50, 84], '08': [339, 188, 50, 84],
          '09': [78, 345, 86, 60], '10': [78, 200, 86, 60], '11': [78, 450, 86, 60], '12': [247, 188, 50, 84],
          '13': [78, 541, 86, 60], '14': [78, 660, 86, 60]
        }
      }
    },
    '13-12': {
      postes: 13,
      plan: {
        contour: [[25, 60], [670, 60], [670, 845], [165, 845], [165, 662], [25, 662]],
        portes: [{ h: [60, 662], c: [130, 662], o: [60, 592] }],
        mobilier: [],
        postes: {
          '01': [175, 680, 60, 144], '02': [43, 478, 90, 66], '03': [166, 412, 56, 104], '04': [43, 389, 90, 66],
          '05': [43, 219, 90, 66], '06': [166, 147, 56, 104], '07': [43, 95, 90, 66], '08': [553, 203, 90, 66],
          '09': [553, 95, 90, 66], '10': [480, 147, 56, 104], '11': [573, 431, 90, 66], '12': [480, 459, 56, 104],
          '13': [573, 525, 90, 66]
        }
      }
    },
    '13-21': {
      postes: 16,
      plan: {
        contour: [[65, 55], [685, 55], [685, 1035], [65, 1035]],
        portes: [{ h: [65, 1015], c: [65, 875], o: [205, 1015] }],
        mobilier: [],
        postes: {
          '01': [479, 386, 60, 112], '02': [109, 488, 92, 64], '03': [228, 424, 60, 112], '04': [109, 410, 92, 64],
          '05': [109, 253, 92, 64], '06': [228, 194, 60, 112], '07': [109, 167, 92, 64], '08': [361, 74, 60, 112],
          '09': [382, 218, 92, 64], '10': [440, 74, 60, 112], '11': [552, 380, 92, 64], '12': [422, 916, 188, 104],
          '13': [552, 461, 92, 64], '14': [552, 620, 92, 64], '15': [479, 632, 60, 112], '16': [552, 703, 92, 64]
        }
      }
    },
    '13-22': {
      postes: 16,
      plan: {
        contour: [[55, 62], [675, 62], [675, 1130], [55, 1130]],
        portes: [{ h: [55, 100], c: [55, 210], o: [165, 100] }, { h: [55, 1090], c: [55, 940], o: [205, 1090] },
                 { h: [635, 1130], c: [525, 1130], o: [635, 1020] }],
        mobilier: [],
        postes: {
          '01': [94, 800, 156, 96], '02': [95, 699, 76, 62], '03': [95, 607, 76, 62], '04': [192, 636, 52, 100],
          '05': [95, 447, 76, 62], '06': [95, 321, 76, 62], '07': [192, 368, 52, 100], '08': [463, 274, 52, 100],
          '09': [535, 238, 76, 62], '10': [535, 355, 76, 62], '11': [463, 532, 52, 100], '12': [535, 514, 76, 62],
          '13': [535, 621, 76, 62], '14': [474, 785, 52, 100], '15': [544, 761, 76, 62], '16': [544, 854, 76, 62]
        }
      }
    },
    '13-23': {
      postes: 15,
      plan: {
        contour: [[55, 70], [655, 70], [655, 920], [180, 920], [55, 795]],
        portes: [{ h: [55, 92], c: [55, 192], o: [155, 92] }, { h: [70, 810], c: [170, 910], o: [170, 710] }],
        mobilier: [{ r: [265, 820, 380, 95] }],
        postes: {
          '01': [379, 101, 168, 88], '02': [62, 207, 92, 54], '03': [62, 269, 46, 66], '04': [74, 345, 92, 54],
          '05': [543, 753, 92, 54], '06': [74, 515, 46, 66], '07': [74, 412, 46, 66], '09': [74, 628, 92, 54],
          '11': [566, 652, 46, 66], '12': [566, 452, 46, 66], '13': [522, 345, 92, 54], '14': [566, 225, 46, 66],
          '15': [522, 568, 92, 54]
          /* 08 et 10 ne figurent pas sur le relevé : ils restent dans « Postes non placés ». */
        }
      }
    },
    '13-31': { postes: 15, plan: null },
    '13-32': { postes: 15, plan: null },
    '13-33': { postes: 15, plan: null }
  }
};
