import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ValidationService as ValidationService } from './validation.service'
import { MongooseModule } from '@nestjs/mongoose'
import { RelayData, RelayDataSchema } from './schemas/relay-data'
import { ConfigService } from '@nestjs/config'
import { ValidationData, ValidationDataSchema } from './schemas/validation-data'
import { ValidatedRelay, ValidatedRelaySchema } from './schemas/validated-relay'
import { GeoIpModule } from '../geo-ip/geo-ip.module'

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<{
          ONIONOO_REQUEST_TIMEOUT: number
          ONIONOO_REQUEST_MAX_REDIRECTS: number
        }>
      ) => ({
        timeout: config.get<number>('ONIONOO_REQUEST_TIMEOUT', {
          infer: true
        }),
        maxRedirects: config.get<number>('ONIONOO_REQUEST_MAX_REDIRECTS', {
          infer: true
        })
      })
    }),
    MongooseModule.forFeature([
      { name: RelayData.name, schema: RelayDataSchema },
      { name: ValidationData.name, schema: ValidationDataSchema },
      { name: ValidatedRelay.name, schema: ValidatedRelaySchema }
    ]),
    GeoIpModule
  ],
  providers: [ValidationService],
  exports: [ValidationService]
})
export class ValidationModule {}
