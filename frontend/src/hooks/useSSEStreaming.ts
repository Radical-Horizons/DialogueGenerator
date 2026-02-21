/**
 * Hook React pour gérer le streaming SSE (Server-Sent Events).
 * 
 * Connecte à un endpoint SSE, parse les événements JSON,
 * et dispatch les mises à jour vers le store Zustand.
 * 
 * Version améliorée avec error debouncing et callbacks personnalisés.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useGenerationStore } from '../store/generationStore'

export interface UseSSEStreamingOptions {
  /** Callback appelé lors de l'événement 'complete' avec le résultat */
  onComplete?: (result: unknown) => Promise<void> | void
  /** Callback appelé lors de l'événement 'metadata' avec les tokens */
  onMetadata?: (metadata: { tokens?: number }) => void
  /** Callback appelé lors d'une erreur (après debounce) */
  onError?: (error: string) => void
  /** Callback appelé quand isLoading doit changer */
  setIsLoading?: (loading: boolean) => void
  /** Toast function pour afficher les messages */
  toast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
}

export interface UseSSEStreamingReturn {
  /** Connecter au stream SSE avec un jobId */
  connect: (jobId: string) => void
  /** Déconnecter du stream SSE */
  disconnect: () => void
  /** EventSource instance (pour tests) */
  eventSource: EventSource | null
  /** État de connexion */
  isConnected: boolean
  /** Erreur de connexion */
  connectionError: string | null
}

/**
 * Hook pour streamer la génération LLM via SSE.
 * 
 * Pattern amélioré :
 * - Connection manuelle via connect(jobId)
 * - Error debouncing (600ms) pour éviter faux positifs
 * - Callbacks personnalisables pour 'complete' et 'metadata'
 * - Gestion de race conditions avec refs
 * 
 * @param options - Options avec callbacks personnalisés
 * @returns Méthodes connect/disconnect et état de connexion
 * 
 * @example
 * ```tsx
 * const { connect, disconnect, isConnected } = useSSEStreaming({
 *   onComplete: async (result) => {
 *     await loadDialogue(result.json_content)
 *   },
 *   setIsLoading: (loading) => setIsLoading(loading)
 * })
 * 
 * // Connecter quand jobId est disponible
 * useEffect(() => {
 *   if (jobId) {
 *     connect(jobId)
 *   }
 *   return () => disconnect()
 * }, [jobId, connect, disconnect])
 * ```
 */
