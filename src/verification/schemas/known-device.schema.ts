import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

export class KnownDeviceRawManifest {
  payload: string
  protected: string
  header: {
    uniqueId: string
  }
  signature: string
}

export class KnownDeviceDecodedManifest {
  version: number
  model: string
  partNumber: string
  manufacturer: {
    organizationName: string
    organizationalUnitName: string
  }
  provisioner: {
    organizationName: string
    organizationalUnitName: string
  }
  distributor: {
    organizationName: string
    organizationalUnitName: string
  }
  groupId: string
  provisioningTimestamp: string
  uniqueId: string
  publicKeySet: {
    keys: {
      kid: string
      kty: string
      crv: string
      x: string
      y: string
      x5c?: string[]
    }[]
  }
}

@Schema()
export class KnownDevice {
  @Prop({ type: String, required: true, index: true, unique: true })
  uniqueId: string

  @Prop({ type: String, required: true, index: true, unique: true })
  pubKeyHex: string

  @Prop({ type: Array<String>, required: true })
  pubKeysHex: string[]

  @Prop({ type: KnownDeviceRawManifest, required: true })
  raw: KnownDeviceRawManifest

  @Prop({ type: KnownDeviceDecodedManifest, required: true })
  decoded: KnownDeviceDecodedManifest

  @Prop({ type: Number, required: true, default: Date.now })
  createdAt: number
}

export type KnownDeviceDocument = HydratedDocument<KnownDevice>
export const KnownDeviceSchema = SchemaFactory
  .createForClass(KnownDevice)
  .index({ uniqueId: 1, pubKeyHex: 1 }, { unique: true })
