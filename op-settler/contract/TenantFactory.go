package contract

import (
	"bytes"
	_ "embed"

	"github.com/ethereum/go-ethereum/accounts/abi"
)

//go:embed TenantFactoryABI.json
var tenantFactory []byte

func NewTenantFactoryABI() *abi.ABI {
	return loadABI(tenantFactory)
}

func loadABI(json []byte) *abi.ABI {
	if parsed, err := abi.JSON(bytes.NewReader(json)); err != nil {
		panic(err)
	} else {
		return &parsed
	}
}
