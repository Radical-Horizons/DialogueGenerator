"""Repository pour le stockage de l'historique d'utilisation LLM."""
import json
import logging
import os
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional, Protocol

from models.llm_usage import LLMUsageRecord

logger = logging.getLogger(__name__)


class ILLMUsageRepository(Protocol):
    """Interface pour le repository d'utilisation LLM."""
    
    def save(self, record: LLMUsageRecord) -> None:
        """Sauvegarde un enregistrement d'utilisation.
        
        Args:
            record: L'enregistrement à sauvegarder.
        """
        ...
    
    def get_by_date_range(
        self,
        start_date: date,
        end_date: date,
        model_name: Optional[str] = None
    ) -> List[LLMUsageRecord]:
        """Récupère les enregistrements dans une plage de dates.
        
        Args:
            start_date: Date de début (incluse).
            end_date: Date de fin (incluse).
            model_name: Filtrer par modèle (optionnel).
            
        Returns:
            Liste des enregistrements correspondants.
        """
        ...
    
    def get_all(self, model_name: Optional[str] = None) -> List[LLMUsageRecord]:
        """Récupère tous les enregistrements.
        
        Args:
            model_name: Filtrer par modèle (optionnel).
            
        Returns:
            Liste de tous les enregistrements.
        """
        ...
    
    def get_statistics(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        model_name: Optional[str] = None
    ) -> Dict:
        """Calcule des statistiques agrégées.
        
        Args:
            start_date: Date de début (optionnel).
            end_date: Date de fin (optionnel).
            model_name: Filtrer par modèle (optionnel).
            
        Returns:
            Dictionnaire avec les statistiques (total_tokens, total_cost, etc.).
        """
        ...

    def get_by_request_id(self, request_id: str) -> Optional[LLMUsageRecord]:
        """Récupère un enregistrement par son request_id (tous les fichiers).
        
        Args:
            request_id: ID unique de la requête.
            
        Returns:
            L'enregistrement trouvé, ou None.
        """
        ...

    def update(self, record: LLMUsageRecord) -> None:
        """Met à jour un enregistrement existant (même request_id, même jour).
        
        Args:
            record: L'enregistrement modifié à persister.
        """
        ...

    def get_by_dialogue_id(self, dialogue_id: str) -> List[LLMUsageRecord]:
        """Récupère tous les enregistrements associés à un dialogue.
        
        Args:
            dialogue_id: ID du dialogue.
            
        Returns:
            Liste des enregistrements, triés par timestamp croissant.
        """
        ...

    def get_by_dialogue_and_node(
        self,
        dialogue_id: str,
        node_id: str,
    ) -> Optional[LLMUsageRecord]:
        """Récupère l'enregistrement associé à un dialogue et un nœud (Story 1.14/1.15).
        
        Args:
            dialogue_id: ID du dialogue.
            node_id: ID du nœud généré.
            
        Returns:
            L'enregistrement trouvé, ou None.
        """
        ...

    def mark_node_deleted(self, node_id: str) -> bool:
        """Marque comme supprimé l'enregistrement associé à un nœud.
        
        Args:
            node_id: ID du nœud supprimé.
            
        Returns:
            True si un enregistrement a été trouvé et mis à jour, False sinon.
        """
        ...

    def get_all_by_dialogue_ids(self) -> Dict[str, List[LLMUsageRecord]]:
        """Récupère tous les enregistrements groupés par dialogue_id.
        
        Returns:
            Dictionnaire {dialogue_id: [records]}, excluant les records sans dialogue_id.
        """
        ...


