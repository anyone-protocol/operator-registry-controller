import { Logger } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Wallet } from 'ethers'

import { GeoIpService } from './geo-ip.service'
import { HttpModule } from '@nestjs/axios'

describe('GeoIpService', () => {
  let module: TestingModule
  let service: GeoIpService

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        HttpModule.register({ timeout: 60 * 1000, maxRedirects: 3 })
      ],
      providers: [GeoIpService],
      exports: [GeoIpService]
    })
      .setLogger(new Logger())
      .compile()
    service = module.get<GeoIpService>(GeoIpService)

    await service.onApplicationBootstrap()
  })

  afterEach(async () => {
    await module.close()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('Gets Fingerprint Map OnApplicationBootstrap', async () => {
    const fingerprintMapData = service.fingerprintMapData

    expect(Object.keys(fingerprintMapData).length).toBeGreaterThan(0)
  }, 30_000)

  it('Looks up FingerprintGeoLocation', async () => {
    const fingerprint = '000263490B3B3EA599ED4C976AA4C3D4987B62ED'

    const fingerprintGeoLocation = service.lookup(fingerprint)

    console.log('Fingerprint Geo Location:', fingerprintGeoLocation)

    expect(fingerprintGeoLocation).not.toBeNull()
  }, 30_000)
})
