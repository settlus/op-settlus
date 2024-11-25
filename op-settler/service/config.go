package service

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

const (
	endpoint     = "RPC_ENDPOINT"
	privateKey   = "PRIVATE_KEY"
	proxyAddress = "PROXY_ADDRESS"
)

func init() {
	godotenv.Load()
}

func getEnvOrPanic(key string) string {
	val, ok := os.LookupEnv(key)
	if !ok {
		panic(fmt.Sprintf("env %s is not set", key))
	}
	return val
}

func GetEthEndpoint() string {
	return getEnvOrPanic(endpoint)
}

func GetPrivateKey() string {
	return getEnvOrPanic(privateKey)
}

func GetProxyAddress() string {
	return getEnvOrPanic(proxyAddress)
}
