export interface EvolveState {
  settings: any[] | unknown | null
  /**
   * whether contract is allowed to evolve.
   */
  canEvolve: boolean
  /**
   * the transaction id of the Arweave transaction with the updated source code.
   */
  evolve: string
}
export type EvolvableState = Partial<EvolveState> & OwnableState
export type OwnableState = {
  owner?: string
}

export type ContractFunctionInput = {
  function: string
  [key: string]: any
}

export type Fingerprint = string
export type EvmAddress = string
export type PublicKey = string

export type RelayRegistryState = OwnableState &
  EvolvableState & {
    claimable: { [fingerprint in Fingerprint as string]: EvmAddress }
    verified: { [fingerprint in Fingerprint as string]: EvmAddress }
    registrationCredits: {
      [address in EvmAddress as string]: Fingerprint[]
    }
    blockedAddresses: EvmAddress[]
    families: { [fingerprint in Fingerprint as string]: Fingerprint[] }
    registrationCreditsRequired: boolean
    encryptionPublicKey: string
    verifiedHardware: Set<Fingerprint>
    familyRequired: boolean
    nicknames: { [fingerprint in Fingerprint as string]: string }
  }

export interface AddClaimable extends ContractFunctionInput {
  function: 'addClaimable'
  fingerprint: Fingerprint
  address: EvmAddress
  hardwareVerified?: boolean
  nickname?: string
}

export interface AddClaimableBatched extends ContractFunctionInput {
  function: 'addClaimableBatched'
  relays: {
    fingerprint: Fingerprint
    address: EvmAddress
    hardwareVerified?: boolean
    nickname?: string
  }[]
}

export interface RemoveClaimable extends ContractFunctionInput {
  function: 'removeClaimable'
  fingerprint: Fingerprint
}

export interface IsClaimable extends ContractFunctionInput {
  function: 'isClaimable'
  fingerprint: Fingerprint
  address: EvmAddress
}

export interface Claimable extends ContractFunctionInput {
  function: 'claimable'
  address?: EvmAddress
}

export interface Claim extends ContractFunctionInput {
  function: 'claim'
  fingerprint: Fingerprint
}

export interface Renounce extends ContractFunctionInput {
  function: 'renounce'
  fingerprint: Fingerprint
}

export interface RemoveVerified extends ContractFunctionInput {
  function: 'removeVerified'
  fingerprint: Fingerprint
}

export interface Verified extends ContractFunctionInput {
  function: 'verified'
  address?: EvmAddress
}

export interface IsVerified extends ContractFunctionInput {
  function: 'isVerified'
  fingerprint: Fingerprint
}

export interface AddRegistrationCredits extends ContractFunctionInput {
  function: 'addRegistrationCredits'
  credits: { address: EvmAddress; fingerprint: Fingerprint }[]
}

export interface RemoveRegistrationCredits extends ContractFunctionInput {
  function: 'removeRegistrationCredits'
  credits: { address: EvmAddress; fingerprint: Fingerprint }[]
}

export interface BlockAddress extends ContractFunctionInput {
  function: 'blockAddress'
  address: EvmAddress
}

export interface UnblockAddress extends ContractFunctionInput {
  function: 'unblockAddress'
  address: EvmAddress
}

export interface SetFamilies extends ContractFunctionInput {
  function: 'setFamilies'
  families: {
    fingerprint: Fingerprint
    add?: Fingerprint[]
    remove?: Fingerprint[]
  }[]
}

export interface ToggleRegistrationCreditRequirement
  extends ContractFunctionInput {
  function: 'toggleRegistrationCreditRequirement'
  enabled: boolean
}

export interface SetEncryptionPublicKey extends ContractFunctionInput {
  function: 'setEncryptionPublicKey'
  encryptionPublicKey: PublicKey
}

export interface VerifySerials extends ContractFunctionInput {
  function: 'verifySerials'
  fingerprints: Fingerprint[]
}

export interface RemoveSerials extends ContractFunctionInput {
  function: 'removeSerials'
  fingerprints: Fingerprint[]
}

export interface GetVerifiedRelays extends ContractFunctionInput {
  function: 'getVerifiedRelays'
}

export interface ToggleFamilyRequirement extends ContractFunctionInput {
  function: 'toggleFamilyRequirement'
  enabled: boolean
}
