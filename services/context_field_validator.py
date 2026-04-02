"""Service pour valider que context_config.json ne référence que des champs existants."""
import logging
from typing import Dict, List, Set, Optional, Any, Tuple
from dataclasses import dataclass
from pathlib import Path

from services.context_field_detector import ContextFieldDetector, FieldInfo
from core.context.context_builder import ContextBuilder

logger = logging.getLogger(__name__)


@dataclass
class ValidationIssue:
    """Problème de validation détecté."""
    element_type: str
    field_path: str
    issue_type: str  # "missing", "obsolete", "similar_found"
    severity: str  # "error" (réservé) | "warning" (chemins absents du GDD)
    message: str
    suggested_path: Optional[str] = None  # Chemin suggéré si similar_found


@dataclass
class ValidationResult:
    """Résultat d'une validation de configuration."""
    element_type: str
    valid_fields: List[str]
    invalid_fields: List[ValidationIssue]
    total_fields_in_config: int
    total_fields_detected: int
    
    def has_errors(self) -> bool:
        """True si au moins une issue est en severity ``error`` (rare ; chemins GDD manquants = warning)."""
        return any(issue.severity == "error" for issue in self.invalid_fields)
    
    def has_warnings(self) -> bool:
        """Vérifie s'il y a des avertissements."""
        return any(issue.severity == "warning" for issue in self.invalid_fields)


