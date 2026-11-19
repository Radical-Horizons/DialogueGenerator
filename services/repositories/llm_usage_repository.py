"""Repository pour le stockage de l'historique d'utilisation LLM."""
import json
import logging
import os
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Protocol

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

    def get_by_call_id(self, call_id: str) -> Optional[LLMUsageRecord]:
        """Récupère l'enregistrement d'un appel LLM précis (tous les fichiers).

        Args:
            call_id: Identifiant unique de l'appel.

        Returns:
            L'enregistrement trouvé, ou None.
        """
        ...

    def get_by_call_ids(self, call_ids: Iterable[str]) -> Dict[str, LLMUsageRecord]:
        """Récupère plusieurs appels en un seul parcours des fichiers.

        Args:
            call_ids: Identifiants d'appels.

        Returns:
            ``call_id → record`` pour les appels trouvés.
        """
        ...

    def update(self, record: LLMUsageRecord) -> bool:
        """Met à jour un enregistrement existant (même call_id, même jour).

        Un record antérieur à ``call_id`` est retrouvé par ``(request_id, timestamp)``.

        Args:
            record: L'enregistrement modifié à persister.

        Returns:
            True si l'entrée a été réécrite.
        """
        ...

    def update_many(self, records: Iterable[LLMUsageRecord]) -> int:
        """Met à jour plusieurs enregistrements, chaque fichier du jour lu et écrit une fois.

        Args:
            records: Enregistrements modifiés.

        Returns:
            Nombre d'enregistrements réécrits.
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
    
    def _dated_files_newest_first(self) -> List[date]:
        """Dates des fichiers d'usage présents, la plus récente d'abord."""
        if not self.storage_dir.exists():
            return []
        dates: List[date] = []
        for file_path in self.storage_dir.glob("usage_*.json"):
            try:
                dates.append(datetime.fromisoformat(file_path.stem.replace("usage_", "")).date())
            except (ValueError, AttributeError) as e:
                logger.warning(f"Impossible de parser la date du fichier {file_path}: {e}")
        return sorted(dates, reverse=True)

    def get_by_call_id(self, call_id: str) -> Optional[LLMUsageRecord]:
        """Récupère l'enregistrement d'un appel LLM précis (fichiers les plus récents d'abord).

        Args:
            call_id: Identifiant unique de l'appel.

        Returns:
            L'enregistrement trouvé, ou None.
        """
        if not call_id:
            return None
        return self.get_by_call_ids([call_id]).get(call_id)

    def get_by_call_ids(self, call_ids: Iterable[str]) -> Dict[str, LLMUsageRecord]:
        """Récupère plusieurs appels en un seul parcours (arrêt dès que tous sont trouvés).

        Args:
            call_ids: Identifiants d'appels.

        Returns:
            ``call_id → record`` pour les appels trouvés.
        """
        wanted = {call_id for call_id in call_ids if call_id}
        found: Dict[str, LLMUsageRecord] = {}
        for file_date in self._dated_files_newest_first():
            if len(found) == len(wanted):
                break
            for record in self._load_records_for_date(file_date):
                if record.call_id in wanted and record.call_id not in found:
                    found[record.call_id] = record
        return found

    @staticmethod
    def _target_indices(
        existing_records: List[LLMUsageRecord],
        record: LLMUsageRecord,
    ) -> Optional[List[int]]:
        """Entrées que ``record`` remplace, ou None si la cible est introuvable ou ambiguë.

        Avec ``call_id`` : l'unique entrée de même ``call_id``. Record antérieur à
        ``call_id`` : les entrées de même ``(request_id, timestamp)``. Plusieurs entrées ne
        sont acceptées que si ce sont des copies identiques — l'ancien ``update()``
        transformait une requête multi-appels en N copies d'un même record.
        """
        if record.call_id:
            matches = [i for i, r in enumerate(existing_records) if r.call_id == record.call_id]
            return matches if len(matches) == 1 else None
        matches = [
            i
            for i, r in enumerate(existing_records)
            if r.call_id is None
            and r.request_id == record.request_id
            and r.timestamp == record.timestamp
        ]
        if not matches:
            return None
        if len(matches) == 1:
            return matches
        reference = existing_records[matches[0]].model_dump()
        if all(existing_records[i].model_dump() == reference for i in matches[1:]):
            return matches
        return None

    def update_many(self, records: Iterable[LLMUsageRecord]) -> int:
        """Remplace les entrées désignées, chaque fichier du jour lu et écrit une seule fois.

        Une requête peut produire plusieurs appels sous le même ``request_id`` : la cible
        d'un record est l'entrée de même ``call_id`` (voir :meth:`_target_indices` pour
        les records antérieurs). Les autres entrées du fichier restent intactes.

        Args:
            records: Enregistrements modifiés à persister.

        Returns:
            Nombre d'enregistrements réécrits (les cibles introuvables ou ambiguës sont
            ignorées avec un warning).
        """
        by_date: Dict[date, List[LLMUsageRecord]] = {}
        for record in records:
            by_date.setdefault(record.timestamp.date(), []).append(record)

        updated = 0
        for record_date, day_records in by_date.items():
            existing_records = self._load_records_for_date(record_date)
            changed = False
            for record in day_records:
                indices = self._target_indices(existing_records, record)
                if indices is None:
                    logger.warning(
                        "update(): cible introuvable ou ambiguë pour call_id=%r request_id=%r "
                        "dans %s — rien n'est modifié.",
                        record.call_id,
                        record.request_id,
                        record_date,
                    )
                    continue
                for index in indices:
                    existing_records[index] = record
                updated += 1
                changed = True
            if changed:
                self._save_records_for_date(record_date, existing_records)
        return updated

    def update(self, record: LLMUsageRecord) -> bool:
        """Remplace l'entrée qui désigne le même appel LLM, dans le fichier de son jour.

        Args:
            record: L'enregistrement modifié à persister.

        Returns:
            True si l'entrée a été réécrite.
        """
        return self.update_many([record]) == 1

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
                return self.update(record)
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




