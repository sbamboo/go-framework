package common

import "mcc-app/libfwlink"

func Run() {
	fw := libfwlink.SetupFramework()

	fw.Debugger.Activate()

	println("Channel:")
	println(fw.Update.GetUpdateConfig().Channel)
}