"""Tests pour le handler de fichier rotatif de logs."""
import builtins
import json
import pytest
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from api.utils.log_file_handler import DateRotatingFileHandler


@pytest.fixture
def tmp_log_dir(tmp_path):
    """Crée un dossier temporaire pour les logs."""
    log_dir = tmp_path / "logs"
    log_dir.mkdir()
    return log_dir


@pytest.fixture
def handler(tmp_log_dir):
    """Crée un handler de test."""
    handler = DateRotatingFileHandler(
        log_dir=str(tmp_log_dir),
        retention_days=30,
        max_file_size_mb=1  # 1MB pour les tests
    )
    yield handler
    handler.close()


def test_handler_creates_file(handler, tmp_log_dir):
    """Teste que le handler crée un fichier de log."""
    logger = logging.getLogger("test")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    
    logger.info("Test message")
    handler.flush()
    
    # Vérifier qu'un fichier a été créé
    today = date.today()
    expected_file = tmp_log_dir / f"logs_{today.isoformat()}.json"
    assert expected_file.exists()
    
    # Vérifier le contenu
    with open(expected_file, 'r', encoding='utf-8') as f:
        logs = json.load(f)
        assert len(logs) == 1
        assert logs[0]["message"] == "Test message"
        assert logs[0]["level"] == "INFO"


def test_handler_rotates_by_date(handler, tmp_log_dir):
    """Teste que le handler fait une rotation au changement de jour."""
    logger = logging.getLogger("test")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    
    # Écrire un log aujourd'hui
    logger.info("Log today")
    handler.flush()
    
    # Vérifier qu'un fichier a été créé pour aujourd'hui
    today = date.today()
    today_file = tmp_log_dir / f"logs_{today.isoformat()}.json"
    assert today_file.exists()
    
    # Simuler le jour suivant en modifiant directement current_date du handler
    # puis en appelant _rotate_if_needed qui détectera le changement
    yesterday = today - timedelta(days=1)
    handler.current_date = yesterday  # Simuler qu'on était hier
    handler._rotate_if_needed()  # Devrait détecter le changement vers today et créer un nouveau fichier
    
    # Écrire un autre log (qui devrait utiliser le fichier d'aujourd'hui)
    logger.info("Log after rotation")
    handler.flush()
    
    # Vérifier que le fichier d'aujourd'hui existe toujours
    assert today_file.exists()
    
    # Le test vérifie que _rotate_if_needed gère correctement le changement de date
    # En pratique, la rotation se fait automatiquement au changement réel de jour


def test_handler_handles_corrupted_file(handler, tmp_log_dir):
    """Teste que le handler gère les fichiers corrompus."""
    today = date.today()
    log_file = tmp_log_dir / f"logs_{today.isoformat()}.json"
    
    # Créer un fichier corrompu
    with open(log_file, 'w', encoding='utf-8') as f:
        f.write("invalid json{")
    
    logger = logging.getLogger("test")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    
    # Le handler devrait recréer le fichier
    logger.info("Test message")
    handler.flush()
    
    # Vérifier que le fichier est valide maintenant
    with open(log_file, 'r', encoding='utf-8') as f:
        logs = json.load(f)
        assert len(logs) == 1


def test_handler_cleanup_old_files(handler, tmp_log_dir):
    """Teste la suppression des fichiers anciens."""
    # Créer des fichiers de logs pour différentes dates
    old_date = date.today() - timedelta(days=35)
    recent_date = date.today() - timedelta(days=5)
    
    old_file = tmp_log_dir / f"logs_{old_date.isoformat()}.json"
    recent_file = tmp_log_dir / f"logs_{recent_date.isoformat()}.json"
    
    # Créer les fichiers
    with open(old_file, 'w', encoding='utf-8') as f:
        json.dump([{"message": "old"}], f)
    with open(recent_file, 'w', encoding='utf-8') as f:
        json.dump([{"message": "recent"}], f)
    
    # Nettoyer avec rétention de 30 jours
    deleted_count = handler.cleanup_old_files()
    
    # Vérifier que seul le fichier ancien a été supprimé
    assert deleted_count == 1
    assert not old_file.exists()
    assert recent_file.exists()


def test_handler_enriches_log_context(handler, tmp_log_dir):
    """Teste que le handler enrichit les logs avec le contexte."""
    logger = logging.getLogger("test")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    
    # Créer un record avec contexte
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=42,
        msg="Test message",
        args=(),
        exc_info=None
    )
    record.request_id = "req123"
    record.endpoint = "/api/test"
    record.method = "GET"
    
    handler.emit(record)
    handler.flush()
    
    # Vérifier le contenu
    today = date.today()
    log_file = tmp_log_dir / f"logs_{today.isoformat()}.json"
    with open(log_file, 'r', encoding='utf-8') as f:
        logs = json.load(f)
        assert logs[0]["request_id"] == "req123"
        assert logs[0]["endpoint"] == "/api/test"
        assert logs[0]["method"] == "GET"

