# Python AI Backend (Version Finale Simplifiee)

Cette version est volontairement minimaliste:

- peu de fichiers
- separation nette des responsabilites
- aucune couche inutile
- logique lisible pour un projet de fin d'etudes

## Structure Finale

```text
python-ai/
  .env
  .env.example
  install_windows_tasks.ps1
  requirements.txt
  README.md
  app/
    db/
      mongo.py
    gsm/
      service.py
    maintenance/
      dataset.py
      predictor.py
      scheduler.py
      service.py
      trainer.py
    shared/
      config.py
  scripts/
    build_dataset.py
    train_model.py
    run_maintenance_inference.py
    run_gsm_supervisor.py
    run_retraining_scheduler.py
    predict_payload.py
  data/
    lstm_dataset.csv
    lstm_dataset.metadata.json
  models/
    maintenance_lstm.h5
    lstm_preprocessor.json
    lstm_training_metrics.json
    lstm_training_curves.png
    lstm_confusion_matrix.png
  runtime/
    audio/
    logs/
```

## Roles des Fichiers (Titre + Explication)

### Configuration et partage

- `app/shared/config.py`
  - Titre: **Configuration et Utilitaires Partages**
  - Ce que ca fait: charge `.env`, expose les constantes metier et la configuration globale.
  - Pourquoi utile: un seul endroit pour la config et les helpers, donc moins de duplication.

### Base de donnees

- `app/db/mongo.py`
  - Titre: **Connecteur MongoDB**
  - Ce que ca fait: cree la connexion MongoDB et retourne la base active.
  - Pourquoi utile: la logique DB est centralisee et reutilisable.

### Maintenance (IA / LSTM)

- `app/maintenance/dataset.py`
  - Titre: **Construction Dataset Maintenance**
  - Ce que ca fait: extrait les donnees capteurs et genere le CSV d'apprentissage.
  - Pourquoi utile: separer preparation des donnees et entrainement simplifie le pipeline.

- `app/maintenance/trainer.py`
  - Titre: **Entrainement LSTM Maintenance**
  - Ce que ca fait: prepare les sequences, gere l'equilibrage synthetique et entraine le modele.
  - Pourquoi utile: la chaine d'entrainement reste isolee du runtime.

- `app/maintenance/predictor.py`
  - Titre: **Predicteur LSTM**
  - Ce que ca fait: charge le modele/preprocessor et calcule label + probabilites.
  - Pourquoi utile: reutilisable par le service MQTT et par le CLI.

- `app/maintenance/service.py`
  - Titre: **Service Maintenance Temps Reel**
  - Ce que ca fait: consomme MQTT, applique l'inference, cree alertes/rapports MongoDB.
  - Pourquoi utile: runtime IA clair, direct, et facile a presenter.

- `app/maintenance/scheduler.py`
  - Titre: **Planificateur Re-entrainement**
  - Ce que ca fait: lance periodiquement `build_dataset` puis `train_model`.
  - Pourquoi utile: maintient automatiquement le modele a jour.

### GSM

- `app/gsm/service.py`
  - Titre: **Service GSM Unifie**
  - Ce que ca fait: recupere les alertes, genere le TTS et publie les appels via MQTT.
  - Pourquoi utile: toute la logique GSM est dans un seul module lisible.

### Scripts d'entree

- `scripts/build_dataset.py`: lance la generation du dataset.
- `scripts/train_model.py`: lance l'entrainement du modele.
- `scripts/run_maintenance_inference.py`: lance le service IA temps reel.
- `scripts/run_gsm_supervisor.py`: lance le superviseur GSM.
- `scripts/run_retraining_scheduler.py`: lance la boucle de re-entrainement.
- `scripts/predict_payload.py`: test rapide d'inference par JSON.

## Commandes Utiles

```bash
python -m pip install -r python-ai/requirements.txt

python python-ai/scripts/build_dataset.py
python python-ai/scripts/train_model.py
python python-ai/scripts/run_maintenance_inference.py
python python-ai/scripts/run_gsm_supervisor.py
python python-ai/scripts/run_retraining_scheduler.py
python python-ai/scripts/predict_payload.py --machine-id M1 --input-json "{\"vibX\":0.3,\"vibY\":0.2,\"vibZ\":0.1,\"courant\":8.5,\"rpm\":1400,\"pression\":6.2}"
```

