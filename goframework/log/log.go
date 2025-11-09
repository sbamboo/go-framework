package goframework_log

import (
	"fmt"
	"os"
	"time"

	fwcommon "github.com/sbamboo/goframework/common"
)

type Logger struct {
	config *fwcommon.FrameworkConfig
	deb    fwcommon.DebuggerInterface // Pointer
}

func NewLogger(config *fwcommon.FrameworkConfig, debPtr fwcommon.DebuggerInterface) *Logger {
	return &Logger{
		config: config,
		deb:    debPtr,
	}
}

func (log *Logger) Log(level fwcommon.LogLevel, message string) error {
	// Prepare message with format
	format := "[%s %s] %s"

	// Fallback if config.LoggerFormat is empty
	if log.config.LoggerFormat != nil && *log.config.LoggerFormat != "" {
		format = *log.config.LoggerFormat
	}

	// Fill in placeholders
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logLine := fmt.Sprintf(format, timestamp, level.String(), message) + "\n"

	// If log.config is null or log.config.WriteDebugLogs is not boolean true (type is bool)
	//   and level is DEBUG set doWriteDebugLogs to false
	doWriteDebugLogs := true
	if (log.config == nil || !log.config.WriteDebugLogs) && level == fwcommon.DEBUG {
		doWriteDebugLogs = false
	}

	// Write to file
	if log.config.LoggerFile != nil && doWriteDebugLogs {

		if *log.config.LoggerFile == "" {
			return fmt.Errorf("logger file path is empty")
		}

		// Open file for appending
		f, err := os.OpenFile(*log.config.LoggerFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return fmt.Errorf("failed to open log file: %w", err)
		}
		defer f.Close()

		// Write to file
		if _, err := f.WriteString(logLine); err != nil {
			return fmt.Errorf("failed to write log: %w", err)
		}
	}

	// If debugger is not nil, and .Active = true => send log to debugger
	if log.deb != nil {
		if log.deb.IsActive() {
			log.deb.ConsoleLog(level, message, nil)
		}
	}

	// If log.config.LoggerCallable is set, call it
	if log.config.LoggerCallable != nil {
		if err := log.config.LoggerCallable(level, message); err != nil {
			return fmt.Errorf("failed to call custom logger: %w", err)
		}
	}

	return nil
}

func (log *Logger) Debug(message string) error {
	return log.Log(fwcommon.DEBUG, message)
}

func (log *Logger) Info(message string) error {
	return log.Log(fwcommon.INFO, message)
}

func (log *Logger) Warn(message string) error {
	return log.Log(fwcommon.WARN, message)
}

func (log *Logger) Error(message string) error {
	return log.Log(fwcommon.ERROR, message)
}

// Main function for logging errors internally, governed by FrameworkConfig.LogFrameworkInternalErrors
func (log *Logger) LogThroughError(err error) error {
	if err != nil {
		// If logging of internal errors are enabled, log the error (also calls debugger log)
		if log.config.LogFrameworkInternalErrors {
			return log.Error(err.Error())
		} else {
			// Else just call debugger log
			if log.deb.IsActive() {
				log.deb.ConsoleLog(fwcommon.ERROR, err.Error(), nil)
			}
		}
	}
	return nil
}
