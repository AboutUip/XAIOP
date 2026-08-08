package stream

import (
	"fmt"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop/compat"
)

// Hooks configures DotCheckpointEngine (Node/Python checkpoint hooks).
type Hooks struct {
	OnChunk  func(diff any, meta map[string]any)
	OnError  func(err error)
	OnCommit func(snapshot any)

	// MergeChunkWindow batches all complete '.' in one buffer window (default true).
	MergeChunkWindow *bool
	// EmitDiff controls Diff construction (default true).
	EmitDiff *bool
	// Cover enables & tombstone Diff mode (default false).
	Cover bool
	// StreamProcessing scans on push (default true); false defers to Finish.
	StreamProcessing *bool

	Compat     any
	SymbolKeys bool

	HistorySnapshot   bool
	HistoryRealtime   bool
	RetainWireHistory *bool
	// PhaseSeq allocates monotonic phase seq in onChunk meta (default true).
	PhaseSeq *bool

	// LineIntercept rewrites/filters logical lines before phase accumulation.
	LineIntercept []xaiop.LineInterceptor
	// AnnotationSpan remounts # annotation captures before Diff.
	AnnotationSpan []xaiop.AnnotationSpanHandler
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

// BufferStats reports receive-buffer sizes without reading the full wire string.
type BufferStats struct {
	Length       int
	CommittedAt  int
	PendingBytes int
	OpenPhase    bool
}

// CompactResult is the result of CompactCommitted.
type CompactResult struct {
	DiscardedBytes int
	Length         int
}

type closedPhase struct {
	start int
	end   int
	lines []string
}

type diffBuild struct {
	diff      any
	committed any
	fromLive  bool
}

// DotCheckpointEngine is the '.' phase stream parser (PROT-HIER / PROT-BOUND).
type DotCheckpointEngine struct {
	hooks            Hooks
	streamProcessing bool
	emitDiff         bool
	mergeChunkWindow bool
	cover            bool
	phaseSeqEnabled  bool

	buffer           string
	segmentStart     int
	scanAt           int
	sawDot           bool
	latestSnapshot   any
	hasLatest        bool
	committedAt      int
	committedSnap    any
	commitFromLive   bool
	closed           bool
	live             *xaiop.LiveParser
	phaseLines       []string

	history *ParseHistory

	phaseSeq        int
	pendingSeqs     []int
	logSeqQueue     []int
	pendingLogSeqs  []int

	lineInterceptors       []xaiop.LineInterceptor
	annotationSpanHandlers []xaiop.AnnotationSpanHandler
	typeCheckEscapePaths   []string
}

// NewDotCheckpointEngine creates a checkpoint engine from hooks.
func NewDotCheckpointEngine(hooks Hooks) *DotCheckpointEngine {
	e := &DotCheckpointEngine{
		hooks:            hooks,
		streamProcessing: boolOr(hooks.StreamProcessing, true),
		emitDiff:         boolOr(hooks.EmitDiff, true),
		mergeChunkWindow: boolOr(hooks.MergeChunkWindow, true),
		cover:            hooks.Cover,
		phaseSeqEnabled:  boolOr(hooks.PhaseSeq, true),
	}
	snap := hooks.HistorySnapshot
	live := hooks.HistoryRealtime
	if snap || live {
		e.history = NewParseHistory(snap, live, boolOr(hooks.RetainWireHistory, true), hooks.Compat)
	}
	for _, fn := range hooks.LineIntercept {
		if fn != nil {
			e.lineInterceptors = append(e.lineInterceptors, fn)
		}
	}
	for _, fn := range hooks.AnnotationSpan {
		if fn != nil {
			e.annotationSpanHandlers = append(e.annotationSpanHandlers, fn)
		}
	}
	return e
}

// OnLineIntercept appends a line interceptor.
func (e *DotCheckpointEngine) OnLineIntercept(fn xaiop.LineInterceptor) *DotCheckpointEngine {
	if fn != nil {
		e.lineInterceptors = append(e.lineInterceptors, fn)
	}
	return e
}

// ClearLineIntercepts clears interceptors.
func (e *DotCheckpointEngine) ClearLineIntercepts() *DotCheckpointEngine {
	e.lineInterceptors = nil
	return e
}

// LineInterceptCount returns interceptor count.
func (e *DotCheckpointEngine) LineInterceptCount() int { return len(e.lineInterceptors) }

// OnAnnotationSpan appends an annotation-span handler.
func (e *DotCheckpointEngine) OnAnnotationSpan(fn xaiop.AnnotationSpanHandler) *DotCheckpointEngine {
	if fn != nil {
		e.annotationSpanHandlers = append(e.annotationSpanHandlers, fn)
	}
	return e
}

// ClearAnnotationSpans clears annotation-span handlers.
func (e *DotCheckpointEngine) ClearAnnotationSpans() *DotCheckpointEngine {
	e.annotationSpanHandlers = nil
	return e
}

// AnnotationSpanCount returns annotation-span handler count.
func (e *DotCheckpointEngine) AnnotationSpanCount() int { return len(e.annotationSpanHandlers) }

// TypeCheckEscapePaths returns paths escaped by the last annotation-span pass.
func (e *DotCheckpointEngine) TypeCheckEscapePaths() []string {
	return append([]string(nil), e.typeCheckEscapePaths...)
}

// Buffer returns everything ingested so far.
func (e *DotCheckpointEngine) Buffer() string { return e.buffer }

// Snapshot returns the latest full-document snapshot (set at Finish).
func (e *DotCheckpointEngine) Snapshot() any {
	if !e.hasLatest {
		return nil
	}
	return e.latestSnapshot
}

// CommittedAt returns bytes of buffer covered by completed phases.
func (e *DotCheckpointEngine) CommittedAt() int { return e.committedAt }

// PhaseSeq returns the highest completed phase seq (0 = none).
func (e *DotCheckpointEngine) PhaseSeq() int { return e.phaseSeq }

// MergeChunkWindow reports whether window batching is on.
func (e *DotCheckpointEngine) MergeChunkWindow() bool { return e.mergeChunkWindow }

// StreamProcessing reports whether push scans immediately.
func (e *DotCheckpointEngine) StreamProcessing() bool { return e.streamProcessing }

// History returns opt-in parse history (nil when both modes are off).
func (e *DotCheckpointEngine) History() *ParseHistory { return e.history }

// BufferStats returns receive-buffer sizes.
func (e *DotCheckpointEngine) BufferStats() BufferStats {
	length := len(e.buffer)
	return BufferStats{
		Length:       length,
		CommittedAt:  e.committedAt,
		PendingBytes: maxInt(0, length-e.committedAt),
		OpenPhase:    e.segmentStart < length,
	}
}

// CommittedSnapshot returns the materialized parse of buffer[0..committedAt).
func (e *DotCheckpointEngine) CommittedSnapshot() any {
	if e.commitFromLive && e.live != nil {
		e.committedSnap = e.materializeLive()
		e.commitFromLive = false
	}
	return e.committedSnap
}

// HistoryInfo returns a history summary (empty shape when history is off).
func (e *DotCheckpointEngine) HistoryInfo() HistoryInfo {
	if e.history != nil {
		return e.history.Info()
	}
	return HistoryInfo{LiveCursor: -1}
}

// CompactCommitted discards committed wire buffer[0..committedAt).
func (e *DotCheckpointEngine) CompactCommitted(dropHistory bool) (CompactResult, error) {
	if e.closed {
		return CompactResult{}, fmt.Errorf("compactCommitted: checkpoint engine is closed")
	}
	if e.history != nil {
		if e.history.RealtimeEnabled() && e.history.RetainWireEnabled() && !dropHistory {
			return CompactResult{}, fmt.Errorf(
				"compactCommitted conflicts with historyRealtime + retainWireHistory; pass dropHistory: true or disable retainWireHistory")
		}
		if e.history.Length() > 0 && !dropHistory {
			return CompactResult{}, fmt.Errorf(
				"compactCommitted invalidates history buffer indices; pass dropHistory: true")
		}
		if dropHistory {
			e.history.Clear()
		}
	}
	cut := e.committedAt
	if cut <= 0 {
		return CompactResult{DiscardedBytes: 0, Length: len(e.buffer)}, nil
	}
	if cut > len(e.buffer) {
		discarded := len(e.buffer)
		e.buffer = ""
		e.committedAt = 0
		e.segmentStart = 0
		e.scanAt = 0
		e.phaseLines = nil
		return CompactResult{DiscardedBytes: discarded, Length: 0}, nil
	}
	e.buffer = e.buffer[cut:]
	e.committedAt = 0
	e.segmentStart = maxInt(0, e.segmentStart-cut)
	e.scanAt = maxInt(0, e.scanAt-cut)
	e.phaseLines = nil
	return CompactResult{DiscardedBytes: cut, Length: len(e.buffer)}, nil
}

// JumpTo realtime-jumps the live head forward to history index.
func (e *DotCheckpointEngine) JumpTo(index int) (*JumpResult, error) {
	if e.history == nil || !e.history.RealtimeEnabled() {
		return nil, fmt.Errorf("jumpTo requires historyRealtime")
	}
	result, err := e.history.JumpTo(index)
	if err != nil {
		return nil, err
	}
	e.rebuildFromHistoryJump(result)
	return result, nil
}

// NoteLogSeq queues a session-log seq for the next physical phase unit(s).
func (e *DotCheckpointEngine) NoteLogSeq(seq int) error {
	if seq < 1 {
		return fmt.Errorf("noteLogSeq requires seq >= 1")
	}
	e.logSeqQueue = append(e.logSeqQueue, seq)
	return nil
}

// Push synchronously ingests a wire chunk.
func (e *DotCheckpointEngine) Push(chunk string) error {
	if e.closed {
		return fmt.Errorf("checkpoint engine is closed")
	}
	if chunk == "" {
		return nil
	}
	e.buffer += chunk
	if e.streamProcessing {
		e.scanDots(false)
	}
	return nil
}

// Finish scans remaining dots, flushes the tail, and sets Snapshot.
func (e *DotCheckpointEngine) Finish() {
	if e.closed {
		return
	}
	e.finishBody()
}

func (e *DotCheckpointEngine) finishBody() {
	e.closed = true
	if !e.streamProcessing {
		value := e.parseOwned(e.buffer)
		e.storeCommit(len(e.buffer), value, false)
		e.allocPhaseSeq()
		e.emitChunk(value)
		e.latestSnapshot = value
		e.hasLatest = true
		e.segmentStart = len(e.buffer)
		e.scanAt = len(e.buffer)
		e.phaseLines = nil
		return
	}
	e.scanDots(true)
	e.flushTail()
	if e.committedAt == len(e.buffer) {
		e.latestSnapshot = e.CommittedSnapshot()
		e.hasLatest = true
	} else {
		e.latestSnapshot = e.parseOwned(e.buffer)
		e.storeCommit(len(e.buffer), e.latestSnapshot, false)
		e.hasLatest = true
	}
}

func (e *DotCheckpointEngine) scanDots(atEOF bool) {
	if e.mergeChunkWindow {
		e.scanDotsMerged(atEOF)
		return
	}
	for e.scanAt < len(e.buffer) {
		info := ReadLine(e.buffer, e.scanAt, atEOF)
		if info == nil {
			break
		}
		e.scanAt = info.End
		accepted := e.acceptLine(info.Line)
		if accepted == nil {
			if !info.ConsumedNewline && atEOF {
				break
			}
			continue
		}
		e.phaseLines = append(e.phaseLines, *accepted)
		if *accepted == "." {
			e.emitPhase(info.End)
		}
		if !info.ConsumedNewline && atEOF {
			break
		}
	}
}

func (e *DotCheckpointEngine) scanDotsMerged(atEOF bool) {
	var closed []closedPhase
	phaseLines := append([]string(nil), e.phaseLines...)
	segmentStart := e.segmentStart
	for e.scanAt < len(e.buffer) {
		info := ReadLine(e.buffer, e.scanAt, atEOF)
		if info == nil {
			break
		}
		e.scanAt = info.End
		accepted := e.acceptLine(info.Line)
		if accepted == nil {
			if !info.ConsumedNewline && atEOF {
				break
			}
			continue
		}
		phaseLines = append(phaseLines, *accepted)
		if *accepted == "." {
			closed = append(closed, closedPhase{
				start: segmentStart,
				end:   info.End,
				lines: phaseLines,
			})
			phaseLines = nil
			segmentStart = info.End
		}
		if !info.ConsumedNewline && atEOF {
			break
		}
	}
	e.phaseLines = phaseLines
	e.segmentStart = segmentStart
	if len(closed) == 0 {
		return
	}
	e.emitClosedWindow(closed)
}

func (e *DotCheckpointEngine) emitClosedWindow(closed []closedPhase) {
	lastEnd := closed[len(closed)-1].end
	if e.cover {
		for _, phase := range closed {
			e.emitCoverPhase(phase.lines, phase.start, phase.end, false)
		}
		e.segmentStart = lastEnd
		return
	}

	for range closed {
		e.allocPhaseSeq()
	}

	if e.history != nil {
		for i := range closed {
			phase := &closed[i]
			phase.lines = e.applyAnnotationSpans(phase.lines)
			var before any
			if e.history.Length() > 0 {
				before, _ = e.history.PeekAfter(e.history.Length() - 1)
			} else {
				before = e.peekCommit()
			}
			raw := e.phaseWire(phase.lines, phase.start, phase.end)
			hadPriorDot := e.sawDot
			e.feedLiveLines(phase.lines)
			e.sawDot = hadPriorDot
			built := e.buildDiff(raw)
			e.sawDot = true
			e.storeCommit(phase.end, built.committed, built.fromLive)
			after := e.peekCommit()
			e.history.RecordOwned(HistoryEntry{
				Kind:        HistoryKindDot,
				BufferStart: phase.start,
				BufferEnd:   phase.end,
				Wire:        raw,
				HasWire:     true,
				Before:      before,
				After:       after,
				Diff:        built.diff,
			})
		}
		e.segmentStart = lastEnd
		if !e.emitDiff {
			e.emitChunk(nil)
			return
		}
		if len(closed) == 1 {
			diff, _ := e.history.PeekDiff(e.history.Length() - 1)
			e.emitChunk(diff)
			return
		}
		e.emitChunk(xaiop.CloneJSON(e.peekCommit()))
		return
	}

	allLines := make([]string, 0)
	applied := make([][]string, len(closed))
	for i, phase := range closed {
		lines := e.applyAnnotationSpans(phase.lines)
		applied[i] = lines
		closed[i].lines = lines
		allLines = append(allLines, lines...)
	}
	sawDotBefore := e.sawDot
	e.feedLiveLines(allLines)
	e.sawDot = true
	e.segmentStart = lastEnd

	if !e.emitDiff {
		e.storeCommit(lastEnd, nil, true)
		e.emitChunk(nil)
		return
	}
	if len(closed) == 1 {
		raw := e.phaseWire(applied[0], closed[0].start, closed[0].end)
		e.sawDot = sawDotBefore
		built := e.buildDiff(raw)
		e.sawDot = true
		e.storeCommit(lastEnd, built.committed, built.fromLive)
		e.emitChunk(built.diff)
		return
	}
	e.storeCommit(lastEnd, nil, true)
	e.emitChunk(e.materializeLive())
}

func (e *DotCheckpointEngine) emitPhase(end int) {
	start := e.segmentStart
	lines := e.applyAnnotationSpans(append([]string(nil), e.phaseLines...))
	raw := e.phaseWire(lines, start, end)
	e.phaseLines = nil
	if e.cover {
		e.emitCoverPhase(lines, start, end, false)
		e.segmentStart = end
		return
	}
	e.allocPhaseSeq()
	var before any
	if e.history != nil {
		if e.history.Length() > 0 {
			before, _ = e.history.PeekAfter(e.history.Length() - 1)
		} else {
			before = e.peekCommit()
		}
	}
	e.feedLiveLines(lines)
	built := e.buildDiff(raw)
	e.sawDot = true
	e.segmentStart = end
	e.storeCommit(end, built.committed, built.fromLive)
	if e.history != nil {
		e.history.RecordOwned(HistoryEntry{
			Kind:        HistoryKindDot,
			BufferStart: start,
			BufferEnd:   end,
			Wire:        raw,
			HasWire:     true,
			Before:      before,
			After:       e.peekCommit(),
			Diff:        built.diff,
		})
	}
	e.emitChunk(built.diff)
}

func (e *DotCheckpointEngine) flushTail() {
	if e.segmentStart < len(e.buffer) {
		start := e.segmentStart
		lines := e.applyAnnotationSpans(append([]string(nil), e.phaseLines...))
		raw := e.phaseWire(lines, start, len(e.buffer))
		e.phaseLines = nil
		if e.cover {
			e.emitCoverPhase(lines, start, len(e.buffer), true)
			e.segmentStart = len(e.buffer)
			return
		}
		e.allocPhaseSeq()
		var before any
		if e.history != nil {
			if e.history.Length() > 0 {
				before, _ = e.history.PeekAfter(e.history.Length() - 1)
			} else {
				before = e.peekCommit()
			}
		}
		e.feedLiveLines(lines)
		var built diffBuild
		if !e.sawDot {
			if !e.emitDiff || IsEmptyPhaseWire(raw) {
				built = diffBuild{diff: nil, committed: nil, fromLive: true}
			} else {
				built = diffBuild{diff: e.materializeLive(), committed: nil, fromLive: true}
			}
		} else {
			built = e.buildDiff(raw)
		}
		e.segmentStart = len(e.buffer)
		e.storeCommit(len(e.buffer), built.committed, built.fromLive)
		if e.history != nil {
			e.history.RecordOwned(HistoryEntry{
				Kind:        HistoryKindTail,
				BufferStart: start,
				BufferEnd:   len(e.buffer),
				Wire:        raw,
				HasWire:     true,
				Before:      before,
				After:       e.peekCommit(),
				Diff:        built.diff,
			})
		}
		e.emitChunk(built.diff)
		return
	}
	if !e.sawDot && len(e.buffer) == 0 {
		e.phaseLines = nil
		e.storeCommit(0, nil, false)
		e.emitChunk(nil)
	}
}

func (e *DotCheckpointEngine) emitCoverPhase(lines []string, bufferStart, bufferEnd int, isTail bool) {
	lines = e.applyAnnotationSpans(lines)
	trailingDot := len(lines) > 0 && lines[len(lines)-1] == "."
	bodyLen := len(lines)
	if trailingDot {
		bodyLen--
	}
	pendingRestore := []string(nil)
	i := 0
	anyEmitted := false
	for i < bodyLen {
		j := i
		for j < bodyLen && !IsAmpLine(lines[j]) {
			j++
		}
		if j < bodyLen {
			prefix := append(append([]string(nil), pendingRestore...), lines[i:j]...)
			pendingRestore = nil
			e.ensureLive()
			if len(prefix) > 0 {
				e.feedLiveLines(prefix)
			}
			restore, _ := e.live.CursorRestoreLines()
			if len(prefix) > 0 {
				e.feedLiveLines([]string{"."})
				wireLines := append(append([]string(nil), prefix...), ".")
				e.emitCoverChunk(wireLines, nil, bufferStart, bufferEnd, HistoryKindDot, false)
				anyEmitted = true
			}
			k := j
			for k < bodyLen && IsAmpLine(lines[k]) {
				k++
			}
			amps := lines[j:k]
			e.feedLiveLines(amps)
			tombstone := BuildDeleteTombstone(amps)
			e.feedLiveLines([]string{"."})
			ampWire := append(append([]string(nil), amps...), ".")
			e.emitCoverChunk(ampWire, tombstone, bufferStart, bufferEnd, HistoryKindDot, false)
			anyEmitted = true
			pendingRestore = append([]string(nil), restore...)
			i = k
			continue
		}
		restBody := append(append([]string(nil), pendingRestore...), lines[i:bodyLen]...)
		pendingRestore = nil
		if len(restBody) > 0 {
			e.feedLiveLines(restBody)
		}
		if trailingDot {
			e.feedLiveLines([]string{"."})
			wireLines := append(append([]string(nil), restBody...), ".")
			if len(wireLines) == 0 {
				wireLines = []string{"."}
			}
			e.emitCoverChunk(wireLines, nil, bufferStart, bufferEnd, HistoryKindDot, false)
			anyEmitted = true
		} else if len(restBody) > 0 {
			committed := e.materializeLive()
			e.storeCommit(bufferEnd, committed, false)
			kind := HistoryKindDot
			if isTail {
				kind = HistoryKindTail
			}
			e.emitCoverChunk(restBody, nil, bufferStart, bufferEnd, kind, true)
			anyEmitted = true
		}
		i = bodyLen
	}
	if len(pendingRestore) > 0 {
		e.feedLiveLines(pendingRestore)
		committed := e.materializeLive()
		e.storeCommit(bufferEnd, committed, false)
		e.sawDot = true
	} else if !anyEmitted && trailingDot {
		e.feedLiveLines([]string{"."})
		e.sawDot = true
		e.storeCommit(bufferEnd, nil, true)
		if e.history != nil {
			var tip any
			if e.history.Length() > 0 {
				tip, _ = e.history.PeekAfter(e.history.Length() - 1)
			} else {
				tip = e.peekCommit()
			}
			e.history.RecordOwned(HistoryEntry{
				Kind:        HistoryKindDot,
				BufferStart: bufferStart,
				BufferEnd:   bufferEnd,
				Wire:        ".\n",
				HasWire:     true,
				Before:      tip,
				After:       tip,
				Diff:        nil,
			})
		}
		e.allocPhaseSeq()
		e.emitChunk(nil)
	} else if !anyEmitted && isTail && len(lines) > 0 {
		e.feedLiveLines(lines)
		e.storeCommit(bufferEnd, nil, true)
		e.allocPhaseSeq()
		var diff any
		if e.emitDiff {
			diff = e.materializeLive()
		}
		e.emitChunk(diff)
	}
	e.sawDot = e.sawDot || trailingDot || anyEmitted
}

func (e *DotCheckpointEngine) emitCoverChunk(
	wireLines []string,
	tombstone map[string]any,
	bufferStart, bufferEnd int,
	kind string,
	committedDiff bool,
) {
	e.allocPhaseSeq()
	var before any
	if e.history != nil {
		if e.history.Length() > 0 {
			before, _ = e.history.PeekAfter(e.history.Length() - 1)
		} else {
			before = e.peekCommit()
		}
	}
	e.sawDot = true
	wire := LinesToWire(wireLines)
	var diff any
	if e.emitDiff {
		if tombstone != nil {
			diff = xaiop.CloneJSON(tombstone)
			e.storeCommit(bufferEnd, nil, true)
		} else if committedDiff {
			diff = e.materializeLive()
			e.storeCommit(bufferEnd, nil, true)
		} else {
			built := e.buildDiff(wire)
			diff = built.diff
			e.storeCommit(bufferEnd, built.committed, built.fromLive)
		}
	} else {
		e.storeCommit(bufferEnd, nil, true)
	}
	if e.history != nil {
		e.history.RecordOwned(HistoryEntry{
			Kind:        kind,
			BufferStart: bufferStart,
			BufferEnd:   bufferEnd,
			Wire:        wire,
			HasWire:     true,
			Before:      before,
			After:       e.peekCommit(),
			Diff:        diff,
		})
	}
	e.emitChunk(diff)
}

func (e *DotCheckpointEngine) acceptLine(line string) *string {
	if len(e.lineInterceptors) == 0 {
		return &line
	}
	meta := map[string]any{"kind": xaiop.ClassifyLine(line)}
	out, ok := xaiop.RunLineInterceptChain(line, meta, e.lineInterceptors)
	if !ok {
		return nil
	}
	return &out
}

func (e *DotCheckpointEngine) applyAnnotationSpans(lines []string) []string {
	if len(e.annotationSpanHandlers) == 0 {
		return lines
	}
	result := ApplyAnnotationSpans(lines, e.annotationSpanHandlers)
	e.typeCheckEscapePaths = result.EscapePaths
	return result.Lines
}

func (e *DotCheckpointEngine) phaseWire(lines []string, bufferStart, bufferEnd int) string {
	if len(e.lineInterceptors) > 0 || len(e.annotationSpanHandlers) > 0 {
		return LinesToWire(lines)
	}
	if bufferStart >= 0 && bufferEnd <= len(e.buffer) && bufferStart <= bufferEnd {
		return e.buffer[bufferStart:bufferEnd]
	}
	return LinesToWire(lines)
}

func (e *DotCheckpointEngine) allocPhaseSeq() *int {
	if !e.phaseSeqEnabled {
		return nil
	}
	e.phaseSeq++
	e.pendingSeqs = append(e.pendingSeqs, e.phaseSeq)
	if len(e.logSeqQueue) > 0 {
		e.pendingLogSeqs = append(e.pendingLogSeqs, e.logSeqQueue[0])
		e.logSeqQueue = e.logSeqQueue[1:]
	}
	seq := e.phaseSeq
	return &seq
}

func (e *DotCheckpointEngine) emitChunk(diff any) {
	seqs := e.pendingSeqs
	e.pendingSeqs = nil
	logSeqs := e.pendingLogSeqs
	e.pendingLogSeqs = nil
	cb := e.hooks.OnChunk
	if cb == nil {
		return
	}
	var meta map[string]any
	if len(seqs) > 0 || len(logSeqs) > 0 {
		meta = map[string]any{}
		if len(seqs) > 0 {
			meta["seqs"] = append([]int(nil), seqs...)
			meta["seq"] = seqs[len(seqs)-1]
		}
		if len(logSeqs) > 0 {
			meta["logSeqs"] = append([]int(nil), logSeqs...)
			meta["logSeq"] = logSeqs[len(logSeqs)-1]
		}
	}
	cb(diff, meta)
}

func (e *DotCheckpointEngine) ensureLive() {
	if e.live == nil {
		e.live = xaiop.NewLiveParser()
	}
}

func (e *DotCheckpointEngine) peekCommit() any {
	if e.commitFromLive && e.live != nil {
		return e.materializeLive()
	}
	return e.committedSnap
}

func (e *DotCheckpointEngine) feedLiveLines(lines []string) {
	e.ensureLive()
	e.committedSnap = nil
	e.commitFromLive = true
	e.live.FeedLines(lines)
}

func (e *DotCheckpointEngine) buildDiff(raw string) diffBuild {
	if !e.emitDiff {
		return diffBuild{diff: nil, committed: nil, fromLive: true}
	}
	e.ensureLive()
	// First phase / locate / @ & = ! : Diff is a clone of the live Commit tree (D1 / D2).
	if !e.sawDot || PhaseNeedsPriorTree(raw) {
		if IsEmptyPhaseWire(raw) {
			return diffBuild{diff: nil, committed: nil, fromLive: true}
		}
		return diffBuild{diff: e.materializeLive(), committed: nil, fromLive: true}
	}
	// Later ordinary phase: phase-local Diff with synthetic document root when needed.
	text := WithLeadingDot(EnsureDiffDocumentRoot(raw, e.liveRootKind()))
	diff, err := e.tryParseOwned(text)
	if err != nil {
		if IsEmptyPhaseWire(raw) {
			return diffBuild{diff: nil, committed: nil, fromLive: true}
		}
		return diffBuild{diff: e.materializeLive(), committed: nil, fromLive: true}
	}
	return diffBuild{diff: NormalizeEmptyPhase(raw, diff), committed: nil, fromLive: true}
}

func (e *DotCheckpointEngine) liveRootKind() string {
	if e.live == nil {
		return ""
	}
	kind := e.live.DocKind()
	if kind == "array" || kind == "fragment" || kind == "object" {
		return kind
	}
	v, err := e.live.Value()
	if err == nil {
		if _, ok := v.([]any); ok {
			return "array"
		}
	}
	return "object"
}

func (e *DotCheckpointEngine) storeCommit(at int, snapshot any, fromLive bool) {
	e.committedAt = at
	e.commitFromLive = fromLive
	if fromLive {
		e.committedSnap = nil
	} else {
		e.committedSnap = snapshot
	}
	if e.hooks.OnCommit != nil {
		e.hooks.OnCommit(e.peekCommit())
	}
}

func (e *DotCheckpointEngine) parseOpts() xaiop.ParseOptions {
	opts := xaiop.ParseOptions{SymbolKeys: e.hooks.SymbolKeys}
	if e.hooks.Compat != nil {
		opts.Compat = compat.Resolve(e.hooks.Compat)
	}
	return opts
}

func (e *DotCheckpointEngine) parseOwned(text string) any {
	v, err := e.tryParseOwned(text)
	if err != nil {
		if e.hooks.OnError != nil {
			e.hooks.OnError(err)
		}
		return nil
	}
	return v
}

func (e *DotCheckpointEngine) tryParseOwned(text string) (any, error) {
	if text == "" {
		return nil, nil
	}
	parsed, err := xaiop.ParseWithOptions(text, e.parseOpts())
	if err != nil {
		return nil, err
	}
	return xaiop.MaterializeOwned(parsed), nil
}

func (e *DotCheckpointEngine) materializeLive() any {
	if e.live == nil {
		return nil
	}
	v, err := e.live.Value()
	if err != nil {
		if e.hooks.OnError != nil {
			e.hooks.OnError(err)
		}
		return nil
	}
	return xaiop.MaterializeSnapshot(v)
}

func (e *DotCheckpointEngine) rebuildFromHistoryJump(result *JumpResult) {
	end := result.BufferEnd
	if result.HasWirePrefix {
		e.buffer = result.WirePrefix
	} else if end <= len(e.buffer) {
		e.buffer = e.buffer[:end]
	} else {
		e.buffer = e.buffer[:minInt(end, len(e.buffer))]
	}
	e.live = xaiop.NewLiveParser()
	if len(e.buffer) > 0 {
		e.live.FeedText(e.buffer)
	}
	e.sawDot = true
	e.segmentStart = len(e.buffer)
	e.scanAt = len(e.buffer)
	e.phaseLines = nil
	e.committedAt = len(e.buffer)
	e.committedSnap = result.After
	e.commitFromLive = false
	e.latestSnapshot = nil
	e.hasLatest = false
	e.closed = false
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
