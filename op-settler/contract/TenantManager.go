package contract

import (
	"bytes"
	_ "embed"

	"github.com/ethereum/go-ethereum/accounts/abi"
)

//go:embed TenantManagerABI.json
var tenantManager []byte

func NewTenantManagerABI() *abi.ABI {
	return loadABI(tenantManager)
}

func loadABI(json []byte) *abi.ABI {
	if parsed, err := abi.JSON(bytes.NewReader(json)); err != nil {
		panic(err)
	} else {
		return &parsed
	}
}
