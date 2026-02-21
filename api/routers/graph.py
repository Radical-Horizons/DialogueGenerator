"""Router API pour la gestion de graphes de dialogues."""
import logging
import re
from pathlib import Path
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, status
from api.schemas.graph import (
    LoadGraphRequest,
    LoadGraphResponse,
    GraphMetadata,
    SaveGraphRequest,
    SaveGraphResponse,
    GenerateNodeRequest,
    GenerateNodeResponse,
    SuggestedConnection,
    ValidateGraphRequest,
    ValidateGraphResponse,
    ValidationErrorDetail,
    CalculateLayoutRequest,
    CalculateLayoutResponse,
    AcceptNodeRequest,
    RejectNodeRequest
)
from api.exceptions import InternalServerException, NotFoundException, ValidationException
from api.dependencies import get_config_service, get_request_id
from services.configuration_service import ConfigurationService
from services.graph_conversion_service import GraphConversionService
from services.unity_dialogue_export_service import (
    write_unity_dialogue_to_file,
    read_last_seq,
)
from services.graph_validation_service import GraphValidationService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from services.graph_generation_service import GraphGenerationService
from core.llm.llm_client import ILLMClient
from core.context.context_builder import ContextBuilder
from api.container import ServiceContainer
from models.dialogue_structure.unity_dialogue_node import UnityDialogueChoiceContent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/unity-dialogues/graph", tags=["Graph Editor"])


