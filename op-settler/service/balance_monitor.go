package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"sync"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	log "github.com/sirupsen/logrus"
)

type balanceState struct {
	lastAlertBalance *big.Int
	wasInDanger      bool
	mu               sync.Mutex
}

var state = &balanceState{
	lastAlertBalance: nil,
	wasInDanger:      false,
}

func sendSlackNotification(webhookURL, message string) error {
	payload := map[string]string{
		"text": message,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("slack notification failed: %d", resp.StatusCode)
	}

	return nil
}

func ethToWei(ethAmount string) (*big.Int, error) {
	amountFloat, ok := new(big.Float).SetString(ethAmount)
	if !ok {
		return nil, fmt.Errorf("failed to parse amount: %s", ethAmount)
	}
	amountFloat.Mul(amountFloat, new(big.Float).SetInt64(1e18))
	amountWei, _ := amountFloat.Int(nil)
	return amountWei, nil
}

func shouldSendAlert(currentBalance, lastAlertBalance *big.Int, wasInDanger bool, thresholdWei, changeThresholdWei *big.Int) bool {
	isDanger := currentBalance.Cmp(thresholdWei) < 0
	if isDanger != wasInDanger {
		return true
	}

	if isDanger && lastAlertBalance != nil {
		return new(big.Int).Sub(lastAlertBalance, currentBalance).Cmp(changeThresholdWei) >= 0
	}

	return false
}

func checkBalance(ctx context.Context, client *ethclient.Client, signer Signer, currentBlock *big.Int) error {
	lastTwoDigits := currentBlock.Int64() % 100
	if lastTwoDigits != 0 && lastTwoDigits != 99 {
		return nil
	}

	balance, err := client.BalanceAt(ctx, signer.PublicAddress(), nil)
	if err != nil {
		return fmt.Errorf("failed to check balance: %v", err)
	}

	thresholdWei, err := ethToWei(GetDangerBalanceThreshold())
	if err != nil {
		return err
	}

	changeThresholdWei, err := ethToWei(GetBalanceDecreaseThreshold())
	if err != nil {
		return err
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	if shouldSendAlert(balance, state.lastAlertBalance, state.wasInDanger, thresholdWei, changeThresholdWei) {
		isDanger := balance.Cmp(thresholdWei) < 0
		state.wasInDanger = isDanger
		state.lastAlertBalance = balance
		return sendAlert(signer.PublicAddress(), balance, isDanger)
	}

	return nil
}

func sendAlert(address common.Address, balance *big.Int, isDanger bool) error {
	var message string
	if isDanger {
		message = fmt.Sprintf("⚠️ Settler 지갑의 ETH 잔고가 위험 수준으로 내려갔습니다.\n *주소*: %s\n *현재 잔고*: %s ETH\n",
			address.Hex(),
			formatBalance(balance))
		log.Warnf("sent danger alert: address=%s, balance=%s ETH",
			address.Hex(),
			formatBalance(balance))
	} else {
		message = fmt.Sprintf("✅ Settler 지갑의 ETH 잔고가 회복되었습니다.\n *주소*: %s\n *현재 잔고*: %s ETH\n",
			address.Hex(),
			formatBalance(balance))
		log.Infof("sent recovery alert: address=%s, balance=%s ETH",
			address.Hex(),
			formatBalance(balance))
	}

	if err := sendSlackNotification(GetSlackWebhookURL(), message); err != nil {
		log.Errorf("failed to send slack notification: %v", err)
		return err
	}

	return nil
}

func formatBalance(balance *big.Int) string {
	return new(big.Float).Quo(new(big.Float).SetInt(balance), new(big.Float).SetInt64(1e18)).Text('f', 6)
}
