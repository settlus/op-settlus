package service

import (
	"context"
	"crypto/ecdsa"
	"crypto/x509/pkix"
	"encoding/asn1"
	"fmt"
	"math/big"

	log "github.com/sirupsen/logrus"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/kms/types"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	secp256k1N, _  = new(big.Int).SetString("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16)
	secp256k1halfN = new(big.Int).Div(secp256k1N, big.NewInt(2))
)

type Signer interface {
	Sign(data []byte) ([]byte, error)
	PublicAddress() common.Address
}

type KmsSigner struct {
	ctx   context.Context
	svc   *kms.Client
	keyId string
}

type LocalSigner struct {
	pvKey *ecdsa.PrivateKey
}

type PublicKeyInfo struct {
	Algorithm pkix.AlgorithmIdentifier
	PublicKey asn1.BitString
}

func NewSigner(ctx context.Context) Signer {
	switch GetSignMode() {
	case "remote":
		return NewKmsSigner(ctx)
	default:
		return NewLocalSigner()
	}
}

func NewKmsSigner(ctx context.Context) *KmsSigner {
	awsCfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		panic(err)
	}

	svc := kms.NewFromConfig(awsCfg)
	keyId := GetKmsKeyID()

	signer := &KmsSigner{
		ctx:   ctx,
		svc:   svc,
		keyId: keyId,
	}

	return signer
}

func (ks *KmsSigner) Sign(data []byte) ([]byte, error) {
	hash := crypto.Keccak256(data)
	output, err := ks.svc.Sign(ks.ctx, &kms.SignInput{
		KeyId:            aws.String(ks.keyId),
		Message:          hash,
		MessageType:      types.MessageTypeDigest,
		SigningAlgorithm: types.SigningAlgorithmSpecEcdsaSha256,
	})
	if err != nil {
		return nil, err
	}

	type ecdsaSignature struct {
		R, S *big.Int
	}

	var signature ecdsaSignature
	_, err = asn1.Unmarshal(output.Signature, &signature)
	if err != nil {
		return nil, err
	}

	if signature.S.Cmp(secp256k1halfN) > 0 {
		signature.S = signature.S.Sub(secp256k1N, signature.S)
	}

	rBytes := signature.R.Bytes()
	sBytes := signature.S.Bytes()
	// ??
	sig := make([]byte, 65)

	copy(sig[32-len(rBytes):], rBytes)
	copy(sig[64-len(sBytes):], sBytes)
	// ??
	copy(sig[64:], []byte{1})
	return sig, nil
}

func (ks *KmsSigner) PublicAddress() common.Address {
	input := &kms.GetPublicKeyInput{
		KeyId: &ks.keyId,
	}

	result, err := ks.svc.GetPublicKey(ks.ctx, input)
	if err != nil {
		log.Errorf("failed to get public key from kms: %v", err)
		return common.Address{}
	}

	var pki PublicKeyInfo
	_, err = asn1.Unmarshal(result.PublicKey, &pki)
	if err != nil {
		return common.Address{}
	}

	s256Pub, err := crypto.UnmarshalPubkey(pki.PublicKey.Bytes)
	if err != nil {
		return common.Address{}
	}

	address := crypto.PubkeyToAddress(*s256Pub)

	fmt.Printf("Public key: %s\n", address.Hex())

	return address
}

func NewLocalSigner() *LocalSigner {
	pvKey, err := crypto.HexToECDSA(GetPrivateKey())
	if err != nil {
		panic(err)
	}

	return &LocalSigner{pvKey: pvKey}
}

func (ls *LocalSigner) PublicAddress() common.Address {
	return crypto.PubkeyToAddress(ls.pvKey.PublicKey)
}

func (ls *LocalSigner) Sign(data []byte) ([]byte, error) {
	signature, err := crypto.Sign(data, ls.pvKey)
	if err != nil {
		return nil, err
	}

	return signature, nil
}
