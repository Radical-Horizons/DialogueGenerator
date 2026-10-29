"""Handler de fichier rotatif pour les logs avec rotation par date."""
import os
import json
import logging
from pathlib import Path
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional
from logging.handlers import BaseRotatingHandler

# Fenêtre suffisante pour retrouver le « ] » final malgré du whitespace de fin.
_TAIL_PROBE_BYTES = 64


class DateRotatingFileHandler(BaseRotatingHandler):
    """Handler de logging qui écrit dans des fichiers JSON rotatifs par date.
    
    Les logs sont écrits dans des fichiers nommés `logs_YYYY-MM-DD.json`.
    Chaque fichier contient un tableau JSON d'objets log.
    La rotation se fait automatiquement au changement de jour.
    """
    
    def __init__(
        self,
        log_dir: str,
        retention_days: int = 30,
        max_file_size_mb: int = 100,
        encoding: Optional[str] = "utf-8"
    ):
        """Initialise le handler.
        
        Args:
            log_dir: Dossier où stocker les fichiers de logs.
            retention_days: Nombre de jours de rétention (défaut: 30).
            max_file_size_mb: Taille maximale d'un fichier en MB avant rotation intra-jour (défaut: 100).
            encoding: Encodage des fichiers (défaut: utf-8).
        """
        self.log_dir = Path(log_dir)
        self.retention_days = retention_days
        self.max_file_size_bytes = max_file_size_mb * 1024 * 1024
        self.encoding = encoding
        self.current_date: Optional[date] = None
        self.current_file_path: Optional[Path] = None
        self._file_handle = None
        
        # Créer le dossier s'il n'existe pas
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            # Si on ne peut pas créer le dossier, on log vers console uniquement
            logging.getLogger(__name__).error(f"Impossible de créer le dossier de logs {log_dir}: {e}")
            raise
        
        # Initialiser avec la date actuelle
        self._rotate_if_needed()
        
        # Appeler le constructeur parent (sans baseFilename car on gère nous-mêmes)
        super().__init__(filename=str(self.current_file_path), mode='a', encoding=encoding, delay=False)
    
    def _get_file_path(self, target_date: date) -> Path:
        """Génère le chemin du fichier pour une date donnée.
        
        Args:
            target_date: Date pour laquelle générer le chemin.
            
        Returns:
            Chemin du fichier JSON.
        """
        filename = f"logs_{target_date.isoformat()}.json"
        return self.log_dir / filename
    
    def _rotate_if_needed(self) -> None:
        """Vérifie si une rotation est nécessaire et l'effectue si besoin.
        
        Rotation si :
        - Changement de jour
        - Fichier actuel trop volumineux (> max_file_size_bytes)
        """
        today = date.today()
        
        # Rotation si changement de jour
        if self.current_date != today:
            self._close_current_file()
            self.current_date = today
            self.current_file_path = self._get_file_path(today)
            self._open_file()
            return
        
        # Rotation si fichier trop volumineux
        if self.current_file_path and self.current_file_path.exists():
            file_size = self.current_file_path.stat().st_size
            if file_size > self.max_file_size_bytes:
                # Créer un nouveau fichier avec timestamp pour éviter les collisions
                timestamp = datetime.now(timezone.utc).strftime("%H%M%S")
                new_path = self.log_dir / f"logs_{today.isoformat()}_{timestamp}.json"
                self._close_current_file()
                self.current_file_path = new_path
                self._open_file()
    
    def _open_file(self) -> None:
        """Ouvre le fichier de log actuel.
        
        Si le fichier n'existe pas, crée un tableau JSON vide.
        Si le fichier existe mais est corrompu, le recrée.
        """
        if not self.current_file_path:
            return
        
        try:
            # Si le fichier existe, vérifier qu'il est valide
            if self.current_file_path.exists():
                try:
                    with open(self.current_file_path, 'r', encoding=self.encoding) as f:
                        json.load(f)  # Vérifier que c'est du JSON valide
                except (json.JSONDecodeError, IOError):
                    # Fichier corrompu, le recréer
                    logging.getLogger(__name__).warning(
                        f"Fichier de log corrompu, recréation: {self.current_file_path}"
                    )
                    self.current_file_path.unlink()
            
            # Lecture/écriture binaire : l'ajout écrase le « ] » final plutôt que de
            # réécrire le tableau, d'où un coût constant quel que soit le volume déjà écrit.
            if not self.current_file_path.exists():
                self.current_file_path.touch()
            self._file_handle = open(self.current_file_path, 'r+b')
            
        except IOError as e:
            logging.getLogger(__name__).error(f"Impossible d'ouvrir le fichier de log {self.current_file_path}: {e}")
            self._file_handle = None
    
    def _close_current_file(self) -> None:
        """Ferme le fichier de log actuel."""
        if self._file_handle:
            try:
                self._file_handle.close()
            except IOError:
                pass
            finally:
                self._file_handle = None
    
    def emit(self, record: logging.LogRecord) -> None:
        """Émet un log record vers le fichier.
        
        Args:
            record: Le record de log à écrire.
        """
        try:
            # Vérifier si rotation nécessaire
            self._rotate_if_needed()
            
            # Si le fichier n'est pas ouvert, essayer de l'ouvrir
            if not self._file_handle:
                self._open_file()
            
            # Si toujours pas de fichier, fallback vers console
            if not self._file_handle:
                return
            
            # Formater le record en JSON
            log_entry = self._format_record(record)
            
            # Écrire dans le fichier
            # Format: un objet JSON par ligne (JSONL-like, mais on maintient un tableau)
            # Pour simplifier la lecture, on lit tout, ajoute, et réécrit
            # (peut être optimisé plus tard avec un buffer)
            self._append_log_entry(log_entry)
            
        except Exception as e:
            # En cas d'erreur, ne pas bloquer l'application
            # Log vers console uniquement
            try:
                import sys
                print(f"Erreur lors de l'écriture du log: {e}", file=sys.stderr)
            except Exception:
                pass  # Dernier recours, ignorer
    
    def _format_record(self, record: logging.LogRecord) -> Dict[str, Any]:
        """Formate un record de log en dictionnaire JSON.
        
        Args:
            record: Le record de log.
            
        Returns:
            Dictionnaire représentant le log.
        """
        log_data: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # Ajouter le contexte enrichi si présent
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "endpoint"):
            log_data["endpoint"] = record.endpoint
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "environment"):
            log_data["environment"] = record.environment
        
        # Ajouter l'exception si présente
        if record.exc_info:
            log_data["exception"] = self.format(record)
            log_data["exception_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        
        # Ajouter les extra fields si présents
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)
        
        return log_data
    
    def _append_log_entry(self, log_entry: Dict[str, Any]) -> None:
        """Ajoute une entrée au tableau JSON du fichier courant.

        L'entrée est épissée à la place du « ] » final : le coût ne dépend pas du
        nombre de lignes déjà écrites. La version précédente relisait et réécrivait
        le fichier entier à chaque enregistrement, ce qui rendait le coût d'une
        session quadratique — la CI y perdait plus d'une heure.

        Le fichier reste un tableau JSON valide après chaque écriture.

        Args:
            log_entry: L'entrée de log à ajouter.
        """
        if not self.current_file_path or not self._file_handle:
            return

        payload = json.dumps(
            log_entry, ensure_ascii=False, separators=(',', ':')
        ).encode(self.encoding or 'utf-8')

        try:
            handle = self._file_handle
            handle.seek(0, os.SEEK_END)
            size = handle.tell()

            if size == 0:
                handle.write(b'[' + payload + b']')
            else:
                # Le « ] » final se cherche en ignorant le whitespace de fin : ouvrir
                # data/logs/*.json dans un éditeur pour déboguer suffit à y laisser un
                # saut de ligne, et le prendre pour une corruption effacerait la
                # journée entière — silencieusement.
                queue_len = min(size, _TAIL_PROBE_BYTES)
                handle.seek(size - queue_len)
                queue = handle.read(queue_len)
                depouillee = queue.rstrip(b' \t\r\n')
                if depouillee.endswith(b']'):
                    handle.seek(size - (len(queue) - len(depouillee)) - 1)
                    handle.truncate()
                    handle.write(b',' + payload + b']')
                else:
                    # Tableau réellement non refermé (écriture interrompue) : on repart
                    # d'un fichier sain, mais on le dit — la perte doit être visible.
                    logging.getLogger(__name__).warning(
                        "Fichier de log non refermé (%s) : réinitialisation, %d octets perdus.",
                        self.current_file_path,
                        size,
                    )
                    handle.seek(0)
                    handle.truncate()
                    handle.write(b'[' + payload + b']')
            handle.flush()

        except (IOError, OSError) as e:
            logging.getLogger(__name__).error(f"Erreur lors de l'écriture du log: {e}")
            self._file_handle = None

    def close(self) -> None:
        """Ferme le handler et libère les ressources."""
        self._close_current_file()
        super().close()
    
    def doRollover(self) -> None:
        """Effectue une rotation manuelle (appelée par le système de logging).
        
        Note: La rotation est gérée automatiquement par _rotate_if_needed().
        """
        self._rotate_if_needed()
    
    def cleanup_old_files(self) -> int:
        """Supprime les fichiers de logs plus anciens que retention_days.
        
        Returns:
            Nombre de fichiers supprimés.
        """
        if not self.log_dir.exists():
            return 0
        
        deleted_count = 0
        cutoff_date = date.today() - timedelta(days=self.retention_days)
        
        try:
            for file_path in self.log_dir.glob("logs_*.json"):
                # Extraire la date du nom de fichier
                try:
                    # Format: logs_YYYY-MM-DD.json ou logs_YYYY-MM-DD_HHMMSS.json
                    filename = file_path.stem  # logs_2024-12-15 ou logs_2024-12-15_123045
                    date_part = filename.split('_')[1]  # 2024-12-15 ou 2024-12-15_123045
                    if '_' in date_part:
                        date_part = date_part.split('_')[0]  # 2024-12-15
                    file_date = datetime.strptime(date_part, "%Y-%m-%d").date()
                    
                    if file_date < cutoff_date:
                        file_path.unlink()
                        deleted_count += 1
                except (ValueError, IndexError):
                    # Nom de fichier invalide, ignorer
                    continue
        except Exception as e:
            logging.getLogger(__name__).error(f"Erreur lors du nettoyage des logs: {e}")
        
        return deleted_count

