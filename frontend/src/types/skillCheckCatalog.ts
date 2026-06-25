export interface SkillCheckCatalogEntry {
  id: string
  label: string
}

export interface SkillCheckCatalog {
  attributes: SkillCheckCatalogEntry[]
  skills: SkillCheckCatalogEntry[]
}
