package libgoframework

import (
	fwchck "github.com/sbamboo/goframework/chck"
	fwcommon "github.com/sbamboo/goframework/common"
	fwdebug "github.com/sbamboo/goframework/debug"
	fwlog "github.com/sbamboo/goframework/log"
	fwnet "github.com/sbamboo/goframework/net"
	fwplatform "github.com/sbamboo/goframework/platform"
	fwupdate "github.com/sbamboo/goframework/update"
)

type Framework struct {
	Config   *fwcommon.FrameworkConfig
	Net      *fwnet.NetHandler
	Log      *fwlog.Logger
	Debugger *fwdebug.DebugEmitter
	Chck     *fwchck.Chck
	Update   *fwupdate.NetUpdater
}

func NewFramework(config *fwcommon.FrameworkConfig) *Framework {
	deb := fwdebug.NewDebugEmitter(config)
	log := fwlog.NewLogger(config, deb)
	net := fwnet.NewNetHandler(config, deb, log, nil) // For now nil as the progressor(...)
	chck := fwchck.NewChck(log)
	var update *fwupdate.NetUpdater
	if config.UpdatorAppConfiguration != nil {
		update = fwupdate.NewNetUpdater(config, net, log)
	}
	return &Framework{
		Config:   config,
		Net:      net,
		Log:      log,
		Debugger: deb,
		Chck:     chck,
		Update:   update,
	}
}

// MARK: Exports
type JSONObject = fwcommon.JSONObject

type FrameworkConfig = fwcommon.FrameworkConfig
type UpdatorAppConfiguration = fwcommon.UpdatorAppConfiguration
type NetFetchOptions = fwcommon.NetFetchOptions

type ProgressorFn = fwcommon.ProgressorFn
type NetworkProgressReportInterface = fwcommon.NetworkProgressReportInterface
type NetworkEvent = fwcommon.NetworkEvent
type HttpMethod = fwcommon.HttpMethod

var MethodGet = fwcommon.MethodGet
var MethodHead = fwcommon.MethodHead
var MethodPost = fwcommon.MethodPost
var MethodPut = fwcommon.MethodPut
var MethodPatch = fwcommon.MethodPatch
var MethodDelete = fwcommon.MethodDelete
var MethodConnect = fwcommon.MethodConnect
var MethodOptions = fwcommon.MethodOptions
var MethodTrace = fwcommon.MethodTrace

type ElementIdentifier = fwcommon.ElementIdentifier
type NetPriority = fwcommon.NetPriority

var NetPriorityUnset = fwcommon.NetPriorityUnset

type NetDirection = fwcommon.NetDirection

var NetOutgoing = fwcommon.NetOutgoing
var NetIncoming = fwcommon.NetIncoming

type NetState = fwcommon.NetState

var NetStateWaiting = fwcommon.NetStateWaiting
var NetStatePaused = fwcommon.NetStatePaused
var NetStateRetry = fwcommon.NetStateRetry
var NetStateEstablished = fwcommon.NetStateEstablished
var NetStateResponded = fwcommon.NetStateResponded
var NetStateTransfer = fwcommon.NetStateTransfer
var NetStateFinished = fwcommon.NetStateFinished

type HashAlgorithm = fwcommon.HashAlgorithm

var SHA1 = fwcommon.SHA1
var SHA256 = fwcommon.SHA256
var CRC32 = fwcommon.CRC32
var UNKNOWN = fwcommon.UNKNOWN

type SigAlgorithm = fwcommon.SigAlgorithm

var ED25519 = fwcommon.ED25519
var RSA = fwcommon.RSA

type LogLevel = fwcommon.LogLevel

func GetDescriptor() *fwcommon.PlatformDescriptor {
	return fwplatform.GetDescriptor()
}

type UsageStat = fwcommon.UsageStat

func GetUsageStats() (*fwcommon.UsageStat, error) {
	return fwplatform.GetUsageStats()
}
