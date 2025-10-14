import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Wallet } from 'ethers'

import {
  AosSigningFunction,
  sendAosDryRun,
  sendAosMessage
} from '../util/send-aos-message'
import { createEthereumDataItemSigner } from '../util/create-ethereum-data-item-signer'
import { EthereumSigner } from '../util/arbundles-lite'
import { OperatorRegistryState } from './interfaces/operator-registry'
import { RelayDataDto } from 'src/validation/dto/relay-data-dto'

@Injectable()
export class OperatorRegistryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OperatorRegistryService.name)

  private readonly operatorRegistryProcessId: string
  private readonly operatorRegistryControllerKey: string

  private signer!: AosSigningFunction

  constructor(
    readonly config: ConfigService<{
      OPERATOR_REGISTRY_CONTROLLER_KEY: string
      OPERATOR_REGISTRY_PROCESS_ID: string
      IS_LIVE: string
    }>
  ) {
    this.operatorRegistryProcessId = config.get<string>(
      'OPERATOR_REGISTRY_PROCESS_ID',
      { infer: true }
    )
    if (!this.operatorRegistryProcessId) {
      throw new Error('OPERATOR_REGISTRY_PROCESS_ID is not set!')
    }

    this.operatorRegistryControllerKey = config.get<string>(
      'OPERATOR_REGISTRY_CONTROLLER_KEY',
      { infer: true }
    )
    if (!this.operatorRegistryControllerKey) {
      throw new Error('OPERATOR_REGISTRY_CONTROLLER_KEY is not set!')
    }
  }

  async onApplicationBootstrap() {
    this.signer = await createEthereumDataItemSigner(
      new EthereumSigner(this.operatorRegistryControllerKey)
    )
    const wallet = new Wallet(this.operatorRegistryControllerKey)
    const address = await wallet.getAddress()
    this.logger.log(`Bootstrapped with signer address ${address}`)
  }

  public async getOperatorRegistryState(): Promise<OperatorRegistryState> {
    const { result } = await sendAosDryRun({
      processId: this.operatorRegistryProcessId,
      tags: [{ name: 'Action', value: 'View-State' }]
    })

    if (result.Error) {
      this.logger.error(
        `Error when calling View-State on operator registry process: ${result.Error}`
      )
      throw new Error(result.Error)
    }
    if (!result.Messages || result.Messages.length < 1) {
      this.logger.error(
        `Error when calling View-State on operator registry process: no messages`
      )
      throw new Error('No messages returned from View-State')
    }

    const state = JSON.parse(result.Messages[0].Data)

    for (const prop in state) {
      // NB: Lua returns empty tables as JSON arrays, so we normalize them to
      //     empty objects as when they are populated they will also be objects
      if (Array.isArray(state[prop]) && state[prop].length < 1) {
        state[prop] = {}
      }
    }

    return state
  }

  public async addRegistrationCredit(
    address: string,
    transactionHash: string,
    fingerprint: string
  ): Promise<boolean> {
    if (!this.signer) {
      throw new Error('Signer is not defined!')
    }

    try {
      const { messageId, result } = await sendAosMessage({
        processId: this.operatorRegistryProcessId,
        signer: this.signer as any, // NB: types, lol
        tags: [
          { name: 'Action', value: 'Add-Registration-Credit' },
          { name: 'Address', value: address },
          { name: 'Fingerprint', value: fingerprint },
          { name: 'EVM-TX', value: transactionHash }
        ]
      })

      if (!result.Error) {
        this.logger.log(
          `Added registration credit to [${address}|${fingerprint}]: ${
            messageId ?? 'no-message-id'
          }`
        )

        return true
      }

      this.logger.warn(
        `Add-Registration-Credit resulted in an AO Process Error for ` +
          ` [${JSON.stringify({ address, transactionHash, fingerprint })}]`,
        result.Error
      )
    } catch (error) {
      this.logger.error(
        `Exception when adding registration credit` +
          ` [${JSON.stringify({ address, transactionHash, fingerprint })}]`,
        error.stack
      )
    }

    return false
  }

  public async adminSubmitOperatorCertificates(
    relays: { relay: RelayDataDto, isHardwareProofValid?: boolean }[]
  ): Promise<{ success: boolean, messageId?: string }> {
    if (!this.signer) {
      throw new Error('Signer is not defined!')
    }

    try {
      const tags = [{ name: 'Action', value: 'Admin-Submit-Operator-Certificates' }]
      const data = JSON.stringify(
        relays.map(
          ({ relay, isHardwareProofValid }) => 
            isHardwareProofValid
              ? ({ a: relay.any1_address, f: relay.fingerprint, hw: true })
              : ({ a: relay.any1_address, f: relay.fingerprint })
        )
      )
      this.logger.log(
        `Admin-Submit-Operator-Certificates for ${relays.length} relays `
          + `to process [${this.operatorRegistryProcessId}] `
          + `with tags [${JSON.stringify(tags)}] and data [${data}]`
      )
      const { messageId, result } = await sendAosMessage({
        processId: this.operatorRegistryProcessId,
        signer: this.signer as any, // NB: types, lol
        tags,
        data
      })

      if (!result.Error) {
        this.logger.log(
          `Success Admin-Submit-Operator-Certificates for ${relays.length}` +
            ` relays: ${messageId ?? 'no-message-id'}`
        )

        return { success: true, messageId }
      }

      this.logger.warn(
        `Admin-Submit-Operator-Certificates resulted in an AO Process Error` +
          ` for ${relays.length} [message-id = ${messageId}] relays: ${result.Error}`
      )
    } catch (error) {
      this.logger.error(
        `Exception when calling Admin-Submit-Operator-Certificates`,
        error.stack
      )
    }

    return { success: false }
  }
}
