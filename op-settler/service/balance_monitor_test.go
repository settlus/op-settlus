package service

import (
	"math/big"
	"testing"
)

func TestShouldSendAlert(t *testing.T) {
	thresholdWei := new(big.Int).Mul(big.NewInt(1), big.NewInt(1e18))       // 1 ETH
	changeThresholdWei := new(big.Int).Mul(big.NewInt(1), big.NewInt(1e15)) // 0.001 ETH

	tests := []struct {
		name             string
		currentBalance   *big.Int
		lastAlertBalance *big.Int
		wasInDanger      bool
		want             bool
	}{
		{
			name:             "danger",
			currentBalance:   new(big.Int).Mul(big.NewInt(5), big.NewInt(1e17)),
			lastAlertBalance: nil,
			wasInDanger:      false,
			want:             true,
		},
		{
			name:             "ok",
			currentBalance:   new(big.Int).Mul(big.NewInt(15), big.NewInt(1e17)),
			lastAlertBalance: nil,
			wasInDanger:      false,
			want:             false,
		},
		{
			name:             "recovered",
			currentBalance:   new(big.Int).Mul(big.NewInt(15), big.NewInt(1e17)),
			lastAlertBalance: new(big.Int).Mul(big.NewInt(5), big.NewInt(1e17)),
			wasInDanger:      true,
			want:             true,
		},
		{
			name:             "decrease",
			currentBalance:   new(big.Int).Mul(big.NewInt(49), big.NewInt(1e16)),
			lastAlertBalance: new(big.Int).Mul(big.NewInt(5), big.NewInt(1e17)),
			wasInDanger:      true,
			want:             false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldSendAlert(tt.currentBalance, tt.lastAlertBalance, tt.wasInDanger, thresholdWei, changeThresholdWei)
			if got != tt.want {
				t.Errorf("shouldSendAlert() = %v, want %v", got, tt.want)
			}
		})
	}
}
