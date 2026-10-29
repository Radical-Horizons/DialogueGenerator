"""Tests pour le nettoyage des logs."""
import pytest
from pathlib import Path
from datetime import date, timedelta
from api.utils.log_cleanup import cleanup_old_logs, cleanup_on_startup


class TestLogCleanup:
    """Tests pour le nettoyage des logs."""
    
    def test_cleanup_old_logs_no_directory(self, tmp_path):
        """Test de nettoyage avec dossier inexistant."""
        result = cleanup_old_logs(retention_days=30, log_dir=str(tmp_path / "nonexistent"))
        
        assert result == 0
    
    def test_cleanup_old_logs_empty_directory(self, tmp_path):
        """Test de nettoyage avec dossier vide."""
        log_dir = tmp_path / "logs"
        log_dir.mkdir()
        
        result = cleanup_old_logs(retention_days=30, log_dir=str(log_dir))
        
        assert result == 0
    
    def test_cleanup_old_logs_old_files(self, tmp_path):
        """Test de nettoyage avec fichiers anciens."""
        log_dir = tmp_path / "logs"
        log_dir.mkdir()
        
        # Créer un fichier ancien
        old_date = date.today() - timedelta(days=40)
        old_file = log_dir / f"logs_{old_date.isoformat()}.json"
        old_file.write_text('{"test": "data"}')
        
        # Créer un fichier récent
        recent_date = date.today() - timedelta(days=10)
        recent_file = log_dir / f"logs_{recent_date.isoformat()}.json"
        recent_file.write_text('{"test": "data"}')
        
        result = cleanup_old_logs(retention_days=30, log_dir=str(log_dir))
        
        assert result == 1
        assert not old_file.exists()
        assert recent_file.exists()
    
    def test_cleanup_old_logs_all_recent(self, tmp_path):
        """Test de nettoyage avec tous les fichiers récents."""
        log_dir = tmp_path / "logs"
        log_dir.mkdir()
        
        recent_date = date.today() - timedelta(days=10)
        recent_file = log_dir / f"logs_{recent_date.isoformat()}.json"
        recent_file.write_text('{"test": "data"}')
        
        result = cleanup_old_logs(retention_days=30, log_dir=str(log_dir))
        
        assert result == 0
        assert recent_file.exists()
    
    def test_cleanup_old_logs_invalid_filename(self, tmp_path):
        """Test de nettoyage avec nom de fichier invalide."""
        log_dir = tmp_path / "logs"
        log_dir.mkdir()
        
        # Créer un fichier avec nom invalide
        invalid_file = log_dir / "invalid_name.txt"
        invalid_file.write_text('{"test": "data"}')
        
        result = cleanup_old_logs(retention_days=30, log_dir=str(log_dir))
        
        # Les fichiers invalides sont ignorés
        assert result == 0
    
    def test_cleanup_on_startup(self, tmp_path, monkeypatch):
        """Le nettoyage au démarrage purge le dossier désigné par ``LOG_DIR``."""
        log_dir = tmp_path / "logs"
        log_dir.mkdir()

        # Créer un fichier ancien
        old_date = date.today() - timedelta(days=40)
        old_file = log_dir / f"logs_{old_date.isoformat()}.json"
        old_file.write_text('{"test": "data"}')

        monkeypatch.setenv("LOG_DIR", str(log_dir))

        cleanup_on_startup()
        # Le fichier ancien devrait être supprimé
        assert not old_file.exists()
