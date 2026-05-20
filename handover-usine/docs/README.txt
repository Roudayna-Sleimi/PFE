CNC Pulse Dashboard - Livraison Usine

Contenu de ce dossier
- installer/CNC Pulse Dashboard Setup 0.0.0.exe
- mongodb/ : mettre ici l'installateur MongoDB si necessaire
- backup/ : mettre ici un backup MongoDB si vous voulez livrer les memes donnees/utilisateurs

Installation sur le PC de l'usine
1. Installer MongoDB si elle n'est pas deja installee.
2. Verifier que le service MongoDB est demarre.
3. Installer l'application avec :
   CNC Pulse Dashboard Setup 0.0.0.exe
4. Ouvrir l'application.
5. Au premier demarrage, choisir le dossier reel des fichiers de l'usine.
6. Utiliser l'application normalement.

Remarques
- Le choix du dossier est demande au premier lancement puis memorise automatiquement.
- Si le dossier change plus tard, relancer l'application apres suppression du fichier watch-settings.json du profil utilisateur.
- Si vous voulez livrer les memes comptes et donnees que sur le PC de developpement, ajoutez un backup MongoDB dans le dossier backup/.
