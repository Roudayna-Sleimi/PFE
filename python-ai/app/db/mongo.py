"""
Titre: Connecteur MongoDB
Explication: Ce module cree les connexions MongoDB et retourne la base applicative.
Utilite: Centralise l'acces base de donnees pour eviter des initialisations eparpillees.
"""

from pymongo import MongoClient

from app.shared.config import AppSettings, load_settings


def create_client(settings: AppSettings | None = None) -> MongoClient:
    config = settings or load_settings()
    return MongoClient(config.mongo.uri)


def get_database(settings: AppSettings | None = None):
    config = settings or load_settings()
    client = create_client(config)
    return client[config.mongo.db_name]
