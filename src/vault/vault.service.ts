import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CronExpression, Cron } from '@nestjs/schedule'

@Injectable()
export class VaultService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VaultService.name)

  private vaultToken: string

  constructor(
    private readonly configService: ConfigService,
    private readonly vaultHttpService: HttpService
  ) {
    this.vaultToken = this.configService.get<string>(
      'VAULT_TOKEN',
      { infer: true }
    )

    this.logger.log('Constructed')
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'renew-vault-token' })
  private async renewOrCreateVaultToken(
    action: 'create' | 'renew-self' = 'renew-self'
  ) {
    this.logger.log(`Attempting to [${action}] the auth token for Vault`)

    try {
      const renewTokenResponse = await this.vaultHttpService.axiosRef.post(
        `/v1/auth/token/${action}`,
        action === 'create'
          ? {
              policies: ['pki-hardware-reader'],
              period: '4h',
              meta: { NOMAD_ALLOC_NAME: process.env.NOMAD_ALLOC_NAME }
            }
          : {},
        { headers: { 'X-Vault-Token': this.vaultToken } }
      )
      this.vaultToken = renewTokenResponse.data.auth.client_token
    } catch (err) {
      this.logger.error(`Failed to [${action}] the auth token for Vault`)
    }

    this.logger.log(`Done [${action}] the auth token for Vault`)
  }

  async onApplicationBootstrap() {
    this.logger.log('Bootstrapping')
    await this.renewOrCreateVaultToken('create')
    this.logger.log('Bootstrapped')
  }
}
