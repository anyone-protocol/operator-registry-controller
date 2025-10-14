import { RelayVerificationResult } from './relay-verification-result'
import { RelayDataDto } from 'src/validation/dto/relay-data-dto'

export type VerificationResults = VerificationResultDto[]

export class VerificationResultDto {
  readonly result: RelayVerificationResult
  readonly relay: RelayDataDto
}
