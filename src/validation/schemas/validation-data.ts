import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import mongoose, { HydratedDocument } from 'mongoose'
import { ValidatedRelay } from './validated-relay'

export type ValidationDataDocument = HydratedDocument<ValidationData>

@Schema()
export class ValidationData {
  @Prop({ type: Number, required: true })
  validated_at: number

  @Prop({
    type: mongoose.Types.ObjectId,
    ref: 'ValidatedRelay',
    required: true
  })
  relays: ValidatedRelay[]
}

export const ValidationDataSchema = SchemaFactory.createForClass(ValidationData)
