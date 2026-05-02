"""
Titre: Script Service Inference Maintenance
Explication: Demarre le service MQTT LSTM qui consomme les capteurs et publie les predictions vers le backend.
Utilite: Entree unique et explicite pour la partie IA en production (voie de prediction principale).
"""

import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.maintenance.service import main


if __name__ == "__main__":
    main()
