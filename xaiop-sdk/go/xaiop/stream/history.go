package stream

import (
	"fmt"

	"github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
)

// History node kinds.
const (
	HistoryKindDot  = "dot"
	HistoryKindTail = "tail"
)

// RangeError is an index / jump range error (Node RangeError counterpart).
type RangeError struct {
	Message string
}

func (e *RangeError) Error() string { return e.Message }

// HistoryNode is one recorded phase-boundary node.
type HistoryNode struct {
	Index       int
	Kind        string
	BufferStart int
	BufferEnd   int
	Wire        string // empty when retainWire is off or unavailable
	HasWire     bool
	Before      any
	After       any
	Diff        any
}

// HistoryInfo is a summary of history counters.
type HistoryInfo struct {
	Snapshot    bool
	Realtime    bool
	Length      int
	LiveCursor  int
	SourceKey   string
	HasRangeView bool
	RangeView   *RangeBounds
}

// RangeBounds is an inclusive from/to pair.
type RangeBounds struct {
	From int
	To   int
}

// JumpResult is returned by JumpTo.
type JumpResult struct {
	Index      int
	Kept       int
	Discarded  int
	After      any
	BufferEnd  int
	WirePrefix string
	HasWirePrefix bool
}

// HistoryEntry is input for Record / RecordOwned.
type HistoryEntry struct {
	Kind        string
	BufferStart int
	BufferEnd   int
	Wire        string
	HasWire     bool
	Before      any
	After       any
	Diff        any
}

// ParseHistory is optional parse-chain history for '.' phase boundaries.
type ParseHistory struct {
	snapshot   bool
	realtime   bool
	retainWire bool
	compat     any
	nodes      []HistoryNode
	liveCursor int
	sourceKey  string
	hasSource  bool
	rangeView  *cachedRangeView
}

type cachedRangeView struct {
	from  int
	to    int
	nodes []HistoryNode
	json  any
}

// NewParseHistory creates history. Enabled when snapshot or realtime is true.
func NewParseHistory(snapshot, realtime bool, retainWire bool, compat any) *ParseHistory {
	return &ParseHistory{
		snapshot:   snapshot,
		realtime:   realtime,
		retainWire: retainWire,
		compat:     compat,
		liveCursor: -1,
	}
}

// Enabled reports whether either history mode is on.
func (h *ParseHistory) Enabled() bool {
	return h != nil && (h.snapshot || h.realtime)
}

// SetSource records an optional source key (URL) for history info.
func (h *ParseHistory) SetSource(source string) *ParseHistory {
	if h == nil {
		return nil
	}
	h.sourceKey = source
	h.hasSource = true
	return h
}

// SnapshotEnabled reports snapshot mode.
func (h *ParseHistory) SnapshotEnabled() bool { return h != nil && h.snapshot }

// RealtimeEnabled reports realtime mode.
func (h *ParseHistory) RealtimeEnabled() bool { return h != nil && h.realtime }

// RetainWireEnabled reports wire retention.
func (h *ParseHistory) RetainWireEnabled() bool { return h != nil && h.retainWire }

// Length returns the number of recorded nodes.
func (h *ParseHistory) Length() int {
	if h == nil {
		return 0
	}
	return len(h.nodes)
}

// LiveCursor returns the realtime live cursor (-1 if none).
func (h *ParseHistory) LiveCursor() int {
	if h == nil {
		return -1
	}
	return h.liveCursor
}

// Clear resets all nodes and cursors.
func (h *ParseHistory) Clear() *ParseHistory {
	if h == nil {
		return h
	}
	h.nodes = nil
	h.liveCursor = -1
	h.rangeView = nil
	return h
}

// Info returns a summary of history state.
func (h *ParseHistory) Info() HistoryInfo {
	if h == nil {
		return HistoryInfo{LiveCursor: -1}
	}
	info := HistoryInfo{
		Snapshot:     h.snapshot,
		Realtime:     h.realtime,
		Length:       len(h.nodes),
		LiveCursor:   h.liveCursor,
		HasRangeView: h.rangeView != nil,
	}
	if h.hasSource {
		info.SourceKey = h.sourceKey
	}
	if h.rangeView != nil {
		info.RangeView = &RangeBounds{From: h.rangeView.from, To: h.rangeView.to}
	}
	return info
}

// RecordDot records a dot-phase node (defensive clones).
func (h *ParseHistory) RecordDot(bufferStart, bufferEnd int, wire string, before, after, diff any) *HistoryNode {
	return h.Record(HistoryEntry{
		Kind:        HistoryKindDot,
		BufferStart: bufferStart,
		BufferEnd:   bufferEnd,
		Wire:        wire,
		HasWire:     true,
		Before:      before,
		After:       after,
		Diff:        diff,
	})
}

// Record appends with defensive clones (safe for external callers).
func (h *ParseHistory) Record(entry HistoryEntry) *HistoryNode {
	if h == nil || !h.Enabled() {
		return nil
	}
	return h.RecordOwned(HistoryEntry{
		Kind:        entry.Kind,
		BufferStart: entry.BufferStart,
		BufferEnd:   entry.BufferEnd,
		Wire:        entry.Wire,
		HasWire:     entry.HasWire,
		Before:      xaiop.CloneJSON(entry.Before),
		After:       xaiop.CloneJSON(entry.After),
		Diff:        xaiop.CloneJSON(entry.Diff),
	})
}