@router.post(
    "/load",
    response_model=LoadGraphResponse,
    status_code=status.HTTP_200_OK
)
async def load_graph(
    request_data: LoadGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> LoadGraphResponse:
    """Charge un dialogue Unity JSON et le convertit en format graphe (nodes/edges).
    
    Args:
        request_data: Contenu JSON Unity.
        request_id: ID de la requête.
        
    Returns:
        Nœuds et edges ReactFlow avec métadonnées.
        
    Raises:
        ValidationException: Si le JSON est invalide.
        InternalServerException: Si la conversion échoue.
    """
    try:
        # Convertir Unity JSON → ReactFlow
        nodes, edges = GraphConversionService.unity_json_to_graph(request_data.json_content)
        
        # Calculer les métadonnées
        metadata = GraphMetadata(
            title="Dialogue Unity",
            node_count=len(nodes),
            edge_count=len(edges)
        )
        
        logger.info(
            f"Graphe chargé: {metadata.node_count} nœuds, "
            f"{metadata.edge_count} edges (request_id: {request_id})"
        )
        
        return LoadGraphResponse(
            nodes=nodes,
            edges=edges,
            metadata=metadata
        )
        
    except ValueError as e:
        logger.warning(f"Validation error lors du chargement (request_id: {request_id}): {e}")
        raise ValidationException(
            message=str(e),
            request_id=request_id
        )
    except Exception as e:
        logger.exception(f"Erreur lors du chargement du graphe (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du chargement du graphe",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/save",
    response_model=SaveGraphResponse,
    status_code=status.HTTP_200_OK
)
async def save_graph(
    request_data: SaveGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> SaveGraphResponse:
    """Sauvegarde un graphe modifié (reconvertit en Unity JSON).
    
    Args:
        request_data: Nœuds et edges ReactFlow avec métadonnées.
        request_id: ID de la requête.
        
    Returns:
        Nom de fichier et contenu JSON Unity généré.
        Si seq/document_id fournis (ADR-006), ack_seq et last_seq dans la réponse.
        
    Raises:
        ValidationException: Si la conversion échoue.
        InternalServerException: Si la sauvegarde échoue.
    """
    try:
        # Convertir ReactFlow → Unity JSON
        json_content = GraphConversionService.graph_to_unity_json(
            request_data.nodes,
            request_data.edges
        )
        
        # Générer un nom de fichier (titre sanitizé)
        sanitized_title = re.sub(r'[^\w\s-]', '', request_data.metadata.title)
        sanitized_title = re.sub(r'[-\s]+', '_', sanitized_title)
        filename = f"{sanitized_title}.json"
        
        # ADR-006: réponse ack_seq / last_seq si seq fourni (pas de persistance pour /save)
        extra: dict = {}
        if request_data.seq is not None:
            extra["ack_seq"] = request_data.seq
            extra["last_seq"] = request_data.seq
        
        logger.info(
            "Graphe sauvegardé: %s, %s nœuds (request_id: %s)",
            filename,
            request_data.metadata.node_count,
            request_id,
        )
        
        return SaveGraphResponse(
            success=True,
            filename=filename,
            json_content=json_content,
            **extra,
        )
        
    except ValueError as e:
        logger.warning("Validation error lors de la sauvegarde (request_id: %s): %s", request_id, e)
        raise ValidationException(
            message=str(e),
            request_id=request_id
        )
    except Exception as e:
        logger.exception("Erreur lors de la sauvegarde du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la sauvegarde du graphe",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/save-and-write",
    response_model=SaveGraphResponse,
    status_code=status.HTTP_200_OK
)
async def save_graph_and_write(
    request_data: SaveGraphRequest,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)],
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> SaveGraphResponse:
    """Convertit le graphe en Unity JSON, valide et écrit le fichier sur disque (un seul appel).
    
    ADR-006: Si seq/document_id fournis, seq <= last_seq → ne pas écraser (200 + ack(last_seq));
    seq > last_seq → écriture atomique + persistance last_seq + ack(seq).
    
    Args:
        request_data: Nœuds et edges ReactFlow avec métadonnées.
        config_service: Service de configuration (chemin Unity).
        request_id: ID de la requête.
        
    Returns:
        Nom de fichier et contenu JSON Unity généré.
        
    Raises:
        ValidationException: Si la conversion ou la validation échoue.
        InternalServerException: Si l'écriture échoue.
    """
    try:
        json_content = GraphConversionService.graph_to_unity_json(
            request_data.nodes,
            request_data.edges
        )
        sanitized_title = re.sub(r"[^\w\s-]", "", request_data.metadata.title)
        sanitized_title = re.sub(r"[-\s]+", "_", sanitized_title)
        filename_without_ext = sanitized_title[:100] if sanitized_title else "dialogue"
        filename = filename_without_ext + ".json" if not filename_without_ext.endswith(".json") else filename_without_ext
        if not filename.endswith(".json"):
            filename += ".json"
        document_key = filename[:-5] if filename.endswith(".json") else filename

        # ADR-006: seq / last_seq — si seq fourni, comparer à last_seq
        seq = request_data.seq
        last_seq: Optional[int] = None
        if seq is not None:
            unity_path = config_service.get_unity_dialogues_path()
            if unity_path:
                unity_dir = Path(unity_path)
                last_seq = read_last_seq(unity_dir, document_key)
            if last_seq is not None and seq <= last_seq:
                    logger.info(
                        "save-and-write: seq %s <= last_seq %s, pas d'écriture (request_id: %s)",
                        seq,
                        last_seq,
                        request_id,
                    )
                    return SaveGraphResponse(
                        success=True,
                        filename=filename,
                        json_content=json_content,
                        ack_seq=last_seq,
                        last_seq=last_seq,
                    )

        file_path, filename_out = write_unity_dialogue_to_file(
            config_service=config_service,
            json_content=json_content,
            filename=filename_without_ext,
            request_id=request_id,
            last_seq_after_write=seq,
        )

        extra: dict = {}
        if seq is not None:
            extra["ack_seq"] = seq
            extra["last_seq"] = seq

        logger.info(
            "Graphe sauvegardé et écrit: %s, %s nœuds (request_id: %s)",
            filename_out,
            request_data.metadata.node_count,
            request_id,
        )
        return SaveGraphResponse(
            success=True,
            filename=filename_out,
            json_content=json_content,
            **extra,
        )
    except ValidationException:
        raise
    except ValueError as e:
        logger.warning("Validation error lors de save-and-write (request_id: %s): %s", request_id, e)
        raise ValidationException(message=str(e), request_id=request_id)
    except Exception as e:
        logger.exception("Erreur lors de la sauvegarde du graphe (request_id: %s)", request_id)
        raise InternalServerException(
            message="Erreur lors de la sauvegarde du graphe",
            details={"error": str(e)},
            request_id=request_id,
        )


@router.post(
    "/generate-node",
    response_model=GenerateNodeResponse,
    status_code=status.HTTP_200_OK
)
async def generate_node(
    request_data: GenerateNodeRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> GenerateNodeResponse:
    """Génère un nœud en contexte (extension de /generate/unity-dialogue).
    
    Args:
        request_data: Contexte parent et instructions de génération.
        request_id: ID de la requête.
        
    Returns:
        Nœud généré avec connexions suggérées.
        
    Raises:
        InternalServerException: Si la génération échoue.
    """
    try:
        # Obtenir le service container et les services nécessaires
        container = ServiceContainer()
        config_service = container.get_config_service()
        
        # Import local pour éviter les imports circulaires
        from factories.llm_factory import LLMClientFactory
        
        # Générer le client LLM
        llm_client = LLMClientFactory.create_client(
            model_id=request_data.llm_model_identifier,
            config=config_service.get_llm_config(),
            available_models=config_service.get_available_llm_models(),
        )
        
        generation_service = UnityDialogueGenerationService()
        parent_content = request_data.parent_node_content
        parent_choices = parent_content.get("choices", [])
        
        if request_data.generate_all_choices and not parent_choices:
            raise ValidationException(
                message="Aucun choix disponible pour la génération batch.",
                request_id=request_id
            )
        
        # Gérer génération batch si generate_all_choices=True
        if request_data.generate_all_choices and parent_choices:
            # Si les instructions sont vides, utiliser un texte par défaut
            user_instructions = request_data.user_instructions.strip() if request_data.user_instructions else ""
            if not user_instructions:
                user_instructions = "Ecris la réponse du PNJ à ce que dit le PJ"
            
            # Utiliser le service batch pour générer tous les choix (en parallèle)
            graph_generation_service = GraphGenerationService(generation_service)
            # Note: progress_callback pourrait être ajouté si on veut du streaming SSE
            batch_result = await graph_generation_service.generate_nodes_for_all_choices(
                parent_node=parent_content,
                instructions=user_instructions,
                context=request_data.context_selections,
                llm_client=llm_client,
                system_prompt_override=request_data.system_prompt_override,
                max_choices=request_data.max_choices,
                progress_callback=None  # Pourrait être utilisé avec SSE dans le futur
            )
            
            # Retourner tous les nœuds générés en batch
            failed_choices = batch_result.get("failed_choices", [])
            batch_count = len(batch_result["nodes"])
            connected_choices_count = batch_result.get("connected_choices_count")
            generated_choices_count = batch_result.get("generated_choices_count")
            failed_choices_count = batch_result.get("failed_choices_count")
            total_choices_count = batch_result.get("total_choices_count")
            
            if batch_result["nodes"]:
                suggested_connections = [
                    SuggestedConnection(**conn) for conn in batch_result["connections"]
                ]
                
                # Logger les résultats (succès et échecs)
                if failed_choices:
                    logger.warning(
                        f"Génération batch partielle: {batch_count} nœud(s) généré(s), "
                        f"{len(failed_choices)} échec(s) pour parent {request_data.parent_node_id} "
                        f"(request_id: {request_id})"
                    )
                else:
                    logger.info(
                        f"Génération batch: {batch_count} nœud(s) généré(s) "
                        f"pour parent {request_data.parent_node_id} (request_id: {request_id})"
                    )
                
                # Retourner tous les nœuds avec le premier pour backward compatibility
                return GenerateNodeResponse(
                    node=batch_result["nodes"][0] if batch_result["nodes"] else None,
                    nodes=batch_result["nodes"],
                    suggested_connections=suggested_connections,
                    parent_node_id=request_data.parent_node_id,
                    batch_count=batch_count,
                    generated_choices_count=generated_choices_count,
                    connected_choices_count=connected_choices_count,
                    failed_choices_count=failed_choices_count,
                    total_choices_count=total_choices_count
                )
            else:
                # Aucun nœud généré
                if failed_choices:
                    # Tous les choix ont échoué
                    error_msg = (
                        f"Aucun nœud généré. {len(failed_choices)} échec(s) de génération. "
                        f"Vérifiez les logs pour plus de détails."
                    )
                else:
                    # Tous les choix déjà connectés
                    error_msg = "Tous les choix sont déjà connectés. Aucun nœud à générer."
                
                raise ValidationException(
                    message=error_msg,
                    request_id=request_id
                )
        
        # Génération normale (choix spécifique ou nextNode)
        # Enrichir les instructions avec le contexte parent
        parent_speaker = parent_content.get("speaker", "PNJ")
        parent_line = parent_content.get("line", "")
        
        # Si les instructions sont vides, utiliser un texte par défaut
        user_instructions = request_data.user_instructions.strip() if request_data.user_instructions else ""
        if not user_instructions:
            user_instructions = "Ecris la réponse du PNJ à ce que dit le PJ"
        
        # Vérifier si on génère depuis un TestNode (détection par type ou données)
        is_test_node = (
            parent_content.get("type") == "testNode" or
            (not parent_choices and parent_content.get("test") is not None) or
            request_data.parent_node_id.startswith("test-node-")
        )
        
        # Si on génère depuis un TestNode, extraire le DialogueNode parent et le choice_index
        if is_test_node and not parent_choices:
            # Format de l'ID TestNode: test-node-{parent_id}-choice-{index}
            # Exemple: test-node-NODE_START-choice-0
            test_node_id = request_data.parent_node_id
            if test_node_id.startswith("test-node-"):
                # Extraire le parent_id et choice_index depuis l'ID du TestNode
                parts = test_node_id.replace("test-node-", "").split("-choice-")
                if len(parts) == 2:
                    parent_dialogue_id = parts[0]
                    choice_index_str = parts[1]
                    try:
                        choice_index = int(choice_index_str)
                        # Extraire le test depuis les données du TestNode
                        test_value = parent_content.get("test")
                        if test_value:
                            # Récupérer le speaker et line depuis les données du TestNode
                            # (le frontend devrait les stocker dans le TestNode ou les envoyer)
                            parent_speaker = parent_content.get("parent_speaker") or parent_content.get("speaker") or "PNJ"
                            parent_line = parent_content.get("parent_line") or parent_content.get("line") or ""
                            
                            # Créer un choix factice avec le test pour appeler generate_nodes_for_choice_with_test
                            # Le texte du choix n'est pas nécessaire pour la génération, seul le test compte
                            choice_data = {"text": "", "test": test_value}
                            choice_content = UnityDialogueChoiceContent.model_validate(choice_data)
                            
                            # Normaliser l'ID du parent DialogueNode
                            normalized_parent_id = (
                                parent_dialogue_id
                                if parent_dialogue_id.startswith("NODE_")
                                else f"NODE_{parent_dialogue_id}"
                            )
                            
                            # Générer les 4 nœuds pour les 4 résultats de test
                            result = await generation_service.generate_nodes_for_choice_with_test(
                                llm_client=llm_client,
                                choice_content=choice_content,
                                parent_node_id=normalized_parent_id,
                                choice_index=choice_index,
                                instructions=user_instructions,
                                parent_speaker=parent_speaker,
                                parent_line=parent_line,
                                system_prompt_override=request_data.system_prompt_override
                            )
                            
                            generated_nodes = result["nodes"]
                            connection_data = result["connections"][0]
                            
                            # Créer les connexions suggérées pour les 4 résultats depuis le TestNode
                            suggested_connections = []
                            
                            test_result_mappings = [
                                ("testCriticalFailureNode", "critical-failure"),
                                ("testFailureNode", "failure"),
                                ("testSuccessNode", "success"),
                                ("testCriticalSuccessNode", "critical-success")
                            ]
                            
                            for field_name, handle_id in test_result_mappings:
                                target_node_id = connection_data.get(field_name)
                                if target_node_id:
                                    suggested_connections.append(
                                        SuggestedConnection(
                                            **{
                                                "from": test_node_id,
                                                "to": target_node_id,
                                                "via_choice_index": None,
                                                "connection_type": f"test-{handle_id}"
                                            }
                                        )
                                    )
                            
                            logger.info(
                                f"4 nœuds générés depuis TestNode: {test_node_id}, "
                                f"parent DialogueNode: {normalized_parent_id}, choice_index: {choice_index} "
                                f"(request_id: {request_id})"
                            )
                            
                            return GenerateNodeResponse(
                                node=generated_nodes[0] if generated_nodes else None,
                                nodes=generated_nodes,
                                suggested_connections=suggested_connections,
                                parent_node_id=request_data.parent_node_id
                            )
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Impossible d'extraire parent_id et choice_index depuis TestNode ID {test_node_id}: {e}")
                        # Continuer avec la génération normale
        
        # Si target_choice_index est fourni, vérifier si le choix a un test
        if request_data.target_choice_index is not None and parent_choices:
            choice_index = request_data.target_choice_index
            if not (0 <= choice_index < len(parent_choices)):
                raise ValidationException(
                    message=f"Index de choix invalide: {choice_index}.",
                    request_id=request_id
                )
            
            choice_data = parent_choices[choice_index]
            choice_has_test = choice_data.get("test") is not None
            
            # Si le choix a un test, générer 4 nœuds pour les 4 résultats
            if choice_has_test:
                try:
                    # Convertir le choix en UnityDialogueChoiceContent pour validation
                    choice_content = UnityDialogueChoiceContent.model_validate(choice_data)
                    
                    # Normaliser l'ID du parent
                    normalized_parent_id = (
                        request_data.parent_node_id
                        if request_data.parent_node_id.startswith("NODE_")
                        else f"NODE_{request_data.parent_node_id}"
                    )
                    
                    # Générer les 4 nœuds pour les 4 résultats de test
                    result = await generation_service.generate_nodes_for_choice_with_test(
                        llm_client=llm_client,
                        choice_content=choice_content,
                        parent_node_id=normalized_parent_id,
                        choice_index=choice_index,
                        instructions=user_instructions,
                        parent_speaker=parent_speaker,
                        parent_line=parent_line,
                        system_prompt_override=request_data.system_prompt_override
                    )
                    
                    generated_nodes = result["nodes"]
                    connection_data = result["connections"][0]
                    
                    # Créer les connexions suggérées pour les 4 résultats
                    # Le TestNode est créé automatiquement par le frontend, on doit créer les connexions
                    # depuis le TestNode vers les 4 nœuds avec les bons sourceHandle
                    suggested_connections = []
                    
                    # Trouver l'ID du TestNode (format: test-node-{parent_id}-choice-{index})
                    test_node_id = f"test-node-{normalized_parent_id}-choice-{choice_index}"
                    
                    # Créer 4 connexions depuis le TestNode vers les 4 nœuds avec les handles appropriés
                    test_result_mappings = [
                        ("testCriticalFailureNode", "critical-failure"),
                        ("testFailureNode", "failure"),
                        ("testSuccessNode", "success"),
                        ("testCriticalSuccessNode", "critical-success")
                    ]
                    
                    for field_name, handle_id in test_result_mappings:
                        target_node_id = connection_data.get(field_name)
                        if target_node_id:
                            suggested_connections.append(
                                SuggestedConnection(
                                    **{
                                        "from": test_node_id,
                                        "to": target_node_id,
                                        "via_choice_index": None,
                                        "connection_type": f"test-{handle_id}"
                                    }
                                )
                            )
                    
                    logger.info(
                        f"4 nœuds générés pour choix avec test: {choice_content.test}, "
                        f"parent: {request_data.parent_node_id} (request_id: {request_id})"
                    )
                    
                    return GenerateNodeResponse(
                        node=generated_nodes[0] if generated_nodes else None,
                        nodes=generated_nodes,
                        suggested_connections=suggested_connections,
                        parent_node_id=request_data.parent_node_id
                    )
                except Exception as e:
                    logger.error(f"Erreur lors de la génération de 4 nœuds pour choix avec test: {e}")
                    raise InternalServerException(
                        message=f"Erreur lors de la génération de 4 nœuds pour choix avec test: {str(e)}",
                        details={"error": str(e)},
                        request_id=request_id
                    )
            
            # Sinon, génération normale pour un choix sans test
            choice_text = choice_data.get("text", "")
            enriched_instructions = f"""Contexte précédent:
{parent_speaker}: {parent_line}

Réponse du joueur:
{choice_text}

Instructions pour la suite:
{user_instructions}
"""
        elif request_data.target_choice_index is not None and not parent_choices:
            raise ValidationException(
                message="Aucun choix disponible pour la génération d'un choix spécifique.",
                request_id=request_id
            )
        else:
            # Pas de choix spécifique (nextNode ou génération normale)
            enriched_instructions = f"""Contexte précédent:
{parent_speaker}: {parent_line}

Instructions pour la suite:
{user_instructions}
"""
        
        # Pour la génération normale, on utilise juste les instructions enrichies comme prompt string
        # (le service generate_dialogue_node attend un string, pas un BuiltPrompt)
        response = await generation_service.generate_dialogue_node(
            llm_client=llm_client,
            prompt=enriched_instructions,
            system_prompt_override=request_data.system_prompt_override,
            max_choices=request_data.max_choices
        )
        
        # Déterminer l'ID de départ selon le mode de génération
        normalized_parent_id = (
            request_data.parent_node_id
            if request_data.parent_node_id.startswith("NODE_")
            else f"NODE_{request_data.parent_node_id}"
        )
        if request_data.target_choice_index is not None:
            # Génération pour choix spécifique : utiliser format CHOICE_{index}
            start_id = f"{normalized_parent_id}_CHOICE_{request_data.target_choice_index}"
        elif parent_choices:
            # Génération pour choix (premier sans targetNode) : utiliser format CHILD
            start_id = f"{normalized_parent_id}_CHILD"
        else:
            # Génération nextNode (navigation linéaire) : utiliser format CHILD
            start_id = f"{normalized_parent_id}_CHILD"
        
        # Enrichir avec ID
        enriched_nodes = generation_service.enrich_with_ids(
            content=response,
            start_id=start_id
        )
        
        # Le premier nœud enrichi
        generated_node = enriched_nodes[0]
        
        # Créer les connexions suggérées
        suggested_connections = []
        
        # Connexion depuis le parent vers le nouveau nœud
        if request_data.target_choice_index is not None:
            # Connexion pour choix spécifique
            suggested_connections.append(
                SuggestedConnection(
                    **{
                        "from": request_data.parent_node_id,
                        "to": generated_node["id"],
                        "via_choice_index": request_data.target_choice_index,
                        "connection_type": "choice"
                    }
                )
            )
        elif parent_choices:
            # Suggérer de connecter le premier choix sans targetNode
            for i, choice in enumerate(parent_choices):
                if not choice.get("targetNode") or choice.get("targetNode") == "END":
                    suggested_connections.append(
                        SuggestedConnection(
                            **{
                                "from": request_data.parent_node_id,
                                "to": generated_node["id"],
                                "via_choice_index": i,
                                "connection_type": "choice"
                            }
                        )
                    )
                    break
        else:
            # Connexion via nextNode
            suggested_connections.append(
                SuggestedConnection(
                    **{
                        "from": request_data.parent_node_id,
                        "to": generated_node["id"],
                        "connection_type": "nextNode"
                    }
                )
            )
        
        logger.info(
            f"Nœud généré en contexte: {generated_node['id']}, "
            f"parent: {request_data.parent_node_id} (request_id: {request_id})"
        )
        
        return GenerateNodeResponse(
            node=generated_node,
            suggested_connections=suggested_connections,
            parent_node_id=request_data.parent_node_id
        )
        
    except ValidationException:
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de la génération de nœud (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la génération de nœud",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/validate",
    response_model=ValidateGraphResponse,
    status_code=status.HTTP_200_OK
)
async def validate_graph(
    request_data: ValidateGraphRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> ValidateGraphResponse:
    """Valide un graphe (nœuds orphelins, références cassées, cycles).
    
    Args:
        request_data: Nœuds et edges à valider.
        request_id: ID de la requête.
        
    Returns:
        Résultat de validation avec erreurs et warnings.
    """
    try:
        # Valider le graphe
        validation_result = GraphValidationService.validate_graph(
            request_data.nodes,
            request_data.edges
        )
        
        # Convertir en schéma Pydantic
        errors = [
            ValidationErrorDetail(**e.to_dict())
            for e in validation_result.errors
        ]
        
        warnings = [
            ValidationErrorDetail(**w.to_dict())
            for w in validation_result.warnings
        ]
        
        logger.info(
            f"Validation effectuée: {len(errors)} erreurs, "
            f"{len(warnings)} warnings (request_id: {request_id})"
        )
        
        return ValidateGraphResponse(
            valid=validation_result.valid,
            errors=errors,
            warnings=warnings
        )
        
    except Exception as e:
        logger.exception(f"Erreur lors de la validation (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de la validation du graphe",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/calculate-layout",
    response_model=CalculateLayoutResponse,
    status_code=status.HTTP_200_OK
)
async def calculate_layout(
    request_data: CalculateLayoutRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None
) -> CalculateLayoutResponse:
    """Calcule un layout automatique pour le graphe.
    
    Note: Pour Dagre, le calcul réel sera fait côté frontend avec dagre.js.
    Cette endpoint retourne un layout basique en cascade.
    
    Args:
        request_data: Nœuds, edges et paramètres de layout.
        request_id: ID de la requête.
        
    Returns:
        Nœuds avec positions calculées.
    """
    try:
        # Calculer le layout
        laid_out_nodes = GraphConversionService.calculate_layout(
            request_data.nodes,
            request_data.edges,
            request_data.algorithm,
            request_data.direction
        )
        
        logger.info(
            f"Layout calculé: {len(laid_out_nodes)} nœuds, "
            f"algorithme: {request_data.algorithm} (request_id: {request_id})"
        )
        
        return CalculateLayoutResponse(nodes=laid_out_nodes)
        
    except Exception as e:
        logger.exception(f"Erreur lors du calcul de layout (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du calcul de layout",
            details={"error": str(e)},
            request_id=request_id
        )


def _validate_dialogue_exists(
    dialogue_id: str,
    config_service: ConfigurationService,
    request_id: Optional[str],
) -> None:
    """Vérifie que le dialogue existe (fichier Unity). Skip si dialogue_id == 'current'."""
    if dialogue_id == "current":
        return
    fname = dialogue_id
    if ".." in fname or "/" in fname or "\\" in fname:
        raise ValidationException(
            message="Nom de fichier invalide (caractères interdits)",
            details={"dialogue_id": dialogue_id},
            request_id=request_id,
        )
    unity_path = config_service.get_unity_dialogues_path()
    if not unity_path:
        raise ValidationException(
            message="Le chemin Unity dialogues n'est pas configuré.",
            details={"field": "unity_dialogues_path"},
            request_id=request_id,
        )
    if not fname.endswith(".json"):
        fname = fname + ".json"
    path = Path(unity_path) / fname
    if not path.exists():
        raise NotFoundException(
            resource_type="Dialogue Unity",
            resource_id=fname,
            request_id=request_id,
        )


@router.post(
    "/nodes/{node_id}/accept",
    status_code=status.HTTP_200_OK
)
async def accept_node(
    node_id: str,
    request_data: AcceptNodeRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)] = None,
):
    """Accepte un nœud généré (passe de "pending" à "accepted").
    
    Validation-only: vérifie que le dialogue existe. La persistance (mise à jour
    du JSON avec status "accepted") est faite par le frontend via saveDialogue()
    après mise à jour optimiste du store.
    
    Args:
        node_id: ID du nœud à accepter.
        request_data: ID du dialogue.
        request_id: ID de la requête.
        config_service: Service de configuration (injecté).
        
    Returns:
        Succès de l'opération.
        
    Raises:
        NotFoundException: Si le dialogue est introuvable.
        ValidationException: Si dialogue_id invalide.
    """
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        logger.info(
            f"Nœud accepté: {node_id}, dialogue: {request_data.dialogue_id} "
            f"(request_id: {request_id})"
        )
        return {"success": True, "node_id": node_id, "status": "accepted"}
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.exception(f"Erreur lors de l'acceptation du nœud (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors de l'acceptation du nœud",
            details={"error": str(e)},
            request_id=request_id
        )


@router.post(
    "/nodes/{node_id}/reject",
    status_code=status.HTTP_200_OK
)
async def reject_node(
    node_id: str,
    request_data: RejectNodeRequest,
    request_id: Annotated[str, Depends(get_request_id)] = None,
    config_service: Annotated[ConfigurationService, Depends(get_config_service)] = None,
):
    """Rejette un nœud généré (supprime le nœud).
    
    Validation-only: vérifie que le dialogue existe. La persistance (suppression
    du nœud du JSON) est faite par le frontend après succès: mise à jour locale
    puis saveDialogue() pour persister immédiatement (AC#3).
    
    Args:
        node_id: ID du nœud à rejeter.
        request_data: ID du dialogue.
        request_id: ID de la requête.
        config_service: Service de configuration (injecté).
        
    Returns:
        Succès de l'opération.
        
    Raises:
        NotFoundException: Si le dialogue est introuvable.
        ValidationException: Si dialogue_id invalide.
    """
    try:
        _validate_dialogue_exists(
            request_data.dialogue_id, config_service, request_id
        )
        logger.info(
            f"Nœud rejeté: {node_id}, dialogue: {request_data.dialogue_id} "
            f"(request_id: {request_id})"
        )
        return {"success": True, "node_id": node_id, "status": "rejected"}
    except (NotFoundException, ValidationException):
        raise
    except Exception as e:
        logger.exception(f"Erreur lors du rejet du nœud (request_id: {request_id})")
        raise InternalServerException(
            message="Erreur lors du rejet du nœud",
            details={"error": str(e)},
            request_id=request_id
        )
