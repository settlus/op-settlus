package service

import (
	"context"
	"crypto/ecdsa"
	"crypto/x509/pkix"
	"encoding/asn1"
	"math/big"
	"bytes"
	"encoding/hex"
	"github.com/ethereum/go-ethereum/crypto/secp256k1"

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
	chainID = uint64(53722735)
)

type Signer interface {
	Sign(data []byte) ([]byte, error)
	PublicAddress() common.Address
}

type KmsSigner struct {
	ctx   context.Context
	svc   *kms.Client
	keyId string
	pubkey *ecdsa.PublicKey
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


	input := &kms.GetPublicKeyInput{
		KeyId: &keyId,
	}

	result, err := svc.GetPublicKey(ctx, input)
	if err != nil {
		log.Errorf("failed to get public key from kms: %v", err)
		return nil
	}

	var pki PublicKeyInfo
	_, err = asn1.Unmarshal(result.PublicKey, &pki)
	if err != nil {
		return nil
	}

	pubkey, err := crypto.UnmarshalPubkey(pki.PublicKey.Bytes)
	if err != nil {
		return nil
	}

	return &KmsSigner{
		ctx:   ctx,
		svc:   svc,
		keyId: keyId,
		pubkey: pubkey,
	}
}

func (ks *KmsSigner) Sign(data []byte) ([]byte, error) {
	output, err := ks.svc.Sign(ks.ctx, &kms.SignInput{
		KeyId:            aws.String(ks.keyId),
		Message:          data,
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

	pubKeyBytes := secp256k1.S256().Marshal(ks.pubkey.X, ks.pubkey.Y)

	rBytes := signature.R.Bytes()
	sBytes := signature.S.Bytes()

	rsSignature := append(adjustSignatureLength(rBytes), adjustSignatureLength(sBytes)...)
	compSig := append(rsSignature, []byte{0}...)

	recoveredPublicKeyBytes, err := crypto.Ecrecover(data, compSig)
	if err != nil {
		return nil, err
	}

	if hex.EncodeToString(recoveredPublicKeyBytes) != hex.EncodeToString(pubKeyBytes) {
		compSig = append(rsSignature, []byte{1}...)
		recoveredPublicKeyBytes, err = crypto.Ecrecover(data, compSig)
		if err != nil {
			return nil, err
		}

		if hex.EncodeToString(recoveredPublicKeyBytes) != hex.EncodeToString(pubKeyBytes) {
			return nil, err
		}
	}

	return compSig, nil
}

func (ks *KmsSigner) PublicAddress() common.Address {
	return crypto.PubkeyToAddress(*ks.pubkey)
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

func adjustSignatureLength(buffer []byte) []byte {
	buffer = bytes.TrimLeft(buffer, "\x00")
	for len(buffer) < 32 {
		zeroBuf := []byte{0}
		buffer = append(zeroBuf, buffer...)
	}
	return buffer
}