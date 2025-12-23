//go:build !no_gopsutil

package goframework_platform

import (
	fwcommon "github.com/sbamboo/goframework/common"
	"github.com/shirou/gopsutil/v4/host"
)

var BUILD_FLAG_NOGOPSUTIL = false

func GetFilledHostDescriptor() fwcommon.HostDescriptor {
	info, err := host.Info()
	if err == nil {
		return fwcommon.HostDescriptor{
			OS:                   info.OS,
			Platform:             info.Platform,
			PlatformFamily:       info.PlatformFamily,
			PlatformVersion:      info.PlatformVersion,
			KernelVersion:        info.KernelVersion,
			KernelArch:           info.KernelArch,
			VirtualizationSystem: info.VirtualizationSystem,
			VirtualizationRole:   info.VirtualizationRole,
			HostID:               info.HostID,
			Hostname:             GetHostname(),
			TempDir:              GetTempDir(),
			WorkingDir:           GetWorkingDir(),
			User: fwcommon.UserDescriptor{
				Name:      GetHostUsrName(),
				Username:  GetHostUsrUsername(),
				HomeDir:   GetHostHomeDir(),
				ConfigDir: GetHostConfigDir(),
				CacheDir:  GetHostConfigDir(),
			},
			LegacyWindows: false,
			Win32API:      nil,
		}
	} else {
		return GetHostDescriptor()
	}
}
