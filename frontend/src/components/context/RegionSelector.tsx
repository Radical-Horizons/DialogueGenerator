/**
 * Composant pour sélectionner une région et ses sous-lieux.
 */
import { useState, useEffect } from 'react'
import * as contextAPI from '../../api/context'
import { useContextStore } from '../../store/contextStore'
import { getErrorMessage } from '../../types/errors'
import { theme } from '../../theme'

export function RegionSelector() {
  const [regions, setRegions] = useState<string[]>([])
  const [subLocations, setSubLocations] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { selectedRegion, selectedSubLocations, setRegion, toggleSubLocation } = useContextStore()

  useEffect(() => {
    loadRegions()
  }, [])

  useEffect(() => {
    if (selectedRegion) {
      loadSubLocations(selectedRegion)
    } else {
      setSubLocations([])
    }
  }, [selectedRegion])

  const loadRegions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await contextAPI.listRegions()
      setRegions(response.regions)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const loadSubLocations = async (regionName: string) => {
    setError(null)
    try {
      const response = await contextAPI.getSubLocations(regionName)
      setSubLocations(response.sub_locations)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div style={{ padding: '1rem', borderTop: `1px solid ${theme.border.primary}` }}>
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 'bold' }}>
        Lieux et sous-lieux
      </h3>
      
      {error && (
        <div style={{ 
          padding: '0.5rem', 
          backgroundColor: theme.state.error.background, 
          color: theme.state.error.color, 
          fontSize: '0.9rem',
          marginBottom: '0.5rem'
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          Région:
        </label>
        <select
          value={selectedRegion || ''}
          onChange={(e) => setRegion(e.target.value || null)}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '0.5rem',
            fontSize: '0.9rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.background.primary,
            color: theme.text.primary,
          }}
        >
          <option value="">-- Aucune région --</option>
          {regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>

      {selectedRegion && (
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            Sous-lieux:
          </label>
          {subLocations.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: theme.text.secondary, fontStyle: 'italic' }}>
              Aucun sous-lieu disponible pour cette région
            </div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {subLocations.map((subLoc) => (
                <label
                  key={subLoc}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem 0',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedSubLocations.includes(subLoc)}
                    onChange={() => toggleSubLocation(subLoc)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  <span style={{ fontSize: '0.9rem' }}>{subLoc}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}



