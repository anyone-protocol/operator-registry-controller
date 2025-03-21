import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import fs from 'fs'
import https from 'https'

import { VaultService } from './vault.service'

@Module({
  imports: [
    ConfigModule,
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        baseURL: configService.get<string>('VAULT_ADDR', { infer: true }),
        httpsAgent: new https.Agent({
          ca: fs.readFileSync('/etc/ssl/certs/vault-ca.cert')
        })
      })
    })
  ],
  controllers: [],
  providers: [VaultService]
})
export class VaultModule {}
