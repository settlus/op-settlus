package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"

	log "github.com/sirupsen/logrus"

	"github.com/settlus/op-settler/contract"

	"github.com/ethereum/go-ethereum"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

func Start(ctx context.Context) error {
	client, err := ethclient.Dial(GetEthEndpoint())
	if err != nil {
		log.Errorf("Failed to connect to the Ethereum client: %v", err)
		return err
	}

	headerChannel := make(chan *types.Header)
	sub, err := client.SubscribeNewHead(ctx, headerChannel)
	if err != nil {
		log.Errorf("Failed to subscribe to new block headers: %v", err)
		return err
	}

	for {
		select {
		case <-ctx.Done():
			log.Infoln("Context cancelled, shutting down...")
			return nil
		case err := <-sub.Err():
			log.Errorf("Subscription error: %v", err)
			return err
		case header := <-headerChannel:
			log.Printf("New block: %v", header.Number.String())
			err := callSettleAll(ctx, client)
			if err != nil {
				log.Errorf("Failed to call settleAll: %v", err)
				return err
			}
		}
	}
}

func callSettleAll(ctx context.Context, client *ethclient.Client) error {
	privateKey, err := crypto.HexToECDSA(GetPrivateKey())
	if err != nil {
		log.Errorf("Failed to load private key: %v", err)
		return err
	}

	fromAddress := crypto.PubkeyToAddress(privateKey.PublicKey)
	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		log.Errorf("Failed to get nonce: %v", err)
		return err
	}

	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		log.Errorf("Failed to get gas price: %v", err)
		return err
	}

	chainID, err := client.NetworkID(ctx)
	if err != nil {
		log.Errorf("Failed to get chain ID: %v", err)
		return err
	}

	contractAddress := common.HexToAddress(GetProxyAddress())
	contractABI := contract.NewTenantManagerABI()

	inputData, err := contractABI.Pack("settleAll")
	if err != nil {
		log.Errorf("Failed to pack input data: %v", err)
		return err
	}

	msg := ethereum.CallMsg{
		From: fromAddress,
		To:   &contractAddress,
		Data: inputData,
	}
	
	gasLimit, err := client.EstimateGas(ctx, msg)
	if err != nil {
		log.Errorf("Failed to estimate gas: %v", err)
		return err
	}

	fmt.Printf("Gas limit: %d\n", gasLimit)
	tx := types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       &contractAddress,
		Value:    big.NewInt(0),
		Gas:      gasLimit * 2,
		GasPrice: gasPrice,
		Data:     inputData,
	})

	signer := types.LatestSignerForChainID(chainID)
	signedTx, err := types.SignTx(tx, signer, privateKey)
	if err != nil {
		log.Errorf("Failed to sign transaction: %v", err)
		return err
	}

	err = client.SendTransaction(ctx, signedTx)
	if err != nil {
		log.Errorf("Failed to send transaction: %v", err)
		return err
	}

	log.Infof("Transaction sent: %s", signedTx.Hash().Hex())

	txReceipt, err := bind.WaitMined(ctx, client, signedTx)
	if err != nil {
		log.Errorf("Failed to wait for transaction mining: %v", err)
		return err
	}

	gasUsed := txReceipt.GasUsed
	totalFeeWei := new(big.Int).Mul(new(big.Int).SetUint64(gasUsed), gasPrice)
	totalFeeEther := new(big.Float).Quo(new(big.Float).SetInt(totalFeeWei), big.NewFloat(1e18))

	if txReceipt.Status == types.ReceiptStatusSuccessful {
		log.Infof("Transaction successful: %s", signedTx.Hash().Hex())
		log.Debugf("Gas used: %d, Total fee (ether): %f ETH", gasUsed, totalFeeEther)
	} else {
		log.Warnf("Transaction failed: %s", signedTx.Hash().Hex())
		tx, _, err := client.TransactionByHash(ctx, signedTx.Hash())
		if err != nil {
			log.Debugf("Failed to get transaction by hash: %v", err)
			return err
		}

		msg := ethereum.CallMsg{
			From: fromAddress,
			To:   tx.To(),
			Data: tx.Data(),
			Gas:  gasLimit,
		}

		result, err := client.CallContract(ctx, msg, txReceipt.BlockNumber)
		if err != nil {
			log.Debugf("Failed to call contract: %v", err)
			return err
		}

		if len(result) == 0 {
			log.Debugf("No revert reason returned")
			return nil
		}

		log.Debugf("Raw revert reason result: %s", result)

		var decodedResult map[string]interface{}
		if err := json.Unmarshal(result, &decodedResult); err != nil {
			log.Debugf("Failed to unmarshal revert reason: %v", err)
			return err
		}

		if revertReason, ok := decodedResult["error"].(string); ok {
			log.Debugf("Revert reason: %s", revertReason)
		} else {
			log.Debugf("Failed to parse revert reason")
		}
	}

	return nil
}
