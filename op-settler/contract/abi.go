package contract

import (
	"bytes"
	_ "embed"

	"github.com/ethereum/go-ethereum/accounts/abi"
)

var (
	//go:embed TenantManagerABI.json
	TenantManager []byte
	//go:embed TenantABI.json
	Tenant []byte
)

func LoadABI(json []byte) *abi.ABI {
	if parsed, err := abi.JSON(bytes.NewReader(json)); err != nil {
		panic(err)
	} else {
		return &parsed
	}
}
