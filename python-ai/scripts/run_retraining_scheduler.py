"""
Titre: Script Scheduler Re-entrainement
Explication: Lance la boucle periodique qui re-entraine seulement si la croissance des donnees depasse le seuil configure.
Utilite: Automatise la maintenance du modele sans re-entrainer a chaque mise a jour.
"""

import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.maintenance.scheduler import main


if __name__ == "__main__":
    main()
