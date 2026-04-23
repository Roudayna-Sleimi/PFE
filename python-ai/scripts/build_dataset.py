"""
Titre: Script Build Dataset Maintenance
Explication: Lance la construction du CSV d'apprentissage depuis MongoDB.
Utilite: Point d'entree lisible pour les demonstrations et les automatisations.
"""

import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.maintenance.dataset import main


if __name__ == "__main__":
    main()
