package goframework_platform

import (
	"os"
	"os/user"
	"runtime"
	"strings"

	fwcommon "github.com/sbamboo/goframework/common"
)

func GetHostUsrUsername() *string {
	if u, err := user.Current(); err == nil && u.Username != "" {
		return &u.Username
	}
	if name := os.Getenv("USER"); name != "" {
		return &name
	}
	if name := os.Getenv("USERNAME"); name != "" {
		return &name
	}
	return nil
}
func GetHostUsrName() *string {
	if u, err := user.Current(); err == nil && u.Name != "" {
		return &u.Name
	}
	if name := os.Getenv("NAME"); name != "" {
		return &name
	}
	return nil
}
func GetHostHomeDir() *string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	if homeDir == "" {
		return nil
	}
	return &homeDir
}
func GetHostConfigDir() *string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil
	}
	if configDir == "" {
		return nil
	}
	return &configDir
}
func GetHostCacheDir() *string {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return nil
	}
	if cacheDir == "" {
		return nil
	}
	return &cacheDir
}

func GetHostname() *string {
	hostname, err := os.Hostname()
	if err != nil {
		return nil
	}
	return &hostname
}
func GetWorkingDir() *string {
	dir, err := os.Getwd()
	if err != nil {
		return nil
	}
	if dir == "" {
		return nil
	}
	return &dir
}
func GetTempDir() *string {
	tempDir := os.TempDir()
	if tempDir == "" {
		return nil
	}
	// Check if tempDir exists and is a directory, if not, return nil
	fi, err := os.Stat(tempDir)
	if err != nil || !fi.IsDir() {
		return nil
	}

	return &tempDir
}

func GetExePath() *string {
	executable, err := os.Executable()
	if err != nil {
		return nil
	}
	return &executable
}
func GetExeParentPath() *string {
	if executable, err := os.Executable(); err == nil {
		if dir := strings.TrimSuffix(executable, string(os.PathSeparator)+""); dir != "" {
			return &dir
		}
	}
	return nil
}

func GetHostDescriptor() fwcommon.HostDescriptor {
	return fwcommon.HostDescriptor{
		OS:                   "",
		Platform:             "",
		PlatformFamily:       "",
		PlatformVersion:      "",
		KernelArch:           "",
		KernelVersion:        "",
		VirtualizationSystem: "",
		VirtualizationRole:   "",
		HostID:               "",
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
}

func GetDescriptor() *fwcommon.PlatformDescriptor {
	return &fwcommon.PlatformDescriptor{
		Runtime: fwcommon.RuntimeDescriptor{
			GoVersion: runtime.Version(),
			Compiler:  runtime.Compiler,
			Build: fwcommon.BuildDescriptor{
				CompileTimePlatform: runtime.GOOS,
				CompileTimeArch:     runtime.GOARCH,
				BuildFlags: fwcommon.BuildFlags{
					WithDebugger: BUILD_FLAG_WITH_DEBUGGER,
					NoGoPsUtil:   BUILD_FLAG_NOGOPSUTIL,
				},
			},
		},
		Host: GetFilledHostDescriptor(),
		Process: fwcommon.ProcessDescriptor{
			Executable:        GetExePath(),
			Parent:            GetExeParentPath(),
			RuntimeCPUs:       runtime.NumCPU(),
			RuntimeGoRoutines: runtime.NumGoroutine(),
			PID:               os.Getpid(),
			PPID:              os.Getppid(),
			UnixEgid:          os.Getegid(),
			UnixEuid:          os.Geteuid(),
			UnixGid:           os.Getgid(),
			UnixUid:           os.Getuid(),
		},
	}
}

func GetUsageStats() (*fwcommon.UsageStat, error) {
	return GetProcUsageStats(int32(os.Getpid()))
}
