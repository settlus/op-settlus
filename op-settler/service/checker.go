package service

import (
	"context"
	"encoding/json"
	"math/big"
	"sync"

	log "github.com/sirupsen/logrus"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

type TxChecker struct {
	client    *ethclient.Client
	txChannel chan *TxCheckMsg
	wg        sync.WaitGroup
}

type TxCheckMsg struct {
	tx  *types.Transaction
	msg *ethereum.CallMsg
}

func NewTxChecker(client *ethclient.Client) *TxChecker {
	return &TxChecker{
		client:    client,
		txChannel: make(chan *TxCheckMsg),
	}
}

func (tc *TxChecker) Start(ctx context.Context) {
	tc.wg.Add(1)
	go func() {
		defer tc.wg.Done()
		for {
			select {
			case <-ctx.Done():
				log.Infoln("Transaction logger shutting down...")
				return
			case tx := <-tc.txChannel:
				tc.checkTransactionStatus(ctx, tx)
			}
		}
	}()
}

func (tc *TxChecker) checkTransactionStatus(ctx context.Context, checkMsg *TxCheckMsg) {
	txReceipt, err := bind.WaitMined(ctx, tc.client, checkMsg.tx)
	if err != nil {
		log.Errorf("Failed to wait for transaction mining: %v", err)
		return
	}

	gasUsed := txReceipt.GasUsed
	totalFeeWei := new(big.Int).Mul(new(big.Int).SetUint64(gasUsed), checkMsg.tx.GasPrice())
	totalFeeEther := new(big.Float).Quo(new(big.Float).SetInt(totalFeeWei), big.NewFloat(1e18))
	feeString := totalFeeEther.Text('f', 18)

	if txReceipt.Status == types.ReceiptStatusSuccessful {
		log.Infof("Transaction successful: %s", checkMsg.tx.Hash().Hex())
		log.Debugf("Gas used: %d, Total fee (ether): %s ETH", gasUsed, feeString)
	} else {
		log.Warnf("Transaction failed: %s", checkMsg.tx.Hash().Hex())
		_, _, err := tc.client.TransactionByHash(ctx, checkMsg.tx.Hash())
		if err != nil {
			log.Debugf("Failed to get transaction by hash: %v", err)
			return
		}

		result, err := tc.client.CallContract(ctx, *checkMsg.msg, txReceipt.BlockNumber)
		if err != nil {
			log.Debugf("Failed to call contract: %v", err)
			return
		}

		if len(result) == 0 {
			log.Debugf("No revert reason returned")
			return
		}

		var decodedResult map[string]interface{}
		if err := json.Unmarshal(result, &decodedResult); err != nil {
			log.Debugf("Failed to unmarshal revert reason: %v", err)
			return
		}

		if revertReason, ok := decodedResult["error"].(string); ok {
			log.Warnf("Revert reason: %s", revertReason)
		} else {
			log.Debugf("Failed to parse revert reason")
		}
	}
}

func (tc *TxChecker) CheckTransaction(tx *TxCheckMsg) {
	tc.txChannel <- tx
}

func (tl *TxChecker) Shutdown() {
	close(tl.txChannel)
	tl.wg.Wait()
}
