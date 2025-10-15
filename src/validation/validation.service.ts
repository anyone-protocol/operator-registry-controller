import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { AxiosError } from 'axios'
import { firstValueFrom, catchError } from 'rxjs'
import { DetailsResponse } from './interfaces/8_3/details-response'
import { RelayInfo } from './interfaces/8_3/relay-info'
import { RelayDataDto } from './dto/relay-data-dto'
import { ethers } from 'ethers'
import { ConfigService } from '@nestjs/config'
import { latLngToCell } from 'h3-js'
import { GeoIpService } from '../geo-ip/geo-ip.service'
import { ValidationDataDto } from './dto/validation-data-dto'
import { RelayInfoService } from './relay-info.service'

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name)
  private lastSeen: string = ''

  // this pattern should be lowercase
  private readonly atorKeyPattern = '@anon:'

  private readonly keyLength = 42

  private readonly bannedFingerprints: string[]

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService<{
      ONIONOO_DETAILS_URI: string
      DETAILS_URI_AUTH: string
      BANNED_FINGERPRINTS: string
    }>,
    private readonly geoipService: GeoIpService,
    private readonly relayInfoService: RelayInfoService
  ) {
    this.logger.log(`Bootstrapping Validation Service`)
    // geoip.startWatchingDataUpdate()

    const bannedFingerprintsString = config.get<string>(
      'BANNED_FINGERPRINTS',
      { infer: true }
    ) || ''
    this.bannedFingerprints = bannedFingerprintsString.split(',')
    this.logger.log(
      `Bootstrapped Validation Service with ${this.bannedFingerprints.length}` +
        ` banned fingerprints: ${JSON.stringify(this.bannedFingerprints)}`
    )
  }

  public async fetchNewRelays(): Promise<RelayInfo[]> {
    this.logger.log(`Fetching new relays [seen: ${this.lastSeen}]`)

    let relays: RelayInfo[] = []
    const detailsUri = this.config.get<string>('ONIONOO_DETAILS_URI', {
      infer: true
    })
    if (detailsUri !== undefined) {
      const detailsAuth: string =
        this.config.get<string>('DETAILS_URI_AUTH', {
          infer: true
        }) || ''
      const requestStamp = Date.now()
      try {
        const { headers, status, data } = await firstValueFrom(
          this.httpService
            .get<DetailsResponse>(detailsUri, {
              headers: {
                'content-encoding': 'gzip',
                // 'if-modified-since': `${this.lastSeen}`,
                authorization: `${detailsAuth}`
              },
              validateStatus: (status) => status === 304 || status === 200
            })
            .pipe(
              catchError((error: AxiosError) => {
                this.logger.error(
                  `Fetching relays from ${detailsUri} failed with ${error.response?.status ?? '?'}, ${error}`
                )
                throw 'Failed to fetch relay details'
              })
            )
        )

        this.logger.debug(`Fetch details from ${detailsUri} response ${status}`)
        if (status === 200) {
          relays = data.relays
          const lastMod = headers['last-modified']
          if (
            lastMod !== undefined &&
            typeof lastMod === 'string' &&
            requestStamp > Date.parse(lastMod)
          ) {
            this.lastSeen = new Date(lastMod).toUTCString()
          } else this.lastSeen = ''

          this.logger.log(
            `Received ${relays.length} relays from validated details [seen: ${this.lastSeen}]`
          )
        } else this.logger.debug('No new relay updates from validated details') // 304 - Not modified
      } catch (e) {
        this.logger.error('Exception when fetching new relays', e.stack)
      }
    } else
      this.logger.warn(
        'Set the ONIONOO_DETAILS_URI in ENV vars or configuration'
      )

    return relays
  }

  public extractAtorKey(inputString?: string): string {
    if (inputString !== undefined && inputString.length > 0) {
      const startIndex = inputString.toLowerCase().indexOf(this.atorKeyPattern)
      if (startIndex > -1) {
        const baseIndex = startIndex + this.atorKeyPattern.length
        const fixedInput = inputString.replace('0X', '0x')
        const keyIndex = fixedInput.indexOf('0x', baseIndex)
        if (keyIndex > -1) {
          const endKeyIndex = keyIndex + this.keyLength
          if (endKeyIndex <= fixedInput.length) {
            const keyCandidate = fixedInput.substring(keyIndex, endKeyIndex)
            // this.logger.debug(
            //   `Found key candidate ${keyCandidate} in [${inputString}]`
            // )
            if (ethers.isAddress(keyCandidate))
              return ethers.getAddress(keyCandidate)
            else
              this.logger.warn(
                'Invalid ator key (as checked by ethers) found after pattern in matched relay'
              )
          } else
            this.logger.warn(
              'Invalid ator key candidate found after pattern in matched relay'
            )
        } else
          this.logger.warn(
            `Ator key not found after pattern in matched relay for input: ${inputString}`
          )
      } else
        this.logger.warn(
          `Ator key pattern not found in matched relay for input: ${inputString}`
        )
    } else
      this.logger.warn('Attempting to extract empty key from matched relay')

    return ''
  }

  public async filterRelays(relays: RelayInfo[]): Promise<string[]> {
    this.logger.debug(`Filtering ${relays.length} relays`)

    const matchingRelays = relays.filter(
      (relay) =>
        !this.bannedFingerprints.includes(relay.fingerprint) &&
        relay.contact !== undefined &&
        relay.contact.toLowerCase().includes(this.atorKeyPattern)
    )

    if (matchingRelays.length > 0) {
      this.logger.log(`Filtered ${matchingRelays.length} relays`)
    } else if (relays.length > 0) {
      this.logger.log('No new interesting relays found')
    }

    await this.geoipService.cacheCheck()

    const relayData = matchingRelays.map<RelayDataDto>(info => ({
      any1_address: '',

      fingerprint: info.fingerprint,

      // NB: Other case should not happen as its filtered out while
      //     creating validations array
      contact: info.contact !== undefined ? info.contact : '',

      consensus_weight: info.consensus_weight,
      primary_address_hex: this.fingerprintToGeoHex(info.fingerprint),
      nickname: info.nickname,

      running: info.running,
      consensus_measured: info.measured ?? false,
      consensus_weight_fraction: info.consensus_weight_fraction ?? 0,
      version: info.version ?? '?',
      version_status: info.version_status ?? '',
      bandwidth_rate: info.bandwidth_rate ?? 0,
      bandwidth_burst: info.bandwidth_burst ?? 0,
      observed_bandwidth: info.observed_bandwidth ?? 0,
      advertised_bandwidth: info.advertised_bandwidth ?? 0,
      effective_family: info.effective_family ?? [],
      hardware_info: info.hardware_info
    }))

    const filteredRelayData = relayData.filter((relay) => relay.contact.length > 0)
    
    // Store relay data in database and return fingerprints
    const fingerprints = await this.relayInfoService.upsertMany(filteredRelayData)
    
    return fingerprints
  }

  private fingerprintToGeoHex(fingerprint: string): string {
    const fingerprintGeolocation = this.geoipService.lookup(fingerprint)
    if (fingerprintGeolocation) {
      const [lat, lng] = fingerprintGeolocation.coordinates
      return latLngToCell(lat, lng, 4) // resolution 4 - avg hex area 1,770 km^2
    } else return '?'
  }

  public async validateRelays(
    fingerprints: string[]
  ): Promise<ValidationDataDto> {
    const BATCH_SIZE = 1000
    const validatedFingerprints: string[] = []
    
    this.logger.log(
      `Starting validation of ${fingerprints.length} relays in batches of ${BATCH_SIZE}...`
    )

    // Process relays in batches with pagination
    await this.relayInfoService.getByFingerprintsPaginated(
      fingerprints,
      BATCH_SIZE,
      async (batch, batchIndex, totalBatches) => {
        this.logger.log(
          `Processing validation batch ${batchIndex}/${totalBatches} ` +
          `(${batch.length} relays)...`
        )

        const updates: Array<{ fingerprint: string; any1_address: string }> = []

        for (const relay of batch) {
          const ator_address = this.extractAtorKey(relay.contact)
          if (ator_address.length < 1) {
            continue
          }

          updates.push({
            fingerprint: relay.fingerprint,
            any1_address: ator_address
          })
          validatedFingerprints.push(relay.fingerprint)
        }

        // Batch update any1_address in database
        if (updates.length > 0) {
          await this.relayInfoService.updateAny1AddressBatch(updates)
          this.logger.log(
            `Batch ${batchIndex}/${totalBatches}: Updated ${updates.length} relay addresses`
          )
        }
      }
    )
    
    const validated_at = Date.now()

    this.logger.log(
      `Validation of relays completed at ${validated_at} with ${validatedFingerprints.length} relays`
    )

    const validationData = {
      validated_at,
      fingerprints: validatedFingerprints
    }

    return validationData
  }
}
