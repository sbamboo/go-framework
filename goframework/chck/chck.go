package goframework_chck

import (
	"crypto"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"hash"
	"hash/crc32"
	"io"
	"os"
	"strings"

	fwcommon "github.com/sbamboo/goframework/common"
)

// Implements fwcommon.ChckInterface
type Chck struct {
	log fwcommon.LoggerInterface // Pointer
}

func NewChck(logPtr fwcommon.LoggerInterface) *Chck {
	return &Chck{
		log: logPtr,
	}
}

func (cptr *Chck) newHasher(algo fwcommon.HashAlgorithm) (hash.Hash, error) {
	switch algo {
	case fwcommon.SHA1:
		return sha1.New(), nil
	case fwcommon.SHA256:
		return sha256.New(), nil
	case fwcommon.CRC32:
		return crc32.NewIEEE(), nil
	default:
		return nil, cptr.log.LogThroughError(errors.New("unsupported algorithm"))
	}
}

// Takes a PEM-encoded public key and turns it as a Go crypto-public-key object
func (cptr *Chck) parsePublicKey(pemBytes []byte) (any, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, cptr.log.LogThroughError(errors.New("invalid public key PEM"))
	}

	// Explicitly reject private keys
	if strings.Contains(strings.ToUpper(block.Type), "PRIVATE") {
		return nil, cptr.log.LogThroughError(
			errors.New("private key supplied where public key expected"),
		)
	}

	pubKey, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, cptr.log.LogThroughError(err)
	}

	return pubKey, nil
}

// Get the checksum of a file
func (cptr *Chck) Hash(file string, algo fwcommon.HashAlgorithm) string {
	h, err := cptr.newHasher(algo)
	if err != nil {
		return ""
	}

	f, err := os.Open(file)
	if err != nil {
		cptr.log.LogThroughError(err)
		return ""
	}
	defer f.Close()

	if _, err := io.Copy(h, f); err != nil {
		cptr.log.LogThroughError(err)
		return ""
	}

	return hex.EncodeToString(h.Sum(nil))
}

// Get the checksum of a byte buffer
func (cptr *Chck) HashBuff(buf []byte, algo fwcommon.HashAlgorithm) string {
	h, err := cptr.newHasher(algo)
	if err != nil {
		return ""
	}

	_, _ = h.Write(buf)
	return hex.EncodeToString(h.Sum(nil))
}

// Get the checksum of a content string
func (cptr *Chck) HashStr(content string, algo fwcommon.HashAlgorithm) string {
	h, err := cptr.newHasher(algo)
	if err != nil {
		return ""
	}

	_, _ = io.Copy(h, strings.NewReader(content))
	return hex.EncodeToString(h.Sum(nil))
}

// Checksum compare of file
func (cptr *Chck) Chck(file string, sum string, algo fwcommon.HashAlgorithm) bool {
	hash := cptr.Hash(file, algo)
	return hash != "" && strings.EqualFold(hash, sum)
}

// Checksum compare of a byte buffer
func (cptr *Chck) ChckBuff(buf []byte, sum string, algo fwcommon.HashAlgorithm) bool {
	hash := cptr.HashBuff(buf, algo)
	return hash != "" && strings.EqualFold(hash, sum)
}

// Checksum of string
func (cptr *Chck) ChckStr(content string, sum string, algo fwcommon.HashAlgorithm) bool {
	hash := cptr.HashStr(content, algo)
	return hash != "" && strings.EqualFold(hash, sum)
}

// Verifies a signature against a byte array
func (cptr *Chck) verifySignature(data []byte, algo fwcommon.SigAlgorithm, pubKeyPEM []byte, signature []byte) bool {
	pubKey, err := cptr.parsePublicKey(pubKeyPEM)
	if err != nil {
		return false
	}

	switch algo {

	case fwcommon.ED25519:
		key, ok := pubKey.(ed25519.PublicKey)
		if !ok {
			cptr.log.LogThroughError(
				errors.New("public key is not Ed25519"),
			)
			return false
		}

		return ed25519.Verify(key, data, signature)

	case fwcommon.RSA:
		key, ok := pubKey.(*rsa.PublicKey)
		if !ok {
			cptr.log.LogThroughError(
				errors.New("public key is not RSA"),
			)
			return false
		}

		hash := sha256.Sum256(data)
		if err := rsa.VerifyPKCS1v15(
			key,
			crypto.SHA256,
			hash[:],
			signature,
		); err != nil {
			cptr.log.LogThroughError(err)
			return false
		}

		return true

	default:
		cptr.log.LogThroughError(
			errors.New("unsupported signature algorithm"),
		)
		return false
	}
}

// Verifies the signature of a signed file (priv/pub)
func (cptr *Chck) Sig(file string, algo fwcommon.SigAlgorithm, pubKeyPEM []byte, signature []byte) bool {
	data, err := os.ReadFile(file)
	if err != nil {
		cptr.log.LogThroughError(err)
		return false
	}

	return cptr.verifySignature(data, algo, pubKeyPEM, signature)
}

// Verifies the signature of a signed byte buffer (priv/pub)
func (cptr *Chck) SigBuff(buf []byte, algo fwcommon.SigAlgorithm, pubKeyPEM []byte, signature []byte) bool {
	return cptr.verifySignature(buf, algo, pubKeyPEM, signature)
}

// Verifies the signature of a signed content string (priv/pub)
func (cptr *Chck) SigStr(content string, algo fwcommon.SigAlgorithm, pubKeyPEM []byte, signature []byte) bool {
	return cptr.verifySignature([]byte(content), algo, pubKeyPEM, signature)
}

// Attempts to infer the hash algorithm from a checksum string
func (cptr *Chck) GuessAlgo(sum string) fwcommon.HashAlgorithm {
	sum = strings.TrimSpace(strings.ToLower(sum))

	// Ensure hex encoding
	if _, err := hex.DecodeString(sum); err != nil {
		return fwcommon.UNKNOWN
	}

	switch len(sum) {
	case 8:
		return fwcommon.CRC32
	case 40:
		return fwcommon.SHA1
	case 64:
		return fwcommon.SHA256
	default:
		return fwcommon.UNKNOWN
	}
}
