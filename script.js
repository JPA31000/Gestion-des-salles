document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration Globale de l'Application ---
    const CONFIG = {
        rooms: ['13-11', '13-12', '13-22', '13-23', '13-31', '13-32', '13-33'],
        pcsPerRoom: 15,
        storageKey: 'itInventoryData_v3', // Clé de stockage mise à jour pour la nouvelle structure
        statuses: {
            generic: ['Ok', 'HS', 'Pas de connexion', 'Ne s\'allume pas', 'Très lent', 'Fige / Se bloque', 'Écran bleu / BSOD', 'Redémarre en boucle', 'Couleurs anormales (Écran)', 'Abîmé'],
            software: ['RAS', 'Session impossible (Windows)', 'Ne se lance pas (Général)', 'Plante / Se ferme (Général)', 'Erreur de licence', 'Revit', 'Naviswork', 'Twinmotion', 'Epic games', 'Autocad', 'Libreoffice', 'Bimvision', 'CYPE'],
            peripheral: ['RAS', 'Manque souris', 'Manque clavier', 'Manque alim elec', 'Manque rj45', 'Manque Connexion ecran', 'Souris HS', 'Clavier HS', 'Souris non détectée', 'Clavier non détectée', 'Port USB HS', 'Câble défectueux']
        }
    };

    // --- Éléments du DOM ---
    const roomSelect = document.getElementById('roomSelect');
    const roomTitle = document.getElementById('roomTitle');
    const inventoryBody = document.getElementById('inventoryBody');
    const pcCheckboxesContainer = document.getElementById('pc-checkboxes');
    const toggleAllPcsBtn = document.getElementById('toggleAllPcsBtn');
    const reportButton = document.getElementById('reportButton');
    const modal = document.getElementById('reportModal');
    const closeModalButton = document.querySelector('.close-button');
    const lastSavedEl = document.getElementById('lastSaved');
    const generalObservationTextarea = document.getElementById('generalObservation');
    const resetObservationBtn = document.getElementById('resetObservationBtn');
    const sendEmailButton = document.getElementById('sendEmailButton');

    let inventoryData = {};
    let currentRoom = '';

    // --- Initialisation ---
    function init() {
        populateRoomSelector();
        loadData();
        currentRoom = roomSelect.value;
        displayRoomData(currentRoom);
        setupEventListeners();
        updateLastSaved();
    }

    function loadData() {
        const savedData = localStorage.getItem(CONFIG.storageKey);
        inventoryData = savedData ? JSON.parse(savedData) : generateDefaultData();
    }
    
    function generateDefaultData() {
        const data = {};
        CONFIG.rooms.forEach(room => {
            data[room] = {
                items: [],
                generalObservation: ""
            };
            for (let i = 0; i < CONFIG.pcsPerRoom; i++) {
                data[room].items.push(generateDefaultRow(room, i));
            }
        });
        return data;
    }

    function generateDefaultRow(room, index) {
        return {
            pcNumber: `${room}P${(index + 1).toString().padStart(2, '0')}`,
            rj45: `RJ45-`, pcStatus: 'Ok', screen1: 'Ok', screen2: 'Ok',
            software: 'RAS', peripheral: 'RAS', observation: '',
            lastModified: new Date().toISOString()
        };
    }

    // --- Gestion des Données ---
    function saveData() {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(inventoryData));
        updateLastSaved();
    }

    function updateLastSaved() {
        const now = new Date();
        lastSavedEl.textContent = `Dernière sauvegarde: ${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR')}`;
    }

    function updateCellData(room, rowIndex, field, value) {
        inventoryData[room].items[rowIndex][field] = value;
        inventoryData[room].items[rowIndex].lastModified = new Date().toISOString();
        saveData();
    }

    // --- Affichage et UI ---
    function displayRoomData(room) {
        currentRoom = room;
        roomTitle.textContent = `État du matériel - Salle ${room}`;
        inventoryBody.innerHTML = '';

        const roomData = inventoryData[room];
        if (!roomData || !roomData.items) return;

        roomData.items.forEach((item, index) => {
            const row = document.createElement('tr');
            row.dataset.rowIndex = index;
            row.innerHTML = generateRowHTML(item);
            inventoryBody.appendChild(row);
            updateRowStyle(row);
        });

        populatePcCheckboxes(room);
        generalObservationTextarea.value = roomData.generalObservation || '';
        updateLastSaved();
    }

    function generateRowHTML(item) {
        return `
            <td>${item.pcNumber}</td>
            <td><input type="text" value="${item.rj45}" data-field="rj45"></td>
            ${createSelectCell(item.pcStatus, 'pcStatus', CONFIG.statuses.generic)}
            ${createSelectCell(item.screen1, 'screen1', CONFIG.statuses.generic)}
            ${createSelectCell(item.screen2, 'screen2', CONFIG.statuses.generic)}
            ${createSelectCell(item.software, 'software', CONFIG.statuses.software)}
            ${createSelectCell(item.peripheral, 'peripheral', CONFIG.statuses.peripheral)}
            <td><textarea data-field="observation">${item.observation}</textarea></td>
            <td><button class="btn btn-secondary" data-action="reset" aria-label="Réinitialiser la ligne">Réinitialiser</button></td>
        `;
    }

    function createSelectCell(value, field, options) {
        const isOk = value === 'Ok' || value === 'RAS';
        const cellClass = isOk ? 'status-ok' : 'status-problem';
        const optionsHTML = options.map(opt => `<option value="${opt}" ${opt === value ? 'selected' : ''}>${opt}</option>`).join('');
        return `<td class="${cellClass}"><select data-field="${field}">${optionsHTML}</select></td>`;
    }

    function updateRowStyle(rowElement) {
        const rowIndex = rowElement.dataset.rowIndex;
        const item = inventoryData[currentRoom].items[rowIndex];
        const hasProblem = item.pcStatus !== 'Ok' || item.screen1 !== 'Ok' || item.screen2 !== 'Ok' ||
                           item.software !== 'RAS' || item.peripheral !== 'RAS' || item.observation.trim() !== '';
        rowElement.classList.toggle('has-problem', hasProblem);
    }
    
    function showFeedback(message, isSuccess) {
        const feedbackDiv = document.getElementById('feedbackStatus');
        feedbackDiv.textContent = message;
        feedbackDiv.className = isSuccess ? 'success' : 'error';
        feedbackDiv.style.display = 'block';
        setTimeout(() => { feedbackDiv.style.display = 'none'; }, 4000);
    }

    // --- Gestion des Événements ---
    function setupEventListeners() {
        roomSelect.addEventListener('change', (e) => displayRoomData(e.target.value));
        
        pcCheckboxesContainer.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                filterTableRows();
            }
        });
        toggleAllPcsBtn.addEventListener('click', handleToggleAllPcs);

        inventoryBody.addEventListener('input', handleTableInput);
        inventoryBody.addEventListener('click', handleTableClick);
        reportButton.addEventListener('click', handleReportGeneration);
        closeModalButton.addEventListener('click', () => modal.style.display = "none");
        window.addEventListener('click', (e) => { if (e.target == modal) modal.style.display = "none"; });
        sendEmailButton.addEventListener('click', sendReportViaGmail);
        generalObservationTextarea.addEventListener('input', handleObservationChange);
        resetObservationBtn.addEventListener('click', handleResetObservation);
    }

    function filterTableRows() {
        const checkboxes = pcCheckboxesContainer.querySelectorAll('input[type="checkbox"]');
        const selectedIndices = new Set();
        let allSelected = true;

        checkboxes.forEach(cb => {
            if (cb.checked) {
                selectedIndices.add(cb.value);
            } else {
                allSelected = false;
            }
        });

        inventoryBody.querySelectorAll('tr').forEach(row => {
            const rowIndex = row.dataset.rowIndex;
            row.style.display = selectedIndices.has(rowIndex) ? '' : 'none';
        });

        toggleAllPcsBtn.textContent = allSelected ? 'Tout Désélectionner' : 'Tout Sélectionner';
    }

    function handleToggleAllPcs() {
        const checkboxes = pcCheckboxesContainer.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length === 0) return;

        const shouldSelectAll = Array.from(checkboxes).some(cb => !cb.checked);
        
        checkboxes.forEach(cb => {
            cb.checked = shouldSelectAll;
        });

        filterTableRows();
    }

    function handleTableInput(e) {
        const target = e.target;
        if (target.matches('select, input, textarea')) {
            const row = target.closest('tr');
            const rowIndex = row.dataset.rowIndex;
            const field = target.dataset.field;
            updateCellData(currentRoom, rowIndex, field, target.value);
            if (target.matches('select')) {
                const isOk = target.value === 'Ok' || target.value === 'RAS';
                target.parentElement.className = isOk ? 'status-ok' : 'status-problem';
            }
            updateRowStyle(row);
        }
    }

    function handleTableClick(e) {
        if (e.target.dataset.action === 'reset') {
            handleResetRow(e.target.closest('tr'));
        }
    }

    function handleResetRow(rowElement) {
        const rowIndex = parseInt(rowElement.dataset.rowIndex, 10);
        const defaultRowData = generateDefaultRow(currentRoom, rowIndex);
        inventoryData[currentRoom].items[rowIndex] = defaultRowData;
        saveData();
        rowElement.innerHTML = generateRowHTML(defaultRowData);
        updateRowStyle(rowElement);
        showFeedback(`La ligne pour le PC ${defaultRowData.pcNumber} a été réinitialisée.`, true);
    }

    function handleObservationChange(e) {
        inventoryData[currentRoom].generalObservation = e.target.value;
        saveData();
    }

    function handleResetObservation() {
        inventoryData[currentRoom].generalObservation = "";
        saveData();
        generalObservationTextarea.value = '';
        showFeedback("L'observation générale a été réinitialisée.", true);
    }

    // --- Génération de Rapport ---
    function handleReportGeneration() {
        const problems = findProblems(currentRoom);
        const generalObs = inventoryData[currentRoom].generalObservation.trim();

        if (problems.length === 0 && !generalObs) {
            showFeedback("Aucun problème ou observation à signaler.", true);
            return;
        }

        let body = `Bonjour,\n\nVoici le relevé pour la salle ${currentRoom} :\n\n`;
        
        if (problems.length > 0) {
            body += "PROBLÈMES SPÉCIFIQUES AUX POSTES :\n";
            problems.forEach((p) => {
                body += `-----------------------------------------\n`;
                body += `Ordinateur: ${p.pcNumber}\n`;
                body += `Date du signalement: ${new Date(p.lastModified).toLocaleString('fr-FR')}\n`;
                if (p.rj45 && p.rj45.trim() !== 'RJ45-') body += `N° Prise RJ45: ${p.rj45}\n`;
                body += `Détails:\n`;
                if (p.pcStatus !== 'Ok') body += `- État PC: ${p.pcStatus}\n`;
                if (p.screen1 !== 'Ok') body += `- Écran 1: ${p.screen1}\n`;
                if (p.screen2 !== 'Ok') body += `- Écran 2: ${p.screen2}\n`;
                if (p.software !== 'RAS') body += `- Logiciel: ${p.software}\n`;
                if (p.peripheral !== 'RAS') body += `- Périphérique: ${p.peripheral}\n`;
                if (p.observation) body += `- Observation: ${p.observation}\n`;
                body += `\n`;
            });
        }
        
        if (generalObs) {
            body += "\nOBSERVATION GÉNÉRALE POUR LA SALLE :\n";
            body += `-----------------------------------------\n`;
            body += `${generalObs}\n`;
        }

        body += "\nCordialement,\nL'équipe GCCE";
        
        document.getElementById('reportContent').textContent = body;
        modal.style.display = 'block';
    }

    function findProblems(room) {
        if (!inventoryData[room] || !inventoryData[room].items) return [];
        return inventoryData[room].items.filter(item => 
            item.pcStatus !== 'Ok' || item.screen1 !== 'Ok' || item.screen2 !== 'Ok' ||
            item.software !== 'RAS' || item.peripheral !== 'RAS' || item.observation.trim() !== ''
        );
    }

    function sendReportViaGmail() {
        const subject = encodeURIComponent(`Problème informatique Bât 13 - Salle ${currentRoom}`);
        const body = encodeURIComponent(document.getElementById('reportContent').textContent);
        const recipient = "prof.gcce1@gmail.com";
        
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${recipient}&su=${subject}&body=${body}`, '_blank');
        
        modal.style.display = "none";
        showFeedback("Ouverture de Gmail avec le rapport pré-rempli.", true);
    }



    function populateRoomSelector() {
        if(!roomSelect) return;
        CONFIG.rooms.forEach(room => {
            const option = document.createElement('option');
            option.value = room;
            option.textContent = `Salle ${room}`;
            roomSelect.appendChild(option);
        });
    }

    function populatePcCheckboxes(room) {
        pcCheckboxesContainer.innerHTML = '';
        if (!inventoryData[room] || !inventoryData[room].items) return;

        inventoryData[room].items.forEach((item, index) => {
            const wrapper = document.createElement('div');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `pc-check-${index}`;
            checkbox.value = index;
            checkbox.checked = false; // Modifié pour être décoché par défaut

            const label = document.createElement('label');
            label.htmlFor = `pc-check-${index}`;
            label.textContent = item.pcNumber;

            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);
            pcCheckboxesContainer.appendChild(wrapper);
        });
        
        filterTableRows();
    }

    // --- Démarrage de l'Application ---
    init();
});