import { describe, it, expect } from 'vitest'

import { screen } from '@testing-library/react'

import { makeMockToolbar, mockNarrowToolbar, renderGraphEditorHeader } from './graphEditorHeaderTestUtils'



describe('GraphEditorHeader - SearchRow', () => {

  it('renders SearchRow when showSearchBar is true and hides legacy search button', () => {

    mockNarrowToolbar(true)

    renderGraphEditorHeader({ toolbar: makeMockToolbar({ showSearchBar: true }) })



    expect(screen.getByRole('search')).toBeInTheDocument()

    expect(screen.queryByTestId('btn-search-graph')).not.toBeInTheDocument()

  })

})


