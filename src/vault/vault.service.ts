import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CronExpression, Cron } from '@nestjs/schedule'
import { isAxiosError } from 'axios'

import { VaultReadIssuerResponse } from './dto/vault-read-issuer-response'

@Injectable()
export class VaultService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VaultService.name)

  private vaultToken: string
  private vaultTokenPeriod: string
  private vaultTokenPolicies: string[]

  constructor(
    private readonly configService: ConfigService,
    private readonly vaultHttpService: HttpService
  ) {
    this.vaultToken = this.configService.get<string>(
      'VAULT_TOKEN',
      { infer: true }
    )
    this.vaultTokenPeriod = this.configService.get<string>(
      'VAULT_TOKEN_PERIOD',
      '4h',
      { infer: true }
    )
    const vaultTokenPoliciesString = this.configService.get<string>(
      'VAULT_TOKEN_POLICIES',
      'pki-hardware-reader',
      { infer: true }
    )
    this.vaultTokenPolicies = vaultTokenPoliciesString.split(',')

    this.logger.log('Constructed')
  }

  // @Cron(CronExpression.EVERY_HOUR, { name: 'renew-vault-token' })
  // private async renewOrCreateVaultToken(
  //   action: 'create' | 'renew-self' = 'renew-self'
  // ) {
  //   this.logger.log(`Attempting to [${action}] the auth token for Vault`)

  //   try {
  //     const renewTokenResponse = await this.vaultHttpService.axiosRef.post(
  //       `/v1/auth/token/${action}`,
  //       action === 'create'
  //         ? {
  //             policies: this.vaultTokenPolicies,
  //             period: this.vaultTokenPeriod,
  //             meta: { NOMAD_ALLOC_NAME: process.env.NOMAD_ALLOC_NAME }
  //           }
  //         : {},
  //       { headers: { 'X-Vault-Token': this.vaultToken } }
  //     )
  //     this.vaultToken = renewTokenResponse.data.auth.client_token
  //   } catch (err) {
  //     if (isAxiosError(err)) {
  //       this.logger.error(
  //         `Failed to [${action}] the auth token for Vault: [${err.response?.status}][${err.response?.statusText}]}`,
  //         err.stack
  //       )
  //     } else {
  //       this.logger.error(
  //         `Failed to [${action}] the auth token for Vault`,
  //         err.stack
  //       )
  //     }
  //   }

  //   this.logger.log(`Done [${action}] the auth token for Vault`)
  // }

  async onApplicationBootstrap() {
    this.logger.log('Bootstrapping')
  //   await this.renewOrCreateVaultToken('create')
    this.logger.log('Bootstrapped')
  }

  async getIssuerBySKI(ski: string): Promise<VaultReadIssuerResponse | null> {
    try {
      const issuerCertificateResponse = await this.vaultHttpService.axiosRef.get(
        `/v1/pki_hardware/issuer/${ski.replace(/:/g, '')}`,
        {
          headers: { 'X-Vault-Token': this.vaultToken }
        }
      )
      
      return issuerCertificateResponse.data.data
    } catch (err) {
      if (isAxiosError(err)) {
        this.logger.error(
          `Failed to get the issuer for SKI: [${ski}]: [${err.response?.status}][${err.response?.statusText}]}`,
          err.stack
        )
      } else {
        this.logger.error(
          `Failed to get the issuer for SKI: [${ski}]`,
          err.stack
        )
      }
    }

    return null
  }
}
