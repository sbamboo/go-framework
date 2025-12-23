//go:build no_gopsutil

package goframework_platform

import (
	fwcommon "github.com/sbamboo/goframework/common"
)

var BUILD_FLAG_NOGOPSUTIL = true

func GetFilledHostDescriptor() fwcommon.HostDescriptor {
	return GetHostDescriptor()
}
