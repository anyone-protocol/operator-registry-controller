import { RelayDataDto } from "./relay-data-dto"

export class ValidationDataDto {
    readonly validated_at: number
    readonly relays: RelayDataDto[]
}