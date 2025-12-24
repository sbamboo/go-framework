//go:build !no_gopsutil

package goframework_platform

import (
	fwcommon "github.com/sbamboo/goframework/common"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"
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

// helper to convert []uint32 -> []int32
func toInt32Slice(src []uint32) []int32 {
	dst := make([]int32, len(src))
	for i, v := range src {
		dst[i] = int32(v)
	}
	return dst
}

func GetProcUsageStats(pid int32) (*fwcommon.UsageStat, error) {
	p, err := process.NewProcess(pid)
	if err != nil {
		return nil, err
	}

	// Basic process info
	name, _ := p.Name()
	cmdline, _ := p.Cmdline()
	args, _ := p.CmdlineSlice()
	exe, _ := p.Exe()
	cwd, _ := p.Cwd()
	createTime, _ := p.CreateTime()
	username, _ := p.Username()
	status, _ := p.Status()

	// UIDs/GIDs cross-platform
	uidsRaw, _ := p.Uids()
	gidsRaw, _ := p.Gids()
	var uids, gids []int32
	uids = []int32{} // ensure empty slice by default
	gids = []int32{}

	if uidsRaw != nil {
		switch t := interface{}(uidsRaw).(type) {
		case []int32:
			uids = t
		case []uint32:
			uids = toInt32Slice(t)
		}
	}

	if gidsRaw != nil {
		switch t := interface{}(gidsRaw).(type) {
		case []int32:
			gids = t
		case []uint32:
			gids = toInt32Slice(t)
		}
	}

	numThreads, _ := p.NumThreads()
	numFds, _ := p.NumFDs()
	nice, _ := p.Nice()
	ppid, _ := p.Ppid()
	cpuPercent, _ := p.CPUPercent()
	memPercent, _ := p.MemoryPercent()

	// Memory info (check nil)
	var memRSS, memVMS uint64
	if memInfo, _ := p.MemoryInfo(); memInfo != nil {
		memRSS = memInfo.RSS
		memVMS = memInfo.VMS
	}

	// IO counters (check nil)
	var ioRead, ioWrite uint64
	if ioCounters, _ := p.IOCounters(); ioCounters != nil {
		ioRead = ioCounters.ReadBytes
		ioWrite = ioCounters.WriteBytes
	}

	// Open files
	openFiles, _ := p.OpenFiles()
	openPaths := []string{}
	for _, f := range openFiles {
		openPaths = append(openPaths, f.Path)
	}

	// Connections (check nil)
	conns, _ := p.Connections()
	connections := []fwcommon.ConnectionStat{}
	for _, c := range conns {
		connections = append(connections, fwcommon.ConnectionStat{
			Fd:        c.Fd,
			Family:    uint32(c.Family),
			Type:      uint32(c.Type),
			LaddrIP:   c.Laddr.IP,
			LaddrPort: c.Laddr.Port,
			RaddrIP:   c.Raddr.IP,
			RaddrPort: c.Raddr.Port,
			Status:    c.Status,
			Pid:       c.Pid,
		})
	}

	// Per-thread CPU times (cross-platform safe)
	threadStats := make(map[int32]fwcommon.CpuTimesStat)
	if threads, _ := p.Threads(); threads != nil {
		for idx, t := range threads {
			threadStats[int32(idx)] = fwcommon.CpuTimesStat{
				User:      t.User,
				System:    t.System,
				Idle:      t.Idle,
				Nice:      t.Nice,
				Iowait:    t.Iowait,
				Irq:       t.Irq,
				Softirq:   t.Softirq,
				Steal:     t.Steal,
				Guest:     t.Guest,
				GuestNice: t.GuestNice,
			}
		}
	}

	var numCtxVoluntary, numCtxInvoluntary int64
	if cs, err := p.NumCtxSwitches(); err == nil && cs != nil {
		numCtxVoluntary = cs.Voluntary
		numCtxInvoluntary = cs.Involuntary
	}

	// System info
	cpuCores, _ := cpu.Counts(true)
	vmem, _ := mem.VirtualMemory()
	maxMem := uint64(0)
	if vmem != nil {
		maxMem = vmem.Total
	}

	// Rlimits: cross-platform safe (empty slice)
	rlimits := []fwcommon.RlimitStat{}

	return &fwcommon.UsageStat{
		Pid:                       pid,
		Name:                      name,
		Status:                    status,
		Cmdline:                   cmdline,
		Args:                      args,
		Exe:                       exe,
		Cwd:                       cwd,
		CreateTime:                createTime,
		Username:                  username,
		Uids:                      uids,
		Gids:                      gids,
		Groups:                    gids,
		CpuPercent:                cpuPercent,
		MemoryPercent:             memPercent,
		MemoryRSS:                 memRSS,
		MemoryVMS:                 memVMS,
		IOReadBytes:               ioRead,
		IOWriteBytes:              ioWrite,
		NumFds:                    numFds,
		NumThreads:                numThreads,
		ThreadCount:               numThreads,
		Threads:                   threadStats,
		NumCtxSwitchesVoluntary:   numCtxVoluntary,
		NumCtxSwitchesInvoluntary: numCtxInvoluntary,
		OpenFilesCount:            int32(len(openPaths)),
		OpenFiles:                 openPaths,
		Nice:                      nice,
		Terminal:                  "", // not cross-platform
		Ppid:                      ppid,
		ParentPid:                 ppid,
		Rlimit:                    rlimits,
		Connections:               connections,
		SystemCPUCores:            cpuCores,
		MaxMemoryTotal:            maxMem,
		MaxIOReadBytes:            0,
		MaxIOWriteBytes:           0,
		MaxNumFds:                 0,
		MaxNumThreads:             0,
	}, nil
}
