export const backendPort = process.env.E2E_API_PORT ?? '4243'
export const backendBaseUrl = process.env.E2E_API_BASE_URL ?? `http://localhost:${backendPort}`
