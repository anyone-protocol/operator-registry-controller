import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { HttpModule } from '@nestjs/axios'

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
import { RelaySaleData, RelaySaleDataSchema } from './schemas/relay-sale-data'
import {
  HardwareVerificationFailure,
  HardwareVerificationFailureSchema
} from './schemas/hardware-verification-failure'
import { OperatorRegistryModule } from '../operator-registry/operator-registry.module'

@Module({
  imports: [
    ConfigModule,
    OperatorRegistryModule,
    MongooseModule.forFeature([
      { name: VerificationData.name, schema: VerificationDataSchema },
      { name: VerifiedHardware.name, schema: VerifiedHardwareSchema },
      { name: RelaySaleData.name, schema: RelaySaleDataSchema },
      {
        name: HardwareVerificationFailure.name,
        schema: HardwareVerificationFailureSchema
      }
    ]),
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<{
          DRE_REQUEST_TIMEOUT: number
          DRE_REQUEST_MAX_REDIRECTS: number
        }>
      ) => ({
        timeout: config.get<number>('DRE_REQUEST_TIMEOUT', {
          infer: true
        }),
        maxRedirects: config.get<number>('DRE_REQUEST_MAX_REDIRECTS', {
          infer: true
        })
      })
    })
  ],
  providers: [VerificationService, HardwareVerificationService],
  exports: [VerificationService, HardwareVerificationService]
})
export class VerificationModule {}
