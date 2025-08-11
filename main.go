package main

import (
	"fmt"
	fwcommon "goframework/common"
	fwdebug "goframework/debug"
	fwlog "goframework/log"
	fwnet "goframework/net"
	fwupdate "goframework/update"
)

type Framework struct {
	Config   *fwcommon.FrameworkConfig
	Net      *fwnet.Net
	Logger   *fwlog.Logger
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
		Logger:   log,
		Debugger: deb,
		Update:   update,
	}
}

func main() {
	config := &fwcommon.FrameworkConfig{DebugSendPort: 9000, DebugListenPort: 9001}
	fw := NewFramework(config)

	fmt.Println(fw)
}
