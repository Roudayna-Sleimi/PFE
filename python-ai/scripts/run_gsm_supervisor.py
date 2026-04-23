"""
Titre: Script Service Superviseur GSM
Explication: Demarre le processus de notification vocale et de mise en file d'appels.
Utilite: Separe clairement l'execution GSM de l'execution IA maintenance.
"""

import sys
from pathlib import Path

PYTHON_AI_DIR = Path(__file__).resolve().parents[1]
if str(PYTHON_AI_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_AI_DIR))

from app.gsm.service import main


if __name__ == "__main__":
    main()
