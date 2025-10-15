import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export class RelayHardwareInfo {
  @Prop({ type: String })
  id?: string

  @Prop({ type: String })
  company?: string

  @Prop({ type: String })
  format?: string

  @Prop({ type: String })
  wallet?: string

  @Prop({ type: String })
  fingerprint?: string

  @Prop({ type: String })
  nftid?: string

  @Prop({ type: String })
  build?: string

  @Prop({ type: String })
  flags?: string

  @Prop({ type: [{ type: String, number: String }] })
  serNums?: {
    type?: string
    number?: string
  }[]

  @Prop({ type: [{ type: String, number: String }] })
  pubKeys?: {
    type?: string
    number?: string
  }[]

  @Prop({ type: [{ type: String, signature: String, cert: String }] })
  certs?: {
    type?: string
    signature?: string
    cert?: string
  }[]
}

@Schema()
export class RelayInfo {
  @Prop({ type: String, required: true, index: true, unique: true })
  fingerprint: string

  @Prop({ type: String, required: true })
  any1_address: string

  @Prop({ type: String, required: true })
  contact: string

  @Prop({ type: String, required: true })
  primary_address_hex: string

  @Prop({ type: String, required: true })
  nickname: string

  @Prop({ type: Boolean, required: true })
  running: boolean

  @Prop({ type: Number, required: true })
  consensus_weight: number

  @Prop({ type: Boolean, required: true })
  consensus_measured: boolean

  @Prop({ type: Number, required: true })
  consensus_weight_fraction: number

  @Prop({ type: String, required: true })
  version: string

  @Prop({ type: String, required: true })
  version_status: string

  @Prop({ type: Number, required: true })
  bandwidth_rate: number

  @Prop({ type: Number, required: true })
  bandwidth_burst: number

  @Prop({ type: Number, required: true })
  observed_bandwidth: number

  @Prop({ type: Number, required: true })
  advertised_bandwidth: number

  @Prop({ type: [String], required: true })
  effective_family: string[]

  @Prop({ type: RelayHardwareInfo })
  hardware_info?: RelayHardwareInfo

  @Prop({ type: Number, required: true, default: Date.now })
  createdAt: number
}

export type RelayInfoDocument = HydratedDocument<RelayInfo>
export const RelayInfoSchema = SchemaFactory.createForClass(RelayInfo)
