import { BridgeInfo } from './bridge-info'
import { RelayInfo } from './relay-info'

export interface DetailsResponse {
  version: string
  build_revision: string
  relays_published: string
  relays: RelayInfo[]
  bridges_published: string
  bridges: BridgeInfo[]
}
