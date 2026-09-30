/**
 * INTEGRATION test — talks to a real HyperBEAM node holding a real operator-registry
 * process. It is not a unit test and there are no mocks: the point is to prove the
 * ans104 signing, the ACL and the read paths actually work end to end.
 *
 * Requires:
 *   HB_URL                            e.g. http://localhost:8734
 *   OPERATOR_REGISTRY_PROCESS_ID      a process spawned from an operator-registry module
 *   OPERATOR_REGISTRY_CONTROLLER_KEY  an EVM key holding owner/admin on that process
 *
 * To run one locally, see smart-contracts/ao/scripts/run-e2e.ts, which publishes the
 * module into a node container and spawns from it.
 */
import { Logger } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { getAddress, Wallet } from 'ethers'

import { OperatorRegistryService } from './operator-registry.service'

describe('OperatorRegistryService', () => {
  let module: TestingModule
  let service: OperatorRegistryService

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [OperatorRegistryService],
      exports: [OperatorRegistryService]
    })
      .setLogger(new Logger())
      .compile()
    service = module.get<OperatorRegistryService>(OperatorRegistryService)

    await service.onApplicationBootstrap()
  })

  afterEach(async () => {
    await module.close()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('Gets Operator Registry State', async () => {
    const state = await service.getOperatorRegistryState()

    // The NATIVE shape (D26), not the legacynet PascalCase one.
    expect(state).toBeDefined()
    for (const key of [
      'claimable',
      'verified',
      'blocked',
      'registrationCredits',
      'verifiedHardware'
    ] as const) {
      expect(state[key]).toBeDefined()
      // Lua serializes an EMPTY table as a JSON array; the service normalizes those
      // back to objects, so no caller ever sees an array here.
      expect(Array.isArray(state[key])).toBe(false)
      expect(typeof state[key]).toBe('object')
    }
    expect(typeof state.registrationCreditsRequired).toBe('boolean')

    // Address VALUES are EIP-55 checksummed post-migration, not legacynet ALLCAPS.
    const [firstVerified] = Object.values(state.verified)
    if (firstVerified) {
      expect(firstVerified).toMatch(/^0x[0-9a-fA-F]{40}$/)
      // ethers' getAddress is the EIP-55 oracle: a canonical address is its own
      // checksum. legacynet's `0x`+ALLCAPS form would fail this.
      expect(firstVerified).toBe(getAddress(firstVerified))
    }
  }, 60_000)

  it('Adds Registration Credits', async () => {
    const wallet = Wallet.createRandom()
    const address = wallet.address
    const transactionHash = 'mock-tx-hash-' + address
    const fingerprint = address.substring(2).toUpperCase()

    const success = await service.addRegistrationCredit(
      address,
      transactionHash,
      fingerprint
    )

    expect(success).toBe(true)
  }, 60_000)

  it('Handles adding duplicate Registration Credits', async () => {
    const wallet = Wallet.createRandom()
    const address = wallet.address
    const transactionHash = 'mock-tx-hash-' + address
    const fingerprint = address.substring(2).toUpperCase()

    await service.addRegistrationCredit(address, transactionHash, fingerprint)
    // The contract asserts RegistrationCreditAlreadyAdded. That rejection arrives as
    // an HTTP 200 with the reason only in the message's own slot output, so this
    // assertion is what proves ao-client's write confirmation is actually working —
    // a client that trusted the status code would report `true` here.
    const success = await service.addRegistrationCredit(
      address,
      transactionHash,
      fingerprint
    )

    expect(success).toBe(false)
  }, 60_000)

  it('Submits operator certificates', async () => {
    const wallet = Wallet.createRandom()
    const fingerprint = wallet.address.substring(2).toUpperCase()

    const { success, messageId } = await service.adminSubmitOperatorCertificates([
      { relay: { fingerprint, any1_address: wallet.address } as any }
    ])

    expect(success).toBe(true)
    expect(messageId).toBeDefined()

    const state = await service.getOperatorRegistryState()
    expect(state.claimable[fingerprint]).toBe(wallet.address)
  }, 120_000)
})
