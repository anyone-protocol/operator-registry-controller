job "operator-registry-controller-live" {
  datacenters = ["ator-fin"]
  type = "service"
  namespace = "live-protocol"

  constraint {
    attribute = "${meta.pool}"
    value = "live-protocol"
  }
  
  group "operator-registry-controller-live-group" {
    count = 1

    network {
      mode = "bridge"
      port "operator-registry-controller-port" {
        to = 3000
        host_network = "wireguard"
      }
    }

    task "operator-registry-controller-live-service" {
      driver = "docker"
      config {
        image = "ghcr.io/anyone-protocol/operator-registry-controller:[[.commit_sha]]"
        force_pull = true
        mount {
          type = "bind"
          target = "/etc/ssl/certs/vault-ca.crt"
          source = "/opt/nomad/tls/vault-ca.crt"
          readonly = true
          bind_options {
            propagation = "private"
          }
        }
      }

      vault {
        role = "any1-nomad-workloads-controller"
      }

      identity {
        name = "vault_default"
        aud  = ["any1-infra"]
        ttl  = "1h"
      }

      template {
        data = <<-EOH
        OPERATOR_REGISTRY_PROCESS_ID="[[ consulKey "smart-contracts/live/operator-registry-address" ]]"
        RELAY_UP_NFT_CONTRACT_ADDRESS="[[ consulKey "relay-up-nft-contract/live/address" ]]"

        {{- range service "validator-live-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/operator-registry-controller-live-testnet"
        {{- end }}

        {{- range service "operator-registry-controller-redis-live" }}
          REDIS_HOSTNAME="{{ .Address }}"
          REDIS_PORT="{{ .Port }}"
        {{- end }}

        {{- range service "onionoo-war-live" }}
          ONIONOO_DETAILS_URI="http://{{ .Address }}:{{ .Port }}/details"
        {{- end }}
        EOH
        destination = "local/config.env"
        env         = true
      }

      template {
        data = <<-EOH
        {{ $allocIndex := env "NOMAD_ALLOC_INDEX" }}

        {{ with secret "kv/live-protocol/operator-registry-controller-live"}}
          OPERATOR_REGISTRY_CONTROLLER_KEY="{{ .Data.data.OPERATOR_REGISTRY_CONTROLLER_KEY }}"
          BUNDLER_CONTROLLER_KEY="{{ .Data.data.BUNDLER_CONTROLLER_KEY }}"
          VAULT_ADDR="{{ .Data.data.VAULT_ADDR }}"

          EVM_JSON_RPC="https://sepolia.infura.io/v3/{{ index .Data.data (print `INFURA_SEPOLIA_API_KEY_` $allocIndex) }}"
          EVM_PRIMARY_WSS="wss://sepolia.infura.io/ws/v3/{{ index .Data.data (print `INFURA_SEPOLIA_API_KEY_` $allocIndex) }}"
          EVM_MAINNET_PRIMARY_JSON_RPC="https://mainnet.infura.io/v3/{{ index .Data.data (print `INFURA_SEPOLIA_API_KEY_` $allocIndex) }}"
          EVM_MAINNET_PRIMARY_WSS="wss://mainnet.infura.io/ws/v3/{{ index .Data.data (print `INFURA_SEPOLIA_API_KEY_` $allocIndex) }}"
          
          EVM_SECONDARY_WSS="wss://eth-sepolia.g.alchemy.com/v2/{{ index .Data.data (print `ALCHEMY_SEPOLIA_API_KEY_` $allocIndex) }}"
          EVM_MAINNET_SECONDARY_JSON_RPC="https://eth-mainnet.g.alchemy.com/v2/{{ index .Data.data (print `ALCHEMY_SEPOLIA_API_KEY_` $allocIndex) }}"
          EVM_MAINNET_SECONDARY_WSS="wss://eth-mainnet.g.alchemy.com/v2/{{ index .Data.data (print `ALCHEMY_SEPOLIA_API_KEY_` $allocIndex) }}"
        {{ end }}
        EOH
        destination = "secrets/keys.env"
        env         = true
      }


      env {
        BUMP="1"
        IS_LIVE="true"
        VERSION="[[.commit_sha]]"
        ONIONOO_REQUEST_TIMEOUT=60000
        ONIONOO_REQUEST_MAX_REDIRECTS=3
        CPU_COUNT="1"
        GEODATADIR="/geo-ip-db/data"
        GEOTMPDIR="/geo-ip-db/tmp"
        DO_CLEAN="true"
        BUNDLER_GATEWAY="https://ar.anyone.tech"
        BUNDLER_NODE="https://ar.anyone.tech/bundler"
        BUNDLER_NETWORK="ethereum"
        CU_URL="https://cu.anyone.permaweb.services"
        GATEWAY_URL="https://ar-io.net"
        GRAPHQL_URL="https://ar-io.net/graphql"
        EVM_NETWORK="sepolia"
        ANYONE_API_URL="https://api.ec.anyone.tech"
      }
      
      resources {
        cpu    = 4096
        memory = 8192
      }

      service {
        name = "operator-registry-controller-live"
        port = "operator-registry-controller-port"
        tags = ["logging"]
        
        check {
          name     = "live operator-registry-controller health check"
          type     = "http"
          path     = "/health"
          interval = "5s"
          timeout  = "10s"
          check_restart {
            limit = 180
            grace = "15s"
          }
        }
      }
    }
  }
}
