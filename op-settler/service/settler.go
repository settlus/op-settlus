package service

import (
	"context"
	_ "embed"
	"math/big"
	"time"

	log "github.com/sirupsen/logrus"

	"github.com/settlus/op-settler/contract"

	"github.com/ethereum/go-ethereum"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

func Start(ctx context.Context) error {
	client, err := ethclient.Dial(GetEthEndpoint())
	if err != nil {
		log.Errorf("Failed to connect to the Ethereum client: %v", err)
		return err
	}

	signer := NewSigner(ctx)
	fromAddress := signer.PublicAddress()

	txChecker := NewTxChecker(client)
	txChecker.Start(ctx)
	defer txChecker.Shutdown()

	var lastBlockNum *big.Int
	var lastProcessedNonce uint64

	initialNonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		log.Errorf("Failed to fetch initial nonce: %v", err)
		return err
	}
	lastProcessedNonce = initialNonce
	log.Infof("Starting with initial nonce: %v", initialNonce)

	ticker := time.NewTicker(time.Duration(GetPollingInterval()) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Infoln("Context cancelled, shutting down...")
			return nil
		case <-ticker.C:
			header, err := client.HeaderByNumber(ctx, nil)
			if err != nil {
				log.Errorf("Failed to get latest block header: %v", err)
				continue
			}

			if lastBlockNum != nil && header.Number.Cmp(lastBlockNum) <= 0 {
				continue
			}

			lastBlockNum = header.Number
			log.Infof("Processing new block: %v", header.Number.String())

			go func() {
				currentNonce, err := client.PendingNonceAt(ctx, fromAddress)
				if err != nil {
					log.Errorf("Failed to fetch nonce: %v", err)
					return
				}

				if currentNonce != 0 && currentNonce <= lastProcessedNonce {
					log.Debugf("Current nonce (%v) <= last processed nonce (%v). Waiting for next block.",
						currentNonce, lastProcessedNonce)
					return
				}

				tx, msg, err := callSettleAll(ctx, client, signer, currentNonce)
				if err != nil {
					log.Errorf("Failed to call settleAll: %v", err)
				} else if tx != nil {
					lastProcessedNonce = currentNonce
					txChecker.CheckTransaction(&TxCheckMsg{tx, &msg})
					log.Infof("Transaction successfully sent with nonce %v", tx.Nonce())
				}
			}()
		}
	}
}

func callSettleAll(ctx context.Context, client *ethclient.Client, signer Signer, nonce uint64) (*types.Transaction, ethereum.CallMsg, error) {
	chainID, err := client.NetworkID(ctx)
	if err != nil {
		log.Errorf("Failed to get chain ID: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	proxyAddress := common.HexToAddress(GetProxyAddress())
	tenantManagerABI := contract.LoadABI(contract.TenantManager)

	needSettlement, err := checkNeedSettlement(ctx, client, tenantManagerABI, proxyAddress)
	if err != nil {
		log.Errorf("Failed to determine if settlement is needed: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	if !needSettlement {
		log.Infof("No tenants require settlement at this time.")
		return nil, ethereum.CallMsg{}, nil
	}

	inputData, err := tenantManagerABI.Pack("settleAll")
	if err != nil {
		log.Errorf("Failed to pack input data for settleAll: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		log.Errorf("Failed to get gas price: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	msg := ethereum.CallMsg{
		From: signer.PublicAddress(),
		To:   &proxyAddress,
		Data: inputData,
	}

	gasLimit, err := client.EstimateGas(ctx, msg)
	if err != nil {
		log.Errorf("Failed to estimate gas: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	tx := types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       msg.To,
		Value:    big.NewInt(0),
		Gas:      gasLimit * 2,
		GasPrice: gasPrice,
		Data:     msg.Data,
	})

	latestSigner := types.LatestSignerForChainID(chainID)
	txBytes := latestSigner.Hash(tx).Bytes()

	signature, err := signer.Sign(txBytes)
	if err != nil {
		log.Errorf("Failed to sign transaction: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	signedTx, err := tx.WithSignature(latestSigner, signature)
	if err != nil {
		log.Errorf("Failed to apply signature to transaction: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	err = client.SendTransaction(ctx, signedTx)
	if err != nil {
		log.Errorf("Failed to send transaction: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	log.Infof("Transaction sent successfully: %s", signedTx.Hash().Hex())
	return signedTx, msg, nil
}

func checkNeedSettlement(ctx context.Context, client *ethclient.Client, tenantManagerABI *abi.ABI, contractAddress common.Address) (bool, error) {
	getSettlementScheduleData, err := tenantManagerABI.Pack("checkNeedSettlement")
	if err != nil {
		log.Errorf("Failed to pack data for checkNeedSettlement: %v", err)
		return false, err
	}

	msg := ethereum.CallMsg{
		To:   &contractAddress,
		Data: getSettlementScheduleData,
	}

	result, err := client.CallContract(ctx, msg, nil)
	if err != nil {
		log.Errorf("Failed to call contract for checkNeedSettlement: %v", err)
		return false, err
	}

	var needSettlement bool
	err = tenantManagerABI.UnpackIntoInterface(&needSettlement, "checkNeedSettlement", result)
	if err != nil {
		log.Errorf("Failed to unpack result for checkNeedSettlement: %v", err)
		return false, err
	}

	return needSettlement, nil
}
