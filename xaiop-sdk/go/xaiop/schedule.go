package xaiop

import "time"

// ScheduleImmediate runs fn soon on a new goroutine (portable setImmediate).
func ScheduleImmediate(fn func()) {
	go func() {
		time.Sleep(0)
		fn()
	}()
}
