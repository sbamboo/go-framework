package main

import (
	"fmt"

	fwcommon "github.com/sbamboo/goframework/common"
	fwdebug "github.com/sbamboo/goframework/debug"
	fwlog "github.com/sbamboo/goframework/log"
	fwnet "github.com/sbamboo/goframework/net"
	fwupdate "github.com/sbamboo/goframework/update"
)

type Framework struct {
	Config   *fwcommon.FrameworkConfig
	Net      *fwnet.NetHandler
	Log      *fwlog.Logger
	Debugger *fwdebug.DebugEmitter
	Update   *fwupdate.NetUpdater
}

func NewFramework(config *fwcommon.FrameworkConfig) *Framework {
	deb := fwdebug.NewDebugEmitter(config)
	net := fwnet.NewNetHandler(config, deb)
	log := fwlog.NewLogger(config, deb)
	update := fwupdate.NewNetUpdater(config, net)
	return &Framework{
		Config:   config,
		Net:      net,
		Log:      log,
		Debugger: deb,
		Update:   update,
	}
}

func main() {
	config := &fwcommon.FrameworkConfig{
		DebugSendPort:   9000,
		DebugListenPort: 9001,

		LoggerFile:     nil,
		LoggerFormat:   nil,
		LoggerCallable: nil,
	}
	fw := NewFramework(config)

	fmt.Println(fw)
}
