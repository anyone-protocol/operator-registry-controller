import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

interface FingerprintGeoLocation {
  hexId: string
  coordinates: [number, number] // [lat, lon]
}

interface FingerprintGeoLocationMap { 
  [fingerprint:string]: FingerprintGeoLocation
}

@Injectable()
export class GeoIpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GeoIpService.name)
  public fingerprintMapData: FingerprintGeoLocationMap = {}
  private readonly anyoneApiUrl: string

  constructor(
    readonly config: ConfigService<{ ANYONE_API_URL: string }>,
    private readonly httpService: HttpService
  ) {
    this.logger.log('Initializing geo ip service')

    this.anyoneApiUrl = config.get<string>(
      'ANYONE_API_URL',
      { infer: true }
    )
    if (!this.anyoneApiUrl) {
      throw new Error('ANYONE_API_URL is not set!')
    }
    
    this.logger.log(
      `Initialized geo ip service with Anyone API Url [${this.anyoneApiUrl}]`
    )
  }

  async onApplicationBootstrap() {
    try {
      this.logger.log('Fetching latest fingerprint-map data from Anyone API...')
      
      const fingerprintMapUrl = `${this.anyoneApiUrl}/fingerprint-map`
      const response = await firstValueFrom(
        this.httpService.get<FingerprintGeoLocationMap>(fingerprintMapUrl)
      )
      
      this.fingerprintMapData = response.data
      this.logger.log(
        `Successfully fetched relay map data: ${this.fingerprintMapData.length}`
        + ` cells loaded`
      )
    } catch (error) {
      this.logger.error(
        'Failed to fetch relay map data from Anyone API',
        error instanceof Error ? error.stack : error
      )
    }
  }

  lookup(fingerprint: string): FingerprintGeoLocation | null {
    if (Object.keys(this.fingerprintMapData).length === 0) {
      this.logger.warn(
        'Fingerprint map data is empty, cannot perform fingerprint lookup'
      )

      return null
    }

    if (!this.fingerprintMapData[fingerprint]) {
      this.logger.warn(
        `No geolocation data found for fingerprint: [${fingerprint}]`
      )
      return null
    }

    this.logger.log(`Looking up geolocation for fingerprint: [${fingerprint}]`)
    return this.fingerprintMapData[fingerprint]
  }
}
