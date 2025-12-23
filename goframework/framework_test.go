package libgoframework

import (
	"fmt"
	"runtime"
	"testing"
)

func TestMain(t *testing.T) {
	config := &FrameworkConfig{
		DebugSendPort:   9000,
		DebugListenPort: 9001,

		LoggerFile:     nil,
		LoggerFormat:   nil,
		LoggerCallable: nil,

		NetFetchOptions: (&NetFetchOptions{}).Default(),
		UpdatorAppConfiguration: &UpdatorAppConfiguration{
			SemVer:           "0.0.0",
			UIND:             0,
			Channel:          "dev-fwtest",
			Released:         "0000-00-00T00:00:00Z",
			Commit:           "unknown",
			PublicKeyPEM:     []byte{},
			DeployURL:        nil,
			GithubUpMetaRepo: nil,
			Target:           fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH),
		},
	}
	fw := NewFramework(config)

	fmt.Println(fw)

	hash := fw.Chck.HashStr("Hello world", SHA256)

	fmt.Printf("Hash: %s\n", hash)
}
