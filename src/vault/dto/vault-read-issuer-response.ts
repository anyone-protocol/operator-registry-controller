export type VaultReadIssuerResponse = {
  ca_chain: string[];
  certificate: string;
  crl_distribution_points: string[];
  issuer_id: string;
  issuer_name: string;
  issuing_certificates: string[];
  key_id: string;
  leaf_not_after_behavior: string;
  manual_chain: null | string;
  ocsp_servers: string[];
  revocation_signature_algorithm: string;
  revoked: boolean;
  usage: string;
}
