"""Service pour générer des dialogues au format Unity JSON."""
import asyncio
import logging
import uuid
from typing import List, Dict, Any, Optional

from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
    UnityDialogueChoiceContent
)
from core.llm.llm_client import ILLMClient
from services.document_choice_id_service import stable_choice_id
from services.unity_export_normalizer import normalize_unity_export_document

logger = logging.getLogger(__name__)


def generate_stable_node_id() -> str:
    """Retourne un identifiant stable unique pour un nœud (schema v1.2.0)."""
    return f"node-{uuid.uuid4().hex}"


def resolve_generated_display_name(
    content: UnityDialogueGenerationResponse,
    start_id: str,
    *,
    fallback_title: Optional[str] = None,
) -> str:
    """Résout le ``displayName`` FR36 pour un nœud généré.

    Priorité : ``fallback_title`` (ex. label résultat de test) → ``node.displayName``
    (LLM) → ``content.title`` → première ligne de ``line`` → ``start_id``.
    """
    node = content.node
    candidates = (
        (fallback_title or "").strip(),
        (node.displayName or "").strip(),
        (content.title or "").strip(),
    )
    for value in candidates:
        if value:
            return value
    line = (node.line or "").strip()
    if line:
        first_line = line.split("\n", 1)[0].strip()
        if first_line:
            return first_line
    return start_id


