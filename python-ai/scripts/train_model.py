"""
Titre: Script Entrainement Modele
Explication: Lance l'entrainement LSTM avec les options d'environnement.
Utilite: Facilite un workflow clair: dataset -> train -> inference.
"""

import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.maintenance.trainer import main


if __name__ == "__main__":
    main()

