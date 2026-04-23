"""
Titre: Script Service Inference Maintenance
Explication: Demarre le service MQTT de prediction maintenance en temps reel.
Utilite: Entree unique et explicite pour la partie IA en production.
"""

import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.maintenance.service import main


if __name__ == "__main__":
    main()
