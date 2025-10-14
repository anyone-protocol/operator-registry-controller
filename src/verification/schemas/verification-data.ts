import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export type VerificationDataDocument = HydratedDocument<VerificationData>

@Schema()
export class VerificationData {
  @Prop({ type: Number, required: true })
  verified_at: number

  @Prop({ type: String, required: false })
  relay_metrics_tx: string

  @Prop({ type: String, required: false })
  validation_stats_tx: string
}

export const VerificationDataSchema =
  SchemaFactory.createForClass(VerificationData)
