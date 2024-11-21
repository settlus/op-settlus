package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"math/big"

	log "github.com/sirupsen/logrus"

	"github.com/settlus/op-settler/contract"

	"github.com/ethereum/go-ethereum"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

type TenantSchedule struct {
	Address  common.Address
	Schedule *big.Int
}

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
			blockTime := header.Time
			err := callSettleAll(ctx, client, blockTime)
			if err != nil {
				log.Errorf("Failed to call settleAll: %v", err)
			}
		}
	}
}

func callSettleAll(ctx context.Context, client *ethclient.Client, currentBlockTime uint64) error {
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

	proxyAddress := common.HexToAddress(GetProxyAddress())
	tenantManagerABI := contract.LoadABI(contract.TenantManager)

	targetTenants, err := getSettlementSchedule(ctx, client, tenantManagerABI, proxyAddress)
	if err != nil {
		log.Errorf("Failed to get settle required tenants: %v", err)
		return err
	}

	readyToSettleTenants := filterPassedScheduleTenants(targetTenants, new(big.Int).SetUint64(currentBlockTime))
	if len(readyToSettleTenants) == 0 {
		log.Infof("No tenants to settle")
		return nil
	}

	maxBatchSizeStr := GetMaxBatchSize()
	maxBatchSize := new(big.Int)
	maxBatchSize, ok := maxBatchSize.SetString(maxBatchSizeStr, 10)
	if !ok {
		log.Errorf("Failed to convert maxBatchSize string to big.Int: %s", maxBatchSizeStr)
		return err
	}

	inputData, err := tenantManagerABI.Pack("settleAll", readyToSettleTenants, maxBatchSize)
	if err != nil {
		log.Errorf("Failed to pack input data: %v", err)
		return err
	}

	msg := ethereum.CallMsg{
		From: fromAddress,
		To:   &proxyAddress,
		Data: inputData,
	}

	gasLimit, err := client.EstimateGas(ctx, msg)
	if err != nil {
		log.Errorf("Failed to estimate gas: %v", err)
		return err
	}

	tx := types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       &proxyAddress,
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
	feeString := totalFeeEther.Text('f', 18)

	if txReceipt.Status == types.ReceiptStatusSuccessful {
		log.Infof("Transaction successful: %s", signedTx.Hash().Hex())
		log.Debugf("Gas used: %d, Total fee (ether): %s ETH", gasUsed, feeString)
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
			Gas:  gasLimit * 2,
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

func getSettlementSchedule(ctx context.Context, client *ethclient.Client, tenantManagerABI *abi.ABI, contractAddress common.Address) ([]TenantSchedule, error) {
	getSettlementScheduleData, err := tenantManagerABI.Pack("getTenantSettlementSchedules")
	if err != nil {
		log.Errorf("Failed to pack data for getTenantSettlementSchedules: %v", err)
		return nil, err
	}

	msg := ethereum.CallMsg{
		To:   &contractAddress,
		Data: getSettlementScheduleData,
	}

	result, err := client.CallContract(ctx, msg, nil)
	if err != nil {
		log.Errorf("Failed to call contract for getTenantSettlementSchedules: %v", err)
		return nil, err
	}

	var addresses []common.Address
	var schedules []*big.Int

	err = tenantManagerABI.UnpackIntoInterface(&struct {
		Addresses *[]common.Address
		Schedules *[]*big.Int
	}{
		Addresses: &addresses,
		Schedules: &schedules,
	}, "getTenantSettlementSchedules", result)
	if err != nil {
		return nil, err
	}

	tenantSchedules := make([]TenantSchedule, len(addresses))

	for i := range addresses {
		tenantSchedules[i] = TenantSchedule{
			Address:  addresses[i],
			Schedule: schedules[i],
		}
	}

	return tenantSchedules, nil
}

func filterPassedScheduleTenants(tenantSchedules []TenantSchedule, currentBlockTime *big.Int) []common.Address {
	var passedScheduleTenants []common.Address

	for _, tenant := range tenantSchedules {
		if tenant.Schedule.Cmp(currentBlockTime) <= 0 {
			passedScheduleTenants = append(passedScheduleTenants, tenant.Address)
		}
	}

	return passedScheduleTenants
}
