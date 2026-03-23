package common

import (
	"fmt"
	"mcc-app/libfwlink"

	mccl "github.com/sbamboo/mcc-lib"
)

func Run() {
	fw := libfwlink.SetupFramework()

	fw.Debugger.Activate()

	println("Channel:")
	println(fw.Update.GetUpdateConfig().Channel)

	mcclib := mccl.NewMCCLib(fw)

	//repo, err := mcclib.GetRepo("https://github.com/sbamboo/go-framework/raw/refs/heads/apps/mcc-lib/docs/oldformatconv/old-repo.json")
	repo, err := mcclib.GetRepo("https://github.com/sbamboo/go-framework/raw/refs/heads/apps/mcc-lib/docs/llm_format_attempt_1.json")
	if err != nil {
		fmt.Printf("Error fetching repository: %v\n", err)
		return
	}
	fmt.Printf("Fetched repository: %+v\n", repo)
}