import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'

import { VerificationService } from './verification.service'
import {
  VerificationData,
  VerificationDataSchema
} from './schemas/verification-data'
import {
  VerifiedHardware,
  VerifiedHardwareSchema
} from './schemas/verified-hardware'
import { HardwareVerificationService } from './hardware-verification.service'
import {
  HardwareVerificationFailure,
  HardwareVerificationFailureSchema
} from './schemas/hardware-verification-failure'
import {
  OperatorRegistryModule
} from '../operator-registry/operator-registry.module'
import { BundlingModule } from '../bundling/bundling.module'
import { EvmProviderModule } from '../evm-provider/evm-provider.module'
import { VaultModule } from '../vault/vault.module'
import { KnownDevice, KnownDeviceSchema } from './schemas/known-device.schema'
import { ValidationModule } from '../validation/validation.module'

@Module({
  imports: [
    ConfigModule,
    BundlingModule,
    OperatorRegistryModule,
    EvmProviderModule,
    VaultModule,
    ValidationModule,
    MongooseModule.forFeature([
      { name: VerificationData.name, schema: VerificationDataSchema },
      { name: VerifiedHardware.name, schema: VerifiedHardwareSchema },
      {
        name: HardwareVerificationFailure.name,
        schema: HardwareVerificationFailureSchema
      },
      {
        name: KnownDevice.name,
        schema: KnownDeviceSchema
      }
    ])
  ],
  providers: [VerificationService, HardwareVerificationService],
  exports: [VerificationService, HardwareVerificationService]
})
export class VerificationModule {}
