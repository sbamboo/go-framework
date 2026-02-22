//go:build windows
// +build windows

package main

import "syscall"

var (
	modkernel32 = syscall.NewLazyDLL("kernel32.dll")
	procBeep    = modkernel32.NewProc("Beep")
)

func Beep(frequency, duration uint32) error {
	r, _, err := procBeep.Call(uintptr(frequency), uintptr(duration))
	if r == 0 {
		return err
	}
	return nil
}