class ContextFieldValidator:
    """Valide que context_config.json ne référence que des champs existants."""
    
    def __init__(self, context_builder: ContextBuilder):
        """Initialise le validateur.
        
        Args:
            context_builder: Instance de ContextBuilder pour accéder aux données GDD.
        """
        self.context_builder = context_builder
        self.detector = ContextFieldDetector(context_builder)
        self._detected_fields_cache: Dict[str, Dict[str, FieldInfo]] = {}
    
    def _get_detected_fields(self, element_type: str) -> Dict[str, FieldInfo]:
        """Récupère les champs détectés pour un type d'élément (avec cache).
        
        Args:
            element_type: Type d'élément ("character", "location", etc.)
            
        Returns:
            Dictionnaire {path: FieldInfo} des champs détectés.
        """
        if element_type not in self._detected_fields_cache:
            self._detected_fields_cache[element_type] = self.detector.detect_available_fields(element_type)
        return self._detected_fields_cache[element_type]
    
    def _find_similar_field(
        self, 
        invalid_path: str, 
        detected_fields: Dict[str, FieldInfo]
    ) -> Optional[str]:
        """Trouve un champ similaire dans les champs détectés.
        
        Args:
            invalid_path: Chemin invalide à remplacer
            detected_fields: Champs détectés disponibles
            
        Returns:
            Chemin d'un champ similaire trouvé, ou None.
        """
        invalid_lower = invalid_path.lower()
        
        # Extraire les mots-clés du chemin invalide
        keywords = []
        for part in invalid_path.split('.'):
            keywords.extend(part.lower().split())
        
        # Chercher des correspondances par mots-clés
        best_match = None
        best_score = 0
        
        for detected_path, field_info in detected_fields.items():
            detected_lower = detected_path.lower()
            
            # Score basé sur les mots-clés en commun
            score = 0
            for keyword in keywords:
                if keyword in detected_lower:
                    score += 1
            
            # Bonus si le dernier segment correspond
            invalid_last = invalid_path.split('.')[-1].lower()
            detected_last = detected_path.split('.')[-1].lower()
            if invalid_last in detected_last or detected_last in invalid_last:
                score += 2
            
            if score > best_score and score >= 2:  # Au moins 2 correspondances
                best_score = score
                best_match = detected_path
        
        return best_match
    
    def validate_config_for_element_type(
        self,
        element_type: str,
        config_fields: List[Dict[str, Any]]
    ) -> ValidationResult:
        """Valide la configuration pour un type d'élément.
        
        Args:
            element_type: Type d'élément ("character", "location", etc.)
            config_fields: Liste des champs depuis context_config.json pour ce type
            
        Returns:
            ValidationResult avec les champs valides et invalides.
        """
        # Récupérer les champs détectés
        detected_fields = self._get_detected_fields(element_type)
        detected_paths = set(detected_fields.keys())
        
        # Extraire les chemins depuis la config
        config_paths = []
        for field_config in config_fields:
            path = field_config.get("path", "")
            if path:
                config_paths.append(path)
        
        # Valider chaque champ
        valid_fields = []
        invalid_fields = []
        
        for field_config in config_fields:
            path = field_config.get("path", "")
            if not path:
                continue
            
            if path in detected_paths:
                valid_fields.append(path)
            else:
                # Champ invalide : chercher un équivalent
                suggested_path = self._find_similar_field(path, detected_fields)
                
                # Toujours en "warning" : à l'exécution, l'organizer filtre déjà ces chemins ;
                # bloquer le démarrage en prod sur l'absence de fuzzy-match créait des faux positifs
                # (GDD chargé correctement dans l'UI, panneau gauche OK) tout en empêchant le déploiement.
                issue = ValidationIssue(
                    element_type=element_type,
                    field_path=path,
                    issue_type="missing" if not suggested_path else "similar_found",
                    severity="warning",
                    message=f"Champ '{path}' non trouvé dans les données GDD",
                    suggested_path=suggested_path
                )
                
                if suggested_path:
                    issue.message += f". Suggestion: '{suggested_path}'"
                
                invalid_fields.append(issue)
                # Log détaillé seulement en DEBUG (visible avec --debug ou LOG_CONSOLE_LEVEL=DEBUG)
                logger.debug(
                    f"[{element_type}] Champ invalide: '{path}'"
                    + (f" -> Suggestion: '{suggested_path}'" if suggested_path else "")
                )
        
        # Log résumé : chemins non résolus = filtrés à l'exécution (pas un arrêt prod)
        if invalid_fields:
            n = len(invalid_fields)
            with_suggestion = sum(1 for i in invalid_fields if i.suggested_path)
            logger.warning(
                f"[{element_type}] {n} champ(s) de context_config absents du schéma GDD détecté(s) "
                f"({with_suggestion} avec suggestion). Filtrés à l'exécution — "
                f"voir STARTUP_REPORT=full ou npm run diagnose:prod-context."
            )
        
        return ValidationResult(
            element_type=element_type,
            valid_fields=valid_fields,
            invalid_fields=invalid_fields,
            total_fields_in_config=len(config_paths),
            total_fields_detected=len(detected_paths)
        )
    
    def validate_all_configs(
        self,
        context_config: Dict[str, Any]
    ) -> Dict[str, ValidationResult]:
        """Valide toutes les configurations dans context_config.json.
        
        Args:
            context_config: Configuration complète depuis context_config.json
            
        Returns:
            Dictionnaire {element_type: ValidationResult} pour chaque type d'élément.
        """
        results = {}
        
        # Types d'éléments supportés
        element_types = ["character", "location", "item", "species", "community"]
        
        for element_type in element_types:
            if element_type not in context_config:
                continue
            
            element_config = context_config[element_type]
            if not isinstance(element_config, dict):
                logger.warning(f"Configuration invalide pour '{element_type}': n'est pas un dictionnaire")
                continue
            
            # Collecter tous les champs de toutes les priorités
            all_fields = []
            for priority_level, fields in element_config.items():
                if isinstance(fields, list):
                    all_fields.extend(fields)
            
            # Valider
            result = self.validate_config_for_element_type(element_type, all_fields)
            results[element_type] = result
        
        return results
    
    def filter_valid_fields(
        self,
        element_type: str,
        fields_to_include: List[str]
    ) -> List[str]:
        """Filtre une liste de champs pour ne garder que ceux qui existent réellement.
        
        Args:
            element_type: Type d'élément
            fields_to_include: Liste des chemins de champs à filtrer
            
        Returns:
            Liste filtrée contenant uniquement les champs valides.
        """
        detected_fields = self._get_detected_fields(element_type)
        detected_paths = set(detected_fields.keys())
        
        valid_fields = []
        invalid_count = 0
        for field_path in fields_to_include:
            if field_path in detected_paths:
                valid_fields.append(field_path)
            else:
                invalid_count += 1
                # Log détaillé seulement en DEBUG
                logger.debug(
                    f"[{element_type}] Champ invalide filtré: '{field_path}' "
                    f"(non présent dans les données GDD)"
                )
        
        # Log résumé seulement si des champs invalides
        if invalid_count > 0:
            logger.info(
                f"[{element_type}] {invalid_count} champ(s) invalide(s) filtré(s) sur {len(fields_to_include)} total. "
                f"Utilisez --debug pour voir les détails."
            )
        
        return valid_fields
    
    def get_validation_report(
        self,
        context_config: Dict[str, Any]
    ) -> str:
        """Génère un rapport de validation lisible.
        
        Args:
            context_config: Configuration complète depuis context_config.json
            
        Returns:
            Rapport de validation formaté en texte.
        """
        results = self.validate_all_configs(context_config)
        
        report_lines = ["=== RAPPORT DE VALIDATION DES CHAMPS GDD ===\n"]
        
        total_errors = 0
        total_warnings = 0
        
        for element_type, result in results.items():
            report_lines.append(f"\n--- {element_type.upper()} ---")
            report_lines.append(f"Champs dans config: {result.total_fields_in_config}")
            report_lines.append(f"Champs détectés: {result.total_fields_detected}")
            report_lines.append(f"Champs valides: {len(result.valid_fields)}")
            report_lines.append(f"Champs invalides: {len(result.invalid_fields)}")
            
            if result.invalid_fields:
                report_lines.append("\n  Problèmes détectés:")
                for issue in result.invalid_fields:
                    severity_icon = "[ERREUR]" if issue.severity == "error" else "[WARNING]"
                    report_lines.append(f"    {severity_icon} {issue.field_path}")
                    report_lines.append(f"       {issue.message}")
                    if issue.suggested_path:
                        report_lines.append(f"       -> Remplacer par: {issue.suggested_path}")
                
                errors = sum(1 for i in result.invalid_fields if i.severity == "error")
                warnings = sum(1 for i in result.invalid_fields if i.severity == "warning")
                total_errors += errors
                total_warnings += warnings
        
        report_lines.append(f"\n=== RÉSUMÉ ===")
        report_lines.append(f"Erreurs critiques: {total_errors}")
        report_lines.append(f"Avertissements: {total_warnings}")
        
        if total_errors == 0 and total_warnings == 0:
            report_lines.append("\n[OK] Tous les champs sont valides!")
        
        return "\n".join(report_lines)