class UnityDialogueGenerationService:
    """Service pour générer des dialogues au format Unity JSON.
    
    Utilise Structured Output pour que l'IA génère uniquement le contenu créatif,
    puis enrichit automatiquement avec les IDs techniques et la navigation.
    """
    
    def __init__(self):
        """Initialise le service."""
        logger.info("UnityDialogueGenerationService initialisé")
    
    async def generate_dialogue_fragment(
        self,
        llm_client: ILLMClient,
        prompt: str,
        system_prompt_override: Optional[str] = None,
    ) -> "UnityDialogueFragmentResponse":
        """Génère un fragment complet — panneau d'ouverture, options, et suites — en un appel.

        Le chemin d'appel est identique à celui du nœud unique : même
        ``generate_variants``, donc même comptabilité de coût et même plafond
        budgétaire. Seul le modèle de réponse change.

        Args:
            llm_client: Client LLM.
            prompt: Prompt utilisateur.
            system_prompt_override: Surcharge du system prompt.

        Returns:
            Le fragment généré, à clés locales, sans aucun identifiant Unity.

        Raises:
            ValueError: Si le modèle n'a pas produit de structured output exploitable.
        """
        from models.dialogue_structure.unity_dialogue_fragment import (
            UnityDialogueFragmentResponse,
        )

        logger.info("Génération d'un fragment de dialogue Unity via Structured Output")
        variants = await llm_client.generate_variants(
            prompt=prompt,
            k=1,
            response_model=UnityDialogueFragmentResponse,
            user_system_prompt_override=system_prompt_override,
        )
        if not variants:
            raise ValueError("Aucune variante générée par le LLM")

        result = variants[0]
        model_name = getattr(llm_client, "model_name", "unknown")
        if isinstance(result, str):
            # Le client OpenAI renvoie les erreurs de validation comme chaînes dans
            # la liste des variantes : sans ce test, elles passeraient pour un succès.
            raise ValueError(
                f"Le modèle '{model_name}' n'a pas retourné de structured output "
                f"exploitable pour le fragment. Détails : {result[:400]}"
            )
        if isinstance(result, dict):
            result = UnityDialogueFragmentResponse.model_validate(result)
        if not isinstance(result, UnityDialogueFragmentResponse):
            raise ValueError(
                f"Type de réponse inattendu pour le fragment : {type(result)}. "
                f"Modèle utilisé : {model_name}."
            )
        return result

    async def generate_dialogue_node(
        self,
        llm_client: ILLMClient,
        prompt: str,
        system_prompt_override: Optional[str] = None,
        max_choices: Optional[int] = None
    ) -> UnityDialogueGenerationResponse:
        """Génère un nœud de dialogue via Structured Output.
        
        Args:
            llm_client: Client LLM pour la génération.
            prompt: Prompt utilisateur pour la génération.
            system_prompt_override: Surcharge du system prompt (optionnel).
            max_choices: Nombre maximum de choix à générer (0-8, ou None pour laisser l'IA décider).
            
        Returns:
            Réponse contenant les nœuds générés par l'IA (sans IDs techniques).
        """
        logger.info("Génération d'un nœud de dialogue Unity via Structured Output")
        
        # Utiliser Structured Output avec le modèle UnityDialogueGenerationResponse
        variants = await llm_client.generate_variants(
            prompt=prompt,
            k=1,
            response_model=UnityDialogueGenerationResponse,
            user_system_prompt_override=system_prompt_override
        )
        
        if not variants or len(variants) == 0:
            raise ValueError("Aucune variante générée par le LLM")
        
        result = variants[0]
        
        # Détecter si le résultat est une chaîne d'erreur (cas où le modèle n'a pas retourné de structured output)
        if isinstance(result, str):
            model_name = getattr(llm_client, 'model_name', 'unknown')
            if result.startswith("Erreur:"):
                # Erreur retournée par le LLM client
                error_msg = (
                    f"Le modèle '{model_name}' n'a pas retourné de structured output (JSON structuré). "
                    f"Le modèle a retourné du texte au lieu d'un format JSON valide. "
                    f"Détails techniques: {result}"
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
            else:
                # Autre type de chaîne (texte libre, pas une erreur)
                error_msg = (
                    f"Le modèle '{model_name}' a retourné du texte libre au lieu d'un structured output (JSON). "
                    f"Un structured output est requis pour générer des dialogues Unity. "
                    f"Vérifiez les logs pour voir les paramètres API envoyés et la réponse reçue. "
                    f"Réponse reçue (premiers 200 caractères): {result[:200]}"
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
        
        # Gérer le cas où DummyLLMClient retourne un dict au lieu d'un modèle Pydantic
        if isinstance(result, dict):
            logger.warning("DummyLLMClient a retourné un dict, conversion en UnityDialogueGenerationResponse")
            try:
                result = UnityDialogueGenerationResponse.model_validate(result)
            except Exception as e:
                logger.error(f"Erreur lors de la conversion du dict en UnityDialogueGenerationResponse: {e}")
                raise ValueError(f"Impossible de convertir le résultat en UnityDialogueGenerationResponse: {e}")
        
        if not isinstance(result, UnityDialogueGenerationResponse):
            model_name = getattr(llm_client, 'model_name', 'unknown')
            error_msg = (
                f"Type de réponse inattendu: {type(result)}. Attendu: UnityDialogueGenerationResponse. "
                f"Modèle utilisé: {model_name}. "
                f"Le modèle n'a pas retourné un structured output valide. "
                f"Vérifiez les logs pour voir les paramètres API envoyés et la réponse complète."
            )
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Validation : vérifier que le nœud a du contenu
        node = result.node
        if not node.choices and not node.line:
            logger.warning(
                "Le nœud généré n'a ni choices ni line. "
                "Le dialogue se terminera à ce nœud."
            )
        
        # Valider et limiter le nombre de choix si max_choices est spécifié
        if max_choices is not None:
            if node.choices:
                if max_choices == 0:
                    logger.warning(
                        f"max_choices=0 mais le nœud a {len(node.choices)} choix. "
                        "Suppression des choix."
                    )
                    node.choices = None
                elif len(node.choices) > max_choices:
                    logger.warning(
                        f"Le nœud a {len(node.choices)} choix, mais max_choices={max_choices}. "
                        f"Troncature à {max_choices} choix."
                    )
                    node.choices = node.choices[:max_choices]
        else:
            # Quand max_choices est None (libre), valider que le nœud a entre 2 et 8 choix
            # Note: Si node.choices est None, c'est un nœud de fin valide (pas de validation)
            # Si node.choices est une liste (vide ou avec éléments), on valide
            if node.choices is not None:
                num_choices = len(node.choices)
                if num_choices == 0:
                    logger.error(
                        "max_choices est libre (None) mais le nœud a une liste vide de choix. "
                        "Quand max_choices est libre, le nœud doit avoir entre 2 et 8 choix, "
                        "ou None pour un nœud de fin."
                    )
                    raise ValueError(
                        "Quand 'Nombre max de choix' est vide (libre), le nœud doit avoir entre 2 et 8 choix, "
                        "mais le nœud généré a une liste vide de choix."
                    )
                elif num_choices == 1:
                    logger.error(
                        "max_choices est libre (None) mais le nœud a seulement 1 choix. "
                        "Quand max_choices est libre, le nœud doit avoir entre 2 et 8 choix."
                    )
                    raise ValueError(
                        "Quand 'Nombre max de choix' est vide (libre), le nœud doit avoir entre 2 et 8 choix, "
                        f"mais le nœud généré a seulement {num_choices} choix."
                    )
                elif num_choices > 8:
                    logger.warning(
                        f"max_choices est libre (None) mais le nœud a {num_choices} choix (> 8). "
                        "Troncature à 8 choix."
                    )
                    node.choices = node.choices[:8]
        
        logger.info("Nœud généré avec succès")
        return result

    def normalize_generation_response(
        self,
        result: Any,
        max_choices: Optional[int] = None,
    ) -> UnityDialogueGenerationResponse:
        """Valide et normalise une réponse de génération déjà produite.

        Le streaming natif retourne directement le modèle final, sans repasser par
        ``generate_dialogue_node``. Cette méthode partage donc les invariants de
        type et de cardinalité des choix avec le chemin non-streaming.

        Args:
            result: Réponse brute retournée par le client LLM.
            max_choices: Nombre maximum de choix autorisé.

        Returns:
            Réponse Pydantic validée et éventuellement tronquée.

        Raises:
            ValueError: Si la réponse n'est pas un structured output valide.
        """
        if isinstance(result, str):
            if result.startswith("Erreur:"):
                raise ValueError(
                    "Le modèle n'a pas retourné de structured output (JSON structuré). "
                    f"Détails techniques: {result}"
                )
            raise ValueError(
                "Le modèle a retourné du texte libre au lieu d'un structured output (JSON). "
                f"Réponse reçue (premiers 200 caractères): {result[:200]}"
            )

        if isinstance(result, dict):
            logger.warning(
                "Le client LLM a retourné un dict, conversion en UnityDialogueGenerationResponse"
            )
            try:
                result = UnityDialogueGenerationResponse.model_validate(result)
            except Exception as exc:
                logger.error(
                    "Erreur lors de la conversion du dict en UnityDialogueGenerationResponse: %s",
                    exc,
                )
                raise ValueError(
                    "Impossible de convertir le résultat en UnityDialogueGenerationResponse: "
                    f"{exc}"
                ) from exc

        if not isinstance(result, UnityDialogueGenerationResponse):
            raise ValueError(
                "Type de réponse inattendu: "
                f"{type(result)}. Attendu: UnityDialogueGenerationResponse."
            )

        node = result.node
        if not node.choices and not node.line:
            logger.warning(
                "Le nœud généré n'a ni choices ni line. "
                "Le dialogue se terminera à ce nœud."
            )

        if max_choices is not None:
            if node.choices:
                if max_choices == 0:
                    logger.warning(
                        "max_choices=0 mais le nœud a %s choix. Suppression des choix.",
                        len(node.choices),
                    )
                    node.choices = None
                elif len(node.choices) > max_choices:
                    logger.warning(
                        "Le nœud a %s choix, mais max_choices=%s. Troncature.",
                        len(node.choices),
                        max_choices,
                    )
                    node.choices = node.choices[:max_choices]
            return result

        if node.choices is not None:
            num_choices = len(node.choices)
            if num_choices == 0:
                raise ValueError(
                    "Quand 'Nombre max de choix' est vide (libre), le nœud doit avoir entre "
                    "2 et 8 choix, mais le nœud généré a une liste vide de choix."
                )
            if num_choices == 1:
                raise ValueError(
                    "Quand 'Nombre max de choix' est vide (libre), le nœud doit avoir entre "
                    f"2 et 8 choix, mais le nœud généré a seulement {num_choices} choix."
                )
            if num_choices > 8:
                logger.warning(
                    "max_choices est libre (None) mais le nœud a %s choix (> 8). Troncature à 8 choix.",
                    num_choices,
                )
                node.choices = node.choices[:8]

        return result
    
    async def generate_nodes_for_choice_with_test(
        self,
        llm_client: ILLMClient,
        choice_content: UnityDialogueChoiceContent,
        parent_node_id: str,
        choice_index: int,
        instructions: str,
        parent_speaker: str = "PNJ",
        parent_line: str = "",
        system_prompt_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """Génère 4 nœuds pour un choix avec attribut test.
        
        AC: #1, #3 - Génération de 4 réponses (échec critique, échec, réussite, réussite critique).
        
        Args:
            llm_client: Client LLM pour la génération.
            choice_content: Contenu du choix avec attribut test.
            parent_node_id: ID du nœud parent.
            choice_index: Index du choix dans le nœud parent.
            instructions: Instructions pour la génération.
            parent_speaker: Speaker du nœud parent.
            parent_line: Ligne de dialogue du nœud parent.
            system_prompt_override: Surcharge du system prompt (optionnel).
            
        Returns:
            Dictionnaire contenant:
            - "nodes": Liste de 4 nœuds enrichis (critical-failure, failure, success, critical-success)
            - "connections": Liste avec une connexion contenant les 4 champs test*Node
        """
        if not choice_content.test:
            raise ValueError("Le choix doit avoir un attribut test pour générer 4 nœuds")
        
        logger.info(f"Génération de 4 nœuds pour choix avec test: {choice_content.test}")
        
        # Extraire DD du test (format: Attribut+Compétence:DD)
        try:
            test_parts = choice_content.test.split(":")
            if len(test_parts) != 2:
                raise ValueError(f"Format de test invalide: {choice_content.test}")
            dd = int(test_parts[1])
        except (ValueError, IndexError) as e:
            logger.warning(f"Impossible d'extraire DD du test {choice_content.test}, utilisation de DD=8 par défaut")
            dd = 8
        
        # Prompts pour chaque résultat
        result_contexts = [
            {
                "name": "critical-failure",
                "label": "Échec critique",
                "description": f"Le joueur a échoué de manière critique (score < {dd} - 5). La réponse doit être très négative avec des conséquences graves.",
                "node_id_suffix": "CRITICAL_FAILURE"
            },
            {
                "name": "failure",
                "label": "Échec",
                "description": f"Le joueur a échoué (score >= {dd} - 5 et < {dd}). La réponse doit être négative avec des conséquences modérées.",
                "node_id_suffix": "FAILURE"
            },
            {
                "name": "success",
                "label": "Réussite",
                "description": f"Le joueur a réussi (score >= {dd} et < {dd} + 5). La réponse doit être positive avec des conséquences favorables.",
                "node_id_suffix": "SUCCESS"
            },
            {
                "name": "critical-success",
                "label": "Réussite critique",
                "description": f"Le joueur a réussi de manière exceptionnelle (score >= {dd} + 5). La réponse doit être très positive avec des conséquences exceptionnelles.",
                "node_id_suffix": "CRITICAL_SUCCESS"
            }
        ]
        
        # Générer les 4 nœuds en parallèle (réduit le temps total vs 4 appels séquentiels)
        async def generate_one(
            result_context: Dict[str, str],
        ) -> tuple[str, List[Dict[str, Any]]]:
            enriched_prompt = f"""Contexte précédent:
{parent_speaker}: {parent_line}

Réponse du joueur:
{choice_content.text}

Test d'attribut: {choice_content.test} (DD={dd})

Résultat du test: {result_context["label"]}
{result_context["description"]}

Instructions pour la suite:
{instructions}
"""
            response = await self.generate_dialogue_node(
                llm_client=llm_client,
                prompt=enriched_prompt,
                system_prompt_override=system_prompt_override,
                max_choices=None,
            )
            node_id = generate_stable_node_id()
            enriched = self.enrich_with_ids(
                content=response,
                start_id=node_id,
                display_name_override=result_context["label"],
            )
            return node_id, enriched or []

        results = await asyncio.gather(
            *[generate_one(rc) for rc in result_contexts],
            return_exceptions=False,
        )
        generated_nodes = []
        node_ids = {}
        for result_context, (node_id, enriched) in zip(result_contexts, results):
            node_ids[result_context["name"]] = node_id
            generated_nodes.extend(enriched)

        # Créer la connexion avec les 4 champs
        connection = {
            "from": parent_node_id,
            "choice_index": choice_index,
            "testCriticalFailureNode": node_ids["critical-failure"],
            "testFailureNode": node_ids["failure"],
            "testSuccessNode": node_ids["success"],
            "testCriticalSuccessNode": node_ids["critical-success"]
        }
        
        logger.info(f"Génération terminée: 4 nœuds créés pour choix avec test")
        return {
            "nodes": generated_nodes,
            "connections": [connection]
        }
    
    def enrich_with_ids(
        self,
        content: UnityDialogueGenerationResponse,
        start_id: str = "START",
        test_result_node_ids: Optional[Dict[str, str]] = None,
        display_name_override: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Ajoute les IDs techniques et gère la navigation.
        
        Pour le nœud unique :
        1. Génère un ID unique (START par défaut)
        2. Ajoute targetNode: "END" pour chaque choix (champ technique géré par l'application)
        3. Garantit un ``displayName`` (LLM, override, title, line, ou id)
        4. Convertit en dict pour UnityJsonRenderer
        
        Note: Les champs techniques (targetNode, nextNode, successNode, etc.) ne sont jamais
        générés par l'IA. Ils sont gérés uniquement par l'application.
        
        IMPORTANT - "END" comme marqueur de fin (pas un vrai nœud) :
        Le nœud "END" est utilisé par défaut comme placeholder temporaire car on génère
        un fragment de dialogue sans savoir ce qui suivra. C'est un artifice temporaire
        pour que le JSON soit valide. Si on génère la suite du dialogue plus tard,
        les targetNode seront mis à jour pour pointer vers les vrais nœuds suivants.
        
        Le nœud "END" peut aussi être la fin définitive si c'est vraiment une scène d'au revoir,
        mais ce n'est pas le problème du logiciel - c'est l'auteur qui décide.
        
        Le nœud "END" est reconnu par Unity comme marqueur de fin spécial. Il n'est PAS créé
        comme nœud explicite dans le JSON car Unity le gère implicitement. Le validateur
        accepte "END" comme référence valide même sans nœud explicite, et l'interface
        d'édition filtre "END" de l'affichage car ce n'est pas un vrai nœud éditable.
        
        Args:
            content: Réponse de génération contenant un nœud sans ID.
            start_id: ID à utiliser pour le nœud (par défaut "START").
            test_result_node_ids: Mapping optionnel des 4 résultats de test.
            display_name_override: Libellé forcé (ex. label d'un résultat de test).
            
        Returns:
            Liste avec un seul dictionnaire représentant le nœud Unity avec ID :
            - [START] (END n'est pas créé car Unity le gère implicitement)
        """
        logger.info("Enrichissement du nœud avec ID technique")
        
        node_content = content.node
        
        # Convertir le nœud en dict
        node_dict: Dict[str, Any] = {
            "id": start_id,
            "displayName": resolve_generated_display_name(
                content,
                start_id,
                fallback_title=display_name_override,
            ),
        }
        
        # Ajouter les champs du contenu
        if node_content.speaker:
            node_dict["speaker"] = node_content.speaker
        if node_content.line:
            node_dict["line"] = node_content.line
        if node_content.test:
            node_dict["test"] = node_content.test
        if node_content.consequences:
            node_dict["consequences"] = {
                "flag": node_content.consequences.flag
            }
            if node_content.consequences.description:
                node_dict["consequences"]["description"] = node_content.consequences.description
        if node_content.isLongRest is not None:
            node_dict["isLongRest"] = node_content.isLongRest
        if node_content.startState is not None:
            node_dict["startState"] = node_content.startState
        
        # Gérer les choix
        if node_content.choices:
            choices_list = []
            for choice_index, choice_content in enumerate(node_content.choices):
                choice_dict: Dict[str, Any] = {
                    "choiceId": stable_choice_id(start_id, choice_index),
                    "text": choice_content.text,
                    "targetNode": "END"  # Placeholder temporaire : sera mis à jour si on génère la suite
                }
                
                # Ajouter les champs optionnels du choix (champs créatifs que l'IA peut générer)
                if choice_content.test:
                    choice_dict["test"] = choice_content.test
                    # Si test_result_node_ids est fourni, établir les 4 connexions
                    if test_result_node_ids:
                        choice_dict["testCriticalFailureNode"] = test_result_node_ids.get("critical-failure")
                        choice_dict["testFailureNode"] = test_result_node_ids.get("failure")
                        choice_dict["testSuccessNode"] = test_result_node_ids.get("success")
                        choice_dict["testCriticalSuccessNode"] = test_result_node_ids.get("critical-success")
                if choice_content.traitRequirements:
                    choice_dict["traitRequirements"] = [
                        tr.model_dump(mode="json") for tr in choice_content.traitRequirements
                    ]
                if choice_content.allowInfluenceForcing is not None:
                    choice_dict["allowInfluenceForcing"] = choice_content.allowInfluenceForcing
                if choice_content.influenceThreshold is not None:
                    choice_dict["influenceThreshold"] = choice_content.influenceThreshold
                if choice_content.influenceDelta is not None:
                    choice_dict["influenceDelta"] = choice_content.influenceDelta
                if choice_content.respectDelta is not None:
                    choice_dict["respectDelta"] = choice_content.respectDelta
                if choice_content.condition:
                    choice_dict["condition"] = choice_content.condition
                
                choices_list.append(choice_dict)
            
            node_dict["choices"] = choices_list
        
        # Note: nextNode, successNode, failureNode, testSuccessNode, testFailureNode
        # sont des champs techniques qui ne doivent pas être générés par l'IA
        # Ils seront gérés par l'application si nécessaire
        
        # Ne pas créer de nœud "END" explicite : Unity gère "END" implicitement comme marqueur de fin.
        # Le validateur accepte "END" comme référence valide même sans nœud explicite.
        # Cela évite d'afficher un nœud "END" éditable dans l'interface, car ce n'est pas un vrai nœud.
        logger.info("Enrichissement terminé: nœud avec ID")
        normalized = normalize_unity_export_document(
            {"schemaVersion": "1.2.0", "nodes": [node_dict]},
        )
        return normalized["nodes"]

