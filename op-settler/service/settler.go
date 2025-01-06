package service

import (
	"context"
	_ "embed"
	"math/big"

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

	txChecker := NewTxChecker(client)
	txChecker.Start(ctx)
	defer txChecker.Shutdown()

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
			go func() {
				tx, msg, err := callSettleAll(ctx, client, signer)
				if err != nil {
					log.Errorf("Failed to call settleAll: %v", err)
				} else {
					if tx != nil {
						txChecker.CheckTransaction(&TxCheckMsg{tx, &msg})
						log.Debugf("Transaction msg: %+v", msg)
					}
				}
			}()
		}
	}
}

func callSettleAll(ctx context.Context, client *ethclient.Client, signer Signer) (*types.Transaction, ethereum.CallMsg, error) {
	chainID, err := client.NetworkID(ctx)
	if err != nil {
		log.Errorf("Failed to get chain ID: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	proxyAddress := common.HexToAddress(GetProxyAddress())
	tenantManagerABI := contract.LoadABI(contract.TenantManager)

	needSettlement, err := checkNeedSettlement(ctx, client, tenantManagerABI, proxyAddress)
	if err != nil {
		log.Errorf("Failed to get settle required tenants: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	if !needSettlement {
		log.Infof("No tenants to settle")
		return nil, ethereum.CallMsg{}, nil
	}

	inputData, err := tenantManagerABI.Pack("settleAll")
	if err != nil {
		log.Errorf("Failed to pack input data: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	fromAddress := signer.PublicAddress()
	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		log.Errorf("Failed to get nonce: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		log.Errorf("Failed to get gas price: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	msg := ethereum.CallMsg{
		From: fromAddress,
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
		log.Errorf("Failed to return signed signature: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	err = client.SendTransaction(ctx, signedTx)
	if err != nil {
		log.Errorf("Failed to send transaction: %v", err)
		return nil, ethereum.CallMsg{}, err
	}

	log.Infof("Transaction sent: %s", signedTx.Hash().Hex())

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

	// Unpack the boolean result from the call
	var needSettlement bool
	err = tenantManagerABI.UnpackIntoInterface(&needSettlement, "checkNeedSettlement", result)
	if err != nil {
		log.Errorf("Failed to unpack result for checkNeedSettlement: %v", err)
		return false, err
	}

	return needSettlement, nil
}
