//go:build no_gopsutil

package goframework_platform

import (
	fwcommon "github.com/sbamboo/goframework/common"
)

var BUILD_FLAG_NOGOPSUTIL = true

func GetFilledHostDescriptor() fwcommon.HostDescriptor {
	return GetHostDescriptor()
}

func GetProcUsageStats(pid int32) (*fwcommon.UsageStat, error) {
	return &fwcommon.UsageStat{
		Pid:                       pid,
		Name:                      "",
		Status:                    []string{},
		Cmdline:                   "",
		Args:                      []string{},
		Exe:                       "",
		Cwd:                       "",
		CreateTime:                0,
		Username:                  "",
		Uids:                      []int32{},
		Gids:                      []int32{},
		Groups:                    []int32{},
		CpuPercent:                0,
		MemoryPercent:             0,
		MemoryRSS:                 0,
		MemoryVMS:                 0,
		IOReadBytes:               0,
		IOWriteBytes:              0,
		NumFds:                    0,
		NumThreads:                0,
		ThreadCount:               0,
		Threads:                   map[int32]fwcommon.CpuTimesStat{},
		NumCtxSwitchesVoluntary:   0,
		NumCtxSwitchesInvoluntary: 0,
		OpenFilesCount:            0,
		OpenFiles:                 []string{},
		Nice:                      0,
		Terminal:                  "",
		Ppid:                      0,
		ParentPid:                 0,
		Rlimit:                    []fwcommon.RlimitStat{},
		Connections:               []fwcommon.ConnectionStat{},
		SystemCPUCores:            0,
		MaxMemoryTotal:            0,
		MaxIOReadBytes:            0,
		MaxIOWriteBytes:           0,
		MaxNumFds:                 0,
		MaxNumThreads:             0,
	}, nil
}
