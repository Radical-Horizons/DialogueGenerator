/**
 * Détecte un flux SSE muet. Le serveur bat toutes les `SSE_HEARTBEAT_SECONDS` (5 s,
 * événement `ping`) ; un proxy — Vite en dev, nginx en prod — peut garder la connexion
 * du navigateur ouverte alors que l'API est tombée, et `EventSource` ne signale alors
 * rien. Sans nouvelles pendant ce délai, la connexion est tenue pour perdue.
 */
export const SSE_STALL_TIMEOUT_MS = 15_000

export const SSE_HEARTBEAT_EVENT = 'ping'

export interface StallWatchdog {
  /** Signe de vie reçu (message, battement, ouverture) : le délai repart. */
  kick: () => void
  stop: () => void
}

export function createStallWatchdog(onStall: () => void, timeoutMs = SSE_STALL_TIMEOUT_MS): StallWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const stop = (): void => {
    stopped = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  const kick = (): void => {
    if (stopped) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (!stopped) onStall()
    }, timeoutMs)
  }
  kick()
  return { kick, stop }
}
