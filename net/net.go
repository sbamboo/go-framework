package goframework_net

import fwcommon "github.com/sbamboo/goframework/common"

type Net struct {
	config *fwcommon.FrameworkConfig
	deb    fwcommon.DebuggerInterface
}

func NewNetHandler(config *fwcommon.FrameworkConfig, deb fwcommon.DebuggerInterface) *Net {
	return &Net{
		config: config,
		deb:    deb,
	}
}

func (n *Net) Fetch(url string) (any, error) {
	return nil, nil
}
