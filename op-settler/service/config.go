package service

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

const (
	endpoint        = "RPC_ENDPOINT"
	privateKey      = "PRIVATE_KEY"
	proxyAddress    = "PROXY_ADDRESS"
	kmsKeyID        = "KMS_KEY_ID"
	signMode        = "SIGN_MODE"
	pollingInterval        = "POLLING_INTERVAL"
	slackWebhookURL        = "SLACK_WEBHOOK_URL"
	DANGER_BALANCE_THRESHOLD   = "DANGER_BALANCE_THRESHOLD"
	BALANCE_DECREASE_THRESHOLD = "BALANCE_DECREASE_THRESHOLD"
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

func getEnvOrDefault(key, def string) string {
	val, ok := os.LookupEnv(key)
	if !ok {
		return def
	} else {
		return val
	}
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

func GetKmsKeyID() string {
	return getEnvOrPanic(kmsKeyID)
}

func GetPollingInterval() int64 {
	val, err := strconv.ParseInt(getEnvOrPanic(pollingInterval), 10, 64)
	if err != nil {
		panic(fmt.Sprintf("failed to parse polling interval: %v", err))
	}
	return val
}

func GetDangerBalanceThreshold() string {
	return getEnvOrPanic(DANGER_BALANCE_THRESHOLD)
}

func GetBalanceDecreaseThreshold() string {
	return getEnvOrPanic(BALANCE_DECREASE_THRESHOLD)
}

func GetSlackWebhookURL() string {
	return getEnvOrPanic(slackWebhookURL)
}

func GetSignMode() string {
	return getEnvOrDefault(signMode, "local")
}
