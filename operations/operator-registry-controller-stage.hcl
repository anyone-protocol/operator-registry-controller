job "operator-registry-controller-stage" {
  datacenters = ["ator-fin"]
  type = "service"
  namespace = "stage-protocol"
  
  constraint {
    attribute = "${meta.pool}"
    value = "stage"
  }

  group "operator-registry-controller-stage-group" {
    count = 1

    update {
      max_parallel     = 1
      canary           = 1
      min_healthy_time = "30s"
      healthy_deadline = "5m"
      auto_revert      = true
      auto_promote     = true
    }

    network {
      mode = "bridge"
      port "operator-registry-controller-port" {
        to = 3000
        host_network = "wireguard"
      }
    }

    task "operator-registry-controller-stage-service" {
      driver = "docker"
      config {
        image = "ghcr.io/anyone-protocol/operator-registry-controller:[[ .commit_sha ]]"
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

      env {
        IS_LIVE="true"
        VERSION="[[ .commit_sha ]]"
        REDIS_MODE="sentinel"
        REDIS_MASTER_NAME="operator-registry-controller-stage-redis-master"
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
        OPERATOR_REGISTRY_PROCESS_ID="{{ key "smart-contracts/stage/operator-registry-address" }}"
        RELAY_UP_NFT_CONTRACT_ADDRESS="{{ key "relay-up-nft-contract/stage/address" }}"
        {{- range service "validator-stage-mongo" }}
        MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/operator-registry-controller-stage-testnet"
        {{- end }}
        {{- range service "onionoo-war-live" }}
        ONIONOO_DETAILS_URI="http://{{ .Address }}:{{ .Port }}/details"
        {{- end }}
        {{- range service "operator-registry-controller-stage-redis-master" }}
        REDIS_MASTER_NAME="{{ .Name }}"
        {{- end }}
        {{- range service "operator-registry-controller-stage-sentinel-1" }}
        REDIS_SENTINEL_1_HOST={{ .Address }}
        REDIS_SENTINEL_1_PORT={{ .Port }}
        {{- end }}
        {{- range service "operator-registry-controller-stage-sentinel-2" }}
        REDIS_SENTINEL_2_HOST={{ .Address }}
        REDIS_SENTINEL_2_PORT={{ .Port }}
        {{- end }}
        {{- range service "operator-registry-controller-stage-sentinel-3" }}
        REDIS_SENTINEL_3_HOST={{ .Address }}
        REDIS_SENTINEL_3_PORT={{ .Port }}
        {{- end }}
        {{- range service "api-service-stage" }}
        ANYONE_API_URL="{{ .Address }}:{{ .Port }}"
        {{- end }}
        EOH
        destination = "local/config.env"
        env         = true
      }

      template {
        data = <<-EOH
        {{ $allocIndex := env "NOMAD_ALLOC_INDEX" }}
        {{- with secret "kv/stage-protocol/operator-registry-controller-stage"}}
        OPERATOR_REGISTRY_CONTROLLER_KEY="{{ .Data.data.OPERATOR_REGISTRY_CONTROLLER_KEY }}"
        BUNDLER_CONTROLLER_KEY="{{ .Data.data.OPERATOR_REGISTRY_CONTROLLER_KEY }}"
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

      resources {
        cpu    = 4096
        memory = 8192
      }

      service {
        name = "operator-registry-controller-stage"
        port = "operator-registry-controller-port"
        tags = ["logging"]
        
        check {
          name     = "Stage operator-registry-controller health check"
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
