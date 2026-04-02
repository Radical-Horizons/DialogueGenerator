#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Script CLI pour valider que context_config.json ne référence que des champs existants."""
import sys
import argparse
from pathlib import Path

# Ajouter le répertoire racine au path
_root_dir = Path(__file__).parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from core.context.context_builder import ContextBuilder
from services.context_field_validator import ContextFieldValidator
from services.configuration_service import ConfigurationService


def main():
    """Point d'entrée principal du script."""
    parser = argparse.ArgumentParser(
        description="Valide que context_config.json ne référence que des champs existants dans les données GDD"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Affiche les suggestions de corrections automatiques"
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Génère un rapport détaillé"
    )
    parser.add_argument(
        "--element-type",
        type=str,
        help="Valider uniquement un type d'élément spécifique (character, location, etc.)"
    )
    
    args = parser.parse_args()
    
    # Initialiser les services
    print("Chargement des données GDD...")
    context_builder = ContextBuilder()
    context_builder.load_gdd_files()
    
    config_service = ConfigurationService()
    context_config = config_service.get_context_config()
    
    if not context_config:
        print("[ERREUR] context_config.json est vide ou introuvable")
        sys.exit(1)
    
    # Valider
    print("Validation des champs...")
    validator = ContextFieldValidator(context_builder)
    
    if args.element_type:
        # Valider un seul type
        if args.element_type not in context_config:
            print(f"[ERREUR] Type d'element '{args.element_type}' non trouve dans context_config.json")
            sys.exit(1)
        
        element_config = context_config[args.element_type]
        all_fields = []
        for priority_level, fields in element_config.items():
            if isinstance(fields, list):
                all_fields.extend(fields)
        
        result = validator.validate_config_for_element_type(args.element_type, all_fields)
        print(f"\n=== Validation pour {args.element_type.upper()} ===")
        print(f"Champs dans config: {result.total_fields_in_config}")
        print(f"Champs détectés: {result.total_fields_detected}")
        print(f"Champs valides: {len(result.valid_fields)}")
        print(f"Champs invalides: {len(result.invalid_fields)}")
        
        if result.invalid_fields:
            print("\n[ERREUR] Problemes detectes:")
            for issue in result.invalid_fields:
                severity_icon = "[ERREUR]" if issue.severity == "error" else "[WARNING]"
                print(f"  {severity_icon} {issue.field_path}")
                print(f"     {issue.message}")
                if issue.suggested_path:
                    print(f"     -> Suggestion: {issue.suggested_path}")
                    if args.fix:
                        print(f"     -> Correction: Remplacer '{issue.field_path}' par '{issue.suggested_path}'")
        else:
            print("\n[OK] Tous les champs sont valides!")
    else:
        # Valider tous les types
        validation_results = validator.validate_all_configs(context_config)
        
        # Afficher le rapport
        if args.report:
            report = validator.get_validation_report(context_config)
            print("\n" + report)
        else:
            print("\n=== RÉSUMÉ DE VALIDATION ===")
            total_errors = 0
            total_warnings = 0
            
            for element_type, result in validation_results.items():
                errors = sum(1 for i in result.invalid_fields if i.severity == "error")
                warnings = sum(1 for i in result.invalid_fields if i.severity == "warning")
                total_errors += errors
                total_warnings += warnings
                
                status = "[OK]" if len(result.invalid_fields) == 0 else "[ERREUR]"
                print(f"{status} {element_type}: {len(result.valid_fields)}/{result.total_fields_in_config} valides")
                if result.invalid_fields:
                    print(f"   {errors} erreur(s), {warnings} avertissement(s)")
            
            print(f"\nTotal: {total_errors} erreur(s), {total_warnings} avertissement(s)")
            
            if total_errors == 0 and total_warnings == 0:
                print("\n[OK] Tous les champs sont valides!")
                sys.exit(0)
            else:
                print("\n[WARNING] Des problemes ont ete detectes. Utilisez --report pour plus de details.")
                if args.fix:
                    print("\n=== SUGGESTIONS DE CORRECTIONS ===")
                    for element_type, result in validation_results.items():
                        if result.invalid_fields:
                            print(f"\n{element_type.upper()}:")
                            for issue in result.invalid_fields:
                                if issue.suggested_path:
                                    print(f"  Remplacer '{issue.field_path}' par '{issue.suggested_path}'")
                sys.exit(1)


if __name__ == "__main__":
    main()
