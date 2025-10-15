import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ValidationService as ValidationService } from './validation.service'
import { ConfigService } from '@nestjs/config'
import { GeoIpModule } from '../geo-ip/geo-ip.module'
import { RelayInfoService } from './relay-info.service'
import { RelayInfo, RelayInfoSchema } from './schemas/relay-info.schema'

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
    GeoIpModule,
    MongooseModule.forFeature([
      { name: RelayInfo.name, schema: RelayInfoSchema }
    ])
  ],
  providers: [ValidationService, RelayInfoService],
  exports: [ValidationService, RelayInfoService]
})
export class ValidationModule {}