def test_append_does_not_rewrite_whole_file(handler, tmp_log_dir):
    """L'ajout d'une entrée ne relit ni ne réécrit le tableau entier.

    Régression : `_append_log_entry` relisait tout le fichier, le parsait, puis le
    réécrivait à chaque enregistrement. Le coût d'une session devenait quadratique —
    la CI backend a dépassé son plafond d'une heure trente alors que la même suite
    tourne en quatre minutes en local.

    On compte les octets qui transitent par le fichier de log, quel que soit le
    descripteur employé : sonder le seul `_file_handle` laisserait passer une
    régression qui rouvrirait le fichier à côté. Le chronomètre est évité, il
    rendrait le test sensible à la charge de la machine.
    """
    logger = logging.getLogger("test_append_cost")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)

    for i in range(200):
        logger.info("entrée de garnissage numéro %d", i)
    handler.flush()

    log_path = tmp_log_dir / f"logs_{date.today().isoformat()}.json"
    assert log_path.stat().st_size > 10_000, "le fichier doit peser assez pour qu'une relecture se voie"

    volume = [0]
    real_open = builtins.open

    class _CountingFile:
        """Compte ce qui passe en lecture et en écriture, délègue le reste."""

        def __init__(self, inner):
            self._inner = inner

        def read(self, *args):
            chunk = self._inner.read(*args)
            volume[0] += len(chunk)
            return chunk

        def write(self, data):
            volume[0] += len(data)
            return self._inner.write(data)

        def __getattr__(self, name):
            return getattr(self._inner, name)

        def __enter__(self):
            self._inner.__enter__()
            return self

        def __exit__(self, *args):
            return self._inner.__exit__(*args)

    def counting_open(file, *args, **kwargs):
        handle = real_open(file, *args, **kwargs)
        return _CountingFile(handle) if str(file) == str(log_path) else handle

    with patch("builtins.open", counting_open):
        logger.info("entrée mesurée")
        handler.flush()

    assert volume[0] < 1024, (
        f"{volume[0]} octets transférés pour un seul ajout : le fichier entier est "
        "relu ou réécrit, le coût d'une session redevient quadratique"
    )

    with open(log_path, "r", encoding="utf-8") as f:
        logs = json.load(f)
    assert len(logs) == 201
    assert logs[-1]["message"] == "entrée mesurée"


def test_un_saut_de_ligne_final_nefface_pas_la_journee(handler, tmp_log_dir):
    """Du whitespace en fin de fichier ne doit pas être pris pour une corruption.

    Régression : l'épissure cherchait le « ] » sur le tout dernier octet. Ouvrir
    `data/logs/*.json` dans un éditeur pour déboguer — ce que la règle meta-agent
    demande explicitement de faire — y laisse un saut de ligne final. Le prochain log
    émis repartait alors d'un tableau vide et effaçait toute la journée, sans le
    moindre avertissement.
    """
    logger = logging.getLogger("test_trailing_ws")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)

    for i in range(5):
        logger.info("entrée %d", i)
    handler.flush()

    log_path = tmp_log_dir / f"logs_{date.today().isoformat()}.json"
    with open(log_path, "ab") as f:
        f.write(b"\n")

    logger.info("entrée après le saut de ligne")
    handler.flush()

    with open(log_path, "r", encoding="utf-8") as f:
        logs = json.load(f)

    assert len(logs) == 6, "les entrées précédentes ont été effacées"
    assert logs[0]["message"] == "entrée 0"
    assert logs[-1]["message"] == "entrée après le saut de ligne"


def test_un_tableau_vraiment_corrompu_est_signale(handler, tmp_log_dir, caplog):
    """Repartir de zéro reste possible, mais ne doit plus être silencieux."""
    logger = logging.getLogger("test_corrompu")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)

    logger.info("première entrée")
    handler.flush()

    log_path = tmp_log_dir / f"logs_{date.today().isoformat()}.json"
    with open(log_path, "wb") as f:
        f.write(b'[{"message": "tronqu')

    with caplog.at_level(logging.WARNING):
        logger.info("après la troncature")
        handler.flush()

    with open(log_path, "r", encoding="utf-8") as f:
        logs = json.load(f)
    assert len(logs) == 1

    assert any("non refermé" in message for message in caplog.messages), (
        "la réinitialisation doit laisser une trace : une perte silencieuse est indétectable"
    )
