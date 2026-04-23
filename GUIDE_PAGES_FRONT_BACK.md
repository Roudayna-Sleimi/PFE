# CNC Pulse - Guide complet des pages (front + backend + liaisons)

## 1) Vue globale du projet

- Frontend: React + TypeScript (Vite), code principal dans `src/`.
- Backend: Express + MongoDB (Mongoose), entree dans `backend/server.js`.
- Temps reel: Socket.IO (dashboard, production, employe, messaging, maintenance, machines).
- IoT: MQTT (capteurs et retours GSM).
- Dossiers fichiers: watcher auto (`backend/dossierWatcher.js`) qui indexe un dossier disque vers MongoDB.
- IA maintenance + GSM (optionnel): scripts Python dans `python-ai/`.

Architecture simplifiee:

```text
Frontend React
   |  HTTP (fetch + JWT)
   v
Backend Express (routes/controllers/services)
   |  Mongo (Mongoose models)
   v
MongoDB

ESP32/MQTT ---> Backend (topic sensors) ---> Socket.IO ---> Front (live)
Python supervisor GSM <--- Mongo alerts ---> MQTT gsm/call ---> GSM provider
```

## 2) Routing front (pages visibles)

Routes principales (`src/App.tsx`):

- `/` -> `Login`
- `/dashboard` -> `Dashboard` (apres login)
- `/employe` -> `EmployePage` (role employe)
- `/production` -> `ProductionPage` (route directe, aussi incluse dans Dashboard)

Sous-pages internes dans `Dashboard` (`activePage`):

- `dashboard` (vue KPI + charts + live sensors)
- `production` (`ProductionPage`)
- `employes` (vue admin integree dans Dashboard)
- `machines` (`MachinesPage`)
- `maintenance` (`MaintenancePage`)
- `gsm` (`GsmContactsPage`)
- `rapports` (`ReportsPage`)
- `demandes` (`DemandesPage`)
- overlay messagerie (`MessagingPage`)

## 3) Backend: modules de routes

Routes enregistrees dans `backend/server.js`:

- `/api/auth` -> `authRoutes`
- `/api` -> `workforceRoutes`
- `/api` -> `taskMessageRoutes`
- `/api` -> `monitoringRoutes`
- `/api` -> `pieceRoutes`
- `/api/machines` -> `machineRoutes`
- `/api` -> `dossierRoutes`

Middlewares:

- `authMiddleware`: JWT obligatoire (sauf login/register et creation demande publique).
- `adminMiddleware`: endpoints reserves admin.
- `serviceKeyMiddleware`: endpoints reserves services IA/GSM.

## 4) Page par page: front + backend + data

## 4.1 Login (`src/components/Login.tsx`)

Ce que fait la page:

- Form login (username/password).
- Form "demande d acces" (nom/email/poste/telephone).
- Sauvegarde `token`, `username`, `role` dans `localStorage`.
- Redirection:
- employe -> `/employe`
- admin/user -> `/dashboard`

APIs utilisees:

- `POST /api/auth/login`
- controller: `authController.login`
- service: `authService.loginUser`
- model: `User`
- `POST /api/demandes`
- controller: `workforceController.createDemande`
- service: `workforceService.createDemande`
- model: `Demande`

## 4.2 Dashboard principal (`src/components/Dashboard.tsx`)

Ce que fait la page:

- Sert de hub visuel + navigation laterale.
- Affiche KPI, production journaliere, repartition machine, temps machine, alertes live, activite employes.
- Gere recherche globale interne entre pages/employes/machines actives.
- Gere overlay `MessagingPage`.

APIs utilisees:

- `GET /api/machines`
- `GET /api/pieces`
- `GET /api/admin/employes-overview` (admin)
- `GET /api/dashboard/stats`
- `GET /api/admin/employes/:username/historique` (quand on ouvre detail employe)

Socket.IO utilise:

- emet: `user-online`
- ecoute: `connect`, `disconnect`, `sensor-data`, `alert`, `direct-message`, `employee-machine-updated`, `user-status`, `dashboard-refresh`

