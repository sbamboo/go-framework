//go:build darwin || linux
// +build darwin linux

package main

import (
	"math"
	"time"

	"github.com/gordonklaus/portaudio"
)

func Beep(frequency, duration uint32) error {
	const sampleRate = 44100
	portaudio.Initialize()
	defer portaudio.Terminate()

	numSamples := int(float64(duration)/1000.0 * sampleRate)
	data := make([]float32, numSamples)

	// Generate a sine wave
	for i := 0; i < numSamples; i++ {
		data[i] = float32(math.Sin(2 * math.Pi * float64(frequency) * float64(i) / sampleRate))
	}

	stream, err := portaudio.OpenDefaultStream(0, 1, sampleRate, len(data), data)
	if err != nil {
		return err
	}
	defer stream.Close()

	if err := stream.Start(); err != nil {
		return err
	}

	time.Sleep(time.Duration(duration) * time.Millisecond)

	if err := stream.Stop(); err != nil {
		return err
	}

	return nil
}