// RecordOwned appends taking ownership of already-isolated trees (no extra clone).
func (h *ParseHistory) RecordOwned(entry HistoryEntry) *HistoryNode {
	if h == nil || !h.Enabled() {
		return nil
	}
	index := len(h.nodes)
	before := entry.Before
	kind := HistoryKindDot
	if entry.Kind == HistoryKindTail {
		kind = HistoryKindTail
	}
	var wire string
	hasWire := false
	if h.retainWire && entry.HasWire {
		wire = entry.Wire
		hasWire = true
	}
	node := HistoryNode{
		Index:       index,
		Kind:        kind,
		BufferStart: entry.BufferStart,
		BufferEnd:   entry.BufferEnd,
		Wire:        wire,
		HasWire:     hasWire,
		Before:      before,
		After:       entry.After,
		Diff:        entry.Diff,
	}
	h.nodes = append(h.nodes, node)
	h.invalidateRangeIfNeeded()
	return &h.nodes[len(h.nodes)-1]
}

// GetAfter returns a deep clone of the after tree at index.
func (h *ParseHistory) GetAfter(index int) (any, error) {
	n, err := h.nodeAt(index)
	if err != nil {
		return nil, err
	}
	return xaiop.CloneJSON(n.After), nil
}

// PeekAfter returns the after tree without cloning (engine emit path).
func (h *ParseHistory) PeekAfter(index int) (any, error) {
	n, err := h.nodeAt(index)
	if err != nil {
		return nil, err
	}
	return n.After, nil
}

// PeekDiff returns the diff without cloning (engine emit path).
func (h *ParseHistory) PeekDiff(index int) (any, error) {
	n, err := h.nodeAt(index)
	if err != nil {
		return nil, err
	}
	return n.Diff, nil
}

// GetDiff returns a deep clone of the diff at index.
func (h *ParseHistory) GetDiff(index int) (any, error) {
	n, err := h.nodeAt(index)
	if err != nil {
		return nil, err
	}
	return xaiop.CloneJSON(n.Diff), nil
}

// JumpTo moves the realtime head forward and discards nodes after index.
func (h *ParseHistory) JumpTo(index int) (*JumpResult, error) {
	if h == nil || !h.realtime {
		return nil, fmt.Errorf("ParseHistory.JumpTo requires realtime mode")
	}
	i, err := h.normalizeIndex(index)
	if err != nil {
		return nil, err
	}
	if i <= h.liveCursor {
		return nil, &RangeError{
			Message: fmt.Sprintf("realtime jumpTo only moves forward (index %d <= liveCursor %d)", i, h.liveCursor),
		}
	}
	discarded := len(h.nodes) - (i + 1)
	kept := h.nodes[: i+1]
	h.nodes = kept
	h.liveCursor = i
	h.rangeView = nil
	tip := kept[i]
	var wirePrefix string
	hasPrefix := false
	if h.retainWire {
		all := true
		for _, n := range kept {
			if !n.HasWire {
				all = false
				break
			}
		}
		if all {
			for _, n := range kept {
				wirePrefix += n.Wire
			}
			hasPrefix = true
		}
	}
	return &JumpResult{
		Index:         i,
		Kept:          len(kept),
		Discarded:     maxInt(0, discarded),
		After:         xaiop.CloneJSON(tip.After),
		BufferEnd:     tip.BufferEnd,
		WirePrefix:    wirePrefix,
		HasWirePrefix: hasPrefix,
	}, nil
}

// CanJumpTo reports whether JumpTo(index) would succeed.
func (h *ParseHistory) CanJumpTo(index int) bool {
	if h == nil || !h.realtime {
		return false
	}
	if index < 0 || index >= len(h.nodes) {
		return false
	}
	return index > h.liveCursor
}

func (h *ParseHistory) requireSnapshot(api string) error {
	if h == nil || !h.snapshot {
		return fmt.Errorf("ParseHistory.%s requires snapshot mode", api)
	}
	return nil
}

func (h *ParseHistory) normalizeIndex(index int) (int, error) {
	if index < 0 || index >= len(h.nodes) {
		return 0, &RangeError{
			Message: fmt.Sprintf("history index out of range: %d (length %d)", index, len(h.nodes)),
		}
	}
	return index, nil
}

func (h *ParseHistory) nodeAt(index int) (*HistoryNode, error) {
	i, err := h.normalizeIndex(index)
	if err != nil {
		return nil, err
	}
	return &h.nodes[i], nil
}

func (h *ParseHistory) invalidateRangeIfNeeded() {
	if h.rangeView != nil && h.rangeView.to >= len(h.nodes) {
		h.rangeView = nil
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// cloneHistoryNode deep-clones trees in a history node.
func cloneHistoryNode(n HistoryNode) HistoryNode {
	return HistoryNode{
		Index:       n.Index,
		Kind:        n.Kind,
		BufferStart: n.BufferStart,
		BufferEnd:   n.BufferEnd,
		Wire:        n.Wire,
		HasWire:     n.HasWire,
		Before:      xaiop.CloneJSON(n.Before),
		After:       xaiop.CloneJSON(n.After),
		Diff:        xaiop.CloneJSON(n.Diff),
	}
}

// ExportTimeRoot returns cloned history nodes (snapshot mode).
func (h *ParseHistory) ExportTimeRoot() ([]HistoryNode, error) {
	if err := h.requireSnapshot("exportTimeRoot"); err != nil {
		return nil, err
	}
	out := make([]HistoryNode, len(h.nodes))
	for i, n := range h.nodes {
		out[i] = cloneHistoryNode(n)
	}
	return out, nil
}
