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
window.CONFIG_SALLES = {
  version: '2.0',
  batiment: 'Bât 13',
  destinataire: 'reseauinfovitry@gmail.com',
  signature: "L'équipe GCCE",

  /* Registre commun (Google Sheets) : adresse de l'application Web Apps Script
     (Déployer > Gérer les déploiements > URL se terminant par /exec).
     Laisser vide pour un usage sans registre (données gardées dans chaque navigateur). */
  registre: {
    url: 'https://script.google.com/macros/s/AKfycbxi61deRjn9UEA7mKIF66veD77TgqgbvsUBVV4zYhvJhPu63uuNht8u60BfdiQdqf15/exec'
  },

  categories: [
    { id: 'pc', nom: 'Unité centrale', court: 'UC', options: [
      'HS', "Ne s'allume pas", 'Pas de connexion réseau', 'Très lent', 'Fige / se bloque',
      'Écran bleu (BSOD)', 'Redémarre en boucle', 'Bruit anormal', 'Abîmé'] },
    { id: 'screen1', nom: 'Écran 1', court: 'É1', options: [
      'HS', "Pas d'image", "Ne s'allume pas", 'Couleurs anormales', 'Image qui scintille',
      'Rayé / fissuré', 'Câble manquant', 'Absent'] },
    { id: 'screen2', nom: 'Écran 2', court: 'É2', options: [
      'HS', "Pas d'image", "Ne s'allume pas", 'Couleurs anormales', 'Image qui scintille',
      'Rayé / fissuré', 'Câble manquant', 'Absent'] },
    { id: 'software', nom: 'Logiciels', court: 'Log', options: [
      'Session impossible (Windows)', 'Ne se lance pas', 'Plante / se ferme', 'Erreur de licence',
      'Revit', 'Navisworks', 'Twinmotion', 'Epic Games', 'AutoCAD', 'LibreOffice', 'BIMvision', 'CYPE'] },
    { id: 'peripheral', nom: 'Périphériques', court: 'Pér', options: [
      'Manque souris', 'Manque clavier', 'Manque alimentation', 'Manque câble RJ45', 'Manque câble écran',
      'Souris HS', 'Clavier HS', 'Souris non détectée', 'Clavier non détecté', 'Port USB HS', 'Câble défectueux'] }
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
