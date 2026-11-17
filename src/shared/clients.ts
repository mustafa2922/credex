export type ClientStatus = 'active' | 'inactive'

export type Client = {
  id: string
  name: string
  phone: string | null
  status: ClientStatus
  created_at: string
  updated_at: string
}

export type ClientListStatus = ClientStatus | 'all'

export type ListClientsParams = {
  search?: string
  status?: ClientListStatus
}