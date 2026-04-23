"""
Titre: Script Scheduler Re-entrainement
Explication: Lance la boucle periodique qui reconstruit le dataset puis re-entraine le modele.
Utilite: Automatise la maintenance du modele avec un point d'entree explicite.
"""

import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.maintenance.scheduler import main


if __name__ == "__main__":
    main()