class FileLLMUsageRepository:
    """Repository d'utilisation LLM basé sur fichiers JSON.
    
    Stocke les enregistrements dans des fichiers JSON, un fichier par jour.
    Format: data/llm_usage/usage_YYYY-MM-DD.json
    """
    
    def __init__(self, storage_dir: str):
        """Initialise le repository avec un dossier de stockage.
        
        Args:
            storage_dir: Chemin vers le dossier où stocker les fichiers JSON.
        """
        self.storage_dir = Path(storage_dir)
        os.makedirs(self.storage_dir, exist_ok=True)
        logger.info(f"FileLLMUsageRepository initialisé avec le dossier: {self.storage_dir.absolute()}")
    
    def _get_file_path(self, target_date: date) -> Path:
        """Génère le chemin du fichier pour une date donnée.
        
        Args:
            target_date: Date pour laquelle générer le chemin.
            
        Returns:
            Chemin du fichier JSON.
        """
        filename = f"usage_{target_date.isoformat()}.json"
        return self.storage_dir / filename
    
    def _load_records_for_date(self, target_date: date) -> List[LLMUsageRecord]:
        """Charge les enregistrements pour une date donnée.
        
        Args:
            target_date: Date pour laquelle charger les enregistrements.
            
        Returns:
            Liste des enregistrements pour cette date.
        """
        file_path = self._get_file_path(target_date)
        
        if not file_path.exists():
            return []
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            records = []
            for record_data in data.get("records", []):
                # Convertir le timestamp string en datetime
                if isinstance(record_data.get("timestamp"), str):
                    record_data["timestamp"] = datetime.fromisoformat(
                        record_data["timestamp"].replace('Z', '+00:00')
                    )
                records.append(LLMUsageRecord(**record_data))
            
            return records
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.error(f"Erreur lors du chargement de {file_path}: {e}")
            return []
    
    def _save_records_for_date(self, target_date: date, records: List[LLMUsageRecord]) -> None:
        """Sauvegarde les enregistrements pour une date donnée.
        
        Args:
            target_date: Date pour laquelle sauvegarder.
            records: Liste des enregistrements à sauvegarder.
        """
        file_path = self._get_file_path(target_date)
        
        # Convertir les enregistrements en dictionnaires pour JSON
        records_data = [record.model_dump() for record in records]
        
        data = {
            "date": target_date.isoformat(),
            "records": records_data
        }
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False, default=str)
            logger.debug(f"Enregistrements sauvegardés dans {file_path} ({len(records)} enregistrements)")
        except IOError as e:
            logger.error(f"Erreur lors de la sauvegarde dans {file_path}: {e}")
            raise
    
    def save(self, record: LLMUsageRecord) -> None:
        """Sauvegarde un enregistrement d'utilisation.
        
        Args:
            record: L'enregistrement à sauvegarder.
        """
        # Extraire la date du timestamp
        record_date = record.timestamp.date()
        
        # Charger les enregistrements existants pour cette date
        existing_records = self._load_records_for_date(record_date)
        
        # Ajouter le nouvel enregistrement
        existing_records.append(record)
        
        # Sauvegarder
        self._save_records_for_date(record_date, existing_records)
    
    def get_by_date_range(
        self,
        start_date: date,
        end_date: date,
        model_name: Optional[str] = None
    ) -> List[LLMUsageRecord]:
        """Récupère les enregistrements dans une plage de dates.
        
        Args:
            start_date: Date de début (incluse).
            end_date: Date de fin (incluse).
            model_name: Filtrer par modèle (optionnel).
            
        Returns:
            Liste des enregistrements correspondants.
        """
        all_records = []
        
        # Parcourir toutes les dates dans la plage
        current_date = start_date
        while current_date <= end_date:
            records = self._load_records_for_date(current_date)
            all_records.extend(records)
            # Passer à la date suivante
            from datetime import timedelta
            current_date += timedelta(days=1)
        
        # Filtrer par modèle si demandé
        if model_name:
            all_records = [r for r in all_records if r.model_name == model_name]
        
        # Trier par timestamp (plus récent en premier)
        all_records.sort(key=lambda r: r.timestamp, reverse=True)
        
        return all_records
    
    def get_all(self, model_name: Optional[str] = None) -> List[LLMUsageRecord]:
        """Récupère tous les enregistrements.
        
        Args:
            model_name: Filtrer par modèle (optionnel).
            
        Returns:
            Liste de tous les enregistrements.
        """
        all_records = []
        
        # Parcourir tous les fichiers dans le dossier
        if not self.storage_dir.exists():
            return []
        
        for file_path in self.storage_dir.glob("usage_*.json"):
            try:
                # Extraire la date du nom de fichier
                date_str = file_path.stem.replace("usage_", "")
                file_date = datetime.fromisoformat(date_str).date()
                records = self._load_records_for_date(file_date)
                all_records.extend(records)
            except (ValueError, AttributeError) as e:
                logger.warning(f"Impossible de parser la date du fichier {file_path}: {e}")
                continue
        
        # Filtrer par modèle si demandé
        if model_name:
            all_records = [r for r in all_records if r.model_name == model_name]
        
        # Trier par timestamp (plus récent en premier)
        all_records.sort(key=lambda r: r.timestamp, reverse=True)
        
        return all_records
    
    def get_by_request_id(self, request_id: str) -> Optional[LLMUsageRecord]:
        """Récupère un enregistrement par son request_id (recherche dans tous les fichiers).
        
        Args:
            request_id: ID unique de la requête.
            
        Returns:
            L'enregistrement trouvé, ou None.
        """
        if not self.storage_dir.exists():
            return None
        
        for file_path in sorted(self.storage_dir.glob("usage_*.json"), reverse=True):
            try:
                date_str = file_path.stem.replace("usage_", "")
                file_date = datetime.fromisoformat(date_str).date()
                records = self._load_records_for_date(file_date)
                for record in records:
                    if record.request_id == request_id:
                        return record
            except (ValueError, AttributeError) as e:
                logger.warning(f"Impossible de parser la date du fichier {file_path}: {e}")
                continue
        
        return None
    
    def update(self, record: LLMUsageRecord) -> None:
        """Met à jour un enregistrement existant identifié par request_id.
        
        Trouve le fichier du jour correspondant au timestamp du record et
        remplace l'entrée avec le même request_id.
        
        Args:
            record: L'enregistrement modifié à persister.
        """
        record_date = record.timestamp.date()
        existing_records = self._load_records_for_date(record_date)
        
        updated = False
        new_records = []
        for r in existing_records:
            if r.request_id == record.request_id:
                new_records.append(record)
                updated = True
            else:
                new_records.append(r)
        
        if updated:
            self._save_records_for_date(record_date, new_records)
        else:
            logger.warning(f"update(): request_id '{record.request_id}' introuvable dans {record_date}")
    
    def get_by_dialogue_id(self, dialogue_id: str) -> List[LLMUsageRecord]:
        """Récupère tous les enregistrements associés à un dialogue.
        
        Args:
            dialogue_id: ID du dialogue.
            
        Returns:
            Liste des enregistrements triés par timestamp croissant.
        """
        all_records = self.get_all()
        matched = [r for r in all_records if r.dialogue_id == dialogue_id]
        matched.sort(key=lambda r: r.timestamp)
        return matched

    def get_by_dialogue_and_node(
        self,
        dialogue_id: str,
        node_id: str,
    ) -> Optional[LLMUsageRecord]:
        """Récupère l'enregistrement associé à un dialogue et un nœud (Story 1.14/1.15).
        
        Args:
            dialogue_id: ID du dialogue.
            node_id: ID du nœud généré.
            
        Returns:
            L'enregistrement trouvé, ou None.
        """
        records = self.get_by_dialogue_id(dialogue_id)
        for record in reversed(records):
            if record.node_id == node_id and not record.deleted:
                return record
        return None

    def mark_node_deleted(self, node_id: str) -> bool:
        """Marque comme supprimé l'enregistrement associé à un nœud.
        
        Cherche dans tous les fichiers le record avec node_id correspondant
        et passe son champ deleted à True.
        
        Args:
            node_id: ID du nœud supprimé.
            
        Returns:
            True si un enregistrement a été trouvé et mis à jour, False sinon.
        """
        all_records = self.get_all()
        for record in all_records:
            if record.node_id == node_id and not record.deleted:
                record.deleted = True
                self.update(record)
                return True
        return False

    def get_all_by_dialogue_ids(self) -> Dict[str, List[LLMUsageRecord]]:
        """Récupère tous les enregistrements groupés par dialogue_id.
        
        Returns:
            Dictionnaire {dialogue_id: [records]}, excluant les records sans dialogue_id.
        """
        all_records = self.get_all()
        grouped: Dict[str, List[LLMUsageRecord]] = {}
        for record in all_records:
            if record.dialogue_id:
                grouped.setdefault(record.dialogue_id, []).append(record)
        return grouped

    def get_statistics(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        model_name: Optional[str] = None
    ) -> Dict:
        """Calcule des statistiques agrégées.
        
        Args:
            start_date: Date de début (optionnel).
            end_date: Date de fin (optionnel).
            model_name: Filtrer par modèle (optionnel).
            
        Returns:
            Dictionnaire avec les statistiques:
            - total_tokens: int
            - total_prompt_tokens: int
            - total_completion_tokens: int
            - total_cost: float
            - calls_count: int
            - success_count: int
            - error_count: int
            - success_rate: float
            - avg_duration_ms: float
        """
        # Récupérer les enregistrements
        if start_date and end_date:
            records = self.get_by_date_range(start_date, end_date, model_name)
        else:
            records = self.get_all(model_name)
        
        if not records:
            return {
                "total_tokens": 0,
                "total_prompt_tokens": 0,
                "total_completion_tokens": 0,
                "total_cost": 0.0,
                "calls_count": 0,
                "success_count": 0,
                "error_count": 0,
                "success_rate": 0.0,
                "avg_duration_ms": 0.0
            }
        
        # Calculer les statistiques
        total_tokens = sum(r.total_tokens for r in records)
        total_prompt_tokens = sum(r.prompt_tokens for r in records)
        total_completion_tokens = sum(r.completion_tokens for r in records)
        total_cost = sum(r.estimated_cost for r in records)
        calls_count = len(records)
        success_count = sum(1 for r in records if r.success)
        error_count = calls_count - success_count
        success_rate = (success_count / calls_count * 100) if calls_count > 0 else 0.0
        avg_duration_ms = sum(r.duration_ms for r in records) / calls_count if calls_count > 0 else 0.0
        
        return {
            "total_tokens": total_tokens,
            "total_prompt_tokens": total_prompt_tokens,
            "total_completion_tokens": total_completion_tokens,
            "total_cost": total_cost,
            "calls_count": calls_count,
            "success_count": success_count,
            "error_count": error_count,
            "success_rate": success_rate,
            "avg_duration_ms": avg_duration_ms
        }




