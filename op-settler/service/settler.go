package service

import (
	"context"
	"log"
	"math/big"
	"encoding/json"

	"github.com/settlus/op-settler/contract"

    "github.com/ethereum/go-ethereum"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

func StartSettler(ctx context.Context) error {
	client, err := ethclient.Dial(GetEthEndpoint())
	if err != nil {
		log.Fatalf("Failed to connect to the Ethereum client: %v", err)
		return err
	}

	headerChannel := make(chan *types.Header)
	sub, err := client.SubscribeNewHead(ctx, headerChannel)
	if err != nil {
		log.Fatalf("Failed to subscribe to new block headers: %v", err)
		return err
	}

	for {
		select {
		case err := <-sub.Err():
			log.Fatalf("Subscription error: %v", err)
		case header := <-headerChannel:
			log.Printf("New block: %v", header.Number.String())
			callSettleAll(ctx, client)
		}
	}
}

func callSettleAll(ctx context.Context, client *ethclient.Client) {
	privateKey, err := crypto.HexToECDSA(GetPrivateKey())
	if err != nil {
		log.Fatalf("Failed to load private key: %v", err)
	}

	fromAddress := crypto.PubkeyToAddress(privateKey.PublicKey)
	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		log.Fatalf("Failed to get nonce: %v", err)
	}

	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		log.Fatalf("Failed to get gas price: %v", err)
	}

	//TODO: get chainid from config?
	chainID, err := client.NetworkID(ctx)
	if err != nil {
		log.Fatalf("Failed to get chain ID: %v", err)
	}

	contractAddress := common.HexToAddress(GetContractAddress())
	contractABI := contract.NewTenantFactoryABI()

	inputData, err := contractABI.Pack("settleAll")
	if err != nil {
		log.Fatalf("Failed to pack input data: %v", err)
	}

	// Estimate gas limit
	msg := ethereum.CallMsg{
		From: fromAddress,
		To:   &contractAddress,
		Data: inputData,
	}
	gasLimit, err := client.EstimateGas(ctx, msg)
	if err != nil {
		log.Fatalf("Failed to estimate gas: %v", err)
	}

	tx := types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       &contractAddress,
		Value:    big.NewInt(0),
		Gas:      gasLimit,
		GasPrice: gasPrice,
		Data:     inputData,
	})

	signer := types.LatestSignerForChainID(chainID)

	signedTx, err := types.SignTx(tx, signer, privateKey)
	if err != nil {
		log.Fatalf("Failed to sign transaction: %v", err)
	}

	err = client.SendTransaction(ctx, signedTx)
	if err != nil {
		log.Fatalf("Failed to send transaction: %v", err)
	}

	log.Printf("Transaction sent: %s", signedTx.Hash().Hex())

	txReceipt, err := bind.WaitMined(ctx, client, signedTx)
	if err != nil {
		log.Fatalf("Failed to wait for transaction mining: %v", err)
	}

	gasUsed := txReceipt.GasUsed
	totalFeeWei := new(big.Int).Mul(new(big.Int).SetUint64(gasUsed), gasPrice)
	totalFeeEther := new(big.Float).Quo(new(big.Float).SetInt(totalFeeWei), big.NewFloat(1e18))

	if txReceipt.Status == types.ReceiptStatusSuccessful {
		log.Printf("Transaction successful: %s", signedTx.Hash().Hex())
		log.Printf("Gas used: %d, Total fee (ether): %f", gasUsed, totalFeeEther)
	} else {
		// TODO: for debugging purposes, remove?
		tx, _, err := client.TransactionByHash(ctx, signedTx.Hash())
		if err != nil {
			log.Fatalf("Failed to get transaction by hash: %v", err)
		}

		msg := ethereum.CallMsg{
			From: fromAddress,
			To:   tx.To(),
			Data: tx.Data(),
			Gas:  0,
		}

		result, err := client.CallContract(ctx, msg, txReceipt.BlockNumber)
		if err != nil {
			log.Fatalf("Failed to call contract: %v", err)
			return
		}

		var decodedResult map[string]interface{}
		if err := json.Unmarshal([]byte(result), &decodedResult); err != nil {
			log.Fatalf("Failed to unmarshal revert reason: %v", err)
		}

		if revertReason, ok := decodedResult["error"].(string); ok {
			log.Fatalf("Revert reason: %s\n", revertReason)
		} else {
			log.Fatalf("Failed to parse revert reason\n")
		}
	}
}