Models touches cote backend:

- `Piece`, `MachineEvent`, `User`, `Alert`, `Machine`

## 4.3 Dashboard > Production (`src/components/ProductionPage.tsx`)

Ce que fait la page:

- 2 onglets:
- `production` (gestion des pieces)
- `clients` (embed `DossierPage`)
- Liste pieces avec filtres, recherche, statut visible (en cours via etat employes), progression quantite.
- Creation piece (admin) avec contexte dossier (documents lies, plan/cad).
- Gestion chaine machine (`machineChain`) et progression vers machine suivante.
- Edition details piece (ref, quantite, dimension, matiere type/reference).
- Preview/telechargement document de plan.

APIs utilisees:

- `GET /api/users`
- `GET /api/admin/employes-overview`
- `GET /api/pieces`
- `POST /api/pieces` (admin)
- `PATCH /api/pieces/:id`
- `POST /api/pieces/:id/progress`
- `GET /api/machines`
- `GET /api/dossiers`
- `GET /api/dossiers/piece-names`
- `GET /api/dossiers/:id/download`

Socket.IO:

- ecoute: `piece-progressed`, `employee-machine-updated`, `dashboard-refresh`

Backend/services concernes:

- `pieceService` (`listPieces`, `createPiece`, `patchPiece`, `progressPiece`)
- `workforceService` (`listUsers`, `employesOverview`)
- `dossierService` (`listDossiers`, `listPieceNames`, `dossierDownloadMeta`)
- `machineService` (`listMachines`)

Models touches:

- `Piece`, `User`, `Dossier`, `Machine`

## 4.4 Dashboard > Employes (bloc interne dans `Dashboard.tsx`)

Ce que fait la page:

- Vue admin des employes: statut machine, piece courante, online/offline.
- Cartes stats globales (en production, en pause, en ligne, total).
- Detail historique d un employe: timeline events + stats jour.

APIs utilisees:

- `GET /api/admin/employes-overview`
- `GET /api/admin/employes/:username/historique`

Socket.IO:

- les mises a jour arrivent via listeners du Dashboard parent (`employee-machine-updated`, `user-status`, `dashboard-refresh`).

Backend/services:

- `workforceService.employesOverview`
- `workforceService.employeHistory`

Models touches:

- `User`, `MachineEvent`, `Piece`

## 4.5 Dashboard > Machines (`src/components/MachinesPage.tsx`)

Ce que fait la page:

- Liste machines avec recherche, stats machine (prod, efficacite, heures).
- Refresh periodique + refresh event-driven.
- CRUD machine custom (admin): ajout, edition, suppression.
- Ouvre `MachineDetail` sur selection.
- Injecte capteurs live (`sensor-data`) pour rectifieuse/compresseur.

APIs utilisees:

- `GET /api/machines`
- `POST /api/machines` (admin)
- `PATCH /api/machines/:id` (admin)
- `DELETE /api/machines/:id` (admin)

Socket.IO:

- ecoute: `dashboard-refresh`, `employee-machine-updated`, `piece-progressed`, `sensor-data`

Backend/services:

- `machineService.listMachines/createMachine/updateMachine/deleteMachine`
- listMachines fusionne:
- catalogue de base
- machines custom DB
- machines derivees depuis noms trouves dans pieces/users
- - calcul metriques depuis `MachineEvent` + `Piece`

Models touches:

- `Machine`, `MachineEvent`, `Piece`, `User`

## 4.6 Machine detail (`src/components/MachineDetail.tsx`)

Ce que fait la page:

- Tabs dynamiques: capteurs/fonctions/pieces/alertes/historique selon machine.
- Pour machines live (rectifieuse/compresseur): affichage capteurs en temps reel.
- Gestion alertes de cette machine (mark seen, resolve).
- Liste pieces de la machine + statut effectif.

APIs utilisees:

- `GET /api/alerts?limit=50`
- `PATCH /api/alerts/:id/seen`
- `PATCH /api/alerts/:id/resolve`
- `GET /api/pieces?machine=...`
- `GET /api/admin/employes-overview`