export function useSSEStreaming(options: UseSSEStreamingOptions = {}): UseSSEStreamingReturn {
  const {
    onComplete,
    onMetadata,
    onError,
    setIsLoading,
    toast,
  } = options

  const [eventSource, setEventSource] = useState<EventSource | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  // Refs pour éviter les re-renders et gérer les race conditions
  const eventSourceRef = useRef<EventSource | null>(null)
  const closedByClientRef = useRef(false)
  const hasReceivedCompleteRef = useRef(false)  // FIX: Flag séparé pour ignorer step après complete
  const sseHasReceivedAnyMessageRef = useRef(false)
  const sseErrorDebounceTimerRef = useRef<number | null>(null)
  
  // Actions du store
  const {
    appendChunk,
    setStep,
    complete,
    setError: setStreamError,
    setTokensUsed,
    setUnityDialogueResponse,
    setRawPrompt,
  } = useGenerationStore()

  const connect = useCallback((jobId: string) => {
    // Ne pas créer plusieurs EventSource
    if (eventSourceRef.current) {
      return
    }
    const streamUrl = `/api/v1/dialogues/generate/jobs/${jobId}/stream`
    const es = new EventSource(streamUrl)
    // Désactiver la reconnexion automatique d'EventSource (fonctionnalité de génération multiple désactivée)
    // EventSource se reconnecte automatiquement par défaut, ce qui peut causer des générations multiples
    // On gère manuellement la fermeture après 'complete' pour éviter les reconnexions
    eventSourceRef.current = es
    setEventSource(es)
    closedByClientRef.current = false
    hasReceivedCompleteRef.current = false  // FIX: Réinitialiser le flag complete
    sseHasReceivedAnyMessageRef.current = false

    const handleMessage = async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        sseHasReceivedAnyMessageRef.current = true
        
        // Dispatcher selon le type d'événement SSE
        switch (data.type) {
          case 'chunk':
            if (data.content) {
              appendChunk(data.content, data.sequence)
            }
            break
            
          case 'step':
            // FIX: Ignorer les événements 'step' après 'complete' pour éviter d'écraser 'Complete' avec 'Validating'
            // (Certains événements peuvent arriver dans le désordre à cause du buffering réseau)
            if (hasReceivedCompleteRef.current) {
              break
            }
            if (data.step) {
              setStep(data.step)
            }
            break
            
          case 'metadata':
            console.debug('SSE metadata:', data)
            if (data.tokens) {
              setTokensUsed(data.tokens)
            }
            // Appeler callback personnalisé si fourni
            if (onMetadata) {
              onMetadata({ tokens: data.tokens })
            }
            break
            
          case 'complete':
            // FIX: Marquer IMMÉDIATEMENT qu'on a reçu complete pour ignorer les step suivants
            hasReceivedCompleteRef.current = true
            // FIX: Marquer comme fermé mais NE PAS fermer immédiatement pour laisser les événements en transit arriver
            // (Certains événements comme 'step: Validating' peuvent arriver après 'complete' à cause du buffering)
            closedByClientRef.current = true
            if (sseErrorDebounceTimerRef.current !== null) {
              window.clearTimeout(sseErrorDebounceTimerRef.current)
              sseErrorDebounceTimerRef.current = null
            }
            // Fermer après un court délai pour laisser les événements en transit arriver
            setTimeout(() => {
              if (eventSourceRef.current === es) {
                es.close()
                eventSourceRef.current = null
                setEventSource(null)
                setIsConnected(false)
              }
            }, 500) // Délai de 500ms pour laisser les événements en transit arriver
            
            // Le résultat Unity JSON est dans data.result
            if (data.result) {
              setUnityDialogueResponse(data.result)
              
              if (data.result.raw_prompt && data.result.estimated_tokens && data.result.prompt_hash) {
                setRawPrompt(
                  data.result.raw_prompt,
                  data.result.estimated_tokens,
                  data.result.prompt_hash,
                  false,
                  data.result.structured_prompt || null
                )
              }

              // Appeler callback personnalisé (peut charger le graphe, etc.) - fire-and-forget après fermeture
              if (onComplete) {
                // Fire-and-forget : ne pas await pour éviter de bloquer, EventSource déjà fermé
                onComplete(data.result).catch((err) => {
                  console.warn('Erreur dans onComplete callback:', err)
                })
              }
              
              if (toast) {
                toast('Génération Unity JSON réussie!', 'success')
              }
            }
            
            complete()
            if (setIsLoading) {
              setIsLoading(false)
            }
            // Arrêter le traitement après complete (pas de génération multiple)
            break
            
          case 'error':
            if (data.message) {
              setStreamError(data.message)
              if (toast) {
                toast(data.message, 'error')
              }
            }
            
            if (setIsLoading) {
              setIsLoading(false)
            }
            
            closedByClientRef.current = true
            if (sseErrorDebounceTimerRef.current !== null) {
              window.clearTimeout(sseErrorDebounceTimerRef.current)
              sseErrorDebounceTimerRef.current = null
            }
            es.close()
            eventSourceRef.current = null
            setEventSource(null)
            setIsConnected(false)
            break
        }
      } catch (err) {
        console.warn('Erreur parsing SSE:', err)
      }
    }
    
    es.onmessage = (event) => {
      void handleMessage(event)
    }
    
    es.onerror = () => {
      if (closedByClientRef.current || es.readyState === EventSource.CLOSED) {
        return
      }
      
      // Error debouncing : EventSource déclenche souvent onerror lors d'une fermeture "normale"
      // (EOF côté serveur → tentative de reconnexion). Pour éviter un faux toast juste
      // avant un événement "complete", on débounce l'erreur et on l'annule si la
      // génération se termine.
      if (sseErrorDebounceTimerRef.current !== null) {
        return
      }

      sseErrorDebounceTimerRef.current = window.setTimeout(() => {
        sseErrorDebounceTimerRef.current = null

        if (closedByClientRef.current || es.readyState === EventSource.CLOSED) {
          return
        }

        // Si on a déjà reçu des messages, c'est probablement un close/reconnect transitoire.
        // On évite d'alarmer l'utilisateur avec un toast "erreur serveur" dans ce cas.
        if (sseHasReceivedAnyMessageRef.current) {
          console.debug('EventSource error after messages; ignoring toast.')
          return
        }
        console.error('Erreur EventSource')
        const errorMsg = 'Erreur de connexion au serveur'
        setStreamError(errorMsg)
        setConnectionError(errorMsg)
        setIsConnected(false)
        
        if (onError) {
          onError(errorMsg)
        }
        
        if (toast) {
          toast(errorMsg, 'error')
        }
        
        if (setIsLoading) {
          setIsLoading(false)
        }
        
        closedByClientRef.current = true
        es.close()
        eventSourceRef.current = null
        setEventSource(null)
      }, 600)
    }

    es.onopen = () => {
      setIsConnected(true)
      setConnectionError(null)
    }
  }, [appendChunk, setStep, complete, setStreamError, setTokensUsed, setUnityDialogueResponse, setRawPrompt, onComplete, onMetadata, onError, setIsLoading, toast])

  const disconnect = useCallback(() => {
    if (sseErrorDebounceTimerRef.current !== null) {
      window.clearTimeout(sseErrorDebounceTimerRef.current)
      sseErrorDebounceTimerRef.current = null
    }
    
    if (eventSourceRef.current) {
      closedByClientRef.current = true
      hasReceivedCompleteRef.current = false  // Réinitialiser le flag
      if (eventSourceRef.current.readyState !== EventSource.CLOSED) {
        eventSourceRef.current.close()
      }
      eventSourceRef.current = null
      setEventSource(null)
      setIsConnected(false)
    }
  }, [])

  // Cleanup sur unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connect,
    disconnect,
    eventSource,
    isConnected,
    connectionError,
  }
}
