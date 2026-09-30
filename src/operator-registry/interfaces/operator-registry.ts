/**
 * The native operator-registry state, as returned by the `dump` view.
 *
 * These are the NATIVE field names (D26 shape), not the legacynet ones. The mapping
 * applied by the migration seed builder (smart-contracts/ao/scripts/build-seed.ts):
 *
 *   ClaimableFingerprintsToOperatorAddresses            -> claimable
 *   VerifiedFingerprintsToOperatorAddresses             -> verified
 *   RegistrationCreditsFingerprintsToOperatorAddresses  -> registrationCredits
 *   VerifiedHardwareFingerprints                        -> verifiedHardware
 *   BlockedOperatorAddresses  (a LIST of addresses)     -> blocked  (a SET, addr -> true)
 *   RegistrationCreditsRequired                         -> registrationCreditsRequired
 *
 * Address VALUES are now EIP-55 checksummed — legacynet stored `0x`+ALLCAPS. Any
 * consumer comparing an address from this state against another source must compare
 * canonically, never with a raw `===` against a non-canonical string. Fingerprint KEYS
 * are unchanged (still uppercase hex).
 */
export interface OperatorRegistryState {
  /** fingerprint -> operator address (assigned, not yet claimed) */
  claimable: { [fingerprint: string]: string }
  /** fingerprint -> operator address (claimed) */
  verified: { [fingerprint: string]: string }
  /** operator address -> true. Keyed by ADDRESS, not by fingerprint. */
  blocked: { [address: string]: boolean }
  /** fingerprint -> operator address */
  registrationCredits: { [fingerprint: string]: string }
  /** fingerprint -> true */
  verifiedHardware: { [fingerprint: string]: boolean }
  registrationCreditsRequired: boolean
}