Socket.IO:

- ecoute: `sensor-data`, `employee-machine-updated`

Models touches:

- `Alert`, `Piece`, `User`, `SensorData`

## 4.7 Dashboard > Maintenance AI (`src/components/MaintenancePage.tsx`)

Ce que fait la page:

- Vue predictive maintenance par machine.
- Affiche severite, anomaly score, prediction, action recommandee.
- Affiche rapports et demandes maintenance.
- Permet lancer analyse manuelle machine.
- Permet changer statut demande maintenance (`open/in_progress/done/cancelled`).

APIs utilisees:

- `GET /api/maintenance/overview`
- `POST /api/maintenance/analyze`
- `PATCH /api/maintenance/requests/:id`

Socket.IO:

- ecoute: `maintenance-report`, `maintenance-request`

Backend/services:

- `monitoringService.maintenanceOverview`
- `monitoringService.maintenanceAnalyze`
- `monitoringService.patchMaintenanceRequest`
- creation automatique report/request via `createMaintenanceCase` (dans `server.js`)

Models touches:

- `MaintenanceReport`, `MaintenanceRequest`, `Alert`, `SensorData`, `Machine`

## 4.8 Dashboard > GSM (`src/components/GsmContactsPage.tsx`)

Ce que fait la page:

- Gestion contacts GSM (admin): ajouter/editer/activer/desactiver.
- Historique appels GSM associes aux alertes.
- Bouton creation "alerte test GSM".

APIs utilisees:

- `GET /api/contacts`
- `POST /api/contacts` (admin)
- `PATCH /api/contacts/:id` (admin)
- `GET /api/alerts?limit=25`
- `GET /api/call-logs/:alertId`
- `POST /api/alerts` (test manuel)

Backend/services:

- `monitoringService.listContacts/createContact/patchContact`
- `monitoringService.listAlerts`
- `monitoringService.listCallLogs`
- `monitoringService.createAlert`

Models touches:

- `Contact`, `Alert`, `CallLog`

## 4.9 Dashboard > Rapports (`src/components/ReportsPage.tsx`)

Ce que fait la page:

- Page admin uniquement.
- Resume production: energie, pieces produites, temps usinage, anomalies.
- Tables:
- rapport par machine
- rapport par employe
- journal recent d actions machine

APIs utilisees:

- `GET /api/reports/overview` (admin)

Backend/services:

- `workforceService.reportsOverview`
- agregations depuis `Piece`, `MachineEvent`, `Alert`, `User`

Models touches:

- `Piece`, `MachineEvent`, `Alert`, `User`

## 4.10 Dashboard > Demandes (`src/components/Demandespage.tsx`)

Ce que fait la page:

- Gestion admin des demandes d acces.
- Liste demandes en attente/traitees.
- Modifier/supprimer/refuser une demande.
- Approuver une demande et creer compte employe.

APIs utilisees:

- `GET /api/demandes` (admin)
- `PATCH /api/demandes/:id` (admin)
- `DELETE /api/demandes/:id` (admin)
- `POST /api/demandes/:id/refuser` (admin)
- `POST /api/demandes/:id/approuver` (admin)

Backend/services:

- `workforceService.listDemandes/updateDemande/deleteDemande/refuseDemande/approveDemande`

Models touches:

- `Demande`, `User`

## 4.11 Dashboard overlay messaging (`src/components/Messagingpage.tsx`)

Ce que fait la page:

- DM entre utilisateurs.
- Liste utilisateurs + statut online + unread counts.
- Ouverture conversation, envoi message, marquage lu.

APIs utilisees:

- `GET /api/users`
- `GET /api/messages/unread/counts`
- `GET /api/messages/:targetUsername`

Socket.IO:

- emet: `send-direct-message`, `mark-read`
- ecoute: `direct-message`, `user-status`, `messages-read`

Backend/services:

