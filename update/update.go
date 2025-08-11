package goframework_update

import fwcommon "github.com/sbamboo/goframework/common"

type NetUpdater struct {
	config  *fwcommon.FrameworkConfig
	fetcher fwcommon.FetcherInterface
}

func NewNetUpdater(config *fwcommon.FrameworkConfig, fetcher fwcommon.FetcherInterface) *NetUpdater {
	return &NetUpdater{
		config:  config,
		fetcher: fetcher,
	}
}
