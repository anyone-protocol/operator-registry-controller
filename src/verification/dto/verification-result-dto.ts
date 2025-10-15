import { RelayVerificationResult } from './relay-verification-result'
import { RelayDataDto } from 'src/validation/dto/relay-data-dto'

export type VerificationResults = VerificationResultDto[]

export class VerificationResultDto {
  readonly result: RelayVerificationResult
  readonly fingerprint: string
}

// Internal type with enriched relay data for processing
export type EnrichedVerificationResult = {
  result: RelayVerificationResult
  fingerprint: string
  relay: RelayDataDto
}

export type EnrichedVerificationResults = EnrichedVerificationResult[]