- `workforceService.listUsers`
- `taskMessageService.listConversation/unreadCounts`
- socket handlers dans `server.js` pour envoi direct et read ack

Models touches:

- `User`, `DirectMessage`

## 4.12 Espace employe (`/employe`, `src/components/EmployePage.tsx`)

Ce que fait la page:

- Workflow en 3 etapes:
- choisir piece
- choisir machine
- session production (start/pause/resume/stop)
- Timer session + quantite produite + quantite ruban.
- Edition piece cote employe (champs autorises).
- Preview plan de fabrication (image/pdf/cad linked dossier).
- Messagerie rapide vers admin.

APIs utilisees:

- `GET /api/machines`
- `GET /api/pieces`
- `GET /api/messages/admin` (via endpoint conversation dynamique)
- `GET /api/dossiers`
- `GET /api/employe/me/dashboard`
- `PATCH /api/pieces/:id` (edition employe limitee)
- `POST /api/employe/machine/action` (started/paused/stopped)
- `GET /api/dossiers/:id/download` (plan lie)

Socket.IO:

- emet: `user-online`, `send-direct-message`
- ecoute: `direct-message`, `employee-machine-updated`, `piece-progressed`

Backend/services:

- `workforceService.employeDashboard`
- `workforceService.employeMachineAction`
- `pieceService.patchPiece` (controle permissions employe/admin)
- `taskMessageService.listConversation`

Models touches:

- `User`, `Piece`, `MachineEvent`, `DirectMessage`, `Dossier`

## 4.13 Dossier page reusable (`src/components/DossierPage.tsx`)

Ce que fait la page:

- Vue arborescente client -> projet -> piece -> documents.
- Filtres (search/client/project/piece).
- Mode list ou icones.
- Ouverture document (preview image/pdf ou telechargement cad/autres).
- Affiche statut watcher backend + bouton rescan (admin).
- Peut remonter un contexte "Add piece from dossier" vers `ProductionPage`.

APIs utilisees:

- `GET /api/dossiers`
- `GET /api/dossiers/clients`
- `GET /api/dossiers/projects`
- `GET /api/dossiers/watcher-status`
- `POST /api/dossiers/rescan` (admin)
- `GET /api/dossiers/:id/download`

Backend/services:

- `dossierService.listDossiers/listClients/listProjects/watcherStatus/rescan/dossierDownloadMeta`

Models touches:

- `Dossier`

## 4.14 Alertes page reusable (`src/components/AlertesPage.tsx`)

Ce que fait la page:

- Liste alertes live (filtre severite/statut).
- Resolve alert.
- Lecture audio GSM depuis call logs (`audioBase64`).

APIs utilisees:

- `GET /api/alerts?limit=50`
- `PATCH /api/alerts/:id/resolve`
- `GET /api/call-logs/:alertId`

Socket.IO:

- ecoute: `alert`

Models touches:

- `Alert`, `CallLog`

## 5) Flux metier bout en bout (comment tout est relie)

## 5.1 Login + role routing

1. User submit login.
2. `POST /api/auth/login` valide `User` + password hash.
3. Backend retourne JWT + role.
4. Front stocke token et redirige vers `/dashboard` ou `/employe`.

## 5.2 Demande d acces

1. Candidat envoie form demande (`POST /api/demandes`).
2. Admin ouvre `DemandesPage` (`GET /api/demandes`).
3. Admin approuve (`POST /api/demandes/:id/approuver`) -> creation `User` role employe.
4. Demande passe `approuvee` ou `refusee`.

## 5.3 Production piece (admin + employe)

1. Admin cree piece dans `ProductionPage` (souvent depuis contexte dossier).
2. Piece en DB avec machine principale + eventuelle `machineChain`.
3. Employe lance session (`POST /api/employe/machine/action` with `started`).
4. Backend met a jour `User` + `Piece` + cree `MachineEvent`.
5. Backend emet `employee-machine-updated`, `piece-progressed`, `dashboard-refresh`.
6. Fronts (Dashboard/Production/Machines/Employe) se resynchronisent en live.
7. En `stopped`, backend incremente `quantiteProduite` et `quantiteRuban`, cloture etape, peut passer piece `Termine`.

