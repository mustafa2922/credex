export type UnitStatus = 'active' | 'inactive'

export type Unit = {
  id: string
  name: string
  status: UnitStatus
  created_at: string
  updated_at: string
}

export type UnitListStatus = UnitStatus | 'all'

export type ListUnitsParams = {
  search?: string
  status?: UnitListStatus
}
