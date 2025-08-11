package goframework_log

import fwcommon "github.com/sbamboo/goframework/common"

type Logger struct {
	config *fwcommon.FrameworkConfig
	deb    fwcommon.DebuggerInterface
}

func NewLogger(config *fwcommon.FrameworkConfig, deb fwcommon.DebuggerInterface) *Logger {
	return &Logger{
		config: config,
		deb:    deb,
	}
}

func (l *Logger) Log(level, message string) error {
	return nil
}