## 5.4 Dossiers et plans

1. Watcher backend surveille `DOSSIER_WATCH_DIR`.
2. Chaque fichier est mappe vers metadata client/projet/piece et upsert dans `Dossier`.
3. Front Dossier/Production/Employe lit les documents via API.
4. Plan piece peut etre lie automatiquement et affiche en preview (image/pdf) ou telecharge (cad/autre).

## 5.5 Alertes capteurs -> maintenance -> GSM

1. MQTT capteurs (`cncpulse/sensors`) arrive au backend.
2. Backend sauvegarde `SensorData` + emet `sensor-data`.
3. Si seuil depasse: creation `Alert` + emit `alert`.
4. Evaluation maintenance:

- soit backend rules (`assessMaintenanceRisk` dans `server.js`)
- soit service Python `lstm_inference_service.py` (si active)

5. Si risque: creation `MaintenanceReport` + `MaintenanceRequest` + emits maintenance events.
6. Supervisor GSM Python lit alertes non vues, choisit contact actif, publie demande d appel MQTT.
7. Retour GSM (`cncpulse/gsm/result`) recu par backend -> update `CallLog`/`Alert` + emit `gsm-result`.
8. `GsmContactsPage` et `AlertesPage` recuperent l historique via API.

## 5.6 Messagerie temps reel

1. Client signale presence via `user-online`.
2. Backend met `User.isOnline` + diffuse `user-status`.
3. Envoi DM via socket `send-direct-message`.
4. Historique lecture via `GET /api/messages/:targetUsername`.
5. Marquage lu via `mark-read` + event `messages-read`.

## 6) Models MongoDB principaux

- `User`: auth + role + presence + machine/piece courante.
- `Demande`: demandes d acces.
- `Piece`: production, chaines machines, quantites, matiere, plan, taches.
- `MachineEvent`: historique started/paused/stopped.
- `Machine`: catalogue base + custom + metriques.
- `SensorData`: mesures IoT.
- `Alert`: alertes warning/critical + cycle new/seen/notified/resolved.
- `Contact`: contact GSM actif.
- `CallLog`: tentative appel GSM + audio.
- `MaintenanceReport`: diagnostic IA.
- `MaintenanceRequest`: ticket maintenance issu des rapports.
- `Dossier`: metadata documents clients/projets/pieces.
- `DirectMessage`: DM internes.
- `Task`: taches.
- `Message`: chat global court (TTL 24h).

## 7) Fichiers pivots a connaitre

- Front routing: `src/App.tsx`
- Dashboard hub: `src/components/Dashboard.tsx`
- Production: `src/components/ProductionPage.tsx`
- Employe: `src/components/EmployePage.tsx`
- Machines: `src/components/MachinesPage.tsx`
- Machine detail: `src/components/MachineDetail.tsx`
- Maintenance: `src/components/MaintenancePage.tsx`
- GSM: `src/components/GsmContactsPage.tsx`
- Rapports: `src/components/ReportsPage.tsx`
- Dossiers: `src/components/DossierPage.tsx`
- Backend bootstrap + socket + mqtt: `backend/server.js`
- Routes API: `backend/routes/*.js`
- Metier API: `backend/services/*.js`
- Watcher dossiers: `backend/dossierWatcher.js`
- Services Python IA/GSM: `python-ai/*.py`

## 8) Remarques importantes

- Le token JWT est central pour presque toutes les routes.
- Les roles sont critiques:
- admin: demandes, rapports, create piece, CRUD machines/contacts, rescan dossiers.
- employe: workflow production + edition piece limitee.
- Le temps reel repose sur des events Socket.IO, pas seulement sur des refresh HTTP.
- Le module dossier est base sur indexation disque automatique, pas seulement sur upload manuel.
- Le module maintenance existe en double logique:
- backend rules Node (`server.js` + `monitoringService`)
- scripts Python (optionnels selon deploiement).
